import crypto from "crypto";

const DEFAULT_IP_SALT = "survey-response-privacy-salt-2026-v1";
export const IP_HASH_VERSION = "v1";

/**
 * 標準化 IP 位址 (Canonicalize IPv4 / IPv6)
 */
export function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return "unknown";
  let normalized = ip.trim().toLowerCase();

  // 若包含 IPv6-mapped IPv4 前綴 (例如 ::ffff:192.168.1.1)，移除前綴
  if (normalized.startsWith("::ffff:")) {
    normalized = normalized.substring(7);
  }

  return normalized;
}

/**
 * 使用 HMAC-SHA256 對標準化後的 IP 進行單向去識別化雜湊
 * 支援透過環境變數 RESPONSE_IP_HMAC_SECRET 進行 Secret Rotation
 */
export function hashClientIp(
  ip: string | undefined | null,
  customSecret?: string
): { hash: string; version: string } {
  const secret =
    customSecret ||
    process.env.RESPONSE_IP_HMAC_SECRET ||
    DEFAULT_IP_SALT;

  const normalized = normalizeIp(ip);
  if (normalized === "unknown") {
    return { hash: "unknown", version: IP_HASH_VERSION };
  }

  const hash = crypto
    .createHmac("sha256", secret)
    .update(normalized)
    .digest("hex");

  return { hash, version: IP_HASH_VERSION };
}

/**
 * 冪等金鑰格式校驗 (8 ~ 128 字元，僅允許字母、數字、底線與連字號)
 */
export function validateIdempotencyKey(key: string | undefined | null): boolean {
  if (!key || typeof key !== "string") return false;
  const trimmed = key.trim();
  if (trimmed.length < 8 || trimmed.length > 128) return false;
  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

/**
 * 計算作答內容之確定性 Payload 雜湊值 (用於偵測相同 Key 但不同 Payload 的非法重用)
 */
export function calculatePayloadHash(answers: any[]): string {
  if (!Array.isArray(answers)) return "";

  // 依照 questionCode / questionId 排序，確保 JSON 結構確定性
  const normalizedAnswers = [...answers]
    .map((a) => {
      const qIdentifier = a.questionCode || a.questionId || "";
      const val = a.value !== undefined ? a.value : a.rawValue;
      const choices = Array.isArray(a.choiceIds) ? [...a.choiceIds].sort() : undefined;
      return {
        q: String(qIdentifier),
        v: val !== undefined ? JSON.stringify(val) : "",
        c: choices,
        t: a.textValue || "",
      };
    })
    .sort((a, b) => a.q.localeCompare(b.q));

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalizedAnswers))
    .digest("hex");
}

/**
 * 計算填答耗時 (秒)
 */
export function calculateFillingDuration(
  startedAt: Date | string | undefined | null,
  submittedAt: Date
): number | null {
  if (!startedAt) return null;
  const start = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
  if (isNaN(start.getTime())) return null;

  const durationMs = submittedAt.getTime() - start.getTime();
  if (durationMs < 0) return 0; // 時鐘偏差防禦
  return Math.min(Math.floor(durationMs / 1000), 86400 * 30); // 上限 30 天
}

/**
 * 從請求中解析 Client IP
 */
export function extractClientIp(req: Request): string {
  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const parts = xForwardedFor.split(",");
    if (parts.length > 0 && parts[0].trim()) {
      return parts[0].trim();
    }
  }

  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp && xRealIp.trim()) {
    return xRealIp.trim();
  }

  return "127.0.0.1";
}
