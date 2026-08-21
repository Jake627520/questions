import { describe, it, expect } from "vitest";
import { detectCircularDependencies, validateQuestionsStructure } from "../src/lib/survey-engine";
import { QuestionInput } from "../src/lib/types";

describe("M3 循環相依檢測測試 (Circular Dependency Detection Tests)", () => {
  it("應能檢測出直接循環 (A -> B -> A)", () => {
    const questions: QuestionInput[] = [
      {
        orderNum: 1,
        code: "Q_A",
        title: "A",
        questionType: "single_choice",
        required: false,
        scoringEnabled: false,
        reverseScore: false,
        visibilityRules: "SHOW IF Q_B equals 1",
        choices: [],
      },
      {
        orderNum: 2,
        code: "Q_B",
        title: "B",
        questionType: "single_choice",
        required: false,
        scoringEnabled: false,
        reverseScore: false,
        visibilityRules: "SHOW IF Q_A equals 1",
        choices: [],
      },
    ];

    const cycle = detectCircularDependencies(questions);
    expect(cycle).not.toBeNull();
    expect(cycle).toContain("Q_A");
    expect(cycle).toContain("Q_B");

    const validation = validateQuestionsStructure(questions);
    expect(validation.isValid).toBe(false);
    expect(validation.errors[0]).toContain("循環相依");
  });

  it("應能檢測出多階間接循環 (A -> B -> C -> A)", () => {
    const questions: QuestionInput[] = [
      {
        orderNum: 1,
        code: "Q_A",
        title: "A",
        questionType: "single_choice",
        required: false,
        scoringEnabled: false,
        reverseScore: false,
        visibilityRules: "SHOW IF Q_B equals 1",
        choices: [],
      },
      {
        orderNum: 2,
        code: "Q_B",
        title: "B",
        questionType: "single_choice",
        required: false,
        scoringEnabled: false,
        reverseScore: false,
        visibilityRules: "SHOW IF Q_C equals 1",
        choices: [],
      },
      {
        orderNum: 3,
        code: "Q_C",
        title: "C",
        questionType: "single_choice",
        required: false,
        scoringEnabled: false,
        reverseScore: false,
        visibilityRules: "SHOW IF Q_A equals 1",
        choices: [],
      },
    ];

    const cycle = detectCircularDependencies(questions);
    expect(cycle).not.toBeNull();
    expect(cycle).toHaveLength(4); // ["Q_A", "Q_B", "Q_C", "Q_A"] or similar
  });

  it("合法的有向無環依賴 (DAG: A -> B, A -> C, B -> D) 應順利通過檢測", () => {
    const questions: QuestionInput[] = [
      {
        orderNum: 1,
        code: "Q_ROOT",
        title: "Root",
        questionType: "single_choice",
        required: false,
        scoringEnabled: false,
        reverseScore: false,
        choices: [],
      },
      {
        orderNum: 2,
        code: "Q_CHILD1",
        title: "Child 1",
        questionType: "single_choice",
        required: false,
        scoringEnabled: false,
        reverseScore: false,
        visibilityRules: "SHOW IF Q_ROOT equals a",
        choices: [],
      },
      {
        orderNum: 3,
        code: "Q_CHILD2",
        title: "Child 2",
        questionType: "single_choice",
        required: false,
        scoringEnabled: false,
        reverseScore: false,
        visibilityRules: "SHOW IF Q_ROOT equals b",
        choices: [],
      },
      {
        orderNum: 4,
        code: "Q_LEAF",
        title: "Leaf",
        questionType: "single_choice",
        required: false,
        scoringEnabled: false,
        reverseScore: false,
        visibilityRules: "SHOW IF Q_CHILD1 equals c",
        choices: [],
      },
    ];

    const cycle = detectCircularDependencies(questions);
    expect(cycle).toBeNull();

    const validation = validateQuestionsStructure(questions);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("題目依賴不存在之題目或自己依賴自己時應回傳驗證錯誤", () => {
    const selfDep: QuestionInput[] = [
      {
        orderNum: 1,
        code: "Q_SELF",
        title: "Self",
        questionType: "single_choice",
        required: false,
        scoringEnabled: false,
        reverseScore: false,
        visibilityRules: "SHOW IF Q_SELF equals 1",
        choices: [],
      },
    ];
    const selfVal = validateQuestionsStructure(selfDep);
    expect(selfVal.isValid).toBe(false);
    expect(selfVal.errors[0]).toContain("自身");

    const nonExistDep: QuestionInput[] = [
      {
        orderNum: 1,
        code: "Q_NORMAL",
        title: "Normal",
        questionType: "single_choice",
        required: false,
        scoringEnabled: false,
        reverseScore: false,
        visibilityRules: "SHOW IF Q_NOT_EXIST equals 1",
        choices: [],
      },
    ];
    const nonExistVal = validateQuestionsStructure(nonExistDep);
    expect(nonExistVal.isValid).toBe(false);
    expect(nonExistVal.errors[0]).toContain("不存在的題目代碼");
  });
});
