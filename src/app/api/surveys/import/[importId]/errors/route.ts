export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ValidationIssue } from "@/types/surveyImport";
import { getCurrentUser, isUserInOrganization, forbiddenResponse } from "@/lib/auth";

function escapeCsvField(field: unknown): string {
  if (field === null || field === undefined) return '""';
  const str = String(field).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { importId: string } }
) {
  try {
    const { importId } = params;

    const record = await db.surveyImport.findUnique({
      where: { importId },
    });

    if (!record) {
      return NextResponse.json(
        {
          success: false,
          error: `查無此匯入紀錄 (${importId})`,
        },
        { status: 404 }
      );
    }

    const auth = await getCurrentUser(req);
    if (auth) {
      const isMember = await isUserInOrganization(auth.user.id, record.organizationId);
      if (!isMember) {
        return forbiddenResponse("您無權下載此組織的錯誤報告");
      }
    }

    let issues: ValidationIssue[] = [];
    if (record.errorDetails) {
      try {
        issues = JSON.parse(record.errorDetails);
      } catch (e) {
        issues = [
          {
            code: (record.errorCode || "UNKNOWN_ERROR") as any,
            severity: "error",
            sheet: "system",
            message: record.errorMessage || "匯入失敗",
          },
        ];
      }
    } else if (record.errorMessage) {
      issues = [
        {
          code: (record.errorCode || "UNKNOWN_ERROR") as any,
          severity: "error",
          sheet: "system",
          message: record.errorMessage,
        },
      ];
    }

    // 產生 UTF-8 CSV 內容（加入 BOM 確保 Excel 開啟不亂碼）
    const headers = ["sheet", "row", "column", "field", "errorCode", "message", "suggestion"];
    const rows = issues.map((issue) => [
      escapeCsvField(issue.sheet || "system"),
      escapeCsvField(issue.row ?? ""),
      escapeCsvField(issue.column ?? ""),
      escapeCsvField(issue.field ?? ""),
      escapeCsvField(issue.code || record.errorCode || ""),
      escapeCsvField(issue.message || ""),
      escapeCsvField(issue.suggestion || ""),
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="import-${importId}-errors.csv"`,
      },
    });
  } catch (error: any) {
    console.error("[Import Error Report CSV API Error]:", error);
    return NextResponse.json(
      {
        success: false,
        error: "無法產出錯誤報告 CSV",
        details: error?.message,
      },
      { status: 500 }
    );
  }
}
