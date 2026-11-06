import { describe, it, expect, afterAll } from "vitest";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import os from "os";
import { parseSurveyExcel } from "../src/lib/excel-parser";
import { validateSurveyExcel } from "../src/lib/validateSurveyExcel";
import { generateDemoExcel } from "../scripts/generate-demo-excel";

const Q_HEADERS = ["order_num", "code", "title", "question_type", "required"];
const C_HEADERS = ["question_code", "order_num", "label", "value"];

type Builder = (opts: { qComment?: boolean; cComment?: boolean; midComment?: boolean }) => ExcelJS.Workbook;

const buildWorkbook: Builder = ({ qComment, cComment, midComment }) => {
  const wb = new ExcelJS.Workbook();
  const q = wb.addWorksheet("questions");
  q.addRow(Q_HEADERS);
  if (qComment) q.addRow(["# 排序", "题目代码（唯一）", "题目内容", "题型", "是否必答"]);
  q.addRow([1, "Q1", "满意度？", "single_choice", true]);
  if (midComment) q.addRow(["#这是一行备注，系统会忽略", null, null, "bogus_type"]);
  q.addRow([2, "Q2", "补充说明", "text", false]);

  const c = wb.addWorksheet("choices");
  c.addRow(C_HEADERS);
  if (cComment) c.addRow(["# 所属题目代码", "排序", "选项文字", "选项代码"]);
  c.addRow(["Q1", 1, "满意", "sat"]);
  if (midComment) c.addRow([null, "  # 备注：空白单元格之后的第一个非空单元格以 # 开头", "x", "bad value!"]);
  c.addRow(["Q1", 2, "不满意", "unsat"]);
  return wb;
};

