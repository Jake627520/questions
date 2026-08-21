import { describe, it, expect } from "vitest";
import { parseSurveyExcel, exportSurveyToExcel } from "../src/lib/excel-parser";
import { generateComplexSurveyExcel } from "../scripts/generate-complex-demo-excel";
import { db } from "../src/lib/db";
import fs from "fs";
import path from "path";

describe("P0-4 Excel Round-trip 雙向無損保真度測試 (Excel Round-trip Fidelity Tests)", () => {
  const tempExcelPath = path.resolve(process.cwd(), "test-roundtrip-orig.xlsx");
  const exportedExcelPath = path.resolve(process.cwd(), "test-roundtrip-exported.xlsx");

  it("Excel -> Import -> DB -> Export -> Re-import 應達成 100% 屬性零資料遺失", async () => {
    // 1. 產生 26 題完整複雜題庫
    await generateComplexSurveyExcel(tempExcelPath);
    const origBuffer = fs.readFileSync(tempExcelPath);

    // 2. Import 解析
    const parse1 = await parseSurveyExcel(origBuffer);
    expect(parse1.errors).toHaveLength(0);
    expect(parse1.questions.length).toBeGreaterThanOrEqual(25);

    // 3. 儲存至 DB
    const survey = await db.survey.create({
      data: {
        organizationId: "default-org-id",
        title: "Round-trip 保真度測試問卷",
        version: 1,
        isAnonymous: true,
        collectIdentity: false,
        questions: {
          create: parse1.questions.map((q) => ({
            orderNum: q.orderNum,
            code: q.code,
            title: q.title,
            description: q.description,
            questionType: q.questionType,
            required: q.required,
            scoringEnabled: q.scoringEnabled,
            reverseScore: q.reverseScore,
            visibilityRules: q.visibilityRules ? (typeof q.visibilityRules === "object" ? JSON.stringify(q.visibilityRules) : q.visibilityRules) : null,
            visibilityHint: q.visibilityHint,
            minSelections: q.minSelections,
            maxSelections: q.maxSelections,
            minValue: q.minValue,
            maxValue: q.maxValue,
            choices: {
              create: q.choices.map((c) => ({
                orderNum: c.orderNum,
                label: c.label,
                value: c.value,
                scoreEnabled: c.scoreEnabled,
                score: c.score,
                isOther: c.isOther,
                requiresText: c.requiresText,
                isNoneOfAbove: c.isNoneOfAbove,
              })),
            },
          })),
        },
      },
      include: {
        questions: {
          include: { choices: true },
        },
      },
    });

    // 4. 從 DB 讀取並 Export 回 Excel
    const fullSurvey = await db.survey.findUniqueOrThrow({
      where: { id: survey.id },
      include: {
        questions: {
          orderBy: { orderNum: "asc" },
          include: {
            choices: { orderBy: { orderNum: "asc" } },
          },
        },
      },
    });

    const exportedBuffer = await exportSurveyToExcel(fullSurvey as any, []);
    fs.writeFileSync(exportedExcelPath, exportedBuffer);

    // 5. 重新 Import 匯出的 Excel
    const parse2 = await parseSurveyExcel(exportedBuffer);
    expect(parse2.errors).toHaveLength(0);
    expect(parse2.questions.length).toBe(parse1.questions.length);

    // 6. 逐題逐選項比對所有 14+ 種屬性保真度
    for (let i = 0; i < parse1.questions.length; i++) {
      const q1 = parse1.questions[i];
      const q2 = parse2.questions[i];

      expect(q2.code).toBe(q1.code);
      expect(q2.title).toBe(q1.title);
      expect(q2.questionType).toBe(q1.questionType);
      expect(q2.required).toBe(q1.required);
      expect(q2.scoringEnabled).toBe(q1.scoringEnabled);
      expect(q2.reverseScore).toBe(q1.reverseScore);
      expect(q2.visibilityRules).toBe(q1.visibilityRules);
      expect(q2.visibilityHint).toBe(q1.visibilityHint);
      expect(q2.minSelections).toBe(q1.minSelections);
      expect(q2.maxSelections).toBe(q1.maxSelections);
      expect(q2.minValue).toBe(q1.minValue);
      expect(q2.maxValue).toBe(q1.maxValue);

      expect(q2.choices.length).toBe(q1.choices.length);
      for (let j = 0; j < q1.choices.length; j++) {
        const c1 = q1.choices[j];
        const c2 = q2.choices[j];
        expect(c2.label).toBe(c1.label);
        expect(c2.value).toBe(c1.value);
        expect(c2.scoreEnabled).toBe(c1.scoreEnabled);
        expect(c2.score).toBe(c1.score);
        expect(c2.isOther).toBe(c1.isOther);
        expect(c2.requiresText).toBe(c1.requiresText);
        expect(c2.isNoneOfAbove).toBe(c1.isNoneOfAbove);
      }
    }

    // 清理
    await db.survey.delete({ where: { id: survey.id } });
    if (fs.existsSync(tempExcelPath)) fs.unlinkSync(tempExcelPath);
    if (fs.existsSync(exportedExcelPath)) fs.unlinkSync(exportedExcelPath);
  });
});
