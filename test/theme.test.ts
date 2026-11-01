import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { THEMES, resolveTheme } from "@/lib/theme";

describe("resolveTheme", () => {
  it("defaults to the original palette", () => {
    expect(resolveTheme("", null)).toBe("original");
  });

  it("prefers ?theme= over the stored choice", () => {
    expect(resolveTheme("?theme=midnight", "celadon")).toBe("midnight");
  });

  it("falls back to the stored choice, ignoring unknown ids", () => {
    expect(resolveTheme("?theme=nope", "wisteria")).toBe("wisteria");
    expect(resolveTheme("", "nope")).toBe("original");
  });
});

describe("themes.css", () => {
  const css = readFileSync(path.resolve(__dirname, "../src/styles/themes.css"), "utf8");

  it("defines a palette block for every non-original theme", () => {
    for (const theme of THEMES.filter((t) => t.id !== "original")) {
      expect(css).toContain(`html[data-theme="${theme.id}"]`);
    }
  });

  it("keeps the original palette values in :root", () => {
    // 原版 ink-600 = #2e3e5c、stone-50 = #f5f4f0
    expect(css).toMatch(/:root \{[^}]*--c-ink-600: 46 62 92;/);
    expect(css).toMatch(/:root \{[^}]*--c-stone-50: 245 244 240;/);
  });
});
