# 📋 Excel 題庫製作與匯入標準作業程序 (SOP)

本手冊提供完整、清晰且防呆的 Excel 題庫製作指南。依照本 SOP 填寫，可確保 100% 一次匯入成功，並正確啟用條件跳題與計分機制。

---

## 🚀 快速作業流程

1. **取得範本**  
   進入系統匯入頁面（`/surveys/import`），點選右上角「**下載示範範本 (demo-survey.xlsx)**」。

2. **閱讀頁面說明與資源限制**  
   展開頁面頂部的「**題庫製作注意事項與資源限制**」，確認工作表、欄位、5MB/500列/5000列上限與安全規範。

3. **編輯題庫**  
   使用 Excel、Google Sheets 或 Numbers 開啟，依下方欄位規範填寫 `questions`（題目表）與 `choices`（選項表）兩個工作表。

4. **上傳、預覽與確認**  
   - 拖曳或選擇 `.xlsx` 檔案後，系統會**立即執行前端快速檢查**（副檔名、大小、必填、重複 code、選項關聯等）。  
   - 點選「**解析題庫預覽 (Dry Run)**」執行後端完整解析，預覽指標包含題數、選項數、必填題、計分題與條件跳題（此步驟絕不寫入正式資料庫）。  
   - 勾選「**我確認我有權使用並匯入上述內容**」版權聲明核取方塊。  
   - 預設狀態為「**儲存為草稿 (DRAFT)**」；若選擇「**直接發布 (PUBLISHED)**」點選匯入時會出現二次確認視窗。  
   - 確認無誤後點選確認匯入，系統使用 **Prisma Transaction 原子交易** 寫入並顯示包含專屬 Import ID 的成功摘要。
   - 隨時可由右上角「**匯入歷史紀錄**」（`/surveys/import/history`）檢視歷史稽核、結構指標或下載 CSV 錯誤報告。

---

## 🛡️ 系統會自動檢查什麼？

### 上傳當下（前端即時預檢）
- 副檔名必須為 `.xlsx`
- 檔案大小限制（上限 5MB）
- 是否包含 `questions` 工作表
- 必要欄位是否大致存在（如 `code`、`title`、`question_type`）
- `code` 是否空白或重複
- `choices` 的 `question_code` 是否指向存在的題目

### 後端完整檢查（預覽／匯入時）
- 檔案內容是否為合法 Excel（OOXML Magic Bytes 簽章 `PK\x03\x04`，防止竄改副檔名偽裝）
- 後端資源上限：檔案最大 5MB；`questions` 最多約 500 列；`choices` 最多約 5000 列；工作表最多約 20 個；單一儲存格約 5000 字元（超過會回傳 `FILE_TOO_LARGE` / `ROW_LIMIT_EXCEEDED` / `SHEET_LIMIT_EXCEEDED` / `CELL_TOO_LONG`）
- **Formula Injection 公式防護**：使用者輸入之 `=, +, -, @` 開頭內容一律視為純文字資料，禁止公式任意執行
- **版權確認核驗**：正式匯入時必須勾選合法版權聲明方塊（未勾選回傳 `COPYRIGHT_NOT_CONFIRMED`）
- **稽核紀錄與資料保留政策 (Data Retention Policy)**：
  - 系統**預設不永久保存使用者上傳之原始 Excel 二進位檔案**，以確保企業隱私、版權與資料安全。
  - 系統僅保存匯入中繼資料（`fileName`, `fileSize`, `importId`, `status`, 題數統計, 版權確認狀態, 錯誤資訊）。
- 完整欄位與題型合法性校驗
- 選項與題目關聯及代碼唯一性
- 條件跳題（`visibility_rules`）語法與引用是否有效
- 循環相依（Circular Dependency）等結構問題
- **All-or-Nothing 原子性保護**：任一驗證或寫入錯誤均全數 Rollback，絕不污染資料庫（資料庫 Transaction 保護）

錯誤訊息會清楚標示工作表、列號、欄位、目前值與「💡 具體修正建議」，並可在頁面篩選「**全部／錯誤／警告**」，超過 50 筆時自動折疊避免卡頓。若需進一步分析，可於歷史紀錄下載「**CSV 錯誤診斷報告**」。

---

## 📜 匯入歷史與稽核紀錄 (Import History & Audit)

