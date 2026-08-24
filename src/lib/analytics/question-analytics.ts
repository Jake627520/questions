import {
  QuestionMeta,
  RawResponseData,
  QuestionAnalyticsResult,
  RawAnswerData,
} from "./types";
import { calculateResponseRates } from "./response-rates";
import { calculateOptionDistribution } from "./option-distribution";
import { calculateNumericStatistics } from "./numeric-statistics";

/**
 * 判斷答案是否為有效作答
 */
export function isValidAnswer(answer: RawAnswerData | undefined): boolean {
  if (!answer || answer.rawValue === null || answer.rawValue === undefined) {
    return false;
  }
  const raw = String(answer.rawValue).trim();
  if (raw === "") return false;

  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || parsed === undefined) return false;
    if (Array.isArray(parsed)) return parsed.length > 0;
    return String(parsed).trim() !== "";
  } catch {
    return raw !== "";
  }
}

/**
 * 萃取題目答案中的數值 (評分或數值輸入)
 */
export function extractNumericValues(
  question: QuestionMeta,
  validAnswers: RawAnswerData[]
): number[] {
  const numericValues: number[] = [];

  validAnswers.forEach((a) => {
    // 優先取評分分數 a.score
    if (a.score !== null && a.score !== undefined && !isNaN(a.score)) {
      numericValues.push(a.score);
      return;
    }

    // 若題型為數值題或啟用評分，嘗試解析 rawValue
    if (question.questionType === "number" || question.scoringEnabled) {
      if (!a.rawValue) return;
      try {
        const parsed = JSON.parse(a.rawValue);
        const num = typeof parsed === "number" ? parsed : parseFloat(parsed);
        if (!isNaN(num)) numericValues.push(num);
      } catch {
        const num = parseFloat(a.rawValue);
        if (!isNaN(num)) numericValues.push(num);
      }
    }
  });

  return numericValues;
}

/**
 * 針對問卷題目集合與填答資料，計算各題完整的作答與統計指標 (Pure Function)
 */
export function analyzeSurveyQuestions(
  questions: QuestionMeta[],
  responses: RawResponseData[]
): QuestionAnalyticsResult[] {
  const totalResponses = responses.length;

  return questions.map((q) => {
    // 收集所有指向該題之答案
    const answersForQ = responses.flatMap((r) =>
      r.answers.filter((a) => a.questionId === q.id)
    );

    // 篩選出有效作答
    const validAnswers = answersForQ.filter(isValidAnswer);
    const answeredCount = validAnswers.length;

    // 1. 計算作答率指標 (Response Rates)
    const rates = calculateResponseRates(totalResponses, answeredCount);

    // 2. 計算選項分佈 (Option Distribution)
    const distribution = calculateOptionDistribution(
      q.choices,
      validAnswers,
      answeredCount
    );

    // 3. 計算數值統計 (Numeric Statistics)
    const numericValues = extractNumericValues(q, validAnswers);
    const statistics = calculateNumericStatistics(numericValues);

    return {
      questionId: q.id,
      code: q.code,
      orderNum: q.orderNum,
      title: q.title,
      description: q.description ?? null,
      type: q.questionType,
      required: q.required,
      scoringEnabled: q.scoringEnabled,
      totalResponses: rates.totalResponses,
      answeredCount: rates.answeredCount,
      unansweredCount: rates.unansweredCount,
      answerRate: rates.answerRate,
      unansweredRate: rates.unansweredRate,
      // 向前相容性 alias
      notAnsweredCount: rates.unansweredCount,
      responseRate: rates.answerRate,
      distribution,
      optionDistribution: distribution,
      statistics,
    };
  });
}
