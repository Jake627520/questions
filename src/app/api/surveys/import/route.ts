import { NextRequest, NextResponse } from "next/server";
import { parseSurveyExcel, hasValidXlsxSignature, MAX_FILE_SIZE } from "@/lib/excel-parser";
import { validateQuestionsStructure } from "@/lib/survey-engine";
import { db } from "@/lib/db";
import { QuestionType, SurveyStatus } from "@prisma/client";
import { ImportResponse, ValidationIssue } from "@/types/surveyImport";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const mode = (formData.get("mode") as string) || "preview";
    const title = (formData.get("title") as string) || "匯入題庫問卷";
    const description = (formData.get("description") as string) || "";
    const status = (formData.get("status") as SurveyStatus) || SurveyStatus.PUBLISHED;
    const parentSurveyId = (formData.get("parentSurveyId") as string) || null;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: "請上傳 Excel 檔案 (.xlsx)",
          errors: [
            {
              code: "FILE_EXTENSION_INVALID",
              severity: "error",
              sheet: "system",
              message: "請上傳 Excel 檔案 (.xlsx)",
            },
          ],
          warnings: [],
        } satisfies ImportResponse,
        { status: 400 }
      );
    }

    // ===== 檔案大小上限檢查 (5MB) =====
    if (file.size > MAX_FILE_SIZE) {
      const issue: ValidationIssue = {
        code: "FILE_TOO_LARGE",
        severity: "error",
        sheet: "system",
        message: `檔案大小不可超過 ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      };

      return NextResponse.json(
        {
          success: false,
          error: issue.message,
          errors: [issue],
          warnings: [],
        } satisfies ImportResponse,
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();

    // ===== Magic Bytes 簽章安全檢查 =====
    if (!hasValidXlsxSignature(arrayBuffer)) {
      const issue: ValidationIssue = {
        code: "FILE_SIGNATURE_INVALID",
        severity: "error",
        sheet: "system",
        message: "檔案內容不是有效的 Excel (.xlsx) 格式（可能被竄改副檔名或檔案損毀）",
      };

      return NextResponse.json(
        {
          success: false,
          error: issue.message,
          errors: [issue],
          warnings: [],
        } satisfies ImportResponse,
        { status: 400 }
      );
    }
    // ===== 檢查結束 =====

    const { questions, errors: parseErrors, issues: parseIssues } = await parseSurveyExcel(
      Buffer.from(arrayBuffer)
    );

    const allErrors = [...parseErrors];
    const allIssues: ValidationIssue[] = [...(parseIssues || [])];

    // M3/M4: 題目結構、標籤比對存在性與循環相依檢核
    const structureValidation = validateQuestionsStructure(questions);
    if (!structureValidation.isValid) {
      allErrors.push(...structureValidation.errors);
      structureValidation.errors.forEach((errMsg) => {
        let code: ValidationIssue["code"] = "UNKNOWN_ERROR";
        if (errMsg.includes("循環相依")) {
          code = "BRANCHING_CYCLE";
        } else if (errMsg.includes("條件規則")) {
          code = "INVALID_VISIBILITY_RULE";
        } else if (errMsg.includes("重複的選項")) {
          code = "DUPLICATE_CHOICE_VALUE";
        }
        allIssues.push({
          code,
          severity: "error",
          sheet: "questions",
          message: errMsg,
        });
      });
    }

    const errorIssues = allIssues.filter((i) => i.severity === "error");
    const warningIssues = allIssues.filter((i) => i.severity === "warning");

    if (allErrors.length > 0 || errorIssues.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Excel 格式、條件規則或結構校驗未通過",
          errors: errorIssues.length > 0 ? errorIssues : allErrors.map((msg) => ({
            code: "UNKNOWN_ERROR",
            severity: "error",
            sheet: "system",
            message: msg,
          })),
          warnings: warningIssues,
          questions,
        } as any,
        { status: 422 }
      );
    }

    if (questions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Excel 內未找到任何有效題目",
          errors: [
            {
              code: "REQUIRED_FIELD_EMPTY",
              severity: "error",
              sheet: "questions",
              message: "Excel 內未找到任何有效題目",
            },
          ],
          warnings: [],
        } satisfies ImportResponse,
        { status: 400 }
      );
    }

    const totalChoices = questions.reduce((acc, q) => acc + (q.choices?.length || 0), 0);
    const requiredQuestions = questions.filter((q) => q.required).length;
    const scoredQuestions = questions.filter((q) => q.scoringEnabled).length;
    const conditionalQuestions = questions.filter((q) => !!q.visibilityRules).length;
    const importId = `IMP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    if (mode === "preview") {
      return NextResponse.json({
        success: true,
        mode: "preview",
        importId,
        questionCount: questions.length,
        questions,
        summary: {
          questions: questions.length,
          choices: totalChoices,
          requiredQuestions,
          scoredQuestions,
          conditionalQuestions,
          sheets: 2,
          warnings: warningIssues.length,
        },
        errors: [],
        warnings: warningIssues,
      } satisfies ImportResponse);
    }

    // ===== P0-I: 版權 / 使用者內容確認檢查 =====
    const copyrightConfirmed =
      formData.get("copyrightConfirmed") === "true" ||
      formData.get("copyrightConfirmed") === "1";

    if (mode === "save" && !copyrightConfirmed) {
      return NextResponse.json(
        {
          success: false,
          error: "請先確認您具有匯入內容的合法使用權利",
          errors: [
            {
              code: "COPYRIGHT_NOT_CONFIRMED",
              severity: "error",
              sheet: "system",
              message: "未確認使用者內容與版權宣告",
              suggestion: "請在確認匯入前勾選「我確認我有權使用並匯入上述內容」聲明方塊。",
            },
          ],
          warnings: [],
        } satisfies ImportResponse,
        { status: 400 }
      );
    }

    let version = 1;
    let organizationId = "default-org-id";
    if (parentSurveyId) {
      const parent = await db.survey.findUnique({ where: { id: parentSurveyId } });
      if (parent) {
        version = parent.version + 1;
        organizationId = parent.organizationId;
      }
    }

    // ===== P0-F: All-or-Nothing Import / Atomic Transaction =====
    const survey = await db.$transaction(async (tx) => {
      return await tx.survey.create({
        data: {
          organizationId,
          title,
          description,
          status,
          version,
          parentSurveyId,
          questions: {
            create: questions.map((q) => ({
              orderNum: q.orderNum,
              code: q.code,
              title: q.title,
              description: q.description,
              questionType: q.questionType as QuestionType,
              required: q.required,
              scoringEnabled: q.scoringEnabled,
              reverseScore: q.reverseScore,
              visibilityRules: q.visibilityRules
                ? typeof q.visibilityRules === "string"
                  ? q.visibilityRules
                  : JSON.stringify(q.visibilityRules)
                : null,
              visibilityHint: q.visibilityHint || null,
              minSelections: q.minSelections,
              maxSelections: q.maxSelections,
              minValue: q.minValue,
              maxValue: q.maxValue,
              choices: {
                create: q.choices.map((c) => ({
                  orderNum: c.orderNum,
                  label: c.label,
                  value: c.value,
                  scoreEnabled: c.scoreEnabled,
                  score: c.score,
                  isOther: c.isOther,
                  requiresText: c.requiresText,
                  isNoneOfAbove: c.isNoneOfAbove,
                })),
              },
            })),
          },
        },
        include: {
          questions: {
            include: {
              choices: true,
            },
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      mode: "save",
      surveyId: survey.id,
      importId,
      version: survey.version,
      survey,
      summary: {
        questions: questions.length,
        choices: totalChoices,
        requiredQuestions,
        scoredQuestions,
        conditionalQuestions,
        sheets: 2,
        warnings: warningIssues.length,
      },
      errors: [],
      warnings: warningIssues,
    } satisfies ImportResponse);
  } catch (err: any) {
    const errorId = `IMP-ERR-${Date.now().toString(36).toUpperCase()}`;
    console.error(`[Excel Import API Error] ID: ${errorId}`, err);

    // P0-K / P0-L: 生產環境不洩漏伺服器檔案路徑、DB 連線字串或 Prisma 內部 stack trace
    return NextResponse.json(
      {
        success: false,
        error: `系統暫時無法完成匯入。如果問題持續發生，請聯絡系統管理員並提供代碼：${errorId}`,
        importId: errorId,
        errors: [
          {
            code: "DATABASE_IMPORT_FAILED",
            severity: "error",
            sheet: "system",
            message: `資料庫寫入或伺服器處理失敗 (${errorId})`,
            suggestion: "請檢查資料庫狀態或稍後重試，若持續失敗請提供代碼聯絡技術支援。",
          },
        ],
        warnings: [],
      } satisfies ImportResponse,
      { status: 500 }
    );
  }
}
