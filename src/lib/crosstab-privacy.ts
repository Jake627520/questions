/**
 * 交叉分析隱私保護與最小統計單元遮蔽引擎
 * (Server-side Privacy Filter with Minimum Cell Size & Complementary Suppression)
 */

export const MIN_CELL_SIZE = 5;

export interface RawCell {
  rowChoiceId: string;
  colChoiceId: string;
  count: number;
}

export interface SanitizedCell {
  colChoiceId: string;
  colLabel: string;
  count: number | null;
  rowPercentage: number | null;
  columnPercentage: number | null;
  totalPercentage: number | null;
  isSuppressed: boolean;
}

export interface SanitizedRow {
  rowChoiceId: string;
  rowLabel: string;
  rowTotalAnswered: number | null;
  isRowTotalSuppressed: boolean;
  cells: SanitizedCell[];
}

export interface CrosstabResult {
  surveyId: string;
  surveyTitle: string;
  isAnonymous: boolean;
  minCellSize: number;
  dimensionA: {
    questionId: string;
    code: string;
    title: string;
    type: string;
    totalAnswered: number;
    notAnsweredCount: number;
    options: { choiceId: string; label: string; value: string }[];
  };
  dimensionB: {
    questionId: string;
    code: string;
    title: string;
    type: string;
    totalAnswered: number;
    notAnsweredCount: number;
    options: { choiceId: string; label: string; value: string }[];
  };
  validPopulation: number;
  bothAnsweredCount: number;
  totalSurveyResponses: number;
  rows: SanitizedRow[];
  columnTotals: {
    colChoiceId: string;
    colLabel: string;
    totalAnswered: number | null;
    isColumnTotalSuppressed: boolean;
  }[];
}

/**
 * 伺服端隱私遮蔽與差額防護引擎 (Server-side Privacy Filter with Complementary Suppression)
 */
