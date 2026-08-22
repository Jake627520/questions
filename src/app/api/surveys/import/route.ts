import { NextRequest, NextResponse } from "next/server";
import { parseSurveyExcel, hasValidXlsxSignature, MAX_FILE_SIZE } from "@/lib/excel-parser";
import { validateQuestionsStructure } from "@/lib/survey-engine";
import { db } from "@/lib/db";
import { ImportStatus, QuestionType, SurveyStatus } from "@prisma/client";
import { ImportResponse, ValidationIssue } from "@/types/surveyImport";
import { getCurrentUser, isUserInOrganization, forbiddenResponse, hasRole, ROLES } from "@/lib/auth";

function generateImportId(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `IMP-${dateStr}-${randStr}`;
}

async function recordFailedImport(params: {
  importId: string;
  organizationId: string;
  fileName?: string | null;
  fileSize?: number | null;
  mode: string;
  errorCode: string;
  errorMessage: string;
  errorDetails?: ValidationIssue[];
  copyrightConfirmed?: boolean;
}) {
  try {
    // 確保 default organization 存在
    await db.organization.upsert({
      where: { slug: "default" },
      update: {},
      create: {
        id: "default-org-id",
        name: "Default Workspace",
        slug: "default",
      },
    });

    await db.surveyImport.create({
      data: {
        importId: params.importId,
        organizationId: params.organizationId,
        fileName: params.fileName || "unknown.xlsx",
        fileSize: params.fileSize || 0,
        mode: params.mode,
        status: ImportStatus.FAILED,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
        errorDetails: params.errorDetails ? JSON.stringify(params.errorDetails) : null,
        copyrightConfirmed: params.copyrightConfirmed ?? false,
        completedAt: new Date(),
      },
    });
  } catch (auditErr) {
    console.error("[SurveyImport Audit Failure Log Error]:", auditErr);
  }
}

