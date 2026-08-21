import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

async function runUAT() {
  console.log("=== 開始 M3 完整使用者驗收測試 (UAT) ===\n");
  const baseUrl = "http://localhost:3000";

  // -------------------------------------------------------------
  // 測試 1: 簡寫語法 (Shorthand Syntax)
  // -------------------------------------------------------------
  console.log("【測試 1】簡寫語法 Excel 匯入與解析測試...");
  const wb1 = new ExcelJS.Workbook();
  const qSheet1 = wb1.addWorksheet("questions");
  qSheet1.columns = [
    { header: "order_num", key: "order_num" },
    { header: "code", key: "code" },
    { header: "title", key: "title" },
    { header: "description", key: "description" },
    { header: "question_type", key: "question_type" },
    { header: "required", key: "required" },
    { header: "scoring_enabled", key: "scoring_enabled" },
    { header: "reverse_score", key: "reverse_score" },
    { header: "visibility_rules", key: "visibility_rules" },
  ];
  qSheet1.addRow({
    order_num: 1,
    code: "Q1",
    title: "您對服務滿意嗎？",
    question_type: "single_choice",
    required: true,
    scoring_enabled: true,
    reverse_score: false,
    visibility_rules: null,
  });
  qSheet1.addRow({
    order_num: 2,
    code: "Q2",
    title: "不滿意原因 (簡寫 in [a, b])",
    question_type: "text",
    required: true,
    scoring_enabled: false,
    reverse_score: false,
    visibility_rules: "SHOW IF Q1 in [very_dissatisfied, dissatisfied]",
  });
  qSheet1.addRow({
    order_num: 3,
    code: "Q3",
    title: "最常使用工具 (複選)",
    question_type: "multiple_choice",
    required: true,
    scoring_enabled: false,
    reverse_score: false,
    visibility_rules: null,
  });
  qSheet1.addRow({
    order_num: 4,
    code: "Q4",
    title: "Slack 頻道反饋 (簡寫 contains)",
    question_type: "text",
    required: false,
    scoring_enabled: false,
    reverse_score: false,
    visibility_rules: "SHOW IF Q3 contains slack",
  });
  qSheet1.addRow({
    order_num: 5,
    code: "Q5",
    title: "隱藏測試題 (簡寫 HIDE IF)",
    question_type: "text",
    required: false,
    scoring_enabled: false,
    reverse_score: false,
    visibility_rules: "HIDE IF Q1 equals very_satisfied",
  });

  const cSheet1 = wb1.addWorksheet("choices");
  cSheet1.columns = [
    { header: "question_code", key: "question_code" },
    { header: "order_num", key: "order_num" },
    { header: "label", key: "label" },
    { header: "value", key: "value" },
    { header: "score_enabled", key: "score_enabled" },
    { header: "score", key: "score" },
    { header: "is_other", key: "is_other" },
    { header: "requires_text", key: "requires_text" },
    { header: "is_none_of_above", key: "is_none_of_above" },
  ];
  cSheet1.addRow({ question_code: "Q1", order_num: 1, label: "非常不滿意", value: "very_dissatisfied", score_enabled: true, score: 1 });
  cSheet1.addRow({ question_code: "Q1", order_num: 2, label: "不太滿意", value: "dissatisfied", score_enabled: true, score: 2 });
  cSheet1.addRow({ question_code: "Q1", order_num: 3, label: "滿意", value: "satisfied", score_enabled: true, score: 3 });
  cSheet1.addRow({ question_code: "Q1", order_num: 4, label: "非常滿意", value: "very_satisfied", score_enabled: true, score: 4 });
  cSheet1.addRow({ question_code: "Q3", order_num: 1, label: "Slack", value: "slack", score_enabled: false, score: null });
  cSheet1.addRow({ question_code: "Q3", order_num: 2, label: "Email", value: "email", score_enabled: false, score: null });

  const testFile1 = path.join(process.cwd(), "uat-shorthand.xlsx");
  await wb1.xlsx.writeFile(testFile1);

  // 測試預覽 API
  const form1 = new FormData();
  const fileBytes1 = fs.readFileSync(testFile1);
  form1.append("file", new Blob([fileBytes1]), "uat-shorthand.xlsx");
  form1.append("mode", "save");
  form1.append("title", "UAT 簡寫語法測試問卷");

  const res1 = await fetch(`${baseUrl}/api/surveys/import`, {
    method: "POST",
    body: form1,
  });
  const data1 = await res1.json();
  if (res1.ok && data1.surveyId) {
    console.log(`✅ 簡寫語法匯入成功！建立 Survey ID: ${data1.surveyId}`);
  } else {
    console.error("❌ 簡寫語法匯入失敗:", data1);
  }

  // -------------------------------------------------------------
  // 測試 2: 循環相依檢測 (Circular Dependency Check)
  // -------------------------------------------------------------
  console.log("\n【測試 2】循環相依檢測 (Q1 -> Q2, Q2 -> Q1)...");
  const wb2 = new ExcelJS.Workbook();
  const qSheet2 = wb2.addWorksheet("questions");
  qSheet2.columns = [
    { header: "order_num", key: "order_num" },
    { header: "code", key: "code" },
    { header: "title", key: "title" },
    { header: "question_type", key: "question_type" },
    { header: "visibility_rules", key: "visibility_rules" },
  ];
  qSheet2.addRow({ order_num: 1, code: "Q1", title: "題1", question_type: "text", visibility_rules: "SHOW IF Q2 equals a" });
  qSheet2.addRow({ order_num: 2, code: "Q2", title: "題2", question_type: "text", visibility_rules: "SHOW IF Q1 equals b" });
  const cSheet2 = wb2.addWorksheet("choices");
  cSheet2.columns = [{ header: "question_code", key: "question_code" }, { header: "order_num", key: "order_num" }, { header: "label", key: "label" }, { header: "value", key: "value" }];

  const testFile2 = path.join(process.cwd(), "uat-circular.xlsx");
  await wb2.xlsx.writeFile(testFile2);

  const form2 = new FormData();
  const fileBytes2 = fs.readFileSync(testFile2);
  form2.append("file", new Blob([fileBytes2]), "uat-circular.xlsx");
  form2.append("mode", "save");
  form2.append("title", "UAT 循環相依測試問卷");

  const res2 = await fetch(`${baseUrl}/api/surveys/import`, {
    method: "POST",
    body: form2,
  });
  const data2 = await res2.json();
  if (res2.status === 422 && data2.errors?.some((e: string) => e.includes("循環相依"))) {
    console.log(`✅ 循環相依成功被攔截！錯誤訊息: ${data2.errors.join("; ")}`);
  } else {
    console.error("❌ 循環相依未正確攔截:", data2);
  }

  // -------------------------------------------------------------
  // 測試 3: 草稿暫存與恢復 (Draft Save, Resume & Submission)
  // -------------------------------------------------------------
  console.log("\n【測試 3】草稿暫存、讀取恢復與正式提交...");
  const surveyId = data1.surveyId;

  // 1. 儲存部分草稿
  const draftRes = await fetch(`${baseUrl}/api/surveys/${surveyId}/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      answers: [{ questionCode: "Q1", rawValue: "satisfied" }],
    }),
  });
  const draftData = await draftRes.json();
  console.log(`  - 暫存草稿回應: status=${draftData.status}, responseId=${draftData.responseId}`);

  // 2. 恢復草稿
  const loadDraftRes = await fetch(`${baseUrl}/api/surveys/${surveyId}/responses/${draftData.responseId}`);
  const loadDraftData = await loadDraftRes.json();
  console.log(`  - 讀取草稿內容: answers=${JSON.stringify(loadDraftData.answers)}`);

  // 3. 正式提交
  const submitRes = await fetch(`${baseUrl}/api/surveys/${surveyId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      responseId: draftData.responseId,
      answers: [
        { questionCode: "Q1", rawValue: "satisfied" },
        { questionCode: "Q3", rawValue: ["email"] },
      ],
    }),
  });
  const submitData = await submitRes.json();
  console.log(`  - 正式提交結果: success=${submitData.success}, totalScore=${submitData.evaluation?.totalScore}`);

  // -------------------------------------------------------------
  // 測試 4: 隱藏題統計排除 (Stats Hidden Exclusion)
  // -------------------------------------------------------------
  console.log("\n【測試 4】隱藏題統計排除檢查...");
  const statsRes = await fetch(`${baseUrl}/api/surveys/${surveyId}/stats`);
  const statsData = await statsRes.json();
  const q2Stats = statsData.questionStats.find((q: any) => q.code === "Q2");
  console.log(`  - Q2 隱藏題作答總人數 (應為 0，因為 Q1 選滿意時 Q2 被隱藏): totalAnswered = ${q2Stats?.totalAnswered}`);

  // -------------------------------------------------------------
  // 測試 5: 版本複製 (Survey Version Clone)
  // -------------------------------------------------------------
  console.log("\n【測試 5】問卷版本複製 (Clone Version)...");
  const cloneRes = await fetch(`${baseUrl}/api/surveys/${surveyId}/clone-version`, {
    method: "POST",
  });
  const cloneData = await cloneRes.json();
  console.log(`  - 版本複製結果: version=${cloneData.version}, title=${cloneData.survey?.title}, parentSurveyId=${cloneData.survey?.parentSurveyId}`);

  // 清理測試檔案
  if (fs.existsSync(testFile1)) fs.unlinkSync(testFile1);
  if (fs.existsSync(testFile2)) fs.unlinkSync(testFile2);

  console.log("\n=== M3 UAT 驗收測試全數執行完畢！ ===");
}

runUAT().catch(console.error);
