/**
 * Pure Function Cross-tabulation Engine
 * Phase M9-F.1 (Descriptive 2-Way Cross-tabulation & Domain Contract)
 *
 * 核心原則：
 * 1. 嚴格純函數：0 DB I/O、0 Session 依賴、100% Deterministic。
 * 2. grandTotal 精確定義為「同時有效回答 Row 與 Col 之雙重有效作答 Response 數」 (count(valid(row) && valid(col)))。
 * 3. 複選題 (Multiple-choice) 正確解構為非互斥集合，每個填答者之重複選項自動去重 (Deduplicate)。
 * 4. 嚴格區分描述統計 (M9-F.1) 與推論檢定 (M9-F.2)，本模組不包含 Chi-Square / p-value / significance。
 * 5. 百分比統一四捨五入至小數點第 1 位。
 */

import {
  QuestionMeta,
  RawResponseData,
  RawAnswerData,
  CrossTabResult,
  CrossTabCell,
  CrossTabDimensionItem,
} from "./types";
import { isValidAnswer } from "./question-analytics";

/**
 * 從 Answer 中解析出選項字串陣列（自動去重）
 */
export function extractChoiceValues(answer: RawAnswerData | undefined): string[] {
  if (!answer || answer.rawValue === null || answer.rawValue === undefined) {
    return [];
  }

  const raw = String(answer.rawValue).trim();
  if (raw === "") return [];

  let values: string[] = [];

  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || parsed === undefined) {
      values = [];
    } else if (Array.isArray(parsed)) {
      values = parsed.map((v) => String(v).trim()).filter((v) => v !== "");
    } else if (typeof parsed === "boolean") {
      values = [parsed ? "yes" : "no"];
    } else {
      const s = String(parsed).trim();
      if (s !== "") values = [s];
    }
  } catch {
    values = [raw];
  }

  // 避免填答者同一題重複提交相同選項值造成二度計數
  return Array.from(new Set(values));
}

/**
 * 取得題目維度的選項清單 (Dimension Items)
 */
export function getDimensionItems(question: QuestionMeta): CrossTabDimensionItem[] {
  if (question.choices && question.choices.length > 0) {
    return question.choices
      .slice()
      .sort((a, b) => a.orderNum - b.orderNum)
      .map((c) => ({
        value: c.value,
        label: c.label || c.value,
        orderNum: c.orderNum,
        count: 0,
        percentage: 0,
      }));
  }

  // 若題型為 yes_no 且未定義 choices，預設提供 yes / no
  if (question.questionType === "yes_no") {
    return [
      { value: "yes", label: "是", orderNum: 1, count: 0, percentage: 0 },
      { value: "no", label: "否", orderNum: 2, count: 0, percentage: 0 },
    ];
  }

  return [];
}

/**
 * 執行 2-Way 交叉分析純函數聚合運算 (Analyze 2-Way Cross-tabulation)
 */
