import { describe, it, expect, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { parseSurveyExcel, hasValidXlsxSignature, parseStrictBoolean } from "@/lib/excel-parser";
import { validateQuestionsStructure, detectCircularDependencies } from "@/lib/survey-engine";
import { ValidationIssue } from "@/types/surveyImport";

/**
 * 建立標準合法的 2-Sheet Excel 活頁簿 Buffer Helper
 */
async function createWorkbookBuffer(options?: {
  questions?: Array<Record<string, any>>;
  choices?: Array<Record<string, any>>;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const qSheet = wb.addWorksheet("questions");
  const cSheet = wb.addWorksheet("choices");

  // Questions Headers
  qSheet.addRow([
    "code",
    "title",
    "description",
    "question_type",
    "required",
    "scoring_enabled",
    "reverse_score",
    "visibility_rules",
    "visibility_hint",
    "min_selections",
    "max_selections",
    "min_value",
    "max_value",
    "order_num",
  ]);

  const defaultQuestions = options?.questions ?? [
    {
      code: "Q1",
      title: "請問您的年齡區間？",
      question_type: "single_choice",
      required: "TRUE",
      order_num: 1,
    },
    {
      code: "Q2",
      title: "您對我們產品的滿意度？",
      question_type: "single_choice",
      required: "TRUE",
      order_num: 2,
    },
  ];

  for (const q of defaultQuestions) {
    qSheet.addRow([
      q.code ?? "Q1",
      q.title ?? "題目",
      q.description ?? null,
      q.question_type ?? "single_choice",
      q.required ?? "FALSE",
      q.scoring_enabled ?? "FALSE",
      q.reverse_score ?? "FALSE",
      q.visibility_rules ?? null,
      q.visibility_hint ?? null,
      q.min_selections ?? null,
      q.max_selections ?? null,
      q.min_value ?? null,
      q.max_value ?? null,
      q.order_num ?? 1,
    ]);
  }

  // Choices Headers
  cSheet.addRow([
    "question_code",
    "label",
    "value",
    "order_num",
    "score_enabled",
    "score",
    "is_other",
    "requires_text",
    "is_none_of_above",
  ]);

  const defaultChoices = options?.choices ?? [
    { question_code: "Q1", label: "20-29", value: "20_29", order_num: 1 },
    { question_code: "Q1", label: "30-39", value: "30_39", order_num: 2 },
    { question_code: "Q2", label: "滿意", value: "sat", order_num: 1 },
    { question_code: "Q2", label: "不滿意", value: "unsat", order_num: 2 },
  ];

  for (const c of defaultChoices) {
    cSheet.addRow([
      c.question_code ?? "Q1",
      c.label ?? "選項",
      c.value ?? "opt",
      c.order_num ?? 1,
      c.score_enabled ?? "FALSE",
      c.score ?? null,
      c.is_other ?? "FALSE",
      c.requires_text ?? "FALSE",
      c.is_none_of_above ?? "FALSE",
    ]);
  }

  const rawBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(rawBuffer);
}

describe("Phase M9-E.0: Excel Import Security & Data Integrity Hardening", () => {
  describe("1. Strict Boolean Parsing (嚴格布林值校驗)", () => {
    it("應接受所有合法的 Truthy 表示法 (TRUE, True, true, 1, YES, Yes, yes, Y, y, 是)", () => {
      const truthyInputs = ["TRUE", "True", "true", 1, "YES", "Yes", "yes", "Y", "y", "是", true];
      for (const val of truthyInputs) {
        const issues: ValidationIssue[] = [];
        const errors: string[] = [];
        const res = parseStrictBoolean(val, "required", 2, "questions", issues, errors);
        expect(res).toBe(true);
        expect(issues).toHaveLength(0);
        expect(errors).toHaveLength(0);
      }
    });

    it("應接受所有合法的 Falsy 表示法 (FALSE, False, false, 0, NO, No, no, N, n, 否, null, undefined, 空白)", () => {
      const falsyInputs = [
        "FALSE",
        "False",
        "false",
        0,
        "NO",
        "No",
        "no",
        "N",
        "n",
        "否",
        null,
        undefined,
        "",
        "   ",
        false,
      ];
      for (const val of falsyInputs) {
        const issues: ValidationIssue[] = [];
        const errors: string[] = [];
        const res = parseStrictBoolean(val, "required", 2, "questions", issues, errors);
        expect(res).toBe(false);
        expect(issues).toHaveLength(0);
        expect(errors).toHaveLength(0);
      }
    });

    it("遭遇非法字串 (abc, maybe, 2, -1, 10, TRUE123) 不得靜默轉換為 false，必須回報 INVALID_BOOLEAN_VALUE", () => {
      const invalidInputs = ["abc", "maybe", "2", "-1", "10", "TRUE123", "invalid-required", 2, 99];
      for (const val of invalidInputs) {
        const issues: ValidationIssue[] = [];
        const errors: string[] = [];
        const res = parseStrictBoolean(val, "required", 3, "questions", issues, errors);
        expect(res).toBe(false);
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe("INVALID_BOOLEAN_VALUE");
        expect(issues[0].severity).toBe("error");
        expect(issues[0].field).toBe("required");
        expect(issues[0].row).toBe(3);
        expect(issues[0].sheet).toBe("questions");
        expect(errors).toHaveLength(1);
      }
    });

    it("在 Excel 實體檔案中，questions 工作表的所有 3 個布林欄位 (required, scoring_enabled, reverse_score) 皆套用嚴格檢查", async () => {
      const buffer = await createWorkbookBuffer({
        questions: [
          {
            code: "Q1",
            title: "測試題目",
            question_type: "single_choice",
            required: "invalid_req_val",
            scoring_enabled: "invalid_score_val",
            reverse_score: "invalid_rev_val",
          },
        ],
      });

      const { errors, issues } = await parseSurveyExcel(buffer);
      expect(errors.length).toBeGreaterThanOrEqual(3);
      const booleanIssues = issues.filter((i) => i.code === "INVALID_BOOLEAN_VALUE");
      expect(booleanIssues).toHaveLength(3);
      expect(booleanIssues.map((i) => i.field)).toEqual(
        expect.arrayContaining(["required", "scoring_enabled", "reverse_score"])
      );
    });

    it("在 Excel 實體檔案中，choices 工作表的所有 4 個布林欄位 (score_enabled, is_other, requires_text, is_none_of_above) 皆套用嚴格檢查", async () => {
      const buffer = await createWorkbookBuffer({
        choices: [
          {
            question_code: "Q1",
            label: "選項 A",
            value: "A",
            score_enabled: "bad_score_enabled",
            is_other: "bad_is_other",
            requires_text: "bad_requires_text",
            is_none_of_above: "bad_is_none",
          },
        ],
      });

      const { errors, issues } = await parseSurveyExcel(buffer);
      expect(errors.length).toBeGreaterThanOrEqual(4);
      const booleanIssues = issues.filter((i) => i.code === "INVALID_BOOLEAN_VALUE");
      expect(booleanIssues).toHaveLength(4);
      expect(booleanIssues.map((i) => i.field)).toEqual(
        expect.arrayContaining(["score_enabled", "is_other", "requires_text", "is_none_of_above"])
      );
    });
  });

  describe("2. Formula & Spreadsheet Injection Adversarial Testing", () => {
    it("對於包含各類公式前綴 (=, +, -, @, \\t=, 空白=) 之題目與選項文字，系統安全讀取純文字而不執行", async () => {
      const buffer = await createWorkbookBuffer({
        questions: [
          {
            code: "Q1",
            title: "\t=HYPERLINK('http://attacker.com/leak', '點擊領取獎品')",
            description: "   =cmd|'/C calc'!A0",
            question_type: "single_choice",
            required: "TRUE",
          },
          {
            code: "Q2",
            title: "+SUM(1, 2, 3)",
            description: "-1000",
            question_type: "single_choice",
            required: "FALSE",
          },
          {
            code: "Q3",
            title: "@A1+B1",
            description: "=1+1",
            question_type: "text",
            required: "FALSE",
          },
        ],
        choices: [
          {
            question_code: "Q1",
            label: "=HYPERLINK('http://malicious.org')",
            value: "opt1",
          },
          {
            question_code: "Q1",
            label: "+cmd",
            value: "opt2",
          },
          {
            question_code: "Q2",
            label: "-cmd",
            value: "opt3",
          },
        ],
      });

      const { questions, errors, issues } = await parseSurveyExcel(buffer);
      expect(errors).toHaveLength(0);
      expect(issues).toHaveLength(0);
      expect(questions).toHaveLength(3);

      expect(questions[0].title).toContain("HYPERLINK");
      expect(questions[0].description).toContain("cmd");
      expect(questions[1].title).toContain("+SUM");
      expect(questions[2].title).toContain("@A1+B1");
      expect(questions[0].choices[0].label).toContain("HYPERLINK");
    });

    it("SQL Injection 字元與 XSS Payload 在 title / label 中被當作純文字安全解析", async () => {
      const buffer = await createWorkbookBuffer({
        questions: [
          {
            code: "Q1",
            title: "<script>alert('XSS')</script> -- DROP TABLE surveys;",
            description: "'; DELETE FROM responses WHERE '1'='1",
            question_type: "text",
            required: "TRUE",
          },
        ],
        choices: [],
      });

      const { questions, errors } = await parseSurveyExcel(buffer);
      expect(errors).toHaveLength(0);
      expect(questions[0].title).toBe("<script>alert('XSS')</script> -- DROP TABLE surveys;");
      expect(questions[0].description).toBe("'; DELETE FROM responses WHERE '1'='1");
    });
  });

  describe("3. Skip Logic & Visibility Graph Integrity", () => {
    it("偵測 Self-loop 相依 (題目條件相依於自身) 應報錯", () => {
      const questions = [
        {
          code: "Q1",
          title: "自我相依題目",
          questionType: "single_choice" as const,
          required: true,
          visibilityRules: "SHOW IF Q1 equals 1",
          choices: [{ label: "1", value: "1", orderNum: 1 }],
        },
      ];

      const res = validateQuestionsStructure(questions as any);
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes("不能將條件相依設定為自己自身"))).toBe(true);
    });

    it("偵測相依於不存在的題目代碼 (Missing dependency) 應報錯", () => {
      const questions = [
        {
          code: "Q1",
          title: "正常題",
          questionType: "text" as const,
          required: true,
        },
        {
          code: "Q2",
          title: "孤立相依題",
          questionType: "text" as const,
          required: true,
          visibilityRules: "SHOW IF Q99 equals hello",
        },
      ];

      const res = validateQuestionsStructure(questions as any);
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes("相依於不存在的題目代碼"))).toBe(true);
    });

    it("偵測條件中的選項值不存在於相依題目中 (Invalid Choice Value) 應報錯", () => {
      const questions = [
        {
          code: "Q1",
          title: "選擇題",
          questionType: "single_choice" as const,
          required: true,
          choices: [
            { label: "選項A", value: "A", orderNum: 1 },
            { label: "選項B", value: "B", orderNum: 2 },
          ],
        },
        {
          code: "Q2",
          title: "條件題",
          questionType: "text" as const,
          required: true,
          visibilityRules: "SHOW IF Q1 equals 非法選項值",
        },
      ];

      const res = validateQuestionsStructure(questions as any);
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes("不存在於題目「Q1」的選項清單中"))).toBe(true);
    });

    it("偵測循環相依 (Circular Dependency) 應報錯", () => {
      const questions = [
        {
          code: "Q1",
          title: "題目 1",
          questionType: "text" as const,
          required: true,
          visibilityRules: "SHOW IF Q2 equals a",
        },
        {
          code: "Q2",
          title: "題目 2",
          questionType: "text" as const,
          required: true,
          visibilityRules: "SHOW IF Q1 equals b",
        },
      ];

      const cycle = detectCircularDependencies(questions as any);
      expect(cycle).not.toBeNull();

      const res = validateQuestionsStructure(questions as any);
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes("循環相依"))).toBe(true);
    });
  });

  describe("4. File Level Security Boundaries & Magic Bytes", () => {
    it("驗證合法的 XLSX Magic Bytes (PK\\x03\\x04)", async () => {
      const validBuffer = await createWorkbookBuffer();
      expect(hasValidXlsxSignature(validBuffer)).toBe(true);
    });

    it("偽造的副檔名 (例如文字檔偽裝成 .xlsx) 應被 Magic Bytes 檢查拒絕", () => {
      const fakeBuffer = Buffer.from("THIS IS NOT A ZIP FILE BUT PLAIN TEXT");
      expect(hasValidXlsxSignature(fakeBuffer)).toBe(false);
    });

    it("長度小於 4 bytes 的緩衝區應安全回傳 false 而不發生崩潰", () => {
      expect(hasValidXlsxSignature(Buffer.from([0x50, 0x4b]))).toBe(false);
      expect(hasValidXlsxSignature(Buffer.from([]))).toBe(false);
    });
  });
});
