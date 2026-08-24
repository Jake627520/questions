/**
 * Pure Function Cross-tabulation Privacy & Small-Cell Suppression Engine
 * Phase M9-F.3 (Privacy & Small-Cell Suppression Engine)
 *
 * 核心原則：
 * 1. 嚴格純函數：0 DB I/O、0 外部相依套件、純呈現層投影 (Projection Layer)。
 * 2. 一級遮蔽 (Primary Suppression)：0 < cell.count < minCellSize (預設 5) 之儲存格遮蔽為 "<5"。
 * 3. 真 0 區分 (True Zero Preservation)：count = 0 不屬於小樣本個人資料風險，保留真實 "0"。
 * 4. 補償遮蔽 (Complementary Suppression)：當某 Row 或 Column 僅存在 1 個被遮蔽格時，
 *    為防止透過邊際總數 (Row/Col Total) 減去其餘已知格反推原始值，自動挑選同行/列最小正數格進行二級遮蔽 ("—")。
 * 5. 邊際與母體保護 (Marginal & Grand Total Protection)：邊際總數若 < minCellSize 亦進行隱私遮蔽。
 * 6. 統計指標保護 (Statistical Disclosure Guard)：完整保留 F.2 於內部完整資料計算之統計結果，
 *    但若存在遮蔽則附帶隱私警語，並於極端小樣本下限制統計展示 (statisticsDisplayable: false)。
 */

import {
  CrossTabPrivacyOptions,
  CrossTabResult,
  ProtectedCrossTabCell,
  ProtectedCrossTabDimensionItem,
  ProtectedCrossTabResult,
} from "./types";

interface CellSuppressionMeta {
  isSuppressed: boolean;
  reason: "PRIMARY" | "COMPLEMENTARY" | null;
  count: number;
}

/**
 * 對交叉分析結果套用小樣本隱私遮蔽與補償遮蔽投影 (Apply Cross-tabulation Privacy & Small-Cell Suppression)
 */
