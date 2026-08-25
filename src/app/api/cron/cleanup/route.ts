export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cleanupExpiredExports } from "@/lib/report-governance";

async function handleCleanup(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const xCronHeader = req.headers.get("x-cron-secret");

  // 驗證 Secret (若系統有設定 CRON_SECRET)
  if (cronSecret) {
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    const isAuthorized = bearerToken === cronSecret || xCronHeader === cronSecret;

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "無效或未提供 Cron 授權密鑰" },
        { status: 401 }
      );
    }
  }

  const now = new Date();

  try {
    // 1. 冪等標記過期報告產物
    const { markedExpiredCount } = await cleanupExpiredExports(now);

    // 2. 冪等清理過期密碼重設 Token
    const deletedTokens = await db.passwordResetToken.deleteMany({
      where: {
        expiresAt: { lte: now },
      },
    });

    // 3. 冪等清理過期 Session
    const deletedSessions = await db.session.deleteMany({
      where: {
        expiresAt: { lte: now },
      },
    });

    return NextResponse.json({
      success: true,
      markedExpiredExports: markedExpiredCount,
      deletedExpiredTokens: deletedTokens.count,
      deletedExpiredSessions: deletedSessions.count,
      executedAt: now.toISOString(),
    });
  } catch (error: any) {
    console.error("[Cron Cleanup Failure]:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "排程清理失敗，請稍後重試" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return handleCleanup(req);
}

export async function GET(req: NextRequest) {
  return handleCleanup(req);
}
