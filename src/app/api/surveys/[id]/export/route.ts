import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateSurveyExportExcel } from "@/lib/excel-parser";
import { ResponseStatus } from "@prisma/client";
import { getCurrentUser, unauthorizedResponse, forbiddenResponse, hasRole, ROLES } from "@/lib/auth";

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
    const survey = await db.survey.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { orderNum: "asc" },
          include: {
            choices: {
              orderBy: { orderNum: "asc" },
            },
          },
        },
        responses: {
          where: { status: ResponseStatus.COMPLETED },
          orderBy: { submittedAt: "desc" },
          include: {
            answers: {
              include: {
                question: true,
              },
            },
          },
        },
      },
    });

    if (!survey) {
      return NextResponse.json({ error: "找不到該問卷" }, { status: 404 });
    }

    const { allowed, membership } = await hasRole(auth.user.id, survey.organizationId, ROLES.EDITORS);
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權匯出此組織的問卷填答報表");
    }
    if (!allowed) {
      return forbiddenResponse("您的角色權限不足，需要 EDITOR 以上權限才能匯出報表");
    }

    const exportQuestions = survey.questions.map((q) => ({
      orderNum: q.orderNum,
      code: q.code,
      title: q.title,
      description: q.description,
      questionType: q.questionType as any,
      required: q.required,
      scoringEnabled: q.scoringEnabled,
      reverseScore: q.reverseScore,
      visibilityRules: q.visibilityRules,
      minSelections: q.minSelections,
      maxSelections: q.maxSelections,
      minValue: q.minValue,
      maxValue: q.maxValue,
      choices: q.choices.map((c) => ({
        orderNum: c.orderNum,
        label: c.label,
        value: c.value,
        scoreEnabled: c.scoreEnabled,
        score: c.score,
        isOther: c.isOther,
        requiresText: c.requiresText,
        isNoneOfAbove: c.isNoneOfAbove,
      })),
    }));

    const exportResponses = survey.responses.map((r) => ({
      id: r.id,
      version: r.version,
      submittedAt: r.submittedAt,
      totalScore: r.totalScore,
      maxScore: r.maxScore,
      percentage: r.percentage,
      answers: r.answers.map((a) => {
        let parsedVal: any = null;
        try {
          parsedVal = JSON.parse(a.rawValue);
        } catch {
          parsedVal = a.rawValue;
        }
        return {
          questionCode: a.question.code,
          rawValue: parsedVal,
          otherText: a.otherText,
          score: a.score,
        };
      }),
    }));

    const buffer = await generateSurveyExportExcel({
      survey: {
        title: survey.title,
        description: survey.description,
        version: survey.version,
      },
      questions: exportQuestions,
      responses: exportResponses,
    });

    const filename = `survey_export_${survey.title.replace(/[\s/\\?%*:|"<>]/g, "_")}_v${survey.version}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error: any) {
    console.error("Error exporting survey to Excel:", error);
    return NextResponse.json(
      { error: "匯出 Excel 失敗", details: error.message },
      { status: 500 }
    );
  }
}