export function applyCrossTabPrivacy(
  crossTab: CrossTabResult,
  options?: CrossTabPrivacyOptions
): ProtectedCrossTabResult {
  const minCellSize = options?.minCellSize ?? 5;
  const enableComplementary = options?.enableComplementarySuppression ?? true;

  const rowCount = crossTab.matrix.length;
  const colCount = rowCount > 0 ? crossTab.matrix[0].length : 0;

  // 1. 初始化遮蔽狀態矩陣
  const suppressionState: CellSuppressionMeta[][] = Array.from({ length: rowCount }, () =>
    Array(colCount).fill(null)
  );

  // 2. 執行一級遮蔽 (Primary Suppression: 0 < count < minCellSize)
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const originalCount = crossTab.matrix[r][c].count;
      if (originalCount > 0 && originalCount < minCellSize) {
        suppressionState[r][c] = {
          isSuppressed: true,
          reason: "PRIMARY",
          count: originalCount,
        };
      } else {
        suppressionState[r][c] = {
          isSuppressed: false,
          reason: null,
          count: originalCount,
        };
      }
    }
  }

  // 3. 執行補償遮蔽 (Complementary Suppression)
  if (enableComplementary && rowCount > 0 && colCount > 0) {
    const maxIterations = rowCount * colCount;
    let iteration = 0;

    while (iteration < maxIterations) {
      let newlySuppressed = false;

      // 檢查每一 Row
      for (let r = 0; r < rowCount; r++) {
        const rowCells = suppressionState[r];
        const nonZeroCells = rowCells.filter((c) => c.count > 0);
        const suppressedCells = rowCells.filter((c) => c.isSuppressed);

        // 若該 Row 的非零格 >= 2，但遮蔽格恰好為 1，則可由 Row Total 反推該遮蔽格，必須補償遮蔽第 2 格
        if (suppressedCells.length === 1 && nonZeroCells.length >= 2) {
          // 尋找尚未被遮蔽且 count > 0 的最小儲存格
          let candidateCol = -1;
          let minCandidateCount = Infinity;

          for (let c = 0; c < colCount; c++) {
            const cell = suppressionState[r][c];
            if (!cell.isSuppressed && cell.count > 0 && cell.count < minCandidateCount) {
              minCandidateCount = cell.count;
              candidateCol = c;
            }
          }

          if (candidateCol !== -1) {
            suppressionState[r][candidateCol] = {
              isSuppressed: true,
              reason: "COMPLEMENTARY",
              count: suppressionState[r][candidateCol].count,
            };
            newlySuppressed = true;
          }
        }
      }

      // 檢查每一 Column
      for (let c = 0; c < colCount; c++) {
        const colCells: CellSuppressionMeta[] = [];
        for (let r = 0; r < rowCount; r++) {
          colCells.push(suppressionState[r][c]);
        }

        const nonZeroCells = colCells.filter((cell) => cell.count > 0);
        const suppressedCells = colCells.filter((cell) => cell.isSuppressed);

        // 若該 Col 的非零格 >= 2，但遮蔽格恰好為 1，必須補償遮蔽第 2 格
        if (suppressedCells.length === 1 && nonZeroCells.length >= 2) {
          let candidateRow = -1;
          let minCandidateCount = Infinity;

          for (let r = 0; r < rowCount; r++) {
            const cell = suppressionState[r][c];
            if (!cell.isSuppressed && cell.count > 0 && cell.count < minCandidateCount) {
              minCandidateCount = cell.count;
              candidateRow = r;
            }
          }

          if (candidateRow !== -1) {
            suppressionState[candidateRow][c] = {
              isSuppressed: true,
              reason: "COMPLEMENTARY",
              count: suppressionState[candidateRow][c].count,
            };
            newlySuppressed = true;
          }
        }
      }

      if (!newlySuppressed) {
        break;
      }
      iteration++;
    }
  }

  // 4. 建構受保護的 Matrix
  let primaryCount = 0;
  let complementaryCount = 0;

  const protectedMatrix: ProtectedCrossTabCell[][] = [];

  for (let r = 0; r < rowCount; r++) {
    const rowList: ProtectedCrossTabCell[] = [];
    for (let c = 0; c < colCount; c++) {
      const origCell = crossTab.matrix[r][c];
      const state = suppressionState[r][c];

      if (state.isSuppressed) {
        if (state.reason === "PRIMARY") {
          primaryCount++;
        } else {
          complementaryCount++;
        }

        rowList.push({
          rowChoiceValue: origCell.rowChoiceValue,
          colChoiceValue: origCell.colChoiceValue,
          count: null,
          displayValue: state.reason === "PRIMARY" ? `<${minCellSize}` : "—",
          isSuppressed: true,
          suppressionReason: state.reason,
          rowPercentage: null,
          colPercentage: null,
          totalPercentage: null,
        });
      } else {
        rowList.push({
          rowChoiceValue: origCell.rowChoiceValue,
          colChoiceValue: origCell.colChoiceValue,
          count: origCell.count,
          displayValue: String(origCell.count),
          isSuppressed: false,
          suppressionReason: null,
          rowPercentage: origCell.rowPercentage,
          colPercentage: origCell.colPercentage,
          totalPercentage: origCell.totalPercentage,
        });
      }
    }
    protectedMatrix.push(rowList);
  }

  // 5. 邊際項目保護 (Marginal Items Protection)
  const protectedRowItems: ProtectedCrossTabDimensionItem[] = crossTab.rowItems.map((item) => {
    if (item.count > 0 && item.count < minCellSize) {
      return {
        value: item.value,
        label: item.label,
        orderNum: item.orderNum,
        count: null,
        displayValue: `<${minCellSize}`,
        percentage: null,
        isSuppressed: true,
      };
    }
    return {
      value: item.value,
      label: item.label,
      orderNum: item.orderNum,
      count: item.count,
      displayValue: String(item.count),
      percentage: item.percentage,
      isSuppressed: false,
    };
  });

  const protectedColItems: ProtectedCrossTabDimensionItem[] = crossTab.colItems.map((item) => {
    if (item.count > 0 && item.count < minCellSize) {
      return {
        value: item.value,
        label: item.label,
        orderNum: item.orderNum,
        count: null,
        displayValue: `<${minCellSize}`,
        percentage: null,
        isSuppressed: true,
      };
    }
    return {
      value: item.value,
      label: item.label,
      orderNum: item.orderNum,
      count: item.count,
      displayValue: String(item.count),
      percentage: item.percentage,
      isSuppressed: false,
    };
  });

  // 6. 母體總計保護 (Grand Total & Unpaired Protection)
  let grandTotal: number | null = crossTab.grandTotal;
  let grandTotalDisplay = String(crossTab.grandTotal);
  if (crossTab.grandTotal > 0 && crossTab.grandTotal < minCellSize) {
    grandTotal = null;
    grandTotalDisplay = `<${minCellSize}`;
  }

  let unpairedCount: number | null = crossTab.unpairedCount;
  let unpairedCountDisplay = String(crossTab.unpairedCount);
  if (crossTab.unpairedCount > 0 && crossTab.unpairedCount < minCellSize) {
    unpairedCount = null;
    unpairedCountDisplay = `<${minCellSize}`;
  }

  // 7. 隱私揭露控制與統計展示防護 (Privacy Disclosure & Statistics Display Guard)
  const totalSuppressedCells = primaryCount + complementaryCount;
  const hasSuppression =
    totalSuppressedCells > 0 ||
    protectedRowItems.some((i) => i.isSuppressed) ||
    protectedColItems.some((i) => i.isSuppressed) ||
    grandTotal === null;

  // 若整體有效樣本數 < minCellSize，禁止直接展示推論統計檢定
  const statisticsDisplayable =
    crossTab.grandTotal >= minCellSize &&
    Boolean(crossTab.statistics && crossTab.statistics.isTestValid);

  let privacyNotice: string | null = null;
  if (hasSuppression) {
    privacyNotice =
      "部分儲存格因小樣本隱私保護規則 (計數 < 5) 已進行遮蔽與補償遮蔽。統計檢定結果基於完整內部資料計算，矩陣不可用於逆向反推個別受訪者。";
  }

  return {
    rowQuestion: crossTab.rowQuestion,
    colQuestion: crossTab.colQuestion,
    matrix: protectedMatrix,
    rowItems: protectedRowItems,
    colItems: protectedColItems,
    grandTotal,
    grandTotalDisplay,
    unpairedCount,
    unpairedCountDisplay,
    totalResponses: crossTab.totalResponses,
    statistics: crossTab.statistics ?? null,
    privacy: {
      minCellSize,
      hasSuppression,
      primarySuppressedCount: primaryCount,
      complementarySuppressedCount: complementaryCount,
      totalSuppressedCells,
      statisticsDisplayable,
      privacyNotice,
    },
  };
}
