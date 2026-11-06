import ExcelJS from "exceljs";
import path from "path";

/**
 * 下載用的題庫匯入範本（demo-survey.xlsx）唯一來源。
 *
 * 版面：
 * - 「使用说明」分頁（最左）：簡體中文操作說明、顏色圖例、欄位說明、常見錯誤。
 * - questions / choices：第 1 列為系統讀取的英文欄位名（不可改），
 *   第 2 列為 `#` 開頭的中文說明列（解析器以註解列略過，見 src/lib/excel-comment-row.ts），
 *   第 3 列起為範例資料。
 *
 * 欄位必填/選填依 src/lib/excel-parser.ts 的實際檢核而定。
 */

type ColumnSpec = {
  key: string;
  width: number;
  /** 中文名称 */
  zh: string;
  /** 第 2 行的简短提示（接在中文名称后面的括号里） */
  hint: string;
  required: boolean;
  /** 可填写的值（使用说明表格） */
  values: string;
  /** 说明 / 例子（使用说明表格 + 第 1 行批注） */
  detail: string;
  /** 下拉选单 */
  list?: { items: string[]; strict: boolean };
};

const QUESTION_TYPES = ["single_choice", "multiple_choice", "text", "number", "yes_no", "info"];
// 解析器接受：TRUE/FALSE、1/0、YES/NO、Y/N、是/否（不分大小写），空白视为 FALSE（excel-parser.ts parseStrictBoolean）
const BOOL_LIST = { items: ["TRUE", "FALSE", "是", "否"], strict: false };
const BOOL_VALUES = "是/否（见下方“是/否栏位的写法”）；空白 = 否";

export const QUESTION_COLUMNS: ColumnSpec[] = [
  {
    key: "order_num", width: 12, zh: "排序", hint: "必填，正整数，不可重复", required: true,
    values: "正整数 1、2、3…，不可重复",
    detail: "题目显示的先后顺序，按数字从小到大排列。",
  },
  {
    key: "code", width: 16, zh: "题目代码", hint: "必填，唯一，英数字/下划线", required: true,
    values: "英文字母、数字、下划线，例如 Q1、Q1_FEEDBACK；不可重复",
    detail: "每一题的唯一编号（区分大小写）。choices 分页和跳题规则都用它来指认题目。",
  },
  {
    key: "title", width: 45, zh: "题目内容", hint: "必填", required: true,
    values: "任意文字，最多 5000 字",
    detail: "填答者看到的题目，例如：您对本产品的整体满意度如何？",
  },
  {
    key: "description", width: 35, zh: "题目说明", hint: "选填", required: false,
    values: "任意文字，最多 5000 字",
    detail: "显示在题目下方的补充说明，可以留空。",
  },
  {
    key: "question_type", width: 18, zh: "题型", hint: "必填，从下拉选单选择", required: true,
    values: QUESTION_TYPES.join(" / "),
    detail:
      "single_choice = 单选；multiple_choice = 复选；text = 文字填答；number = 数字填答；" +
      "yes_no = 是非题（系统自动显示“是/否”，不用在 choices 填选项）；info = 说明文字（只显示，不作答）。" +
      "单选题和复选题必须在 choices 分页至少有 1 个选项。",
    list: { items: QUESTION_TYPES, strict: true },
  },
  {
    key: "required", width: 12, zh: "必答题", hint: "选填，是/否，空白=否", required: false,
    values: BOOL_VALUES,
    detail: "是 = 填答者必须回答这一题才能提交。",
    list: BOOL_LIST,
  },
  {
    key: "scoring_enabled", width: 16, zh: "是否计分", hint: "选填，是/否，空白=否", required: false,
    values: BOOL_VALUES,
    detail: "是 = 这一题的得分计入总分。每个选项的分数在 choices 分页的 score 栏设定。",
    list: BOOL_LIST,
  },
  {
    key: "reverse_score", width: 15, zh: "反向计分", hint: "选填，是/否，空白=否", required: false,
    values: BOOL_VALUES,
    detail:
      "用于单选计分题。是 = 分数倒过来算：得分 = 最高分 + 最低分 − 所选选项的分数。" +
      "例如 1~5 分量表：选 5 分的选项得 1 分，选 4 分得 2 分。常用于反向措辞的题目。",
    list: BOOL_LIST,
  },
  {
    key: "visibility_rules", width: 40, zh: "条件显示/跳题", hint: "选填，例：SHOW IF Q1 in [a, b]", required: false,
    values: "规则文字，见下方“条件显示（跳题）的写法”",
    detail:
      "留空 = 永远显示。填写后，只有符合条件才显示这一题。" +
      "例如 SHOW IF Q1 in [very_dissatisfied, dissatisfied] 表示 Q1 选了“非常不满意”或“不太满意”时才显示。",
  },
  {
    key: "min_selections", width: 16, zh: "最少选几项", hint: "选填，复选题用，整数", required: false,
    values: "整数，≥ 0",
    detail: "用于复选题。例如 1 = 至少要选 1 项。",
  },
  {
    key: "max_selections", width: 16, zh: "最多选几项", hint: "选填，复选题用，整数", required: false,
    values: "整数，≥ 0；不可小于 min_selections",
    detail: "用于复选题。例如 2 = 最多只能选 2 项。",
  },
  {
    key: "min_value", width: 14, zh: "最小值", hint: "选填，数字题用", required: false,
    values: "数字",
    detail: "用于数字题。填答的数字不能小于这个值，例如 0。",
  },
  {
    key: "max_value", width: 14, zh: "最大值", hint: "选填，数字题用", required: false,
    values: "数字；不可小于 min_value",
    detail: "用于数字题。填答的数字不能大于这个值，例如 100。",
  },
];

