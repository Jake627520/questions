import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { extractClientIp } from "@/lib/submission-integrity";
import { POST as loginPOST } from "@/app/api/auth/login/route";

describe("extractClientIp — trusted-hop (anti-spoof)", () => {
  const mk = (xff?: string, xreal?: string) => {
    const h = new Headers();
    if (xff) h.set("x-forwarded-for", xff);
    if (xreal) h.set("x-real-ip", xreal);
    return new Request("http://localhost", { headers: h });
  };

  it("takes the rightmost (trusted) hop, not the spoofable leftmost", () => {
    // 攻擊者偽造最左的 1.1.1.1；真正由可信代理觀察到的是最右的 9.9.9.9
    expect(extractClientIp(mk("1.1.1.1, 2.2.2.2, 9.9.9.9"))).toBe("9.9.9.9");
  });

  it("returns the single entry as-is", () => {
    expect(extractClientIp(mk("203.0.113.7"))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then localhost", () => {
    expect(extractClientIp(mk(undefined, "8.8.8.8"))).toBe("8.8.8.8");
    expect(extractClientIp(mk())).toBe("127.0.0.1");
  });
});

describe("zod boundary — login rejects type-confused body", () => {
  it("returns 400 VALIDATION_ERROR when password is not a string (old truthy check would pass an array)", async () => {
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "x@y.z", password: ["a", "b"] }),
    });
    const res = await loginPOST(req);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toBe("VALIDATION_ERROR");
  });
});
