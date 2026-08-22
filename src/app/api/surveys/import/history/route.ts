export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ImportStatus } from "@prisma/client";
import { ImportHistoryResponse } from "@/types/surveyImport";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId") || "default-org-id";
    const statusParam = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));

    const where: any = {
      organizationId,
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
