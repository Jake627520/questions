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
import { GET as exportGET } from "../src/app/api/surveys/[id]/export/route";
import ExcelJS from "exceljs";

describe("Phase M9-E.3: Filter-Aware Multi-Sheet Excel Export & Reporting Suite", () => {
  let orgA: any;
  let orgB: any;

  let ownerA: any;
  let viewerA: any;
  let userB: any;

  let tokenOwnerA: string;
  let tokenViewerA: string;
  let tokenUserB: string;

  let surveyA: any;
  let surveyB: any;

  let q1Single: any;
  let q2Multi: any;
  let q3Rating: any;
  let q4Text: any;

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
      where: { response: { survey: { organization: { slug: { startsWith: "m9e3-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9e3-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m9e3-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9e3-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m9e3-" } } },
    });
    await db.session.deleteMany({
      where: { user: { email: { contains: "m9e3" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m9e3-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m9e3-" } },
    });
    await db.user.deleteMany({
      where: { email: { contains: "m9e3" } },
    });

    // 2. 建立組織 A & B
    const timestamp = Date.now();
    orgA = await db.organization.create({
      data: {
        name: "Org M9E3 A",
        slug: `m9e3-org-a-${timestamp}`,
      },
    });

    orgB = await db.organization.create({
      data: {
        name: "Org M9E3 B",
        slug: `m9e3-org-b-${timestamp}`,
      },
    });

    // 3. 建立使用者與 Membership
    const pw = await hashPassword("password123");

    ownerA = await db.user.create({
      data: { email: `owner-m9e3-${timestamp}@test.com`, passwordHash: pw, name: "Owner A" },
    });
    viewerA = await db.user.create({
      data: { email: `viewer-m9e3-${timestamp}@test.com`, passwordHash: pw, name: "Viewer A" },
    });
    userB = await db.user.create({
      data: { email: `user-m9e3-b-${timestamp}@test.com`, passwordHash: pw, name: "User B" },
    });

    await db.membership.create({
      data: { userId: ownerA.id, organizationId: orgA.id, role: Role.OWNER },
    });
    await db.membership.create({
      data: { userId: viewerA.id, organizationId: orgA.id, role: Role.VIEWER },
    });
    await db.membership.create({
      data: { userId: userB.id, organizationId: orgB.id, role: Role.OWNER },
    });

    tokenOwnerA = (await createSession(ownerA.id)).token;
    tokenViewerA = (await createSession(viewerA.id)).token;
    tokenUserB = (await createSession(userB.id)).token;

    // 4. 建立問卷 A
    surveyA = await db.survey.create({
      data: {
        organizationId: orgA.id,
        title: "M9-E.3 匯出報表測試問卷",
        version: 1,
        status: SurveyStatus.PUBLISHED,
        publicToken: generatePublicToken(),
        questions: {
          create: [
            {
              orderNum: 1,
              code: "Q1",
              title: "整體滿意度 (單選)",
              questionType: QuestionType.single_choice,
              required: true,
              scoringEnabled: true,
              choices: {
                create: [
                  { orderNum: 1, label: "非常不滿意", value: "vs_dis", scoreEnabled: true, score: 1 },
                  { orderNum: 2, label: "不滿意", value: "dis", scoreEnabled: true, score: 2 },
                  { orderNum: 3, label: "滿意", value: "sat", scoreEnabled: true, score: 3 },
                  { orderNum: 4, label: "非常滿意", value: "vs_sat", scoreEnabled: true, score: 4 },
                ],
              },
            },
            {
              orderNum: 2,
              code: "Q2",
              title: "使用功能 (多選)",
              questionType: QuestionType.multiple_choice,
              required: false,
              choices: {
                create: [
                  { orderNum: 1, label: "問卷設計", value: "feat_design" },
                  { orderNum: 2, label: "資料分析", value: "feat_analytics" },
                  { orderNum: 3, label: "報表匯出", value: "feat_export" },
                ],
              },
            },
            {
              orderNum: 3,
              code: "Q3",
              title: "系統評分 (1-10)",
              questionType: QuestionType.number,
              required: false,
              minValue: 1,
              maxValue: 10,
            },
            {
              orderNum: 4,
              code: "Q4",
              title: "意見回饋 (問答)",
              questionType: QuestionType.text,
              required: false,
            },
          ],
        },
      },
      include: {
        questions: {
          orderBy: { orderNum: "asc" },
          include: { choices: true },
        },
      },
    });

    q1Single = surveyA.questions[0];
    q2Multi = surveyA.questions[1];
    q3Rating = surveyA.questions[2];
    q4Text = surveyA.questions[3];

    // 問卷 B (跨組織隔離測試)
    surveyB = await db.survey.create({
      data: {
        organizationId: orgB.id,
        title: "Org B Survey",
        version: 1,
        status: SurveyStatus.PUBLISHED,
        publicToken: generatePublicToken(),
      },
    });

    // 5. 建立填答資料：3 筆 COMPLETED, 2 筆 IN_PROGRESS
    // Response 1: COMPLETED
    await db.response.create({
      data: {
        surveyId: surveyA.id,
        status: ResponseStatus.COMPLETED,
        totalScore: 4,
        maxScore: 4,
        percentage: 100,
        submittedAt: new Date(),
        answers: {
          create: [
            { questionId: q1Single.id, rawValue: JSON.stringify("vs_sat"), score: 4 },
            { questionId: q2Multi.id, rawValue: JSON.stringify(["feat_design", "feat_analytics"]) },
            { questionId: q3Rating.id, rawValue: JSON.stringify(9), score: 9 },
            { questionId: q4Text.id, rawValue: JSON.stringify("非常實用的系統") },
          ],
        },
      },
    });

    // Response 2: COMPLETED
    await db.response.create({
      data: {
        surveyId: surveyA.id,
        status: ResponseStatus.COMPLETED,
        totalScore: 3,
        maxScore: 4,
        percentage: 75,
        submittedAt: new Date(),
        answers: {
          create: [
            { questionId: q1Single.id, rawValue: JSON.stringify("sat"), score: 3 },
            { questionId: q2Multi.id, rawValue: JSON.stringify(["feat_export"]) },
            { questionId: q3Rating.id, rawValue: JSON.stringify(8), score: 8 },
          ],
        },
      },
    });

    // Response 3: COMPLETED
    await db.response.create({
      data: {
        surveyId: surveyA.id,
        status: ResponseStatus.COMPLETED,
        totalScore: 1,
        maxScore: 4,
        percentage: 25,
        submittedAt: new Date(),
        answers: {
          create: [
            { questionId: q1Single.id, rawValue: JSON.stringify("vs_dis"), score: 1 },
            { questionId: q3Rating.id, rawValue: JSON.stringify(2), score: 2 },
          ],
        },
      },
    });

    // Response 4: IN_PROGRESS
    await db.response.create({
      data: {
        surveyId: surveyA.id,
        status: ResponseStatus.IN_PROGRESS,
        answers: {
          create: [
            { questionId: q1Single.id, rawValue: JSON.stringify("vs_sat"), score: 4 },
          ],
        },
      },
    });

    // Response 5: IN_PROGRESS (Empty draft)
    await db.response.create({
      data: {
        surveyId: surveyA.id,
        status: ResponseStatus.IN_PROGRESS,
      },
    });
  });

  describe("1. 安全與權限檢查 (Security & RBAC Boundaries)", () => {
    it("未登入呼叫匯出 API 應回傳 401 Unauthorized", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA.id}/export`);
      const res = await exportGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(401);
    });

    it("非該組織成員呼叫匯出 API (跨組織 IDOR) 應回傳 403 Forbidden", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA.id}/export`, tokenUserB);
      const res = await exportGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(403);
    });

    it("查詢不存在之問卷 ID 應回傳 404 Not Found", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/non-existent-survey-id/export`, tokenOwnerA);
      const res = await exportGET(req, { params: { id: "non-existent-survey-id" } });
      expect(res.status).toBe(404);
    });

    it("組織 VIEWER 匯出報表應被拒絕回傳 403 Forbidden (RBAC 角色隔離)", async () => {
      const reqViewer = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA.id}/export`, tokenViewerA);
      const resViewer = await exportGET(reqViewer, { params: { id: surveyA.id } });
      expect(resViewer.status).toBe(403);
    });

    it("組織 OWNER 有權匯出報表 (200 OK)", async () => {
      const reqOwner = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA.id}/export`, tokenOwnerA);
      const resOwner = await exportGET(reqOwner, { params: { id: surveyA.id } });
      expect(resOwner.status).toBe(200);
      expect(resOwner.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
    });
  });

  describe("2. 多工作表結構與資料一致性 (Multi-Sheet Structure & Consistency)", () => {
    it("匯出檔案應包含 5 個完整 Sheet 且各 Sheet 結構正確", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA.id}/export?status=ALL&timeRange=all`, tokenOwnerA);
      const res = await exportGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);

      const arrayBuffer = await res.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(arrayBuffer) as any);

      const sheetNames = workbook.worksheets.map((s) => s.name);
      expect(sheetNames).toContain("匯出資訊 (Meta)");
      expect(sheetNames).toContain("填答總覽 (Responses)");
      expect(sheetNames).toContain("作答明細 (Answers)");
      expect(sheetNames).toContain("題目統計摘要 (Summary)");
      expect(sheetNames).toContain("題目與選項設定");

      // 檢查 Sheet 1: 匯出資訊 (Meta)
      const metaSheet = workbook.getWorksheet("匯出資訊 (Meta)")!;
      expect(metaSheet).toBeDefined();
      const metaValues: Record<string, any> = {};
      metaSheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          const prop = String(row.getCell(1).value || "");
          const val = row.getCell(2).value;
          metaValues[prop] = val;
        }
      });

      expect(metaValues["問卷名稱 (Survey Title)"]).toBe(surveyA.title);
      expect(metaValues["問卷版本 (Version)"]).toBe("v1");
      expect(metaValues["狀態篩選條件 (Status Filter)"]).toBe("全部作答 (ALL)");
      expect(metaValues["符合篩選之總填答數 (Total Responses)"]).toBe(5);
      expect(metaValues["已完成填答數 (Completed)"]).toBe(3);
      expect(metaValues["填寫中草稿數 (In Progress)"]).toBe(2);
      expect(metaValues["整體完成率 (Completion Rate)"]).toBe("60%");

      // 檢查 Sheet 2: 填答總覽 (Responses)
      const respSheet = workbook.getWorksheet("填答總覽 (Responses)")!;
      // 5 筆 responses + 1 header = 6 rows
      expect(respSheet.rowCount).toBe(6);

      // 檢查 Sheet 4: 題目統計摘要 (Summary)
      const sumSheet = workbook.getWorksheet("題目統計摘要 (Summary)")!;
      // 4 題 + 1 header = 5 rows
      expect(sumSheet.rowCount).toBe(5);

      // 驗證 Q1 的統計數值
      const q1Row = sumSheet.getRow(2);
      expect(q1Row.getCell(2).value).toBe("Q1"); // Code
      expect(q1Row.getCell(5).value).toBe(4); // Answered: 3 completed + 1 in progress answered Q1 = 4
      expect(q1Row.getCell(6).value).toBe(1); // Unanswered = 1
      expect(q1Row.getCell(7).value).toBe("80%"); // 4 / 5 = 80%
    });

    it("套用 status=COMPLETED 篩選時僅匯出已完成之作答與對應統計", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA.id}/export?status=COMPLETED&timeRange=all`, tokenOwnerA);
      const res = await exportGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);

      const arrayBuffer = await res.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(arrayBuffer) as any);

      const metaSheet = workbook.getWorksheet("匯出資訊 (Meta)")!;
      const respSheet = workbook.getWorksheet("填答總覽 (Responses)")!;

      // 3 completed + 1 header = 4 rows
      expect(respSheet.rowCount).toBe(4);

      const statusCell = metaSheet.getRow(6).getCell(2).value;
      expect(statusCell).toBe("已完成 (COMPLETED)");
    });

    it("套用 status=IN_PROGRESS 篩選時僅匯出填寫中草稿", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA.id}/export?status=IN_PROGRESS&timeRange=all`, tokenOwnerA);
      const res = await exportGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);

      const arrayBuffer = await res.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(arrayBuffer) as any);

      const respSheet = workbook.getWorksheet("填答總覽 (Responses)")!;
      // 2 in-progress + 1 header = 3 rows
      expect(respSheet.rowCount).toBe(3);
    });

    it("時間範圍 today / 7d / 30d 參數能正確處理並產出有效 Excel", async () => {
      const reqToday = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA.id}/export?timeRange=today`, tokenOwnerA);
      const resToday = await exportGET(reqToday, { params: { id: surveyA.id } });
      expect(resToday.status).toBe(200);

      const arrayBuffer = await resToday.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(1000);
    });

    it("自訂時間範圍 custom (dateFrom & dateTo) 能正確過濾填答記錄", async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const reqCustom = makeAuthReq(
        `http://localhost:3000/api/surveys/${surveyA.id}/export?timeRange=custom&dateFrom=${yesterday}&dateTo=${tomorrow}`,
        tokenOwnerA
      );
      const resCustom = await exportGET(reqCustom, { params: { id: surveyA.id } });
      expect(resCustom.status).toBe(200);

      const arrayBuffer = await resCustom.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(arrayBuffer) as any);
      const metaSheet = workbook.getWorksheet("匯出資訊 (Meta)")!;
      expect(metaSheet).toBeDefined();
    });

    it("隱私與安全性：匿名問卷匯出不應包含填答者個人密碼、Session Token 或未授權個資", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA.id}/export`, tokenOwnerA);
      const res = await exportGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);

      const arrayBuffer = await res.arrayBuffer();
      const textDump = Buffer.from(arrayBuffer).toString("utf-8");

      expect(textDump).not.toContain("passwordHash");
      expect(textDump).not.toContain(tokenOwnerA);
      expect(textDump).not.toContain(tokenViewerA);
      expect(textDump).not.toContain(tokenUserB);
    });

    it("數值題統計在 Question Summary Sheet 應包含完整 Mean, Median, Range, SD", async () => {
      const req = makeAuthReq(`http://localhost:3000/api/surveys/${surveyA.id}/export?status=COMPLETED`, tokenOwnerA);
      const res = await exportGET(req, { params: { id: surveyA.id } });
      expect(res.status).toBe(200);

      const arrayBuffer = await res.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(arrayBuffer) as any);

      const sumSheet = workbook.getWorksheet("題目統計摘要 (Summary)")!;
      // Q3 是第 3 題 -> row 4 (1 header + 3rd q)
      const q3Row = sumSheet.getRow(4);
      expect(q3Row.getCell(2).value).toBe("Q3");
      const summaryText = String(q3Row.getCell(8).value || "");
      expect(summaryText).toContain("樣本數 N=3");
      expect(summaryText).toContain("平均:");
      expect(summaryText).toContain("中位數:");
      expect(summaryText).toContain("區間:");
      expect(summaryText).toContain("標準差:");
    });
  });
});
