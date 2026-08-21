# Excel 匯入功能強化成果彙整

> 對應專案：https://github.com/Jake627520/questions  
> 測試頁：https://questions-chi-opal.vercel.app/surveys/import  
> 彙整日期：2026-08-21

---

## 1. 目標回顧

在不破壞既有問卷引擎與 80+ 測試的前提下，完成：

- 前後端分層驗證
- 標準化錯誤結構與錯誤碼
- 匯入前使用者可理解的規則說明
- 基本檔案安全檢查（Magic Bytes）
- 匯入操作防呆（預設草稿、發布二次確認）

---

## 2. 已完成項目清單

### Phase 1：基礎型別與前端驗證
- [x] `src/types/surveyImport.ts`：`ValidationIssue`、`ImportResponse`、錯誤碼型別
- [x] `src/lib/validateSurveyExcel.ts`：前端輕量驗證（副檔名、大小、Sheet、必填、重複 code、關聯）
- [x] 前端驗證單元測試
- [x] 接入 `/surveys/import` 頁面，選檔即時驗證

### Phase 2：後端 API 標準化
- [x] `excel-parser.ts` 雙回傳（舊 `errors: string[]` + 新 `issues: ValidationIssue[]`）
- [x] `/api/surveys/import` 回傳標準 `ImportResponse`
- [x] 前端相容新舊錯誤格式

### UX 強化
- [x] 可收合「題庫製作注意事項」
- [x] 預設狀態改為 `DRAFT`
- [x] `PUBLISHED` 二次確認（顯示題數／選項數）
- [x] 錯誤清單篩選（全部／錯誤／警告）
- [x] 結構化錯誤顯示（Sheet、列號、錯誤碼）
- [x] AbortController 取消重複驗證，避免競態

### 安全
- [x] OOXML Magic Bytes 檢查（`PK\x03\x04`）
- [x] 對應錯誤碼 `FILE_SIGNATURE_INVALID`
- [x] 後端檔案大小上限（5MB）
- [x] questions / choices 列數上限（500 / 5000）
- [x] 工作表數、單一儲存格長度上限（20 工作表 / 5000 字元）
- [x] 相關單元測試

### Phase M6C：Excel Import UX & Safety（企業級強化）
- [x] `ValidationIssue` 擴充 `suggestion` 欄位，提供具體、可操作的修復建議
- [x] 錯誤診斷 UI 預設上限 50 筆，支援摺疊／展開切換，防止超大錯誤量卡頓
- [x] Dry Run / 預覽指標儀表板（題數、選項數、必填題、計分題、跳題數、合規清單）
- [x] 預覽階段保證零資料庫寫入（No DB write on preview）
- [x] All-or-Nothing 原子性交易保護（Prisma Interactive Transaction），失敗 100% Rollback
- [x] 使用者內容與版權確認方塊（未確認阻擋匯入，防止法律爭議）
- [x] Excel Formula Injection 公式防護（`=, +, -, @` 開頭內容安全讀取為純文字）
- [x] 匯入成功摘要頁面（提供 Import ID、統計數據、填答與報表直達按鈕）
- [x] 生產環境錯誤回應脫敏（隱藏伺服器路徑與 DB 連線字串，提供專屬錯誤 ID）
- [x] M6-C 整合測試套件 `test/m6c-excel-safety.test.ts`（8/8 通過）

### 品質
- [x] `npm run typecheck` / `lint` / `test` / `build` 全過
- [x] 測試數提升至 92 / 92 PASS（22 個測試套件全數通過）

---

## 3. 目前驗證流程（使用者視角）

```text
選擇 Excel
      ↓
檔案驗證（副檔名、大小 5MB、Magic Bytes 簽章）
      ↓
Excel Parsing & Formula Injection 防護
      ↓
Schema & Business Rule Validation（必填、唯一代碼、關聯、無循環跳題）
      ↓
      ┌──────────────┐
      │              │
     FAIL           PASS
      │              │
      ↓              ↓
 錯誤診斷 UI      Dry Run 預覽
 (附修復建議)        ↓
                 版權宣告確認
                     ↓
                 使用者確認匯入 (PUBLISHED 二次防呆)
                     ↓
                 Prisma Transaction 原子寫入
                     ↓
                 匯入成功摘要 (含 Import ID 與直達連結)
```

原則：**前端只做 UX 預檢，後端才是安全、防護與正確性邊界。**

---

## 4. 主要錯誤碼清單

