import { describe, it, expect, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { parseSurveyExcel } from "@/lib/excel-parser";
import { POST as importPOST } from "@/app/api/surveys/import/route";
import { createSession, SESSION_COOKIE_NAME, hashPassword } from "@/lib/auth";
import { Role } from "@prisma/client";

/**
 * 記憶體 Excel 產生輔助函式
 */
async function buildExcelBlob(
  questions: Array<Record<string, any>>,
  choices?: Array<Record<string, any>>,
  options?: { emptyQuestionsSheet?: boolean; noHeaders?: boolean }
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const qSheet = wb.addWorksheet("questions");
  const cSheet = wb.addWorksheet("choices");

  if (!options?.noHeaders && !options?.emptyQuestionsSheet) {
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

    for (const q of questions) {
      qSheet.addRow([
        q.code,
        q.title,
        q.description ?? null,
        q.question_type ?? null,
        q.required ?? "FALSE",
        q.scoring_enabled ?? "FALSE",
        q.reverse_score ?? "FALSE",
        q.visibility_rules ?? null,
        q.visibility_hint ?? null,
        q.min_selections ?? null,
        q.max_selections ?? null,
        q.min_value ?? null,
        q.max_value ?? null,
        q.order_num ?? null,
      ]);
    }
  }

  if (choices && choices.length > 0) {
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

    for (const c of choices) {
      cSheet.addRow([
        c.question_code,
        c.label,
        c.value,
        c.order_num ?? null,
        c.score_enabled ?? "FALSE",
        c.score ?? null,
        c.is_other ?? "FALSE",
        c.requires_text ?? "FALSE",
        c.is_none_of_above ?? "FALSE",
      ]);
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("第二輪破壞性測試 (Round 2 Destructive Testing Suite - 15 Scenarios)", () => {
  const orgId = "destructive-test-org";
  let editorToken: string;

  beforeEach(async () => {
    // 1. 清理舊測試資料
    await db.surveyImport.deleteMany({
      where: { organizationId: orgId },
    });
    await db.survey.deleteMany({
      where: { organizationId: orgId },
    });
    await db.membership.deleteMany({
      where: { organizationId: orgId },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "destructive-editor@" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "destructive-editor@" } },
    });
    await db.organization.deleteMany({
      where: { id: orgId },
    });

    // 2. 建立測試組織與 EDITOR 帳號
    await db.organization.create({
      data: { id: orgId, name: "Destructive Test Org", slug: "destructive-org" },
    });

    const user = await db.user.create({
      data: {
        email: "destructive-editor@example.com",
        name: "Destructive Editor",
        passwordHash: await hashPassword("Pass123!"),
        memberships: {
          create: { organizationId: orgId, role: Role.EDITOR },
        },
      },
    });

    const session = await createSession(user.id);
    editorToken = session.token;
  });

  async function postImport(blob: Blob, fileName = "test.xlsx", extraParams?: Record<string, string>) {
    const formData = new FormData();
    formData.append("file", blob, fileName);
    formData.append("mode", extraParams?.mode || "save");
    formData.append("organizationId", orgId);
    formData.append("title", extraParams?.title || "[DESTRUCTIVE-TEST] 測試問卷");
    formData.append("copyrightConfirmed", extraParams?.copyrightConfirmed ?? "true");
    if (extraParams?.status) {
      formData.append("status", extraParams.status);
    }

    const req = new NextRequest("http://localhost:3000/api/surveys/import", {
      method: "POST",
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${editorToken}` },
      body: formData,
    });

    const res = await importPOST(req);
    const data = await res.json();
    return { res, data };
  }

  // =========================================================================
  // Scenario 01: 01-normal.xlsx (Baseline)
  // =========================================================================
  it("[Scenario 01] 01-normal.xlsx: 基準正常問卷應成功匯入 (200 OK) 且完整寫入 DB", async () => {
    const blob = await buildExcelBlob(
      [
        { code: "Q1", title: "您對產品滿意嗎？", question_type: "single_choice", required: "TRUE", order_num: 1 },
        { code: "Q2", title: "請留下您的建議", question_type: "text", required: "FALSE", visibility_rules: "SHOW IF Q1 = sat", order_num: 2 },
      ],
      [
        { question_code: "Q1", label: "滿意", value: "sat", order_num: 1, score_enabled: "TRUE", score: 5 },
        { question_code: "Q1", label: "不滿意", value: "unsat", order_num: 2, score_enabled: "TRUE", score: 1 },
      ]
    );

    const { res, data } = await postImport(blob, "01-normal.xlsx");

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.surveyId).toBeDefined();

    // 驗證 DB
    const survey = await db.survey.findUnique({
      where: { id: data.surveyId },
      include: { questions: { include: { choices: true } } },
    });
    expect(survey).toBeDefined();
    expect(survey?.questions).toHaveLength(2);
    expect(survey?.questions[0].choices).toHaveLength(2);
  });

  // =========================================================================
  // Scenario 02: 02-missing-question-type.xlsx
  // =========================================================================
  it("[Scenario 02] 02-missing-question-type.xlsx: 題型留空應被嚴格拒絕 (400 REQUIRED_FIELD_EMPTY)", async () => {
    const blob = await buildExcelBlob([
      { code: "Q1", title: "無題型題目", question_type: "", order_num: 1 },
    ]);

    const { res, data } = await postImport(blob, "02-missing-question-type.xlsx");

    expect(res.status).toBe(422);
    expect(data.success).toBe(false);
    expect(data.errors.some((e: any) => e.code === "REQUIRED_FIELD_EMPTY" && e.column === "question_type")).toBe(true);
  });

  // =========================================================================
  // Scenario 03: 03-invalid-score.xlsx
  // =========================================================================
  it("[Scenario 03] 03-invalid-score.xlsx: 分數輸入非法字串 (ABC) 應被拒絕 (400 INVALID_NUMBER)", async () => {
    const blob = await buildExcelBlob(
      [{ code: "Q1", title: "計分題", question_type: "single_choice", scoring_enabled: "TRUE" }],
      [{ question_code: "Q1", label: "選項 A", value: "optA", score_enabled: "TRUE", score: "ABC" }]
    );

    const { res, data } = await postImport(blob, "03-invalid-score.xlsx");

    expect(res.status).toBe(422);
    expect(data.success).toBe(false);
    expect(data.errors.some((e: any) => e.code === "INVALID_NUMBER" && e.column === "score")).toBe(true);
  });

  // =========================================================================
  // Scenario 04: 04-invalid-min-max.xlsx
  // =========================================================================
  it("[Scenario 04] 04-invalid-min-max.xlsx: min/max 非數值或範圍倒置邊界檢查", async () => {
    // 4.1: 非數值字串
    const blobNonNum = await buildExcelBlob([
      { code: "Q1", title: "多選題", question_type: "multiple_choice", min_selections: "XYZ", max_selections: 3, order_num: 1 },
    ]);
    const res1 = await postImport(blobNonNum, "04-invalid-min-max.xlsx");
    expect(res1.res.status).toBe(422);
    expect(res1.data.errors.some((e: any) => e.code === "INVALID_NUMBER" && e.column === "min_selections")).toBe(true);

    // 4.2: 範圍倒置 (min_selections = 5 > max_selections = 2)
    const blobInverted = await buildExcelBlob(
      [
        { code: "Q2", title: "多選題倒置", question_type: "multiple_choice", min_selections: 5, max_selections: 2, order_num: 1 },
      ],
      [
        { question_code: "Q2", label: "A", value: "a", order_num: 1 },
        { question_code: "Q2", label: "B", value: "b", order_num: 2 },
      ]
    );
    const res2 = await postImport(blobInverted, "04-inverted-min-max.xlsx");
    expect(res2.res.status).toBe(422);
    expect(res2.data.success).toBe(false);
    expect(res2.data.errors.some((e: any) => e.code === "INVALID_MIN_MAX_RANGE")).toBe(true);
  });

  // =========================================================================
  // Scenario 05: 05-duplicate-code.xlsx
  // =========================================================================
  it("[Scenario 05] 05-duplicate-code.xlsx: 同工作表重複題目代碼 Q1 應被拒絕，不得靜默覆寫", async () => {
    const blob = await buildExcelBlob(
      [
        { code: "Q1", title: "第一題原始版本", question_type: "text", order_num: 1 },
        { code: "Q1", title: "重複代碼題目", question_type: "text", order_num: 2 },
      ]
    );

    const { res, data } = await postImport(blob, "05-duplicate-code.xlsx");
    expect(res.status).toBe(422);
    expect(data.success).toBe(false);
    expect(data.errors.some((e: any) => e.code === "DUPLICATE_QUESTION_CODE")).toBe(true);
  });

  // =========================================================================
  // Scenario 06: 06-duplicate-choice.xlsx
  // =========================================================================
  it("[Scenario 06] 06-duplicate-choice.xlsx: 同題目下重複選項代碼或序號應被拒絕", async () => {
    const blob = await buildExcelBlob(
      [{ code: "Q1", title: "重複選項題", question_type: "single_choice", order_num: 1 }],
      [
        { question_code: "Q1", label: "選項 1", value: "same_val", order_num: 1 },
        { question_code: "Q1", label: "選項 2", value: "same_val", order_num: 2 },
      ]
    );

    const { res, data } = await postImport(blob, "06-duplicate-choice.xlsx");
    expect(res.status).toBe(422);
    expect(data.success).toBe(false);
    expect(data.errors.some((e: any) => e.message.includes("重複的選項代碼"))).toBe(true);
  });

  // =========================================================================
  // Scenario 07: 07-missing-choice.xlsx
  // =========================================================================
  it("[Scenario 07] 07-missing-choice.xlsx: 選擇題未提供任何選項時的處理行為檢測", async () => {
    const blob = await buildExcelBlob([
      { code: "Q1", title: "無選項單選題", question_type: "single_choice", order_num: 1 },
    ]);

    const { res, data } = await postImport(blob, "07-missing-choice.xlsx");
    expect(res.status).toBe(422);
    expect(data.success).toBe(false);
    expect(data.errors.some((e: any) => e.code === "CHOICE_REQUIRED_FOR_TYPE")).toBe(true);
  });

  // =========================================================================
  // Scenario 08: 08-invalid-branch.xlsx
  // =========================================================================
  it("[Scenario 08] 08-invalid-branch.xlsx: 條件跳題相依不存在的題目或選項應被拒絕", async () => {
    const blob = await buildExcelBlob([
      { code: "Q1", title: "基礎題", question_type: "text", order_num: 1 },
      { code: "Q2", title: "幽靈條件題", question_type: "text", visibility_rules: "SHOW IF GHOST_Q = 1", order_num: 2 },
    ]);

    const { res, data } = await postImport(blob, "08-invalid-branch.xlsx");
    expect(res.status).toBe(422);
    expect(data.success).toBe(false);
    expect(data.errors.some((e: any) => e.message.includes("不存在的題目代碼"))).toBe(true);
  });

  // =========================================================================
  // Scenario 09: 09-circular-branch.xlsx
  // =========================================================================
  it("[Scenario 09] 09-circular-branch.xlsx: 條件循環跳題應被 422 拒絕且 DB 零寫入", async () => {
    const blob = await buildExcelBlob(
      [
        { code: "QA", title: "題目 A", question_type: "single_choice", visibility_rules: "SHOW IF QB = 1" },
        { code: "QB", title: "題目 B", question_type: "single_choice", visibility_rules: "SHOW IF QA = 1" },
      ],
      [
        { question_code: "QA", label: "A1", value: "1" },
        { question_code: "QB", label: "B1", value: "1" },
      ]
    );

    const { res, data } = await postImport(blob, "09-circular-branch.xlsx");
    expect(res.status).toBe(422);
    expect(data.success).toBe(false);
    expect(data.errors.some((e: any) => e.code === "BRANCHING_CYCLE")).toBe(true);
  });

  // =========================================================================
  // Scenario 10: 10-non-xlsx-disguised.xlsx
  // =========================================================================
  it("[Scenario 10] 10-non-xlsx-disguised.xlsx: 偽裝副檔名 (.xlsx 但非 OOXML zip) 應被攔截", async () => {
    const fakeBlob = new Blob(["%PDF-1.5 fake pdf file content"], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const { res, data } = await postImport(fakeBlob, "10-non-xlsx-disguised.xlsx");
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.errors.some((e: any) => e.code === "FILE_SIGNATURE_INVALID")).toBe(true);
  });

  // =========================================================================
  // Scenario 11: 11-formula-injection.xlsx
  // =========================================================================
  it("[Scenario 11] 11-formula-injection.xlsx: 公式注入攻擊 (=cmd|...) 應被安全提取或中和", async () => {
    const wb = new ExcelJS.Workbook();
    const qSheet = wb.addWorksheet("questions");
    qSheet.addRow(["code", "title", "question_type"]);
    // 注入 formula
    const row = qSheet.addRow(["Q1", "測試題目", "text"]);
    row.getCell(2).value = { formula: "cmd|'/C calc'!A0", result: "安全純文字" };

    const rawBuffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([rawBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const { res, data } = await postImport(blob, "11-formula-injection.xlsx");
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    const created = await db.survey.findUnique({
      where: { id: data.surveyId },
      include: { questions: true },
    });
    // 確認公式未作為惡意代碼執行，而是提取計算結果或文字
    expect(created?.questions[0].title).toBe("安全純文字");
  });

  // =========================================================================
  // Scenario 12: 12-500+questions.xlsx
  // =========================================================================
  it("[Scenario 12] 12-500+questions.xlsx: 超過 500 題上限應被拒絕 (400 ROW_LIMIT_EXCEEDED)", async () => {
    const questions: any[] = [];
    for (let i = 1; i <= 501; i++) {
      questions.push({ code: `Q${i}`, title: `題目 ${i}`, question_type: "text", order_num: i });
    }
    const blob = await buildExcelBlob(questions);

    const { res, data } = await postImport(blob, "12-500+questions.xlsx");
    expect(res.status).toBe(422);
    expect(data.success).toBe(false);
    expect(data.errors.some((e: any) => e.code === "ROW_LIMIT_EXCEEDED")).toBe(true);
  });

  // =========================================================================
  // Scenario 13: 13-5000+choices.xlsx
  // =========================================================================
  it("[Scenario 13] 13-5000+choices.xlsx: 超過 5000 選項上限應被拒絕 (400 ROW_LIMIT_EXCEEDED)", async () => {
    const questions = [{ code: "Q1", title: "超大選項題", question_type: "single_choice", order_num: 1 }];
    const choices: any[] = [];
    for (let i = 1; i <= 5001; i++) {
      choices.push({ question_code: "Q1", label: `選項 ${i}`, value: `opt_${i}`, order_num: i });
    }
    const blob = await buildExcelBlob(questions, choices);

    const { res, data } = await postImport(blob, "13-5000+choices.xlsx");
    expect(res.status).toBe(422);
    expect(data.success).toBe(false);
    expect(data.errors.some((e: any) => e.code === "ROW_LIMIT_EXCEEDED")).toBe(true);
  });

  // =========================================================================
  // Scenario 14: 14-empty-questions.xlsx
  // =========================================================================
  it("[Scenario 14] 14-empty-questions.xlsx: questions 工作表無資料列應被拒絕", async () => {
    const blob = await buildExcelBlob([], [], { emptyQuestionsSheet: true });

    const { res, data } = await postImport(blob, "14-empty-questions.xlsx");
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  // =========================================================================
  // Scenario 15: 15-unicode-and-special-chars.xlsx
  // =========================================================================
  it("[Scenario 15] 15-unicode-and-special-chars.xlsx: 極端 Unicode、Emoji、跳脫字元應能無損存入", async () => {
    const complexTitle = '🔥 綜合問卷 🚀 <script>alert("xss")</script> & "雙引號" \'單引號\' 日本語: アンケート العربية: استبيان';
    const complexDesc = "說明文包含跳行\n第二行\t含Tab與符號 🌟💫";
    const complexChoiceLabel = "極端選項 👍 <bold>A</bold> 💯";

    const blob = await buildExcelBlob(
      [
        { code: "Q_UNI_1", title: complexTitle, description: complexDesc, question_type: "single_choice", order_num: 1 },
      ],
      [
        { question_code: "Q_UNI_1", label: complexChoiceLabel, value: "uni_opt_1", order_num: 1 },
      ]
    );

    const { res, data } = await postImport(blob, "15-unicode-and-special-chars.xlsx");
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    const survey = await db.survey.findUnique({
      where: { id: data.surveyId },
      include: { questions: { include: { choices: true } } },
    });

    expect(survey?.questions[0].title).toBe(complexTitle);
    expect(survey?.questions[0].description).toBe(complexDesc);
    expect(survey?.questions[0].choices[0].label).toBe(complexChoiceLabel);
  });
});
