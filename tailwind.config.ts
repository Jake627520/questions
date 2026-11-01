import type { Config } from "tailwindcss";

// 08 沙丘月升 → 夜靛編輯調。全站顏色皆 Tailwind 具名色，覆寫色階即改全站，不動元件。
// 色階數值在 src/styles/themes.css（由 scripts/gen-themes.mjs 產生），這裡只指向 CSS 變數，
// 所以切換 html[data-theme] 就能換整套配色；:root 的原版數值與改版前相同。
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const scale = (name: string) =>
  Object.fromEntries(STEPS.map((step) => [step, `rgb(var(--c-${name}-${step}) / <alpha-value>)`]));
const indigoInk = scale("ink");
const warmStone = scale("stone");
const sage = scale("sage");
const terracotta = scale("terra");
const duneGold = scale("gold");
const plum = scale("plum");

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: indigoInk, blue: indigoInk, indigo: indigoInk, sky: indigoInk,
        slate: warmStone, gray: warmStone, zinc: warmStone, neutral: warmStone,
        green: sage, emerald: sage,
        red: terracotta, rose: terracotta,
        amber: duneGold, yellow: duneGold,
        purple: plum,
        white: "rgb(var(--c-white) / <alpha-value>)",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "-apple-system", '"PingFang TC"', "sans-serif"],
        serif: ['"IBM Plex Serif"', "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
