import type { Config } from "tailwindcss";

// 08 沙丘月升 → 夜靛編輯調。全站顏色皆 Tailwind 具名色，覆寫色階即改全站，不動元件。
const indigoInk = { 50:"#eef0f4",100:"#dadfe9",200:"#b7c1d3",300:"#8b9ab5",400:"#5f7093",500:"#3f5478",600:"#2e3e5c",700:"#26344d",800:"#20293b",900:"#1b2230",950:"#12161f" };
const warmStone = { 50:"#f5f4f0",100:"#eae8e1",200:"#d8d5ca",300:"#bdb8a8",400:"#9c9686",500:"#7c766a",600:"#5f5a50",700:"#47433b",800:"#332f29",900:"#22201b",950:"#161410" };
const sage = { 50:"#eef1e9",100:"#dde4d2",200:"#c1ccb0",300:"#9fae88",400:"#7e9067",500:"#647a4f",600:"#4f6240",700:"#3f4e34",800:"#333f2c",900:"#2b3426",950:"#161c12" };
const terracotta = { 50:"#f7e9e3",100:"#f0ddd5",200:"#e0bcae",300:"#cf9683",400:"#bd7059",500:"#ad5442",600:"#a8443a",700:"#8a3830",800:"#6f2f29",900:"#5c2925",950:"#331411" };
const duneGold = { 50:"#f7efd8",100:"#efe3c0",200:"#e0c98c",300:"#d0ac57",400:"#c19538",500:"#b0842f",600:"#996f27",700:"#7c5820",800:"#61451c",900:"#4f3919",950:"#2c1f0d" };

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
