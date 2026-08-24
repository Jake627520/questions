import { describe, it, expect } from "vitest";
import { applyCrossTabPrivacy } from "../../src/lib/analytics/crosstab-privacy";
import { analyzeCrossTabulation } from "../../src/lib/analytics/crosstab-engine";
import { analyzeCrossTabStatistics } from "../../src/lib/analytics/crosstab-statistics";
import { QuestionMeta, RawResponseData } from "../../src/lib/analytics/types";

describe("Phase M9-F.3: Pure Function Cross-tabulation Privacy & Small-Cell Suppression Engine Suite", () => {
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

  describe("1. 基本門檻遮蔽與真 0 保留 (Primary Suppression & True Zero)", () => {
    it("所有 cells >= 5 時：完全不遮蔽，hasSuppression = false", () => {
      const responses: RawResponseData[] = [];
      // Male: 20 sat, 10 unsat
      // Female: 15 sat, 25 unsat
      for (let i = 0; i < 20; i++) responses.push({ id: `r1-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 10; i++) responses.push({ id: `r2-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });
      for (let i = 0; i < 15; i++) responses.push({ id: `r3-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 25; i++) responses.push({ id: `r4-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });

      const crossTab = analyzeCrossTabulation(qGender, qSatisfaction, responses);
      const protectedResult = applyCrossTabPrivacy(crossTab);

      expect(protectedResult.privacy.hasSuppression).toBe(false);
      expect(protectedResult.privacy.totalSuppressedCells).toBe(0);
      expect(protectedResult.matrix[0][0].displayValue).toBe("20");
      expect(protectedResult.matrix[0][0].count).toBe(20);
      expect(protectedResult.matrix[0][0].isSuppressed).toBe(false);
      expect(protectedResult.grandTotal).toBe(70);
      expect(protectedResult.grandTotalDisplay).toBe("70");
    });

    it("cell = 5 臨界值不遮蔽；cell = 4 與 cell = 1 觸發一級遮蔽 (<5)", () => {
      // 構建:
      // Male: 5 sat (剛好臨界不遮蔽), 4 unsat (一級遮蔽)
      // Female: 20 sat, 20 unsat
      const responses: RawResponseData[] = [];
      for (let i = 0; i < 5; i++) responses.push({ id: `r1-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 4; i++) responses.push({ id: `r2-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });
      for (let i = 0; i < 20; i++) responses.push({ id: `r3-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 20; i++) responses.push({ id: `r4-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });

      const crossTab = analyzeCrossTabulation(qGender, qSatisfaction, responses);
      const protectedResult = applyCrossTabPrivacy(crossTab, { enableComplementarySuppression: false });

      // Male-Sat = 5 -> 不遮蔽
      expect(protectedResult.matrix[0][0].isSuppressed).toBe(false);
      expect(protectedResult.matrix[0][0].displayValue).toBe("5");
      expect(protectedResult.matrix[0][0].count).toBe(5);

      // Male-Unsat = 4 -> PRIMARY 遮蔽
      expect(protectedResult.matrix[0][1].isSuppressed).toBe(true);
      expect(protectedResult.matrix[0][1].suppressionReason).toBe("PRIMARY");
      expect(protectedResult.matrix[0][1].displayValue).toBe("<5");
      expect(protectedResult.matrix[0][1].count).toBeNull();
      expect(protectedResult.matrix[0][1].rowPercentage).toBeNull();
    });

    it("真 0 (cell.count === 0) 保持為 '0'，不與 '<5' 混淆", () => {
      // Male: 10 sat, 0 unsat
      // Female: 10 sat, 10 unsat
      const responses: RawResponseData[] = [];
      for (let i = 0; i < 10; i++) responses.push({ id: `r1-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 10; i++) responses.push({ id: `r3-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 10; i++) responses.push({ id: `r4-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });

      const crossTab = analyzeCrossTabulation(qGender, qSatisfaction, responses);
      const protectedResult = applyCrossTabPrivacy(crossTab);

      // Male-Unsat count = 0 -> 顯示 '0', isSuppressed = false
      expect(protectedResult.matrix[0][1].count).toBe(0);
      expect(protectedResult.matrix[0][1].displayValue).toBe("0");
      expect(protectedResult.matrix[0][1].isSuppressed).toBe(false);
      expect(protectedResult.privacy.hasSuppression).toBe(false);
    });
  });

  describe("2. 補償遮蔽防止逆向反推 (Complementary Suppression)", () => {
    it("Row 中僅有 1 個 Primary 遮蔽格時，自動對同 Row 最小非零格執行二級補償遮蔽 ('—')", () => {
      // 2x2 Matrix:
      // Male: 20 sat, 2 unsat (Total = 22) -> unsat 觸發 PRIMARY(<5)
      // 若 sat 不遮蔽，攻擊者可用 22 - 20 = 2 逆向推導！
      // 因此 sat 必須被標記為 COMPLEMENTARY(—)
      // Female: 30 sat, 30 unsat (Total = 60)
      // Male sat (COMPLEMENTARY) 使得 sat Column 也僅有 1 個遮蔽格，進而對 Female sat 也進行 Column 補償遮蔽
      const responses: RawResponseData[] = [];
      for (let i = 0; i < 20; i++) responses.push({ id: `r1-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 2; i++) responses.push({ id: `r2-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });
      for (let i = 0; i < 30; i++) responses.push({ id: `r3-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 30; i++) responses.push({ id: `r4-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });

      const crossTab = analyzeCrossTabulation(qGender, qSatisfaction, responses);
      const protectedResult = applyCrossTabPrivacy(crossTab, { enableComplementarySuppression: true });

      // Male-Unsat: PRIMARY (<5)
      expect(protectedResult.matrix[0][1].isSuppressed).toBe(true);
      expect(protectedResult.matrix[0][1].suppressionReason).toBe("PRIMARY");
      expect(protectedResult.matrix[0][1].displayValue).toBe("<5");

      // Male-Sat: COMPLEMENTARY (—)
      expect(protectedResult.matrix[0][0].isSuppressed).toBe(true);
      expect(protectedResult.matrix[0][0].suppressionReason).toBe("COMPLEMENTARY");
      expect(protectedResult.matrix[0][0].displayValue).toBe("—");

      expect(protectedResult.privacy.primarySuppressedCount).toBe(1);
      expect(protectedResult.privacy.complementarySuppressedCount).toBeGreaterThanOrEqual(1);
      expect(protectedResult.privacy.privacyNotice).toContain("部分儲存格因小樣本隱私保護規則");
    });

    it("3×2 矩陣中多格連鎖補償遮蔽正確收斂", () => {
      // Dept (3) × Satisfaction (2)
      // RD: 20 sat, 2 unsat (unsat = 2 < 5)
      // Sales: 30 sat, 40 unsat
      // Mkt: 50 sat, 50 unsat
      const responses: RawResponseData[] = [];
      for (let i = 0; i < 20; i++) responses.push({ id: `r1-${i}`, status: "COMPLETED", answers: [{ questionId: qDept3.id, rawValue: JSON.stringify("rd") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 2; i++) responses.push({ id: `r2-${i}`, status: "COMPLETED", answers: [{ questionId: qDept3.id, rawValue: JSON.stringify("rd") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });
      for (let i = 0; i < 30; i++) responses.push({ id: `r3-${i}`, status: "COMPLETED", answers: [{ questionId: qDept3.id, rawValue: JSON.stringify("sales") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 40; i++) responses.push({ id: `r4-${i}`, status: "COMPLETED", answers: [{ questionId: qDept3.id, rawValue: JSON.stringify("sales") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });
      for (let i = 0; i < 50; i++) responses.push({ id: `r5-${i}`, status: "COMPLETED", answers: [{ questionId: qDept3.id, rawValue: JSON.stringify("mkt") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 50; i++) responses.push({ id: `r6-${i}`, status: "COMPLETED", answers: [{ questionId: qDept3.id, rawValue: JSON.stringify("mkt") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });

      const crossTab = analyzeCrossTabulation(qDept3, qSatisfaction, responses);
      const protectedResult = applyCrossTabPrivacy(crossTab);

      // RD-Unsat is PRIMARY
      expect(protectedResult.matrix[0][1].suppressionReason).toBe("PRIMARY");
      // RD-Sat is COMPLEMENTARY
      expect(protectedResult.matrix[0][0].suppressionReason).toBe("COMPLEMENTARY");
      expect(protectedResult.privacy.hasSuppression).toBe(true);
    });
  });

  describe("3. 邊際維度與整體母體保護 (Marginal & Grand Total Protection)", () => {
    it("邊際選項人數 < 5 時，該選項 Total 自動遮蔽為 '<5'", () => {
      // 研發部僅有 3 人填答 (2 sat, 1 unsat)
      const responses: RawResponseData[] = [];
      for (let i = 0; i < 2; i++) responses.push({ id: `r1-${i}`, status: "COMPLETED", answers: [{ questionId: qDept3.id, rawValue: JSON.stringify("rd") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 1; i++) responses.push({ id: `r2-${i}`, status: "COMPLETED", answers: [{ questionId: qDept3.id, rawValue: JSON.stringify("rd") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });
      for (let i = 0; i < 20; i++) responses.push({ id: `r3-${i}`, status: "COMPLETED", answers: [{ questionId: qDept3.id, rawValue: JSON.stringify("sales") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 20; i++) responses.push({ id: `r4-${i}`, status: "COMPLETED", answers: [{ questionId: qDept3.id, rawValue: JSON.stringify("sales") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });

      const crossTab = analyzeCrossTabulation(qDept3, qSatisfaction, responses);
      const protectedResult = applyCrossTabPrivacy(crossTab);

      // RD Row total count = 3 < 5 -> isSuppressed = true, count = null, displayValue = "<5"
      const rdRowItem = protectedResult.rowItems.find((r) => r.value === "rd")!;
      expect(rdRowItem.isSuppressed).toBe(true);
      expect(rdRowItem.count).toBeNull();
      expect(rdRowItem.displayValue).toBe("<5");
      expect(rdRowItem.percentage).toBeNull();
    });

    it("整體母體 N < 5 時：grandTotal 遮蔽為 '<5'，且 statisticsDisplayable = false", () => {
      // 全卷僅有 3 人填答
      const responses: RawResponseData[] = [
        { id: "r1", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] },
        { id: "r2", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] },
        { id: "r3", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] },
      ];

      const crossTab = analyzeCrossTabulation(qGender, qSatisfaction, responses);
      crossTab.statistics = analyzeCrossTabStatistics(crossTab);

      const protectedResult = applyCrossTabPrivacy(crossTab);

      expect(protectedResult.grandTotal).toBeNull();
      expect(protectedResult.grandTotalDisplay).toBe("<5");
      expect(protectedResult.privacy.statisticsDisplayable).toBe(false);
      expect(protectedResult.privacy.hasSuppression).toBe(true);
    });

    it("N = 0 時安全處理，不引發異常，grandTotal = 0", () => {
      const crossTab0 = analyzeCrossTabulation(qGender, qSatisfaction, []);
      crossTab0.statistics = analyzeCrossTabStatistics(crossTab0);

      const protectedResult = applyCrossTabPrivacy(crossTab0);

      expect(protectedResult.grandTotal).toBe(0);
      expect(protectedResult.grandTotalDisplay).toBe("0");
      expect(protectedResult.privacy.hasSuppression).toBe(false);
      expect(protectedResult.privacy.statisticsDisplayable).toBe(false);
    });
  });

  describe("4. 統計指標保護與管線完整性 (Statistical Guard & Pipeline Integrity)", () => {
    it("隱私遮蔽不污染 F.2 統計檢定結果，原始 χ² 與 p-value 完整保留且附帶警語", () => {
      // 構建帶有小格子的矩陣：
      // Male: 40 sat, 3 unsat (unsat < 5)
      // Female: 10 sat, 40 unsat
      const responses: RawResponseData[] = [];
      for (let i = 0; i < 40; i++) responses.push({ id: `r-m-sat-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 3; i++) responses.push({ id: `r-m-unsat-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });
      for (let i = 0; i < 10; i++) responses.push({ id: `r-f-sat-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 40; i++) responses.push({ id: `r-f-unsat-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });

      const crossTab = analyzeCrossTabulation(qGender, qSatisfaction, responses);
      const stats = analyzeCrossTabStatistics(crossTab);
      crossTab.statistics = stats;

      // 套用隱私遮蔽
      const protectedResult = applyCrossTabPrivacy(crossTab);

      // 檢查矩陣確實已被遮蔽保護
      expect(protectedResult.matrix[0][1].isSuppressed).toBe(true);
      expect(protectedResult.matrix[0][1].displayValue).toBe("<5");

      // 檢查 F.2 統計指標完整保留（不受遮蔽 null 值破壞）
      expect(protectedResult.statistics).not.toBeNull();
      expect(protectedResult.statistics?.sampleSize).toBe(93);
      expect(protectedResult.statistics?.chiSquare).toBe(stats.chiSquare);
      expect(protectedResult.statistics?.pValue).toBe(stats.pValue);
      expect(protectedResult.statistics?.cramersV).toBe(stats.cramersV);

      // 附帶隱私揭露公告
      expect(protectedResult.privacy.hasSuppression).toBe(true);
      expect(protectedResult.privacy.privacyNotice).toContain("統計檢定結果基於完整內部資料計算");
    });

    it("自訂 minCellSize = 10 門檻測試", () => {
      // Male: 8 sat, 20 unsat (sat = 8 < 10)
      const responses: RawResponseData[] = [];
      for (let i = 0; i < 8; i++) responses.push({ id: `r1-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 20; i++) responses.push({ id: `r2-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });
      for (let i = 0; i < 20; i++) responses.push({ id: `r3-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("sat") }] });
      for (let i = 0; i < 20; i++) responses.push({ id: `r4-${i}`, status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfaction.id, rawValue: JSON.stringify("unsat") }] });

      const crossTab = analyzeCrossTabulation(qGender, qSatisfaction, responses);
      const protectedResult = applyCrossTabPrivacy(crossTab, { minCellSize: 10 });

      // Male-Sat = 8 < 10 -> PRIMARY 遮蔽 (<10)
      expect(protectedResult.matrix[0][0].displayValue).toBe("<10");
      expect(protectedResult.matrix[0][0].isSuppressed).toBe(true);
      expect(protectedResult.privacy.minCellSize).toBe(10);
    });
  });
});
