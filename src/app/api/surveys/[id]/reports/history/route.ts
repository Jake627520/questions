export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getCurrentUser,
  unauthorizedResponse,
  forbiddenResponse,
  hasRole,
  ROLES,
} from "@/lib/auth";

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET /api/surveys/[id]/reports/history
 * 取得問卷歷史報告清單與下載紀錄 (Phase M10-E Download Center)
 * 權限要求：僅限 EDITOR, MANAGER, ADMIN, OWNER (Viewer 阻絕 403)
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse("請先登入以查看報告歷史");
    }

    const { id } = params;
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    // 1. 查詢問卷基本資訊
    const survey = await db.survey.findUnique({
      where: { id },
      select: { id: true, organizationId: true, title: true },
    });

    if (!survey) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "找不到該問卷" },
        { status: 404 }
      );
    }

    // 2. 驗證 Membership 與 RBAC (僅 EDITORS 以上允許)
    const { allowed, membership } = await hasRole(auth.user.id, survey.organizationId, ROLES.EDITORS);
    if (!membership) {
      return forbiddenResponse("您非該組織成員，無權查看此問卷的報告歷史");
    }
    if (!allowed) {
      return forbiddenResponse("檢視者角色 (Viewer) 無權查看匯出歷史紀錄");
    }

    // 3. 查詢歷史審計紀錄 (Zero-PII)
    const [total, exports] = await Promise.all([
      db.reportExport.count({
        where: { surveyId: id },
      }),
      db.reportExport.findMany({
        where: { surveyId: id },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          organizationId: true,
          surveyId: true,
          actorId: true,
          actorRole: true,
          format: true,
          status: true,
          timeRange: true,
          dateFrom: true,
          dateTo: true,
          reportSchemaVersion: true,
          fileSize: true,
          downloadCount: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      exports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("[Report History Error]:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "取得報告歷史失敗，請稍後重試" },
      { status: 500 }
    );
  }
}
