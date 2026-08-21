import { PrismaClient, QuestionType, SurveyStatus } from "@prisma/client";
import fs from "fs";
import path from "path";
import { parseSurveyExcel } from "../src/lib/excel-parser";
import { generateDemoExcel } from "../scripts/generate-demo-excel";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting survey database seeding...");

  const demoExcelPath = path.join(process.cwd(), "demo-survey.xlsx");
  if (!fs.existsSync(demoExcelPath)) {
    console.log("Generating demo-survey.xlsx...");
    await generateDemoExcel(demoExcelPath);
  }

  const fileBuffer = fs.readFileSync(demoExcelPath);
  const { questions, errors } = await parseSurveyExcel(fileBuffer);

  if (errors.length > 0) {
    console.error("Errors while parsing demo excel:", errors);
    process.exit(1);
  }

  console.log(`Parsed ${questions.length} questions from demo-survey.xlsx`);

  // Clear existing demo survey if any
  const existingSurvey = await prisma.survey.findFirst({
    where: { title: "2026 產品體驗與服務滿意度調查 (Demo Survey)" },
  });

  if (existingSurvey) {
    console.log("Cleaning up previous demo survey...");
    await prisma.survey.delete({ where: { id: existingSurvey.id } });
  }

  // Create demo survey
  const survey = await prisma.survey.create({
    data: {
      title: "2026 產品體驗與服務滿意度調查 (Demo Survey)",
      description:
        "這是一份包含 11 題多元題型、條件跳題、複選 min/max 限制、數值範圍檢核、計分模式、反向計分、特殊給分、0分與NULL區分、及必填補充說明之示範問卷。",
      status: SurveyStatus.PUBLISHED,
      questions: {
        create: questions.map((q) => ({
          orderNum: q.orderNum,
          code: q.code,
          title: q.title,
          description: q.description,
          questionType: q.questionType as QuestionType,
          required: q.required,
          scoringEnabled: q.scoringEnabled,
          reverseScore: q.reverseScore,
          visibilityRules: q.visibilityRules ? (typeof q.visibilityRules === "string" ? q.visibilityRules : JSON.stringify(q.visibilityRules)) : null,
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
        include: {
          choices: true,
        },
      },
    },
  });

  console.log(`✅ Demo Survey created with ID: ${survey.id}`);
  console.log(`Total questions inserted: ${survey.questions.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
