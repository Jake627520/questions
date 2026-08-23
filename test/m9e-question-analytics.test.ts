import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  hashPassword,
  createSession,
  generatePublicToken,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { NextRequest } from "next/server";
import { Role, SurveyStatus, ResponseStatus, QuestionType } from "@prisma/client";
import { GET as questionAnalyticsGET } from "../src/app/api/surveys/[id]/analytics/questions/route";
import { GET as responseAnalyticsGET } from "../src/app/api/analytics/route";

describe("Phase M9-E: Question-level Analytics & Item Statistics Suite", () => {
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

  let surveyA1: any;
  let surveyAEmpty: any;
  let surveyB1: any;

  let qSingle: any;
  let qMulti: any;
  let qRating: any;
  let qSingleScore: any;
  let qText: any;

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
    // 1. 清理測試環境
    await db.answer.deleteMany({
      where: { response: { survey: { organization: { slug: { startsWith: "m9e-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9e-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m9e-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9e-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m9e-" } } },
    });
    await db.invitation.deleteMany({
      where: { organization: { slug: { startsWith: "m9e-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m9e-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m9e-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m9e-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m9e-" } },
    });

    const defaultPwd = await hashPassword("M9EPassword123!");

    // 2. 建立組織
    orgA = await db.organization.create({
      data: { name: "Org Alpha Item Intelligence", slug: "m9e-org-alpha" },
    });
    orgB = await db.organization.create({
      data: { name: "Org Beta Item Intelligence", slug: "m9e-org-beta" },
    });

    // 3. 建立各角色使用者
    ownerA = await db.user.create({
      data: {
        email: "m9e-owner-a@alpha.com",
        name: "Alice Owner",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.OWNER } },
      },
    });
    adminA = await db.user.create({
      data: {
        email: "m9e-admin-a@alpha.com",
        name: "Aaron Admin",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.ADMIN } },
      },
    });
    editorA = await db.user.create({
      data: {
        email: "m9e-editor-a@alpha.com",
        name: "Eric Editor",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.EDITOR } },
      },
    });
    viewerA = await db.user.create({
      data: {
        email: "m9e-viewer-a@alpha.com",
        name: "Victor Viewer",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.VIEWER } },
      },
    });
    userB = await db.user.create({
      data: {
        email: "m9e-user-b@beta.com",
        name: "Bob Beta",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgB.id, role: Role.ADMIN } },
      },
    });

    tokenOwnerA = (await createSession(ownerA.id)).token;
    tokenAdminA = (await createSession(adminA.id)).token;
    tokenEditorA = (await createSession(editorA.id)).token;
    tokenViewerA = (await createSession(viewerA.id)).token;
    tokenUserB = (await createSession(userB.id)).token;

    // 4. 建立問卷與各類型題目
    surveyA1 = await db.survey.create({
      data: {
        organizationId: orgA.id,
        createdById: ownerA.id,
        publicToken: generatePublicToken(),
        title: "Alpha Comprehensive Survey",
        status: SurveyStatus.PUBLISHED,
        version: 1,
        questions: {
          create: [
            {
              orderNum: 1,
              code: "Q1",
              title: "Single Choice Satisfaction",
              questionType: QuestionType.single_choice,
              required: true,
              choices: {
                create: [
                  { orderNum: 1, label: "Very Satisfied", value: "A" },
                  { orderNum: 2, label: "Satisfied", value: "B" },
                  { orderNum: 3, label: "Neutral", value: "C" },
                  { orderNum: 4, label: "Dissatisfied", value: "D" },
                ],
              },
            },
            {
              orderNum: 2,
              code: "Q2",
              title: "Multiple Choice Features",
              questionType: QuestionType.multiple_choice,
              required: false,
              choices: {
                create: [
                  { orderNum: 1, label: "Feature X", value: "X" },
                  { orderNum: 2, label: "Feature Y", value: "Y" },
                  { orderNum: 3, label: "Feature Z", value: "Z" },
                ],
              },
            },
            {
              orderNum: 3,
              code: "Q3",
              title: "Rating Score (1-5)",
              questionType: QuestionType.number,
              scoringEnabled: true,
              required: true,
            },
            {
              orderNum: 4,
              code: "Q4",
              title: "Scored Single Choice",
              questionType: QuestionType.single_choice,
              scoringEnabled: true,
              choices: {
                create: [
                  { orderNum: 1, label: "High (100)", value: "H", score: 100, scoreEnabled: true },
                  { orderNum: 2, label: "Low (50)", value: "L", score: 50, scoreEnabled: true },
                ],
              },
            },
            {
              orderNum: 5,
              code: "Q5",
              title: "Open Text Feedback",
              questionType: QuestionType.text,
              required: false,
            },
          ],
        },
      },
      include: {
        questions: {
          include: { choices: true },
          orderBy: { orderNum: "asc" },
        },
      },
    });

    qSingle = surveyA1.questions[0];
    qMulti = surveyA1.questions[1];
    qRating = surveyA1.questions[2];
    qSingleScore = surveyA1.questions[3];
    qText = surveyA1.questions[4];

    // 5. 建立空問卷 (0 筆回覆)
    surveyAEmpty = await db.survey.create({
      data: {
        organizationId: orgA.id,
        createdById: ownerA.id,
        publicToken: generatePublicToken(),
        title: "Alpha Empty Survey",
        status: SurveyStatus.PUBLISHED,
        version: 1,
        questions: {
          create: [
            {
              orderNum: 1,
              code: "QE1",
              title: "Empty Question",
              questionType: QuestionType.single_choice,
            },
          ],
        },
      },
    });

    // 6. 建立 Org B 問卷
    surveyB1 = await db.survey.create({
      data: {
        organizationId: orgB.id,
        createdById: userB.id,
        publicToken: generatePublicToken(),
        title: "Beta Survey",
        status: SurveyStatus.PUBLISHED,
        version: 1,
      },
    });

    // 7. 建立作答資料 (4 筆 Responses for Survey A1)
    // Response 1: Full answers (Q1: "A", Q2: ["X", "Y"], Q3: 4, Q4: "H" (100), Q5: "Great service")
    const r1 = await db.response.create({
      data: {
        surveyId: surveyA1.id,
        status: ResponseStatus.COMPLETED,
        totalScore: 104,
        percentage: 95,
        submittedAt: new Date(),
        answers: {
          create: [
            { questionId: qSingle.id, rawValue: JSON.stringify("A") },
            { questionId: qMulti.id, rawValue: JSON.stringify(["X", "Y"]) },
            { questionId: qRating.id, rawValue: "4", score: 4 },
            { questionId: qSingleScore.id, rawValue: JSON.stringify("H"), score: 100 },
            { questionId: qText.id, rawValue: JSON.stringify("Great service") },
          ],
        },
      },
    });

    // Response 2: Full answers (Q1: "A", Q2: ["Y"], Q3: 5, Q4: "L" (50), Q5: "Good")
    const r2 = await db.response.create({
      data: {
        surveyId: surveyA1.id,
        status: ResponseStatus.COMPLETED,
        totalScore: 55,
        percentage: 50,
        submittedAt: new Date(),
        answers: {
          create: [
            { questionId: qSingle.id, rawValue: JSON.stringify("A") },
            { questionId: qMulti.id, rawValue: JSON.stringify(["Y"]) },
            { questionId: qRating.id, rawValue: "5", score: 5 },
            { questionId: qSingleScore.id, rawValue: JSON.stringify("L"), score: 50 },
            { questionId: qText.id, rawValue: JSON.stringify("Good") },
          ],
        },
      },
    });

    // Response 3: Partial answers (Q1: "B", Q2: skipped, Q3: 3, Q4: "H" (100), Q5: empty)
    const r3 = await db.response.create({
      data: {
        surveyId: surveyA1.id,
        status: ResponseStatus.COMPLETED,
        totalScore: 103,
        percentage: 90,
        submittedAt: new Date(),
        answers: {
          create: [
            { questionId: qSingle.id, rawValue: JSON.stringify("B") },
            { questionId: qRating.id, rawValue: "3", score: 3 },
            { questionId: qSingleScore.id, rawValue: JSON.stringify("H"), score: 100 },
          ],
        },
      },
    });

    // Response 4: Partial answers (Q1: "C", Q2: ["Z"], Q3: skipped, Q4: skipped, Q5: empty)
    const r4 = await db.response.create({
      data: {
        surveyId: surveyA1.id,
        status: ResponseStatus.COMPLETED,
        submittedAt: new Date(),
        answers: {
          create: [
            { questionId: qSingle.id, rawValue: JSON.stringify("C") },
            { questionId: qMulti.id, rawValue: JSON.stringify(["Z"]) },
          ],
        },
      },
    });
  });

  describe("1. Data Correctness (數據指標計算正確性)", () => {
    it("1. answeredCount: 正確計算該題之有效填答筆數", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA1.id}/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: surveyA1.id } });
      expect(res.status).toBe(200);

      const data = await res.json();
      const q1 = data.questions.find((q: any) => q.code === "Q1");
      const q2 = data.questions.find((q: any) => q.code === "Q2");
      const q3 = data.questions.find((q: any) => q.code === "Q3");

      expect(q1.answeredCount).toBe(4);
      expect(q2.answeredCount).toBe(3);
      expect(q3.answeredCount).toBe(3);
    });

    it("2. notAnsweredCount: 正確計算未填答筆數 (totalResponses - answeredCount)", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA1.id}/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: surveyA1.id } });
      const data = await res.json();

      const q2 = data.questions.find((q: any) => q.code === "Q2"); // 4 - 3 = 1
      const q3 = data.questions.find((q: any) => q.code === "Q3"); // 4 - 3 = 1
      expect(q2.notAnsweredCount).toBe(1);
      expect(q3.notAnsweredCount).toBe(1);
    });

    it("3. responseRate: 正確計算該題填答率 (answeredCount / totalResponses * 100)", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA1.id}/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: surveyA1.id } });
      const data = await res.json();

      const q1 = data.questions.find((q: any) => q.code === "Q1");
      const q2 = data.questions.find((q: any) => q.code === "Q2");
      expect(q1.responseRate).toBe(100);
      expect(q2.responseRate).toBe(75);
    });

    it("4. choice count: 正確統計單選題各選項被選擇次數", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA1.id}/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: surveyA1.id } });
      const data = await res.json();

      const q1 = data.questions.find((q: any) => q.code === "Q1");
      const choiceA = q1.distribution.find((c: any) => c.value === "A");
      const choiceB = q1.distribution.find((c: any) => c.value === "B");
      const choiceC = q1.distribution.find((c: any) => c.value === "C");
      const choiceD = q1.distribution.find((c: any) => c.value === "D");

      expect(choiceA.count).toBe(2);
      expect(choiceB.count).toBe(1);
      expect(choiceC.count).toBe(1);
      expect(choiceD.count).toBe(0);
    });

    it("5. choice percentage: 選項百分比分母明確為 answeredCount，非 totalResponses", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA1.id}/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: surveyA1.id } });
      const data = await res.json();

      const q1 = data.questions.find((q: any) => q.code === "Q1");
      const choiceA = q1.distribution.find((c: any) => c.value === "A");
      const choiceB = q1.distribution.find((c: any) => c.value === "B");

      // Q1 answeredCount = 4 -> A: 2/4 = 50%, B: 1/4 = 25%
      expect(choiceA.percentage).toBe(50);
      expect(choiceB.percentage).toBe(25);
    });

    it("6. rating mean: 正確計算數值題統計平均數", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA1.id}/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: surveyA1.id } });
      const data = await res.json();

      const q3 = data.questions.find((q: any) => q.code === "Q3"); // scores: [4, 5, 3]
      expect(q3.statistics).toBeDefined();
      expect(q3.statistics.n).toBe(3);
      expect(q3.statistics.mean).toBe(4); // (4+5+3)/3 = 4
    });

    it("7. rating median: 正確計算數值題統計中位數", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA1.id}/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: surveyA1.id } });
      const data = await res.json();

      const q3 = data.questions.find((q: any) => q.code === "Q3");
      expect(q3.statistics.median).toBe(4);
    });

    it("8. rating min/max: 正確計算數值題統計極小值與極大值", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA1.id}/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: surveyA1.id } });
      const data = await res.json();

      const q3 = data.questions.find((q: any) => q.code === "Q3");
      expect(q3.statistics.min).toBe(3);
      expect(q3.statistics.max).toBe(5);
    });

    it("9. sample SD: 正確計算樣本標準差 s = sqrt(sum((x-mean)^2)/(n-1))", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA1.id}/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: surveyA1.id } });
      const data = await res.json();

      const q3 = data.questions.find((q: any) => q.code === "Q3"); // values: 4, 5, 3. mean=4. variance=((0)^2 + (1)^2 + (-1)^2)/(3-1) = 2/2 = 1. SD = 1.
      expect(q3.statistics.standardDeviation).toBe(1);
    });

    it("10. N < 2 -> SD null: 只有 1 筆數值資料時，standardDeviation 嚴格回傳 null，非 0", async () => {
      // 建立只有 1 筆回覆的獨立問卷
      const singleRespSurvey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          createdById: ownerA.id,
          title: "Single Response Survey",
          status: SurveyStatus.PUBLISHED,
          version: 1,
          questions: {
            create: [
              { orderNum: 1, code: "QS1", title: "Rating", questionType: QuestionType.number, scoringEnabled: true },
            ],
          },
        },
        include: { questions: true },
      });

      await db.response.create({
        data: {
          surveyId: singleRespSurvey.id,
          status: ResponseStatus.COMPLETED,
          answers: {
            create: [{ questionId: singleRespSurvey.questions[0].id, rawValue: "5", score: 5 }],
          },
        },
      });

      const req = makeAuthReq(`http://localhost:3000/api/surveys/${singleRespSurvey.id}/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: singleRespSurvey.id } });
      const data = await res.json();

      const qs1 = data.questions[0];
      expect(qs1.statistics.n).toBe(1);
      expect(qs1.statistics.mean).toBe(5);
      expect(qs1.statistics.standardDeviation).toBeNull();
    });
  });

  describe("2. Edge Cases (極端與邊界情境驗證)", () => {
    it("11. zero responses: 問卷 0 筆回覆時，各項計數為 0，statistics 為 null", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyAEmpty.id}/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: surveyAEmpty.id } });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.summary.totalResponses).toBe(0);
      expect(data.questions[0].answeredCount).toBe(0);
      expect(data.questions[0].notAnsweredCount).toBe(0);
      expect(data.questions[0].responseRate).toBe(0);
      expect(data.questions[0].statistics).toBeNull();
    });

    it("12. all unanswered: 存在填答記錄但該題未回答時，answeredCount 為 0，notAnsweredCount 等於 totalResponses", async () => {
      // 建立包含未回答題目的問卷
      const unansSurvey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          createdById: ownerA.id,
          title: "Unanswered Survey",
          status: SurveyStatus.PUBLISHED,
          version: 1,
          questions: {
            create: [
              { orderNum: 1, code: "QU1", title: "Optional Q", questionType: QuestionType.text },
            ],
          },
        },
        include: { questions: true },
      });

      await db.response.create({
        data: {
          surveyId: unansSurvey.id,
          status: ResponseStatus.COMPLETED,
          answers: { create: [] },
        },
      });

      const req = makeAuthReq(`http://localhost:3000/api/surveys/${unansSurvey.id}/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: unansSurvey.id } });
      const data = await res.json();

      expect(data.questions[0].answeredCount).toBe(0);
      expect(data.questions[0].notAnsweredCount).toBe(1);
      expect(data.questions[0].responseRate).toBe(0);
    });

    it("13. malformed/empty answers: 遭遇空字串或格式不良答案時安全過濾，不造成伺服端例外", async () => {
      const malformedSurvey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          createdById: ownerA.id,
          title: "Malformed Test",
          status: SurveyStatus.PUBLISHED,
          version: 1,
          questions: {
            create: [
              { orderNum: 1, code: "QM1", title: "Malformed Q", questionType: QuestionType.single_choice },
            ],
          },
        },
        include: { questions: true },
      });

      await db.response.create({
        data: {
          surveyId: malformedSurvey.id,
          status: ResponseStatus.COMPLETED,
          answers: {
            create: [
              { questionId: malformedSurvey.questions[0].id, rawValue: " " },
              { questionId: malformedSurvey.questions[0].id, rawValue: "null" },
            ],
          },
        },
      });

      const req = makeAuthReq(`http://localhost:3000/api/surveys/${malformedSurvey.id}/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: malformedSurvey.id } });
      expect(res.status).toBe(200);
    });

    it("14. multi-choice question: 多選題陣列格式 (['X', 'Y']) 正確累加各選項次數與百分比", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA1.id}/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: surveyA1.id } });
      const data = await res.json();

      const q2 = data.questions.find((q: any) => q.code === "Q2"); // responses had: ['X','Y'], ['Y'], ['Z']. answeredCount = 3.
      const choiceX = q2.distribution.find((c: any) => c.value === "X");
      const choiceY = q2.distribution.find((c: any) => c.value === "Y");
      const choiceZ = q2.distribution.find((c: any) => c.value === "Z");

      expect(choiceX.count).toBe(1);
      expect(choiceY.count).toBe(2);
      expect(choiceZ.count).toBe(1);

      // Percentage denominator is answeredCount (3)
      expect(choiceY.percentage).toBe(66.7); // 2 / 3 * 100 = 66.7%
    });

    it("15. text question: 文字題僅統計有效與未填筆數，零假造 NLP / AI 數據", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA1.id}/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: surveyA1.id } });
      const data = await res.json();

      const q5 = data.questions.find((q: any) => q.code === "Q5");
      expect(q5.answeredCount).toBe(2);
      expect(q5.notAnsweredCount).toBe(2);
      expect(q5.distribution).toBeNull();
      expect(q5.statistics).toBeNull();
    });
  });

  describe("3. Security & Multi-Tenant Boundaries (安全與租戶邊界)", () => {
    it("16. same-org access: 同組織成員能正常存取題目統計 (200 OK)", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA1.id}/analytics/questions`, tokenAdminA);
      const res = await questionAnalyticsGET(req, { params: { id: surveyA1.id } });
      expect(res.status).toBe(200);
    });

    it("17. cross-org access: 跨組織成員嘗試存取其他組織問卷之題目統計被嚴格阻擋 (403 Forbidden)", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA1.id}/analytics/questions`, tokenUserB);
      const res = await questionAnalyticsGET(req, { params: { id: surveyA1.id } });
      expect(res.status).toBe(403);
    });

    it("18. unauthenticated: 未登入存取題目統計回傳 401 Unauthorized", async () => {
      const req = new NextRequest(`http://localhost:3000/api/surveys/${surveyA1.id}/analytics/questions`);
      const res = await questionAnalyticsGET(req, { params: { id: surveyA1.id } });
      expect(res.status).toBe(401);
    });

    it("19. RBAC VIEWER: VIEWER 角色具備題目統計唯讀檢視權限 (200 OK)", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA1.id}/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: surveyA1.id } });
      expect(res.status).toBe(200);
    });

    it("20. invalid survey ID: 查詢不存在之問卷 ID 回傳 404 NOT_FOUND", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/non-existent-id/analytics/questions`, tokenViewerA);
      const res = await questionAnalyticsGET(req, { params: { id: "non-existent-id" } });
      expect(res.status).toBe(404);
    });
  });

  describe("4. Regression Check (回歸不破壞既有分析端點)", () => {
    it("21. existing M9-D analytics: 既有 /api/analytics 組織層級統計端點運作完全正常不受影響", async () => {
      const req = makeAuthReq("http://localhost:3000/api/analytics", tokenViewerA);
      const res = await responseAnalyticsGET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.kpis.totalResponses).toBe(4);
    });
  });
});
