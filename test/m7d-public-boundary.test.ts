import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import { generatePublicToken, SESSION_COOKIE_NAME, hashPassword, createSession } from "../src/lib/auth";
import { GET as publicSurveyGET } from "../src/app/api/public/surveys/[publicToken]/route";
import { POST as publicSurveySubmitPOST } from "../src/app/api/public/surveys/[publicToken]/submit/route";
import { POST as publicSurveyDraftPOST } from "../src/app/api/public/surveys/[publicToken]/draft/route";
import { GET as publicSurveyDraftGET } from "../src/app/api/public/surveys/[publicToken]/draft/[responseId]/route";
import { GET as managementSurveyGET, PATCH as managementSurveyPATCH } from "../src/app/api/surveys/[id]/route";
import { NextRequest } from "next/server";
import { SurveyStatus } from "@prisma/client";

describe("Phase M7-D: Public Survey Boundary & Public Token 測試", () => {
  const orgId = "m7d-org-main";
  let publishedSurvey: any;
  let draftSurvey: any;
  let closedSurvey: any;

  beforeEach(async () => {
    // 1. 清理資料
    await db.answerChoice.deleteMany({
      where: { answer: { response: { survey: { organizationId: orgId } } } },
    });
    await db.answer.deleteMany({
      where: { response: { survey: { organizationId: orgId } } },
    });
    await db.response.deleteMany({
      where: { survey: { organizationId: orgId } },
    });
    await db.question.deleteMany({
      where: { survey: { organizationId: orgId } },
    });
    await db.survey.deleteMany({
      where: { organizationId: orgId },
    });
    await db.organization.deleteMany({
      where: { id: orgId },
    });

    // 2. 建立組織
    await db.organization.create({
      data: { id: orgId, name: "Public Test Organization", slug: "public-test-org" },
    });

    // 3. 建立三種狀態的問卷
    publishedSurvey = await db.survey.create({
      data: {
        title: "公開滿意度調查問卷",
        description: "這是一份公開問卷說明",
        organizationId: orgId,
        status: SurveyStatus.PUBLISHED,
        publicToken: generatePublicToken(),
        questions: {
          create: [
            {
              code: "Q1",
              title: "您對產品的滿意度？",
              questionType: "single_choice",
              orderNum: 1,
              required: true,
              scoringEnabled: true, // 內部計分設定（敏感欄位）
              reverseScore: false,  // 內部計分設定（敏感欄位）
              choices: {
                create: [
                  { label: "非常滿意", value: "opt_5", scoreEnabled: true, score: 5, orderNum: 1 },
                  { label: "普通", value: "opt_3", scoreEnabled: true, score: 3, orderNum: 2 },
                  { label: "非常不滿意", value: "opt_1", scoreEnabled: true, score: 1, orderNum: 3 },
                ],
              },
            },
            {
              code: "Q2",
              title: "請提供您的建議",
              questionType: "text",
              orderNum: 2,
              required: false,
              scoringEnabled: false,
            },
          ],
        },
      },
    });

    draftSurvey = await db.survey.create({
      data: {
        title: "草稿問卷 (未發布)",
        organizationId: orgId,
        status: SurveyStatus.DRAFT,
        publicToken: generatePublicToken(),
        questions: {
          create: {
            code: "QD1",
            title: "草稿問題",
            questionType: "text",
            orderNum: 1,
          },
        },
      },
    });

    closedSurvey = await db.survey.create({
      data: {
        title: "已結束問卷",
        organizationId: orgId,
        status: SurveyStatus.CLOSED,
        publicToken: generatePublicToken(),
      },
    });
  });

  // =========================================================================
  // 1. Public Token Verification & Status Isolation
  // =========================================================================
  describe("1. Public Token 驗證與問卷狀態邊界", () => {
    it("有效的 publicToken 且為 PUBLISHED 狀態應回傳 200 OK 與問卷結構", async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/surveys/${publishedSurvey.publicToken}`);
      const res = await publicSurveyGET(req, { params: { publicToken: publishedSurvey.publicToken } });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.survey.title).toBe("公開滿意度調查問卷");
      expect(data.survey.publicToken).toBe(publishedSurvey.publicToken);
      expect(data.survey.questions.length).toBe(2);
    });

    it("無效的 publicToken 應回傳 404 Not Found", async () => {
      const req = new NextRequest("http://localhost:3000/api/public/surveys/non-existent-token-xyz");
      const res = await publicSurveyGET(req, { params: { publicToken: "non-existent-token-xyz" } });
      expect(res.status).toBe(404);
    });

    it("嘗試使用內部 survey.id 作為 publicToken 存取公開端點應回傳 404 (禁止內部 ID 外洩暴露)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/surveys/${publishedSurvey.id}`);
      const res = await publicSurveyGET(req, { params: { publicToken: publishedSurvey.id } });
      expect(res.status).toBe(404);
    });

    it("DRAFT 草稿問卷不得透過 publicToken 公開讀取 (回傳 404)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/surveys/${draftSurvey.publicToken}`);
      const res = await publicSurveyGET(req, { params: { publicToken: draftSurvey.publicToken } });
      expect(res.status).toBe(404);
    });

    it("CLOSED 已結束問卷不得透過 publicToken 公開讀取 (回傳 404)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/surveys/${closedSurvey.publicToken}`);
      const res = await publicSurveyGET(req, { params: { publicToken: closedSurvey.publicToken } });
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 2. Sensitive Field Desensitization (敏感欄位脫敏)
  // =========================================================================
  describe("2. 公開問卷資料脫敏檢查 (Desensitization)", () => {
    it("公開回傳的題目與選項中，不得包含任何計分分數與敏感欄位", async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/surveys/${publishedSurvey.publicToken}`);
      const res = await publicSurveyGET(req, { params: { publicToken: publishedSurvey.publicToken } });
      const data = await res.json();

      const q1 = data.survey.questions[0];

      // 1. 題目層級不可洩漏計分開關與反向計分
      expect(q1.scoringEnabled).toBeUndefined();
      expect(q1.reverseScore).toBeUndefined();

      // 2. 選項層級不可洩漏選項配分與 scoreEnabled
      for (const choice of q1.choices) {
        expect(choice.score).toBeUndefined();
        expect(choice.scoreEnabled).toBeUndefined();
        // 基本呈現欄位仍應完整
        expect(choice.label).toBeDefined();
        expect(choice.value).toBeDefined();
      }

      // 3. 問卷不可洩漏 organizationId 與內部 createdById
      expect(data.survey.organizationId).toBeUndefined();
      expect(data.survey.createdById).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. Anonymous Public Submission & Server-Side Scoring
  // =========================================================================
  describe("3. 匿名公開填答與伺服器端安全算分", () => {
    it("匿名大眾 (無任何 Session Cookie) 可成功提交公開問卷，並在伺服器端正確計分", async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/surveys/${publishedSurvey.publicToken}/submit`, {
        method: "POST",
        body: JSON.stringify({
          answers: [
            { questionCode: "Q1", rawValue: "opt_5" },
            { questionCode: "Q2", rawValue: "服務很棒！" },
          ],
        }),
      });

      const res = await publicSurveySubmitPOST(req, {
        params: { publicToken: publishedSurvey.publicToken },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.responseId).toBeDefined();

      // 驗證 DB 內部安全紀錄了得分（前端不知情）
      const savedResponse = await db.response.findUnique({
        where: { id: data.responseId },
      });
      expect(savedResponse?.totalScore).toBe(5);
      expect(savedResponse?.status).toBe("COMPLETED");
    });

    it("匿名大眾可儲存與重讀草稿 (Draft Save & Resume)", async () => {
      // 1. 儲存草稿
      const reqDraft = new NextRequest(`http://localhost:3000/api/public/surveys/${publishedSurvey.publicToken}/draft`, {
        method: "POST",
        body: JSON.stringify({
          answers: [{ questionCode: "Q1", rawValue: "opt_3" }],
        }),
      });
      const resDraft = await publicSurveyDraftPOST(reqDraft, {
        params: { publicToken: publishedSurvey.publicToken },
      });
      expect(resDraft.status).toBe(200);
      const draftData = await resDraft.json();
      const draftId = draftData.responseId;

      // 2. 重新讀取草稿
      const reqGetDraft = new NextRequest(
        `http://localhost:3000/api/public/surveys/${publishedSurvey.publicToken}/draft/${draftId}`
      );
      const resGetDraft = await publicSurveyDraftGET(reqGetDraft, {
        params: { publicToken: publishedSurvey.publicToken, responseId: draftId },
      });
      expect(resGetDraft.status).toBe(200);
      const getDraftData = await resGetDraft.json();
      expect(getDraftData.answers[0].rawValue).toBe("opt_3");
    });
  });

  // =========================================================================
  // 4. Token Security & Management Isolation
  // =========================================================================
  describe("4. Token 安全性與管理端邊界隔離", () => {
    it("generatePublicToken 產生高熵、URL-safe 且長度大於 20 字元之 Token", () => {
      const token1 = generatePublicToken();
      const token2 = generatePublicToken();

      expect(typeof token1).toBe("string");
      expect(token1.length).toBeGreaterThanOrEqual(24);
      expect(token1).not.toBe(token2);
      // 驗證為 URL-safe (不含 +, /, =)
      expect(token1).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("未登入者無法存取管理端 API (GET /api/surveys/:id?mode=management 得到 401)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${publishedSurvey.id}?mode=management`);
      const res = await managementSurveyGET(req, { params: { id: publishedSurvey.id } });
      expect(res.status).toBe(401);
    });

    it("未登入者無法修改問卷 (PATCH /api/surveys/:id 得到 401)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${publishedSurvey.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "駭客竄改" }),
      });
      const res = await managementSurveyPATCH(req, { params: { id: publishedSurvey.id } });
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 5. Cross-Token & Anti-Tampering Security Checks (安全防竄改與跨問卷防護)
  // =========================================================================
  describe("5. 跨 Token 草稿防護與參數防竄改測試", () => {
    let surveyAlt: any;
    let draftMain: any;
    let draftAlt: any;

    beforeEach(async () => {
      // 建立第二個公開問卷
      surveyAlt = await db.survey.create({
        data: {
          title: "第二份公開問卷",
          organizationId: orgId,
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
          questions: {
            create: {
              code: "QA1",
              title: "問題A",
              questionType: "text",
              orderNum: 1,
            },
          },
        },
      });

      // 在 Main Survey 建立草稿
      draftMain = await db.response.create({
        data: {
          surveyId: publishedSurvey.id,
          status: "IN_PROGRESS",
          answers: {
            create: {
              questionId: (await db.question.findFirst({ where: { surveyId: publishedSurvey.id } }))!.id,
              rawValue: JSON.stringify("main_draft_val"),
            },
          },
        },
      });

      // 在 Alt Survey 建立草稿
      draftAlt = await db.response.create({
        data: {
          surveyId: surveyAlt.id,
          status: "IN_PROGRESS",
          answers: {
            create: {
              questionId: (await db.question.findFirst({ where: { surveyId: surveyAlt.id } }))!.id,
              rawValue: JSON.stringify("alt_draft_val"),
            },
          },
        },
      });
    });

    it("13 & 14. 跨問卷草稿存取拒絕 (Public Token A + Response B 應回傳 404 / 400)", async () => {
      // 嘗試拿 Survey Alt 的 Token 去讀取 Draft Main
      const reqCross = new NextRequest(
        `http://localhost:3000/api/public/surveys/${surveyAlt.publicToken}/draft/${draftMain.id}`
      );
      const resCross = await publicSurveyDraftGET(reqCross, {
        params: { publicToken: surveyAlt.publicToken, responseId: draftMain.id },
      });
      expect(resCross.status).toBe(404);

      // 反向嘗試拿 Survey Main 的 Token 去讀取 Draft Alt
      const reqCrossRev = new NextRequest(
        `http://localhost:3000/api/public/surveys/${publishedSurvey.publicToken}/draft/${draftAlt.id}`
      );
      const resCrossRev = await publicSurveyDraftGET(reqCrossRev, {
        params: { publicToken: publishedSurvey.publicToken, responseId: draftAlt.id },
      });
      expect(resCrossRev.status).toBe(404);
    });

    it("15 & 16. Client 端傳入偽造之 surveyId 與 organizationId 均無法污染真實問卷與組織歸屬", async () => {
      const reqTamper = new NextRequest(
        `http://localhost:3000/api/public/surveys/${publishedSurvey.publicToken}/submit`,
        {
          method: "POST",
          body: JSON.stringify({
            surveyId: "hacked-survey-id",
            organizationId: "hacked-org-id",
            answers: [{ questionCode: "Q1", rawValue: "opt_5" }],
          }),
        }
      );

      const resTamper = await publicSurveySubmitPOST(reqTamper, {
        params: { publicToken: publishedSurvey.publicToken },
      });
      expect(resTamper.status).toBe(200);
      const data = await resTamper.json();

      const created = await db.response.findUnique({
        where: { id: data.responseId },
        include: { survey: true },
      });

      // 驗證紀錄依然嚴格歸屬於 publishedSurvey.id 與原 orgId
      expect(created?.surveyId).toBe(publishedSurvey.id);
      expect(created?.survey.organizationId).toBe(orgId);
    });

    it("17. Client 端試圖直接注入 score: 999999 必須被完全忽略，分數由伺服器端唯一計算", async () => {
      const reqInjectScore = new NextRequest(
        `http://localhost:3000/api/public/surveys/${publishedSurvey.publicToken}/submit`,
        {
          method: "POST",
          body: JSON.stringify({
            score: 999999,
            totalScore: 999999,
            answers: [{ questionCode: "Q1", rawValue: "opt_3" }], // 依題庫 opt_3 配分為 3 分
          }),
        }
      );

      const res = await publicSurveySubmitPOST(reqInjectScore, {
        params: { publicToken: publishedSurvey.publicToken },
      });
      expect(res.status).toBe(200);
      const data = await res.json();

      const saved = await db.response.findUnique({
        where: { id: data.responseId },
      });

      // 驗證伺服器端依真實配分計算為 3 分，注入的 999999 徹底失效
      expect(saved?.totalScore).toBe(3);
    });
  });
});

