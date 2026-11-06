import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { GET as surveyGET } from "@/app/api/surveys/[id]/route";
import {
  GET as responseGET,
  DELETE as responseDELETE,
} from "@/app/api/surveys/[id]/responses/[responseId]/route";

/**
 * 500 回應不可帶出內部錯誤原文 (Prisma model/欄位/約束名等)。
 * 以下三支在認證前就會查 DB，未登入即可觸發 500。
 */
describe("500 responses do not leak internal error messages", () => {
  const secret = "Invalid `prisma.survey.findUnique()` invocation: column secret_col";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /api/surveys/:id", async () => {
    vi.spyOn(db.survey, "findUnique").mockRejectedValue(new Error(secret));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await surveyGET(new NextRequest("http://localhost/api/surveys/x"), { params: Promise.resolve({ id: "x" }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("secret_col");
    expect(body.details).toBeUndefined();
  });

  it.each([
    ["GET", responseGET],
    ["DELETE", responseDELETE],
  ] as const)("%s /api/surveys/:id/responses/:responseId", async (method, handler) => {
    vi.spyOn(db.response, "findUnique").mockRejectedValue(new Error(secret));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handler(new NextRequest("http://localhost/api/surveys/x/responses/y", { method }), {
      params: Promise.resolve({ id: "x", responseId: "y" }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("secret_col");
    expect(log).toHaveBeenCalled();
  });
});
