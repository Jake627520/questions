// 產生 src/styles/themes.css：全站色票的 CSS 變數。
// 用法：node scripts/gen-themes.mjs
//
// ORIGINAL 是原版（08 沙丘月升 → 夜靛編輯調）的色階，輸出到 :root，數值與改版前完全相同。
// 其他主題由原版換算：保留每一階的明度，只換色相與彩度；深色主題把色階前後對調（50 ↔ 950）。
// 要調整某個主題，改下面 THEMES 的參數再重跑。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ORIGINAL = {
  ink: { 50: '#eef0f4', 100: '#dadfe9', 200: '#b7c1d3', 300: '#8b9ab5', 400: '#5f7093', 500: '#3f5478', 600: '#2e3e5c', 700: '#26344d', 800: '#20293b', 900: '#1b2230', 950: '#12161f' },
  stone: { 50: '#f5f4f0', 100: '#eae8e1', 200: '#d8d5ca', 300: '#bdb8a8', 400: '#9c9686', 500: '#7c766a', 600: '#5f5a50', 700: '#47433b', 800: '#332f29', 900: '#22201b', 950: '#161410' },
  sage: { 50: '#eef1e9', 100: '#dde4d2', 200: '#c1ccb0', 300: '#9fae88', 400: '#7e9067', 500: '#647a4f', 600: '#4f6240', 700: '#3f4e34', 800: '#333f2c', 900: '#2b3426', 950: '#161c12' },
  terra: { 50: '#f7e9e3', 100: '#f0ddd5', 200: '#e0bcae', 300: '#cf9683', 400: '#bd7059', 500: '#ad5442', 600: '#a8443a', 700: '#8a3830', 800: '#6f2f29', 900: '#5c2925', 950: '#331411' },
  gold: { 50: '#f7efd8', 100: '#efe3c0', 200: '#e0c98c', 300: '#d0ac57', 400: '#c19538', 500: '#b0842f', 600: '#996f27', 700: '#7c5820', 800: '#61451c', 900: '#4f3919', 950: '#2c1f0d' },
  // Tailwind 預設紫色（少數徽章用），放進來是為了深色主題也能一起換
  plum: { 50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8', 900: '#581c87', 950: '#3b0764' },
};
const SINGLES = { white: '#ffffff', 'page-end': '#ece5d5' };

// hue：新色相；chroma：彩度倍率（0.3 = 更灰）；undefined = 該色系不動
const THEMES = {
  celadon: {
    note: '青瓷：冷調瓷白底＋青瓷綠主色。安靜、可信賴，適合研究與報告。',
    ink: { hue: 195, chroma: 1.25 }, stone: { hue: 210, chroma: 0.5 }, sage: { hue: 145, chroma: 1 },
  },
  wisteria: {
    note: '紫藤：帶一點紫的灰底＋藤紫主色。比原版柔和，有品牌感。',
    ink: { hue: 295, chroma: 1.6 }, stone: { hue: 300, chroma: 0.45 }, plum: { hue: 330, chroma: 1 },
  },
  midnight: {
    note: '深夜（深色）：深藍灰底＋亮藍主色。長時間看數據不刺眼。',
    dark: true,
    ink: { hue: 245, chroma: 1.9, lift: 0.1 }, stone: { hue: 255, chroma: 0.8 },
  },
};

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

// ── OKLCH ↔ sRGB ──────────────────────────────────────────────
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function hexToOklch(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => toLin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}
function oklchToRgb(L, C, H) {
  let a = C * Math.cos((H * Math.PI) / 180);
  let b = C * Math.sin((H * Math.PI) / 180);
  for (let i = 0; i < 40; i++) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    if (rgb.every((v) => v >= -0.001 && v <= 1.001) || i === 39) {
      return rgb.map((v) => Math.round(Math.min(1, Math.max(0, fromLin(Math.min(1, Math.max(0, v))))) * 255));
    }
    a *= 0.93; // 超出色域就降彩度
    b *= 0.93;
  }
}
const triple = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');

function themeScale(name, theme) {
  const rule = theme[name];
  return STEPS.map((step, i) => {
    // 深色主題：用對面那一階的明度（50 ↔ 950）
    const source = ORIGINAL[name][theme.dark ? STEPS[STEPS.length - 1 - i] : step];
    let [L, C, H] = hexToOklch(ORIGINAL[name][step]);
    [L] = hexToOklch(source);
    if (theme.dark && !rule) C *= 0.85; // 深底上的狀態色稍微收斂
    if (rule) {
      H = rule.hue;
      C *= rule.chroma;
      if (rule.lift) L = Math.min(0.97, L + rule.lift * Math.sin((Math.PI * i) / (STEPS.length - 1)));
    }
    return [step, oklchToRgb(L, C, H).join(' ')];
  });
}

const out = [
  '/* 由 scripts/gen-themes.mjs 產生，請勿手改。',
  '   :root 是原版色票；其他主題掛在 html[data-theme="…"]。',
  '   數值是 "R G B"，給 tailwind.config.ts 的 rgb(var(--x) / <alpha-value>) 使用。 */',
  '',
  ':root {',
];
for (const [name, scale] of Object.entries(ORIGINAL)) for (const step of STEPS) out.push(`  --c-${name}-${step}: ${triple(scale[step])};`);
for (const [name, hex] of Object.entries(SINGLES)) out.push(`  --c-${name}: ${triple(hex)};`);
out.push('}');

for (const [id, theme] of Object.entries(THEMES)) {
  // 只在螢幕上換色；列印報表一律用原版配色
  out.push('', `/* ${theme.note} */`, '@media screen {', `html[data-theme="${id}"] {`);
  if (theme.dark) out.push('  color-scheme: dark;');
  for (const name of Object.keys(ORIGINAL)) for (const [step, rgb] of themeScale(name, theme)) out.push(`  --c-${name}-${step}: ${rgb};`);
  const stone = Object.fromEntries(themeScale('stone', theme));
  // 白色＝卡片底；深色主題的色階已對調，stone-100 就是比頁面底（stone-50）亮一階的深色
  out.push(`  --c-white: ${theme.dark ? stone[100] : oklchToRgb(0.995, hexToOklch(ORIGINAL.stone[50])[1] * 0.3 * (theme.stone?.chroma ?? 1), theme.stone?.hue ?? 90).join(' ')};`);
  out.push(`  --c-page-end: ${stone[theme.dark ? 50 : 100]};`);
  out.push('}', '}');
}

writeFileSync(fileURLToPath(new URL('../src/styles/themes.css', import.meta.url)), out.join('\n') + '\n');
