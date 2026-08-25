/**
 * Phase M10-E: Report Delivery & Governance Layer
 *
 * 核心規範 (Invariants):
 * 1. Zero-PII Audit: 審計紀錄僅記錄治理元資料 (metadata)，絕不記錄填答者 Email / IP / Raw Answers / Response IDs。
 * 2. Retention & Expiry: 預設保留 30 天，過期產物回傳 410 Gone。
 * 3. Idempotent Cleanup: 支援冪等批次標記過期紀錄。
 */

import { db } from "@/lib/db";
import { Role } from "@prisma/client";
import { REPORT_SCHEMA_VERSION } from "./report-engine";

export const DEFAULT_RETENTION_DAYS = 30;

export interface RecordExportAuditParams {
  organizationId: string;
  surveyId: string;
  actorId: string;
  actorRole: Role;
  format: "xlsx" | "csv" | "json" | string;
  timeRange?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  reportSchemaVersion?: string;
  fileSize?: number | null;
  retentionDays?: number;
}

/**
 * 計算產物到期時間戳
 */
export function calculateExportExpirationDate(
  retentionDays = DEFAULT_RETENTION_DAYS,
  fromDate = new Date()
): Date {
  return new Date(fromDate.getTime() + retentionDays * 24 * 60 * 60 * 1000);
}

/**
 * 檢查匯出產物是否已失效過期
 */
export function isExportExpired(
  record: { expiresAt: Date; status: string },
  now = new Date()
): boolean {
  if (record.status === "EXPIRED") return true;
  return record.expiresAt.getTime() <= now.getTime();
}

/**
 * E2: 記錄匯出審計操作 (Zero-PII Audit Trail)
 */
export async function recordExportAudit(params: RecordExportAuditParams) {
  const {
    organizationId,
    surveyId,
    actorId,
    actorRole,
    format,
    timeRange = null,
    dateFrom = null,
    dateTo = null,
    reportSchemaVersion = REPORT_SCHEMA_VERSION,
    fileSize = null,
    retentionDays = DEFAULT_RETENTION_DAYS,
  } = params;

  const expiresAt = calculateExportExpirationDate(retentionDays);

  return db.reportExport.create({
    data: {
      organizationId,
      surveyId,
      actorId,
      actorRole,
      format,
      status: "COMPLETED",
      timeRange,
      dateFrom,
      dateTo,
      reportSchemaVersion,
      fileSize,
      downloadCount: 0,
      expiresAt,
    },
  });
}

/**
 * E4: 批次清理與標記過期匯出紀錄 (Idempotent Expiry Cleanup)
 */
export async function cleanupExpiredExports(customNow = new Date()): Promise<{ markedExpiredCount: number }> {
  const result = await db.reportExport.updateMany({
    where: {
      expiresAt: {
        lte: customNow,
      },
      status: {
        not: "EXPIRED",
      },
    },
    data: {
      status: "EXPIRED",
    },
  });

  return { markedExpiredCount: result.count };
}
