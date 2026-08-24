import { describe, it, expect } from "vitest";
import {
  analyzeCrossTabulation,
  analyzeCrossTabStatistics,
  applyCrossTabPrivacy,
} from "../../src/lib/analytics";
import { QuestionMeta, RawResponseData } from "../../src/lib/analytics/types";

describe("Phase M9-G.8: Release Regression Freeze & Golden Fixture Suite", () => {
  // Golden Fixture 1: 經典 2x2 列聯表 (統計教科書標準資料集)
  // Row: 性別 (男/女) | Col: 購買意願 (是/否)
  // [50, 30] (Row 1 sum = 80)
  // [20, 40] (Row 2 sum = 60)
  // Col 1 sum = 70, Col 2 sum = 70, Grand Total = 140
  // χ² 計算值: 140 * (50*40 - 30*20)^2 / (80 * 60 * 70 * 70) = 140 * 1960000 / 23520000 = 11.6667
  // df = 1, p-value ≈ 0.000636, Cramér's V = sqrt(11.6667 / 140) = 0.2887
  describe("1. Golden Fixture: Classical 2×2 Contingency Table", () => {
    const qGender: QuestionMeta = {
      id: "q_g",
      code: "Q1",
      orderNum: 1,
      title: "性別",
      questionType: "single_choice",
      required: true,
      scoringEnabled: false,
      choices: [
        { id: "m", orderNum: 1, value: "m", label: "男" },
        { id: "f", orderNum: 2, value: "f", label: "女" },
      ],
    };

    const qBuy: QuestionMeta = {
      id: "q_b",
      code: "Q2",
      orderNum: 2,
      title: "購買意願",
      questionType: "single_choice",
      required: true,
      scoringEnabled: false,
      choices: [
        { id: "yes", orderNum: 1, value: "yes", label: "是" },
        { id: "no", orderNum: 2, value: "no", label: "否" },
      ],
    };

    const makeResps = (): RawResponseData[] => {
      const list: RawResponseData[] = [];
      let c = 1;
      const add = (g: string, b: string, n: number) => {
        for (let i = 0; i < n; i++) {
          list.push({
            id: `r_${c++}`,
            status: "COMPLETED",
            answers: [
              { questionId: "q_g", rawValue: JSON.stringify(g) },
              { questionId: "q_b", rawValue: JSON.stringify(b) },
            ],
          });
        }
      };
      add("m", "yes", 50);
      add("m", "no", 30);
      add("f", "yes", 20);
      add("f", "no", 40);
      return list;
    };

    it("Golden 2×2 聚合與統計檢定數值必須精確對齊黃金標準", () => {
      const resps = makeResps();
      const rawCrosstab = analyzeCrossTabulation(qGender, qBuy, resps);
      const stats = analyzeCrossTabStatistics(rawCrosstab);
      rawCrosstab.statistics = stats;
      const protectedRes = applyCrossTabPrivacy(rawCrosstab, { minCellSize: 5 });

      // 驗證母體數與各格次數
      expect(protectedRes.grandTotal).toBe(140);
      expect(protectedRes.matrix[0][0].count).toBe(50);
      expect(protectedRes.matrix[0][1].count).toBe(30);
      expect(protectedRes.matrix[1][0].count).toBe(20);
      expect(protectedRes.matrix[1][1].count).toBe(40);

      // 驗證統計值 (Frozen Golden Snapshot)
      expect(stats.degreesOfFreedom).toBe(1);
      expect(stats.chiSquare).not.toBeNull();
      expect(stats.chiSquare!).toBeCloseTo(11.6667, 3);
      expect(stats.pValue).not.toBeNull();
      expect(stats.pValue!).toBeCloseTo(0.000636, 4);
      expect(stats.pValue! < 0.05).toBe(true);
      expect(stats.cramersV).not.toBeNull();
      expect(stats.cramersV!).toBeCloseTo(0.2887, 3);
      expect(stats.cellsBelowExpectedThreshold).toBe(0);
    });
  });

  describe("2. Golden Fixture: Multiple-Choice Independence Exemption", () => {
    it("題目包含多選題時，嚴格凍結為描述性分析，禁止產生卡方檢定值", () => {
      const qMul: QuestionMeta = {
        id: "q_hobby",
        code: "Q_HOBBY",
        orderNum: 1,
        title: "興趣 (多選)",
        questionType: "multiple_choice",
        required: true,
        scoringEnabled: false,
        choices: [
          { id: "h1", orderNum: 1, value: "read", label: "閱讀" },
          { id: "h2", orderNum: 2, value: "sport", label: "運動" },
        ],
      };

      const qDept: QuestionMeta = {
        id: "q_d",
        code: "Q_DEPT",
        orderNum: 2,
        title: "部門",
        questionType: "single_choice",
        required: true,
        scoringEnabled: false,
        choices: [
          { id: "d1", orderNum: 1, value: "hr", label: "人資" },
          { id: "d2", orderNum: 2, value: "it", label: "資訊" },
        ],
      };

      const responses: RawResponseData[] = [
        {
          id: "r1",
          status: "COMPLETED",
          answers: [
            { questionId: "q_d", rawValue: JSON.stringify(["hr"]) },
            { questionId: "q_hobby", rawValue: JSON.stringify(["read", "sport"]) },
          ],
        },
      ];

      const raw = analyzeCrossTabulation(qDept, qMul, responses);
      const stats = analyzeCrossTabStatistics(raw);

      expect(stats.chiSquare).toBeNull();
      expect(stats.pValue).toBeNull();
      expect(stats.cramersV).toBeNull();
      expect(stats.isTestValid).toBe(false);
      expect(stats.warning).toContain("多選");
    });
  });

  describe("3. Golden DTO Schema Freeze", () => {
    it("ProtectedCrossTabResult DTO 結構欄位完整性凍結", () => {
      const qA: QuestionMeta = {
        id: "qa",
        code: "QA",
        orderNum: 1,
        title: "QA",
        questionType: "single_choice",
        required: true,
        scoringEnabled: false,
        choices: [{ id: "o1", orderNum: 1, value: "1", label: "一" }],
      };
      const qB: QuestionMeta = {
        id: "qb",
        code: "QB",
        orderNum: 2,
        title: "QB",
        questionType: "single_choice",
        required: true,
        scoringEnabled: false,
        choices: [{ id: "o2", orderNum: 1, value: "2", label: "二" }],
      };

      const raw = analyzeCrossTabulation(qA, qB, []);
      const stats = analyzeCrossTabStatistics(raw);
      raw.statistics = stats;
      const dto = applyCrossTabPrivacy(raw, { minCellSize: 5 });

      // 檢查所有核心欄位存在
      expect(dto).toHaveProperty("rowQuestion");
      expect(dto).toHaveProperty("colQuestion");
      expect(dto).toHaveProperty("rowItems");
      expect(dto).toHaveProperty("colItems");
      expect(dto).toHaveProperty("matrix");
      expect(dto).toHaveProperty("grandTotal");
      expect(dto).toHaveProperty("grandTotalDisplay");
      expect(dto).toHaveProperty("totalResponses");
      expect(dto).toHaveProperty("unpairedCount");
      expect(dto).toHaveProperty("statistics");
      expect(dto).toHaveProperty("privacy");
    });
  });
});
