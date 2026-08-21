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
- [x] 相關單元測試

### 品質
- [x] `npm run typecheck` / `lint` / `test` / `build` 全過
- [x] 測試數由約 77 → 83（視最終 commit 為準）

---

## 3. 目前驗證流程（使用者視角）

1. 進入 `/surveys/import`
2. 可展開「題庫製作注意事項」先了解規則
3. 下載示範範本（建議）
4. 選擇／拖曳 `.xlsx`
5. **前端立即驗證**（副檔名、大小、Sheet、必填、重複、關聯）
6. 顯示通過／錯誤／警告，可篩選
7. 可再按「解析題庫預覽」→ 後端完整解析
8. 確認匯入：
   - `DRAFT`：直接建立
   - `PUBLISHED`：二次確認後建立
9. 後端再次檢查：Magic Bytes → 結構 → 商業規則 → Transaction 寫入

原則：**前端只做 UX 預檢，後端才是安全與正確性邊界。**

---

## 4. 主要錯誤碼清單

| 錯誤碼 | 說明 | 典型觸發 |
|--------|------|----------|
| `FILE_EXTENSION_INVALID` | 副檔名不支援 | 上傳非 `.xlsx` |
| `FILE_TOO_LARGE` | 超過大小限制 | 檔案 > 5MB（前端） |
| `FILE_SIGNATURE_INVALID` | Magic Bytes 不符 | 改副檔名的假檔案 |
| `FILE_PARSE_FAILED` | 解析失敗 | 損毀或非標準 XLSX |
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

> 前後端應盡量使用同一組 `code`，方便篩選與日後 i18n。

---

## 5. 關鍵檔案對照

| 檔案 | 用途 |
|------|------|
| `src/types/surveyImport.ts` | 共用型別、錯誤碼、ImportResponse |
| `src/lib/validateSurveyExcel.ts` | 前端輕量驗證 |
| `src/lib/excel-parser.ts` | 後端解析 + Magic Bytes + issues |
| `src/app/api/surveys/import/route.ts` | 匯入 API、標準回應、簽章攔截 |
| `src/app/surveys/import/page.tsx` | 匯入 UI、說明、篩選、確認、AbortController |
| `EXCEL_IMPORT_SOP.md` | 使用者向欄位規格（可再同步更新） |
| `test/validate-survey-excel.test.ts` | 前端驗證測試 |
| `test/excel-parser.test.ts` | 解析 + Magic Bytes 測試 |

---

## 6. 設計原則（之後改動請遵守）

1. **前端驗證 ≠ 安全邊界**，後端必須重驗證。
2. API 以 `multipart/form-data` 收原始檔，不信任前端 JSON 為唯一來源。
3. 錯誤使用穩定 `code` + 人類可讀 `message`。
4. 驗證失敗不得寫入任何題目／選項（transaction）。
5. 預設偏向安全：`DRAFT`、發布需確認。
6. 不執行 Excel formula；公式視為不可信輸入。

---

## 7. 建議後續 Roadmap

### 短期（可選）
- [ ] 更新 `EXCEL_IMPORT_SOP.md`：補前端驗證、錯誤碼、Magic Bytes 說明
- [ ] 後端統一檔案大小、列數、儲存格長度上限
- [ ] 大量錯誤時提供「下載錯誤報告」

### 中期
- [ ] 補齊循環相依／孤立題等商業規則的單元測試覆蓋
- [ ] 預覽改為表格化（code、type、必填、選項數、visibility）
- [ ] 範本加入 instructions 工作表與 data validation

### 長期（視產品需求）
- [ ] Auth / 權限
- [ ] Rate limit
- [ ] Audit log
- [ ] 匯入紀錄（importId）可追蹤

---

## 8. 驗證指令（回歸用）

```bash
npm run typecheck
npm run lint
npx vitest run test/validate-survey-excel.test.ts
npx vitest run test/excel-parser.test.ts
npm test
npm run build
```

手動重點：
- 正確 demo-survey.xlsx 可預覽與匯入
- 假 `.xlsx`（改副檔名）被 `FILE_SIGNATURE_INVALID` 擋下
- PUBLISHED 有二次確認
- 錯誤篩選與說明區塊正常

---

## 9. 結論

Excel 匯入已從「能用」提升到「可維護、可防呆、有基本安全」的狀態：

- 使用者上傳前就知道規則
- 前後端雙重驗證與一致錯誤結構
- 檔案簽章檢查降低偽裝風險
- 發布路徑有確認，預設較安全

後續可依 Roadmap 逐步加深安全與文件，無需一次大改。
