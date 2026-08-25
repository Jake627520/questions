export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const startTime = Date.now();

/**
 * GET /api/health
 * 系統健康度與相依性就緒度端點 (Phase M11.1)
 *
 * 安全合約 (Zero-Leak Invariant):
 * - 絕不輸出資料庫連線字串、密碼、環境變數或 Exception Stack Trace。
 * - DB 正常回傳 200 OK，DB 異常回傳 503 Service Unavailable。
 */
export async function GET() {
  const now = new Date();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  try {
    // 執行輕量資料庫探測
    await db.$queryRawUnsafe("SELECT 1");

    const mem = process.memoryUsage();
    const heapUsedMB = Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100;
    const rssMB = Math.round((mem.rss / 1024 / 1024) * 100) / 100;

    return NextResponse.json(
      {
        status: "HEALTHY",
        checks: {
          database: "UP",
          service: "UP",
        },
        uptimeSeconds,
        timestamp: now.toISOString(),
        system: {
          heapUsedMB,
          rssMB,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    // 記錄伺服器端錯誤，但對外隱藏所有內部錯誤細節
    console.error("[Health Check Database Failure]:", error);

    return NextResponse.json(
      {
        status: "UNHEALTHY",
        checks: {
          database: "DOWN",
          service: "UP",
        },
        uptimeSeconds,
        timestamp: now.toISOString(),
      },
      { status: 503 }
    );
  }
}
