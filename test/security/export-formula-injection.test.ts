import { describe, it, expect } from "vitest";
import { escapeFormulaString, safeCell } from "@/lib/excel-formula-safety";

describe("escapeFormulaString — CSV/Excel formula-injection guard", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "=HYPERLINK(\"http://evil\")", "=cmd|'/c calc'!A1", "\tcmd", "\rx"])(
    "prefixes a single quote for dangerous leading char: %j",
    (v) => {
      expect(escapeFormulaString(v)).toBe("'" + v);
    }
  );

  it.each(["hello", "非常滿意", "3.5", "a=b", "x-y", "user@example.com 的評語", "price is +5%"])(
    "leaves safe strings untouched: %j",
    (v) => {
      // '@' 只在「開頭」危險；email/含符號但非開頭者不應被改
      expect(escapeFormulaString(v)).toBe(v);
    }
  );

  it("handles empty string", () => {
    expect(escapeFormulaString("")).toBe("");
  });
});

describe("safeCell — mixed-type cell values", () => {
  it("escapes dangerous strings", () => {
    expect(safeCell("=x")).toBe("'=x");
    expect(safeCell("@evil")).toBe("'@evil");
  });
  it("passes through non-string values unchanged", () => {
    expect(safeCell(42)).toBe(42);
    expect(safeCell(null)).toBe(null);
    expect(safeCell(undefined)).toBe(undefined);
    expect(safeCell(true)).toBe(true);
  });
  it("passes through safe strings unchanged", () => {
    expect(safeCell("非常滿意")).toBe("非常滿意");
  });
});