export async function POST(req: NextRequest) {
  const importId = generateImportId();

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const mode = (formData.get("mode") as string) || "preview";
    const title = (formData.get("title") as string) || "匯入題庫問卷";
    const description = (formData.get("description") as string) || "";
    const status = (formData.get("status") as SurveyStatus) || SurveyStatus.PUBLISHED;
    const parentSurveyId = (formData.get("parentSurveyId") as string) || null;
    const requestedOrgId = (formData.get("organizationId") as string) || "default-org-id";

    // 確保 default organization 存在
    const defaultOrg = await db.organization.upsert({
      where: { slug: "default" },
      update: {},
      create: {
        id: "default-org-id",
        name: "Default Workspace",
        slug: "default",
      },
    });
    let organizationId = requestedOrgId || defaultOrg.id;

    const auth = await getCurrentUser(req);
    if (auth && mode === "save") {
      const { allowed, membership } = await hasRole(auth.user.id, organizationId, ROLES.EDITORS);
      if (!membership) {
        return forbiddenResponse("您非該組織成員，無權匯入問卷至該組織");
      }
      if (!allowed) {
        return forbiddenResponse("您的角色權限不足，需要 EDITOR 以上權限才能匯入問卷");
      }
    }

    if (!file) {
      const issue: ValidationIssue = {
        code: "FILE_EXTENSION_INVALID",
        severity: "error",
        sheet: "system",
        message: "請上傳 Excel 檔案 (.xlsx)",
        suggestion: "請選擇標準 .xlsx 檔案進行上傳。",
      };

      if (mode === "save") {
        await recordFailedImport({
          importId,
          organizationId,
          fileName: null,
          fileSize: 0,
          mode,
          errorCode: issue.code,
          errorMessage: issue.message,
          errorDetails: [issue],
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: issue.message,
          importId,
          errors: [issue],
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
        suggestion: "請精簡檔案內容、移除多餘工作表或過大圖片，確保檔案小於 5MB。",
      };

      if (mode === "save") {
        await recordFailedImport({
          importId,
          organizationId,
          fileName: file.name,
          fileSize: file.size,
          mode,
          errorCode: issue.code,
          errorMessage: issue.message,
          errorDetails: [issue],
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: issue.message,
          importId,
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
        suggestion: "請確認檔案為合法的 Microsoft Excel (.xlsx) 試算表。",
      };

      if (mode === "save") {
        await recordFailedImport({
          importId,
          organizationId,
          fileName: file.name,
          fileSize: file.size,
          mode,
          errorCode: issue.code,
          errorMessage: issue.message,
          errorDetails: [issue],
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: issue.message,
          importId,
          errors: [issue],
          warnings: [],
        } satisfies ImportResponse,
        { status: 400 }
      );
    }

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
        let suggestion = "請檢查題目結構與邏輯設定。";
        if (errMsg.includes("循環相依")) {
          code = "BRANCHING_CYCLE";
          suggestion = "請檢查題目的 visibility_rules，確保跳題條件為單向依賴且不形成死循環。";
        } else if (errMsg.includes("條件規則")) {
          code = "INVALID_VISIBILITY_RULE";
          suggestion = "請檢查跳題條件語法是否符合 SHOW IF 規範。";
        } else if (errMsg.includes("重複的選項")) {
          code = "DUPLICATE_CHOICE_VALUE";
          suggestion = "請確保同一題目的選項代碼 (value) 不重複。";
        }
        allIssues.push({
          code,
          severity: "error",
          sheet: "questions",
          message: errMsg,
          suggestion,
        });
      });
    }

    const errorIssues = allIssues.filter((i) => i.severity === "error");
    const warningIssues = allIssues.filter((i) => i.severity === "warning");

    if (allErrors.length > 0 || errorIssues.length > 0) {
      const finalErrors = errorIssues.length > 0 ? errorIssues : allErrors.map((msg) => ({
        code: "UNKNOWN_ERROR" as const,
        severity: "error" as const,
        sheet: "system" as const,
        message: msg,
      }));

      if (mode === "save") {
        await recordFailedImport({
          importId,
          organizationId,
          fileName: file.name,
          fileSize: file.size,
          mode,
          errorCode: finalErrors[0]?.code || "VALIDATION_FAILED",
          errorMessage: "Excel 格式、條件規則或結構校驗未通過",
          errorDetails: finalErrors,
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: "Excel 格式、條件規則或結構校驗未通過",
          importId,
          errors: finalErrors,
          warnings: warningIssues,
          questions,
        } as any,
        { status: 422 }
      );
    }

    if (questions.length === 0) {
      const issue: ValidationIssue = {
        code: "REQUIRED_FIELD_EMPTY",
        severity: "error",
        sheet: "questions",
        message: "Excel 內未找到任何有效題目",
        suggestion: "請在 questions 工作表中填寫至少一題題目資料。",
      };

      if (mode === "save") {
        await recordFailedImport({
          importId,
          organizationId,
          fileName: file.name,
          fileSize: file.size,
          mode,
          errorCode: issue.code,
          errorMessage: issue.message,
          errorDetails: [issue],
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: issue.message,
          importId,
          errors: [issue],
          warnings: [],
        } satisfies ImportResponse,
        { status: 400 }
      );
    }

    const totalChoices = questions.reduce((acc, q) => acc + (q.choices?.length || 0), 0);
    const requiredQuestions = questions.filter((q) => q.required).length;
    const scoredQuestions = questions.filter((q) => q.scoringEnabled).length;
    const conditionalQuestions = questions.filter((q) => !!q.visibilityRules).length;

    // ===== Preview / Dry Run 模式 (零 DB 寫入) =====
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
      const issue: ValidationIssue = {
        code: "COPYRIGHT_NOT_CONFIRMED",
        severity: "error",
        sheet: "system",
        message: "未確認使用者內容與版權宣告",
        suggestion: "請在確認匯入前勾選「我確認我有權使用並匯入上述內容」聲明方塊。",
      };

      await recordFailedImport({
        importId,
        organizationId,
        fileName: file.name,
        fileSize: file.size,
        mode,
        errorCode: issue.code,
        errorMessage: issue.message,
        errorDetails: [issue],
        copyrightConfirmed: false,
      });

      return NextResponse.json(
        {
          success: false,
          error: "請先確認您具有匯入內容的合法使用權利",
          importId,
          errors: [issue],
          warnings: [],
        } satisfies ImportResponse,
        { status: 400 }
      );
    }

    let version = 1;
    if (parentSurveyId) {
      const parent = await db.survey.findUnique({ where: { id: parentSurveyId } });
      if (parent) {
        version = parent.version + 1;
        organizationId = parent.organizationId;
      }
    }

    // ===== P0-F & M6D: All-or-Nothing Import & Audit Atomic Transaction =====
    const { survey, importRecord } = await db.$transaction(async (tx) => {
      const createdSurvey = await tx.survey.create({
        data: {
          organizationId,
          createdById: auth?.user.id || null,
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

      // 同步寫入 SurveyImport 稽核紀錄
      const createdImport = await tx.surveyImport.create({
        data: {
          importId,
          surveyId: createdSurvey.id,
          organizationId,
          createdById: auth?.user.id || null,
          fileName: file.name,
          fileSize: file.size,
          mode: "save",
          status: ImportStatus.SUCCESS,
          questionCount: questions.length,
          choiceCount: totalChoices,
          requiredCount: requiredQuestions,
          scoredCount: scoredQuestions,
          conditionalCount: conditionalQuestions,
          copyrightConfirmed: true,
          completedAt: new Date(),
        },
      });

      return { survey: createdSurvey, importRecord: createdImport };
    });

    return NextResponse.json({
      success: true,
      mode: "save",
      surveyId: survey.id,
      importId: importRecord.importId,
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
