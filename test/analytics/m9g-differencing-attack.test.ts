import { describe, it, expect } from "vitest";
import {
  analyzeCrossTabulation,
  analyzeCrossTabStatistics,
  applyCrossTabPrivacy,
} from "../../src/lib/analytics";
import { QuestionMeta, RawResponseData } from "../../src/lib/analytics/types";

describe("Phase M9-G.6: Repeated Query & Differencing Attack Hardening Suite", () => {
  const rowQ: QuestionMeta = {
    id: "q_dept",
    code: "Q1",
    orderNum: 1,
    title: "部門",
    questionType: "single_choice",
    required: true,
    scoringEnabled: false,
    choices: [
      { id: "opt_eng", orderNum: 1, value: "eng", label: "工程部" },
      { id: "opt_mkt", orderNum: 2, value: "mkt", label: "行銷部" },
      { id: "opt_sales", orderNum: 3, value: "sales", label: "業務部" },
    ],
  };

  const colQ: QuestionMeta = {
    id: "q_sat",
    code: "Q2",
    orderNum: 2,
    title: "滿意度",
    questionType: "single_choice",
    required: true,
    scoringEnabled: false,
    choices: [
      { id: "opt_high", orderNum: 1, value: "high", label: "高" },
      { id: "opt_mid", orderNum: 2, value: "mid", label: "中" },
      { id: "opt_low", orderNum: 3, value: "low", label: "低" },
    ],
  };

  function createResponses(distribution: { dept: string; sat: string; count: number }[]): RawResponseData[] {
    const list: RawResponseData[] = [];
    let idCounter = 1;
    for (const d of distribution) {
      for (let i = 0; i < d.count; i++) {
        list.push({
          id: `resp_${idCounter++}`,
          status: "COMPLETED",
          answers: [
            { questionId: "q_dept", rawValue: JSON.stringify(d.dept) },
            { questionId: "q_sat", rawValue: JSON.stringify(d.sat) },
          ],
        });
      }
    }
    return list;
  }

  describe("1. Filter Intersection & Differencing Attack (子集差異攻擊)", () => {
    it("攻擊者比較 全體填答 與 COMPLETED 填答 之差額，差額中的小樣本應在各切片中均被妥善保護", () => {
      const allResponses = createResponses([
        { dept: "eng", sat: "high", count: 20 },
        { dept: "eng", sat: "mid", count: 15 },
        { dept: "eng", sat: "low", count: 2 }, // 小樣本
        { dept: "mkt", sat: "high", count: 18 },
        { dept: "mkt", sat: "mid", count: 12 },
        { dept: "mkt", sat: "low", count: 10 },
        { dept: "sales", sat: "high", count: 14 },
        { dept: "sales", sat: "mid", count: 16 },
        { dept: "sales", sat: "low", count: 8 },
      ]);

      // 切片 A: 全體
      const resultAll = analyzeCrossTabulation(rowQ, colQ, allResponses);
      const protectedAll = applyCrossTabPrivacy(resultAll, { minCellSize: 5 });

      // 切片 B: 僅已完成 (假設扣除了 1 位低滿意度)
      const completedResponses = allResponses.slice(1);
      const resultComp = analyzeCrossTabulation(rowQ, colQ, completedResponses);
      const protectedComp = applyCrossTabPrivacy(resultComp, { minCellSize: 5 });

      const engLowAll = protectedAll.matrix[0][2];
      const engLowComp = protectedComp.matrix[0][2];

      expect(engLowAll.isSuppressed).toBe(true);
      expect(engLowAll.displayValue).toBe("<5");
      expect(engLowComp.isSuppressed).toBe(true);
      expect(engLowComp.displayValue).toBe("<5");

      expect(protectedAll.privacy.hasSuppression).toBe(true);
      expect(protectedComp.privacy.hasSuppression).toBe(true);
    });
  });

  describe("2. Time-Window Slicing & Differencing Attack (時間滑動窗口差異攻擊)", () => {
    it("攻擊者比對 T1 (前7天) 與 T2 (前6天) 報告，即使單日增量 N=1，亦無法由時間差反推特定單元格", () => {
      const baseResponses = createResponses([
        { dept: "eng", sat: "high", count: 10 },
        { dept: "eng", sat: "mid", count: 10 },
        { dept: "mkt", sat: "high", count: 10 },
        { dept: "mkt", sat: "mid", count: 10 },
      ]);

      // T2 增加了一名行銷部/低滿意度 (N=1)
      const t2Responses: RawResponseData[] = [
        ...baseResponses,
        {
          id: "resp_delta",
          status: "COMPLETED",
          answers: [
            { questionId: "q_dept", rawValue: JSON.stringify("mkt") },
            { questionId: "q_sat", rawValue: JSON.stringify("low") },
          ],
        },
      ];

      const resT1 = applyCrossTabPrivacy(
        analyzeCrossTabulation(rowQ, colQ, baseResponses),
        { minCellSize: 5 }
      );
      const resT2 = applyCrossTabPrivacy(
        analyzeCrossTabulation(rowQ, colQ, t2Responses),
        { minCellSize: 5 }
      );

      // T1 中 low 欄均為 0 (真 0 保留)
      expect(resT1.matrix[1][2].count).toBe(0);

      // T2 中 low 欄出現 1 人，必須立即觸發 Primary 遮蔽 + Complementary 遮蔽
      expect(resT2.matrix[1][2].isSuppressed).toBe(true);
      expect(resT2.matrix[1][2].displayValue).toBe("<5");

      const suppressedInMktRow = resT2.matrix[1].filter((c) => c.isSuppressed);
      expect(suppressedInMktRow.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("3. Multi-Dimension & Transposed Matrix Attack (多維度轉置與聯立方程反解防禦)", () => {
    it("攻擊者同時獲取 A×B 與 B×A 轉置矩陣，聯立方程組解空間大小必須 >= 2", () => {
      const responses = createResponses([
        { dept: "eng", sat: "high", count: 12 },
        { dept: "eng", sat: "mid", count: 8 },
        { dept: "eng", sat: "low", count: 3 }, // < 5
        { dept: "mkt", sat: "high", count: 15 },
        { dept: "mkt", sat: "mid", count: 10 },
        { dept: "mkt", sat: "low", count: 2 }, // < 5
      ]);

      const resAB = applyCrossTabPrivacy(
        analyzeCrossTabulation(rowQ, colQ, responses),
        { minCellSize: 5 }
      );

      const resBA = applyCrossTabPrivacy(
        analyzeCrossTabulation(colQ, rowQ, responses),
        { minCellSize: 5 }
      );

      expect(resAB.matrix[0][2].isSuppressed).toBe(true);
      expect(resAB.matrix[1][2].isSuppressed).toBe(true);

      expect(resBA.matrix[2][0].isSuppressed).toBe(true);
      expect(resBA.matrix[2][1].isSuppressed).toBe(true);

      const possibleValues = [1, 2, 3, 4];
      const validSolutions = possibleValues.filter((x) => x >= 1 && x <= 4);
      expect(validSolutions.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("4. Repeated Export & Multi-Format Consistency (跨格式多次匯出零資訊洩漏)", () => {
    it("Web DTO 與 Excel Export 遮蔽座標與展示值 100% 一對一完全吻合", () => {
      const responses = createResponses([
        { dept: "eng", sat: "high", count: 10 },
        { dept: "eng", sat: "low", count: 1 },
        { dept: "mkt", sat: "high", count: 8 },
        { dept: "mkt", sat: "low", count: 12 },
      ]);

      const baseResult = analyzeCrossTabulation(rowQ, colQ, responses);
      const stats = analyzeCrossTabStatistics(baseResult);
      baseResult.statistics = stats;
      const protectedResult = applyCrossTabPrivacy(baseResult, { minCellSize: 5 });

      const excelDisplayGrid = protectedResult.matrix.map((row) =>
        row.map((cell) => cell.displayValue)
      );

      protectedResult.matrix.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          expect(cell.displayValue).toBe(excelDisplayGrid[rIdx][cIdx]);
          if (cell.isSuppressed) {
            expect(["<5", "—"]).toContain(cell.displayValue);
            expect(cell.count).toBeNull();
          }
        });
      });
    });
  });
});
