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
  recordExportAudit,
  cleanupExpiredExports,
  isExportExpired,
  calculateExportExpirationDate,
  DEFAULT_RETENTION_DAYS,
} from "../src/lib/report-governance";
import { GET as reportExportGET } from "../src/app/api/surveys/[id]/reports/export/route";
import { GET as reportHistoryGET } from "../src/app/api/surveys/[id]/reports/history/route";
import { GET as reportDownloadGET } from "../src/app/api/surveys/[id]/reports/downloads/[exportId]/route";

describe("Phase M10-E: Report Delivery & Governance", () => {
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
    await db.reportExport.deleteMany({
      where: { organization: { slug: { startsWith: "m10e-" } } },
    });
    await db.answerChoice.deleteMany({
      where: { answer: { response: { survey: { organization: { slug: { startsWith: "m10e-" } } } } } },
    });
    await db.answer.deleteMany({
      where: { response: { survey: { organization: { slug: { startsWith: "m10e-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m10e-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m10e-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m10e-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m10e-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m10e-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m10e-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m10e-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m10e-" } },
    });

    const defaultPwd = await hashPassword("M10EPassword123!");

    orgA = await db.organization.create({
      data: { name: "Governance Org Alpha", slug: "m10e-org-alpha" },
    });
    orgB = await db.organization.create({
      data: { name: "Governance Org Beta", slug: "m10e-org-beta" },
    });

    userOwnerA = await db.user.create({
      data: { email: "m10e-owner@alpha.com", name: "Owner Alpha", passwordHash: defaultPwd },
    });
    userEditorA = await db.user.create({
      data: { email: "m10e-editor@alpha.com", name: "Editor Alpha", passwordHash: defaultPwd },
    });
    userViewerA = await db.user.create({
      data: { email: "m10e-viewer@alpha.com", name: "Viewer Alpha", passwordHash: defaultPwd },
    });
    userTenantB = await db.user.create({
      data: { email: "m10e-tenant@beta.com", name: "Tenant Beta", passwordHash: defaultPwd },
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

  describe("Gate E1: Report Delivery & Download Center", () => {
    it("提供問卷層級之匯出歷史清單，支援分頁與中繼資料查詢", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "歷史報告問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
        },
      });

      // 建立 3 筆歷史紀錄
      for (let i = 1; i <= 3; i++) {
        await recordExportAudit({
          organizationId: orgA.id,
          surveyId: survey.id,
          actorId: userEditorA.id,
          actorRole: Role.EDITOR,
          format: i % 2 === 0 ? "csv" : "xlsx",
          timeRange: "30d",
        });
      }

      const req = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/history?page=1&limit=2`, tokenEditorA);
      const res = await reportHistoryGET(req, { params: { id: survey.id } });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.exports.length).toBe(2);
      expect(data.pagination.total).toBe(3);
      expect(data.pagination.totalPages).toBe(2);
      expect(data.exports[0].actorRole).toBe("EDITOR");
    });
  });

  describe("Gate E2: Export Audit Trail & Zero-PII Assertion", () => {
    it("匯出操作自動寫入審計，斷言審計表絕無填答者 Email / IP / Raw Answers / Response IDs", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "審計安全問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
          questions: {
            create: [
              {
                code: "Q1",
                title: "問題一",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: { create: [{ label: "A", value: "opt_a", orderNum: 1 }] },
              },
            ],
          },
        },
      });

      const q1 = await db.question.findFirst({ where: { surveyId: survey.id } });

      const resp = await db.response.create({
        data: {
          surveyId: survey.id,
          status: ResponseStatus.COMPLETED,
          ipHash: "hmac_secret_hash_value_123",
          submittedAt: new Date(),
        },
      });
      await db.answer.create({
        data: { responseId: resp.id, questionId: q1!.id, rawValue: JSON.stringify("opt_a") },
      });

      // 執行匯出
      const exportReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/export?format=xlsx`, tokenEditorA);
      const exportRes = await reportExportGET(exportReq, { params: { id: survey.id } });
      expect(exportRes.status).toBe(200);

      const exportId = exportRes.headers.get("X-Export-Id");
      expect(exportId).toBeTruthy();

      // 檢查 DB 中的 ReportExport 紀錄
      const audit = await db.reportExport.findUnique({ where: { id: exportId! } });
      expect(audit).toBeDefined();
      expect(audit?.actorId).toBe(userEditorA.id);
      expect(audit?.actorRole).toBe("EDITOR");
      expect(audit?.format).toBe("xlsx");
      expect(audit?.status).toBe("COMPLETED");

      // 嚴格 Zero-PII 斷言
      const auditStr = JSON.stringify(audit);
      expect(auditStr).not.toContain("hmac_secret_hash_value_123");
      expect(auditStr).not.toContain(resp.id);
      expect(auditStr).not.toContain("opt_a");
      expect(auditStr).not.toContain("m10e-owner@alpha.com");
    });
  });

  describe("Gate E3: Large Dataset & Timeout Guard", () => {
    it("分頁與查詢參數受到嚴格邊界保護 (上限 50 筆)", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "邊界防護問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
        },
      });

      // 請求 limit=500 -> 應自動限縮至 50
      const req = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/history?page=1&limit=500`, tokenEditorA);
      const res = await reportHistoryGET(req, { params: { id: survey.id } });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.pagination.limit).toBe(50);
    });
  });

  describe("Gate E4: Retention & Expiration Governance", () => {
    it("過期產物在下載時回傳 410 Gone，cleanupExpiredExports 支援冪等批次清理", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "生命週期問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
        },
      });

      // 建立一筆已過期的匯出紀錄 (expiresAt 設在過去)
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24); // 昨天
      const expiredExport = await db.reportExport.create({
        data: {
          organizationId: orgA.id,
          surveyId: survey.id,
          actorId: userEditorA.id,
          actorRole: Role.EDITOR,
          format: "xlsx",
          status: "COMPLETED",
          expiresAt: pastDate,
        },
      });

      // 1. 嘗試下載過期產物 -> 410 Gone
      const dlReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/downloads/${expiredExport.id}`, tokenEditorA);
      const dlRes = await reportDownloadGET(dlReq, { params: { id: survey.id, exportId: expiredExport.id } });
      expect(dlRes.status).toBe(410);

      const dlData = await dlRes.json();
      expect(dlData.error).toBe("ARTIFACT_EXPIRED");

      // 2. 執行冪等清理
      const cleanup1 = await cleanupExpiredExports();
      expect(cleanup1.markedExpiredCount).toBeGreaterThanOrEqual(1);

      const updatedRecord = await db.reportExport.findUnique({ where: { id: expiredExport.id } });
      expect(updatedRecord?.status).toBe("EXPIRED");

      // 3. 第二次執行清理 (冪等性驗證)
      const cleanup2 = await cleanupExpiredExports();
      expect(cleanup2.markedExpiredCount).toBe(0);
    });
  });

  describe("Gate E5: RBAC Governance Matrix & Download-time Authorization", () => {
    it("Viewer 僅能檢視但無法查詢歷史、發起匯出或下載產物 (403 Forbidden)", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "RBAC 治理驗證問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
        },
      });

      const audit = await recordExportAudit({
        organizationId: orgA.id,
        surveyId: survey.id,
        actorId: userEditorA.id,
        actorRole: Role.EDITOR,
        format: "xlsx",
      });

      // 1. Viewer 查閱歷史 -> 403
      const histReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/history`, tokenViewerA);
      const histRes = await reportHistoryGET(histReq, { params: { id: survey.id } });
      expect(histRes.status).toBe(403);

      // 2. Viewer 下載產物 -> 403
      const dlReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/downloads/${audit.id}`, tokenViewerA);
      const dlRes = await reportDownloadGET(dlReq, { params: { id: survey.id, exportId: audit.id } });
      expect(dlRes.status).toBe(403);
    });

    it("跨租戶存取歷史或下載產物嚴格回傳 403 Forbidden", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "跨租戶隔離問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
        },
      });

      const audit = await recordExportAudit({
        organizationId: orgA.id,
        surveyId: survey.id,
        actorId: userOwnerA.id,
        actorRole: Role.OWNER,
        format: "xlsx",
      });

      // 1. Tenant B 存取 Tenant A 歷史清單 -> 403
      const crossHistReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/history`, tokenTenantB);
      const crossHistRes = await reportHistoryGET(crossHistReq, { params: { id: survey.id } });
      expect(crossHistRes.status).toBe(403);

      // 2. Tenant B 下載 Tenant A 產物 -> 403
      const crossDlReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/downloads/${audit.id}`, tokenTenantB);
      const crossDlRes = await reportDownloadGET(crossDlReq, { params: { id: survey.id, exportId: audit.id } });
      expect(crossDlRes.status).toBe(403);
    });
  });

  describe("Gate E6: Full Pipeline Regression & Download Tracking", () => {
    it("有效產物下載成功 (200 OK) 且 downloadCount 自動遞增", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "端到端下載問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
          questions: {
            create: [
              {
                code: "Q1",
                title: "滿意度",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: { create: [{ label: "滿意", value: "opt_sat", orderNum: 1 }] },
              },
            ],
          },
        },
      });

      const audit = await recordExportAudit({
        organizationId: orgA.id,
        surveyId: survey.id,
        actorId: userEditorA.id,
        actorRole: Role.EDITOR,
        format: "csv",
      });
      expect(audit.downloadCount).toBe(0);

      // 執行下載
      const dlReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/reports/downloads/${audit.id}`, tokenEditorA);
      const dlRes = await reportDownloadGET(dlReq, { params: { id: survey.id, exportId: audit.id } });
      expect(dlRes.status).toBe(200);
      expect(dlRes.headers.get("Content-Type")).toContain("text/csv");
      expect(dlRes.headers.get("X-Download-Count")).toBe("1");

      const refreshed = await db.reportExport.findUnique({ where: { id: audit.id } });
      expect(refreshed?.downloadCount).toBe(1);
    });
  });
});
