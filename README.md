# Survey System MVP

一個以「原始答案」為核心的問卷系統，而非考試系統。

**目前版本：v0.2.0 (Production Readiness Preview)**  
**專案狀態：Active / Open Source**

---

## 專案定位
- **題型、答案、計分三者完全分離**
- **原始答案是核心資料，計分只是可選功能**
- **`score = null`（不計分）與 `score = 0`（零分）嚴格區分**
- **支援條件跳題、草稿暫存、問卷版本控制、發布鎖定防呆**

---

## ✨ 核心優勢與產品特色

1. **🥇 靈活多樣的計分引擎（非死板考試系統）**
   - 嚴格區分「0 分（計入分母）」與「不計分（NULL，不稀釋分母）」。
   - 支援非線性特殊給分（例如：特定專家級選項直接給予 10 分跳躍獎勵）。
   - 負向題目自動反向計分（如 1~5 分自動反轉為 5~1 分）。
   - 條件隱藏題目自動豁免必填，且**絕不計入總分、滿分與統計分母**。
2. **📊 Excel 雙向批量維護、企業級稽核與安全（1 秒發布大型問卷）**
   - 告別網頁上一題一題手動新增的繁瑣操作，直接使用 Excel 批量編輯題目與選項，1 秒拖曳匯入立即生成問卷（詳見 [Excel 題庫製作 SOP](./EXCEL_IMPORT_SOP.md)）。
   - **前後端雙重診斷與修復建議**：格式有誤時精確指出 `工作表! 第 X 列 (欄位名)`、目前值與 `💡 建議修復方式`。
   - **全生命週期稽核中心 (Audit & History)**：支援 `/surveys/import/history` 歷史紀錄追蹤、多租戶組織隔離、單筆詳情檢視與一鍵下載 CSV 錯誤診斷報告。
   - **Dry Run 預覽與成功摘要**：匯入前提供即時預覽與合規指標，匯入後產出具唯一約束之正式 `Import ID`（`IMP-YYYYMMDD-XXXXXX`）與統計數據。
   - **All-or-Nothing 原子交易**：Prisma Transaction 保證問卷建立與 `SurveyImport` 稽核寫入 100% 同步，失敗全數 Rollback，零殘缺資料污染。
   - **隱私與安全防護機制**：系統預設不永久保存使用者原始 Excel 二進位檔案，內建 OOXML Magic Bytes 簽章校驗、Formula Injection 公式執行防護、5MB/500列/5000列資源限制與版權確認保護。
3. **🧠 直覺條件跳題（支援中文選項標籤比對）**
   - 支援自然語言簡寫語法（如 `SHOW IF Q1 in [非常不滿意, 不太滿意]`、`SHOW IF Q5 contains Slack`），非工程人員也能輕鬆設定邏輯。
   - 內建拓撲圖檢測演算法，主動攔截與防護「循環相依（A依賴B，B依賴A）」之死循環。
4. **🔒 100% 本地優先與資料隱私（Local-First & Self-Hosted）**
   - 0 外部 API 依賴、0 雲端洩漏風險、0 訂閱費用。
   - 機密問卷、考核評估與敏感填答紀錄完全存放在您本機的 PostgreSQL 資料庫中。
   - 內建匿名問卷策略（`is_anonymous` 預設開啟），絕不私自記錄使用者身分。
5. **🛡️ 嚴謹的業務防呆與資料正規化**
   - 複選題採用 `AnswerChoice` 正規化關聯模型，兼具原始答案儲存與高效率查詢。
   - 問卷發布保護鎖（Published Lock）：已發布問卷禁止直接竄改題目，修改時強制複製為新版本（`version + 1`）。
   - 「以上皆非」嚴格互斥防呆，禁止與其他選項同時勾選。
   - 「其他」選項自動展開輸入框，支援強制要求填寫文字。
   - 支援填答者中途隨時「暫存進度」，透過專屬連結隨時無縫恢復作答。
6. **🧪 100+ 項自動化測試保證極致穩定**
   - 包含 Excel 雙向 Round-trip 零損保真度測試、確定性統計測試、M6-B 組織模型測試、M6-C 安全與原子交易測試與 M6-D 稽核歷史與隔離測試（100/100 全數通過）。

---

