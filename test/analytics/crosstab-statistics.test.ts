import { describe, it, expect } from "vitest";
import {
  analyzeCrossTabStatistics,
  calculateChiSquarePValue,
  logGamma,
} from "../../src/lib/analytics/crosstab-statistics";
import { analyzeCrossTabulation } from "../../src/lib/analytics/crosstab-engine";
import { QuestionMeta, RawResponseData } from "../../src/lib/analytics/types";

describe("Phase M9-F.2: Pure Function Cross-tabulation Statistical Engine Suite", () => {
  // 1. 定義標準題目
  const qGender: QuestionMeta = {
    id: "q-gender",
    code: "Q1",
    orderNum: 1,
    title: "性別 (單選)",
    questionType: "single_choice",
    required: true,
    scoringEnabled: false,
    choices: [
      { id: "c-male", orderNum: 1, label: "男性", value: "male" },
      { id: "c-female", orderNum: 2, label: "女性", value: "female" },
    ],
  };

  const qSatisfaction: QuestionMeta = {
    id: "q-sat",
    code: "Q2",
    orderNum: 2,
    title: "滿意度 (單選)",
    questionType: "single_choice",
    required: true,
    scoringEnabled: false,
    choices: [
      { id: "c-sat", orderNum: 1, label: "滿意", value: "sat" },
      { id: "c-unsat", orderNum: 2, label: "不滿意", value: "unsat" },
    ],
  };

  const qDept3: QuestionMeta = {
    id: "q-dept",
    code: "Q3",
    orderNum: 3,
    title: "部門 (3選項)",
    questionType: "single_choice",
    required: true,
    scoringEnabled: false,
    choices: [
      { id: "c-rd", orderNum: 1, label: "研發", value: "rd" },
      { id: "c-sales", orderNum: 2, label: "業務", value: "sales" },
      { id: "c-mkt", orderNum: 3, label: "行銷", value: "mkt" },
    ],
  };

  const qRating3: QuestionMeta = {
    id: "q-rate",
    code: "Q4",
    orderNum: 4,
    title: "評價 (3選項)",
    questionType: "single_choice",
    required: true,
    scoringEnabled: false,
    choices: [
      { id: "c-high", orderNum: 1, label: "高", value: "high" },
      { id: "c-mid", orderNum: 2, label: "中", value: "mid" },
      { id: "c-low", orderNum: 3, label: "低", value: "low" },
    ],
  };

  const qMultiChannels: QuestionMeta = {
    id: "q-multi",
    code: "Q5",
    orderNum: 5,
    title: "多選管道",
    questionType: "multiple_choice",
    required: false,
    scoringEnabled: false,
    choices: [
      { id: "c-fb", orderNum: 1, label: "FB", value: "fb" },
      { id: "c-ig", orderNum: 2, label: "IG", value: "ig" },
    ],
  };

  describe("1. 基礎數值函數與卡方 p-value 檢定", () => {
    it("logGamma 運算精度正常", () => {
      // Γ(1) = 1 -> ln(1) = 0
      expect(Math.abs(logGamma(1))).toBeLessThan(1e-10);
      // Γ(5) = 4! = 24 -> ln(24) ≈ 3.1780538
      expect(Math.abs(logGamma(5) - Math.log(24))).toBeLessThan(1e-6);
    });

    it("calculateChiSquarePValue 與標準卡方分佈臨界值吻合", () => {
      // df = 1, χ² = 3.841 -> p ≈ 0.05
      const p1 = calculateChiSquarePValue(3.841, 1);
      expect(p1).toBeGreaterThanOrEqual(0.049);
      expect(p1).toBeLessThanOrEqual(0.051);

      // df = 4, χ² = 9.488 -> p ≈ 0.05
      const p4 = calculateChiSquarePValue(9.488, 4);
      expect(p4).toBeGreaterThanOrEqual(0.049);
      expect(p4).toBeLessThanOrEqual(0.051);

      // χ² = 0 -> p = 1.0
      expect(calculateChiSquarePValue(0, 1)).toBe(1.0);
    });
  });

  describe("2. 2×2 標準卡方獨立性檢定 (2×2 Contingency Table)", () => {
    it("明顯關聯之 2×2 矩陣：計算精確的 χ², df, p-value, Cramer's V 與期望值", () => {
      // 構建經典 2x2 矩陣：
      // Male: 40 sat, 10 unsat (Total = 50)
      // Female: 10 sat, 40 unsat (Total = 50)
      // Grand Total = 100
      // Expected: Male Sat = 25, Male Unsat = 25, Female Sat = 25, Female Unsat = 25
      // diff = 15 -> (15^2 / 25) * 4 = (225 / 25) * 4 = 9 * 4 = 36.0
      // df = (2-1)*(2-1) = 1
      // V = sqrt(36 / (100 * 1)) = sqrt(0.36) = 0.6
      const responses: RawResponseData[] = [];

      for (let i = 0; i < 40; i++) {
        responses.push({
          id: `r-m-sat-${i}`,
          status: "COMPLETED",
          answers: [
            { questionId: qGender.id, rawValue: JSON.stringify("male") },
            { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") },
          ],
        });
      }
      for (let i = 0; i < 10; i++) {
        responses.push({
          id: `r-m-unsat-${i}`,
          status: "COMPLETED",
          answers: [
            { questionId: qGender.id, rawValue: JSON.stringify("male") },
            { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") },
          ],
        });
      }
      for (let i = 0; i < 10; i++) {
        responses.push({
          id: `r-f-sat-${i}`,
          status: "COMPLETED",
          answers: [
            { questionId: qGender.id, rawValue: JSON.stringify("female") },
            { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") },
          ],
        });
      }
      for (let i = 0; i < 40; i++) {
        responses.push({
          id: `r-f-unsat-${i}`,
          status: "COMPLETED",
          answers: [
            { questionId: qGender.id, rawValue: JSON.stringify("female") },
            { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") },
          ],
        });
      }

      const crossTab = analyzeCrossTabulation(qGender, qSatisfaction, responses);
      const stats = analyzeCrossTabStatistics(crossTab);

      expect(stats.sampleSize).toBe(100);
      expect(stats.degreesOfFreedom).toBe(1);
      expect(stats.chiSquare).toBe(36);
      expect(stats.pValue).toBeLessThan(0.0001);
      expect(stats.cramersV).toBe(0.6);
      expect(stats.minExpectedCount).toBe(25);
      expect(stats.cellsBelowExpectedThreshold).toBe(0);
      expect(stats.isTestValid).toBe(true);
      expect(stats.warning).toBeNull();
    });

    it("完全獨立之 2×2 矩陣：χ² = 0, p = 1.0, Cramer's V = 0", () => {
      // Male: 25 sat, 25 unsat
      // Female: 25 sat, 25 unsat
      const responses: RawResponseData[] = [];
      for (let i = 0; i < 25; i++) {
        responses.push({ id: `r1-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
        responses.push({ id: `r2-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });
        responses.push({ id: `r3-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
        responses.push({ id: `r4-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });
      }

      const crossTab = analyzeCrossTabulation(qGender, qSatisfaction, responses);
      const stats = analyzeCrossTabStatistics(crossTab);

      expect(stats.sampleSize).toBe(100);
      expect(stats.chiSquare).toBe(0);
      expect(stats.pValue).toBe(1.0);
      expect(stats.cramersV).toBe(0);
      expect(stats.isTestValid).toBe(true);
    });
  });

  describe("3. 2×3 與 3×3 矩陣檢定 (df = (r-1)(c-1))", () => {
    it("2×3 矩陣自由度 df 應等於 2", () => {
      // Gender (2) × Dept (3)
      const responses: RawResponseData[] = [];
      ["male", "female"].forEach((g) => {
        ["rd", "sales", "mkt"].forEach((d) => {
          for (let i = 0; i < 10; i++) {
            responses.push({
              id: `r-${g}-${d}-${i}`,
              status: "COMPLETED",
              answers: [
                { questionId: qGender.id, rawValue: JSON.stringify(g) },
                { questionId: qDept3.id, rawValue: JSON.stringify(d) },
              ],
            });
          }
        });
      });

      const crossTab = analyzeCrossTabulation(qGender, qDept3, responses);
      const stats = analyzeCrossTabStatistics(crossTab);

      expect(stats.sampleSize).toBe(60);
      expect(stats.degreesOfFreedom).toBe(2); // (2-1) * (3-1) = 2
      expect(stats.chiSquare).toBe(0);
      expect(stats.cramersV).toBe(0);
    });

    it("3×3 矩陣自由度 df 應等於 4 且 Cramer's V 計算正確", () => {
      // Dept (3) × Rating (3)
      const responses: RawResponseData[] = [];
      // 建立強相關分佈: RD->High, Sales->Mid, Mkt->Low
      for (let i = 0; i < 30; i++) {
        responses.push({ id: `r-rd-${i}`, status: "COMPLETED", answers: [{ questionId: qDept3.id, rawValue: JSON.stringify("rd") }, { questionId: qRating3.id, rawValue: JSON.stringify("high") }] });
        responses.push({ id: `r-sales-${i}`, status: "COMPLETED", answers: [{ questionId: qDept3.id, rawValue: JSON.stringify("sales") }, { questionId: qRating3.id, rawValue: JSON.stringify("mid") }] });
        responses.push({ id: `r-mkt-${i}`, status: "COMPLETED", answers: [{ questionId: qDept3.id, rawValue: JSON.stringify("mkt") }, { questionId: qRating3.id, rawValue: JSON.stringify("low") }] });
      }

      const crossTab = analyzeCrossTabulation(qDept3, qRating3, responses);
      const stats = analyzeCrossTabStatistics(crossTab);

      expect(stats.sampleSize).toBe(90);
      expect(stats.degreesOfFreedom).toBe(4); // (3-1) * (3-1) = 4
      expect(stats.chiSquare).toBe(180); // 完全對角關聯
      expect(stats.pValue).toBeLessThan(0.0001);
      // V = sqrt(180 / (90 * (3 - 1))) = sqrt(180 / 180) = 1.0
      expect(stats.cramersV).toBe(1);
    });
  });

  describe("4. Cochran 規則與小樣本警示 (Small Sample & Expected Count Warnings)", () => {
    it("當期望值 E_ij < 5 時應標記 warning 且 isTestValid = false", () => {
      // 建立小樣本 2x2 矩陣 (N = 8)
      // Male: 3 sat, 1 unsat
      // Female: 1 sat, 3 unsat
      const responses: RawResponseData[] = [
        { id: "r1", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] },
        { id: "r2", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] },
        { id: "r3", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] },
        { id: "r4", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] },
        { id: "r5", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] },
        { id: "r6", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] },
        { id: "r7", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] },
        { id: "r8", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] },
      ];

      const crossTab = analyzeCrossTabulation(qGender, qSatisfaction, responses);
      const stats = analyzeCrossTabStatistics(crossTab);

      expect(stats.sampleSize).toBe(8);
      // E_ij = (4 * 4) / 8 = 2 < 5
      expect(stats.minExpectedCount).toBe(2);
      expect(stats.cellsBelowExpectedThreshold).toBe(4);
      expect(stats.percentageBelowExpectedThreshold).toBe(100);
      expect(stats.isTestValid).toBe(false);
      expect(stats.warning).toContain("期望值小於 5 的儲存格佔比過高");
    });
  });

  describe("5. 邊界與退化矩陣防護 (Edge Cases & Degenerate Tables)", () => {
    it("N = 0 或 N < 2 時回傳 null 指標並標記為無效檢定", () => {
      const crossTab0 = analyzeCrossTabulation(qGender, qSatisfaction, []);
      const stats0 = analyzeCrossTabStatistics(crossTab0);

      expect(stats0.sampleSize).toBe(0);
      expect(stats0.chiSquare).toBeNull();
      expect(stats0.pValue).toBeNull();
      expect(stats0.cramersV).toBeNull();
      expect(stats0.isTestValid).toBe(false);
    });

    it("某 Row 或 Column 全為 0 (有效類別 < 2) 時安全回傳 null 與警告", () => {
      // 只有 Male 有作答，Female 全為 0
      const responses: RawResponseData[] = [
        { id: "r1", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] },
        { id: "r2", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] },
      ];

      const crossTab = analyzeCrossTabulation(qGender, qSatisfaction, responses);
      const stats = analyzeCrossTabStatistics(crossTab);

      expect(stats.chiSquare).toBeNull();
      expect(stats.degreesOfFreedom).toBe(0);
      expect(stats.isTestValid).toBe(false);
      expect(stats.warning).toContain("有效維度類別數不足");
    });

    it("多選題 (Multiple Choice) 交叉分析時嚴格阻擋卡方檢定並給出明確警告", () => {
      const responses: RawResponseData[] = [
        {
          id: "r1",
          status: "COMPLETED",
          answers: [
            { questionId: qGender.id, rawValue: JSON.stringify("male") },
            { questionId: qMultiChannels.id, rawValue: JSON.stringify(["fb", "ig"]) },
          ],
        },
      ];

      const crossTab = analyzeCrossTabulation(qGender, qMultiChannels, responses);
      const stats = analyzeCrossTabStatistics(crossTab);

      expect(stats.chiSquare).toBeNull();
      expect(stats.pValue).toBeNull();
      expect(stats.cramersV).toBeNull();
      expect(stats.isTestValid).toBe(false);
      expect(stats.warning).toContain("多選題包含非互斥重複觀測值");
    });
  });
});
