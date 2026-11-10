import { describe, expect, it } from "vitest";
import { buildSecurityHeaders } from "../../src/lib/security-headers.mjs";

function headerMap(nodeEnv: string) {
  return Object.fromEntries(buildSecurityHeaders(nodeEnv).map((header) => [header.key, header.value]));
}

describe("security response headers", () => {
  it("sets CSP, framing, nosniff, referrer, and permissions policies in production", () => {
    const headers = headerMap("production");

    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Permissions-Policy"]).toContain("microphone=()");
    expect(headers["Permissions-Policy"]).toContain("geolocation=()");
    expect(headers["Permissions-Policy"]).not.toContain("clipboard");

    const csp = headers["Content-Security-Policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
    expect(csp).toContain("https://api.qrserver.com");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("allows eval only outside production so next dev can compile", () => {
    const csp = headerMap("development")["Content-Security-Policy"];
    expect(csp).toContain("'unsafe-eval'");
  });
});