export function analyzeCrossTabulation(
  rowQuestion: QuestionMeta,
  colQuestion: QuestionMeta,
  responses: RawResponseData[]
): CrossTabResult {
  const totalResponses = responses.length;

  // 1. 建立維度選項項目
  const rowItems = getDimensionItems(rowQuestion);
  const colItems = getDimensionItems(colQuestion);

  // 2. 篩選出「同時有效作答 Row 與 Column」的雙重有效作答母體 (Paired Responses)
  const pairedResponses: Array<{
    rowValues: string[];
    colValues: string[];
  }> = [];

  responses.forEach((resp) => {
    const ansRow = resp.answers?.find((a) => a.questionId === rowQuestion.id);
    const ansCol = resp.answers?.find((a) => a.questionId === colQuestion.id);

    const isRowValid = isValidAnswer(ansRow);
    const isColValid = isValidAnswer(ansCol);

    // 只有在兩題皆為有效作答時才納入交叉分析母體
    if (isRowValid && isColValid) {
      const rowValues = extractChoiceValues(ansRow);
      const colValues = extractChoiceValues(ansCol);

      // 若解析後確有非空選項值，加入母體
      if (rowValues.length > 0 && colValues.length > 0) {
        pairedResponses.push({ rowValues, colValues });
      }
    }
  });

  const grandTotal = pairedResponses.length;
  const unpairedCount = Math.max(0, totalResponses - grandTotal);

  // 3. 建立二維交叉矩陣計數器與邊際計數器
  const rowCount = rowItems.length;
  const colCount = colItems.length;

  // cellCounts[r][c]
  const cellCounts: number[][] = Array.from({ length: rowCount }, () =>
    Array(colCount).fill(0)
  );

  // 邊際人數計數（選擇該 row/col 選項之雙重有效作答人數）
  const rowRespondentCounts = Array(rowCount).fill(0);
  const colRespondentCounts = Array(colCount).fill(0);

  // 快速查找 index map
  const rowIndexMap = new Map<string, number>();
  rowItems.forEach((item, idx) => rowIndexMap.set(item.value, idx));

  const colIndexMap = new Map<string, number>();
  colItems.forEach((item, idx) => colIndexMap.set(item.value, idx));

  // 4. 聚合填答計數
  pairedResponses.forEach(({ rowValues, colValues }) => {
    const matchedRowIndices: number[] = [];
    rowValues.forEach((rv) => {
      const idx = rowIndexMap.get(rv);
      if (idx !== undefined) matchedRowIndices.push(idx);
    });

    const matchedColIndices: number[] = [];
    colValues.forEach((cv) => {
      const idx = colIndexMap.get(cv);
      if (idx !== undefined) matchedColIndices.push(idx);
    });

    // 記錄邊際人數 (每個填答者對同一 row/col choice 最多貢獻 1 次)
    matchedRowIndices.forEach((ri) => {
      rowRespondentCounts[ri]++;
    });
    matchedColIndices.forEach((ci) => {
      colRespondentCounts[ci]++;
    });

    // 記錄交叉 Cell 次數
    matchedRowIndices.forEach((ri) => {
      matchedColIndices.forEach((ci) => {
        cellCounts[ri][ci]++;
      });
    });
  });

  // 5. 計算 Row / Col 邊際項目的總計與百分比
  const finalRowItems: CrossTabDimensionItem[] = rowItems.map((item, idx) => {
    const count = rowRespondentCounts[idx];
    const percentage =
      grandTotal > 0 ? Math.round((count / grandTotal) * 1000) / 10 : 0;
    return {
      ...item,
      count,
      percentage,
    };
  });

  const finalColItems: CrossTabDimensionItem[] = colItems.map((item, idx) => {
    const count = colRespondentCounts[idx];
    const percentage =
      grandTotal > 0 ? Math.round((count / grandTotal) * 1000) / 10 : 0;
    return {
      ...item,
      count,
      percentage,
    };
  });

  // 6. 計算矩陣每個 Cell 的百分比
  const matrix: CrossTabCell[][] = [];

  for (let ri = 0; ri < rowCount; ri++) {
    const rowCells: CrossTabCell[] = [];
    const rItem = finalRowItems[ri];
    const rTotal = rItem.count;

    for (let ci = 0; ci < colCount; ci++) {
      const cItem = finalColItems[ci];
      const cTotal = cItem.count;
      const count = cellCounts[ri][ci];

      const rowPercentage =
        rTotal > 0 ? Math.round((count / rTotal) * 1000) / 10 : 0;
      const colPercentage =
        cTotal > 0 ? Math.round((count / cTotal) * 1000) / 10 : 0;
      const totalPercentage =
        grandTotal > 0 ? Math.round((count / grandTotal) * 1000) / 10 : 0;

      rowCells.push({
        rowChoiceValue: rItem.value,
        colChoiceValue: cItem.value,
        count,
        rowPercentage,
        colPercentage,
        totalPercentage,
      });
    }

    matrix.push(rowCells);
  }

  return {
    rowQuestion: {
      id: rowQuestion.id,
      code: rowQuestion.code,
      title: rowQuestion.title,
      type: rowQuestion.questionType,
    },
    colQuestion: {
      id: colQuestion.id,
      code: colQuestion.code,
      title: colQuestion.title,
      type: colQuestion.questionType,
    },
    matrix,
    rowItems: finalRowItems,
    colItems: finalColItems,
    grandTotal,
    unpairedCount,
    totalResponses,
  };
}
