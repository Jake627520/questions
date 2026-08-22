export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, unauthorizedResponse, getUserOrganizationIds, forbiddenResponse } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const auth = await getCurrentUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(req.url);
    const requestedOrgId = searchParams.get("organizationId");
    const userOrgIds = await getUserOrganizationIds(auth.user.id);

    if (requestedOrgId) {
      if (!userOrgIds.includes(requestedOrgId)) {
        return forbiddenResponse("您無權存取該組織的問卷列表");
      }
    }

    if (userOrgIds.length === 0) {
      return NextResponse.json({ surveys: [] });
    }

    const where = requestedOrgId
      ? { organizationId: requestedOrgId }
      : { organizationId: { in: userOrgIds } };

    const surveys = await db.survey.findMany({
      where,
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
