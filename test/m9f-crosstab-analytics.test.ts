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
import { GET as crosstabGET } from "../src/app/api/surveys/[id]/analytics/crosstab/route";
import { GET as crosstabExportGET } from "../src/app/api/surveys/[id]/analytics/crosstab/export/route";
import { GET as questionAnalyticsGET } from "../src/app/api/surveys/[id]/analytics/questions/route";
import { GET as responseAnalyticsGET } from "../src/app/api/analytics/route";

describe("Phase M9-F: Cross-tabulation & Demographic Segmentation Privacy Suite", () => {
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

  let qDept: any; // Dimension A (Row): Dept (Engineering, Sales, Marketing)
  let qSat: any;  // Dimension B (Col): Satisfaction (High, Medium, Low)
  let qOther: any; // Dimension C: Extra question

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
      where: { response: { survey: { organization: { slug: { startsWith: "m9f-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9f-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m9f-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9f-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m9f-" } } },
    });
    await db.invitation.deleteMany({
      where: { organization: { slug: { startsWith: "m9f-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m9f-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m9f-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m9f-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m9f-" } },
    });

    const defaultPwd = await hashPassword("M9FPassword123!");

    // 2. 建立組織與使用者
    orgA = await db.organization.create({
      data: { name: "Org Alpha Privacy Intel", slug: "m9f-org-alpha" },
    });
    orgB = await db.organization.create({
      data: { name: "Org Beta Privacy Intel", slug: "m9f-org-beta" },
    });

    ownerA = await db.user.create({
      data: {
        email: "m9f-owner-a@alpha.com",
        name: "Alice Owner",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.OWNER } },
      },
    });
    adminA = await db.user.create({
      data: {
        email: "m9f-admin-a@alpha.com",
        name: "Aaron Admin",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.ADMIN } },
      },
    });
    editorA = await db.user.create({
      data: {
        email: "m9f-editor-a@alpha.com",
        name: "Eric Editor",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.EDITOR } },
      },
    });
    viewerA = await db.user.create({
      data: {
        email: "m9f-viewer-a@alpha.com",
        name: "Victor Viewer",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.VIEWER } },
      },
    });
    userB = await db.user.create({
      data: {
        email: "m9f-user-b@beta.com",
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

    // 3. 建立 Survey A 與題目
    surveyA = await db.survey.create({
      data: {
        organizationId: orgA.id,
        createdById: ownerA.id,
        publicToken: generatePublicToken(),
        title: "Org Alpha Privacy Survey",
        status: SurveyStatus.PUBLISHED,
        isAnonymous: true,
        version: 1,
        questions: {
          create: [
            {
              orderNum: 1,
              code: "Q_DEPT",
              title: "Department",
              questionType: QuestionType.single_choice,
              choices: {
                create: [
                  { orderNum: 1, label: "Engineering", value: "ENG" },
                  { orderNum: 2, label: "Sales", value: "SALES" },
                  { orderNum: 3, label: "Marketing", value: "MKT" },
                ],
              },
            },
            {
              orderNum: 2,
              code: "Q_SAT",
              title: "Satisfaction",
              questionType: QuestionType.single_choice,
              choices: {
                create: [
                  { orderNum: 1, label: "High", value: "HIGH" },
                  { orderNum: 2, label: "Medium", value: "MED" },
                  { orderNum: 3, label: "Low", value: "LOW" },
                ],
              },
            },
            {
              orderNum: 3,
              code: "Q_EXTRA",
              title: "Extra Question",
              questionType: QuestionType.single_choice,
              choices: {
                create: [
                  { orderNum: 1, label: "Yes", value: "Y" },
                  { orderNum: 2, label: "No", value: "N" },
                ],
              },
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

    qDept = surveyA.questions[0];
    qSat = surveyA.questions[1];
    qOther = surveyA.questions[2];

    // 4. 建立 Survey B
    surveyB = await db.survey.create({
      data: {
        organizationId: orgB.id,
        createdById: userB.id,
        publicToken: generatePublicToken(),
        title: "Org Beta Survey",
        status: SurveyStatus.PUBLISHED,
        version: 1,
        questions: {
          create: [
            {
              orderNum: 1,
              code: "QB1",
              title: "Beta Q1",
              questionType: QuestionType.single_choice,
            },
          ],
        },
      },
      include: { questions: true },
    });

    // 5. 建立精密作答資料：
    // Engineering (ENG):
    //   - HIGH: 5 人 (n = 5 -> visible)
    //   - MED: 0 人 (n = 0 -> visible 0)
    //   - LOW: 0 人 (n = 0)
    // Sales (SALES):
    //   - HIGH: 6 人 (n = 6 -> visible)
    //   - MED: 1 人 (n = 1 -> primary suppressed)
    //   - LOW: 8 人 (n = 8 -> visible, but due to complementary suppression in this row, 6 is suppressed to prevent 15 - 8 - 6 = 1 difference attack)
    // Marketing (MKT):
    //   - HIGH: 2 人 (n = 2 -> suppressed)
    //   - MED: 3 人 (n = 3 -> suppressed)
    //   - LOW: 4 人 (n = 4 -> suppressed)
    // 另外建立未作答與跳題 Responses (Missing & Conditional Skip)

    const createBatch = async (deptVal: string, satVal: string, count: number) => {
      for (let i = 0; i < count; i++) {
        await db.response.create({
          data: {
            surveyId: surveyA.id,
            status: ResponseStatus.COMPLETED,
            answers: {
              create: [
                { questionId: qDept.id, rawValue: JSON.stringify(deptVal) },
                { questionId: qSat.id, rawValue: JSON.stringify(satVal) },
              ],
            },
          },
        });
      }
    };

    await createBatch("ENG", "HIGH", 5);
    await createBatch("SALES", "HIGH", 6);
    await createBatch("SALES", "MED", 1);
    await createBatch("SALES", "LOW", 8);
    await createBatch("MKT", "HIGH", 2);
    await createBatch("MKT", "MED", 3);
    await createBatch("MKT", "LOW", 4);

    // 建立 3 筆只有回答 Q_DEPT 但未回答 Q_SAT (Missing Q_SAT)
    for (let i = 0; i < 3; i++) {
      await db.response.create({
        data: {
          surveyId: surveyA.id,
          status: ResponseStatus.COMPLETED,
          answers: {
            create: [{ questionId: qDept.id, rawValue: JSON.stringify("ENG") }],
          },
        },
      });
    }

    // 建立 2 筆完全未回答這兩題的 Response
    for (let i = 0; i < 2; i++) {
      await db.response.create({
        data: {
          surveyId: surveyA.id,
          status: ResponseStatus.COMPLETED,
          answers: { create: [] },
        },
      });
    }
  });

  describe("1. Minimum Cell Size Suppression (隱私遮蔽門檻)", () => {
    it("1. n = 0: 次數為 0 時正常公開顯示 0 與 0%，不進行隱私遮蔽", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);

      const data = await res.json();
      const engRow = data.rows.find((r: any) => r.rowLabel === "Engineering");
      const medCell = engRow.cells.find((c: any) => c.colLabel === "Medium");

      expect(medCell.count).toBe(0);
      expect(medCell.rowPercentage).toBe(0);
      expect(medCell.columnPercentage).toBe(0);
      expect(medCell.isSuppressed).toBe(false);
    });

    it("2. n = 1: 樣本數為 1 時嚴格執行 Primary Suppression", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      const data = await res.json();

      const salesRow = data.rows.find((r: any) => r.rowLabel === "Sales");
      const medCell = salesRow.cells.find((c: any) => c.colLabel === "Medium"); // n = 1
      expect(medCell.isSuppressed).toBe(true);
      expect(medCell.count).toBeNull();
    });

    it("3. n = 2: 樣本數為 2 時嚴格執行 Primary Suppression", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      const data = await res.json();

      const mktRow = data.rows.find((r: any) => r.rowLabel === "Marketing");
      const highCell = mktRow.cells.find((c: any) => c.colLabel === "High"); // n = 2
      expect(highCell.isSuppressed).toBe(true);
      expect(highCell.count).toBeNull();
    });

    it("4. n = 3: 樣本數為 3 時嚴格執行 Primary Suppression", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      const data = await res.json();

      const mktRow = data.rows.find((r: any) => r.rowLabel === "Marketing");
      const medCell = mktRow.cells.find((c: any) => c.colLabel === "Medium"); // n = 3
      expect(medCell.isSuppressed).toBe(true);
      expect(medCell.count).toBeNull();
    });

    it("5. n = 4: 樣本數為 4 時嚴格執行 Primary Suppression", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      const data = await res.json();

      const mktRow = data.rows.find((r: any) => r.rowLabel === "Marketing");
      const lowCell = mktRow.cells.find((c: any) => c.colLabel === "Low"); // n = 4
      expect(lowCell.isSuppressed).toBe(true);
      expect(lowCell.count).toBeNull();
    });

    it("6. n >= 5: 樣本數達門檻時正常公開次數與百分比", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      const data = await res.json();

      const engRow = data.rows.find((r: any) => r.rowLabel === "Engineering");
      const highCell = engRow.cells.find((c: any) => c.colLabel === "High"); // n = 5

      expect(highCell.isSuppressed).toBe(false);
      expect(highCell.count).toBe(5);
      expect(highCell.rowPercentage).toBe(100);
      expect(highCell.totalPercentage).toBe(17.2); // 5 / 29 = 17.2%
    });
  });

  describe("2. Percentages, Missing & Skipping Exclusion (百分比與遺漏值處理)", () => {
    it("7. row percentage denominator: 以該 Row 之有效答題數 (rowTotalAnswered) 為分母", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      const data = await res.json();

      const engRow = data.rows.find((r: any) => r.rowLabel === "Engineering");
      const highCell = engRow.cells.find((c: any) => c.colLabel === "High");

      // ENG Row 有效回答雙題為 5 人 -> 5 / 5 = 100%
      expect(engRow.rowTotalAnswered).toBe(5);
      expect(highCell.rowPercentage).toBe(100);
    });

    it("8. column percentage denominator: 以該 Column 之有效答題數 (colTotalAnswered) 為分母", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      const data = await res.json();

      const engRow = data.rows.find((r: any) => r.rowLabel === "Engineering");
      const highCell = engRow.cells.find((c: any) => c.colLabel === "High");

      // High Col 總數為 5 (ENG) + 6 (SALES) + 2 (MKT) = 13.
      // ENG High percentage = 5 / 13 = 38.5%
      expect(highCell.columnPercentage).toBe(38.5);
    });

    it("9. missing exclusion: 單題未作答者明確排除於雙題 validPopulation 與交叉矩陣之外", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      const data = await res.json();

      // 總問卷回應 34 筆 (29 雙題 + 3 僅答 Q_DEPT + 2 全未答)
      expect(data.totalSurveyResponses).toBe(34);
      expect(data.validPopulation).toBe(29);
      expect(data.dimensionA.notAnsweredCount).toBe(2);
      expect(data.dimensionB.notAnsweredCount).toBe(5); // 3 + 2 = 5
    });

    it("10. conditional skip exclusion: 條件跳題未填者不計入 Row % / Column % 之有效分母", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      const data = await res.json();

      // 雙題皆有作答之有效人次為 29
      expect(data.bothAnsweredCount).toBe(29);
      expect(data.dimensionB.totalAnswered).toBe(29);
    });
  });

  describe("3. Complementary Suppression (差額回推防護)", () => {
    it("16. complementary suppression: 當 Row/Col 只有一個 suppressed cell 時，自動遮蔽第二小單元防止 Total - Known 回推", async () => {
      // 建立專用 2-Way 矩陣問卷：
      // Row 1 (R1): C1=10, C2=1 (Primary Suppressed), C3=8 -> C3(8) 應被次要遮蔽 (Complementary Suppressed)
      // Row 2 (R2): C1=10, C2=10, C3=10 (全 >= 5，正常公開)
      const compSurvey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          createdById: ownerA.id,
          publicToken: generatePublicToken(),
          title: "Complementary Suppression Test Survey",
          status: SurveyStatus.PUBLISHED,
          version: 1,
          questions: {
            create: [
              {
                orderNum: 1,
                code: "QC1",
                title: "Row Dimension",
                questionType: QuestionType.single_choice,
                choices: {
                  create: [
                    { orderNum: 1, label: "Row Alpha", value: "RA" },
                    { orderNum: 2, label: "Row Beta", value: "RB" },
                  ],
                },
              },
              {
                orderNum: 2,
                code: "QC2",
                title: "Col Dimension",
                questionType: QuestionType.single_choice,
                choices: {
                  create: [
                    { orderNum: 1, label: "Col X", value: "CX" },
                    { orderNum: 2, label: "Col Y", value: "CY" },
                    { orderNum: 3, label: "Col Z", value: "CZ" },
                  ],
                },
              },
            ],
          },
        },
        include: { questions: { include: { choices: true } } },
      });

      const qRow = compSurvey.questions[0];
      const qCol = compSurvey.questions[1];

      // 建立 Row Alpha: CX=10, CY=1 (suppressed), CZ=8
      for (let i = 0; i < 10; i++) {
        await db.response.create({
          data: {
            surveyId: compSurvey.id,
            status: ResponseStatus.COMPLETED,
            answers: {
              create: [
                { questionId: qRow.id, rawValue: JSON.stringify("RA") },
                { questionId: qCol.id, rawValue: JSON.stringify("CX") },
              ],
            },
          },
        });
      }
      // CY = 1
      await db.response.create({
        data: {
          surveyId: compSurvey.id,
          status: ResponseStatus.COMPLETED,
          answers: {
            create: [
              { questionId: qRow.id, rawValue: JSON.stringify("RA") },
              { questionId: qCol.id, rawValue: JSON.stringify("CY") },
            ],
          },
        },
      });
      // CZ = 8
      for (let i = 0; i < 8; i++) {
        await db.response.create({
          data: {
            surveyId: compSurvey.id,
            status: ResponseStatus.COMPLETED,
            answers: {
              create: [
                { questionId: qRow.id, rawValue: JSON.stringify("RA") },
                { questionId: qCol.id, rawValue: JSON.stringify("CZ") },
              ],
            },
          },
        });
      }

      // 建立 Row Beta: CX=10, CY=10, CZ=10
      for (let i = 0; i < 10; i++) {
        for (const colVal of ["CX", "CY", "CZ"]) {
          await db.response.create({
            data: {
              surveyId: compSurvey.id,
              status: ResponseStatus.COMPLETED,
              answers: {
                create: [
                  { questionId: qRow.id, rawValue: JSON.stringify("RB") },
                  { questionId: qCol.id, rawValue: JSON.stringify(colVal) },
                ],
              },
            },
          });
        }
      }

      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${compSurvey.id}/analytics/crosstab?questionA=${qRow.id}&questionB=${qCol.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: compSurvey.id } });
      expect(res.status).toBe(200);

      const data = await res.json();
      const rowAlpha = data.rows.find((r: any) => r.rowLabel === "Row Alpha");
      const cellCX = rowAlpha.cells.find((c: any) => c.colLabel === "Col X"); // 10
      const cellCY = rowAlpha.cells.find((c: any) => c.colLabel === "Col Y"); // 1 (primary suppressed)
      const cellCZ = rowAlpha.cells.find((c: any) => c.colLabel === "Col Z"); // 8 (complementary suppressed)

      expect(cellCY.isSuppressed).toBe(true);
      expect(cellCY.count).toBeNull();

      // Col Z (8) 是第二小的非零數值，在 Row Alpha 中被連帶遮蔽以防 19 - 10 - 8 = 1 差額回推
      expect(cellCZ.isSuppressed).toBe(true);
      expect(cellCZ.count).toBeNull();

      // Col X (10) 保持公開
      expect(cellCX.isSuppressed).toBe(false);
      expect(cellCX.count).toBe(10);
    });
  });

  describe("4. Security, Isolation & Validation (安全與邊界檢查)", () => {
    it("11. cross-organization -> 403: 跨租戶查詢其他組織問卷交叉表回傳 403 Forbidden", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}`,
        tokenUserB
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(403);
    });

    it("12. unauthenticated -> 401: 未登入請求回傳 401 Unauthorized", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}`
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(401);
    });

    it("13. invalid survey -> 404: 查詢不存在之問卷 ID 回傳 404 NOT_FOUND", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/non-existent-id/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: "non-existent-id" } });
      expect(res.status).toBe(404);
    });

    it("14. raw response data leakage prevention: API 絕對不回傳 responseId, userId, email, raw answers 或 debug 欄位", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      const rawText = await res.text();

      expect(rawText).not.toContain("responseId");
      expect(rawText).not.toContain("userId");
      expect(rawText).not.toContain("email");
      expect(rawText).not.toContain("rawCount");
      expect(rawText).not.toContain("hiddenCount");
      expect(rawText).not.toContain("answers");
    });

    it("17. client cannot override MIN_CELL_SIZE: Client 傳入 minCellSize=1 仍強制由伺服端固定為 5", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}&minCellSize=1`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      const data = await res.json();

      expect(data.minCellSize).toBe(5);
      const mktRow = data.rows.find((r: any) => r.rowLabel === "Marketing");
      expect(mktRow.cells[0].isSuppressed).toBe(true); // 仍被遮蔽
    });

    it("18. 3-way dimension request rejected: 嘗試傳入 3-Way 維度參數回傳 400 INVALID_DIMENSIONS", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}&questionC=${qOther.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(400);

      const err = await res.json();
      expect(err.error).toBe("INVALID_DIMENSIONS");
    });

    it("19. questions from different surveys rejected: 傳入跨問卷之題目 ID 回傳 400 INVALID_QUESTIONS", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${surveyB.questions[0].id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(400);

      const err = await res.json();
      expect(err.error).toBe("INVALID_QUESTIONS");
    });

    it("20. anonymous survey aggregate-only boundary: 匿名問卷僅回傳聚合矩陣，絕不洩漏個體作答鏈路", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab?questionA=${qDept.id}&questionB=${qSat.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      const data = await res.json();

      expect(data.isAnonymous).toBe(true);
      expect(Array.isArray(data.rows)).toBe(true);
      expect(data.rows.length).toBe(3);
    });
  });

  describe("5. Export Privacy Parity & RBAC (匯出隱私一致性)", () => {
    it("15. export privacy parity: Excel 匯出端點產出之二維表格與 API 具備 100% 遮蔽一致性", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab/export?questionA=${qDept.id}&questionB=${qSat.id}`,
        tokenAdminA
      );
      const res = await crosstabExportGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("spreadsheetml");

      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(1000);
    });

    it("21. RBAC export check: VIEWER 角色嘗試匯出 Excel 交叉報表回傳 403 Forbidden", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/analytics/crosstab/export?questionA=${qDept.id}&questionB=${qSat.id}`,
        tokenViewerA
      );
      const res = await crosstabExportGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(403);
    });
  });

  describe("6. Regression Check (回歸驗證)", () => {
    it("22. existing M9-D & M9-E endpoints unaffected: 既有 /api/analytics 與 /api/surveys/:id/analytics/questions 運作正常", async () => {
      const req1 = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA.id}/analytics/questions`, tokenViewerA);
      const res1 = await questionAnalyticsGET(req1, { params: { id: surveyA.id } });
      expect(res1.status).toBe(200);

      const req2 = makeAuthReq("http://localhost:3000/api/analytics", tokenViewerA);
      const res2 = await responseAnalyticsGET(req2);
      expect(res2.status).toBe(200);
    });
  });
});
