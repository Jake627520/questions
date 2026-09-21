import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimitDb, enforceRateLimit } from "@/lib/rate-limit";
import { POST as loginPOST } from "@/app/api/auth/login/route";

/**
 * Postgres-backed 限流器 (跨實例安全) 行為驗證。
 * 使用真實 DB (與其他整合測試相同的 survey_db)；每案前清空計數表。
 */
describe("checkRateLimitDb — persistent, multi-instance-safe rate limiter", () => {
  beforeEach(async () => {
    await db.rateLimitCounter.deleteMany({});
  });

  it("allows up to the limit, then blocks", async () => {
    const key = "test:allow";
    const now = 1_000_000_000_000; // 固定視窗錨點
    for (let i = 1; i <= 3; i++) {
      const r = await checkRateLimitDb(key, 3, 5000, now);
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkRateLimitDb(key, 3, 5000, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("isolates counters by key", async () => {
    const now = 1_000_000_000_000;
    await checkRateLimitDb("test:A", 1, 5000, now);
    const aBlocked = await checkRateLimitDb("test:A", 1, 5000, now);
    const bOk = await checkRateLimitDb("test:B", 1, 5000, now);
    expect(aBlocked.allowed).toBe(false);
    expect(bOk.allowed).toBe(true);
  });

  it("resets in a new fixed window", async () => {
    const key = "test:window";
    const now = 2_000_000_000_000;
    await checkRateLimitDb(key, 1, 5000, now);
    expect((await checkRateLimitDb(key, 1, 5000, now)).allowed).toBe(false);
    const nextWindow = now + 5000;
    expect((await checkRateLimitDb(key, 1, 5000, nextWindow)).allowed).toBe(true);
  });
});

describe("enforceRateLimit — endpoint helper", () => {
  // route 層限流在整體測試環境是停用的 (RATE_LIMIT_DISABLED=1)；本組刻意開啟以實測其行為。
  beforeEach(async () => {
    process.env.RATE_LIMIT_DISABLED = "0";
    await db.rateLimitCounter.deleteMany({});
  });
  afterEach(() => {
    process.env.RATE_LIMIT_DISABLED = "1";
  });

  it("returns null while allowed and a 429 NextResponse once over limit", async () => {
    const key = "test:enforce";
    const first = await enforceRateLimit({ key, limit: 1, windowMs: 60_000 });
    expect(first).toBeNull();
    const second = await enforceRateLimit({ key, limit: 1, windowMs: 60_000 });
    expect(second).not.toBeNull();
    expect(second!.status).toBe(429);
    expect(second!.headers.get("Retry-After")).toBeTruthy();
  });

  it("no-ops (returns null) when RATE_LIMIT_DISABLED=1", async () => {
    process.env.RATE_LIMIT_DISABLED = "1";
    const key = "test:disabled";
    for (let i = 0; i < 5; i++) {
      expect(await enforceRateLimit({ key, limit: 1, windowMs: 60_000 })).toBeNull();
    }
  });
});

describe("rate limiting is actually wired into the login route", () => {
  // 證明 route 真的呼叫了 enforceRateLimit：同一 IP 連續打 login，超過 authAttempt(5/min) 後回 429。
  beforeEach(async () => {
    process.env.RATE_LIMIT_DISABLED = "0";
    await db.rateLimitCounter.deleteMany({});
  });
  afterEach(() => {
    process.env.RATE_LIMIT_DISABLED = "1";
  });

  it("returns 429 after exceeding the per-IP login limit", async () => {
    const ip = "203.0.113.7"; // 測試專用來源 IP
    const hit = () =>
      loginPOST(
        new NextRequest("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({}), // 空 body：限流在憑證檢查之前，故仍先被計數
        })
      );

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await hit()).status);
    }
    // 前 5 次通過限流 (因空 body 落到 400)，第 6 次被限流擋下 429
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
