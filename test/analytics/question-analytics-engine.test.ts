import { describe, it, expect } from "vitest";
import {
  calculateResponseRates,
  calculateOptionDistribution,
  calculateNumericStatistics,
  analyzeSurveyQuestions,
  QuestionMeta,
  RawResponseData,
} from "../../src/lib/analytics";

describe("Phase M9-E.1: Pure Function Analytics Engine & Statistical Suite", () => {
  // =========================================================================
  // 1. Response Rates (Answer / Unanswered Rates)
  // =========================================================================
  describe("1. calculateResponseRates", () => {
    it("正常計算作答率與未作答率 (總和 100%)", () => {
      const rates = calculateResponseRates(1000, 920);
      expect(rates.totalResponses).toBe(1000);
      expect(rates.answeredCount).toBe(920);
      expect(rates.unansweredCount).toBe(80);
      expect(rates.answerRate).toBe(92.0);
      expect(rates.unansweredRate).toBe(8.0);
    });

    it("邊界狀況：N = 0 時應安全回傳 0% 而不除以零", () => {
      const rates = calculateResponseRates(0, 0);
      expect(rates.totalResponses).toBe(0);
      expect(rates.answeredCount).toBe(0);
      expect(rates.unansweredCount).toBe(0);
      expect(rates.answerRate).toBe(0);
      expect(rates.unansweredRate).toBe(0);
    });

    it("邊界狀況：全數未作答 (answeredCount = 0)", () => {
      const rates = calculateResponseRates(50, 0);
      expect(rates.totalResponses).toBe(50);
      expect(rates.answeredCount).toBe(0);
      expect(rates.unansweredCount).toBe(50);
      expect(rates.answerRate).toBe(0);
      expect(rates.unansweredRate).toBe(100.0);
    });

    it("邊界狀況：全數皆作答 (answeredCount = totalResponses)", () => {
      const rates = calculateResponseRates(200, 200);
      expect(rates.answeredCount).toBe(200);
      expect(rates.unansweredCount).toBe(0);
      expect(rates.answerRate).toBe(100.0);
      expect(rates.unansweredRate).toBe(0);
    });
  });

  // =========================================================================
  // 2. Option Distribution (Single / Multiple Choice / Yes-No)
  // =========================================================================
  describe("2. calculateOptionDistribution", () => {
    const choices = [
      { id: "c1", orderNum: 1, label: "選項 A", value: "opt_a" },
      { id: "c2", orderNum: 2, label: "選項 B", value: "opt_b" },
      { id: "c3", orderNum: 3, label: "選項 C", value: "opt_c" },
    ];

    it("單選題 (Single Choice): 各選項百分比總和 ≈ 100%", () => {
      const answers = [
        { questionId: "q1", rawValue: JSON.stringify("opt_a") },
        { questionId: "q1", rawValue: JSON.stringify("opt_a") },
        { questionId: "q1", rawValue: JSON.stringify("opt_b") },
        { questionId: "q1", rawValue: "opt_c" }, // 純字串格式相容
      ];

      const dist = calculateOptionDistribution(choices, answers, 4);
      expect(dist).not.toBeNull();
      expect(dist).toHaveLength(3);

      expect(dist![0].count).toBe(2);
      expect(dist![0].percentage).toBe(50.0);

      expect(dist![1].count).toBe(1);
      expect(dist![1].percentage).toBe(25.0);

      expect(dist![2].count).toBe(1);
      expect(dist![2].percentage).toBe(25.0);

      const totalPct = dist!.reduce((sum, item) => sum + item.percentage, 0);
      expect(totalPct).toBe(100.0);
    });

    it("多選題 (Multiple Choice): 選項百分比分母為 answeredCount，總和可 >= 100%", () => {
      const answers = [
        { questionId: "q1", rawValue: JSON.stringify(["opt_a", "opt_b"]) },
        { questionId: "q1", rawValue: JSON.stringify(["opt_a", "opt_c"]) },
        { questionId: "q1", rawValue: JSON.stringify(["opt_b"]) },
      ];

      const dist = calculateOptionDistribution(choices, answers, 3);
      expect(dist).not.toBeNull();

      expect(dist![0].count).toBe(2); // opt_a 出現 2 次
      expect(dist![0].percentage).toBe(66.7);

      expect(dist![1].count).toBe(2); // opt_b 出現 2 次
      expect(dist![1].percentage).toBe(66.7);

      expect(dist![2].count).toBe(1); // opt_c 出現 1 次
      expect(dist![2].percentage).toBe(33.3);

      const totalPct = dist!.reduce((sum, item) => sum + item.percentage, 0);
      expect(totalPct).toBeGreaterThan(100);
    });

    it("空 choices 陣列或 undefined 應回傳 null", () => {
      expect(calculateOptionDistribution(undefined, [], 0)).toBeNull();
      expect(calculateOptionDistribution([], [], 0)).toBeNull();
    });
  });

  // =========================================================================
  // 3. Numeric & Rating Statistics (Mean / Median / Sample SD / Polarization)
  // =========================================================================
  describe("3. calculateNumericStatistics", () => {
    it("N = 0: 空陣列回傳 null", () => {
      const stats = calculateNumericStatistics([]);
      expect(stats).toBeNull();
    });

    it("N = 1: Sample SD 嚴格為 null (分母 n - 1 = 0 數學防護)", () => {
      const stats = calculateNumericStatistics([5]);
      expect(stats).not.toBeNull();
      expect(stats!.n).toBe(1);
      expect(stats!.mean).toBe(5);
      expect(stats!.median).toBe(5);
      expect(stats!.min).toBe(5);
      expect(stats!.max).toBe(5);
      expect(stats!.standardDeviation).toBeNull();
      expect(stats!.distributionSignal).toBe("NORMAL");
    });

    it("N = 2: 正常計算均值、中位數與 Sample SD", () => {
      const stats = calculateNumericStatistics([4, 6]);
      expect(stats).not.toBeNull();
      expect(stats!.n).toBe(2);
      expect(stats!.mean).toBe(5);
      expect(stats!.median).toBe(5);
      expect(stats!.min).toBe(4);
      expect(stats!.max).toBe(6);
      // variance = ((4-5)^2 + (6-5)^2) / 1 = 2 -> SD = sqrt(2) ≈ 1.41
      expect(stats!.standardDeviation).toBe(1.41);
    });

    it("包含負數、小數與零之數值題型計算", () => {
      const numbers = [-10.5, 0, 10.5, 20];
      const stats = calculateNumericStatistics(numbers);
      expect(stats).not.toBeNull();
      expect(stats!.n).toBe(4);
      expect(stats!.mean).toBe(5); // sum = 20 / 4 = 5
      expect(stats!.median).toBe(5.25); // (0 + 10.5) / 2 = 5.25
      expect(stats!.min).toBe(-10.5);
      expect(stats!.max).toBe(20);
      expect(stats!.standardDeviation).toBeDefined();
    });

    it("極化分佈 Heuristic Signal (Polarization)", () => {
      // 10 個 1 分，10 個 5 分 (兩極佔 100% 且 SD 高)
      const values = [
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
      ];
      const stats = calculateNumericStatistics(values);
      expect(stats).not.toBeNull();
      expect(stats!.mean).toBe(3);
      expect(stats!.median).toBe(3);
      expect(stats!.standardDeviation).toBeGreaterThan(1.2);
      expect(stats!.distributionSignal).toBe("POLARIZED");
    });

    it("集中分佈 Heuristic Signal (Normal)", () => {
      // 均勻分佈或集中在中間 3 分
      const values = [3, 3, 3, 4, 3, 2, 3, 4, 3, 3];
      const stats = calculateNumericStatistics(values);
      expect(stats).not.toBeNull();
      expect(stats!.distributionSignal).toBe("NORMAL");
    });
  });

  // =========================================================================
  // 4. Integrated Survey Questions Engine (analyzeSurveyQuestions)
  // =========================================================================
  describe("4. analyzeSurveyQuestions Integrated Engine", () => {
    const mockQuestions: QuestionMeta[] = [
      {
        id: "q_single",
        code: "Q1",
        orderNum: 1,
        title: "性別",
        questionType: "single_choice",
        required: true,
        scoringEnabled: false,
        choices: [
          { id: "c_m", orderNum: 1, label: "男", value: "male" },
          { id: "c_f", orderNum: 2, label: "女", value: "female" },
        ],
      },
      {
        id: "q_score",
        code: "Q2",
        orderNum: 2,
        title: "滿意度評分 (1-5)",
        questionType: "single_choice",
        required: true,
        scoringEnabled: true,
        choices: [
          { id: "c_s1", orderNum: 1, label: "非常不滿意", value: "1", scoreEnabled: true, score: 1 },
          { id: "c_s5", orderNum: 2, label: "非常滿意", value: "5", scoreEnabled: true, score: 5 },
        ],
      },
      {
        id: "q_num",
        code: "Q3",
        orderNum: 3,
        title: "年齡",
        questionType: "number",
        required: false,
        scoringEnabled: false,
      },
      {
        id: "q_text",
        code: "Q4",
        orderNum: 4,
        title: "意見回饋",
        questionType: "text",
        required: false,
        scoringEnabled: false,
      },
    ];

    it("能同時處理各種題型並正確計算結構化結果", () => {
      const mockResponses: RawResponseData[] = [
        {
          id: "r1",
          status: "COMPLETED",
          answers: [
            { questionId: "q_single", rawValue: JSON.stringify("male") },
            { questionId: "q_score", rawValue: JSON.stringify("5"), score: 5 },
            { questionId: "q_num", rawValue: "28" },
            { questionId: "q_text", rawValue: "系統很棒" },
          ],
        },
        {
          id: "r2",
          status: "COMPLETED",
          answers: [
            { questionId: "q_single", rawValue: JSON.stringify("female") },
            { questionId: "q_score", rawValue: JSON.stringify("1"), score: 1 },
            { questionId: "q_num", rawValue: "32" },
            { questionId: "q_text", rawValue: "" }, // 空白文字視為未作答
          ],
        },
      ];

      const results = analyzeSurveyQuestions(mockQuestions, mockResponses);
      expect(results).toHaveLength(4);

      // Q1: 單選題
      expect(results[0].code).toBe("Q1");
      expect(results[0].answeredCount).toBe(2);
      expect(results[0].unansweredCount).toBe(0);
      expect(results[0].distribution).toHaveLength(2);
      expect(results[0].distribution![0].count).toBe(1);
      expect(results[0].distribution![1].count).toBe(1);
      expect(results[0].statistics).toBeNull(); // 未計分選擇題不產生數值統計

      // Q2: 評分單選題
      expect(results[1].code).toBe("Q2");
      expect(results[1].statistics).not.toBeNull();
      expect(results[1].statistics!.mean).toBe(3);
      expect(results[1].statistics!.median).toBe(3);

      // Q3: 數值題
      expect(results[2].code).toBe("Q3");
      expect(results[2].statistics!.mean).toBe(30);
      expect(results[2].distribution).toBeNull(); // 數值題不產生選項分佈

      // Q4: 文字題
      expect(results[3].code).toBe("Q4");
      expect(results[3].answeredCount).toBe(1);
      expect(results[3].unansweredCount).toBe(1);
      expect(results[3].answerRate).toBe(50.0);
      expect(results[3].distribution).toBeNull();
      expect(results[3].statistics).toBeNull();
    });
  });

  // =========================================================================
  // 5. Performance & Scale Benchmark (10,000 Simulated Responses)
  // =========================================================================
  describe("5. 10,000 Simulated Responses Benchmark", () => {
    it("10,000 筆填答資料在純函數引擎下運算耗時應 < 250ms", () => {
      const qRating: QuestionMeta = {
        id: "q_bench",
        code: "Q_BENCH",
        orderNum: 1,
        title: "效能測試評分題",
        questionType: "single_choice",
        required: true,
        scoringEnabled: true,
        choices: [
          { id: "c1", orderNum: 1, label: "1分", value: "1", scoreEnabled: true, score: 1 },
          { id: "c2", orderNum: 2, label: "2分", value: "2", scoreEnabled: true, score: 2 },
          { id: "c3", orderNum: 3, label: "3分", value: "3", scoreEnabled: true, score: 3 },
          { id: "c4", orderNum: 4, label: "4分", value: "4", scoreEnabled: true, score: 4 },
          { id: "c5", orderNum: 5, label: "5分", value: "5", scoreEnabled: true, score: 5 },
        ],
      };

      const largeResponses: RawResponseData[] = [];
      for (let i = 0; i < 10000; i++) {
        const score = (i % 5) + 1;
        largeResponses.push({
          id: `resp_${i}`,
          status: "COMPLETED",
          answers: [
            {
              questionId: "q_bench",
              rawValue: JSON.stringify(String(score)),
              score,
            },
          ],
        });
      }

      const t0 = performance.now();
      const results = analyzeSurveyQuestions([qRating], largeResponses);
      const duration = performance.now() - t0;

      expect(results).toHaveLength(1);
      expect(results[0].totalResponses).toBe(10000);
      expect(results[0].answeredCount).toBe(10000);
      expect(results[0].statistics!.mean).toBe(3);
      expect(results[0].distribution![0].count).toBe(2000);

      // 驗證效能預算
      console.log(`[Benchmark] 10,000 responses calculation completed in ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(250);
    });
  });
});
