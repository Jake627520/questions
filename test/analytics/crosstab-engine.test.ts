import { describe, it, expect } from "vitest";
import {
  analyzeCrossTabulation,
  extractChoiceValues,
  getDimensionItems,
} from "../../src/lib/analytics/crosstab-engine";
import { QuestionMeta, RawResponseData } from "../../src/lib/analytics/types";

describe("Phase M9-F.1: Pure Function Cross-tabulation Engine Suite", () => {
  // 建立標準題目 Mock
  const qGender: QuestionMeta = {
    id: "q-gender",
    code: "Q1",
    orderNum: 1,
    title: "性別 (單選)",
    questionType: "single_choice",
    required: true,
    scoringEnabled: false,
    choices: [
      { id: "c-male", orderNum: 1, label: "男性", value: "male" },
      { id: "c-female", orderNum: 2, label: "女性", value: "female" },
      { id: "c-other", orderNum: 3, label: "其他", value: "other" },
    ],
  };

  const qSatisfied: QuestionMeta = {
    id: "q-sat",
    code: "Q2",
    orderNum: 2,
    title: "整體滿意度 (單選)",
    questionType: "single_choice",
    required: true,
    scoringEnabled: false,
    choices: [
      { id: "c-sat", orderNum: 1, label: "滿意", value: "sat" },
      { id: "c-unsat", orderNum: 2, label: "不滿意", value: "unsat" },
    ],
  };

  const qRecommendYesNo: QuestionMeta = {
    id: "q-rec",
    code: "Q3",
    orderNum: 3,
    title: "是否推薦本系統 (是否題)",
    questionType: "yes_no",
    required: false,
    scoringEnabled: false,
  };

  const qChannelsMulti: QuestionMeta = {
    id: "q-chan",
    code: "Q4",
    orderNum: 4,
    title: "獲知管道 (多選)",
    questionType: "multiple_choice",
    required: false,
    scoringEnabled: false,
    choices: [
      { id: "c-fb", orderNum: 1, label: "Facebook", value: "fb" },
      { id: "c-google", orderNum: 2, label: "Google", value: "google" },
      { id: "c-friend", orderNum: 3, label: "朋友推薦", value: "friend" },
    ],
  };

  const qFeaturesMulti: QuestionMeta = {
    id: "q-feat",
    code: "Q5",
    orderNum: 5,
    title: "喜愛功能 (多選)",
    questionType: "multiple_choice",
    required: false,
    scoringEnabled: false,
    choices: [
      { id: "c-design", orderNum: 1, label: "問卷設計", value: "design" },
      { id: "c-analytics", orderNum: 2, label: "資料分析", value: "analytics" },
      { id: "c-export", orderNum: 3, label: "報表匯出", value: "export" },
    ],
  };

  describe("1. 基本解析與維度萃取 (Dimension & Value Extraction)", () => {
    it("extractChoiceValues 能正確解析單選、多選 JSON 字串與純文字", () => {
      expect(extractChoiceValues(undefined)).toEqual([]);
      expect(extractChoiceValues({ questionId: "q1", rawValue: "" })).toEqual([]);
      expect(extractChoiceValues({ questionId: "q1", rawValue: JSON.stringify("male") })).toEqual(["male"]);
      expect(extractChoiceValues({ questionId: "q1", rawValue: JSON.stringify(["fb", "google"]) })).toEqual(["fb", "google"]);
      expect(extractChoiceValues({ questionId: "q1", rawValue: JSON.stringify(true) })).toEqual(["yes"]);
      expect(extractChoiceValues({ questionId: "q1", rawValue: JSON.stringify(false) })).toEqual(["no"]);
      expect(extractChoiceValues({ questionId: "q1", rawValue: "plain_string" })).toEqual(["plain_string"]);
    });

    it("duplicate multi-choice values 應自動去重", () => {
      const rawWithDup = JSON.stringify(["fb", "google", "fb", "google", "fb"]);
      const extracted = extractChoiceValues({ questionId: "q1", rawValue: rawWithDup });
      expect(extracted).toEqual(["fb", "google"]);
    });

    it("getDimensionItems 能正確取得選項清單並支援 yes_no 題型預設值", () => {
      const genderItems = getDimensionItems(qGender);
      expect(genderItems.length).toBe(3);
      expect(genderItems.map((i) => i.value)).toEqual(["male", "female", "other"]);

      const yesNoItems = getDimensionItems(qRecommendYesNo);
      expect(yesNoItems.length).toBe(2);
      expect(yesNoItems.map((i) => i.value)).toEqual(["yes", "no"]);
    });
  });

  describe("2. Single Choice × Single Choice", () => {
    it("性別 × 滿意度 交叉矩陣與邊際計數百分比計算正確", () => {
      const responses: RawResponseData[] = [
        // Male: 3 sat, 1 unsat
        { id: "r1", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfied.id, rawValue: JSON.stringify("sat") }] },
        { id: "r2", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfied.id, rawValue: JSON.stringify("sat") }] },
        { id: "r3", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfied.id, rawValue: JSON.stringify("sat") }] },
        { id: "r4", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qSatisfied.id, rawValue: JSON.stringify("unsat") }] },
        // Female: 2 sat, 2 unsat
        { id: "r5", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfied.id, rawValue: JSON.stringify("sat") }] },
        { id: "r6", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfied.id, rawValue: JSON.stringify("sat") }] },
        { id: "r7", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfied.id, rawValue: JSON.stringify("unsat") }] },
        { id: "r8", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qSatisfied.id, rawValue: JSON.stringify("unsat") }] },
        // Other: 0 responses
      ];

      const result = analyzeCrossTabulation(qGender, qSatisfied, responses);

      expect(result.grandTotal).toBe(8);
      expect(result.unpairedCount).toBe(0);
      expect(result.totalResponses).toBe(8);

      // Row Items (Male: 4, Female: 4, Other: 0)
      expect(result.rowItems[0]).toMatchObject({ value: "male", count: 4, percentage: 50 });
      expect(result.rowItems[1]).toMatchObject({ value: "female", count: 4, percentage: 50 });
      expect(result.rowItems[2]).toMatchObject({ value: "other", count: 0, percentage: 0 });

      // Col Items (Sat: 5, Unsat: 3)
      expect(result.colItems[0]).toMatchObject({ value: "sat", count: 5, percentage: 62.5 });
      expect(result.colItems[1]).toMatchObject({ value: "unsat", count: 3, percentage: 37.5 });

      // Matrix Checks:
      // Row 0 (Male): [Male × Sat = 3, Male × Unsat = 1]
      const [mSat, mUnsat] = result.matrix[0];
      expect(mSat).toMatchObject({
        rowChoiceValue: "male",
        colChoiceValue: "sat",
        count: 3,
        rowPercentage: 75, // 3 / 4 = 75%
        colPercentage: 60, // 3 / 5 = 60%
        totalPercentage: 37.5, // 3 / 8 = 37.5%
      });
      expect(mUnsat).toMatchObject({
        rowChoiceValue: "male",
        colChoiceValue: "unsat",
        count: 1,
        rowPercentage: 25, // 1 / 4 = 25%
        colPercentage: 33.3, // 1 / 3 = 33.3%
        totalPercentage: 12.5, // 1 / 8 = 12.5%
      });

      // Row 2 (Other - 0 responses): counts and percentages must be 0
      const [oSat, oUnsat] = result.matrix[2];
      expect(oSat.count).toBe(0);
      expect(oSat.rowPercentage).toBe(0);
      expect(oSat.colPercentage).toBe(0);
      expect(oSat.totalPercentage).toBe(0);
      expect(oUnsat.count).toBe(0);
    });
  });

  describe("3. Single Choice × Yes/No", () => {
    it("性別 × 是否推薦 交叉分析正常運算", () => {
      const responses: RawResponseData[] = [
        { id: "r1", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qRecommendYesNo.id, rawValue: JSON.stringify(true) }] },
        { id: "r2", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qRecommendYesNo.id, rawValue: JSON.stringify(false) }] },
      ];

      const result = analyzeCrossTabulation(qGender, qRecommendYesNo, responses);
      expect(result.grandTotal).toBe(2);
      expect(result.matrix[0][0]).toMatchObject({ rowChoiceValue: "male", colChoiceValue: "yes", count: 1, rowPercentage: 100 });
      expect(result.matrix[1][1]).toMatchObject({ rowChoiceValue: "female", colChoiceValue: "no", count: 1, rowPercentage: 100 });
    });
  });

  describe("4. Single Choice × Multiple Choice & Multiple Choice × Single Choice", () => {
    it("Single (性別) × Multiple (獲知管道)：多選題 Cell 總和可大於母體，分母保持有效作答人數", () => {
      const responses: RawResponseData[] = [
        // R1 (Male): selects fb + google
        { id: "r1", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qChannelsMulti.id, rawValue: JSON.stringify(["fb", "google"]) }] },
        // R2 (Male): selects fb
        { id: "r2", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("male") }, { questionId: qChannelsMulti.id, rawValue: JSON.stringify(["fb"]) }] },
        // R3 (Female): selects google + friend
        { id: "r3", status: "COMPLETED", answers: [{ questionId: qGender.id, rawValue: JSON.stringify("female") }, { questionId: qChannelsMulti.id, rawValue: JSON.stringify(["google", "friend"]) }] },
      ];

      const result = analyzeCrossTabulation(qGender, qChannelsMulti, responses);
      expect(result.grandTotal).toBe(3);

      // Male row: 2 respondents
      // Male × fb = 2 (100% of males), Male × google = 1 (50% of males), Male × friend = 0 (0%)
      expect(result.matrix[0][0]).toMatchObject({ rowChoiceValue: "male", colChoiceValue: "fb", count: 2, rowPercentage: 100 });
      expect(result.matrix[0][1]).toMatchObject({ rowChoiceValue: "male", colChoiceValue: "google", count: 1, rowPercentage: 50 });
      expect(result.matrix[0][2]).toMatchObject({ rowChoiceValue: "male", colChoiceValue: "friend", count: 0, rowPercentage: 0 });

      // Col items check:
      // fb: 2 respondents (66.7% of total paired)
      // google: 2 respondents (66.7% of total paired)
      // friend: 1 respondent (33.3% of total paired)
      expect(result.colItems[0]).toMatchObject({ value: "fb", count: 2, percentage: 66.7 });
      expect(result.colItems[1]).toMatchObject({ value: "google", count: 2, percentage: 66.7 });
      expect(result.colItems[2]).toMatchObject({ value: "friend", count: 1, percentage: 33.3 });
    });

    it("Multiple × Single 具備對稱性運算正確", () => {
      const responses: RawResponseData[] = [
        { id: "r1", status: "COMPLETED", answers: [{ questionId: qChannelsMulti.id, rawValue: JSON.stringify(["fb", "google"]) }, { questionId: qGender.id, rawValue: JSON.stringify("male") }] },
      ];
      const result = analyzeCrossTabulation(qChannelsMulti, qGender, responses);
      expect(result.grandTotal).toBe(1);
      // Row 0 (fb) × Male = 1 (100%)
      // Row 1 (google) × Male = 1 (100%)
      expect(result.matrix[0][0].count).toBe(1);
      expect(result.matrix[1][0].count).toBe(1);
    });
  });

  describe("5. Multiple Choice × Multiple Choice (非互斥集合)", () => {
    it("獲知管道 (多選) × 喜愛功能 (多選)：Cell 交叉配對計數與各別邊際統計正確", () => {
      const responses: RawResponseData[] = [
        // R1: Channels [fb, google] × Features [design, analytics]
        // 生成 4 筆配對: (fb, design), (fb, analytics), (google, design), (google, analytics)
        {
          id: "r1",
          status: "COMPLETED",
          answers: [
            { questionId: qChannelsMulti.id, rawValue: JSON.stringify(["fb", "google"]) },
            { questionId: qFeaturesMulti.id, rawValue: JSON.stringify(["design", "analytics"]) },
          ],
        },
        // R2: Channels [fb] × Features [export]
        // 生成 1 筆配對: (fb, export)
        {
          id: "r2",
          status: "COMPLETED",
          answers: [
            { questionId: qChannelsMulti.id, rawValue: JSON.stringify(["fb"]) },
            { questionId: qFeaturesMulti.id, rawValue: JSON.stringify(["export"]) },
          ],
        },
      ];

      const result = analyzeCrossTabulation(qChannelsMulti, qFeaturesMulti, responses);
      expect(result.grandTotal).toBe(2);

      // fb row (2 respondents: R1, R2)
      // fb × design = 1 (50%)
      // fb × analytics = 1 (50%)
      // fb × export = 1 (50%)
      expect(result.matrix[0][0]).toMatchObject({ rowChoiceValue: "fb", colChoiceValue: "design", count: 1, rowPercentage: 50 });
      expect(result.matrix[0][1]).toMatchObject({ rowChoiceValue: "fb", colChoiceValue: "analytics", count: 1, rowPercentage: 50 });
      expect(result.matrix[0][2]).toMatchObject({ rowChoiceValue: "fb", colChoiceValue: "export", count: 1, rowPercentage: 50 });

      // google row (1 respondent: R1)
      // google × design = 1 (100%)
      // google × analytics = 1 (100%)
      // google × export = 0 (0%)
      expect(result.matrix[1][0]).toMatchObject({ rowChoiceValue: "google", colChoiceValue: "design", count: 1, rowPercentage: 100 });
      expect(result.matrix[1][1]).toMatchObject({ rowChoiceValue: "google", colChoiceValue: "analytics", count: 1, rowPercentage: 100 });
      expect(result.matrix[1][2]).toMatchObject({ rowChoiceValue: "google", colChoiceValue: "export", count: 0, rowPercentage: 0 });
    });
  });

  describe("6. 關鍵母體與未配對統計 (100 Responses 基準驗證)", () => {
    it("100 筆資料中 Row 有效 90 筆、Col 有效 80 筆、雙重有效 72 筆時，grandTotal 嚴格等於 72", () => {
      const responses: RawResponseData[] = [];

      // 1. 72 筆：Both valid (Male × Sat)
      for (let i = 1; i <= 72; i++) {
        responses.push({
          id: `r-both-${i}`,
          status: "COMPLETED",
          answers: [
            { questionId: qGender.id, rawValue: JSON.stringify("male") },
            { questionId: qSatisfied.id, rawValue: JSON.stringify("sat") },
          ],
        });
      }

      // 2. 18 筆：Row valid only (Male × 未作答/隱藏) -> 累計 Row valid = 72 + 18 = 90
      for (let i = 1; i <= 18; i++) {
        responses.push({
          id: `r-row-only-${i}`,
          status: "COMPLETED",
          answers: [
            { questionId: qGender.id, rawValue: JSON.stringify("male") },
            { questionId: qSatisfied.id, rawValue: null as any },
          ],
        });
      }

      // 3. 8 筆：Col valid only (未作答/隱藏 × Sat) -> 累計 Col valid = 72 + 8 = 80
      for (let i = 1; i <= 8; i++) {
        responses.push({
          id: `r-col-only-${i}`,
          status: "COMPLETED",
          answers: [
            { questionId: qGender.id, rawValue: "" },
            { questionId: qSatisfied.id, rawValue: JSON.stringify("sat") },
          ],
        });
      }

      // 4. 2 筆：Both invalid (皆未作答) -> 累計 72 + 18 + 8 + 2 = 100
      for (let i = 1; i <= 2; i++) {
        responses.push({
          id: `r-none-${i}`,
          status: "IN_PROGRESS",
          answers: [
            { questionId: qGender.id, rawValue: null as any },
            { questionId: qSatisfied.id, rawValue: null as any },
          ],
        });
      }

      expect(responses.length).toBe(100);

      const result = analyzeCrossTabulation(qGender, qSatisfied, responses);

      // 驗證核心母體定義
      expect(result.totalResponses).toBe(100);
      expect(result.grandTotal).toBe(72);
      expect(result.unpairedCount).toBe(28); // 100 - 72 = 28

      // 驗證 Male × Sat Cell 計數為 72，且總計百分比分母為 72 (100%)
      expect(result.matrix[0][0]).toMatchObject({
        count: 72,
        rowPercentage: 100,
        colPercentage: 100,
        totalPercentage: 100,
      });
    });
  });

  describe("7. 邊界與極端情境檢驗 (Edge Cases)", () => {
    it("N = 0 時應回傳 grandTotal = 0 且百分比皆為 0，不拋出錯誤", () => {
      const result = analyzeCrossTabulation(qGender, qSatisfied, []);
      expect(result.totalResponses).toBe(0);
      expect(result.grandTotal).toBe(0);
      expect(result.unpairedCount).toBe(0);
      expect(result.matrix[0][0]).toMatchObject({ count: 0, rowPercentage: 0, colPercentage: 0, totalPercentage: 0 });
    });

    it("孤立選項值 (Orphan Choice Values) 與題目未定義選項應安全忽略而不崩潰", () => {
      const responses: RawResponseData[] = [
        {
          id: "r1",
          status: "COMPLETED",
          answers: [
            { questionId: qGender.id, rawValue: JSON.stringify("alien_gender") },
            { questionId: qSatisfied.id, rawValue: JSON.stringify("sat") },
          ],
        },
      ];

      const result = analyzeCrossTabulation(qGender, qSatisfied, responses);
      // 因為 "alien_gender" 不在 qGender.choices 中，配對時找不到對應 row item，不計入有效 matrix cell
      expect(result.grandTotal).toBe(1);
      expect(result.matrix[0][0].count).toBe(0);
    });

    it("題目未被任何填答者選取之選項 (Missing Choices) 計數為 0，百分比為 0", () => {
      const responses: RawResponseData[] = [
        {
          id: "r1",
          status: "COMPLETED",
          answers: [
            { questionId: qGender.id, rawValue: JSON.stringify("male") },
            { questionId: qSatisfied.id, rawValue: JSON.stringify("sat") },
          ],
        },
      ];

      const result = analyzeCrossTabulation(qGender, qSatisfied, responses);
      // "other" 是 rowItems[2]
      expect(result.rowItems[2]).toMatchObject({ value: "other", count: 0, percentage: 0 });
    });

    it("不包含統計推論欄位 (M9-F.1 乾淨邊界：無 statistics / chiSquare)", () => {
      const result = analyzeCrossTabulation(qGender, qSatisfied, []);
      expect((result as any).statistics).toBeUndefined();
      expect((result as any).chiSquare).toBeUndefined();
    });
  });
});