系統針對每一次 Excel 匯入建立正式的 `SurveyImport` 稽核紀錄，您可隨時至 **`/surveys/import/history`** 檢視：

### 稽核紀錄包含資訊：
- **Import ID**：具唯一約束之正式代碼（如 `IMP-YYYYMMDD-XXXXXX`）
- **檔案資訊**：Excel 檔案名稱與檔案大小（位元組/KB/MB）
- **執行模式與狀態**：`PREVIEW`（預覽）、`IMPORTING`（處理中）、`SUCCESS`（成功）、`FAILED`（失敗）
- **問卷與組織關聯**：關聯之問卷名稱、版本號碼與組織識別（具多租戶組織隔離保護）
- **題目結構統計指標**：總題數、總選項數、必填題數、計分題數、條件跳題數
- **版權確認稽核**：使用者勾選合法使用權限聲明之確認狀態與時間戳記
- **時間歷程**：建立時間 (`createdAt`) 與完成時間 (`completedAt`)
- **錯誤追蹤與 CSV 匯出**：若匯入失敗，記錄錯誤代碼與詳細結構化診斷，並提供一鍵下載 **`import-[ImportID]-errors.csv`** 報告

---

## ✏️ 特殊字元與填寫注意

| 欄位 | 建議與規範 |
|------|------|
| `title`、`label`、`description` | 可使用中文、標點與特殊字元（如 `$ % ^ &`、括號、斜線等） |
| `code`、`value` | 建議僅使用英數字與底線 `A-Z a-z 0-9 _`，避免特殊字元與空格 |
| 空白列 | 系統會自動忽略純空白列 |
| 有部分資料但缺必填 | 會主動報錯並提示列號，不會靜默略過 |
| 故意填錯（重複 code、錯誤題型、無效關聯） | 前後端雙重攔截，不會匯入髒資料 |

條件跳題請使用 `visibility_rules` 欄位（語法見下文），不要依賴不存在的自訂欄位。

---

## 📑 工作表 1：`questions`（題目設定表）

每個題目佔用一列（Row），不可包含空白行。

| 欄位名稱 (Header) | 是否必填 | 允許填寫的值 / 格式 | 限制與注意事項 | 範例 |
|---|:---:|---|---|---|
| `order_num` | 選填 | 正整數 | 題目的顯示順序。留空時依 Excel 列號由上至下排序。 | `1` |
| `code` | **必填** | 英數字與底線，不可有空格 | **題目唯一代碼**。同份問卷內**絕對不可重複**，供條件跳題引用。 | `Q1`, `Q2_FEEDBACK` |
| `title` | **必填** | 任意文字 | 題目的主要標題文字。 | `您對本系統的滿意度為何？` |
| `description` | 選填 | 任意文字 | 題目下方的灰色補充說明文字。 | `請根據過去一週的使用體驗作答` |
| `question_type` | **必填** | 嚴格限定以下 6 種代碼（全小寫）：<br>• `single_choice`<br>• `multiple_choice`<br>• `text`<br>• `number`<br>• `yes_no`<br>• `info` | **題型代碼說明**：<br>1. `single_choice`：單選題（需在 choices 填選項）<br>2. `multiple_choice`：複選題（需在 choices 填選項）<br>3. `text`：問答文字題<br>4. `number`：數值輸入題<br>5. `yes_no`：是非題（需在 choices 填選項）<br>6. `info`：純說明卡片（不需填答） | `single_choice` |
| `required` | 選填 | `TRUE` / `FALSE` 或 `1` / `0` 或 `是` / `否` | 是否為必填題。預設為 `FALSE`。<br>💡 **注意**：若題目因條件跳題被隱藏，系統會**自動豁免必填**。 | `TRUE` |
| `scoring_enabled` | 選填 | `TRUE` / `FALSE` | 是否啟用計分。設為 `FALSE` 時，此題得分與滿分不計入總分。 | `TRUE` |
| `reverse_score` | 選填 | `TRUE` / `FALSE` | 是否反向計分（負向題目分數自動區間反轉，如 1~5 分反轉為 5~1 分）。 | `FALSE` |
| `visibility_rules` | 選填 | 條件語法（支援選項代碼或中文標籤） | **條件跳題規則**。留空表示無條件永久顯示。<br>語法限制見下方「條件跳題語法規範」。 | `SHOW IF Q1 in [非常不滿意, 不太滿意]` |
| `visibility_hint` | 選填 | 任意文字 | 當此題因條件顯現時，出現在題目上方的提示條文字。<br>留空則預設顯示：「💡 依據您前面的回答，請補充以下問題」。 | `依據您前面的回答，請補充說明：` |
| `min_selections` | 選填 | 正整數 | 僅適用於 `multiple_choice`（複選題）。**最少勾選幾項**。 | `1` |
| `max_selections` | 選填 | 正整數 | 僅適用於 `multiple_choice`（複選題）。**最多勾選幾項**。 | `2` |
| `min_value` | 選填 | 數值（可含小數） | 僅適用於 `number`（數值題）。**允許輸入之最小值**。 | `0` |
| `max_value` | 選填 | 數值（可含小數） | 僅適用於 `number`（數值題）。**允許輸入之最大值**。 | `100` |

