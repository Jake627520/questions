import crypto from "crypto";

const DEFAULT_IP_SALT = process.env.SESSION_SECRET || "enterprise_survey_ip_salt_2026";

/**
 * 將使用者 IP 透過 HMAC-SHA256 進行單向雜湊以保障隱私 (Privacy-Preserving IP Hashing)
 * 既能用於防刷票與重放關聯分析，又符合 GDPR / 個人資料去識別化規範
 */
export function hashClientIp(
  ip?: string | null,
  salt: string = DEFAULT_IP_SALT
): string | null {
  if (!ip || ip.trim().length === 0) {
    return null;
  }
  const cleanIp = ip.trim().toLowerCase();
  return crypto.createHmac("sha256", salt).update(cleanIp).digest("hex");
}

/**
 * 驗證冪等金鑰格式 (Idempotency Key Validation)
 * 允許 UUID、CUID 或英數字串，長度限制 8 ~ 64 字元
 */
export function validateIdempotencyKey(key?: string | null): boolean {
  if (!key || typeof key !== "string") {
    return false;
  }
  const trimmed = key.trim();
  if (trimmed.length < 8 || trimmed.length > 64) {
    return false;
  }
  // 僅允許英數、連字號與底線
  return /^[a-zA-Z0-9_\-]+$/.test(trimmed);
}

/**
 * 計算作答耗時 (秒數)
 */
export function calculateFillingDuration(
  startedAt?: Date | string | null,
  submittedAt: Date = new Date()
): number | null {
  if (!startedAt) {
    return null;
  }
  const start = new Date(startedAt);
  if (isNaN(start.getTime())) {
    return null;
  }
  const diffMs = submittedAt.getTime() - start.getTime();
  if (diffMs < 0) {
    return 0;
  }
  return Math.floor(diffMs / 1000);
}

/**
 * 從 HTTP Request 擷取真實客戶端 IP
 */
export function extractClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0].trim();
    if (firstIp) return firstIp;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  return null;
}
