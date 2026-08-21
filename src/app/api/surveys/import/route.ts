import { NextRequest, NextResponse } from "next/server";
import { parseSurveyExcel } from "@/lib/excel-parser";
import { validateQuestionsStructure } from "@/lib/survey-engine";
import { db } from "@/lib/db";
import { QuestionType, SurveyStatus } from "@prisma/client";

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
      return NextResponse.json({ error: "請上傳 Excel 檔案 (.xlsx)" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const { questions, errors: parseErrors } = await parseSurveyExcel(Buffer.from(arrayBuffer));

    const allErrors = [...parseErrors];

    // M3/M4: 題目結構、標籤比對存在性與循環相依檢核
    const structureValidation = validateQuestionsStructure(questions);
    if (!structureValidation.isValid) {
      allErrors.push(...structureValidation.errors);
    }

    if (allErrors.length > 0) {
      return NextResponse.json(
        { error: "Excel 格式、條件規則或結構校驗未通過", errors: allErrors, questions },
        { status: 422 }
      );
    }

    if (questions.length === 0) {
      return NextResponse.json(
        { error: "Excel 內未找到任何有效題目" },
        { status: 400 }
      );
    }

    if (mode === "preview") {
      return NextResponse.json({
        success: true,
        mode: "preview",
        questionCount: questions.length,
        questions,
      });
    }

    let version = 1;
    if (parentSurveyId) {
      const parent = await db.survey.findUnique({ where: { id: parentSurveyId } });
      if (parent) {
        version = parent.version + 1;
      }
    }

    const survey = await db.survey.create({
      data: {
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

    return NextResponse.json({
      success: true,
      mode: "save",
      surveyId: survey.id,
      version: survey.version,
      survey,
    });
  } catch (error: any) {
    console.error("Error in survey import:", error);
    return NextResponse.json(
      { error: "匯入處理失敗", details: error.message },
      { status: 500 }
    );
  }
}