---

## 📑 工作表 2：`choices`（選項設定表）

僅供 `single_choice`、`multiple_choice`、`yes_no` 題型使用。每個選項佔用一列。

| 欄位名稱 (Header) | 是否必填 | 允許填寫的值 / 格式 | 限制與注意事項 | 範例 |
|---|:---:|---|---|---|
| `question_code` | **必填** | 對應 `questions` 的 `code` | 必須完全對應 `questions` 表中已存在的題目代碼。 | `Q1` |
| `order_num` | 選填 | 正整數 | 選項在該題目內的排列順序。 | `1` |
| `label` | **必填** | 任意文字 | **顯示在畫面上的選項文字**。同題內的選項標籤不可重複。 | `非常不滿意` |
| `value` | **必填** | 英數字與底線 | **選項的代碼值**。同題內的選項 value 不可重複。 | `very_dissatisfied` |
| `score_enabled` | 選填 | `TRUE` / `FALSE` | 此選項是否計分。<br>• 設為 `FALSE` 或留空：得分為 `NULL`（不計分，不計入分母）。<br>• 設為 `TRUE`：依 `score` 欄位給分。 | `TRUE` |
| `score` | 選填 | 數值（可正、負、小數、0） | 此選項給予的分數。<br>💡 **重要**：填 `0` 代表「獲得零分」（會計入分母）；若不計分請將 `score_enabled` 設為 `FALSE`。 | `0`, `5`, `10` |
| `is_other` | 選填 | `TRUE` / `FALSE` | 是否為「其他」選項（勾選時自動展開文字補充輸入框）。 | `TRUE` |
| `requires_text` | 選填 | `TRUE` / `FALSE` | 勾選「其他」時，**是否強制要求填寫補充文字**。<br>若為 `TRUE`，填答者未輸入文字送出時會被系統阻擋。 | `TRUE` |
| `is_none_of_above` | 選填 | `TRUE` / `FALSE` | 是否為「以上皆非」選項。<br>若設為 `TRUE`，填答者**不可同時勾選其他任何選項**（嚴格互斥防呆）。 | `TRUE` |

---

## 🧠 條件跳題語法規範 (`visibility_rules`)

您可以在 `questions` 表的 `visibility_rules` 欄位直接使用以下簡寫語法：

| 語法模式 | 範例寫法 | 運作邏輯說明 |
|---|---|---|
| **清單包含 (in)** | `SHOW IF Q1 in [非常不滿意, 不太滿意]`<br>或 `SHOW IF Q1 in [opt_1, opt_2]` | 當 Q1 選擇了括號內的任一選項時，本題顯示。支援中文標籤或英文代碼。 |
| **單一相等 (equals)** | `SHOW IF Q1 equals 非常滿意`<br>或 `SHOW IF Q1 equals very_satisfied` | 當 Q1 選取該特定選項時，本題顯示。 |
| **複選包含 (contains)** | `SHOW IF Q5 contains Slack` | 複選題 Q5 勾選的項目中，只要標籤或代碼包含 `Slack` 即顯現。 |
| **數值比較** | `SHOW IF Q4 >= 10`<br>`SHOW IF Q4 lt 2` | 支援 `>`, `>=`, `<`, `<=`, `gt`, `gte`, `lt`, `lte`。 |
| **反向隱藏 (HIDE IF)** | `HIDE IF Q1 equals 非常滿意` | 當符合條件時隱藏本題。 |

