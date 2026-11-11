import { buildSecurityHeaders } from "./src/lib/security-headers.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders(process.env.NODE_ENV),
      },
    ];
  },
};

export default nextConfig;
