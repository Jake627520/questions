import {
  QuestionInput,
  ChoiceInput,
  AnswerSubmission,
  QuestionScoreResult,
  SurveyScoreResult,
  VisibilityRule,
  VisibilityRuleSchema,
  VisibilityOperator,
} from "./types";

/**
 * 解析簡寫語法字串，例如：
 * - "SHOW IF Q1 in [very_dissatisfied, dissatisfied]"
 * - "SHOW IF Q1 in [非常不滿意, 不太滿意]" (中文 Label 比對)
 * - "SHOW IF Q1 equals dissatisfied" 或 "SHOW IF Q1 equals 非常滿意"
 * - "SHOW IF Q5 contains slack" 或 "SHOW IF Q5 contains Slack 整合"
 * - "SHOW IF Q4 lt 2"
 * - "HIDE IF Q1 == very_satisfied"
 */
export function parseShorthandRule(input: string): VisibilityRule | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^(SHOW|HIDE)\s+IF\s+(.+)$/i);
  if (!match) return null;

  const action = match[1].toUpperCase() as "SHOW" | "HIDE";
  const expr = match[2].trim();

  let logic: "AND" | "OR" = "AND";
  let conditionClauses: string[] = [];

  if (/\s+OR\s+/i.test(expr)) {
    logic = "OR";
    conditionClauses = expr.split(/\s+OR\s+/i).map((s) => s.trim());
  } else if (/\s+AND\s+/i.test(expr)) {
    logic = "AND";
    conditionClauses = expr.split(/\s+AND\s+/i).map((s) => s.trim());
  } else {
    conditionClauses = [expr];
  }

  const conditions: Array<{
    dependsOnQuestionCode: string;
    operator: VisibilityOperator;
    value: any;
  }> = [];

  for (const clause of conditionClauses) {
    // 1. 處理 in [...] 語法: "Q1 in [a, b, c]"
    const inMatch = clause.match(/^([A-Za-z0-9_-]+)\s+in\s+\[(.*)\]$/i);
    if (inMatch) {
      const qCode = inMatch[1].trim();
      const rawList = inMatch[2].split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
      if (rawList.length === 0 || (rawList.length === 1 && rawList[0] === "")) {
        return null;
      }
      rawList.forEach((val) => {
        conditions.push({
          dependsOnQuestionCode: qCode,
          operator: "equals",
          value: isNaN(Number(val)) || val === "" ? val : Number(val),
        });
      });
      logic = "OR";
      continue;
    }

    // 2. 處理標準二元運算子
    const opMatch = clause.match(
      /^([A-Za-z0-9_-]+)\s+(equals|==|=|not_equals|!=|contains|not_contains|gte|>=|gt|>|lte|<=|lt|<)\s+(.+)$/i
    );

    if (!opMatch) {
      return null;
    }

    const qCode = opMatch[1].trim();
    const rawOp = opMatch[2].toLowerCase();
    let rawVal = opMatch[3].trim().replace(/^['"]|['"]$/g, "");

    let operator: VisibilityOperator;
    switch (rawOp) {
      case "==":
      case "=":
      case "equals":
        operator = "equals";
        break;
      case "!=":
      case "not_equals":
        operator = "not_equals";
        break;
      case "contains":
        operator = "contains";
        break;
      case "not_contains":
        operator = "not_contains";
        break;
      case ">":
      case "gt":
        operator = "gt";
        break;
      case ">=":
      case "gte":
        operator = "gte";
        break;
      case "<":
      case "lt":
        operator = "lt";
        break;
      case "<=":
      case "lte":
        operator = "lte";
        break;
      default:
        return null;
    }

    let parsedVal: any = rawVal;
    if (operator === "gt" || operator === "gte" || operator === "lt" || operator === "lte") {
      const num = Number(rawVal);
      if (isNaN(num)) return null;
      parsedVal = num;
    }

    conditions.push({
      dependsOnQuestionCode: qCode,
      operator,
      value: parsedVal,
    });
  }

  if (conditions.length === 0) return null;

  return {
    action,
    logic,
    conditions,
  };
}

/**
 * 解析題目的條件顯示規則（支援標準 JSON 與簡寫語法）
 */
export function parseVisibilityRule(rules: any): VisibilityRule | null {
  if (!rules) return null;

  if (typeof rules === "object" && rules !== null) {
    const result = VisibilityRuleSchema.safeParse(rules);
    return result.success ? result.data : null;
  }

  if (typeof rules === "string") {
    const trimmed = rules.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith("{")) {
      try {
        const json = JSON.parse(trimmed);
        const result = VisibilityRuleSchema.safeParse(json);
        return result.success ? result.data : null;
      } catch {
        return null;
      }
    }

    return parseShorthandRule(trimmed);
  }

  return null;
}