export function sanitizeCrosstabMatrix(params: {
  surveyId: string;
  surveyTitle: string;
  isAnonymous: boolean;
  qA: {
    id: string;
    code: string;
    title: string;
    questionType: string;
    choices: { id: string; label: string; value: string; orderNum: number }[];
  };
  qB: {
    id: string;
    code: string;
    title: string;
    questionType: string;
    choices: { id: string; label: string; value: string; orderNum: number }[];
  };
  rawMatrix: Record<string, Record<string, number>>; // [rowChoiceId][colChoiceId] -> count
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  totalSurveyResponses: number;
  bothAnsweredCount: number;
  qAAnsweredCount: number;
  qBAnsweredCount: number;
}): CrosstabResult {
  const {
    surveyId,
    surveyTitle,
    isAnonymous,
    qA,
    qB,
    rawMatrix,
    rowTotals,
    colTotals,
    totalSurveyResponses,
    bothAnsweredCount,
    qAAnsweredCount,
    qBAnsweredCount,
  } = params;

  const rowChoices =
    qA.choices.length > 0
      ? qA.choices
      : [{ id: "val", label: qA.title, value: "val", orderNum: 1 }];
  const colChoices =
    qB.choices.length > 0
      ? qB.choices
      : [{ id: "val", label: qB.title, value: "val", orderNum: 1 }];

  // 1. 標記 Primary Suppression (1 <= n < 5)
  const suppressedGrid: Record<string, Record<string, boolean>> = {};
  for (const r of rowChoices) {
    suppressedGrid[r.id] = {};
    for (const c of colChoices) {
      const cnt = rawMatrix[r.id]?.[c.id] || 0;
      if (cnt > 0 && cnt < MIN_CELL_SIZE) {
        suppressedGrid[r.id][c.id] = true;
      } else {
        suppressedGrid[r.id][c.id] = false;
      }
    }
  }

  // 2. 實施 Complementary Suppression (防差額回推)
  // A. 針對每一 Row 檢查
  for (const r of rowChoices) {
    const cellsInRow = colChoices.map((c) => ({
      colId: c.id,
      count: rawMatrix[r.id]?.[c.id] || 0,
      suppressed: suppressedGrid[r.id][c.id],
    }));

    const suppressedCount = cellsInRow.filter((x) => x.suppressed).length;
    if (suppressedCount === 1) {
      const nonSuppressedPositive = cellsInRow
        .filter((x) => !x.suppressed && x.count > 0)
        .sort((a, b) => a.count - b.count);

      if (nonSuppressedPositive.length > 0) {
        suppressedGrid[r.id][nonSuppressedPositive[0].colId] = true;
      }
    }
  }

  // B. 針對每一 Column 檢查
  for (const c of colChoices) {
    const cellsInCol = rowChoices.map((r) => ({
      rowId: r.id,
      count: rawMatrix[r.id]?.[c.id] || 0,
      suppressed: suppressedGrid[r.id][c.id],
    }));

    const suppressedCount = cellsInCol.filter((x) => x.suppressed).length;
    if (suppressedCount === 1) {
      const nonSuppressedPositive = cellsInCol
        .filter((x) => !x.suppressed && x.count > 0)
        .sort((a, b) => a.count - b.count);

      if (nonSuppressedPositive.length > 0) {
        suppressedGrid[nonSuppressedPositive[0].rowId][c.id] = true;
      }
    }
  }

  // 3. 判斷 Row Total 與 Column Total 是否存在邊界洩漏風險
  const isRowTotalSuppressedMap: Record<string, boolean> = {};
  for (const r of rowChoices) {
    const hasSuppressed = colChoices.some((c) => suppressedGrid[r.id][c.id]);
    const rTotal = rowTotals[r.id] || 0;
    if (
      (rTotal > 0 && rTotal < MIN_CELL_SIZE) ||
      (hasSuppressed &&
        colChoices.filter((c) => (rawMatrix[r.id]?.[c.id] || 0) > 0).length <= 1)
    ) {
      isRowTotalSuppressedMap[r.id] = true;
    } else {
      isRowTotalSuppressedMap[r.id] = false;
    }
  }

  const isColTotalSuppressedMap: Record<string, boolean> = {};
  for (const c of colChoices) {
    const hasSuppressed = rowChoices.some((r) => suppressedGrid[r.id][c.id]);
    const cTotal = colTotals[c.id] || 0;
    if (
      (cTotal > 0 && cTotal < MIN_CELL_SIZE) ||
      (hasSuppressed &&
        rowChoices.filter((r) => (rawMatrix[r.id]?.[c.id] || 0) > 0).length <= 1)
    ) {
      isColTotalSuppressedMap[c.id] = true;
    } else {
      isColTotalSuppressedMap[c.id] = false;
    }
  }

  // 4. 建構最終 Sanitized Matrix
  const sanitizedRows: SanitizedRow[] = rowChoices.map((r) => {
    const rTotal = rowTotals[r.id] || 0;
    const isRowSupp = isRowTotalSuppressedMap[r.id];

    const cells: SanitizedCell[] = colChoices.map((c) => {
      const isSupp = suppressedGrid[r.id][c.id];
      const rawCount = rawMatrix[r.id]?.[c.id] || 0;
      const cTotal = colTotals[c.id] || 0;

      if (isSupp) {
        return {
          colChoiceId: c.id,
          colLabel: c.label,
          count: null,
          rowPercentage: null,
          columnPercentage: null,
          totalPercentage: null,
          isSuppressed: true,
        };
      }

      if (rawCount === 0) {
        return {
          colChoiceId: c.id,
          colLabel: c.label,
          count: 0,
          rowPercentage: 0,
          columnPercentage: 0,
          totalPercentage: 0,
          isSuppressed: false,
        };
      }

      const rowPct = rTotal > 0 ? Math.round((rawCount / rTotal) * 1000) / 10 : null;
      const colPct = cTotal > 0 ? Math.round((rawCount / cTotal) * 1000) / 10 : null;
      const totPct =
        bothAnsweredCount > 0
          ? Math.round((rawCount / bothAnsweredCount) * 1000) / 10
          : null;

      return {
        colChoiceId: c.id,
        colLabel: c.label,
        count: rawCount,
        rowPercentage: rowPct,
        columnPercentage: colPct,
        totalPercentage: totPct,
        isSuppressed: false,
      };
    });

    return {
      rowChoiceId: r.id,
      rowLabel: r.label,
      rowTotalAnswered: isRowSupp ? null : rTotal,
      isRowTotalSuppressed: isRowSupp,
      cells,
    };
  });

  const columnTotals = colChoices.map((c) => {
    const cTotal = colTotals[c.id] || 0;
    const isColSupp = isColTotalSuppressedMap[c.id];
    return {
      colChoiceId: c.id,
      colLabel: c.label,
      totalAnswered: isColSupp ? null : cTotal,
      isColumnTotalSuppressed: isColSupp,
    };
  });

  return {
    surveyId,
    surveyTitle,
    isAnonymous,
    minCellSize: MIN_CELL_SIZE,
    dimensionA: {
      questionId: qA.id,
      code: qA.code,
      title: qA.title,
      type: qA.questionType,
      totalAnswered: qAAnsweredCount,
      notAnsweredCount: Math.max(0, totalSurveyResponses - qAAnsweredCount),
      options: rowChoices.map((rc) => ({
        choiceId: rc.id,
        label: rc.label,
        value: rc.value,
      })),
    },
    dimensionB: {
      questionId: qB.id,
      code: qB.code,
      title: qB.title,
      type: qB.questionType,
      totalAnswered: qBAnsweredCount,
      notAnsweredCount: Math.max(0, totalSurveyResponses - qBAnsweredCount),
      options: colChoices.map((cc) => ({
        choiceId: cc.id,
        label: cc.label,
        value: cc.value,
      })),
    },
    validPopulation: bothAnsweredCount,
    bothAnsweredCount,
    totalSurveyResponses,
    rows: sanitizedRows,
    columnTotals,
  };
}