| 錯誤碼 | 說明 | 典型觸發 |
|--------|------|----------|
| `FILE_EXTENSION_INVALID` | 副檔名不支援 | 上傳非 `.xlsx` |
| `FILE_TOO_LARGE` | 超過大小限制 | 檔案 > 5MB（前端/後端） |
| `FILE_SIGNATURE_INVALID` | Magic Bytes 不符 | 改副檔名的假檔案 |
| `FILE_PARSE_FAILED` | 解析失敗 | 損毀或非標準 XLSX |
| `ROW_LIMIT_EXCEEDED` | 列數超過上限 | questions > 500 列或 choices > 5000 列 |
| `SHEET_LIMIT_EXCEEDED` | 工作表數量過多 | 工作表 > 20 個 |
| `CELL_TOO_LONG` | 單一儲存格文字過長 | 儲存格 > 5000 字元 |
| `FORMULA_NOT_ALLOWED` | 偵測到未允許或潛在惡意公式 | 潛在公式注入風險 |
| `COPYRIGHT_NOT_CONFIRMED` | 未確認版權宣告 | 匯入前未勾選版權確認方塊 |
| `SHEET_MISSING` | 缺少必要工作表 | 無 `questions` |
| `HEADER_MISSING_REQUIRED` | 缺少必要欄位 | 無 `code` / `title` 等 |
| `REQUIRED_FIELD_EMPTY` | 必填為空 | code / title / label 等為空 |
| `DUPLICATE_QUESTION_CODE` | 題目代碼重複 | 兩個相同 code |
| `INVALID_QUESTION_TYPE` | 題型不合法 | 非六種允許值 |
| `QUESTION_NOT_FOUND` | 選項指向不存在題目 | choices.question_code 無效 |
| `DUPLICATE_CHOICE_VALUE` | 同題選項 value 重複 | （後端結構檢核） |
| `BRANCHING_CYCLE` | 跳題循環相依 | （後端結構檢核） |
| `INVALID_VISIBILITY_RULE` | 條件語法／引用問題 | （後端結構檢核） |
| `DATABASE_IMPORT_FAILED` | 寫入失敗 | DB / transaction 錯誤 |

> 前後端統一使用標準 `code`，支援錯誤定位與修復建議。

---

## 5. 關鍵檔案對照

| 檔案 | 用途 |
|------|------|
| `src/types/surveyImport.ts` | 共用型別、錯誤碼、ValidationIssue、ImportResponse、ImportSummary |
| `src/lib/validateSurveyExcel.ts` | 前端輕量驗證與即時診斷建議 |
| `src/lib/excel-parser.ts` | 後端解析 + Magic Bytes + 資源上限 + Formula 防護 + issues |
| `src/app/api/surveys/import/route.ts` | 匯入 API、Dry Run 預覽、版權校驗、Prisma Transaction 寫入、錯誤脫敏 |
| `src/app/surveys/import/page.tsx` | 匯入 UI、規則說明、50筆問題篩選與建議、版權確認、Dry Run 預覽、成功摘要畫面 |
| `EXCEL_IMPORT_SOP.md` | 使用者向欄位規格與作業指引 |
| `test/validate-survey-excel.test.ts` | 前端驗證單元測試 |
| `test/excel-parser.test.ts` | 解析 + Magic Bytes + 大小上限測試 |
| `test/m6c-excel-safety.test.ts` | M6C 專屬安全、Formula 防護、版權校驗與 Transaction 回滾測試 |

---

## 6. 設計原則（之後改動請遵守）

1. **前端驗證 ≠ 安全邊界**，後端必須完整重驗證。
2. API 以 `multipart/form-data` 收原始檔，不信任前端 JSON 為唯一來源。
3. 錯誤使用穩定 `code` + 人類可讀 `message` + 具體可操作的 `suggestion`。
4. 驗證失敗或中途錯誤不得寫入任何殘缺資料（Prisma Transaction Rollback）。
5. 預設偏向安全：`DRAFT` 預設、發布需二次確認、版權必須手動勾選。
6. 不執行 Excel formula；公式視為純文字資料。
7. 生產環境錯誤回應嚴格脫敏，絕不洩漏系統內部路徑與 DB 帳密。

---

## 7. 建議後續 Roadmap

### 短期（已完成）
- [x] 更新 `EXCEL_IMPORT_SOP.md`：補前端驗證、錯誤碼、Magic Bytes、後端上限與版權說明
- [x] 後端統一檔案大小、列數、儲存格長度上限
- [x] 提供結構化錯誤修復建議與 50 筆分頁折疊
- [x] 成功匯入摘要與導覽頁面
- [x] All-or-Nothing 原子性交易保護

### 中期
- [ ] 範本加入 instructions 工作表與 data validation 下拉選單
- [ ] 大量錯誤時提供「下載錯誤診斷報告 (CSV/XLSX)」

### 長期（視產品需求）
- [ ] 結合 M6B Organization 權限與 RBAC 匯入管控
- [ ] Rate limit 頻率限制
- [ ] Audit log 匯入歷史稽核紀錄

---

## 8. 驗證指令（回歸用）

```bash
npm run typecheck
npm run lint
npx vitest run test/m6c-excel-safety.test.ts
npm test
npm run build
```

---

## 9. 結論

Phase M6C 已達成全部目標：
- 使用者上傳前即可看到明確格式指引與資源限制
- 錯誤時提供「哪裡錯、為什麼錯、怎麼修」的診斷體驗
- Dry Run 預覽保證零 DB 污染
- 版權確認與公式注入防護健全
- 原子交易確保資料一致性與零殘缺寫入
- 92 項自動化測試全數通過，生產環境建置成功！
