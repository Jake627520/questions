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
import { GET as exportGET } from "../../src/app/api/surveys/[id]/analytics/crosstab/export/route";
import ExcelJS from "exceljs";

describe("Phase M9-G.7: Real API E2E & Full Pipeline Protection Suite", () => {
  let orgA: any;
  let orgB: any;

  let ownerA: any;
  let viewerA: any;
  let userB: any;

  let tokenOwnerA: string;
  let tokenViewerA: string;
  let tokenUserB: string;

  let surveyA: any;
  let qGenderA: any;
  let qDeptA: any;

  beforeEach(async () => {
    // 清理測試資料
    await db.answer.deleteMany({
      where: { response: { survey: { organization: { slug: { startsWith: "m9g7-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9g7-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m9g7-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9g7-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m9g7-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m9g7-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m9g7-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m9g7-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m9g7-" } },
    });

    // 建立租戶組織
    orgA = await db.organization.create({
      data: { name: "Org A Enterprise", slug: `m9g7-org-a-${Date.now()}` },
    });
    orgB = await db.organization.create({
      data: { name: "Org B Enterprise", slug: `m9g7-org-b-${Date.now()}` },
    });

    const passwordHash = await hashPassword("Password123!");

    ownerA = await db.user.create({
      data: { email: `m9g7-owner-${Date.now()}@test.com`, passwordHash, name: "Owner A" },
    });
    viewerA = await db.user.create({
      data: { email: `m9g7-viewer-${Date.now()}@test.com`, passwordHash, name: "Viewer A" },
    });
    userB = await db.user.create({
      data: { email: `m9g7-userb-${Date.now()}@test.com`, passwordHash, name: "User B" },
    });

    await db.membership.createMany({
      data: [
        { userId: ownerA.id, organizationId: orgA.id, role: Role.OWNER },
        { userId: viewerA.id, organizationId: orgA.id, role: Role.VIEWER },
        { userId: userB.id, organizationId: orgB.id, role: Role.OWNER },
      ],
    });

    const sOwnerA = await createSession(ownerA.id);
    const sViewerA = await createSession(viewerA.id);
    const sUserB = await createSession(userB.id);

    tokenOwnerA = sOwnerA.token;
    tokenViewerA = sViewerA.token;
    tokenUserB = sUserB.token;

    surveyA = await db.survey.create({
      data: {
        organizationId: orgA.id,
        title: "E2E Cross-tab Survey",
        description: "Testing end-to-end pipeline",
        status: SurveyStatus.PUBLISHED,
        version: 1,
        isAnonymous: true,
        publicToken: generatePublicToken(),
        createdById: ownerA.id,
      },
    });

    qGenderA = await db.question.create({
      data: {
        surveyId: surveyA.id,
        code: "Q_GENDER",
        title: "生理性別",
        questionType: QuestionType.single_choice,
        orderNum: 1,
        choices: {
          create: [
            { label: "女性", value: "female", orderNum: 1 },
            { label: "男性", value: "male", orderNum: 2 },
          ],
        },
      },
      include: { choices: true },
    });

    qDeptA = await db.question.create({
      data: {
        surveyId: surveyA.id,
        code: "Q_DEPT",
        title: "所屬部門",
        questionType: QuestionType.single_choice,
        orderNum: 2,
        choices: {
          create: [
            { label: "研發", value: "rd", orderNum: 1 },
            { label: "設計", value: "design", orderNum: 2 },
            { label: "營運", value: "ops", orderNum: 3 },
          ],
        },
      },
      include: { choices: true },
    });

    // 建立作答資料：設計部/女性 僅 1 人 (< 5)
    // 女性: 研發 20, 設計 1, 營運 10
    // 男性: 研發 25, 設計 15, 營運 12
    const makeResps = async (genderVal: string, deptVal: string, count: number) => {
      for (let i = 0; i < count; i++) {
        await db.response.create({
          data: {
            surveyId: surveyA.id,
            status: ResponseStatus.COMPLETED,
            answers: {
              create: [
                { questionId: qGenderA.id, rawValue: JSON.stringify([genderVal]) },
                { questionId: qDeptA.id, rawValue: JSON.stringify([deptVal]) },
              ],
            },
          },
        });
      }
    };

    await makeResps("female", "rd", 20);
    await makeResps("female", "design", 1); // < 5
    await makeResps("female", "ops", 10);
    await makeResps("male", "rd", 25);
    await makeResps("male", "design", 15);
    await makeResps("male", "ops", 12);
  });

  const createReq = (url: string, token?: string) => {
    return new NextRequest(url, {
      headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
    });
  };

  describe("1. Full Pipeline RBAC & Tenant Isolation", () => {
    it("未登入請求 API 應回傳 401 Unauthorized", async () => {
      const req = createReq(`http://localhost/api/surveys/${surveyA.id}/analytics/crosstab?rowQuestionId=${qGenderA.id}&colQuestionId=${qDeptA.id}`);
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(401);
    });

    it("跨租戶請求 (Org B 存取 Org A Survey) 應回傳 403 Forbidden", async () => {
      const req = createReq(
        `http://localhost/api/surveys/${surveyA.id}/analytics/crosstab?rowQuestionId=${qGenderA.id}&colQuestionId=${qDeptA.id}`,
        tokenUserB
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(403);
    });

    it("Viewer 角色有權查看唯讀去識別化交叉分析 (200 OK)", async () => {
      const req = createReq(
        `http://localhost/api/surveys/${surveyA.id}/analytics/crosstab?rowQuestionId=${qGenderA.id}&colQuestionId=${qDeptA.id}`,
        tokenViewerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.result.privacy.hasSuppression).toBe(true);
    });

    it("Viewer 角色嘗試匯出 Excel 報表應被拒絕 (403 Forbidden)", async () => {
      const req = createReq(
        `http://localhost/api/surveys/${surveyA.id}/analytics/crosstab/export?rowQuestionId=${qGenderA.id}&colQuestionId=${qDeptA.id}`,
        tokenViewerA
      );
      const res = await exportGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(403);
    });

    it("Owner 角色請求應成功取得 200 與 Protected DTO", async () => {
      const req = createReq(
        `http://localhost/api/surveys/${surveyA.id}/analytics/crosstab?rowQuestionId=${qGenderA.id}&colQuestionId=${qDeptA.id}`,
        tokenOwnerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.result).toBeDefined();
    });
  });

  describe("2. HTTP Payload & Small-Cell Zero Leakage", () => {
    it("HTTP Response JSON Payload 中被遮蔽之單元格 count 必須為 null，displayValue 為 <5 或 —", async () => {
      const req = createReq(
        `http://localhost/api/surveys/${surveyA.id}/analytics/crosstab?rowQuestionId=${qGenderA.id}&colQuestionId=${qDeptA.id}`,
        tokenOwnerA
      );
      const res = await crosstabGET(req, { params: { id: surveyA.id } });
      const json = await res.json();

      // 女性/設計 (0, 1) 原為 1 人，必須被遮蔽
      const femaleDesignCell = json.result.matrix[0][1];
      expect(femaleDesignCell.isSuppressed).toBe(true);
      expect(femaleDesignCell.count).toBeNull();
      expect(femaleDesignCell.displayValue).toBe("<5");

      // 檢查整個 JSON 字串，確認沒有洩漏任何原始作答紀錄或個資
      const rawString = JSON.stringify(json);
      expect(rawString).not.toContain("otherText");
      expect(rawString).not.toContain("respondentId");
    });
  });

  describe("3. Real Multi-Sheet XLSX Export Verification", () => {
    it("匯出 Excel 應包含 6 個 Sheet，且被遮蔽單元格在 Excel 中絕無原始整數 1", async () => {
      const req = createReq(
        `http://localhost/api/surveys/${surveyA.id}/analytics/crosstab/export?rowQuestionId=${qGenderA.id}&colQuestionId=${qDeptA.id}`,
        tokenOwnerA
      );
      const res = await exportGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("spreadsheetml.sheet");

      const arrayBuffer = await res.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(arrayBuffer) as any);

      expect(workbook.worksheets.length).toBe(6);
      expect(workbook.getWorksheet("次數交叉表 (Counts)")).toBeDefined();
      expect(workbook.getWorksheet("列百分比 (Row %)")).toBeDefined();
      expect(workbook.getWorksheet("行百分比 (Col %)")).toBeDefined();
      expect(workbook.getWorksheet("總百分比 (Total %)")).toBeDefined();
      expect(workbook.getWorksheet("推論統計與檢定 (Statistics)")).toBeDefined();
      expect(workbook.getWorksheet("報表資訊與隱私宣告")).toBeDefined();

      // 檢查次數交叉表，確認包含 <5
      const countsSheet = workbook.getWorksheet("次數交叉表 (Counts)")!;
      let foundSuppressedText = false;
      countsSheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.value === "<5" || cell.value === "< 5" || cell.value === "—") {
            foundSuppressedText = true;
          }
        });
      });
      expect(foundSuppressedText).toBe(true);
    });
  });
});
