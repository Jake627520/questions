import { NumericStatistics, DistributionSignal } from "./types";

/**
 * 計算數值型與評分量表題的敘述統計量 (Pure Function)
 *
 * 核心原則：
 * 1. N = 0 時回傳 null。
 * 2. N = 1 時，Mean = Median = Min = Max = x1，Sample SD 嚴格回傳 null (分母 n - 1 = 0 保護)。
 * 3. N >= 2 時，計算 Sample Standard Deviation s = sqrt( sum((x - mean)^2) / (n - 1) )。
 * 4. Polarization 為產品自訂啟發式特徵標籤 (heuristic signal)，非普適統計假設檢定。
 */
export function calculateNumericStatistics(
  values: number[]
): NumericStatistics | null {
  // 過濾掉非合法數值
  const validNumbers = values.filter((v) => typeof v === "number" && !isNaN(v));
  const n = validNumbers.length;

  if (n === 0) {
    return null;
  }

  const sum = validNumbers.reduce((acc, v) => acc + v, 0);
  const mean = Math.round((sum / n) * 100) / 100;

  const sorted = [...validNumbers].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const rawMedian =
    n % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  const median = Math.round(rawMedian * 100) / 100;

  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  let standardDeviation: number | null = null;
  let distributionSignal: DistributionSignal = "NORMAL";

  if (n >= 2) {
    const variance =
      validNumbers.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1);
    standardDeviation = Math.round(Math.sqrt(variance) * 100) / 100;

    // 產品自訂 Polarization 啟發式標記：
    // 當標準差 > 1.2 且落在極值兩端（min 與 max）的填答佔比 > 40% 時標示為 POLARIZED
    if (standardDeviation !== null && standardDeviation > 1.2 && min !== max) {
      const extremeCount = validNumbers.filter((v) => v === min || v === max).length;
      if (extremeCount / n > 0.4) {
        distributionSignal = "POLARIZED";
      }
    }
  }

  return {
    n,
    count: n,
    mean,
    median,
    min,
    max,
    standardDeviation,
    distributionSignal,
  };
}
