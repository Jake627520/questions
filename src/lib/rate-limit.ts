/**
 * Phase M11: Production Rate Limiter & Abuse Guard
 *
 * 核心不變量 (Invariants):
 * 1. 支援滑動視窗 (Sliding Window) 計數。
 * 2. 嚴格命名空間隔離 (Key Isolation)，防止跨租戶或跨端點槽位碰撞。
 * 3. 超流回傳標準 429 Too Many Requests 與 Retry-After / X-RateLimit-* 標頭。
 */

import { NextResponse } from "next/server";

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