### ⛔ 常見錯誤與防呆規則（匯入時會自動抓出）：
1. **循環相依（Circular Dependency）**：若 Q1 依賴 Q2、Q2 又依賴 Q1，系統會主動阻擋匯入。
2. **無效選項名稱**：若寫了 `SHOW IF Q1 equals 根本沒有的選項`，系統會明確提示 `第 X 列 [題目代碼]：選項不存在`。
3. **依賴未定義題目**：若依賴不存在的代碼（如 `SHOW IF Q99 equals ...`），會被系統攔截。

---

## 🔍 常見錯誤碼（節錄）

| 錯誤碼 | 意義 |
|--------|------|
| `FILE_EXTENSION_INVALID` | 檔案副檔名不是 `.xlsx` |
| `FILE_SIGNATURE_INVALID` | 檔案內容不是合法 Excel（可能被竄改副檔名偽裝） |
| `FILE_TOO_LARGE` | 檔案超過大小上限（5MB） |
| `ROW_LIMIT_EXCEEDED` | 列數超過上限（questions > 500 列或 choices > 5000 列） |
| `SHEET_LIMIT_EXCEEDED` | 工作表數量過多（> 20 個） |
| `CELL_TOO_LONG` | 單一儲存格文字過長（> 5000 字元） |
| `SHEET_MISSING` | 缺少 `questions` 等必要工作表 |
| `REQUIRED_FIELD_EMPTY` | 必填欄位空白（如 code, title, label 等） |
| `DUPLICATE_QUESTION_CODE` | 題目 `code` 代碼重複 |
| `INVALID_QUESTION_TYPE` | 題型不在 6 種允許清單內 |
| `QUESTION_NOT_FOUND` | `choices` 選項指向不存在的題目代碼 |
| `BRANCHING_CYCLE` | 題目跳題規則存在循環相依 |
| `INVALID_VISIBILITY_RULE` | 跳題規則語法或引用的標籤錯誤 |

更完整的技術規格與架構說明請參閱：[docs/EXCEL_IMPORT_PHASE_SUMMARY.md](docs/EXCEL_IMPORT_PHASE_SUMMARY.md)

---

## 實體範例預覽

### Sheet 1: `questions`
```csv
order_num,code,title,description,question_type,required,scoring_enabled,reverse_score,visibility_rules,visibility_hint,min_selections,max_selections,min_value,max_value
1,Q1,您對本產品滿意度？,單選計分題,single_choice,TRUE,TRUE,FALSE,,,,,
2,Q1_FEEDBACK,請說明不滿意的原因？,條件跳題追問,text,TRUE,FALSE,FALSE,SHOW IF Q1 in [非常不滿意, 不太滿意],依據您前面的回答，請補充說明：,,,,
3,Q2,每週使用幾次？,數值範圍限制 0~100 次,number,FALSE,FALSE,FALSE,,,,,,0,100
4,Q3,感興趣的功能模組？,複選限選 1~2 項,multiple_choice,TRUE,TRUE,FALSE,,,1,2,,
5,Q4,您由何管道得知本系統？,其他需填文字,single_choice,TRUE,FALSE,FALSE,,,,,,
```

### Sheet 2: `choices`
```csv
question_code,order_num,label,value,score_enabled,score,is_other,requires_text,is_none_of_above
Q1,1,非常不滿意,very_dissatisfied,TRUE,1,FALSE,FALSE,FALSE
Q1,2,不太滿意,dissatisfied,TRUE,2,FALSE,FALSE,FALSE
Q1,3,滿意,satisfied,TRUE,3,FALSE,FALSE,FALSE
Q1,4,非常滿意,very_satisfied,TRUE,4,FALSE,FALSE,FALSE
Q3,1,即時協同編輯 (+2分),realtime_collab,TRUE,2,FALSE,FALSE,FALSE
Q3,2,自動化工作流 (+3分),automation,TRUE,3,FALSE,FALSE,FALSE
Q3,3,進階統計報表 (+5分),advanced_stats,TRUE,5,FALSE,FALSE,FALSE
Q4,1,Google 搜尋,search_engine,FALSE,,FALSE,FALSE,FALSE
Q4,2,朋友推薦,friend,FALSE,,FALSE,FALSE,FALSE
Q4,3,其他管道 (請註明),other,FALSE,,TRUE,TRUE,FALSE
```
