export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ResponseStatus } from "@prisma/client";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  getUserMembership,
  hasRole,
  ROLES,
} from "@/lib/auth";
import ExcelJS from "exceljs";
import { sanitizeCrosstabMatrix } from "@/lib/crosstab-privacy";

/**
 * GET /api/surveys/[id]/analytics/crosstab/export
 * 2-Way 交叉分析 Excel 報表匯出端點 (嚴格套用相同的伺服端隱私遮蔽與差額防護)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const { id } = params;
    const { searchParams } = new URL(req.url);

    const questionAId = searchParams.get("questionA");
    const questionBId = searchParams.get("questionB");

    if (!questionAId || !questionBId) {
      return NextResponse.json(
        { error: "MISSING_DIMENSIONS", message: "請指定分組題目 questionA 與目標題目 questionB。" },
        { status: 400 }
      );
    }

    // 1. 查詢問卷與題目
    const survey = await db.survey.findUnique({
      where: { id },
      include: {
        questions: {
          where: {
            id: { in: [questionAId, questionBId] },
          },
          include: {
            choices: {
              orderBy: { orderNum: "asc" },
            },
          },
        },
      },
    });

    if (!survey) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "找不到該問卷" },
        { status: 404 }
      );
    }

    // 2. 驗證 Membership 與 RBAC (OWNER / ADMIN / EDITOR 允許匯出)
    const { allowed, membership } = await hasRole(auth.user.id, survey.organizationId, ROLES.EDITORS);
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權匯出此問卷的交叉分析報表");
    }

    if (!allowed) {
      return forbiddenResponse("您的角色權限不足，僅管理員與編輯者可匯出交叉分析報表");
    }

    const qA = survey.questions.find((q) => q.id === questionAId);
    const qB = survey.questions.find((q) => q.id === questionBId);

    if (!qA || !qB) {
      return NextResponse.json(
        { error: "INVALID_QUESTIONS", message: "指定之題目不存在或不屬於此問卷。" },
        { status: 400 }
      );
    }

    // 3. 取得所有作答資料
    const responses = await db.response.findMany({
      where: {
        surveyId: survey.id,
      },
      select: {
        id: true,
        answers: {
          where: {
            questionId: { in: [qA.id, qB.id] },
          },
          select: {
            questionId: true,
            rawValue: true,
          },
        },
      },
    });

    const totalSurveyResponses = responses.length;

    const parseAnswerValues = (rawValue: string): string[] => {
      if (!rawValue || rawValue.trim() === "") return [];
      try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
        if (parsed !== null && parsed !== undefined && String(parsed).trim() !== "") return [String(parsed).trim()];
      } catch {
        const trimmed = rawValue.trim();
        if (trimmed !== "" && trimmed !== "null") return [trimmed];
      }
      return [];
    };

    const getChoiceIdForVal = (q: typeof qA, val: string): string | null => {
      const match = q.choices.find((c) => c.value === val || c.id === val || c.label === val);
      return match ? match.id : null;
    };

    const rawMatrix: Record<string, Record<string, number>> = {};
    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};

    let bothAnsweredCount = 0;
    let qAAnsweredCount = 0;
    let qBAnsweredCount = 0;

    for (const resp of responses) {
      const ansA = resp.answers.find((a) => a.questionId === qA.id);
      const ansB = resp.answers.find((a) => a.questionId === qB.id);

      const valsA = ansA ? parseAnswerValues(ansA.rawValue) : [];
      const valsB = ansB ? parseAnswerValues(ansB.rawValue) : [];

      const hasA = valsA.length > 0;
      const hasB = valsB.length > 0;

      if (hasA) qAAnsweredCount++;
      if (hasB) qBAnsweredCount++;

      if (hasA && hasB) {
        bothAnsweredCount++;

        const choiceIdsA = qA.choices.length > 0
          ? valsA.map((v) => getChoiceIdForVal(qA, v)).filter(Boolean) as string[]
          : ["val"];

        const choiceIdsB = qB.choices.length > 0
          ? valsB.map((v) => getChoiceIdForVal(qB, v)).filter(Boolean) as string[]
          : ["val"];

        for (const cidA of choiceIdsA) {
          rowTotals[cidA] = (rowTotals[cidA] || 0) + 1;
          if (!rawMatrix[cidA]) rawMatrix[cidA] = {};

          for (const cidB of choiceIdsB) {
            rawMatrix[cidA][cidB] = (rawMatrix[cidA][cidB] || 0) + 1;
          }
        }

        for (const cidB of choiceIdsB) {
          colTotals[cidB] = (colTotals[cidB] || 0) + 1;
        }
      }
    }

    // 4. 套用單一伺服端 Privacy Filter
    const sanitized = sanitizeCrosstabMatrix({
      surveyId: survey.id,
      surveyTitle: survey.title,
      isAnonymous: survey.isAnonymous,
      qA,
      qB,
      rawMatrix,
      rowTotals,
      colTotals,
      totalSurveyResponses,
      bothAnsweredCount,
      qAAnsweredCount,
      qBAnsweredCount,
    });

    // 5. 使用 ExcelJS 產生 Excel 檔案
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Survey Platform Enterprise";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("交叉分析報表 (Cross-tab)");

    // 標題與基本資訊
    sheet.addRow([`${survey.title} - 交叉分析報表`]);
    sheet.addRow([`分組變項 (Row)：[${qA.code}] ${qA.title}`]);
    sheet.addRow([`目標變項 (Col)：[${qB.code}] ${qB.title}`]);
    sheet.addRow([`雙題有效作答樣本 (Valid N)：${sanitized.validPopulation} 人 / 問卷總回覆：${sanitized.totalSurveyResponses} 筆`]);
    sheet.addRow([]);

    // 格式化表頭
    const colLabels = sanitized.dimensionB.options.map((o) => o.label);
    const headerRow = ["分組選項 \\ 目標選項", ...colLabels, "合計 (Row Total)"];
    const tableHeader = sheet.addRow(headerRow);
    tableHeader.font = { bold: true };
    tableHeader.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E7FF" },
    };

    // 填入資料列 (嚴格套用遮蔽 "< 5*")
    for (const r of sanitized.rows) {
      const rowValues: (string | number)[] = [r.rowLabel];
      for (const c of r.cells) {
        if (c.isSuppressed) {
          rowValues.push("< 5*");
        } else if (c.count !== null) {
          rowValues.push(`${c.count} (${c.rowPercentage}%)`);
        } else {
          rowValues.push("-");
        }
      }
      rowValues.push(r.isRowTotalSuppressed ? "< 5*" : (r.rowTotalAnswered ?? "-"));
      sheet.addRow(rowValues);
    }

    // 填入合計列 (Column Totals)
    const colTotalRow: (string | number)[] = ["合計 (Col Total)"];
    for (const ct of sanitized.columnTotals) {
      colTotalRow.push(ct.isColumnTotalSuppressed ? "< 5*" : (ct.totalAnswered ?? "-"));
    }
    colTotalRow.push(sanitized.validPopulation);
    const totalRow = sheet.addRow(colTotalRow);
    totalRow.font = { bold: true };

    sheet.addRow([]);
    const footnote = sheet.addRow(["* 依隱私保護政策，樣本數小於 5 之統計單元與差額風險單元予以遮蔽。"]);
    footnote.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };

    sheet.columns.forEach((col) => {
      col.width = 22;
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="crosstab-${qA.code}-${qB.code}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error("[Crosstab Export Error]:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "匯出交叉分析報表失敗" },
      { status: 500 }
    );
  }
}
