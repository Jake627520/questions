export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const surveys = await db.survey.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            questions: true,
            responses: true,
          },
        },
      },
    });

    return NextResponse.json({ surveys });
  } catch (error: any) {
    console.error("Error fetching surveys:", error);
    return NextResponse.json(
      { error: "無法取得問卷列表", details: error.message },
      { status: 500 }
    );
  }
}
