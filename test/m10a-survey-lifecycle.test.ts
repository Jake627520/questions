import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  hashPassword,
  createSession,
  generatePublicToken,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { NextRequest } from "next/server";
import { Role, SurveyStatus, QuestionType } from "@prisma/client";
import {
  validateStatusTransition,
  checkSurveyCollectionEligibility,
  validateSurveyPrePublishChecklist,
} from "../src/lib/survey-lifecycle";
import { POST as publishPOST } from "../src/app/api/surveys/[id]/publish/route";
import { POST as closePOST } from "../src/app/api/surveys/[id]/close/route";
import { POST as archivePOST } from "../src/app/api/surveys/[id]/archive/route";
import { POST as restorePOST } from "../src/app/api/surveys/[id]/restore/route";
import { POST as duplicatePOST } from "../src/app/api/surveys/[id]/duplicate/route";
import { POST as cloneVersionPOST } from "../src/app/api/surveys/[id]/clone-version/route";
import { PATCH as surveyPATCH, DELETE as surveyDELETE } from "../src/app/api/surveys/[id]/route";
import { GET as publicGET } from "../src/app/api/public/surveys/[publicToken]/route";
import { POST as publicSubmitPOST } from "../src/app/api/public/surveys/[publicToken]/submit/route";
import { GET as crosstabGET } from "../src/app/api/surveys/[id]/analytics/crosstab/route";

