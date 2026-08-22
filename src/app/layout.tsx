import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { FileSpreadsheet, LayoutGrid, PlusCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "問卷系統 MVP (Survey System)",
  description: "支援 Excel 題庫匯入、靈活計分與統計分析的問卷系統",
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
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 text-blue-600 font-bold text-xl tracking-tight">
              <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">📋</span>
              <span>問卷系統 MVP</span>
            </Link>
            <nav className="flex items-center gap-3">
              <Link
                href="/"
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition"
              >
                <LayoutGrid className="w-4 h-4" />
                <span>問卷列表</span>
              </Link>
              <Link
                href="/surveys/import"
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Excel 匯入題庫</span>
              </Link>
              <Link
                href="/account"
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition border border-slate-200"
              >
                <span>帳號管理</span>
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
