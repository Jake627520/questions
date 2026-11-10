/**
 * Response headers for HTML, API, and static routes.
 *
 * script-src keeps 'unsafe-inline' because the App Router emits inline
 * bootstrap / flight scripts and the theme boot snippet in src/app/layout.tsx
 * has no per-request nonce. A nonce would also force the root layout dynamic
 * and drop the current static prerender. Host allowlists, object-src, base-uri,
 * and frame-ancestors still apply.
 *
 * style-src allows Google Fonts (globals.css @import) and inline style
 * attributes used by charts and the theme picker. img-src allows the QR
 * code images on the share dialog (api.qrserver.com).
 *
 * HSTS is intentionally omitted: Vercel already sends it, and sending it from
 * `next start` / the standalone server would mark http://localhost as HTTPS-only
 * and break Playwright.
 *
 * @param {string | undefined} nodeEnv
 * @returns {{ key: string, value: string }[]}
 */
export function buildSecurityHeaders(nodeEnv = process.env.NODE_ENV) {
  const isProd = nodeEnv === "production";
  const scriptSrc = ["'self'", "'unsafe-inline'"];
  // `next dev` compiles with eval. Production bundles do not.
  if (!isProd) scriptSrc.push("'unsafe-eval'");

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://api.qrserver.com",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: [
        "camera=()",
        "microphone=()",
        "geolocation=()",
        "payment=()",
        "usb=()",
        "interest-cohort=()",
        "browsing-topics=()",
      ].join(", "),
    },
  ];
}
