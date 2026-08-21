import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import { generateDemoExcel } from "../scripts/generate-demo-excel";
import {
  parseSurveyExcel,
  generateSurveyExportExcel,
  hasValidXlsxSignature,
} from "../src/lib/excel-parser";

describe("Excel 題庫匯入與報表匯出測試 (Excel Parser & Exporter Tests)", () => {
  const testExcelPath = path.join(process.cwd(), "test-excel-parser.xlsx");

  it("應能正確檢驗合法與非法的 XLSX Magic Bytes 檔案簽章 (hasValidXlsxSignature)", () => {
    // 1. 合法 ZIP / XLSX magic bytes (0x50, 0x4B, 0x03, 0x04)
    const validHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(hasValidXlsxSignature(validHeader)).toBe(true);

    // 2. 假檔案（如純文字被改名為 .xlsx）
    const fakeTextFile = Buffer.from("this is a plain text file pretending to be xlsx");
    expect(hasValidXlsxSignature(fakeTextFile)).toBe(false);

    // 3. 長度不足 4 bytes
    const tooShort = Buffer.from([0x50, 0x4b]);
    expect(hasValidXlsxSignature(tooShort)).toBe(false);
  });

  it("應能成功產生包含 11 題 (含條件跳題) 之 Demo Excel 檔案", async () => {
    await generateDemoExcel(testExcelPath);
    expect(fs.existsSync(testExcelPath)).toBe(true);
  });

  it("應能正確解析 Demo Excel 題庫之 questions (含M2/M3條件與規則) 與 choices 結構", async () => {
    const fileBuffer = fs.readFileSync(testExcelPath);
    const { questions, errors } = await parseSurveyExcel(fileBuffer);

    expect(errors).toHaveLength(0);
    expect(questions).toHaveLength(11);

    // Q1: 一般單選 1~4分
    const q1 = questions.find((q) => q.code === "Q1");
    expect(q1).toBeDefined();
    expect(q1?.questionType).toBe("single_choice");
    expect(q1?.scoringEnabled).toBe(true);
    expect(q1?.choices).toHaveLength(4);
    expect(q1?.choices[0].score).toBe(1);
    expect(q1?.choices[3].score).toBe(4);

    // Q1_FEEDBACK: 條件跳題 (簡寫語法)
    const qFeedback = questions.find((q) => q.code === "Q1_FEEDBACK");
    expect(qFeedback).toBeDefined();
    expect(qFeedback?.visibilityRules).toContain("Q1");

    // Q4: 數值範圍
    const q4 = questions.find((q) => q.code === "Q4");
    expect(q4?.minValue).toBe(0);
    expect(q4?.maxValue).toBe(100);

    // Q5: 複選題 min/max selections
    const q5 = questions.find((q) => q.code === "Q5");
    expect(q5?.minSelections).toBe(1);
    expect(q5?.maxSelections).toBe(2);

    // Q6: 「其他」＋必填說明
    const q6 = questions.find((q) => q.code === "Q6");
    expect(q6).toBeDefined();
    const otherChoice = q6?.choices.find((c) => c.isOther);
    expect(otherChoice).toBeDefined();
    expect(otherChoice?.requiresText).toBe(true);

    // Q7: 「以上皆非」互斥
    const q7 = questions.find((q) => q.code === "Q7");
    expect(q7).toBeDefined();
    const noneChoice = q7?.choices.find((c) => c.isNoneOfAbove);
    expect(noneChoice).toBeDefined();
    expect(noneChoice?.score).toBe(0);

    // Q8: 特殊給分 (選項 4 得 10 分)
    const q8 = questions.find((q) => q.code === "Q8");
    expect(q8).toBeDefined();
    const expertChoice = q8?.choices.find((c) => c.value === "lvl_expert");
    expect(expertChoice?.score).toBe(10);

    // Q9: 0分與NULL區分
    const q9 = questions.find((q) => q.code === "Q9");
    expect(q9).toBeDefined();
    const zeroChoice = q9?.choices.find((c) => c.value === "zero_issues");
    expect(zeroChoice?.score).toBe(0);
    expect(zeroChoice?.scoreEnabled).toBe(true);
    const nullChoice = q9?.choices.find((c) => c.value === "unspecified");
    expect(nullChoice?.score).toBeNull();
    expect(nullChoice?.scoreEnabled).toBe(false);

    // Q10: 反向計分題
    const q10 = questions.find((q) => q.code === "Q10");
    expect(q10).toBeDefined();
    expect(q10?.reverseScore).toBe(true);
  });

  it("應能成功產出 Excel Export 報表二進位資料", async () => {
    const fileBuffer = fs.readFileSync(testExcelPath);
    const { questions } = await parseSurveyExcel(fileBuffer);

    const exportBuffer = await generateSurveyExportExcel({
      survey: { title: "測試匯出問卷", version: 2 },
      questions,
      responses: [
        {
          id: "resp_1",
          version: 2,
          submittedAt: new Date(),
          totalScore: 18,
          maxScore: 30,
          percentage: 60,
          answers: [
            { questionCode: "Q1", rawValue: "very_satisfied", score: 4 },
            { questionCode: "Q6", rawValue: "other", otherText: "朋友介紹", score: null },
            { questionCode: "Q7", rawValue: ["slack", "discord"], score: 4 },
            { questionCode: "Q8", rawValue: "lvl_expert", score: 10 },
            { questionCode: "Q9", rawValue: "zero_issues", score: 0 },
            { questionCode: "Q10", rawValue: "strongly_agree", score: 1 },
          ],
        },
      ],
    });

    expect(exportBuffer).toBeInstanceOf(Buffer);
    expect(exportBuffer.length).toBeGreaterThan(1000);

    // 清理測試檔案
    if (fs.existsSync(testExcelPath)) fs.unlinkSync(testExcelPath);
  });
});
