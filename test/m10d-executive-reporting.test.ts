import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import { SurveyStatus, QuestionType, ResponseStatus, Role } from "@prisma/client";
import {
  hashPassword,
  createSession,
  generatePublicToken,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { NextRequest } from "next/server";
import {
  generateExecutiveReportDTO,
  buildExecutiveWorkbook,
  buildExecutiveCsv,
  REPORT_SCHEMA_VERSION,
  PRIVACY_POLICY_VERSION,
} from "../src/lib/report-engine";
import { ProtectedCrossTabResult } from "../src/lib/analytics";
import { GET as executiveReportGET } from "../src/app/api/surveys/[id]/reports/executive/route";
import { GET as reportExportGET } from "../src/app/api/surveys/[id]/reports/export/route";
import ExcelJS from "exceljs";

describe("Phase M10-D: Executive Reporting & Export Delivery", () => {
  let userOwnerA: any;
  let userEditorA: any;
  let userViewerA: any;
  let userTenantB: any;
  let orgA: any;
  let orgB: any;
  let tokenOwnerA: string;
  let tokenEditorA: string;
  let tokenViewerA: string;
  let tokenTenantB: string;

  const makeAuthReq = (url: string, token: string) => {
    return new NextRequest(url, {
      method: "GET",
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    });
  };

  beforeEach(async () => {
    await db.answerChoice.deleteMany({
      where: { answer: { response: { survey: { organization: { slug: { startsWith: "m10d-" } } } } } },
    });
    await db.answer.deleteMany({
      where: { response: { survey: { organization: { slug: { startsWith: "m10d-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m10d-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m10d-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m10d-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m10d-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m10d-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m10d-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m10d-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m10d-" } },
    });

    const defaultPwd = await hashPassword("M10DPassword123!");

    orgA = await db.organization.create({
      data: { name: "Reporting Org Alpha", slug: "m10d-org-alpha" },
    });
    orgB = await db.organization.create({
      data: { name: "Reporting Org Beta", slug: "m10d-org-beta" },
    });

    userOwnerA = await db.user.create({
      data: { email: "m10d-owner@alpha.com", name: "Owner Alpha", passwordHash: defaultPwd },
    });
    userEditorA = await db.user.create({
      data: { email: "m10d-editor@alpha.com", name: "Editor Alpha", passwordHash: defaultPwd },
    });
    userViewerA = await db.user.create({
      data: { email: "m10d-viewer@alpha.com", name: "Viewer Alpha", passwordHash: defaultPwd },
    });
    userTenantB = await db.user.create({
      data: { email: "m10d-tenant@beta.com", name: "Tenant Beta", passwordHash: defaultPwd },
    });

    await db.membership.create({
      data: { userId: userOwnerA.id, organizationId: orgA.id, role: Role.OWNER },
    });
    await db.membership.create({
      data: { userId: userEditorA.id, organizationId: orgA.id, role: Role.EDITOR },
    });
    await db.membership.create({
      data: { userId: userViewerA.id, organizationId: orgA.id, role: Role.VIEWER },
    });
    await db.membership.create({
      data: { userId: userTenantB.id, organizationId: orgB.id, role: Role.OWNER },
    });

    tokenOwnerA = (await createSession(userOwnerA.id)).token;
    tokenEditorA = (await createSession(userEditorA.id)).token;
    tokenViewerA = (await createSession(userViewerA.id)).token;
    tokenTenantB = (await createSession(userTenantB.id)).token;
  });

  describe("Gate D1: Report DTO Contract & Versioning", () => {
    it("產出明確版號 (v1.0.0) 且僅包含已 Sanitized 分析資料之 DTO", () => {
      const mockDto = generateExecutiveReportDTO({
        survey: {
          id: "s1",
          title: "企業滿意度調查",
          version: 1,
          status: SurveyStatus.PUBLISHED,
          organizationId: "org-1",
        },
        filter: {
          timeRange: "30d",
          dateFrom: null,
          dateTo: null,
          status: "COMPLETED",
        },
        kpis: {
          totalResponses: 100,
          completedResponses: 90,
          inProgressResponses: 10,
          completionRate: 90.0,
          averageDurationSeconds: 150,
          averageScore: 85.5,
          averagePercentage: 85.5,
          sampleAdequacy: "ADEQUATE",
        },
        insights: [
          {
            id: "i1",
            type: "HIGH_CONSENSUS",
            severity: "SUCCESS",
            title: "共識題",
            description: "80% 以上同意",
            relatedQuestionCodes: ["Q1"],
          },
        ],
        questions: [],
      });

      expect(mockDto.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
      expect(mockDto.audit.schemaVersion).toBe("v1.0.0");
      expect(mockDto.audit.privacyPolicyVersion).toBe(PRIVACY_POLICY_VERSION);
      expect(mockDto.audit.isSanitized).toBe(true);
      expect(mockDto.audit.minCellSize).toBe(5);
    });
  });

  describe("Gate D2 & D3: XLSX & CSV Export Parity (Strict Suppression & Zero Side-Channels)", () => {
    it("Excel 匯出中，抑制單元格嚴格輸出純字串 '*'，絕無公式或隱藏欄洩漏原始數值", async () => {
      const mockCrossTabWithSuppression: ProtectedCrossTabResult = {
        rowQuestion: { id: "q1", code: "DEPT", title: "部門", type: "single_choice" },
        colQuestion: { id: "q2", code: "SAT", title: "滿意度", type: "single_choice" },
        matrix: [
          [
            {
              rowChoiceValue: "DeptA",
              colChoiceValue: "High",
              count: null,
              displayValue: "*",
              isSuppressed: true,
              suppressionReason: "PRIMARY",
              rowPercentage: null,
              colPercentage: null,
              totalPercentage: null,
            },
            {
              rowChoiceValue: "DeptA",
              colChoiceValue: "Low",
              count: 20,
              displayValue: "20",
              isSuppressed: false,
              rowPercentage: 80,
              colPercentage: 50,
              totalPercentage: 20,
            },
          ],
        ],
        rowItems: [
          {
            value: "DeptA",
            label: "研發部",
            orderNum: 1,
            count: null,
            displayValue: "*",
            percentage: null,
            isSuppressed: true,
          },
        ],
        colItems: [
          {
            value: "High",
            label: "高",
            orderNum: 1,
            count: null,
            displayValue: "*",
            percentage: null,
            isSuppressed: true,
          },
          {
            value: "Low",
            label: "低",
            orderNum: 2,
            count: 20,
            displayValue: "20",
            percentage: 80,
            isSuppressed: false,
          },
        ],
        grandTotal: null,
        grandTotalDisplay: "*",
        unpairedCount: 0,
        unpairedCountDisplay: "0",
        totalResponses: 25,
        statistics: null,
        privacy: {
          minCellSize: 5,
          hasSuppression: true,
          primarySuppressedCount: 1,
          complementarySuppressedCount: 0,
          totalSuppressedCells: 1,
          statisticsDisplayable: false,
          privacyNotice: "樣本過少已隱藏",
        },
      };

      const reportDto = generateExecutiveReportDTO({
        survey: {
          id: "s1",
          title: "隱私一致性問卷",
          version: 1,
          status: SurveyStatus.PUBLISHED,
          organizationId: "org-1",
        },
        filter: { timeRange: "all", dateFrom: null, dateTo: null, status: "COMPLETED" },
        kpis: {
          totalResponses: 25,
          completedResponses: 25,
          inProgressResponses: 0,
          completionRate: 100,
          averageDurationSeconds: 60,
          averageScore: null,
          averagePercentage: null,
          sampleAdequacy: "ADEQUATE",
        },
        insights: [],
        questions: [],
        crossTab: mockCrossTabWithSuppression,
      });

      // 產生 Excel
      const workbook = await buildExecutiveWorkbook(reportDto);
      const crossSheet = workbook.getWorksheet("CrossTab_Matrix");
      expect(crossSheet).toBeDefined();

      // 檢查抑制單元格的值
      const row2 = crossSheet?.getRow(2);
      const suppressedCell = row2?.getCell(2); // DeptA - High
      expect(suppressedCell?.value).toBe("*");
      expect(typeof suppressedCell?.value).toBe("string");

      // 檢查 Audit 工作表絕無 PII
      const auditSheet = workbook.getWorksheet("Audit_Metadata");
      expect(auditSheet).toBeDefined();
      const auditRows = auditSheet?.getSheetValues() as any[];
      const auditContent = JSON.stringify(auditRows);
      expect(auditContent).not.toContain("m10d-owner@alpha.com");
      expect(auditContent).not.toContain("127.0.0.1");
      expect(auditContent).toContain("100% De-identified");
    });

    it("CSV 匯出正確 Escape 特殊字元與逗號，且抑制單元格不洩漏數值", () => {
      const reportDto = generateExecutiveReportDTO({
        survey: {
          id: "s1",
          title: '特殊字元問卷, 含有"引號"與逗號',
          version: 1,
          status: SurveyStatus.PUBLISHED,
          organizationId: "org-1",
        },
        filter: { timeRange: "all", dateFrom: null, dateTo: null, status: "COMPLETED" },
        kpis: {
          totalResponses: 50,
          completedResponses: 50,
          inProgressResponses: 0,
          completionRate: 100,
          averageDurationSeconds: 90,
          averageScore: null,
          averagePercentage: null,
          sampleAdequacy: "ADEQUATE",
        },
        insights: [
          {
            id: "i1",
            type: "HIGH_CONSENSUS",
            severity: "SUCCESS",
            title: "題目, 含有逗號",
            description: '描述"含有引號"',
            relatedQuestionCodes: ["Q1"],
          },
        ],
        questions: [
          {
            questionId: "q1",
            code: "Q1",
            orderNum: 1,
            title: "您的部門, 以及職級?",
            type: "single_choice",
            required: true,
            scoringEnabled: false,
            totalResponses: 50,
            answeredCount: 50,
            unansweredCount: 0,
            answerRate: 100,
            unansweredRate: 0,
            distribution: [
              { choiceId: "c1", label: '選項 "A", 研發', value: "opt_a", orderNum: 1, count: 50, percentage: 100 },
            ],
            statistics: null,
          },
        ],
      });

      const csv = buildExecutiveCsv(reportDto);
      expect(csv).toContain('""引號""');
      expect(csv).toContain('"特殊字元問卷, 含有""引號""與逗號"');
      expect(csv).toContain('"選項 ""A"", 研發"');
    });
  });

  describe("Gate D4: PDF / Print-safe Layout & Extreme Layout Resilience", () => {
    it("空資料、長題目與極端維度下，Report DTO 結構依然穩定不報錯", () => {
      const longTitle = "A".repeat(1000);
      const emptyReportDto = generateExecutiveReportDTO({
        survey: {
          id: "s-empty",
          title: longTitle,
          version: 1,
          status: SurveyStatus.PUBLISHED,
          organizationId: "org-1",
        },
        filter: { timeRange: "all", dateFrom: null, dateTo: null, status: "COMPLETED" },
        kpis: {
          totalResponses: 0,
          completedResponses: 0,
          inProgressResponses: 0,
          completionRate: 0,
          averageDurationSeconds: null,
          averageScore: null,
          averagePercentage: null,
          sampleAdequacy: "CRITICAL_LOW",
        },
        insights: [],
        questions: [],
      });

      expect(emptyReportDto.kpis.sampleAdequacy).toBe("CRITICAL_LOW");
      expect(emptyReportDto.survey.title.length).toBe(1000);
      expect(emptyReportDto.audit.totalResponsesAnalyzed).toBe(0);
    });
  });

  describe("Gate D5: Privacy, RBAC & Multi-Tenant Boundaries", () => {
    it("同組織 VIEWER 可查閱 Executive JSON 報告 (200 OK)，但匯出端點被拒絕 (403 Forbidden)", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "RBAC 報告驗證問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
        },
      });

      // 1. Viewer 檢視報告 -> 200 OK
      const viewReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/executive`, tokenViewerA);
      const viewRes = await executiveReportGET(viewReq, { params: { id: survey.id } });
      expect(viewRes.status).toBe(200);

      // 2. Viewer 匯出報告 -> 403 Forbidden
      const exportReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/export?format=xlsx`, tokenViewerA);
      const exportRes = await reportExportGET(exportReq, { params: { id: survey.id } });
      expect(exportRes.status).toBe(403);
    });

    it("同組織 EDITOR / OWNER 可正常執行 XLSX 與 CSV 匯出 (200 OK)", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "Editor 匯出驗證問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
          questions: {
            create: [
              {
                code: "Q1",
                title: "題目一",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: { create: [{ label: "選項 1", value: "opt_1", orderNum: 1 }] },
              },
            ],
          },
        },
      });

      // 1. Editor 匯出 XLSX -> 200 OK
      const xlsxReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/export?format=xlsx`, tokenEditorA);
      const xlsxRes = await reportExportGET(xlsxReq, { params: { id: survey.id } });
      expect(xlsxRes.status).toBe(200);
      expect(xlsxRes.headers.get("Content-Type")).toContain("spreadsheetml.sheet");

      // 2. Owner 匯出 CSV -> 200 OK
      const csvReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/export?format=csv`, tokenOwnerA);
      const csvRes = await reportExportGET(csvReq, { params: { id: survey.id } });
      expect(csvRes.status).toBe(200);
      expect(csvRes.headers.get("Content-Type")).toContain("text/csv");
    });

    it("跨租戶請求報告或匯出均嚴格回傳 403 Forbidden，未登入回傳 401 Unauthorized", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "租戶隔離測試問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
        },
      });

      // 1. 跨租戶 Tenant B 存取 Executive Report -> 403
      const crossReq1 = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/executive`, tokenTenantB);
      const crossRes1 = await executiveReportGET(crossReq1, { params: { id: survey.id } });
      expect(crossRes1.status).toBe(403);

      // 2. 跨租戶 Tenant B 存取 Export -> 403
      const crossReq2 = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/export`, tokenTenantB);
      const crossRes2 = await reportExportGET(crossReq2, { params: { id: survey.id } });
      expect(crossRes2.status).toBe(403);

      // 3. 未登入存取 -> 401
      const unauthReq = new NextRequest(`http://localhost/api/surveys/${survey.id}/reports/executive`, { method: "GET" });
      const unauthRes = await executiveReportGET(unauthReq, { params: { id: survey.id } });
      expect(unauthRes.status).toBe(401);
    });
  });

  describe("Gate D6: Full Pipeline Regression & Integration", () => {
    it("端到端執行完整報告產出與工作表解析驗證", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "端到端高階主管報告問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
          questions: {
            create: [
              {
                code: "Q1",
                title: "綜合評價",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: {
                  create: [
                    { label: "滿意", value: "opt_sat", orderNum: 1 },
                    { label: "不滿", value: "opt_unsat", orderNum: 2 },
                  ],
                },
              },
            ],
          },
        },
      });

      const q1 = await db.question.findFirst({ where: { surveyId: survey.id, code: "Q1" } });

      // 建立 10 筆 COMPLETED
      for (let i = 0; i < 10; i++) {
        const r = await db.response.create({
          data: {
            surveyId: survey.id,
            status: ResponseStatus.COMPLETED,
            durationSeconds: 45,
            submittedAt: new Date(),
          },
        });
        await db.answer.create({
          data: { responseId: r.id, questionId: q1!.id, rawValue: JSON.stringify("opt_sat") },
        });
      }

      // 執行 API 呼叫
      const req = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/executive`, tokenOwnerA);
      const res = await executiveReportGET(req, { params: { id: survey.id } });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.kpis.totalResponses).toBe(10);
      expect(json.kpis.completedResponses).toBe(10);
      expect(json.kpis.completionRate).toBe(100.0);
      expect(json.kpis.averageDurationSeconds).toBe(45);
      expect(json.audit.totalResponsesAnalyzed).toBe(10);
      expect(json.audit.schemaVersion).toBe("v1.0.0");
    });
  });
});
