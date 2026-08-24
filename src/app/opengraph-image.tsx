import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "企業級智慧問卷系統 (Enterprise Survey & Analytics Platform)";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "80px",
          fontFamily: "sans-serif",
          color: "white",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              background: "rgba(59, 130, 246, 0.2)",
              border: "1px solid rgba(96, 165, 250, 0.4)",
              borderRadius: "16px",
              padding: "16px 24px",
              display: "flex",
              alignItems: "center",
              fontSize: "36px",
            }}
          >
            📋
          </div>
          <span style={{ fontSize: "32px", fontWeight: 700, letterSpacing: "-0.02em", color: "#93c5fd" }}>
            Survey Platform Enterprise
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <h1
            style={{
              fontSize: "56px",
              fontWeight: 800,
              lineHeight: 1.15,
              margin: 0,
              color: "#ffffff",
              letterSpacing: "-0.03em",
            }}
          >
            企業級智慧問卷與統計分析平台
          </h1>
          <p
            style={{
              fontSize: "26px",
              color: "#cbd5e1",
              margin: 0,
              lineHeight: 1.4,
              maxWidth: "1000px",
            }}
          >
            Excel 題庫無損匯入 • 動態條件跳題 • 2-Way 交叉分析 • 卡方獨立性檢定 • 去識別化隱私防護
          </p>
        </div>

        <div style={{ display: "flex", gap: "16px" }}>
          <div
            style={{
              background: "#2563eb",
              padding: "10px 24px",
              borderRadius: "9999px",
              fontSize: "20px",
              fontWeight: 600,
            }}
          >
            Analytics v1.0 Production Ready
          </div>
          <div
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              padding: "10px 24px",
              borderRadius: "9999px",
              fontSize: "20px",
              fontWeight: 500,
              color: "#e2e8f0",
            }}
          >
            Multi-Tenant Isolation
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
