import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ResponseStatus } from "@prisma/client";
import { getCurrentUser, unauthorizedResponse, isUserInOrganization, forbiddenResponse, hasRole, ROLES } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; responseId: string } }
) {
  try {
    const { id, responseId } = params;
    const response = await db.response.findUnique({
      where: { id: responseId },
      include: {
        survey: true,
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!response || response.surveyId !== id) {
      return NextResponse.json({ error: "找不到該作答記錄" }, { status: 404 });
    }

    // 正式填答紀錄（COMPLETED）屬於管理端敏感資料，必須驗證登入與組織權限
    if (response.status === ResponseStatus.COMPLETED) {
      const auth = await getCurrentUser(req);
      if (!auth) {
        return unauthorizedResponse();
      }
      const isMember = await isUserInOrganization(auth.user.id, response.survey.organizationId);
      if (!isMember) {
        return forbiddenResponse("您無權查看此組織的作答明細");
      }
    }

    const formattedAnswers = response.answers.map((a) => {
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
      };
    });

    return NextResponse.json({
      response: {
        id: response.id,
        status: response.status,
        version: response.version,
        submittedAt: response.submittedAt,
        totalScore: response.totalScore,
        maxScore: response.maxScore,
        percentage: response.percentage,
      },
      answers: formattedAnswers,
    });
  } catch (error: any) {
    console.error("Error getting survey response:", error);
    return NextResponse.json(
      { error: "讀取作答記錄失敗", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; responseId: string } }
) {
  try {
    const { id, responseId } = params;
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";

    const response = await db.response.findUnique({
      where: { id: responseId },
      include: { survey: true },
    });

    if (!response || response.surveyId !== id) {
      return NextResponse.json({ error: "找不到該回覆記錄" }, { status: 404 });
    }

    // 正式回覆保護邏輯
    if (response.status === ResponseStatus.COMPLETED) {
      const auth = await getCurrentUser(req);
      if (!auth) {
        return unauthorizedResponse();
      }
      const { allowed, membership } = await hasRole(auth.user.id, response.survey.organizationId, ROLES.MANAGERS);
      if (!membership) {
        return forbiddenResponse("您非該組織成員，無權刪除此組織的回覆記錄");
      }
      if (!allowed) {
        return forbiddenResponse("您的角色權限不足，需要 ADMIN 或 OWNER 權限才能刪除正式回覆記錄");
      }

      if (!force) {
        return NextResponse.json(
          { error: "已完成的正式回覆不可直接刪除，避免誤刪正式資料。" },
          { status: 400 }
        );
      }
    }

    await db.response.delete({
      where: { id: responseId },
    });

    return NextResponse.json({
      success: true,
      message: response.status === ResponseStatus.IN_PROGRESS ? "已成功刪除草稿" : "已刪除回覆記錄",
    });
  } catch (error: any) {
    console.error("Error deleting survey response:", error);
    return NextResponse.json(
      { error: "刪除回覆失敗", details: error.message },
      { status: 500 }
    );
  }
}
