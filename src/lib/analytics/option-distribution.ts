import { ChoiceMeta, OptionDistributionItem, RawAnswerData } from "./types";

/**
 * 計算選項頻率與百分比分佈 (Pure Function)
 *
 * 核心原則：
 * 1. 僅對具備選項之題型 (single_choice, multiple_choice, yes_no) 計算分佈。
 * 2. 百分比計算之分母為「有效作答者數 (answeredCount)」，不被未作答者稀釋。
 * 3. 多選題之選項百分比總和 >= 100% 屬正常統計現象。
 * 4. 單選題之選項百分比總和 ≈ 100%。
 */
export function calculateOptionDistribution(
  choices: ChoiceMeta[] | undefined,
  validAnswers: RawAnswerData[],
  answeredCount: number
): OptionDistributionItem[] | null {
  if (!choices || choices.length === 0) {
    return null;
  }

  return choices.map((c) => {
    let count = 0;

    validAnswers.forEach((a) => {
      if (!a.rawValue) return;
      try {
        const parsed = JSON.parse(a.rawValue);
        if (Array.isArray(parsed)) {
          // 多選題
          if (parsed.includes(c.value)) count++;
        } else if (parsed === c.value || String(parsed) === c.value) {
          // 單選/是非題 (JSON 值)
          count++;
        }
      } catch {
        // 純字串值
        if (a.rawValue === c.value) count++;
      }
    });

    const percentage =
      answeredCount > 0
        ? Math.round((count / answeredCount) * 1000) / 10
        : 0;

    return {
      choiceId: c.id,
      label: c.label,
      value: c.value,
      orderNum: c.orderNum,
      count,
      percentage,
      score: c.score ?? null,
      scoreEnabled: c.scoreEnabled ?? false,
    };
  });
}
