/**
 * Pure Function Cross-tabulation Statistical Engine
 * Phase M9-F.2 (Statistical Contract & Significance Testing)
 *
 * 核心原則：
 * 1. 嚴格純函數：0 DB I/O、0 外部相依套件、100% Deterministic。
 * 2. 檢定母體嚴格等於 grandTotal（雙重有效作答樣本數 count(valid(row) && valid(col))）。
 * 3. 僅適用於互斥類別變數 (Single × Single, Single × Yes/No, Yes/No × Yes/No)。
 * 4. 多選題 (Multiple-choice) 嚴格標記為不適用，回傳 null 與警告提示，拒絕假造統計結果。
 * 5. Cochran 規則：檢驗期望值 E_ij < 5 佔比是否 > 20% 或存在 E_ij < 1，標註 isTestValid 與 warning。
 * 6. 皮爾森卡方統計量 (χ²)、卡方累積機率分配 (p-value)、自由度 (df) 與關聯強度 (Cramer's V)。
 */

import { CrossTabResult, CrossTabStatistics } from "./types";

/**
 * 數值穩定的 Lanczos 展開近似 Gamma 函數對數 ln(Γ(z))
 */
export function logGamma(z: number): number {
  if (z <= 0) return 0;
  const p = [
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.138571095836526,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  const g = 7;
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < p.length; i++) {
    x += p[i] / (z + i + 1);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * 不完全 Gamma 函數級數展開 P(a, x) = γ(a, x) / Γ(a) 當 x < a + 1
 */
function gammp(a: number, x: number): number {
  if (x <= 0) return 0;
  let sum = 1 / a;
  let del = sum;
  let ap = a;
  for (let n = 1; n <= 100; n++) {
    ap += 1;
    del = (del * x) / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 3e-7) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/**
 * 不完全 Gamma 函數連分數展開 Q(a, x) = Γ(a, x) / Γ(a) 當 x >= a + 1
 */
function gammq(a: number, x: number): number {
  if (x <= 0) return 1;
  const FPMIN = 1e-30;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 100; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-7) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/**
 * 計算卡方檢定之雙尾 p-value (Upper-tail Probability: P(X >= chiSquare))
 */
export function calculateChiSquarePValue(chiSquare: number, df: number): number {
  if (chiSquare <= 0 || df <= 0 || isNaN(chiSquare) || isNaN(df)) return 1.0;
  const a = df / 2;
  const x = chiSquare / 2;

  let pVal: number;
  if (x < a + 1) {
    pVal = Math.max(0, Math.min(1, 1 - gammp(a, x)));
  } else {
    pVal = Math.max(0, Math.min(1, gammq(a, x)));
  }

  return Math.round(pVal * 10000) / 10000;
}

/**
 * 計算 2-Way 交叉分析統計顯著性指標 (Analyze Cross-tabulation Statistical Significance)
 */
export function analyzeCrossTabStatistics(crossTab: CrossTabResult): CrossTabStatistics {
  const N = crossTab.grandTotal;

  // 1. 檢查題型是否為互斥類別維度 (Single / Yes-No)
  const isRowMulti = crossTab.rowQuestion.type === "multiple_choice";
  const isColMulti = crossTab.colQuestion.type === "multiple_choice";

  if (isRowMulti || isColMulti) {
    return {
      sampleSize: N,
      chiSquare: null,
      pValue: null,
      degreesOfFreedom: 0,
      cramersV: null,
      expectedCounts: [],
      minExpectedCount: 0,
      cellsBelowExpectedThreshold: 0,
      percentageBelowExpectedThreshold: 0,
      isTestValid: false,
      warning: "多選題包含非互斥重複觀測值，不適用皮爾森卡方獨立性檢定",
    };
  }

  // 2. 樣本數檢核 (N < 2)
  if (N < 2) {
    return {
      sampleSize: N,
      chiSquare: null,
      pValue: null,
      degreesOfFreedom: 0,
      cramersV: null,
      expectedCounts: [],
      minExpectedCount: 0,
      cellsBelowExpectedThreshold: 0,
      percentageBelowExpectedThreshold: 0,
      isTestValid: false,
      warning: "有效雙重作答樣本數不足 (N < 2)，無法進行卡方檢定",
    };
  }

  // 3. 找出有效非零邊際的 Row 與 Column (Active Rows & Cols)
  const rowCount = crossTab.rowItems.length;
  const colCount = crossTab.colItems.length;

  const activeRowIndices: number[] = [];
  crossTab.rowItems.forEach((r, idx) => {
    if (r.count > 0) activeRowIndices.push(idx);
  });

  const activeColIndices: number[] = [];
  crossTab.colItems.forEach((c, idx) => {
    if (c.count > 0) activeColIndices.push(idx);
  });

  const rActive = activeRowIndices.length;
  const cActive = activeColIndices.length;

  // 4. 自由度檢核 (至少需 2x2 維度)
  if (rActive < 2 || cActive < 2) {
    return {
      sampleSize: N,
      chiSquare: null,
      pValue: null,
      degreesOfFreedom: 0,
      cramersV: null,
      expectedCounts: [],
      minExpectedCount: 0,
      cellsBelowExpectedThreshold: 0,
      percentageBelowExpectedThreshold: 0,
      isTestValid: false,
      warning: "有效維度類別數不足 (至少需 2 個有效 Row 與 2 個有效 Column)",
    };
  }

  const df = (rActive - 1) * (cActive - 1);

  // 5. 計算期望次數 (Expected Cell Counts: E_ij = (R_i * C_j) / N) 與卡方值 (χ²)
  const expectedCounts: number[][] = Array.from({ length: rowCount }, () =>
    Array(colCount).fill(0)
  );

  let chiSquareRaw = 0;
  let minExpected = Infinity;
  let cellsBelow5 = 0;
  let totalActiveCells = rActive * cActive;

  activeRowIndices.forEach((ri) => {
    const rowTotal = crossTab.rowItems[ri].count;
    activeColIndices.forEach((ci) => {
      const colTotal = crossTab.colItems[ci].count;
      const expected = (rowTotal * colTotal) / N;

      expectedCounts[ri][ci] = Math.round(expected * 100) / 100;

      if (expected < minExpected) {
        minExpected = expected;
      }
      if (expected < 5) {
        cellsBelow5++;
      }

      const observed = crossTab.matrix[ri][ci].count;
      const diff = observed - expected;
      chiSquareRaw += (diff * diff) / expected;
    });
  });

  const minExpectedCount = Math.round(minExpected * 100) / 100;
  const percentageBelow5 =
    totalActiveCells > 0
      ? Math.round((cellsBelow5 / totalActiveCells) * 1000) / 10
      : 0;

  // 6. 檢定有效性判定 (Cochran's Rule: 不存在 E_ij < 1 且 E_ij < 5 佔比 <= 20%)
  const isCochranSatisfied = minExpected >= 1 && percentageBelow5 <= 20;
  const isTestValid = isCochranSatisfied;

  let warning: string | null = null;
  if (!isCochranSatisfied) {
    if (minExpected < 1) {
      warning = `統計檢定需謹慎解讀：存在期望值小於 1 (最小期望值: ${minExpectedCount})`;
    } else {
      warning = `統計檢定需謹慎解讀：期望值小於 5 的儲存格佔比過高 (${percentageBelow5}%)`;
    }
  }

  // 7. 計算 p-value 與 Cramer's V
  const chiSquare = Math.round(chiSquareRaw * 1000) / 1000;
  const pValue = calculateChiSquarePValue(chiSquareRaw, df);

  const k = Math.min(rActive, cActive);
  let cramersV: number | null = null;
  if (k > 1 && N > 0 && chiSquareRaw >= 0) {
    const vRaw = Math.sqrt(chiSquareRaw / (N * (k - 1)));
    cramersV = Math.round(Math.max(0, Math.min(1, vRaw)) * 1000) / 1000;
  }

  return {
    sampleSize: N,
    chiSquare,
    pValue,
    degreesOfFreedom: df,
    cramersV,
    expectedCounts,
    minExpectedCount,
    cellsBelowExpectedThreshold: cellsBelow5,
    percentageBelowExpectedThreshold: percentageBelow5,
    isTestValid,
    warning,
  };
}
