import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { FileSpreadsheet, LayoutGrid, Settings, PlusCircle } from "lucide-react";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://questions-survey-system1.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "企業級智慧問卷與統計分析平台 (Survey System)",
    template: "%s | 問卷系統",
  },
  description: "支援 Excel 題庫無損匯入、靈活邏輯跳題、加權計分、2-Way 交叉分析、卡方獨立性檢定與去識別化隱私防護的企業級問卷平台",
  applicationName: "Survey System MVP",
  keywords: [
    "問卷系統",
    "Survey System",
    "Excel題庫匯入",
    "交叉分析",
    "卡方檢定",
    "Cross-tabulation",
    "Chi-Square",
    "隱私抑制",
    "去識別化",
    "統計分析",
  ],
  authors: [{ name: "Survey Platform Team" }],
  creator: "Survey Platform Team",
  publisher: "Survey Platform Enterprise",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: "website",
    locale: "zh_TW",
    url: siteUrl,
    title: "企業級智慧問卷與統計分析平台 (Survey System)",
    description: "支援 Excel 題庫無損匯入、靈活邏輯跳題、加權計分、2-Way 交叉分析、卡方獨立性檢定與去識別化隱私防護的企業級問卷平台",
    siteName: "問卷系統 MVP (Survey System)",
  },
  twitter: {
    card: "summary_large_image",
    title: "企業級智慧問卷與統計分析平台 (Survey System)",
    description: "支援 Excel 題庫無損匯入、靈活邏輯跳題、加權計分、2-Way 交叉分析、卡方獨立性檢定與去識別化隱私防護的企業級問卷平台",
    creator: "@surveysystem",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className="antialiased text-slate-900 bg-slate-50 flex flex-col min-h-screen">
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-200 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 text-blue-600 font-bold text-xl tracking-tight shrink-0">
                <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">📋</span>
                <span className="hidden sm:inline">問卷系統 MVP</span>
              </Link>
              <WorkspaceSwitcher />
            </div>

            <nav className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/"
                className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition"
              >
                <LayoutGrid className="w-4 h-4" />
                <span>問卷列表</span>
              </Link>
              <Link
                href="/surveys/import"
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span className="hidden sm:inline">Excel 匯入題庫</span>
                <span className="sm:hidden">匯入</span>
              </Link>
              <Link
                href="/settings/organization"
                className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition"
                title="組織與成員設定"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden md:inline">組織設定</span>
              </Link>
              <Link
                href="/account"
                className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition border border-slate-200"
              >
                <span>帳號</span>
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
          {children}
        </main>

        <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-sm text-slate-500">
          <p>© 2026 Survey System MVP. Built with Next.js, Prisma, PostgreSQL & ExcelJS.</p>
        </footer>
      </body>
    </html>
  );
}