async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function toFile(buf: Buffer, name = "survey.xlsx"): File {
  return new File([new Uint8Array(buf)], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const strip = (qs: Awaited<ReturnType<typeof parseSurveyExcel>>["questions"]) =>
  qs.map(({ rowNum: _rowNum, ...rest }) => rest);

describe("Excel 注释行（# 开头）— 服务端解析器", () => {
  it("第 2 行为 # 注释行时，解析结果与无注释行完全一致", async () => {
    const plain = await parseSurveyExcel(await toBuffer(buildWorkbook({})));
    const commented = await parseSurveyExcel(
      await toBuffer(buildWorkbook({ qComment: true, cComment: true }))
    );
    expect(plain.errors).toEqual([]);
    expect(commented.errors).toEqual([]);
    expect(commented.issues).toEqual([]);
    expect(strip(commented.questions)).toEqual(strip(plain.questions));
    expect(commented.questions).toHaveLength(2);
    expect(commented.questions[0].choices).toHaveLength(2);
  });

  it("没有 order_num 栏时，注释行不影响默认排序值", async () => {
    const build = (withComment: boolean) => {
      const wb = new ExcelJS.Workbook();
      const q = wb.addWorksheet("questions");
      q.addRow(["code", "title", "question_type"]);
      if (withComment) q.addRow(["# 题目代码", "题目内容", "题型"]);
      q.addRow(["Q1", "A", "text"]);
      q.addRow(["Q2", "B", "text"]);
      wb.addWorksheet("choices").addRow(["question_code", "label", "value"]);
      return wb;
    };
    const plain = await parseSurveyExcel(await toBuffer(build(false)));
    const commented = await parseSurveyExcel(await toBuffer(build(true)));
    expect(commented.errors).toEqual([]);
    expect(commented.questions.map((q) => q.orderNum)).toEqual(plain.questions.map((q) => q.orderNum));
  });

  it("中间的 # 注释行（包括前面有空白单元格的情况）被完全忽略", async () => {
    const result = await parseSurveyExcel(
      await toBuffer(buildWorkbook({ qComment: true, cComment: true, midComment: true }))
    );
    expect(result.errors).toEqual([]);
    expect(result.questions.map((q) => q.code)).toEqual(["Q1", "Q2"]);
    expect(result.questions[0].choices.map((c) => c.value)).toEqual(["sat", "unsat"]);
  });

  it("错误信息中的行号指向真实的 Excel 行号", async () => {
    const wb = new ExcelJS.Workbook();
    const q = wb.addWorksheet("questions");
    q.addRow(Q_HEADERS);
    q.addRow(["# 说明行", "", "", "", ""]);
    q.addRow([1, "Q1", "OK", "text", true]);
    q.addRow([2, "Q2", "坏题型", "not_a_type", true]); // 第 4 行
    const c = wb.addWorksheet("choices");
    c.addRow(C_HEADERS);
    c.addRow(["# 说明行"]);
    c.addRow(["NOPE", 1, "x", "x"]); // 第 3 行

    const result = await parseSurveyExcel(await toBuffer(wb));
    const typeIssue = result.issues.find((i) => i.code === "INVALID_QUESTION_TYPE");
    expect(typeIssue?.row).toBe(4);
    expect(typeIssue?.message).toContain("第 4 列");
    const orphan = result.issues.find((i) => i.code === "QUESTION_NOT_FOUND");
    expect(orphan?.row).toBe(3);
    expect(result.questions[0].rowNum).toBe(3);
  });
});

describe("Excel 注释行（# 开头）— 前端快速验证", () => {
  it("第 2 行为 # 注释行时，统计与无注释行一致且无错误", async () => {
    const plain = await validateSurveyExcel(toFile(await toBuffer(buildWorkbook({}))));
    const commented = await validateSurveyExcel(
      toFile(await toBuffer(buildWorkbook({ qComment: true, cComment: true })))
    );
    expect(plain.errors).toEqual([]);
    expect(commented.errors).toEqual([]);
    expect(commented.warnings).toEqual([]);
    expect(commented.summary).toEqual(plain.summary);
    expect(commented.summary).toEqual({ questionCount: 2, choiceCount: 2 });
  });

  it("中间的 # 注释行被完全忽略", async () => {
    const result = await validateSurveyExcel(
      toFile(await toBuffer(buildWorkbook({ qComment: true, cComment: true, midComment: true })))
    );
    expect(result.errors).toEqual([]);
    expect(result.summary).toEqual({ questionCount: 2, choiceCount: 2 });
  });

  it("错误信息中的行号指向真实的 Excel 行号", async () => {
    const wb = new ExcelJS.Workbook();
    const q = wb.addWorksheet("questions");
    q.addRow(["code", "title", "question_type"]);
    q.addRow(["# 说明行"]);
    q.addRow(["Q1", "A", "text"]);
    q.addRow(["Q1", "B", "text"]); // 第 4 行：重复
    const c = wb.addWorksheet("choices");
    c.addRow(["question_code", "label", "value"]);
    c.addRow(["# 说明行"]);
    c.addRow(["NOPE", "x", "x"]); // 第 3 行

    const result = await validateSurveyExcel(toFile(await toBuffer(wb)));
    expect(result.errors.find((e) => e.code === "DUPLICATE_QUESTION_CODE")?.row).toBe(4);
    expect(result.errors.find((e) => e.code === "QUESTION_NOT_FOUND")?.row).toBe(3);
  });
});

describe("下载范本 demo-survey.xlsx（双行表头 + 使用说明）", () => {
  const tmpPath = path.join(os.tmpdir(), `demo-survey-template-${process.pid}.xlsx`);

  afterAll(() => {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  });

  const EXPECTED_Q_HEADERS = [
    "order_num", "code", "title", "description", "question_type", "required",
    "scoring_enabled", "reverse_score", "visibility_rules", "min_selections",
    "max_selections", "min_value", "max_value",
  ];
  const EXPECTED_C_HEADERS = [
    "question_code", "order_num", "label", "value", "score_enabled", "score",
    "is_other", "requires_text", "is_none_of_above",
  ];

  const headerRow = (ws: ExcelJS.Worksheet, n: number) =>
    (ws.getRow(n).values as unknown[]).slice(1).map((v) => (v === undefined || v === null ? "" : String(v)));

  it("生成器产出：第一个分页为「使用说明」，第 1 行英文栏位不变，第 2 行为 # 开头的中文说明", async () => {
    await generateDemoExcel(tmpPath);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpPath);
    expect(wb.worksheets[0].name).toBe("使用说明");
    expect(wb.worksheets.map((w) => w.name)).toEqual(["使用说明", "questions", "choices"]);

    const q = wb.getWorksheet("questions")!;
    const c = wb.getWorksheet("choices")!;
    expect(headerRow(q, 1)).toEqual(EXPECTED_Q_HEADERS);
    expect(headerRow(c, 1)).toEqual(EXPECTED_C_HEADERS);
    expect(String(q.getCell(2, 1).value).startsWith("#")).toBe(true);
    expect(String(c.getCell(2, 1).value).startsWith("#")).toBe(true);
  });

  it("两个解析器读取生成的范本皆零错误，得到 11 题 / 29 个选项", async () => {
    await generateDemoExcel(tmpPath);
    const buf = fs.readFileSync(tmpPath);

    const server = await parseSurveyExcel(buf);
    expect(server.errors).toEqual([]);
    expect(server.questions).toHaveLength(11);
    expect(server.questions.reduce((n, q) => n + q.choices.length, 0)).toBe(29);

    const client = await validateSurveyExcel(toFile(buf, "demo-survey.xlsx"));
    expect(client.errors).toEqual([]);
    expect(client.summary).toEqual({ questionCount: 11, choiceCount: 29 });
  });

  it("仓库中提交的 demo-survey.xlsx 与生成器一致（同样通过两个解析器）", async () => {
    const committed = path.join(process.cwd(), "demo-survey.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(committed);
    expect(wb.worksheets[0].name).toBe("使用说明");
    const buf = fs.readFileSync(committed);
    const server = await parseSurveyExcel(buf);
    expect(server.errors).toEqual([]);
    expect(server.questions).toHaveLength(11);
    const client = await validateSurveyExcel(toFile(buf, "demo-survey.xlsx"));
    expect(client.summary).toEqual({ questionCount: 11, choiceCount: 29 });
  });
});
