export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cleanupExpiredExports } from "@/lib/report-governance";

async function handleCleanup(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  // Fail-closed：未設定 CRON_SECRET 時，此端點一律拒絕執行——否則任何人都能
  // 觸發治理清理 (刪 session / token、標記過期匯出)。之前是「有設才驗、沒設就全開」。
  if (!cronSecret) {
    console.error("[Cron Cleanup] CRON_SECRET 未設定，拒絕執行以防未授權觸發。");
    return NextResponse.json(
      { error: "CRON_NOT_CONFIGURED", message: "排程清理未啟用 (伺服器缺少 CRON_SECRET 設定)" },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get("authorization");
  const xCronHeader = req.headers.get("x-cron-secret");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const isAuthorized = bearerToken === cronSecret || xCronHeader === cronSecret;

  if (!isAuthorized) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "無效或未提供 Cron 授權密鑰" },
      { status: 401 }
    );
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
