# Survey System MVP

一個以「原始答案」為核心的問卷系統，而非考試系統。

**目前版本：v0.1.0 (Preview)**

---

## 專案定位
- **題型、答案、計分三者完全分離**
- **原始答案是核心資料，計分只是可選功能**
- **`score = null`（不計分）與 `score = 0`（零分）嚴格區分**
- **支援條件跳題、草稿暫存、問卷版本控制**

---

## 🔒 本地優先與資料隱私（Local-First & Self-Hosted）
- **100% 本地獨立運行**：本系統預設完全在使用者本機（`localhost`）運行，支援離線環境操作，不依賴任何外部雲端服務。
- **資料隱私絕對安全**：所有問卷題目、填答者答案、草稿進度、計分結果及 Excel 報表均存儲於您本地的 PostgreSQL 資料庫中，資料絕不外流。
- **區域網路（LAN / Wi-Fi）協同填答**：只需於啟動時加上 `-H 0.0.0.0` 參數，即可讓相同 Wi-Fi 網路內的手機、平板或同事電腦連線填答，所有資料依然直接匯整於您的本機電腦。

---

## 目前已支援功能
- **Excel 雙 Sheet 匯入 / 匯出**：標準 `questions` 與 `choices` 工作表解析與報表匯出
- **完整題型支援**：單選 (`single_choice`)、複選 (`multiple_choice`)、問答 (`text`)、數字 (`number`)、是非 (`yes_no`)、說明文字 (`info`)
- **特殊選項機制**：
  - 「其他」（`is_other` + `requires_text`）：必須填寫補充文字
  - 「以上皆非」（`is_none_of_above`）：與其他選項嚴格互斥
- **多元計分規則**：
  - 題目可自選啟用/停用計分（`scoring_enabled`）
  - 特殊分數設定（支援非線性分值）
  - 負向題目反向計分（`reverse_score`）
- **條件跳題邏輯**：
  - 支援直覺簡寫語法（如 `SHOW IF Q1 in [非常不滿意, 不太滿意]`、`SHOW IF Q5 contains Slack`、`HIDE IF ...`）
  - 同時支援選項代碼（`value`）與選項中文標籤（`label`）智慧比對
  - 條件題目顯現時支援提示文字（`visibility_hint`）
- **循環相依檢測**：拓撲有向圖循環檢測，匯入時主動攔截環狀依賴
- **草稿暫存與恢復**：支援中途保存進度（`IN_PROGRESS`），以 `?responseId=...` 無縫恢復作答
- **回覆名單與草稿管理**：支援回覆列表篩選、草稿刪除，正式回覆（`COMPLETED`）防誤刪保護
- **問卷版本複製**：一鍵複製新版本（`version + 1`），歷史回覆隔離保護
- **即時統計分析**：跳題隱藏之題目精確排除在分母之外
- **自動化測試覆蓋**：累計 56 項自動化測試全數通過 (100% PASS)

---

## 尚未支援（刻意不做）
- 登入與權限系統
- 多租戶
- 雲端部署方案
- 視覺化規則編輯器
- Email / QR Code / 多語言 / AI 分析

---

## 技術棧
- **框架**：Next.js 14 (App Router) + TypeScript
- **資料庫與 ORM**：PostgreSQL + Prisma ORM
- **試算表處理**：ExcelJS
- **資料驗證**：Zod
- **測試工具**：Vitest

---

## 快速開始（本地運行）

### 1. 下載專案並安裝相依套件
```bash
git clone https://github.com/Jake627520/questions.git
cd questions
npm install
```

### 2. 設定環境變數與資料庫
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

### 3. 載入示範資料（可選）
```bash
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
```

### 4. 啟動本機伺服器
```bash
# 僅本機電腦訪問
npm run dev

# 或是允許同 Wi-Fi / 區域網路內其他裝置（手機/同事電腦）訪問：
npm run dev -- -H 0.0.0.0
```
開啟瀏覽器訪問：`http://localhost:3000`

### 5. 執行自動化測試
```bash
npm test
```

---

## 授權
本專案採用 [MIT License](./LICENSE)。

---

## 免責聲明
本軟體按「現況」提供，不提供任何明示或暗示的保證。目前為早期預覽版本（v0.1.0），不建議直接用於正式生產環境。
