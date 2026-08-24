import { ResponseRates } from "./types";

/**
 * 計算單一題目的有效作答率與未作答率 (Pure Function)
 *
 * 核心原則：
 * 1. 拒絕猜測 Drop-off 或原因，明確區分 Answered 與 Unanswered。
 * 2. 分母為符合篩選條件的總填答數 (totalResponses)。
 * 3. 百分比四捨五入至小數點第 1 位。
 */
export function calculateResponseRates(
  totalResponses: number,
  answeredCount: number
): ResponseRates {
  const safeTotal = Math.max(0, totalResponses);
  const safeAnswered = Math.max(0, Math.min(answeredCount, safeTotal));
  const unansweredCount = Math.max(0, safeTotal - safeAnswered);

  const answerRate =
    safeTotal > 0
      ? Math.round((safeAnswered / safeTotal) * 1000) / 10
      : 0;

  const unansweredRate =
    safeTotal > 0
      ? Math.round((unansweredCount / safeTotal) * 1000) / 10
      : 0;

  return {
    totalResponses: safeTotal,
    answeredCount: safeAnswered,
    unansweredCount,
    answerRate,
    unansweredRate,
  };
}
