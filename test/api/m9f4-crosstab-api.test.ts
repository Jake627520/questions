import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../src/lib/db";
import {
  hashPassword,
  createSession,
  generatePublicToken,
  SESSION_COOKIE_NAME,
} from "../../src/lib/auth";
import { NextRequest } from "next/server";
import { Role, SurveyStatus, ResponseStatus, QuestionType } from "@prisma/client";
import { GET as crosstabGET } from "../../src/app/api/surveys/[id]/analytics/crosstab/route";

describe("Phase M9-F.4: Cross-tab API & Tenant RBAC Boundary Suite", () => {
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

  let surveyA: any;
  let surveyB: any;

  let qGender: any; // Single Choice (Row)
  let qSatisfaction: any; // Single Choice (Col)
  let qMultiDept: any; // Multiple Choice
  let qRating: any;

  const makeAuthReq = (
    url: string,
    token?: string,
    options: { method?: string; body?: any; cookies?: Record<string, string> } = {}
  ) => {
    const cookieRecord: Record<string, string> = {
      ...(options.cookies || {}),
    };
    if (token) {
      cookieRecord[SESSION_COOKIE_NAME] = token;
    }

    const cookieHeader = Object.entries(cookieRecord)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    return new NextRequest(url, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  };

  beforeEach(async () => {
    // 1. 清理測試資料
    await db.answer.deleteMany({
      where: { response: { survey: { organization: { slug: { startsWith: "m9f4-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9f4-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m9f4-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9f4-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m9f4-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m9f4-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m9f4-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m9f4-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m9f4-" } },
    });

    const defaultPwd = await hashPassword("M9F4Password123!");

    // 2. 建立組織與成員
    orgA = await db.organization.create({
      data: { name: "Org A (Analytics)", slug: "m9f4-org-a" },
    });
    orgB = await db.organization.create({
      data: { name: "Org B (Isolated)", slug: "m9f4-org-b" },
    });

    ownerA = await db.user.create({
      data: { email: "m9f4-owner-a@example.com", name: "Owner A", passwordHash: defaultPwd },
    });
    adminA = await db.user.create({
      data: { email: "m9f4-admin-a@example.com", name: "Admin A", passwordHash: defaultPwd },
    });
    editorA = await db.user.create({
      data: { email: "m9f4-editor-a@example.com", name: "Editor A", passwordHash: defaultPwd },
    });
    viewerA = await db.user.create({
      data: { email: "m9f4-viewer-a@example.com", name: "Viewer A", passwordHash: defaultPwd },
    });
    userB = await db.user.create({
      data: { email: "m9f4-user-b@example.com", name: "User B", passwordHash: defaultPwd },
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

    const sOwnerA = await createSession(ownerA.id);
    const sAdminA = await createSession(adminA.id);
    const sEditorA = await createSession(editorA.id);
    const sViewerA = await createSession(viewerA.id);
    const sUserB = await createSession(userB.id);

    tokenOwnerA = sOwnerA.token;
    tokenAdminA = sAdminA.token;
    tokenEditorA = sEditorA.token;
    tokenViewerA = sViewerA.token;
    tokenUserB = sUserB.token;

    // 3. 建立測試問卷 A
    surveyA = await db.survey.create({
      data: {
        title: "2026 Customer Feedback & Demographics",
        description: "M9-F.4 API Integration Survey",
        status: SurveyStatus.PUBLISHED,
        version: 1,
        organizationId: orgA.id,
        createdById: ownerA.id,
        publicToken: generatePublicToken(),
        isAnonymous: true,
      },
    });

    // 題目 1: 性別 (Single Choice)
    qGender = await db.question.create({
      data: {
        surveyId: surveyA.id,
        code: "Q_GENDER",
        title: "生理性別",
        questionType: QuestionType.single_choice,
        orderNum: 1,
        choices: {
          create: [
            { orderNum: 1, label: "男性", value: "male" },
            { orderNum: 2, label: "女性", value: "female" },
          ],
        },
      },
      include: { choices: true },
    });

    // 題目 2: 滿意度 (Single Choice)
    qSatisfaction = await db.question.create({
      data: {
        surveyId: surveyA.id,
        code: "Q_SAT",
        title: "整體滿意度",
        questionType: QuestionType.single_choice,
        orderNum: 2,
        choices: {
          create: [
            { orderNum: 1, label: "滿意", value: "sat" },
            { orderNum: 2, label: "不滿意", value: "unsat" },
          ],
        },
      },
      include: { choices: true },
    });

    // 題目 3: 複選部門/管道 (Multiple Choice)
    qMultiDept = await db.question.create({
      data: {
        surveyId: surveyA.id,
        code: "Q_MULTI",
        title: "接觸管道 (複選)",
        questionType: QuestionType.multiple_choice,
        orderNum: 3,
        choices: {
          create: [
            { orderNum: 1, label: "網站", value: "web" },
            { orderNum: 2, label: "APP", value: "app" },
          ],
        },
      },
      include: { choices: true },
    });

    // 題目 4: 數值評分 (Number)
    qRating = await db.question.create({
      data: {
        surveyId: surveyA.id,
        code: "Q_RATE",
        title: "推薦分數",
        questionType: QuestionType.number,
        orderNum: 4,
      },
    });

    // 問卷 B (跨組織問卷)
    surveyB = await db.survey.create({
      data: {
        title: "Org B Secret Survey",
        status: SurveyStatus.PUBLISHED,
        version: 1,
        organizationId: orgB.id,
        createdById: userB.id,
        publicToken: generatePublicToken(),
      },
      include: {
        questions: true,
      },
    });
  });

  describe("1. 完整認證與 RBAC 邊界 (Authentication & RBAC)", () => {
    it("未登入呼叫回傳 401 Unauthorized", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?rowQuestionId=${qGender.id}&colQuestionId=${qSatisfaction.id}`
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(401);
    });

    it("跨組織成員 (Org B) 呼叫回傳 403 Forbidden", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?rowQuestionId=${qGender.id}&colQuestionId=${qSatisfaction.id}`,
        tokenUserB
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(403);
    });

    it("不存在之 Survey ID 回傳 404 NOT_FOUND", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/non-existent-survey/analytics/crosstab?rowQuestionId=${qGender.id}&colQuestionId=${qSatisfaction.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: "non-existent-survey" } });
      expect(res.status).toBe(404);
    });

    it("組織成員 (Owner, Admin, Editor, Viewer) 皆可查閱 2-Way 交叉分析 (200 OK)", async () => {
      for (const token of [tokenOwnerA, tokenAdminA, tokenEditorA, tokenViewerA]) {
        const req = makeAuthReq(
          `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?rowQuestionId=${qGender.id}&colQuestionId=${qSatisfaction.id}`,
          token
        );
        const res = await crosstabGET(req, { params: { id: surveyA.id } });
        expect(res.status).toBe(200);
      }
    });
  });

  describe("2. 多租戶隔離與防呆參數校驗 (Tenant Isolation & Parameter Guards)", () => {
    it("缺少題目參數時回傳 400 MISSING_DIMENSIONS", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?rowQuestionId=${qGender.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("MISSING_DIMENSIONS");
    });

    it("分組題目與目標題目為同一題時回傳 400 SAME_DIMENSION", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?rowQuestionId=${qGender.id}&colQuestionId=${qGender.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("SAME_DIMENSION");
    });

    it("嘗試傳入跨問卷題目 ID 時回傳 400 INVALID_QUESTIONS", async () => {
      const qOrgB = await db.question.create({
        data: {
          surveyId: surveyB.id,
          code: "Q_B1",
          title: "Org B Question",
          questionType: QuestionType.single_choice,
          orderNum: 1,
        },
      });

      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?rowQuestionId=${qGender.id}&colQuestionId=${qOrgB.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_QUESTIONS");
    });

    it("嘗試傳入超過 2 個題目參數 (3-Way) 時回傳 400 INVALID_DIMENSIONS", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?rowQuestionId=${qGender.id}&colQuestionId=${qSatisfaction.id}&questionC=${qMultiDept.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_DIMENSIONS");
    });
  });

  describe("3. 完整純函數管線整合驗收 (F.1 -> F.2 -> F.3 -> DTO)", () => {
    it("Single × Single 交叉矩陣：正確計算聚合、統計檢定與隱私遮蔽", async () => {
      // 構建填答資料：
      // Male: 20 sat, 2 unsat (unsat = 2 < 5 -> PRIMARY, sat = 20 -> COMPLEMENTARY)
      // Female: 30 sat, 30 unsat
      for (let i = 0; i < 20; i++) {
        await db.response.create({
          data: {
            surveyId: surveyA.id,
            status: ResponseStatus.COMPLETED,
            answers: {
              create: [
                { questionId: qGender.id, rawValue: JSON.stringify("male") },
                { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") },
              ],
            },
          },
        });
      }
      for (let i = 0; i < 2; i++) {
        await db.response.create({
          data: {
            surveyId: surveyA.id,
            status: ResponseStatus.COMPLETED,
            answers: {
              create: [
                { questionId: qGender.id, rawValue: JSON.stringify("male") },
                { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") },
              ],
            },
          },
        });
      }
      for (let i = 0; i < 30; i++) {
        await db.response.create({
          data: {
            surveyId: surveyA.id,
            status: ResponseStatus.COMPLETED,
            answers: {
              create: [
                { questionId: qGender.id, rawValue: JSON.stringify("female") },
                { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") },
              ],
            },
          },
        });
      }
      for (let i = 0; i < 30; i++) {
        await db.response.create({
          data: {
            surveyId: surveyA.id,
            status: ResponseStatus.COMPLETED,
            answers: {
              create: [
                { questionId: qGender.id, rawValue: JSON.stringify("female") },
                { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") },
              ],
            },
          },
        });
      }

      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?rowQuestionId=${qGender.id}&colQuestionId=${qSatisfaction.id}&status=COMPLETED`,
        tokenAdminA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);

      // 檢查 F.1 聚合結果與 F.3 隱私防護
      expect(data.result.grandTotal).toBe(82);
      expect(data.result.privacy.hasSuppression).toBe(true);
      expect(data.result.privacy.primarySuppressedCount).toBe(1);

      // 檢查 F.2 統計檢定指標完整存在於 response
      expect(data.result.statistics).not.toBeNull();
      expect(data.result.statistics.sampleSize).toBe(82);
      expect(data.result.statistics.degreesOfFreedom).toBe(1);
      expect(typeof data.result.statistics.chiSquare).toBe("number");
      expect(typeof data.result.statistics.pValue).toBe("number");
      expect(typeof data.result.statistics.cramersV).toBe("number");

      // 檢查個體個資零洩漏
      const rawBody = JSON.stringify(data);
      expect(rawBody).not.toContain("userId");
      expect(rawBody).not.toContain("email");
      expect(rawBody).not.toContain("password");
    });

    it("Single × Multiple 交叉分析：F.1 正常運算，F.2 統計檢定回傳 null 與警告", async () => {
      // 建立填答
      await db.response.create({
        data: {
          surveyId: surveyA.id,
          status: ResponseStatus.COMPLETED,
          answers: {
            create: [
              { questionId: qGender.id, rawValue: JSON.stringify("male") },
              { questionId: qMultiDept.id, rawValue: JSON.stringify(["web", "app"]) },
            ],
          },
        },
      });

      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?rowQuestionId=${qGender.id}&colQuestionId=${qMultiDept.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.result.rowQuestion.code).toBe("Q_GENDER");
      expect(data.result.colQuestion.code).toBe("Q_MULTI");

      // 多選題不支援皮爾森卡方
      expect(data.result.statistics.chiSquare).toBeNull();
      expect(data.result.statistics.pValue).toBeNull();
      expect(data.result.statistics.warning).toContain("多選題包含非互斥重複觀測值");
    });

    it("零填答 (N = 0) 時安全回傳空矩陣，不引發異常", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?rowQuestionId=${qGender.id}&colQuestionId=${qSatisfaction.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.result.grandTotal).toBe(0);
      expect(data.result.grandTotalDisplay).toBe("0");
      expect(data.result.totalResponses).toBe(0);
    });
  });
});
