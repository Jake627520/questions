// 介面配色主題（試用中）。色票在 src/styles/themes.css，這裡只決定「目前用哪一套」。
// "original" 不設 data-theme，走 :root 的原版色票，所以切回原版就是改版前的樣子。

export const THEMES = [
  { id: "original", label: "原版・夜靛", swatch: ["#f5f4f0", "#2e3e5c"] },
  { id: "celadon", label: "青瓷", swatch: ["#f2f4f5", "#034848"] },
  { id: "wisteria", label: "紫藤", swatch: ["#f4f4f5", "#423368"] },
  { id: "midnight", label: "深夜（深色）", swatch: ["#131416", "#4f92c9"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_STORAGE_KEY = "survey-theme";

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

/** ?theme= 優先（方便分享預覽連結），其次是上次的選擇，都沒有就是原版。 */
export function resolveTheme(search: string, stored: string | null): ThemeId {
  const fromUrl = new URLSearchParams(search).get("theme");
  if (isThemeId(fromUrl)) return fromUrl;
  if (isThemeId(stored)) return stored;
  return "original";
}

export function applyTheme(theme: ThemeId) {
  const root = document.documentElement;
  if (theme === "original") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 無痕模式存不了，下次就回到原版
  }
}

// 放在 <head> 的同步小腳本：在第一次繪製前套上主題，避免先閃一下原版配色。
// 邏輯與 resolveTheme 相同，但必須是純字串（React 還沒載入）。
export const themeBootScript = `(function(){try{var ids=${JSON.stringify(THEMES.map((t) => t.id))};var q=new URLSearchParams(location.search).get("theme");var s=null;try{s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}var t=ids.indexOf(q)>=0?q:(ids.indexOf(s)>=0?s:"original");if(t!=="original")document.documentElement.setAttribute("data-theme",t);if(q&&ids.indexOf(q)>=0)localStorage.setItem(${JSON.stringify(THEME_STORAGE_KEY)},q)}catch(e){}})();`;
