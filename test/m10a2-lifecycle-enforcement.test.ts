import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  hashPassword,
  createSession,
  generatePublicToken,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { NextRequest } from "next/server";
import { Role, SurveyStatus, QuestionType, ResponseStatus } from "@prisma/client";
import {
  validateStatusTransition,
  checkSurveyCollectionEligibility,
  checkFieldImmutability,
  IMMUTABLE_FIELDS_AFTER_PUBLISH,
} from "../src/lib/survey-lifecycle";
import { POST as publishPOST } from "../src/app/api/surveys/[id]/publish/route";
import { POST as closePOST } from "../src/app/api/surveys/[id]/close/route";
import { POST as archivePOST } from "../src/app/api/surveys/[id]/archive/route";
import { POST as restorePOST } from "../src/app/api/surveys/[id]/restore/route";
import { POST as duplicatePOST } from "../src/app/api/surveys/[id]/duplicate/route";
import { PATCH as surveyPATCH, DELETE as surveyDELETE, GET as surveyGET } from "../src/app/api/surveys/[id]/route";
import { GET as publicGET } from "../src/app/api/public/surveys/[publicToken]/route";
import { POST as publicSubmitPOST } from "../src/app/api/public/surveys/[publicToken]/submit/route";

describe("Phase M10-A.2: Survey Lifecycle Enforcement & Concurrency Hardening Suite", () => {
  let orgA: any;
  let orgB: any;

  let ownerA: any;
  let adminA: any;
  let editorA: any;
  let viewerA: any;
  let userB: any;

  let tokenOwnerA: string;
  let tokenAdminA: string;
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
    await db.answerChoice.deleteMany({
      where: { answer: { response: { survey: { organization: { slug: { startsWith: "m10a2-" } } } } } },
    });
    await db.answer.deleteMany({
      where: { response: { survey: { organization: { slug: { startsWith: "m10a2-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m10a2-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m10a2-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m10a2-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m10a2-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m10a2-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m10a2-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m10a2-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m10a2-" } },
    });

    const defaultPwd = await hashPassword("M10A2Password123!");

    orgA = await db.organization.create({
      data: { name: "Org Alpha Lifecycle Hardened", slug: "m10a2-org-alpha" },
    });
    orgB = await db.organization.create({
      data: { name: "Org Beta Other", slug: "m10a2-org-beta" },
    });

    ownerA = await db.user.create({
      data: { email: "m10a2-owner@alpha.com", name: "Owner Alpha", passwordHash: defaultPwd },
    });
    adminA = await db.user.create({
      data: { email: "m10a2-admin@alpha.com", name: "Admin Alpha", passwordHash: defaultPwd },
    });
    editorA = await db.user.create({
      data: { email: "m10a2-editor@alpha.com", name: "Editor Alpha", passwordHash: defaultPwd },
    });
    viewerA = await db.user.create({
      data: { email: "m10a2-viewer@alpha.com", name: "Viewer Alpha", passwordHash: defaultPwd },
    });
    userB = await db.user.create({
      data: { email: "m10a2-user@beta.com", name: "User Beta", passwordHash: defaultPwd },
    });

    await db.membership.createMany({
      data: [
        { userId: ownerA.id, organizationId: orgA.id, role: Role.OWNER },
        { userId: adminA.id, organizationId: orgA.id, role: Role.ADMIN },
        { userId: editorA.id, organizationId: orgA.id, role: Role.EDITOR },
        { userId: viewerA.id, organizationId: orgA.id, role: Role.VIEWER },
        { userId: userB.id, organizationId: orgB.id, role: Role.OWNER },
      ],
    });

    tokenOwnerA = (await createSession(ownerA.id)).token;
    tokenAdminA = (await createSession(adminA.id)).token;
    tokenEditorA = (await createSession(editorA.id)).token;
    tokenViewerA = (await createSession(viewerA.id)).token;
    tokenUserB = (await createSession(userB.id)).token;
  });

  describe("Gate G1: Exhaustive 4x4 State Transition Matrix", () => {
    const allStatuses = [
      SurveyStatus.DRAFT,
      SurveyStatus.PUBLISHED,
      SurveyStatus.CLOSED,
      SurveyStatus.ARCHIVED,
    ];

    it("全窮舉 16 組狀態轉移規則驗證", () => {
      const validTransitions = new Set([
        "DRAFT->DRAFT",
        "DRAFT->PUBLISHED",
        "DRAFT->ARCHIVED",
        "PUBLISHED->PUBLISHED",
        "PUBLISHED->CLOSED",
        "PUBLISHED->ARCHIVED",
        "CLOSED->CLOSED",
        "CLOSED->PUBLISHED",
        "CLOSED->ARCHIVED",
        "ARCHIVED->ARCHIVED",
        "ARCHIVED->CLOSED",
        "ARCHIVED->DRAFT",
      ]);

      for (const from of allStatuses) {
        for (const to of allStatuses) {
          const key = `${from}->${to}`;
          const result = validateStatusTransition(from, to, { questionCount: 1 });
          if (validTransitions.has(key)) {
            expect(result.valid, `Expected transition ${key} to be valid`).toBe(true);
          } else {
            expect(result.valid, `Expected transition ${key} to be invalid`).toBe(false);
          }
        }
      }
    });

    it("DRAFT 轉 PUBLISHED 在 questionCount === 0 時必須拒絕", () => {
      expect(validateStatusTransition(SurveyStatus.DRAFT, SurveyStatus.PUBLISHED, { questionCount: 0 }).valid).toBe(false);
    });
  });

  describe("Gate G2: Published Lock Enforcement & Field Immutability", () => {
    it("非草稿問卷修改結構性欄位必須被 checkFieldImmutability 攔截", () => {
      for (const status of [SurveyStatus.PUBLISHED, SurveyStatus.CLOSED, SurveyStatus.ARCHIVED]) {
        for (const field of IMMUTABLE_FIELDS_AFTER_PUBLISH) {
          const res = checkFieldImmutability(status, { [field]: [] });
          expect(res.allowed).toBe(false);
          expect(res.violationField).toBe(field);
        }
      }
    });

    it("非草稿問卷允許修改非結構性管理欄位 (title, description, schedule, quota)", () => {
      const res = checkFieldImmutability(SurveyStatus.PUBLISHED, {
        title: "新標題",
        description: "新說明",
        startDate: new Date(),
        endDate: new Date(),
        responseQuota: 100,
      });
      expect(res.allowed).toBe(true);
    });

    it("PATCH API 端點在 PUBLISHED 狀態下提交題目修改時回傳 403 PUBLISHED_LOCK_VIOLATION", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "鎖定測試問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
        },
      });

      const req = makeAuthReq(`http://localhost/api/surveys/${survey.id}`, tokenEditorA, {
        method: "PATCH",
        body: { questions: [{ title: "試圖竄改題目" }] },
      });
      const res = await surveyPATCH(req, { params: { id: survey.id } });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("Published Lock");
      expect(json.code).toBe("PUBLISHED_LOCK_VIOLATION");
    });
  });

  describe("Gate G3: Schedule Enforcement (Millisecond-Level Precision)", () => {
    it("精確到毫秒的時間邊界檢查", () => {
      const baseTime = new Date("2026-08-25T12:00:00.000Z");
      const survey = {
        status: SurveyStatus.PUBLISHED,
        startDate: new Date("2026-08-25T12:00:00.000Z"),
        endDate: new Date("2026-08-25T18:00:00.000Z"),
      };

      // 1 ms 之前 -> NOT_STARTED
      const beforeStart = new Date(baseTime.getTime() - 1);
      expect(checkSurveyCollectionEligibility(survey, 0, beforeStart).eligible).toBe(false);
      expect(checkSurveyCollectionEligibility(survey, 0, beforeStart).code).toBe("NOT_STARTED");

      // 準時到達 -> 開放
      expect(checkSurveyCollectionEligibility(survey, 0, baseTime).eligible).toBe(true);

      // 截止 1 ms 之後 -> EXPIRED
      const afterEnd = new Date("2026-08-25T18:00:00.001Z");
      expect(checkSurveyCollectionEligibility(survey, 0, afterEnd).eligible).toBe(false);
      expect(checkSurveyCollectionEligibility(survey, 0, afterEnd).code).toBe("EXPIRED");
    });
  });

  describe("Gate G4: Response Quota Enforcement & Zero Overshoot", () => {
    it("配額已達時提交回傳 403 QUOTA_EXCEEDED", async () => {
      const pToken = generatePublicToken();
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "配額守衛測試",
          status: SurveyStatus.PUBLISHED,
          publicToken: pToken,
          responseQuota: 2,
          questions: {
            create: [
              {
                code: "Q1",
                title: "問題",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: { create: [{ label: "A", value: "a", orderNum: 1 }] },
              },
            ],
          },
        },
      });

      // 提交第 1 筆 -> 成功
      const req1 = makePublicReq(`http://localhost/api/public/surveys/${pToken}/submit`, {
        answers: [{ questionCode: "Q1", value: "a" }],
      });
      const res1 = await publicSubmitPOST(req1, { params: { publicToken: pToken } });
      expect(res1.status).toBe(200);

      // 提交第 2 筆 -> 成功 (達上限)
      const req2 = makePublicReq(`http://localhost/api/public/surveys/${pToken}/submit`, {
        answers: [{ questionCode: "Q1", value: "a" }],
      });
      const res2 = await publicSubmitPOST(req2, { params: { publicToken: pToken } });
      expect(res2.status).toBe(200);

      // 提交第 3 筆 -> 403 QUOTA_EXCEEDED
      const req3 = makePublicReq(`http://localhost/api/public/surveys/${pToken}/submit`, {
        answers: [{ questionCode: "Q1", value: "a" }],
      });
      const res3 = await publicSubmitPOST(req3, { params: { publicToken: pToken } });
      expect(res3.status).toBe(403);
      expect((await res3.json()).error).toBe("QUOTA_EXCEEDED");

      // 資料庫作答數嚴格為 2 筆
      const totalCount = await db.response.count({ where: { surveyId: survey.id } });
      expect(totalCount).toBe(2);
    });
  });

  describe("Gate G5: RBAC × Lifecycle Authorization Matrix", () => {
    let testSurvey: any;

    beforeEach(async () => {
      testSurvey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "RBAC 生命週期測試問卷",
          status: SurveyStatus.DRAFT,
          createdById: ownerA.id,
          questions: {
            create: [
              {
                code: "Q_SAT",
                title: "滿意度",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: { create: [{ label: "好", value: "good", orderNum: 1 }] },
              },
            ],
          },
        },
      });
    });

    it("OWNER / ADMIN / EDITOR 具備生命週期操作權限，VIEWER 與外部使用者均被 403 阻擋", async () => {
      // Viewer 嘗試發布 -> 403
      const reqViewer = makeAuthReq(`http://localhost/api/surveys/${testSurvey.id}/publish`, tokenViewerA);
      expect((await publishPOST(reqViewer, { params: { id: testSurvey.id } })).status).toBe(403);

      // 外部組織使用者嘗試發布 -> 403
      const reqOther = makeAuthReq(`http://localhost/api/surveys/${testSurvey.id}/publish`, tokenUserB);
      expect((await publishPOST(reqOther, { params: { id: testSurvey.id } })).status).toBe(403);

      // Editor 發布 -> 200
      const reqEditor = makeAuthReq(`http://localhost/api/surveys/${testSurvey.id}/publish`, tokenEditorA);
      expect((await publishPOST(reqEditor, { params: { id: testSurvey.id } })).status).toBe(200);

      // Admin 關閉 -> 200
      const reqAdmin = makeAuthReq(`http://localhost/api/surveys/${testSurvey.id}/close`, tokenAdminA);
      expect((await closePOST(reqAdmin, { params: { id: testSurvey.id } })).status).toBe(200);

      // Owner 歸檔 -> 200
      const reqOwner = makeAuthReq(`http://localhost/api/surveys/${testSurvey.id}/archive`, tokenOwnerA);
      expect((await archivePOST(reqOwner, { params: { id: testSurvey.id } })).status).toBe(200);
    });

    it("物理刪除權限：僅 OWNER 與 ADMIN 可刪除無作答草稿問卷，EDITOR 無權物理刪除 (403)", async () => {
      const draftSurvey = await db.survey.create({
        data: { organizationId: orgA.id, title: "草稿刪除測試", status: SurveyStatus.DRAFT },
      });

      const reqEditorDelete = makeAuthReq(`http://localhost/api/surveys/${draftSurvey.id}`, tokenEditorA, {
        method: "DELETE",
      });
      expect((await surveyDELETE(reqEditorDelete, { params: { id: draftSurvey.id } })).status).toBe(403);

      const reqAdminDelete = makeAuthReq(`http://localhost/api/surveys/${draftSurvey.id}`, tokenAdminA, {
        method: "DELETE",
      });
      expect((await surveyDELETE(reqAdminDelete, { params: { id: draftSurvey.id } })).status).toBe(200);
    });
  });

  describe("Gate G6: API Boundary & Fail-Closed Tests", () => {
    it("無效 ID 或無效 Public Token 應 Fail-Closed 回傳 400 或 404", async () => {
      const reqInvalidId = makeAuthReq("http://localhost/api/surveys/non-existent-id/publish", tokenOwnerA);
      expect((await publishPOST(reqInvalidId, { params: { id: "non-existent-id" } })).status).toBe(404);

      const reqEmptyToken = makePublicReq("http://localhost/api/public/surveys/%20/submit", { answers: [] });
      expect((await publicSubmitPOST(reqEmptyToken, { params: { publicToken: " " } })).status).toBe(400);
    });
  });

  describe("Gate G7: Concurrent Transition & Race Condition Attack Simulation", () => {
    it("50 筆並行請求競爭剩餘 1 個配額時，事務內計數嚴格保證僅 1 筆成功且零超額 (Race Protection)", async () => {
      const pToken = generatePublicToken();
      const quotaSurvey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "高並行配額競爭測試",
          status: SurveyStatus.PUBLISHED,
          publicToken: pToken,
          responseQuota: 5,
          questions: {
            create: [
              {
                code: "Q1",
                title: "競爭題目",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: { create: [{ label: "Opt", value: "opt", orderNum: 1 }] },
              },
            ],
          },
        },
      });

      // 先建立 4 筆 COMPLETED 作答 -> 剩餘 1 個名額
      for (let i = 0; i < 4; i++) {
        await db.response.create({
          data: { surveyId: quotaSurvey.id, status: ResponseStatus.COMPLETED },
        });
      }

      // 同時發送 50 個並行提交請求搶奪最後 1 個配額
      const requests = Array.from({ length: 50 }).map(() => {
        const req = makePublicReq(`http://localhost/api/public/surveys/${pToken}/submit`, {
          answers: [{ questionCode: "Q1", value: "opt" }],
        });
        return publicSubmitPOST(req, { params: { publicToken: pToken } });
      });

      const responses = await Promise.all(requests);
      const successCount = responses.filter((r) => r.status === 200).length;
      const quotaBlockedCount = responses.filter((r) => r.status === 403).length;

      expect(successCount).toBe(1);
      expect(quotaBlockedCount).toBe(49);

      // 檢查資料庫最終記錄數嚴格等於配額上限 5
      const finalCount = await db.response.count({
        where: { surveyId: quotaSurvey.id, status: ResponseStatus.COMPLETED },
      });
      expect(finalCount).toBe(5);
    });
  });

  describe("Gate G8: Golden Lifecycle Regression Journey", () => {
    it("問卷全生命週期 DRAFT -> PUBLISH -> CLOSE -> ARCHIVE -> RESTORE -> DUPLICATE 完整閉環", async () => {
      // 1. 建立 DRAFT
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "黃金生命週期調查",
          status: SurveyStatus.DRAFT,
          createdById: ownerA.id,
          questions: {
            create: [
              {
                code: "Q1",
                title: "題目一",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: { create: [{ label: "是", value: "y", orderNum: 1 }] },
              },
            ],
          },
        },
      });

      // 2. Publish
      const pubRes = await publishPOST(
        makeAuthReq(`http://localhost/api/surveys/${survey.id}/publish`, tokenEditorA),
        { params: { id: survey.id } }
      );
      expect(pubRes.status).toBe(200);
      const pubToken = (await pubRes.json()).survey.publicToken;
      expect(pubToken).toBeDefined();

      // 3. 填答 1 筆作答
      const submitRes = await publicSubmitPOST(
        makePublicReq(`http://localhost/api/public/surveys/${pubToken}/submit`, {
          answers: [{ questionCode: "Q1", value: "y" }],
        }),
        { params: { publicToken: pubToken } }
      );
      expect(submitRes.status).toBe(200);

      // 4. Close
      const closeRes = await closePOST(
        makeAuthReq(`http://localhost/api/surveys/${survey.id}/close`, tokenEditorA),
        { params: { id: survey.id } }
      );
      expect(closeRes.status).toBe(200);

      // 5. Archive
      const arcRes = await archivePOST(
        makeAuthReq(`http://localhost/api/surveys/${survey.id}/archive`, tokenEditorA),
        { params: { id: survey.id } }
      );
      expect(arcRes.status).toBe(200);

      // 6. Restore (已有作答 -> 還原至 CLOSED 保證安全)
      const resRes = await restorePOST(
        makeAuthReq(`http://localhost/api/surveys/${survey.id}/restore`, tokenEditorA),
        { params: { id: survey.id } }
      );
      expect(resRes.status).toBe(200);
      expect((await resRes.json()).survey.status).toBe(SurveyStatus.CLOSED);

      // 7. Duplicate
      const dupRes = await duplicatePOST(
        makeAuthReq(`http://localhost/api/surveys/${survey.id}/duplicate`, tokenEditorA),
        { params: { id: survey.id } }
      );
      expect(dupRes.status).toBe(200);
      const dupJson = await dupRes.json();
      expect(dupJson.version).toBe(1);
    });
  });
});
