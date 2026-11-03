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

    // 任何狀態的作答都是管理端資料，一律驗證登入與組織成員資格；
    // 匿名填答者讀自己的草稿走 /api/public/surveys/[publicToken]/draft/[responseId]。
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }
    const isMember = await isUserInOrganization(auth.user.id, response.survey.organizationId);
    if (!isMember) {
      return forbiddenResponse("您無權查看此組織的作答明細");
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

    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    // 草稿 (IN_PROGRESS) 刪除需 EDITOR 以上；已提交或已排除的作答比照正式回覆，需 ADMIN 以上
    const isDraft = response.status === ResponseStatus.IN_PROGRESS;
    const { allowed, membership } = await hasRole(
      auth.user.id,
      response.survey.organizationId,
      isDraft ? ROLES.EDITORS : ROLES.MANAGERS
    );
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權刪除此組織的回覆記錄");
    }
    if (!allowed) {
      return forbiddenResponse(
        isDraft
          ? "您的角色權限不足，需要 EDITOR 以上權限才能刪除作答草稿"
          : "您的角色權限不足，需要 ADMIN 或 OWNER 權限才能刪除正式回覆記錄"
      );
    }

    // 正式回覆保護邏輯
    if (!isDraft) {
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
