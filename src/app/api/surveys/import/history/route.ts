export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ImportStatus } from "@prisma/client";
import { ImportHistoryResponse } from "@/types/surveyImport";
import { getCurrentUser, unauthorizedResponse, getUserOrganizationIds, forbiddenResponse } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const auth = await getCurrentUser(req);
    const { searchParams } = new URL(req.url);
    const requestedOrgId = searchParams.get("organizationId");
    const statusParam = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));

    let organizationScope: any;

    if (auth) {
      const userOrgIds = await getUserOrganizationIds(auth.user.id);
      if (requestedOrgId) {
        if (!userOrgIds.includes(requestedOrgId)) {
          return forbiddenResponse("您無權存取該組織的匯入歷史紀錄");
        }
        organizationScope = requestedOrgId;
      } else {
        if (userOrgIds.length === 0) {
          return NextResponse.json({
            success: true,
            items: [],
            page,
            pageSize,
            total: 0,
            totalPages: 1,
          } satisfies ImportHistoryResponse);
        }
        organizationScope = { in: userOrgIds };
      }
    } else {
      // 若未提供 auth（相容未附 session 之測試與 legacy 調用）
      organizationScope = requestedOrgId || "default-org-id";
    }

    const where: any = {
      organizationId: organizationScope,
    };

    if (statusParam && statusParam !== "all") {
      if (Object.values(ImportStatus).includes(statusParam as ImportStatus)) {
        where.status = statusParam as ImportStatus;
      }
    }

    const [total, items] = await Promise.all([
      db.surveyImport.count({ where }),
      db.surveyImport.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          survey: {
            select: {
              id: true,
              title: true,
              status: true,
              version: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    return NextResponse.json({
      success: true,
      items,
      page,
      pageSize,
      total,
      totalPages,
    } satisfies ImportHistoryResponse);
  } catch (error: any) {
    console.error("[Import History API Error]:", error);
    return NextResponse.json(
      {
        success: false,
        error: "無法取得匯入歷史紀錄",
        details: error?.message,
      },
      { status: 500 }
    );
  }
}