/**
 * 檢測題目集合中的循環相依 (Circular Dependency Check)
 */
export function detectCircularDependencies(questions: QuestionInput[]): string[] | null {
  const adj = new Map<string, string[]>();
  const questionCodes = new Set(questions.map((q) => q.code));

  for (const q of questions) {
    const rule = parseVisibilityRule(q.visibilityRules);
    const deps: string[] = [];
    if (rule && rule.conditions) {
      for (const cond of rule.conditions) {
        if (questionCodes.has(cond.dependsOnQuestionCode)) {
          deps.push(cond.dependsOnQuestionCode);
        }
      }
    }
    adj.set(q.code, deps);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(curr: string): string[] | null {
    visited.add(curr);
    recStack.add(curr);
    path.push(curr);

    const neighbors = adj.get(curr) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const cycle = dfs(neighbor);
        if (cycle) return cycle;
      } else if (recStack.has(neighbor)) {
        const cycleStartIdx = path.indexOf(neighbor);
        return [...path.slice(cycleStartIdx), neighbor];
      }
    }

    recStack.delete(curr);
    path.pop();
    return null;
  }

  for (const q of questions) {
    if (!visited.has(q.code)) {
      const cycle = dfs(q.code);
      if (cycle) return cycle;
    }
  }

  return null;
}

/**
 * 驗證整份問卷結構合法性（支援行號、標籤比對存在性、重複選項檢核）
 */
