import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SurveyStatus } from "@prisma/client";
import {
  getCurrentUser,
  unauthorizedResponse,
  isUserInOrganization,
  forbiddenResponse,
  hasRole,
  ROLES,
} from "@/lib/auth";
import { validateStatusTransition } from "@/lib/survey-lifecycle";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const survey = await db.survey.findUnique({
      where: { id },
      include: {
        parentSurvey: {
          select: {
            id: true,
            version: true,
            title: true,
            status: true,
            createdAt: true,
          },
        },
        childVersions: {
          select: {
            id: true,
            version: true,
            title: true,
            status: true,
            createdAt: true,
            _count: {
              select: { responses: true },
            },
          },
          orderBy: { version: "asc" },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            questions: true,
            responses: true,
          },
        },
        questions: {
          orderBy: { orderNum: "asc" },
          include: {
            choices: {
              orderBy: { orderNum: "asc" },
            },
          },
        },
      },
    });

    if (!survey) {
      return NextResponse.json({ error: "找不到該問卷" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const isManagementView = searchParams.get("mode") === "management";
    const auth = await getCurrentUser(req);

    if (isManagementView) {
      if (!auth) {
        return unauthorizedResponse();
      }
      const isMember = await isUserInOrganization(auth.user.id, survey.organizationId);
      if (!isMember) {
        return forbiddenResponse("您無權查看此組織的問卷管理詳情");
      }
    }

    return NextResponse.json({ survey });
  } catch (error: any) {
    console.error("Error getting survey:", error);
    return NextResponse.json(
      { error: "取得問卷失敗", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * 更新問卷設定或狀態 (P0-2 發布鎖定防呆 & M10 生命週期管理)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const { id } = params;
    const body = await req.json();

    const existingSurvey = await db.survey.findUnique({
      where: { id },
      include: {
        _count: { select: { responses: true, questions: true } },
      },
    });

    if (!existingSurvey) {
      return NextResponse.json({ error: "找不到該問卷" }, { status: 404 });
    }

    const { allowed, membership } = await hasRole(
      auth.user.id,
      existingSurvey.organizationId,
      ROLES.EDITORS
    );
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權修改此問卷");
    }
    if (!allowed) {
      return forbiddenResponse("您的角色權限不足，需要 EDITOR 以上權限才能修改問卷");
    }

    // 若問卷已發布 (PUBLISHED)，禁止直接修改會影響歷史結果之題目、計分與條件規則
    if (existingSurvey.status === SurveyStatus.PUBLISHED) {
      const restrictedFields = ["questions", "choices", "scoringRules", "visibilityRules"];
      const hasRestrictedModifications = restrictedFields.some((field) => field in body);

      if (hasRestrictedModifications) {
        return NextResponse.json(
          {
            error:
              "問卷已發布並處於鎖定狀態 (Published Lock)，禁止直接修改題目、選項或計分規則。如需修改請點選「建立新版本 (Clone Version)」。",
          },
          { status: 403 }
        );
      }
    }

    // 若有更新狀態，執行狀態機合法性檢查
    if (body.status && body.status !== existingSurvey.status) {
      const transition = validateStatusTransition(
        existingSurvey.status,
        body.status as SurveyStatus,
        {
          questionCount: existingSurvey._count.questions,
          responseCount: existingSurvey._count.responses,
        }
      );
      if (!transition.valid) {
        return NextResponse.json(
          { error: "INVALID_STATUS_TRANSITION", message: transition.reason },
          { status: 400 }
        );
      }
    }

    const updateData: any = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.isAnonymous !== undefined) updateData.isAnonymous = body.isAnonymous;
    if (body.collectIdentity !== undefined) updateData.collectIdentity = body.collectIdentity;
    if (body.startDate !== undefined) {
      updateData.startDate = body.startDate ? new Date(body.startDate) : null;
    }
    if (body.endDate !== undefined) {
      updateData.endDate = body.endDate ? new Date(body.endDate) : null;
    }
    if (body.responseQuota !== undefined) {
      updateData.responseQuota =
        body.responseQuota !== null ? Number(body.responseQuota) : null;
    }

    const updated = await db.survey.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, survey: updated });
  } catch (error: any) {
    console.error("Error updating survey:", error);
    return NextResponse.json(
      { error: "更新問卷失敗", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * 刪除問卷 (受保護刪除守衛)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const { id } = params;
    const existingSurvey = await db.survey.findUnique({
      where: { id },
      include: {
        _count: { select: { responses: true } },
      },
    });

    if (!existingSurvey) {
      return NextResponse.json({ error: "找不到該問卷" }, { status: 404 });
    }

    const { allowed, membership } = await hasRole(
      auth.user.id,
      existingSurvey.organizationId,
      ROLES.MANAGERS
    );
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權刪除此問卷");
    }
    if (!allowed) {
      return forbiddenResponse("您的角色權限不足，需要 ADMIN 或 OWNER 權限才能刪除問卷");
    }

    if (existingSurvey._count.responses > 0 || existingSurvey.status === SurveyStatus.PUBLISHED) {
      return NextResponse.json(
        {
          error: "PROTECTED_RESOURCE",
          message:
            "該問卷已有作答資料或處於發布狀態，為維護審計與數據完整性禁止直接刪除。請改用「封存 (Archive)」功能。",
        },
        { status: 400 }
      );
    }

    await db.survey.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "問卷已成功刪除" });
  } catch (error: any) {
    console.error("Error deleting survey:", error);
    return NextResponse.json(
      { error: "刪除問卷失敗", details: error.message },
      { status: 500 }
    );
  }
}
