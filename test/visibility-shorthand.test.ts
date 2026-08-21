import { describe, it, expect } from "vitest";
import { parseVisibilityRule, parseShorthandRule } from "../src/lib/survey-engine";

describe("M3 條件規則簡寫語法測試 (Visibility Rules Shorthand Parser Tests)", () => {
  it("應能正確解析 'in [val1, val2]' 簡寫語法並轉換為 OR 邏輯", () => {
    const rule = parseShorthandRule("SHOW IF Q1 in [very_dissatisfied, dissatisfied]");
    expect(rule).not.toBeNull();
    expect(rule?.action).toBe("SHOW");
    expect(rule?.logic).toBe("OR");
    expect(rule?.conditions).toHaveLength(2);
    expect(rule?.conditions[0]).toEqual({
      dependsOnQuestionCode: "Q1",
      operator: "equals",
      value: "very_dissatisfied",
    });
    expect(rule?.conditions[1]).toEqual({
      dependsOnQuestionCode: "Q1",
      operator: "equals",
      value: "dissatisfied",
    });
  });

  it("應能正確解析 'SHOW IF Q1 equals dissatisfied'", () => {
    const rule = parseVisibilityRule("SHOW IF Q1 equals dissatisfied");
    expect(rule).not.toBeNull();
    expect(rule?.action).toBe("SHOW");
    expect(rule?.conditions[0]).toEqual({
      dependsOnQuestionCode: "Q1",
      operator: "equals",
      value: "dissatisfied",
    });
  });

  it("應能正確解析 'SHOW IF Q5 contains slack'", () => {
    const rule = parseVisibilityRule("SHOW IF Q5 contains slack");
    expect(rule).not.toBeNull();
    expect(rule?.action).toBe("SHOW");
    expect(rule?.conditions[0]).toEqual({
      dependsOnQuestionCode: "Q5",
      operator: "contains",
      value: "slack",
    });
  });

  it("應能正確解析 'SHOW IF Q4 lt 2' (數值運算子)", () => {
    const rule = parseVisibilityRule("SHOW IF Q4 lt 2");
    expect(rule).not.toBeNull();
    expect(rule?.action).toBe("SHOW");
    expect(rule?.conditions[0]).toEqual({
      dependsOnQuestionCode: "Q4",
      operator: "lt",
      value: 2,
    });
  });

  it("應能正確解析 'HIDE IF Q1 == very_satisfied' (HIDE 動作與二元符號)", () => {
    const rule = parseVisibilityRule("HIDE IF Q1 == very_satisfied");
    expect(rule).not.toBeNull();
    expect(rule?.action).toBe("HIDE");
    expect(rule?.conditions[0]).toEqual({
      dependsOnQuestionCode: "Q1",
      operator: "equals",
      value: "very_satisfied",
    });
  });

  it("應能正確解析複合條件 'SHOW IF Q1 equals a OR Q2 contains b'", () => {
    const rule = parseVisibilityRule("SHOW IF Q1 equals a OR Q2 contains b");
    expect(rule).not.toBeNull();
    expect(rule?.action).toBe("SHOW");
    expect(rule?.logic).toBe("OR");
    expect(rule?.conditions).toHaveLength(2);
    expect(rule?.conditions[0].dependsOnQuestionCode).toBe("Q1");
    expect(rule?.conditions[1].dependsOnQuestionCode).toBe("Q2");
  });

  it("標準 JSON 格式仍應 100% 正確解析並向後相容", () => {
    const rawJson = JSON.stringify({
      action: "SHOW",
      logic: "AND",
      conditions: [{ dependsOnQuestionCode: "Q1", operator: "equals", value: "test" }],
    });
    const rule = parseVisibilityRule(rawJson);
    expect(rule).not.toBeNull();
    expect(rule?.action).toBe("SHOW");
    expect(rule?.conditions[0].value).toBe("test");
  });

  it("不合法的簡寫語法應回傳 null", () => {
    expect(parseVisibilityRule("INVALID SYNTAX")).toBeNull();
    expect(parseVisibilityRule("SHOW IF")).toBeNull();
    expect(parseVisibilityRule("SHOW IF Q1 in []")).toBeNull();
  });
});
