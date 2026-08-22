export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { importId: string } }
) {
  try {
    const { importId } = params;

    const record = await db.surveyImport.findUnique({
      where: { importId },
      include: {
        survey: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            version: true,
            createdAt: true,
          },
        },
      },
    });

    if (!record) {
      return NextResponse.json(
        {
          success: false,
          error: `查無此匯入紀錄 (${importId})`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      item: record,
    });
  } catch (error: any) {
    console.error("[Import Detail API Error]:", error);
    return NextResponse.json(
      {
        success: false,
        error: "無法取得匯入紀錄詳情",
        details: error?.message,
      },
      { status: 500 }
    );
  }
}