describe("Phase M10-A.1: Survey Lifecycle State Machine & Version Boundary Suite", () => {
  let orgA: any;
  let orgB: any;

  let ownerA: any;
  let editorA: any;
  let viewerA: any;
  let userB: any;

  let tokenOwnerA: string;
  let tokenEditorA: string;
  let tokenViewerA: string;
  let tokenUserB: string;

  const makeAuthReq = (
    url: string,
    token: string,
    options: { method?: string; body?: any } = {}
  ) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    };

    return new NextRequest(url, {
      method: options.method || "POST",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  };

  const makePublicReq = (url: string, body?: any) => {
    return new NextRequest(url, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  beforeEach(async () => {
    // 清理測試隔離環境
    await db.answerChoice.deleteMany({
      where: { answer: { response: { survey: { organization: { slug: { startsWith: "m10a-" } } } } } },
    });
    await db.answer.deleteMany({
      where: { response: { survey: { organization: { slug: { startsWith: "m10a-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m10a-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m10a-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m10a-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m10a-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m10a-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m10a-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m10a-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m10a-" } },
    });

    const defaultPwd = await hashPassword("M10APassword123!");

    orgA = await db.organization.create({
      data: { name: "Org Alpha Lifecycle", slug: "m10a-org-alpha" },
    });
    orgB = await db.organization.create({
      data: { name: "Org Beta Other", slug: "m10a-org-beta" },
    });

    ownerA = await db.user.create({
      data: { email: "m10a-owner@alpha.com", name: "Owner Alpha", passwordHash: defaultPwd },
    });
    editorA = await db.user.create({
      data: { email: "m10a-editor@alpha.com", name: "Editor Alpha", passwordHash: defaultPwd },
    });
    viewerA = await db.user.create({
      data: { email: "m10a-viewer@alpha.com", name: "Viewer Alpha", passwordHash: defaultPwd },
    });
    userB = await db.user.create({
      data: { email: "m10a-user@beta.com", name: "User Beta", passwordHash: defaultPwd },
    });

    await db.membership.createMany({
      data: [
        { userId: ownerA.id, organizationId: orgA.id, role: Role.OWNER },
        { userId: editorA.id, organizationId: orgA.id, role: Role.EDITOR },
        { userId: viewerA.id, organizationId: orgA.id, role: Role.VIEWER },
        { userId: userB.id, organizationId: orgB.id, role: Role.OWNER },
      ],
    });

    tokenOwnerA = (await createSession(ownerA.id)).token;
    tokenEditorA = (await createSession(editorA.id)).token;
    tokenViewerA = (await createSession(viewerA.id)).token;
    tokenUserB = (await createSession(userB.id)).token;
  });

  describe("1. Pure Domain State Machine & Pre-publish Checklist Tests", () => {
    it("DRAFT 狀態轉換規則：可轉 PUBLISHED (題目數>0) 與 ARCHIVED，禁止轉 CLOSED", () => {
      expect(validateStatusTransition(SurveyStatus.DRAFT, SurveyStatus.PUBLISHED, { questionCount: 1 }).valid).toBe(true);
      expect(validateStatusTransition(SurveyStatus.DRAFT, SurveyStatus.PUBLISHED, { questionCount: 0 }).valid).toBe(false);
      expect(validateStatusTransition(SurveyStatus.DRAFT, SurveyStatus.ARCHIVED).valid).toBe(true);
      expect(validateStatusTransition(SurveyStatus.DRAFT, SurveyStatus.CLOSED).valid).toBe(false);
    });

    it("PUBLISHED 狀態轉換規則：可轉 CLOSED 與 ARCHIVED，禁止直接逆向回 DRAFT", () => {
      expect(validateStatusTransition(SurveyStatus.PUBLISHED, SurveyStatus.CLOSED).valid).toBe(true);
      expect(validateStatusTransition(SurveyStatus.PUBLISHED, SurveyStatus.ARCHIVED).valid).toBe(true);
      expect(validateStatusTransition(SurveyStatus.PUBLISHED, SurveyStatus.DRAFT).valid).toBe(false);
    });

    it("CLOSED 狀態轉換規則：可轉 PUBLISHED (重啟) 與 ARCHIVED，禁止直接逆向回 DRAFT", () => {
      expect(validateStatusTransition(SurveyStatus.CLOSED, SurveyStatus.PUBLISHED).valid).toBe(true);
      expect(validateStatusTransition(SurveyStatus.CLOSED, SurveyStatus.ARCHIVED).valid).toBe(true);
      expect(validateStatusTransition(SurveyStatus.CLOSED, SurveyStatus.DRAFT).valid).toBe(false);
    });

    it("ARCHIVED 狀態轉換規則：可還原為 CLOSED 或 DRAFT，禁止直接發布", () => {
      expect(validateStatusTransition(SurveyStatus.ARCHIVED, SurveyStatus.CLOSED).valid).toBe(true);
      expect(validateStatusTransition(SurveyStatus.ARCHIVED, SurveyStatus.DRAFT).valid).toBe(true);
      expect(validateStatusTransition(SurveyStatus.ARCHIVED, SurveyStatus.PUBLISHED).valid).toBe(false);
    });

    it("Pre-publish Checklist: 題目標題、代碼重複性與選項存在性檢驗", () => {
      const invalid = validateSurveyPrePublishChecklist({
        title: "",
        questions: [
          { code: "Q1", title: "", questionType: "single_choice", choices: [] },
          { code: "Q1", title: "重複代碼", questionType: "text" },
        ],
      });
      expect(invalid.ready).toBe(false);
      expect(invalid.errors.length).toBeGreaterThanOrEqual(4);

      const valid = validateSurveyPrePublishChecklist({
        title: "有效問卷",
        questions: [
          {
            code: "Q1",
            title: "單選題",
            questionType: "single_choice",
            choices: [{ label: "A", value: "a" }],
          },
          { code: "Q2", title: "文字題", questionType: "text" },
        ],
      });
      expect(valid.ready).toBe(true);
      expect(valid.errors.length).toBe(0);
    });
  });

  describe("2. Collection Eligibility Guard (Scheduling & Quota Controls)", () => {
    it("未發布、已關閉或已歸檔問卷應判定為不可填答", () => {
      expect(checkSurveyCollectionEligibility({ status: SurveyStatus.DRAFT }).eligible).toBe(false);
      expect(checkSurveyCollectionEligibility({ status: SurveyStatus.CLOSED }).eligible).toBe(false);
      expect(checkSurveyCollectionEligibility({ status: SurveyStatus.ARCHIVED }).eligible).toBe(false);
    });

    it("時間排程守衛：startDate 未到達或 endDate 已逾期應阻絕", () => {
      const now = new Date("2026-08-24T12:00:00Z");
      const futureStart = new Date("2026-08-25T00:00:00Z");
      const pastEnd = new Date("2026-08-23T00:00:00Z");

      const notStarted = checkSurveyCollectionEligibility(
        { status: SurveyStatus.PUBLISHED, startDate: futureStart },
        0,
        now
      );
      expect(notStarted.eligible).toBe(false);
      expect(notStarted.code).toBe("NOT_STARTED");

      const expired = checkSurveyCollectionEligibility(
        { status: SurveyStatus.PUBLISHED, endDate: pastEnd },
        0,
        now
      );
      expect(expired.eligible).toBe(false);
      expect(expired.code).toBe("EXPIRED");
    });

    it("作答配額守衛：當目前回覆數達到 responseQuota 時應阻絕", () => {
      const quotaSurvey = { status: SurveyStatus.PUBLISHED, responseQuota: 50 };
      expect(checkSurveyCollectionEligibility(quotaSurvey, 49).eligible).toBe(true);
      const quotaReached = checkSurveyCollectionEligibility(quotaSurvey, 50);
      expect(quotaReached.eligible).toBe(false);
      expect(quotaReached.code).toBe("QUOTA_EXCEEDED");
    });
  });

  describe("3. Survey Lifecycle API Endpoints (Publish, Close, Archive, Restore, Duplicate)", () => {
    let surveyA: any;

    beforeEach(async () => {
      surveyA = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "員工滿意度調查",
          description: "年度問卷",
          status: SurveyStatus.DRAFT,
          createdById: ownerA.id,
          questions: {
            create: [
              {
                code: "Q_SATISFACTION",
                title: "整體滿意度",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: {
                  create: [
                    { label: "滿意", value: "sat", orderNum: 1 },
                    { label: "普通", value: "neu", orderNum: 2 },
                  ],
                },
              },
            ],
          },
        },
      });
    });

    it("POST /publish: 非組織成員與 Viewer 403，Editor 成功發布並生成 publicToken", async () => {
      const reqViewer = makeAuthReq(`http://localhost/api/surveys/${surveyA.id}/publish`, tokenViewerA);
      const resViewer = await publishPOST(reqViewer, { params: { id: surveyA.id } });
      expect(resViewer.status).toBe(403);

      const reqEditor = makeAuthReq(`http://localhost/api/surveys/${surveyA.id}/publish`, tokenEditorA);
      const resEditor = await publishPOST(reqEditor, { params: { id: surveyA.id } });
      expect(resEditor.status).toBe(200);

      const json = await resEditor.json();
      expect(json.success).toBe(true);
      expect(json.survey.status).toBe(SurveyStatus.PUBLISHED);
      expect(json.survey.publicToken).toBeDefined();
    });

    it("POST /close: 成功關閉發布中問卷", async () => {
      await db.survey.update({
        where: { id: surveyA.id },
        data: { status: SurveyStatus.PUBLISHED, publicToken: generatePublicToken() },
      });

      const req = makeAuthReq(`http://localhost/api/surveys/${surveyA.id}/close`, tokenEditorA);
      const res = await closePOST(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.survey.status).toBe(SurveyStatus.CLOSED);
    });

    it("POST /archive & POST /restore: 完整歸檔與還原閉環", async () => {
      await db.survey.update({
        where: { id: surveyA.id },
        data: { status: SurveyStatus.CLOSED },
      });

      // Archive
      const reqArchive = makeAuthReq(`http://localhost/api/surveys/${surveyA.id}/archive`, tokenEditorA);
      const resArchive = await archivePOST(reqArchive, { params: { id: surveyA.id } });
      expect(resArchive.status).toBe(200);
      expect((await resArchive.json()).survey.status).toBe(SurveyStatus.ARCHIVED);

      // Restore
      const reqRestore = makeAuthReq(`http://localhost/api/surveys/${surveyA.id}/restore`, tokenEditorA);
      const resRestore = await restorePOST(reqRestore, { params: { id: surveyA.id } });
      expect(resRestore.status).toBe(200);
      expect((await resRestore.json()).survey.status).toBe(SurveyStatus.DRAFT);
    });

    it("POST /duplicate: 複製為全新獨立問卷 (v1, parentSurveyId = null)", async () => {
      const req = makeAuthReq(`http://localhost/api/surveys/${surveyA.id}/duplicate`, tokenEditorA);
      const res = await duplicatePOST(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.version).toBe(1);

      const duplicated = await db.survey.findUnique({
        where: { id: json.surveyId },
        include: { questions: { include: { choices: true } } },
      });
      expect(duplicated?.parentSurveyId).toBeNull();
      expect(duplicated?.title).toContain("複製");
      expect(duplicated?.questions.length).toBe(1);
      expect(duplicated?.questions[0].choices.length).toBe(2);
    });

    it("DELETE 受保護守衛：已有 Responses 或 PUBLISHED 狀態禁止物理刪除", async () => {
      await db.survey.update({
        where: { id: surveyA.id },
        data: { status: SurveyStatus.PUBLISHED, publicToken: generatePublicToken() },
      });

      const reqDeletePublished = makeAuthReq(`http://localhost/api/surveys/${surveyA.id}`, tokenOwnerA, {
        method: "DELETE",
      });
      const resDeletePublished = await surveyDELETE(reqDeletePublished, { params: { id: surveyA.id } });
      expect(resDeletePublished.status).toBe(400);

      // 建立 response
      await db.response.create({
        data: { surveyId: surveyA.id, status: "COMPLETED" },
      });
      await db.survey.update({
        where: { id: surveyA.id },
        data: { status: SurveyStatus.CLOSED },
      });

      const reqDeleteWithResponses = makeAuthReq(`http://localhost/api/surveys/${surveyA.id}`, tokenOwnerA, {
        method: "DELETE",
      });
      const resDeleteWithResponses = await surveyDELETE(reqDeleteWithResponses, { params: { id: surveyA.id } });
      expect(resDeleteWithResponses.status).toBe(400);
    });
  });

  describe("4. End-to-End Public Access & Submit Enforcement", () => {
    it("問卷配額已滿時，公開端點與提交端點均回傳 403 QUOTA_EXCEEDED", async () => {
      const pToken = generatePublicToken();
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "限量配額問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: pToken,
          responseQuota: 1,
          questions: {
            create: [
              {
                code: "Q1",
                title: "問題一",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: {
                  create: [{ label: "選項 A", value: "a", orderNum: 1 }],
                },
              },
            ],
          },
        },
      });

      // 建立第 1 筆作答 -> 配額滿
      await db.response.create({
        data: { surveyId: survey.id, status: "COMPLETED" },
      });

      const getReq = makePublicReq(`http://localhost/api/public/surveys/${pToken}`);
      const getRes = await publicGET(getReq, { params: { publicToken: pToken } });
      expect(getRes.status).toBe(403);
      expect((await getRes.json()).error).toBe("QUOTA_EXCEEDED");

      const submitReq = makePublicReq(`http://localhost/api/public/surveys/${pToken}/submit`, {
        answers: [{ questionCode: "Q1", value: "a" }],
      });
      const submitRes = await publicSubmitPOST(submitReq, { params: { publicToken: pToken } });
      expect(submitRes.status).toBe(403);
      expect((await submitRes.json()).error).toBe("QUOTA_EXCEEDED");
    });
  });

  describe("5. Version Boundary & Analytics v1.0 Zero-Drift Protection", () => {
    it("v1 與衍生之 v2 在 Analytics Cross-tab 查詢中完全資料隔離", async () => {
      const pTokenV1 = generatePublicToken();
      const surveyV1 = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "員工調研 v1",
          status: SurveyStatus.PUBLISHED,
          publicToken: pTokenV1,
          version: 1,
          questions: {
            create: [
              {
                code: "Q_DEPT",
                title: "部門",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: {
                  create: [
                    { label: "RD", value: "rd", orderNum: 1 },
                    { label: "Sales", value: "sales", orderNum: 2 },
                  ],
                },
              },
              {
                code: "Q_SAT",
                title: "滿意度",
                questionType: QuestionType.single_choice,
                orderNum: 2,
                choices: {
                  create: [
                    { label: "High", value: "high", orderNum: 1 },
                    { label: "Low", value: "low", orderNum: 2 },
                  ],
                },
              },
            ],
          },
        },
        include: { questions: { include: { choices: true } } },
      });

      const qDeptV1 = surveyV1.questions.find((q) => q.code === "Q_DEPT")!;
      const qSatV1 = surveyV1.questions.find((q) => q.code === "Q_SAT")!;

      // 為 v1 建立 10 筆 responses (RD=High: 6, Sales=Low: 4)
      for (let i = 0; i < 6; i++) {
        const resp = await db.response.create({
          data: { surveyId: surveyV1.id, version: 1, status: "COMPLETED" },
        });
        await db.answer.createMany({
          data: [
            { responseId: resp.id, questionId: qDeptV1.id, rawValue: "rd" },
            { responseId: resp.id, questionId: qSatV1.id, rawValue: "high" },
          ],
        });
      }
      for (let i = 0; i < 4; i++) {
        const resp = await db.response.create({
          data: { surveyId: surveyV1.id, version: 1, status: "COMPLETED" },
        });
        await db.answer.createMany({
          data: [
            { responseId: resp.id, questionId: qDeptV1.id, rawValue: "sales" },
            { responseId: resp.id, questionId: qSatV1.id, rawValue: "low" },
          ],
        });
      }

      // Clone v2
      const reqClone = makeAuthReq(`http://localhost/api/surveys/${surveyV1.id}/clone-version`, tokenEditorA);
      const resClone = await cloneVersionPOST(reqClone, { params: { id: surveyV1.id } });
      expect(resClone.status).toBe(200);
      const cloneJson = await resClone.json();
      const surveyV2Id = cloneJson.surveyId;
      expect(cloneJson.version).toBe(2);

      // 查詢 v1 Analytics Cross-tab -> 回傳 10 筆樣本統計
      const reqCrosstabV1 = makeAuthReq(
        `http://localhost/api/surveys/${surveyV1.id}/analytics/crosstab?rowQuestionId=${qDeptV1.id}&colQuestionId=${qSatV1.id}`,
        tokenEditorA,
        { method: "GET" }
      );
      const resCrosstabV1 = await crosstabGET(reqCrosstabV1, { params: { id: surveyV1.id } });
      expect(resCrosstabV1.status).toBe(200);
      const jsonV1 = await resCrosstabV1.json();
      expect(jsonV1.result.grandTotal).toBe(10);
      expect(jsonV1.result.totalResponses).toBe(10);

      // 查詢 v2 Analytics Cross-tab -> 回傳 0 筆樣本 (嚴格隔離)
      const surveyV2 = await db.survey.findUnique({
        where: { id: surveyV2Id },
        include: { questions: true },
      });
      const qDeptV2 = surveyV2!.questions.find((q) => q.code === "Q_DEPT")!;
      const qSatV2 = surveyV2!.questions.find((q) => q.code === "Q_SAT")!;

      const reqCrosstabV2 = makeAuthReq(
        `http://localhost/api/surveys/${surveyV2Id}/analytics/crosstab?rowQuestionId=${qDeptV2.id}&colQuestionId=${qSatV2.id}`,
        tokenEditorA,
        { method: "GET" }
      );
      const resCrosstabV2 = await crosstabGET(reqCrosstabV2, { params: { id: surveyV2Id } });
      expect(resCrosstabV2.status).toBe(200);
      const jsonV2 = await resCrosstabV2.json();
      expect(jsonV2.result.grandTotal).toBe(0);
      expect(jsonV2.result.totalResponses).toBe(0);
    });
  });
});