export const CHOICE_COLUMNS: ColumnSpec[] = [
  {
    key: "question_code", width: 16, zh: "所属题目代码", hint: "必填，须与 questions 的 code 一致", required: true,
    values: "必须和 questions 分页某一题的 code 完全相同（含大小写）",
    detail: "表示这个选项属于哪一题，例如 Q1。",
  },
  {
    key: "order_num", width: 12, zh: "选项排序", hint: "必填，同一题内不可重复", required: true,
    values: "正整数 1、2、3…；同一题内不可重复",
    detail: "选项显示的先后顺序。",
  },
  {
    key: "label", width: 30, zh: "选项文字", hint: "必填，填答者看到的文字", required: true,
    values: "任意文字，最多 5000 字；同一题内不可重复",
    detail: "填答者看到的选项，例如：非常满意。",
  },
  {
    key: "value", width: 20, zh: "选项代码", hint: "必填，英数字/下划线，同题不重复", required: true,
    values: "英文字母、数字、下划线，例如 very_satisfied、1、OPT_A；同一题内不可重复",
    detail: "系统储存和统计用的代码。跳题规则也可以用它来指认选项。",
  },
  {
    key: "score_enabled", width: 15, zh: "此选项计分", hint: "选填，是/否，空白=否", required: false,
    values: BOOL_VALUES,
    detail: "是 = 选这个选项会得到 score 栏的分数。否 = 这个选项不计分（例如“不确定”）。",
    list: BOOL_LIST,
  },
  {
    key: "score", width: 10, zh: "分数", hint: "选填，数字", required: false,
    values: "数字，可以是 0",
    detail: "score_enabled 为“是”时才有效；此时留空 = 0 分。score_enabled 为“否”时忽略此栏。",
  },
  {
    key: "is_other", width: 12, zh: "“其他”选项", hint: "选填，是/否，空白=否", required: false,
    values: BOOL_VALUES,
    detail: "是 = 这是“其他”选项，填答者选了以后可以自行输入文字，例如“其他（请注明）”。",
    list: BOOL_LIST,
  },
  {
    key: "requires_text", width: 15, zh: "必须填写说明", hint: "选填，是/否，需搭配 is_other", required: false,
    values: BOOL_VALUES,
    detail: "是 = 选了这个选项就必须填写文字说明，否则不能提交。只有 is_other 也为“是”时才有效。",
    list: BOOL_LIST,
  },
  {
    key: "is_none_of_above", width: 18, zh: "“以上皆非”", hint: "选填，是/否，空白=否", required: false,
    values: BOOL_VALUES,
    detail: "用于复选题。是 = 这个选项与其他选项互斥：选了它就不能同时选其他选项。",
    list: BOOL_LIST,
  },
];

const COLOR = {
  headerRed: "FFC00000",
  white: "FFFFFFFF",
  requiredYellow: "FFFFE699",
  optionalGrey: "FFE7E6E6",
  sectionBlue: "FFDDEBF7",
  border: "FFBFBFBF",
};

const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: COLOR.border } },
  left: { style: "thin", color: { argb: COLOR.border } },
  bottom: { style: "thin", color: { argb: COLOR.border } },
  right: { style: "thin", color: { argb: COLOR.border } },
};

