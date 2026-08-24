export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ResponseStatus } from "@prisma/client";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  hasRole,
  ROLES,
} from "@/lib/auth";
import ExcelJS from "exceljs";
import {
  analyzeCrossTabulation,
  analyzeCrossTabStatistics,
  applyCrossTabPrivacy,
} from "@/lib/analytics";
import { QuestionMeta } from "@/lib/analytics/types";

/**
 * GET /api/surveys/[id]/analytics/crosstab/export
 * Phase M9-F.6 / Release Gate: 2-Way 交叉分析多工作表 Excel 報表匯出端點
 * 嚴格套用 F.1 聚合 -> F.2 統計檢定 -> F.3 隱私抑制安全管線，與 Web UI 100% 遮蔽一致
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

    const rowQuestionId = searchParams.get("rowQuestionId") || searchParams.get("questionA");
    const colQuestionId = searchParams.get("colQuestionId") || searchParams.get("questionB");
    const timeRange = searchParams.get("timeRange") || "all";
    const statusParam = searchParams.get("status") || "ALL";
    const dateFromStr = searchParams.get("dateFrom");
    const dateToStr = searchParams.get("dateTo");

    if (!rowQuestionId || !colQuestionId) {
      return NextResponse.json(
        { error: "MISSING_DIMENSIONS", message: "請指定分組變項 (rowQuestionId) 與目標變項 (colQuestionId)。" },
        { status: 400 }
      );
    }

    if (rowQuestionId === colQuestionId) {
      return NextResponse.json(
        { error: "IDENTICAL_DIMENSIONS", message: "分組變項與目標變項不能為相同題目。" },
        { status: 400 }
      );
    }

    // 1. 查詢問卷與題目
    const survey = await db.survey.findUnique({
      where: { id },
      include: {
        questions: {
          where: {
            id: { in: [rowQuestionId, colQuestionId] },
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

    const rowQuestion = survey.questions.find((q) => q.id === rowQuestionId);
    const colQuestion = survey.questions.find((q) => q.id === colQuestionId);

    if (!rowQuestion || !colQuestion) {
      return NextResponse.json(
        { error: "INVALID_QUESTIONS", message: "指定之題目不存在或不屬於此問卷。" },
        { status: 400 }
      );
    }

    // 3. 建構時間與狀態過濾條件
    const whereClause: any = {
      surveyId: survey.id,
    };

    if (statusParam === "COMPLETED") {
      whereClause.status = ResponseStatus.COMPLETED;
    } else if (statusParam === "IN_PROGRESS") {
      whereClause.status = ResponseStatus.IN_PROGRESS;
    }

    const now = new Date();
    if (timeRange === "today") {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      whereClause.createdAt = { gte: startOfDay };
    } else if (timeRange === "7d") {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      whereClause.createdAt = { gte: sevenDaysAgo };
    } else if (timeRange === "30d") {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      whereClause.createdAt = { gte: thirtyDaysAgo };
    }

    if (dateFromStr || dateToStr) {
      whereClause.createdAt = whereClause.createdAt || {};
      if (dateFromStr) {
        whereClause.createdAt.gte = new Date(dateFromStr);
      }
      if (dateToStr) {
        whereClause.createdAt.lte = new Date(dateToStr);
      }
    }

    // 4. 取得作答資料
    const responses = await db.response.findMany({
      where: whereClause,
      select: {
        id: true,
        status: true,
        answers: {
          where: {
            questionId: { in: [rowQuestion.id, colQuestion.id] },
          },
          select: {
            questionId: true,
            rawValue: true,
          },
        },
      },
    });

    // 5. 執行標準純函數管線 (F.1 -> F.2 -> F.3)
    const toQuestionMeta = (q: typeof rowQuestion): QuestionMeta => ({
      id: q.id,
      code: q.code,
      orderNum: q.orderNum,
      title: q.title,
      description: q.description,
      questionType: q.questionType,
      required: q.required,
      scoringEnabled: q.scoringEnabled,
      reverseScore: q.reverseScore,
      choices: q.choices.map((c) => ({
        id: c.id,
        orderNum: c.orderNum,
        label: c.label,
        value: c.value,
        scoreEnabled: c.scoreEnabled,
        score: c.score,
      })),
    });

    const rowMeta = toQuestionMeta(rowQuestion);
    const colMeta = toQuestionMeta(colQuestion);

    const crosstabResult = analyzeCrossTabulation(rowMeta, colMeta, responses);
    const statsResult = analyzeCrossTabStatistics(crosstabResult);
    crosstabResult.statistics = statsResult;
    const protectedResult = applyCrossTabPrivacy(crosstabResult, {
      minCellSize: 5,
    });

    // 6. 使用 ExcelJS 產生專業多工作表 Excel 活頁簿
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Survey Platform Enterprise";
    workbook.created = new Date();

    const headerFill: ExcelJS.Fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E7FF" },
    };

    const subHeaderFill: ExcelJS.Fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    };

    const totalFill: ExcelJS.Fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" },
    };

    // Helper: 產生標準矩陣表格
    const buildMatrixSheet = (
      sheetName: string,
      titleText: string,
      cellExtractor: (rIdx: number, cIdx: number) => string | number
    ) => {
      const sheet = workbook.addWorksheet(sheetName);

      // Meta header
      sheet.addRow([`${survey.title} - ${titleText}`]);
      sheet.addRow([`分組變項 (Row)：[${rowQuestion.code}] ${rowQuestion.title}`]);
      sheet.addRow([`目標變項 (Col)：[${colQuestion.code}] ${colQuestion.title}`]);
      sheet.addRow([
        `雙題有效作答樣本 (Valid N)：${protectedResult.grandTotalDisplay} 人 / 問卷總回覆：${protectedResult.totalResponses} 筆`,
      ]);
      sheet.addRow([]);

      sheet.getRow(1).font = { bold: true, size: 13, color: { argb: "FF1E293B" } };
      sheet.getRow(2).font = { size: 10, color: { argb: "FF475569" } };
      sheet.getRow(3).font = { size: 10, color: { argb: "FF475569" } };
      sheet.getRow(4).font = { size: 10, color: { argb: "FF475569" } };

      // Table header
      const colLabels = protectedResult.colItems.map((c) => `${c.label} (n=${c.displayValue})`);
      const headerRow = sheet.addRow(["分組選項 \\ 目標選項", ...colLabels, "合計 (Row Total)"]);
      headerRow.font = { bold: true, color: { argb: "FF1E1B4B" } };
      headerRow.fill = headerFill;

      // Data rows
      protectedResult.rowItems.forEach((rItem, rIdx) => {
        const rowData: (string | number)[] = [`${rItem.label} (n=${rItem.displayValue})`];
        protectedResult.colItems.forEach((_, cIdx) => {
          rowData.push(cellExtractor(rIdx, cIdx));
        });
        rowData.push(rItem.displayValue);
        const dataRow = sheet.addRow(rowData);
        dataRow.getCell(1).fill = subHeaderFill;
        dataRow.getCell(rowData.length).fill = subHeaderFill;
      });

      // Column total row
      const colTotalData: (string | number)[] = ["合計 (Col Total)"];
      protectedResult.colItems.forEach((cItem) => {
        colTotalData.push(cItem.displayValue);
      });
      colTotalData.push(protectedResult.grandTotalDisplay);
      const totalRow = sheet.addRow(colTotalData);
      totalRow.font = { bold: true, color: { argb: "FF0F172A" } };
      totalRow.fill = totalFill;

      // Footnote
      sheet.addRow([]);
      const footnote = sheet.addRow([
        "* 依去識別化安全政策，次數小於 5 之單元格（< 5）與差額可反推單元（—）皆已套用 Primary / Complementary 遮蔽防護。",
      ]);
      footnote.font = { italic: true, size: 9, color: { argb: "FF64748B" } };

      sheet.columns.forEach((col) => {
        col.width = 24;
      });
    };

    // Sheet 1: 次數矩陣 (Counts)
    buildMatrixSheet("次數交叉表 (Counts)", "交叉分析次數矩陣", (rIdx, cIdx) => {
      const cell = protectedResult.matrix[rIdx][cIdx];
      return cell.displayValue;
    });

    // Sheet 2: 列百分比 (Row %)
    buildMatrixSheet("列百分比 (Row %)", "交叉分析列百分比矩陣", (rIdx, cIdx) => {
      const cell = protectedResult.matrix[rIdx][cIdx];
      if (cell.isSuppressed) return cell.displayValue;
      return cell.rowPercentage !== null ? `${cell.rowPercentage}%` : "—";
    });

    // Sheet 3: 行百分比 (Col %)
    buildMatrixSheet("行百分比 (Col %)", "交叉分析行百分比矩陣", (rIdx, cIdx) => {
      const cell = protectedResult.matrix[rIdx][cIdx];
      if (cell.isSuppressed) return cell.displayValue;
      return cell.colPercentage !== null ? `${cell.colPercentage}%` : "—";
    });

    // Sheet 4: 總百分比 (Total %)
    buildMatrixSheet("總百分比 (Total %)", "交叉分析總百分比矩陣", (rIdx, cIdx) => {
      const cell = protectedResult.matrix[rIdx][cIdx];
      if (cell.isSuppressed) return cell.displayValue;
      return cell.totalPercentage !== null ? `${cell.totalPercentage}%` : "—";
    });

    // Sheet 5: 推論統計與檢定 (Inference & Stats)
    const statsSheet = workbook.addWorksheet("推論統計與檢定 (Statistics)");
    statsSheet.addRow([`${survey.title} - 交叉分析推論統計與獨立性檢定`]);
    statsSheet.addRow([]);
    statsSheet.getRow(1).font = { bold: true, size: 13, color: { argb: "FF1E293B" } };

    const statsHeader = statsSheet.addRow(["統計指標項目 (Metric)", "檢定數值 / 結果", "參考解讀說明"]);
    statsHeader.font = { bold: true };
    statsHeader.fill = headerFill;

    const stats = protectedResult.statistics;
    if (
      rowQuestion.questionType === "multiple_choice" ||
      colQuestion.questionType === "multiple_choice"
    ) {
      statsSheet.addRow(["分析模式", "描述性交叉分析 (Descriptive Only)", "題目包含複選非互斥選項，未套用一般皮爾森卡方獨立性檢定"]);
    } else if (!stats || !protectedResult.privacy.statisticsDisplayable) {
      statsSheet.addRow(["檢定狀態", "樣本不足 (N < 5)", "有效母體樣本數小於 5，依去識別化安全政策不顯示推論統計值"]);
    } else {
      statsSheet.addRow(["雙題有效樣本數 (Valid N)", stats.sampleSize, "同時完成兩題作答之受訪者總數"]);
      statsSheet.addRow(["皮爾森卡方值 (Chi-Square χ²)", stats.chiSquare !== null ? stats.chiSquare.toFixed(4) : "—", "度量兩變項間之獨立性偏離程度"]);
      statsSheet.addRow(["自由度 (Degrees of Freedom, df)", stats.degreesOfFreedom, "(列數 - 1) × (行數 - 1)"]);
      const isSignificant = stats.pValue !== null && stats.pValue < 0.05;
      statsSheet.addRow([
        "統計顯著性 (p-value)",
        stats.pValue !== null ? (stats.pValue < 0.001 ? "< 0.001" : stats.pValue.toFixed(4)) : "—",
        isSignificant ? "達到統計顯著性 (p < 0.05，拒絕獨立虛無假說)" : "未達統計顯著 (p ≥ 0.05，無法拒絕獨立假說)",
      ]);
      statsSheet.addRow([
        "Cramér's V 關聯強度",
        stats.cramersV !== null ? stats.cramersV.toFixed(4) : "—",
        stats.cramersV !== null
          ? stats.cramersV < 0.1
            ? "極微弱相關 (Negligible)"
            : stats.cramersV < 0.3
            ? "弱相關 (Weak)"
            : stats.cramersV < 0.5
            ? "中等相關 (Moderate)"
            : "強相關 (Strong)"
          : "—",
      ]);
      if (stats.cellsBelowExpectedThreshold > 0) {
        statsSheet.addRow([
          "Cochran 檢定警示",
          `期望次數過低 (共 ${stats.cellsBelowExpectedThreshold} 格)`,
          "部分儲存格之期望次數小於 5，卡方檢定近似值可能偏誤，建議謹慎解讀",
        ]);
      }
    }

    statsSheet.columns.forEach((col, idx) => {
      col.width = idx === 0 ? 30 : idx === 1 ? 25 : 45;
    });

    // Sheet 6: 報表資訊與隱私宣告 (Metadata & Privacy)
    const metaSheet = workbook.addWorksheet("報表資訊與隱私宣告");
    metaSheet.addRow(["項目 (Field)", "詳細內容 (Details)"]);
    metaSheet.getRow(1).font = { bold: true };
    metaSheet.getRow(1).fill = headerFill;

    metaSheet.addRow(["問卷識別碼 (Survey ID)", survey.id]);
    metaSheet.addRow(["問卷標題 (Survey Title)", survey.title]);
    metaSheet.addRow(["問卷版本 (Version)", `v${survey.version}`]);
    metaSheet.addRow(["分組變項 (Row Dimension)", `[${rowQuestion.code}] ${rowQuestion.title} (${rowQuestion.questionType})`]);
    metaSheet.addRow(["目標變項 (Col Dimension)", `[${colQuestion.code}] ${colQuestion.title} (${colQuestion.questionType})`]);
    metaSheet.addRow(["匯出時間 (Export Timestamp)", new Date().toISOString()]);
    metaSheet.addRow(["時間篩選 (Time Range Filter)", timeRange]);
    metaSheet.addRow(["狀態篩選 (Status Filter)", statusParam]);
    metaSheet.addRow(["最小單元遮蔽門檻 (Min Cell Size)", protectedResult.privacy.minCellSize]);
    metaSheet.addRow(["Primary 遮蔽單元數", protectedResult.privacy.primarySuppressedCount]);
    metaSheet.addRow(["Complementary 遮蔽單元數", protectedResult.privacy.complementarySuppressedCount]);
    metaSheet.addRow(["隱私保護宣告 (Privacy Notice)", protectedResult.privacy.privacyNotice || "已啟用去識別化隱私防護"]);

    metaSheet.columns.forEach((col, idx) => {
      col.width = idx === 0 ? 32 : 55;
    });

    const buffer = await workbook.xlsx.writeBuffer();

    const sanitizedTitle = survey.title.replace(/[\s/\\?%*:|"<>]/g, "_");
    const filename = `crosstab_${sanitizedTitle}_${rowQuestion.code}_${colQuestion.code}_v${survey.version}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
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