export function validateQuestionsStructure(questions: QuestionInput[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const qMap = new Map<string, QuestionInput>();
  questions.forEach((q) => qMap.set(q.code, q));

  for (const q of questions) {
    const prefix = q.rowNum ? `第 ${q.rowNum} 列 [${q.code}]` : `題目「${q.code}」`;

    // 1. 檢查選項重複
    if (q.choices && q.choices.length > 0) {
      const seenValues = new Set<string>();
      const seenLabels = new Set<string>();
      for (const c of q.choices) {
        if (seenValues.has(c.value)) {
          errors.push(`${prefix}：存在重複的選項代碼（value）「${c.value}」`);
        }
        seenValues.add(c.value);

        const cleanLabel = c.label.trim();
        if (seenLabels.has(cleanLabel)) {
          errors.push(`${prefix}：存在重複的選項標籤（label）「${cleanLabel}」`);
        }
        seenLabels.add(cleanLabel);
      }
    }

    // 2. 檢查 visibilityRules 語法與標籤/值存在性
    if (q.visibilityRules) {
      const parsed = parseVisibilityRule(q.visibilityRules);
      if (!parsed) {
        errors.push(`${prefix}：條件規則語法錯誤或無法解析：「${q.visibilityRules}」`);
      } else {
        for (const cond of parsed.conditions) {
          const depQ = qMap.get(cond.dependsOnQuestionCode);
          if (!depQ) {
            errors.push(`${prefix}：條件規則相依於不存在的題目代碼：「${cond.dependsOnQuestionCode}」`);
            continue;
          }
          if (cond.dependsOnQuestionCode === q.code) {
            errors.push(`${prefix}：不能將條件相依設定為自己自身`);
            continue;
          }

          // 若相依題目為選擇題，檢查條件指定的 value / label 是否真實存在
          if (
            (depQ.questionType === "single_choice" ||
              depQ.questionType === "multiple_choice" ||
              depQ.questionType === "yes_no") &&
            depQ.choices &&
            depQ.choices.length > 0 &&
            (cond.operator === "equals" ||
              cond.operator === "not_equals" ||
              cond.operator === "contains" ||
              cond.operator === "not_contains")
          ) {
            const target = String(cond.value).trim();
            const exists = depQ.choices.some(
              (c) =>
                c.value === target ||
                c.label.trim() === target ||
                (cond.operator === "contains" && c.label.includes(target))
            );

            if (!exists) {
              errors.push(
                `${prefix}：條件中的選項值/標籤「${cond.value}」不存在於題目「${cond.dependsOnQuestionCode}」的選項清單中`
              );
            }
          }
        }
      }
    }
  }

  // 3. 循環相依檢測
  const cycle = detectCircularDependencies(questions);
  if (cycle) {
    errors.push(`檢測到題目條件規則存在循環相依 (Circular Dependency)：${cycle.join(" -> ")}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 判斷單一題目在目前作答狀態下是否應顯示 (支援 value 與 label 智慧比對)
 */
export function isQuestionVisible(
  question: QuestionInput,
  answersMap: Map<string, AnswerSubmission | undefined>,
  questionsMap?: Map<string, QuestionInput>
): boolean {
  const rule = parseVisibilityRule(question.visibilityRules);
  if (!rule || !rule.conditions || rule.conditions.length === 0) {
    return true;
  }

  const results = rule.conditions.map((cond) => {
    const depAns = answersMap.get(cond.dependsOnQuestionCode);
    const rawValue = depAns?.rawValue;
    const targetVal = cond.value;

    if (rawValue === undefined || rawValue === null) {
      return false;
    }

    // 取得相依題目定義，支援 Label 比對轉換
    const depQuestion = questionsMap?.get(cond.dependsOnQuestionCode);
    const targetChoice = depQuestion?.choices.find(
      (c) =>
        c.value === String(targetVal) ||
        c.label.trim() === String(targetVal).trim()
    );

    // 有效匹配目標清單 (包含原始 value 與解析出的 choice value)
    const matchTargets = [String(targetVal)];
    if (targetChoice && targetChoice.value !== String(targetVal)) {
      matchTargets.push(targetChoice.value);
    }

    switch (cond.operator) {
      case "equals": {
        const rawStr = String(rawValue);
        // 比對 rawValue 是否等於 targetVal 或 targetChoice.value
        if (matchTargets.includes(rawStr)) return true;
        // 或比對 rawValue 對應的 label 是否等於 targetVal
        const chosen = depQuestion?.choices.find((c) => c.value === rawStr);
        if (chosen && chosen.label.trim() === String(targetVal).trim()) return true;
        return false;
      }

      case "not_equals": {
        const rawStr = String(rawValue);
        if (matchTargets.includes(rawStr)) return false;
        const chosen = depQuestion?.choices.find((c) => c.value === rawStr);
        if (chosen && chosen.label.trim() === String(targetVal).trim()) return false;
        return true;
      }

      case "contains": {
        const targetStr = String(targetVal);
        if (Array.isArray(rawValue)) {
          const selectedStrs = rawValue.map(String);
          // 1. value 直接匹配
          if (matchTargets.some((t) => selectedStrs.includes(t))) return true;
          // 2. label 包含比對
          if (depQuestion?.choices) {
            const selectedChoices = depQuestion.choices.filter((c) =>
              selectedStrs.includes(c.value)
            );
            return selectedChoices.some(
              (c) => c.label.includes(targetStr) || c.value.includes(targetStr)
            );
          }
          return false;
        }
        const strVal = String(rawValue);
        if (matchTargets.some((t) => strVal.includes(t))) return true;
        const chosen = depQuestion?.choices.find((c) => c.value === strVal);
        if (chosen && (chosen.label.includes(targetStr) || chosen.value.includes(targetStr))) {
          return true;
        }
        return strVal.includes(targetStr);
      }

      case "not_contains": {
        const targetStr = String(targetVal);
        if (Array.isArray(rawValue)) {
          const selectedStrs = rawValue.map(String);
          if (matchTargets.some((t) => selectedStrs.includes(t))) return false;
          if (depQuestion?.choices) {
            const selectedChoices = depQuestion.choices.filter((c) =>
              selectedStrs.includes(c.value)
            );
            if (
              selectedChoices.some(
                (c) => c.label.includes(targetStr) || c.value.includes(targetStr)
              )
            ) {
              return false;
            }
          }
          return true;
        }
        const strVal = String(rawValue);
        if (matchTargets.some((t) => strVal.includes(t))) return false;
        const chosen = depQuestion?.choices.find((c) => c.value === strVal);
        if (chosen && (chosen.label.includes(targetStr) || chosen.value.includes(targetStr))) {
          return false;
        }
        return !strVal.includes(targetStr);
      }

      case "gt": {
        const num = Number(rawValue);
        const target = Number(targetVal);
        return !isNaN(num) && !isNaN(target) && num > target;
      }

      case "gte": {
        const num = Number(rawValue);
        const target = Number(targetVal);
        return !isNaN(num) && !isNaN(target) && num >= target;
      }

      case "lt": {
        const num = Number(rawValue);
        const target = Number(targetVal);
        return !isNaN(num) && !isNaN(target) && num < target;
      }

      case "lte": {
        const num = Number(rawValue);
        const target = Number(targetVal);
        return !isNaN(num) && !isNaN(target) && num <= target;
      }

      default:
        return false;
    }
  });

  const conditionMatched =
    rule.logic === "OR"
      ? results.some(Boolean)
      : results.every(Boolean);

  return rule.action === "SHOW" ? conditionMatched : !conditionMatched;
}

/**
 * 驗證與計算單一題目的作答結果與分數
 */
export function evaluateQuestionAnswer(
  question: QuestionInput,
  submission?: AnswerSubmission,
  isVisible: boolean = true
): QuestionScoreResult {
  const code = question.code;
  const title = question.title;
  const type = question.questionType;
  const scoringEnabled = Boolean(question.scoringEnabled);

  if (!isVisible) {
    return {
      questionCode: code,
      questionTitle: title,
      questionType: type,
      isVisible: false,
      scoringEnabled,
      score: null,
      maxPossibleScore: null,
      isValid: true,
    };
  }

  if (type === "info") {
    return {
      questionCode: code,
      questionTitle: title,
      questionType: type,
      isVisible: true,
      scoringEnabled: false,
      score: null,
      maxPossibleScore: null,
      isValid: true,
    };
  }

  const rawValue = submission?.rawValue;
  const otherText = submission?.otherText?.trim();

  const hasValue =
    rawValue !== undefined &&
    rawValue !== null &&
    (Array.isArray(rawValue) ? rawValue.length > 0 : String(rawValue).trim() !== "");

  if (question.required && !hasValue) {
    return {
      questionCode: code,
      questionTitle: title,
      questionType: type,
      isVisible: true,
      scoringEnabled,
      score: null,
      maxPossibleScore: null,
      isValid: false,
      error: `題目「${title}」為必填項目`,
    };
  }

  if (!hasValue) {
    const maxScore = calculateQuestionMaxScore(question);
    return {
      questionCode: code,
      questionTitle: title,
      questionType: type,
      isVisible: true,
      scoringEnabled,
      score: null,
      maxPossibleScore: scoringEnabled ? maxScore : null,
      isValid: true,
    };
  }

  const choices = question.choices || [];
  const choiceMap = new Map<string, ChoiceInput>();
  choices.forEach((c) => choiceMap.set(c.value, c));

  let score: number | null = null;
  let maxPossibleScore: number | null = null;

  if (type === "single_choice" || type === "yes_no") {
    const selectedVal = String(rawValue);
    const chosen = choiceMap.get(selectedVal);

    if (chosen && chosen.isOther && chosen.requiresText) {
      if (!otherText) {
        return {
          questionCode: code,
          questionTitle: title,
          questionType: type,
          isVisible: true,
          scoringEnabled,
          score: null,
          maxPossibleScore: null,
          isValid: false,
          error: `選取「${chosen.label}」時，必須填寫補充說明文字`,
        };
      }
    }

    if (scoringEnabled) {
      maxPossibleScore = calculateQuestionMaxScore(question);
      if (chosen && chosen.scoreEnabled && chosen.score !== null && chosen.score !== undefined) {
        let rawScore = chosen.score;

        if (question.reverseScore) {
          const scoredChoices = choices.filter(
            (c) => c.scoreEnabled && c.score !== null && c.score !== undefined
          );
          if (scoredChoices.length > 0) {
            const scores = scoredChoices.map((c) => c.score as number);
            const min = Math.min(...scores);
            const max = Math.max(...scores);
            rawScore = max + min - rawScore;
          }
        }
        score = rawScore;
      } else {
        score = null;
      }
    }
  } else if (type === "multiple_choice") {
    const selectedVals = Array.isArray(rawValue)
      ? rawValue.map(String)
      : [String(rawValue)];

    if (
      question.minSelections !== null &&
      question.minSelections !== undefined &&
      selectedVals.length < question.minSelections
    ) {
      return {
        questionCode: code,
        questionTitle: title,
        questionType: type,
        isVisible: true,
        scoringEnabled,
        score: null,
        maxPossibleScore: null,
        isValid: false,
        error: `題目「${title}」至少需選取 ${question.minSelections} 項 (目前選取 ${selectedVals.length} 項)`,
      };
    }

    if (
      question.maxSelections !== null &&
      question.maxSelections !== undefined &&
      selectedVals.length > question.maxSelections
    ) {
      return {
        questionCode: code,
        questionTitle: title,
        questionType: type,
        isVisible: true,
        scoringEnabled,
        score: null,
        maxPossibleScore: null,
        isValid: false,
        error: `題目「${title}」最多只可選取 ${question.maxSelections} 項 (目前選取 ${selectedVals.length} 項)`,
      };
    }

    const hasNoneOfAbove = selectedVals.some((val) => {
      const c = choiceMap.get(val);
      return c?.isNoneOfAbove;
    });

    if (hasNoneOfAbove && selectedVals.length > 1) {
      const noneChoice = choices.find((c) => c.isNoneOfAbove);
      const label = noneChoice?.label || "以上皆非";
      return {
        questionCode: code,
        questionTitle: title,
        questionType: type,
        isVisible: true,
        scoringEnabled,
        score: null,
        maxPossibleScore: null,
        isValid: false,
        error: `「${label}」不能與其他選項同時選擇`,
      };
    }

    for (const val of selectedVals) {
      const chosen = choiceMap.get(val);
      if (chosen && chosen.isOther && chosen.requiresText) {
        if (!otherText) {
          return {
            questionCode: code,
            questionTitle: title,
            questionType: type,
            isVisible: true,
            scoringEnabled,
            score: null,
            maxPossibleScore: null,
            isValid: false,
            error: `選取「${chosen.label}」時，必須填寫補充說明文字`,
          };
        }
      }
    }

    if (scoringEnabled) {
      maxPossibleScore = calculateQuestionMaxScore(question);
      let totalChoiceScore = 0;
      let hasScoredChoice = false;

      for (const val of selectedVals) {
        const chosen = choiceMap.get(val);
        if (chosen && chosen.scoreEnabled && chosen.score !== null && chosen.score !== undefined) {
          totalChoiceScore += chosen.score;
          hasScoredChoice = true;
        }
      }

      score = hasScoredChoice ? totalChoiceScore : null;
    }
  } else if (type === "number") {
    const num = Number(rawValue);
    if (isNaN(num)) {
      return {
        questionCode: code,
        questionTitle: title,
        questionType: type,
        isVisible: true,
        scoringEnabled,
        score: null,
        maxPossibleScore: null,
        isValid: false,
        error: `題目「${title}」請輸入有效數字`,
      };
    }

    if (question.minValue !== null && question.minValue !== undefined && num < question.minValue) {
      return {
        questionCode: code,
        questionTitle: title,
        questionType: type,
        isVisible: true,
        scoringEnabled,
        score: null,
        maxPossibleScore: null,
        isValid: false,
        error: `題目「${title}」數值不得小於 ${question.minValue}`,
      };
    }

    if (question.maxValue !== null && question.maxValue !== undefined && num > question.maxValue) {
      return {
        questionCode: code,
        questionTitle: title,
        questionType: type,
        isVisible: true,
        scoringEnabled,
        score: null,
        maxPossibleScore: null,
        isValid: false,
        error: `題目「${title}」數值不得大於 ${question.maxValue}`,
      };
    }

    score = null;
    maxPossibleScore = null;
  } else if (type === "text") {
    score = null;
    maxPossibleScore = null;
  }

  return {
    questionCode: code,
    questionTitle: title,
    questionType: type,
    isVisible: true,
    scoringEnabled,
    score,
    maxPossibleScore: scoringEnabled ? maxPossibleScore : null,
    isValid: true,
  };
}

/**
 * 計算題目的最高可能得分
 */
export function calculateQuestionMaxScore(question: QuestionInput): number | null {
  if (!question.scoringEnabled) return null;
  const choices = question.choices || [];
  const scoredChoices = choices.filter(
    (c) => c.scoreEnabled && c.score !== null && c.score !== undefined
  );

  if (scoredChoices.length === 0) return null;

  if (question.questionType === "single_choice" || question.questionType === "yes_no") {
    const scores = scoredChoices.map((c) => c.score as number);
    return Math.max(...scores);
  }

  if (question.questionType === "multiple_choice") {
    const positiveScores = scoredChoices
      .map((c) => c.score as number)
      .filter((s) => s > 0);
    return positiveScores.reduce((sum, s) => sum + s, 0);
  }

  return null;
}

/**
 * 評估並計算整份問卷的提交答案
 */
export function evaluateSurveySubmission(
  questions: QuestionInput[],
  answers: AnswerSubmission[]
): SurveyScoreResult {
  const answerMap = new Map<string, AnswerSubmission>();
  answers.forEach((ans) => answerMap.set(ans.questionCode, ans));

  const questionsMap = new Map<string, QuestionInput>();
  questions.forEach((q) => questionsMap.set(q.code, q));

  const questionResults: QuestionScoreResult[] = [];
  const errors: { questionCode: string; message: string }[] = [];

  let totalScore: number | null = null;
  let maxScore: number | null = null;
  let hasAnyScoredQuestion = false;

  for (const question of questions) {
    const isVisible = isQuestionVisible(question, answerMap, questionsMap);
    const sub = answerMap.get(question.code);
    const result = evaluateQuestionAnswer(question, sub, isVisible);
    questionResults.push(result);

    if (!result.isValid && result.error) {
      errors.push({ questionCode: question.code, message: result.error });
    }

    if (result.isVisible && result.scoringEnabled) {
      hasAnyScoredQuestion = true;
      if (result.score !== null) {
        totalScore = (totalScore ?? 0) + result.score;
      }
      if (result.maxPossibleScore !== null) {
        maxScore = (maxScore ?? 0) + result.maxPossibleScore;
      }
    }
  }

  let percentage: number | null = null;
  if (totalScore !== null && maxScore !== null && maxScore > 0) {
    percentage = Math.round((totalScore / maxScore) * 10000) / 100;
  }

  return {
    isValid: errors.length === 0,
    errors,
    questionResults,
    totalScore: hasAnyScoredQuestion ? (totalScore ?? 0) : null,
    maxScore: hasAnyScoredQuestion ? maxScore : null,
    percentage,
  };
}