## 🔒 本地優先與資料隱私（Local-First & Self-Hosted）
- **100% 本地獨立運行**：本系統預設完全在使用者本機（`localhost`）運行，支援離線環境操作，不依賴任何外部雲端服務。
- **資料隱私絕對安全**：所有問卷題目、填答者答案、草稿進度、計分結果及 Excel 報表均存儲於您本地的 PostgreSQL 資料庫中，資料絕不外流。
- **區域網路（LAN / Wi-Fi）協同填答**：只需於啟動時加上 `-H 0.0.0.0` 參數，即可讓相同 Wi-Fi 網路內的手機、平板或同事電腦連線填答，所有資料依然直接匯整於您的本機電腦。

---

## 🚫 已知限制與刻意不做範圍 (Known Limitations)
為了維持核心問卷引擎的精準、輕量與高可靠度，本專案目前刻意不內建以下功能：
- 登入、註冊與 Google OAuth 帳號系統
- 多租戶（Multi-tenancy）與 SaaS 計費模組
- 複雜拖拉視覺化編輯器（直接以 Excel 批量編輯效率更高）
- 自動發送 Email / 簡訊 / 產出 QR Code / AI 自動分析總結

---

## 🛠️ 技術棧
- **框架**：Next.js 14 (App Router) + TypeScript
- **資料庫與 ORM**：PostgreSQL + Prisma ORM
- **試算表處理**：ExcelJS
- **資料驗證**：Zod
- **測試工具**：Vitest
- **容器化**：Docker & Docker Compose

---

## 🚀 快速開始

### 方式 A：使用本地 Node.js 運行

#### 1. 下載專案並安裝相依套件
```bash
git clone https://github.com/Jake627520/questions.git
cd questions
npm install
```

#### 2. 設定環境變數與資料庫
複製環境變數範本並設定本地 PostgreSQL 連線字串：
```bash
cp .env.example .env
```
在 `.env` 中確認本機連線資訊：
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/survey_db?schema=public"
```

套用資料庫模型：
```bash
npx prisma db push
```

#### 3. 載入示範資料（可選）
```bash
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
```

#### 4. 啟動本機伺服器
```bash
# 僅本機電腦訪問
npm run dev

# 或是允許同 Wi-Fi / 區域網路內其他裝置（手機/同事電腦）訪問：
npm run dev -- -H 0.0.0.0
```
開啟瀏覽器訪問：`http://localhost:3000`

---

### 方式 B：使用 Docker Compose 一鍵啟動 (推薦)

本專案提供 Production Multi-stage Dockerfile 與具備 Healthcheck 的 `docker-compose.yml`：

```bash
# 一鍵建立並啟動 PostgreSQL 與問卷系統
docker compose up -d
```
啟動完成後，直接於瀏覽器訪問 `http://localhost:3000` 即可使用！

---

## 🧪 執行自動化測試與代碼檢查

```bash
# 執行型別檢查
npm run typecheck

# 執行程式碼 Lint
npm run lint

# 執行全套 Vitest 測試（包含 Round-trip 與統計測試）
npm test

# 執行生產建置
npm run build
```

---

## 📚 相關文件
- [Excel 題庫製作 SOP (EXCEL_IMPORT_SOP.md)](./EXCEL_IMPORT_SOP.md)
- [響應式多裝置 UAT 檢核清單 (UAT_RESPONSIVE_CHECKLIST.md)](./UAT_RESPONSIVE_CHECKLIST.md)
- [開發與貢獻指南 (CONTRIBUTING.md)](./CONTRIBUTING.md)
- [版本更新記錄 (CHANGELOG.md)](./CHANGELOG.md)

---

## 📜 授權與問卷內容版權宣告 (Copyright & Content Notice)

1. **程式碼授權**：本專案程式碼採 [MIT License](./LICENSE)。
2. **問卷內容版權聲明**：
   - **MIT License 僅適用於本專案程式碼本身**，不代表使用者匯入的問卷題目、量表、題庫、圖片、文字或其他內容均可自由使用。
   - 使用第三方問卷、心理量表、學術研究量表、商業題庫或其他受版權保護之內容前，**使用者必須自行確認其合法授權條件**。
   - 專案內建之示範題庫（`demo-survey.xlsx` 及 `demo-complex-survey.xlsx`）均為原創建立之測試內容。

---

## ⚠️ 免責聲明
本軟體按「現況」提供，不提供任何明示或暗示的保證。目前為預覽版本（v0.1.0），使用者需自行承擔使用風險。