const HEADER_NOTE_PREFIX = "请勿修改：系统依此栏位名读取资料";

/**
 * 设定 questions / choices 分页的双行表头：
 * 第 1 行英文栏位（红底白字 + 批注），第 2 行 `#` 开头的中文说明（必填黄色、选填浅灰）。
 */
function setupDataSheet(ws: ExcelJS.Worksheet, cols: ColumnSpec[], maxRow: number) {
  ws.columns = cols.map((c) => ({ header: c.key, key: c.key, width: c.width }));

  const hintRow = ws.addRow(cols.map((c, i) => `${i === 0 ? "# " : ""}${c.zh}（${c.hint}）`));
  hintRow.height = 48;

  cols.forEach((c, i) => {
    const head = ws.getCell(1, i + 1);
    head.font = { bold: true, color: { argb: COLOR.white } };
    head.fill = solid(COLOR.headerRed);
    head.alignment = { vertical: "middle", horizontal: "center" };
    head.border = thin;
    head.note = `${HEADER_NOTE_PREFIX}\n\n${c.zh}（${c.required ? "必填" : "选填"}）：${c.detail}`;

    const hint = ws.getCell(2, i + 1);
    hint.fill = solid(c.required ? COLOR.requiredYellow : COLOR.optionalGrey);
    hint.font = { bold: c.required, color: { argb: "FF000000" } };
    hint.alignment = { wrapText: true, vertical: "top" };
    hint.border = thin;

    if (c.list) {
      const letter = ws.getColumn(i + 1).letter;
      (ws as any).dataValidations.add(`${letter}3:${letter}${maxRow}`, {
        type: "list",
        allowBlank: true,
        formulae: [`"${c.list.items.join(",")}"`],
        showErrorMessage: true,
        errorStyle: c.list.strict ? "stop" : "warning",
        errorTitle: c.list.strict ? "题型不正确" : "请确认是/否的写法",
        error: c.list.strict
          ? `只能填写：${c.list.items.join("、")}`
          : "可填写 TRUE/FALSE、是/否、1/0、YES/NO、Y/N，或留空（= 否）。",
      });
    }
  });

  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 2 }];
}

// ---------- 使用说明分页 ----------

const GUIDE_WIDTHS = [20, 18, 10, 36, 64];
const GUIDE_COLS = GUIDE_WIDTHS.length;

/** 估算文字在 Excel 中的显示宽度（全形字算 2） */
function visualLength(text: string): number {
  let n = 0;
  for (const ch of text) n += /[⺀-￯]/.test(ch) ? 2 : 1;
  return n;
}

function linesFor(text: string, width: number): number {
  return text
    .split("\n")
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(visualLength(line) / Math.max(1, width - 2))), 0);
}

