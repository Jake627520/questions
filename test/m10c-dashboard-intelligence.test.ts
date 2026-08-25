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
  calculateExecutiveKPIs,
  generateAutomatedInsights,
  buildCellPresentation,
  aggregateResponseTimeline,
} from "../src/lib/dashboard-intelligence";
import { ProtectedCrossTabResult, ProtectedCrossTabCell } from "../src/lib/analytics";
import { GET as dashboardGET } from "../src/app/api/surveys/[id]/analytics/dashboard/route";

describe("Phase M10-C: Dashboard Intelligence (Presentation & Orchestration Layer)", () => {
  let userOwnerA: any;
  let userViewerA: any;
  let userTenantB: any;
  let orgA: any;
  let orgB: any;
  let tokenOwnerA: string;
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
      where: { answer: { response: { survey: { organization: { slug: { startsWith: "m10c-" } } } } } },
    });
    await db.answer.deleteMany({
      where: { response: { survey: { organization: { slug: { startsWith: "m10c-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m10c-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m10c-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m10c-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m10c-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m10c-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m10c-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m10c-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m10c-" } },
    });

    const defaultPwd = await hashPassword("M10CPassword123!");

    // 建立租戶與使用者
    orgA = await db.organization.create({
      data: { name: "Dashboard Intelligence Org A", slug: "m10c-org-a" },
    });
    orgB = await db.organization.create({
      data: { name: "Dashboard Intelligence Org B", slug: "m10c-org-b" },
    });

    userOwnerA = await db.user.create({
      data: { email: "m10c-owner@alpha.com", name: "Owner A", passwordHash: defaultPwd },
    });
    userViewerA = await db.user.create({
      data: { email: "m10c-viewer@alpha.com", name: "Viewer A", passwordHash: defaultPwd },
    });
    userTenantB = await db.user.create({
      data: { email: "m10c-tenant@beta.com", name: "Tenant B", passwordHash: defaultPwd },
    });

    await db.membership.create({
      data: { userId: userOwnerA.id, organizationId: orgA.id, role: Role.OWNER },
    });
    await db.membership.create({
      data: { userId: userViewerA.id, organizationId: orgA.id, role: Role.VIEWER },
    });
    await db.membership.create({
      data: { userId: userTenantB.id, organizationId: orgB.id, role: Role.OWNER },
    });

    const sessionOwnerA = await createSession(userOwnerA.id);
    tokenOwnerA = sessionOwnerA.token;

    const sessionViewerA = await createSession(userViewerA.id);
    tokenViewerA = sessionViewerA.token;

    const sessionTenantB = await createSession(userTenantB.id);
    tokenTenantB = sessionTenantB.token;
  });

  describe("Gate C1: Executive KPI Presentation Layer", () => {
    it("計算正確的完成率、平均耗時與樣本充足度指標", () => {
      const kpis = calculateExecutiveKPIs({
        totalResponses: 100,
        completedResponses: 85,
        inProgressResponses: 15,
        averageDurationSeconds: 124,
        averageScore: 88.64,
      });

      expect(kpis.totalResponses).toBe(100);
      expect(kpis.completedResponses).toBe(85);
      expect(kpis.inProgressResponses).toBe(15);
      expect(kpis.completionRate).toBe(85.0);
      expect(kpis.averageDurationSeconds).toBe(124);
      expect(kpis.averageScore).toBe(88.6);
      expect(kpis.sampleAdequacy).toBe("ADEQUATE");
    });

    it("低樣本數 (N < 10) 正確標記 LOW_SAMPLE，零樣本標記 CRITICAL_LOW", () => {
      const lowKpis = calculateExecutiveKPIs({
        totalResponses: 8,
        completedResponses: 5,
        inProgressResponses: 3,
      });
      expect(lowKpis.sampleAdequacy).toBe("LOW_SAMPLE");
      expect(lowKpis.completionRate).toBe(62.5);

      const zeroKpis = calculateExecutiveKPIs({
        totalResponses: 0,
        completedResponses: 0,
        inProgressResponses: 0,
      });
      expect(zeroKpis.sampleAdequacy).toBe("CRITICAL_LOW");
      expect(zeroKpis.completionRate).toBe(0);
    });
  });

  describe("Gate C2: Automated Insight Aggregation (Intelligence over Analytics)", () => {
    it("從既有 Question Analytics DTO 自動提取意見兩極化 (Polarized) 與高度共識 (Consensus) 洞察", () => {
      const mockQuestionsDto = [
        {
          code: "Q_POLAR",
          title: "員工彈性工時政策",
          statistics: {
            distributionSignal: "POLARIZED",
            standardDeviation: 1.45,
          },
        },
        {
          code: "Q_AGREE",
          title: "公司茶水間滿意度",
          distribution: [
            { label: "非常滿意", percentage: 85.0 },
            { label: "普通", percentage: 15.0 },
          ],
        },
      ];

      const insights = generateAutomatedInsights({
        questionAnalytics: mockQuestionsDto,
        completionRate: 90,
      });

      expect(insights.some((i) => i.type === "POLARIZED_DISTRIBUTION" && i.relatedQuestionCodes.includes("Q_POLAR"))).toBe(true);
      expect(insights.some((i) => i.type === "HIGH_CONSENSUS" && i.relatedQuestionCodes.includes("Q_AGREE"))).toBe(true);
    });

    it("從既有 ProtectedCrossTabResult DTO 提取卡方統計顯著性洞察", () => {
      const mockCrossTabResult: ProtectedCrossTabResult = {
        rowQuestion: { id: "q1", code: "Q1", title: "部門", type: "single_choice" },
        colQuestion: { id: "q2", code: "Q2", title: "滿意度", type: "single_choice" },
        matrix: [],
        rowItems: [],
        colItems: [],
        grandTotal: 100,
        grandTotalDisplay: "100",
        unpairedCount: 0,
        unpairedCountDisplay: "0",
        totalResponses: 100,
        statistics: {
          sampleSize: 100,
          chiSquare: 14.82,
          degreesOfFreedom: 2,
          pValue: 0.0006,
          isTestValid: true,
          cramersV: 0.38,
          expectedCounts: [],
          minExpectedCount: 10,
          cellsBelowExpectedThreshold: 0,
          percentageBelowExpectedThreshold: 0,
          warning: null,
        },
        privacy: {
          minCellSize: 5,
          hasSuppression: false,
          primarySuppressedCount: 0,
          complementarySuppressedCount: 0,
          totalSuppressedCells: 0,
          statisticsDisplayable: true,
          privacyNotice: null,
        },
      };

      const insights = generateAutomatedInsights({
        crossTabResult: mockCrossTabResult,
        completionRate: 95,
      });

      const chiInsight = insights.find((i) => i.type === "STATISTICAL_SIGNIFICANCE");
      expect(chiInsight).toBeDefined();
      expect(chiInsight?.description).toContain("χ²=14.82");
      expect(chiInsight?.metric).toBe("p < 0.001");
    });
  });

  describe("Gate C3: Cross-tab Presentation Matrix & Heatmap Normalization", () => {
    it("單元格在 COUNT / ROW_PERCENT / COL_PERCENT 模式下均保持數學一致性且熱圖強度介於 [0, 1]", () => {
      const cell: ProtectedCrossTabCell = {
        rowChoiceValue: "DepA",
        colChoiceValue: "High",
        count: 30,
        displayValue: "30",
        isSuppressed: false,
        rowPercentage: 60,
        colPercentage: 50,
        totalPercentage: 30,
      };

      const countModel = buildCellPresentation(cell, 50, 60, 100, "COUNT");
      expect(countModel.displayValue).toBe("30");
      expect(countModel.heatmapIntensity).toBe(0.3); // 30 / 100

      const rowModel = buildCellPresentation(cell, 50, 60, 100, "ROW_PERCENT");
      expect(rowModel.displayValue).toBe("60%"); // 30 / 50
      expect(rowModel.heatmapIntensity).toBe(0.6);

      const colModel = buildCellPresentation(cell, 50, 60, 100, "COL_PERCENT");
      expect(colModel.displayValue).toBe("50%"); // 30 / 60
      expect(colModel.heatmapIntensity).toBe(0.5);
    });
  });

  describe("Gate C4: Temporal Timeline Aggregation", () => {
    it("將 COMPLETED 作答時間戳記平滑聚合為連續日趨勢線與累計總數", () => {
      const now = new Date();
      const timestamps = [
        now,
        now,
        new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 昨天 1 筆
      ];

      const timeline = aggregateResponseTimeline(timestamps, 7);
      expect(timeline.length).toBe(7);
      const totalCount = timeline.reduce((acc, p) => acc + p.count, 0);
      expect(totalCount).toBe(3);
      expect(timeline[timeline.length - 1].cumulativeCount).toBe(3);
    });
  });

  describe("Gate C5: Dashboard RBAC & Multi-Tenant Isolation", () => {
    it("同組織 VIEWER 可正常唯讀存取儀表板 (200 OK)，跨租戶使用者嚴格 403 阻絕", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "Dashboard RBAC 驗證問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
        },
      });

      // 1. 同組織 VIEWER -> 200 OK
      const viewerReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/analytics/dashboard`, tokenViewerA);
      const viewerRes = await dashboardGET(viewerReq, { params: { id: survey.id } });
      expect(viewerRes.status).toBe(200);

      // 2. 跨租戶 Tenant B -> 403 Forbidden
      const tenantBReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/analytics/dashboard`, tokenTenantB);
      const tenantBRes = await dashboardGET(tenantBReq, { params: { id: survey.id } });
      expect(tenantBRes.status).toBe(403);
    });
  });

  describe("Gate C6: Privacy Preservation & Zero Suppression Side-Channels", () => {
    it("抑制單元格 (isSuppressed=true) 嚴格隱藏數值，Tooltips 與屬性零洩漏 (Zero Leaks)", () => {
      const suppressedCell: ProtectedCrossTabCell = {
        rowChoiceValue: "SmallTeam",
        colChoiceValue: "SecretChoice",
        count: null,
        displayValue: "*",
        isSuppressed: true,
        rowPercentage: null,
        colPercentage: null,
        totalPercentage: null,
      };

      const model = buildCellPresentation(suppressedCell, 10, 10, 100, "COUNT");
      expect(model.displayValue).toBe("*");
      expect(model.count).toBeNull();
      expect(model.percentage).toBeNull();
      expect(model.heatmapIntensity).toBe(0);
      expect(model.tooltip).toContain("已隱藏");
      expect(model.tooltip).not.toContain("次數:");
    });
  });

  describe("Gate C7: Full Dashboard API Integration", () => {
    it("端到端返回完整 Dashboard Intelligence DTO (含 KPI, Timeline, Insights 與 Questions Summary)", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "端到端儀表板整合問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
          questions: {
            create: [
              {
                code: "Q1",
                title: "體驗滿意度",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: {
                  create: [
                    { label: "極滿意", value: "opt_sat", orderNum: 1 },
                    { label: "普通", value: "opt_norm", orderNum: 2 },
                  ],
                },
              },
            ],
          },
        },
      });

      const q1 = await db.question.findFirst({ where: { surveyId: survey.id, code: "Q1" } });

      // 寫入 20 筆 COMPLETED 作答
      for (let i = 0; i < 20; i++) {
        const r = await db.response.create({
          data: {
            surveyId: survey.id,
            status: ResponseStatus.COMPLETED,
            durationSeconds: 60,
            totalScore: 90,
            submittedAt: new Date(),
          },
        });
        await db.answer.create({
          data: { responseId: r.id, questionId: q1!.id, rawValue: JSON.stringify("opt_sat") },
        });
      }

      // 寫入 5 筆 IN_PROGRESS 作答
      for (let i = 0; i < 5; i++) {
        await db.response.create({
          data: {
            surveyId: survey.id,
            status: ResponseStatus.IN_PROGRESS,
          },
        });
      }

      const req = makeAuthReq(`http://localhost/api/surveys/${survey.id}/analytics/dashboard?timeRange=30d`, tokenOwnerA);
      const res = await dashboardGET(req, { params: { id: survey.id } });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.survey.id).toBe(survey.id);
      expect(json.kpis.totalResponses).toBe(25); // 20 COMPLETED + 5 IN_PROGRESS
      expect(json.kpis.completedResponses).toBe(20);
      expect(json.kpis.inProgressResponses).toBe(5);
      expect(json.kpis.completionRate).toBe(80.0);
      expect(json.kpis.averageDurationSeconds).toBe(60);
      expect(json.timeline).toBeDefined();
      expect(Array.isArray(json.timeline)).toBe(true);
      expect(json.insights).toBeDefined();
      expect(Array.isArray(json.insights)).toBe(true);
    });
  });
});
