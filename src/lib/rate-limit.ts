/**
 * Phase M11: Production Rate Limiter & Abuse Guard
 *
 * 核心不變量 (Invariants):
 * 1. 支援滑動視窗 (Sliding Window) 計數。
 * 2. 嚴格命名空間隔離 (Key Isolation)，防止跨租戶或跨端點槽位碰撞。
 * 3. 超流回傳標準 429 Too Many Requests 與 Retry-After / X-RateLimit-* 標頭。
 */

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

interface RateLimitRecord {
  timestamps: number[];
}

const store = new Map<string, RateLimitRecord>();

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp in ms
  retryAfterSeconds: number;
}

/**
 * 檢查指定 key 是否在限制速率內
 * @param key 隔離識別碼 (e.g. `submit:${surveyId}:${ip}`, `export:${userId}`)
 * @param limit 視窗內允許的最大請求數
 * @param windowMs 視窗長度 (毫秒)
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateLimitResult {
  const windowStart = now - windowMs;
  let record = store.get(key);

  if (!record) {
    record = { timestamps: [] };
    store.set(key, record);
  }

  // 清除視窗外的舊請求
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  const currentCount = record.timestamps.length;
  const resetAt = record.timestamps.length > 0 ? record.timestamps[0] + windowMs : now + windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));

  if (currentCount >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt,
      retryAfterSeconds,
    };
  }

  // 記錄本次請求
  record.timestamps.push(now);

  return {
    allowed: true,
    limit,
    remaining: limit - record.timestamps.length,
    resetAt,
    retryAfterSeconds: 0,
  };
}

/**
 * 建立標準 HTTP 429 回應
 */
export function createRateLimitResponse(rateLimitResult: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: "TOO_MANY_REQUESTS",
      message: `請求頻率過高，請於 ${rateLimitResult.retryAfterSeconds} 秒後重試`,
      retryAfter: rateLimitResult.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(rateLimitResult.retryAfterSeconds),
        "X-RateLimit-Limit": String(rateLimitResult.limit),
        "X-RateLimit-Remaining": String(rateLimitResult.remaining),
        "X-RateLimit-Reset": String(Math.ceil(rateLimitResult.resetAt / 1000)),
      },
    }
  );
}

/**
 * 僅供測試清理儲存槽
 */
export function resetRateLimits(): void {
  store.clear();
}

/* -------------------------------------------------------------------------- */
/* Persistent (multi-instance) rate limiter                                    */
/*                                                                            */
/* 上面的 in-memory 版本在 serverless / 多實例部署 (如 Vercel) 會失效——每個   */
/* lambda 各有一份 Map。下面這組改用 Postgres 固定視窗計數，跨實例共享，並以   */
/* 原子的 INSERT ... ON CONFLICT DO UPDATE 遞增避免競態。endpoint 一律用       */
/* enforceRateLimit()。                                                        */
/* -------------------------------------------------------------------------- */

/** 各端點的預設限流參數 (可依實測調整) */
export const RATE_LIMITS = {
  /** 登入 / 註冊：每 IP 每分鐘 5 次 (防爆破) */
  authAttempt: { limit: 5, windowMs: 60_000 },
  /** 忘記密碼：每 IP 每 15 分鐘 3 次 (防信件轟炸) */
  passwordReset: { limit: 3, windowMs: 15 * 60_000 },
  /** 公開作答提交：每 token+IP 每分鐘 10 次 (防灌票) */
  publicSubmit: { limit: 10, windowMs: 60_000 },
  /** 公開草稿暫存：每 token+IP 每分鐘 30 次 */
  publicDraft: { limit: 30, windowMs: 60_000 },
  /** 報表匯出：每使用者每分鐘 20 次 (防資源濫用) */
  export: { limit: 20, windowMs: 60_000 },
  /** Excel 匯入：每使用者每分鐘 10 次 */
  import: { limit: 10, windowMs: 60_000 },
} as const;

/**
 * Postgres-backed 固定視窗限流檢查。跨實例共享，原子遞增。
 * @param key 隔離識別碼 (e.g. `login:${ip}`, `export:${userId}`)
 */
export async function checkRateLimitDb(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): Promise<RateLimitResult> {
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const expiresAtMs = windowStartMs + windowMs;
  const bucketKey = `${key}:${windowStartMs}`;

  // 原子 upsert + 遞增；ON CONFLICT 確保高併發下不會重複建列或漏算。
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_counters (id, bucket_key, count, window_start, expires_at, created_at)
    VALUES (${randomUUID()}, ${bucketKey}, 1, ${new Date(windowStartMs)}, ${new Date(expiresAtMs)}, now())
    ON CONFLICT (bucket_key) DO UPDATE SET count = rate_limit_counters.count + 1
    RETURNING count
  `;
  const count = Number(rows[0]?.count ?? 1);

  const resetAt = expiresAtMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
  const allowed = count <= limit;

  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfterSeconds: allowed ? 0 : retryAfterSeconds,
  };
}

/**
 * endpoint 專用：超限回傳 429 NextResponse，未超限回 null。
 * 若限流檢查本身出錯 (例如 DB 暫時不可用)，採 fail-open——絕不因限流故障而
 * 讓正常請求全部 500。
 */
export async function enforceRateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<NextResponse | null> {
  // 測試環境停用「route 層」限流：整合測試以共享 DB + 固定來源 IP 平行執行，
  // 會在同一個 IP 桶上互相累加造成偽陽性 429。限流邏輯本身仍由
  // test/security/rate-limit-persistent.test.ts 直接驗證 (含 route wiring 一案)。
  if (process.env.RATE_LIMIT_DISABLED === "1") return null;
  try {
    const result = await checkRateLimitDb(opts.key, opts.limit, opts.windowMs);
    return result.allowed ? null : createRateLimitResponse(result);
  } catch (err) {
    console.error("[rate-limit] persistent check failed, failing open:", err);
    return null;
  }
}