function buildGuideSheet(ws: ExcelJS.Worksheet) {
  GUIDE_WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const fullWidth = GUIDE_WIDTHS.reduce((a, b) => a + b, 0);
  const LINE = 16;

  const merged = (text: string, style?: { font?: Partial<ExcelJS.Font>; fill?: string; height?: number }) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, GUIDE_COLS);
    const cell = row.getCell(1);
    cell.alignment = { wrapText: true, vertical: "middle" };
    if (style?.font) cell.font = style.font;
    if (style?.fill) cell.fill = solid(style.fill);
    row.height = style?.height ?? Math.max(18, linesFor(text, fullWidth) * LINE + 4);
    return row;
  };
  const blank = () => ws.addRow([]);
  const title = (text: string) => merged(text, { font: { bold: true, size: 16 }, height: 30 });
  const section = (text: string) => {
    blank();
    merged(text, { font: { bold: true, size: 13 }, fill: COLOR.sectionBlue, height: 22 });
  };

  const tableRow = (cells: string[], opts?: { header?: boolean; fills?: (string | undefined)[] }) => {
    const row = ws.addRow(cells);
    let lines = 1;
    cells.forEach((text, i) => {
      const cell = row.getCell(i + 1);
      cell.alignment = { wrapText: true, vertical: "top" };
      cell.border = thin;
      if (opts?.header) {
        cell.font = { bold: true, color: { argb: COLOR.white } };
        cell.fill = solid("FF404040");
      }
      const fill = opts?.fills?.[i];
      if (fill) cell.fill = solid(fill);
      lines = Math.max(lines, linesFor(text, GUIDE_WIDTHS[i]));
    });
    row.height = Math.max(18, lines * LINE + 4);
    return row;
  };

  const columnTable = (cols: ColumnSpec[], extra: string[][] = []) => {
    tableRow(["栏位（第 1 行英文）", "中文名称", "是否必填", "可填写的值", "说明 / 例子"], { header: true });
    cols.forEach((c) => {
      tableRow([c.key, c.zh, c.required ? "必填" : "选填", c.values, c.detail], {
        fills: [undefined, undefined, c.required ? COLOR.requiredYellow : COLOR.optionalGrey],
      });
    });
    extra.forEach((cells) => tableRow(cells, { fills: [undefined, undefined, COLOR.optionalGrey] }));
  };

  // 1. 这是什么
  title("问卷题库导入范本 — 使用说明");
  merged(
    "这个 Excel 文件是问卷系统的“题库导入范本”。你只要按照示例把题目和选项填进 questions、choices 两个分页，" +
      "上传到网站后，系统就会自动建立一份问卷。本分页只是说明，系统不会读取它。"
  );

  // 2. 三步操作
  section("一、三个步骤");
  merged("① 下载：你现在打开的就是范本。建议先另存一份，文件格式保持 .xlsx。");
  merged(
    "② 修改：按照示例修改 questions（题目）和 choices（选项）两个分页。第 3 行开始的白色行都是示例资料，" +
      "可以直接改写、删除或新增行。不要改动红色的第 1 行，也不要修改分页名称。"
  );
  merged(
    "③ 上传：回到网站的“汇入问卷”页面上传这个文件。先按“解析题库预览 (Dry Run)”检查有没有错误，" +
      "确认没有错误后再按“确认汇入并建立问卷”。导入后的问卷是草稿，请审阅无误后再发布。"
  );

  // 3. 颜色说明
  section("二、颜色说明");
  const legend = (sample: string, fill: string | null, fontColor: string, text: string) => {
    const row = ws.addRow([sample, text]);
    ws.mergeCells(row.number, 2, row.number, GUIDE_COLS);
    const a = row.getCell(1);
    a.border = thin;
    a.alignment = { vertical: "middle", horizontal: "center" };
    a.font = { bold: true, color: { argb: fontColor } };
    if (fill) a.fill = solid(fill);
    row.getCell(2).alignment = { wrapText: true, vertical: "middle" };
    row.height = Math.max(20, linesFor(text, fullWidth - GUIDE_WIDTHS[0]) * LINE + 4);
  };
  legend("红色（第 1 行）", COLOR.headerRed, COLOR.white,
    "英文栏位名。系统靠它读取资料，请勿修改、删除或改名。鼠标移到栏位名上可以看到中文说明。");
  legend("黄色（第 2 行）", COLOR.requiredYellow, "FF000000", "必填栏位：每一行资料都要填写。");
  legend("浅灰（第 2 行）", COLOR.optionalGrey, "FF000000", "选填栏位：可以留空。");
  legend("白色（第 3 行起）", null, "FF000000", "你的题目／选项资料，可自由编辑。");
  merged(
    "第 2 行以 # 开头，是给人看的中文说明，系统会自动忽略，保留或删除都可以。" +
      "你也可以自己新增备注行：只要该行第一个有内容的单元格以 # 开头，整行都会被忽略。"
  );

  // 4. 栏位说明
  section("三、questions 分页（题目）栏位说明");
  columnTable(QUESTION_COLUMNS, [
    [
      "visibility_hint",
      "条件提示文字",
      "选填",
      "任意文字",
      "本范本没有这一栏。如需要，可在 questions 第 1 行最右边新增栏位名 visibility_hint，填写条件题出现时显示的提示语。",
    ],
  ]);

  section("四、choices 分页（选项）栏位说明");
  merged("每一行是一个选项。单选题（single_choice）和复选题（multiple_choice）要在这里填写选项；其他题型不需要。");
  columnTable(CHOICE_COLUMNS);

  // 5. 是/否
  section("五、是/否栏位的写法");
  merged("代表“是”：TRUE、是、1、YES、Y　　代表“否”：FALSE、否、0、NO、N，或留空。英文大小写都可以。");
  merged("其他写法（例如“对”“√”“有”）会被判定为错误。");

  // 6. 条件显示
  section("六、条件显示（跳题）的写法 — visibility_rules");
  merged("格式：SHOW IF 条件（符合时显示这一题），或 HIDE IF 条件（符合时隐藏这一题）。条件 = 题目代码 + 比较方式 + 值。");
  merged("“值”可以填选项代码（value），也可以填选项文字（label）。");
  const ruleHeader = tableRow(["写法", "意思", "", "例子", "说明"], { header: true });
  ws.mergeCells(ruleHeader.number, 2, ruleHeader.number, 3);
  const ruleRows: string[][] = [
    ["in [ … ]", "是其中之一", "", "SHOW IF Q1 in [very_dissatisfied, dissatisfied]", "Q1 选了列表中任一个选项就显示。请单独使用，不要再加 AND / OR。"],
    ["equals（或 == 、=）", "等于", "", "SHOW IF Q1 equals satisfied", "Q1 选了“满意”才显示。"],
    ["not_equals（或 !=）", "不等于", "", "HIDE IF Q1 != satisfied", "Q1 没有选“满意”时隐藏。"],
    ["contains", "包含", "", "SHOW IF Q5 contains automation", "用于复选题：Q5 勾选了 automation 就显示。"],
    ["not_contains", "不包含", "", "SHOW IF Q5 not_contains automation", "用于复选题：Q5 没有勾选 automation 时显示。"],
    ["gt（>）、gte（>=）", "大于、大于等于", "", "SHOW IF Q4 gt 10", "用于数字题：Q4 填的数字大于 10 才显示。值必须是数字。"],
    ["lt（<）、lte（<=）", "小于、小于等于", "", "SHOW IF Q4 lte 3", "用于数字题：Q4 填的数字小于等于 3 才显示。值必须是数字。"],
    ["AND / OR", "并且 / 或者", "", "SHOW IF Q1 equals satisfied AND Q4 gt 10", "AND = 全部符合；OR = 任一符合。同一条规则里不要混用 AND 和 OR。"],
  ];
  ruleRows.forEach((r) => {
    const row = tableRow(r);
    ws.mergeCells(row.number, 2, row.number, 3);
  });
  merged(
    "规则只能引用已存在的题目代码；不能引用自己；两题也不能互相引用形成循环（例如 Q2 依 Q3、Q3 又依 Q2）。" +
      "引用选择题时，填写的选项代码或选项文字必须真的存在于那一题的选项中。"
  );

  // 7. 限制
  section("七、文件限制");
  [
    "• 只接受 .xlsx 格式，文件大小不超过 5 MB。",
    "• 整个文件最多 20 个分页（包含本“使用说明”分页）。",
    "• 分页名称必须是 questions 和 choices（英文小写），请不要改名。",
    "• questions 分页最多 500 行，choices 分页最多 5000 行（都包含前 2 行表头）。",
    "• 每个单元格的文字（题目内容、题目说明、选项文字）最多 5000 字。",
  ].forEach((t) => merged(t));

  // 8. 常见错误
  section("八、常见错误");
  [
    "1. 题目代码（code）重复：每一题的 code 都必须不同。",
    "2. choices 的 question_code 对不上：必须和 questions 分页的 code 完全相同（含大小写）。",
    "3. 修改或删除了第 1 行的英文栏位名：系统会读不到该栏，资料被当成空白或报错。",
    "4. 代码里有空格、中文或符号：code 和 value 只能用英文字母、数字、下划线。",
    "5. order_num 空白、不是正整数，或者重复（choices 是在同一题内不可重复）。",
    "6. 单选题或复选题在 choices 分页里没有任何选项。",
    "7. 同一题内，两个选项的 value 或 label 相同。",
    "8. 是/否栏位填了系统不认识的文字，例如“对”“√”。",
    "9. 跳题规则写错：引用了不存在的题目或选项、引用自己，或两题互相引用。",
    "10. 最小值大于最大值：min_selections > max_selections，或 min_value > max_value。",
    "11. 修改了分页名称 questions / choices。",
  ].forEach((t) => merged(t));

  ws.views = [{ state: "normal", showGridLines: false }];
}

export async function generateDemoExcel(outputPath: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Survey System M3 Demo Generator";
  workbook.created = new Date();

  // 分页顺序：使用说明（最左）→ questions → choices
  const guideSheet = workbook.addWorksheet("使用说明", { properties: { tabColor: { argb: "FF2F5597" } } });
  const qSheet = workbook.addWorksheet("questions");
  const cSheet = workbook.addWorksheet("choices");
  buildGuideSheet(guideSheet);

  // Sheet: questions（第 1 行英文栏位、第 2 行中文说明）
  setupDataSheet(qSheet, QUESTION_COLUMNS, 500);

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

  // Sheet: choices（第 1 行英文栏位、第 2 行中文说明）
  setupDataSheet(cSheet, CHOICE_COLUMNS, 5000);

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
