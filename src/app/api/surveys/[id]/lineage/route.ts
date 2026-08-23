import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  hasRole,
  ROLES,
} from "@/lib/auth";

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
    const targetSurvey = await db.survey.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        parentSurveyId: true,
        version: true,
      },
    });

    if (!targetSurvey) {
      return NextResponse.json({ error: "找不到該問卷" }, { status: 404 });
    }

    // RBAC & Tenant Check
    const { allowed, membership } = await hasRole(
      auth.user.id,
      targetSurvey.organizationId,
      ROLES.ALL
    );
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權存取此問卷的版本溯源資訊");
    }
    if (!allowed) {
      return forbiddenResponse("您的權限不足以檢視問卷版本歷程");
    }

    // 1. 向上追溯至根版本 (Root Version)
    let rootId = targetSurvey.id;
    let currParentId = targetSurvey.parentSurveyId;
    const visited = new Set<string>([rootId]);

    while (currParentId) {
      if (visited.has(currParentId)) break; // 防環
      visited.add(currParentId);

      const parent = await db.survey.findUnique({
        where: { id: currParentId },
        select: { id: true, parentSurveyId: true, organizationId: true },
      });

      if (!parent || parent.organizationId !== targetSurvey.organizationId) {
        break;
      }
      rootId = parent.id;
      currParentId = parent.parentSurveyId;
    }

    // 2. 取得同一組織的所有問卷進行關聯建構
    const allOrgSurveys = await db.survey.findMany({
      where: { organizationId: targetSurvey.organizationId },
      select: {
        id: true,
        version: true,
        title: true,
        description: true,
        status: true,
        publicToken: true,
        parentSurveyId: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            questions: true,
            responses: true,
          },
        },
      },
      orderBy: { version: "asc" },
    });

    // 3. 自 Root 節點向下深度搜尋收集完整版本家族 (Lineage Family)
    const familyIds = new Set<string>([rootId]);
    let added = true;
    while (added) {
      added = false;
      for (const s of allOrgSurveys) {
        if (s.parentSurveyId && familyIds.has(s.parentSurveyId) && !familyIds.has(s.id)) {
          familyIds.add(s.id);
          added = true;
        }
      }
    }

    const lineageSurveys = allOrgSurveys
      .filter((s) => familyIds.has(s.id))
      .map((s) => {
        const hasChildren = allOrgSurveys.some((other) => other.parentSurveyId === s.id);
        return {
          id: s.id,
          version: s.version,
          title: s.title,
          description: s.description,
          status: s.status,
          publicToken: s.publicToken,
          parentSurveyId: s.parentSurveyId,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          createdBy: s.createdBy,
          _count: s._count,
          isCurrent: s.id === targetSurvey.id,
          isRoot: s.id === rootId,
          isLatest: !hasChildren,
        };
      })
      .sort((a, b) => a.version - b.version);

    return NextResponse.json({
      success: true,
      currentSurveyId: targetSurvey.id,
      rootSurveyId: rootId,
      lineage: lineageSurveys,
    });
  } catch (error: any) {
    console.error("Error fetching survey lineage:", error);
    return NextResponse.json(
      { error: "取得版本溯源失敗", details: error.message },
      { status: 500 }
    );
  }
}
