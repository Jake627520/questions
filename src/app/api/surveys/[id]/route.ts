import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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
      },
    });

    if (!survey) {
      return NextResponse.json({ error: "找不到該問卷" }, { status: 404 });
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
 * 更新問卷設定或狀態 (P0-2 發布鎖定防呆)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();

    const existingSurvey = await db.survey.findUnique({
      where: { id },
      include: { _count: { select: { responses: true } } },
    });

    if (!existingSurvey) {
      return NextResponse.json({ error: "找不到該問卷" }, { status: 404 });
    }

    // 若問卷已發布 (PUBLISHED)，禁止直接修改會影響歷史結果之題目、計分與條件規則
    if (existingSurvey.status === "PUBLISHED") {
      // 僅允許修改狀態（例如關閉問卷 CLOSED）或非破壞性欄位
      const restrictedFields = ["questions", "choices", "scoringRules", "visibilityRules"];
      const hasRestrictedModifications = restrictedFields.some((field) => field in body);

      if (hasRestrictedModifications) {
        return NextResponse.json(
          {
            error: "問卷已發布並處於鎖定狀態 (Published Lock)，禁止直接修改題目、選項或計分規則。如需修改請點選「建立新版本 (Clone Version)」。",
          },
          { status: 403 }
        );
      }
    }

    const updated = await db.survey.update({
      where: { id },
      data: {
        title: body.title !== undefined ? body.title : undefined,
        description: body.description !== undefined ? body.description : undefined,
        status: body.status !== undefined ? body.status : undefined,
        isAnonymous: body.isAnonymous !== undefined ? body.isAnonymous : undefined,
        collectIdentity: body.collectIdentity !== undefined ? body.collectIdentity : undefined,
      },
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

