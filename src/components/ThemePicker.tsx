"use client";

import { useEffect, useState } from "react";
import { THEMES, THEME_STORAGE_KEY, ThemeId, applyTheme, resolveTheme } from "@/lib/theme";

export function ThemePicker() {
  const [theme, setTheme] = useState<ThemeId>("original");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // 讀不到就當原版
    }
    setTheme(resolveTheme(window.location.search, stored));
  }, []);

  const choose = (id: ThemeId) => {
    applyTheme(id);
    setTheme(id);
  };

  return (
    <div className="no-print flex flex-wrap items-center justify-center gap-2 mt-3" role="radiogroup" aria-label="介面配色">
      <span className="text-xs text-slate-500">配色</span>
      {THEMES.map((item) => {
        const selected = item.id === theme;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => choose(item.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition ${
              selected
                ? "border-blue-600 text-blue-700 bg-blue-50 font-semibold"
                : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {/* 色塊用固定色碼：不管目前在哪個主題，都看得到該主題本身的底色與主色 */}
            <span
              aria-hidden="true"
              className="w-3.5 h-3.5 rounded-full border border-black/10"
              style={{ background: `linear-gradient(135deg, ${item.swatch[0]} 50%, ${item.swatch[1]} 50%)` }}
            />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
