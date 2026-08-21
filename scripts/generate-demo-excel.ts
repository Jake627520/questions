import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

export async function generateDemoExcel(outputPath: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Survey System M3 Demo Generator";
  workbook.created = new Date();

  // Sheet 1: questions
  const qSheet = workbook.addWorksheet("questions");
  qSheet.columns = [
    { header: "order_num", key: "order_num", width: 12 },
    { header: "code", key: "code", width: 15 },
    { header: "title", key: "title", width: 45 },
    { header: "description", key: "description", width: 35 },
    { header: "question_type", key: "question_type", width: 18 },
    { header: "required", key: "required", width: 12 },
    { header: "scoring_enabled", key: "scoring_enabled", width: 16 },
    { header: "reverse_score", key: "reverse_score", width: 15 },
    // M2 / M3 欄位 (支援簡寫語法)
    { header: "visibility_rules", key: "visibility_rules", width: 40 },
    { header: "min_selections", key: "min_selections", width: 16 },
    { header: "max_selections", key: "max_selections", width: 16 },
    { header: "min_value", key: "min_value", width: 14 },
    { header: "max_value", key: "max_value", width: 14 },
  ];

  qSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  qSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E40AF" },
  };

  const questionsData = [
    {
      order_num: 1,
      code: "Q1",
      title: "您對本產品的整體滿意度為何？ (單選計分 1~4分)",
      description: "若選「非常不滿意」或「不太滿意」，將觸發跳題顯示 Q1_FEEDBACK 追問原因",
      question_type: "single_choice",
      required: true,
      scoring_enabled: true,
      reverse_score: false,
      visibility_rules: null,
      min_selections: null,
      max_selections: null,
      min_value: null,
      max_value: null,
    },
    {
      order_num: 2,
      code: "Q1_FEEDBACK",
      title: "請告訴我們您不滿意的主要原因？ (條件跳題：僅在 Q1 選不滿意時顯示)",
      description: "測試條件式顯示/跳題規則（使用 M3 簡寫語法）",
      question_type: "text",
      required: true,
      scoring_enabled: false,
      reverse_score: false,
      // 使用 M3 簡寫語法：SHOW IF Q1 in [very_dissatisfied, dissatisfied]
      visibility_rules: "SHOW IF Q1 in [very_dissatisfied, dissatisfied]",
      min_selections: null,
      max_selections: null,
      min_value: null,
      max_value: null,
    },
    {
      order_num: 3,
      code: "Q2",
      title: "您最常使用本系統的時間段？ (不計分單選)",
      description: "測試完全不計分單選題",
      question_type: "single_choice",
      required: false,
      scoring_enabled: false,
      reverse_score: false,
      visibility_rules: null,
      min_selections: null,
      max_selections: null,
      min_value: null,
      max_value: null,
    },
    {
      order_num: 4,
      code: "Q3",
      title: "請簡述您對新版界面的改進建議 (問答題)",
      description: "測試問答文字題，非計分",
      question_type: "text",
      required: false,
      scoring_enabled: false,
      reverse_score: false,
      visibility_rules: null,
      min_selections: null,
      max_selections: null,
      min_value: null,
      max_value: null,
    },
    {
      order_num: 5,
      code: "Q4",
      title: "您每週平均使用本系統幾次？ (數值限制 0~100 次)",
      description: "測試數值題 min / max 範圍限制 (0~100)",
      question_type: "number",
      required: false,
      scoring_enabled: false,
      reverse_score: false,
      visibility_rules: null,
      min_selections: null,
      max_selections: null,
      min_value: 0,
      max_value: 100,
    },
    {
      order_num: 6,
      code: "Q5",
      title: "您感興趣的進階功能有哪些？ (複選限選 1~2 項，計分題)",
      description: "測試複選題 min_selections=1, max_selections=2 限制",
      question_type: "multiple_choice",
      required: true,
      scoring_enabled: true,
      reverse_score: false,
      visibility_rules: null,
      min_selections: 1,
      max_selections: 2,
      min_value: null,
      max_value: null,
    },
    {
      order_num: 7,
      code: "Q6",
      title: "您是透過何種管道得知本產品？ (單選「其他」需填寫說明)",
      description: "測試「其他」選項且 requires_text=true 必填檢核",
      question_type: "single_choice",
      required: true,
      scoring_enabled: false,
      reverse_score: false,
      visibility_rules: null,
      min_selections: null,
      max_selections: null,
      min_value: null,
      max_value: null,
    },
    {
      order_num: 8,
      code: "Q7",
      title: "您使用過哪些周邊整合工具？ (複選含「以上皆非」與「其他」)",
      description: "測試「以上皆非」互斥防呆與複選「其他」文字",
      question_type: "multiple_choice",
      required: true,
      scoring_enabled: true,
      reverse_score: false,
      visibility_rules: null,
      min_selections: null,
      max_selections: null,
      min_value: null,
      max_value: null,
    },
    {
      order_num: 9,
      code: "Q8",
      title: "您對特定專業模組的熟練程度？ (特殊分數：選項4得10分)",
      description: "測試非線性特殊計分（選項1~3為1,2,3分，選項4給予10分大獎勵）",
      question_type: "single_choice",
      required: true,
      scoring_enabled: true,
      reverse_score: false,
      visibility_rules: null,
      min_selections: null,
      max_selections: null,
      min_value: null,
      max_value: null,
    },
    {
      order_num: 10,
      code: "Q9",
      title: "您是否曾遭遇系統故障？ (測試 0 分與 NULL 區分)",
      description: "選項1給予0分（非NULL），選項2給予5分，選項3為不計分選項",
      question_type: "single_choice",
      required: true,
      scoring_enabled: true,
      reverse_score: false,
      visibility_rules: null,
      min_selections: null,
      max_selections: null,
      min_value: null,
      max_value: null,
    },
    {
      order_num: 11,
      code: "Q10",
      title: "系統操作是否繁瑣易令人困惑？ (反向計分題 1~5分反轉)",
      description: "負向題目：勾選非常同意(5分)反轉得1分，非常不同意(1分)反轉得5分",
      question_type: "single_choice",
      required: true,
      scoring_enabled: true,
      reverse_score: true,
      visibility_rules: null,
      min_selections: null,
      max_selections: null,
      min_value: null,
      max_value: null,
    },
  ];

  questionsData.forEach((q) => qSheet.addRow(q));

  // Sheet 2: choices
  const cSheet = workbook.addWorksheet("choices");
  cSheet.columns = [
    { header: "question_code", key: "question_code", width: 15 },
    { header: "order_num", key: "order_num", width: 12 },
    { header: "label", key: "label", width: 28 },
    { header: "value", key: "value", width: 20 },
    { header: "score_enabled", key: "score_enabled", width: 15 },
    { header: "score", key: "score", width: 10 },
    { header: "is_other", key: "is_other", width: 12 },
    { header: "requires_text", key: "requires_text", width: 15 },
    { header: "is_none_of_above", key: "is_none_of_above", width: 18 },
  ];

  cSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  cSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF047857" },
  };

  const choicesData = [
    // Q1: 一般單選 1~4分
    { question_code: "Q1", order_num: 1, label: "非常不滿意", value: "very_dissatisfied", score_enabled: true, score: 1, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q1", order_num: 2, label: "不太滿意", value: "dissatisfied", score_enabled: true, score: 2, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q1", order_num: 3, label: "滿意", value: "satisfied", score_enabled: true, score: 3, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q1", order_num: 4, label: "非常滿意", value: "very_satisfied", score_enabled: true, score: 4, is_other: false, requires_text: false, is_none_of_above: false },

    // Q2: 不計分單選
    { question_code: "Q2", order_num: 1, label: "早上 (08:00 - 12:00)", value: "morning", score_enabled: false, score: null, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q2", order_num: 2, label: "下午 (12:00 - 18:00)", value: "afternoon", score_enabled: false, score: null, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q2", order_num: 3, label: "晚上 (18:00 - 24:00)", value: "evening", score_enabled: false, score: null, is_other: false, requires_text: false, is_none_of_above: false },

    // Q5: 複選計分題 (限選1~2項)
    { question_code: "Q5", order_num: 1, label: "即時協同編輯 (+2分)", value: "realtime_collab", score_enabled: true, score: 2, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q5", order_num: 2, label: "自動化工作流 (+3分)", value: "automation", score_enabled: true, score: 3, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q5", order_num: 3, label: "進階統計報表 (+5分)", value: "advanced_stats", score_enabled: true, score: 5, is_other: false, requires_text: false, is_none_of_above: false },

    // Q6: 「其他」＋必填說明 (requires_text=true)
    { question_code: "Q6", order_num: 1, label: "搜尋引擎 (Google / Bing)", value: "search_engine", score_enabled: false, score: null, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q6", order_num: 2, label: "朋友推薦", value: "friend", score_enabled: false, score: null, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q6", order_num: 3, label: "其他管道 (請註明)", value: "other", score_enabled: false, score: null, is_other: true, requires_text: true, is_none_of_above: false },

    // Q7: 「以上皆非」+「其他」 (複選)
    { question_code: "Q7", order_num: 1, label: "Slack 整合 (+2分)", value: "slack", score_enabled: true, score: 2, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q7", order_num: 2, label: "Discord 整合 (+2分)", value: "discord", score_enabled: true, score: 2, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q7", order_num: 3, label: "其他自訂 Webhook (+1分)", value: "other_webhook", score_enabled: true, score: 1, is_other: true, requires_text: true, is_none_of_above: false },
    { question_code: "Q7", order_num: 4, label: "以上皆非 (完全無整合)", value: "none_of_above", score_enabled: true, score: 0, is_other: false, requires_text: false, is_none_of_above: true },

    // Q8: 特殊分數 (選項 4 = 10 分)
    { question_code: "Q8", order_num: 1, label: "基礎入門 (1分)", value: "lvl_1", score_enabled: true, score: 1, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q8", order_num: 2, label: "中級應用 (2分)", value: "lvl_2", score_enabled: true, score: 2, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q8", order_num: 3, label: "高級精通 (3分)", value: "lvl_3", score_enabled: true, score: 3, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q8", order_num: 4, label: "架構專家/核心貢獻者 (特別獎勵 10分)", value: "lvl_expert", score_enabled: true, score: 10, is_other: false, requires_text: false, is_none_of_above: false },

    // Q9: 0 分與 NULL 區分
    { question_code: "Q9", order_num: 1, label: "從未遭遇故障 (0分)", value: "zero_issues", score_enabled: true, score: 0, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q9", order_num: 2, label: "曾遇重大故障 (5分)", value: "major_issues", score_enabled: true, score: 5, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q9", order_num: 3, label: "不確定 / 不願回答 (不計分)", value: "unspecified", score_enabled: false, score: null, is_other: false, requires_text: false, is_none_of_above: false },

    // Q10: 反向計分題 (1~5 分反轉)
    { question_code: "Q10", order_num: 1, label: "非常不同意 (原始1分 -> 反轉得5分)", value: "strongly_disagree", score_enabled: true, score: 1, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q10", order_num: 2, label: "不同意 (原始2分 -> 反轉得4分)", value: "disagree", score_enabled: true, score: 2, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q10", order_num: 3, label: "普通 (原始3分 -> 反轉得3分)", value: "neutral", score_enabled: true, score: 3, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q10", order_num: 4, label: "同意 (原始4分 -> 反轉得2分)", value: "agree", score_enabled: true, score: 4, is_other: false, requires_text: false, is_none_of_above: false },
    { question_code: "Q10", order_num: 5, label: "非常同意 (原始5分 -> 反轉得1分)", value: "strongly_agree", score_enabled: true, score: 5, is_other: false, requires_text: false, is_none_of_above: false },
  ];

  choicesData.forEach((c) => cSheet.addRow(c));

  await workbook.xlsx.writeFile(outputPath);
  console.log(`Demo Excel successfully generated at: ${outputPath}`);
}

// Direct run
if (require.main === module || process.argv[1]?.includes("generate-demo-excel")) {
  const target = path.join(process.cwd(), "demo-survey.xlsx");
  generateDemoExcel(target)
    .then(() => console.log("Done."))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
