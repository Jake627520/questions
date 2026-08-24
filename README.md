# Survey System & Analytics Engine (企業級問卷調查與統計分析系統)

[![CI](https://github.com/Jake627520/questions/actions/workflows/ci.yml/badge.svg)](https://github.com/Jake627520/questions/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Release](https://img.shields.io/badge/Release-analytics--v1.0.0-emerald.svg)](https://github.com/Jake627520/questions/releases/tag/analytics-v1.0.0)
[![Test Suites](https://img.shields.io/badge/Tests-500%2F500%20PASS-success.svg)](https://github.com/Jake627520/questions)

專為企業、研究機構與組織設計的高可靠度問卷調查、生命週期治理與統計分析系統。

- **線上正式環境**：[https://questions-survey-system1.vercel.app/](https://questions-survey-system1.vercel.app/)
- **目前版本**：`v1.0.0`
- **核心定位**：以「原始答案 (Raw Answers)」為核心資產，結合「純函數統計分析引擎」與「嚴格隱私抑制（$k=5$ Anonymity）」，實現填答、治理與分析全鏈路閉環。

---

## 系統架構總覽

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Presentation Layer                              │
│  ┌───────────────────────┬──────────────────────┬────────────────────┐ │
│  │ Web Dashboard/Heatmap │ REST API (/crosstab) │ Multi-Sheet Excel  │ │
│  └───────────┬───────────┴──────────┬───────────┴──────────┬─────────┘ │
└──────────────┼──────────────────────┼──────────────────────┼───────────┘
               │                      │                      │
               ▼                      ▼                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Frozen Contract: ProtectedCrossTabResult                 │
├────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              Privacy & Cell Suppression Engine (F.3)             │  │
│  │   • Primary Suppression (k < 5)  • Secondary/Complementary       │  │
│  │   • Multi-Filter Attack Defense  • Multi-Format Zero Leakage     │  │
│  └──────────────────────────────────▲───────────────────────────────┘  │
│                                     │                                  │
│  ┌──────────────────────────────────┴───────────────────────────────┐  │
│  │              Statistical Inference Engine (F.2)                  │  │
│  │   • Pearson Chi-square (χ²)      • Degrees of Freedom (df)       │  │
│  │   • p-value (Chi-square CDF)     • Cramér's V Effect Size        │  │
│  └──────────────────────────────────▲───────────────────────────────┘  │
│                                     │                                  │
│  ┌──────────────────────────────────┴───────────────────────────────┐  │
│  │              2-Way Cross-tabulation Core Engine (F.1)            │  │
│  │   • Pure Function Matrix Aggregation                             │  │
│  │   • Multiple-Choice & Single-Choice Normalization                │  │
│  │   • Exact Denominator & Percentage Distribution Calculation      │  │
│  └──────────────────────────────────▲───────────────────────────────┘  │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │
┌─────────────────────────────────────┴──────────────────────────────────┐
│             Domain Governance & Multi-Tenant Data Layer                │
│  ┌──────────────────────┬──────────────────────┬────────────────────┐  │
│  │  Survey Lifecycle    │ Tenant Isolation &   │ Normalized Schema  │  │
│  │  (DRAFT/PUB/CLS/ARC) │ RBAC (4-Tier Roles)  │ & Version Lineage  │  │
│  └──────────────────────┴──────────────────────┴────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 核心模組與功能規範

### 1. 統計分析與隱私保護引擎 (Analytics Engine v1.0.0)
- **純函數無狀態運算 (Stateless Pure Function)**：
  - 輸入：列題目定義、欄題目定義、作答資料陣列。
  - 輸出：確定性雙向列聯表矩陣、邊際總和（Row/Column Marginals）與總計（Grand Total）。
- **雙變量統計推論 (Bivariate Statistical Testing)**：
  - **皮爾森卡方獨立性檢定 (Pearson $\chi^2$ Test of Independence)**：
    $$\chi^2 = \sum \frac{(O_{ij} - E_{ij})^2}{E_{ij}}, \quad E_{ij} = \frac{R_i \times C_j}{N}$$
  - **自由度與 p-value**：$df = (r - 1)(c - 1)$，採用高精度 Lanczos 伽瑪近似與不完全伽瑪函數計算卡方分佈累積機率。
  - **Cramér's V 關聯效應值**：
    $$V = \sqrt{\frac{\chi^2}{N \times \min(r - 1, c - 1)}}$$
- **$k$-匿名性與差分隱私防護 ($k$-Anonymity Cell Suppression)**：
  - **一級抑制 (Primary Suppression)**：細格次數 $0 < n < 5$ 時自動遮蔽為 `null`（標記 `isSuppressed: true`）。
  - **二級/互補抑制 (Secondary/Complementary Suppression)**：若單列或單行僅有 1 個被抑制細格，系統自動遮蔽該列/行的次小細格，防止攻擊者透過邊際總和反推真實次數。
  - **防範差分攻擊 (Differencing Attack Resistance)**：已通過多維度篩選、滑動時間窗口與聯立線性方程求解之抗逆推驗證。
- **跨端呈現一致性 (Cross-Presentation Consistency)**：
  - 統一以 `ProtectedCrossTabResult` DTO 輸出至 Web 互動熱圖、REST API 及 Excel 匯出檔，確保三端數值與遮蔽狀態完全一致。

### 2. 問卷生命週期狀態機與版本邊界 (Survey Lifecycle & Version Boundary)
- **四態生命週期模型**：
  - `DRAFT` (草稿)：編輯題目與邏輯，可執行發布前檢驗清單。
  - `PUBLISHED` (開放收集)：正式對外提供高熵 `publicToken` 填答連結，啟用發布保護鎖。
  - `CLOSED` (停止收集)：停止接收新作答，維持數據唯讀與分析功能。
  - `ARCHIVED` (歷史封存)：唯讀封存，防止誤操作並支援受控還原。
- **發布保護鎖 (Published Survey Lock)**：
  - 問卷一旦發布，禁止原地修改題目結構、選項或計分規則。
  - 修改需求必須透過「建立新版本 (Clone Version)」，衍生為 `v(N+1)` 獨立問卷。各版本 Responses 完全隔離，確保歷史分析結果可重現。
- **動態收集守衛 (Collection Eligibility Guard)**：
  - 支援 `startDate` (開始時間)、`endDate` (截止時間) 與 `responseQuota` (配額上限) 即時驗證與自動阻絕。

### 3. 多租戶組織架構與企業級權限 (Multi-Tenant & RBAC)
- **租戶完全隔離 (Tenant Boundary)**：
  - 所有問卷、題目、匯入日誌與作答數據均嚴格綁定 `organizationId`，徹底杜絕跨租戶存取與 IDOR 漏洞。
- **4 級角色權限 (RBAC)**：
  - `OWNER`：組織擁有者，具備成員管理、計費與最高管理權限。
  - `ADMIN`：組織管理員，可管理問卷、成員邀請與組織設定。
  - `EDITOR`：問卷編輯者，可建立、編輯、發布問卷與匯出分析報表。
  - `VIEWER`：唯讀檢視者，僅可檢視問卷列表與分析看板。
- **安全基礎設施**：
  - CSPRNG 高熵 Session Token，HttpOnly/Secure/SameSite Cookie 儲存。
  - `crypto.scrypt` 加上獨立 16-byte Salt 雜湊，時序安全比較 (`timingSafeEqual`)。
  - 安全邀請連結與密碼重設 Token（SHA-256 雜湊儲存、過期與單次使用保護）。

### 4. Excel 雙向題庫維護與原子稽核 (Excel Import & Audit)
- **結構化雙 Sheet 格式**：透過 `questions` 與 `choices` 工作表批量維護題型、必填、條件跳題與選項分數。
- **資安防護**：
  - OOXML Magic Bytes (`50 4B 03 04`) 檔案簽章校驗。
  - CSV / Formula Injection 公式注入自動轉義（阻絕 `=`, `+`, `-`, `@` 惡意指令）。
- **All-or-Nothing 原子交易**：使用 Prisma Transaction，問卷生成與 `SurveyImport` 稽核日誌同步寫入，失敗全數 Rollback。
- **匯入歷史追蹤 (Import Audit)**：提供獨立稽核代碼（`IMP-YYYYMMDD-XXXXXX`），支援下載錯誤診斷報告。

---

## 題型與進階填答支援

| 題型代碼 | 說明 | 支援特性 |
|---|---|---|
| `single_choice` | 單選題 | 支援「其他（自填文字）」、「反向計分」、自訂分數 |
| `multiple_choice` | 複選題 | 支援「以上皆非（互斥防呆）」、`min_selections` / `max_selections` 數量限制 |
| `text` | 簡答 / 簡述題 | 支援必填驗證、文字長度限制 |
| `number` | 數值題 | 支援 `min_value` / `max_value` 範圍檢核、描述統計分析 |
| `yes_no` | 是非題 | 二元決策題目 |
| `info` | 說明文字塊 | 無需作答之段落提示與章節引言 |

- **直覺條件跳題語法**：支援中文選項比對（如 `SHOW IF Q1 in [滿意, 非常滿意]`、`HIDE IF Q2 = 否`），內建拓撲圖檢測演算法防範循環相依。
- **草稿暫存與恢復**：填答者可中途暫存作答進度，透過專屬 Token 隨時跨裝置接續填寫。

---

## 快速開始

### 環境需求
- Node.js 20.x 或 22.x
- PostgreSQL 14+ (本地或容器化實例)
- npm 10+

### 本地開發建置

1. **複製專案並安裝相依套件**：
   ```bash
   git clone https://github.com/Jake627520/questions.git
   cd questions
   npm ci
   ```

2. **設定環境變數**：
   ```bash
   cp .env.example .env
   ```
   在 `.env` 中設定 PostgreSQL 資料庫連線：
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/survey_db?schema=public"
   ```

3. **執行資料庫遷移與用戶端生成**：
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

4. **載入測試示範資料 (可選)**：
   ```bash
   npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
   ```

5. **啟動本機開發伺服器**：
   ```bash
   npm run dev
   ```
   開啟瀏覽器連線：`http://localhost:3000`

---

## Docker 容器化部署

本專案提供生產環境 Multi-stage `Dockerfile` 與具備健康檢查的 `docker-compose.yml`：

```bash
# 啟動 PostgreSQL 資料庫與 Next.js 應用服務
docker compose up -d

# 查看容器狀態
docker compose ps
```

---

## 自動化測試與代碼驗證

本專案實施高覆蓋率自動化測試，每次變更均經由 GitHub Actions CI 嚴格驗證：

```bash
# 執行 TypeScript 型別檢查
npm run typecheck

# 執行 ESLint 語法與代碼風格檢查
npm run lint

# 執行全套 Vitest 自動化測試 (500 項測試)
npm test

# 執行生產環境編譯建置
npm run build
```

### 測試覆蓋範疇：
- **交叉分析與統計引擎測試**：卡方檢定、Cramér's V、邊際加總、Lanczos 近似。
- **隱私逆推與差分攻擊測試**：$k=5$ 門檻抑制、二級互補抑制、多維度交集逆推防禦。
- **安全迴歸與邊界測試**：Tenant 隔離、RBAC 越權阻絕、IDOR 攻擊模擬、Public Token 邊界。
- **Excel Round-trip 保真度測試**：匯入 ➔ 資料庫 ➔ 匯出 ➔ 二次匯入 100% 零屬性遺失。
- **問卷生命週期與版本隔離測試**：狀態機流轉、前置發布清單、排程配額守衛、版本交叉分析隔離。

---

## 技術棧

- **核心框架**：[Next.js 14](https://nextjs.org/) (App Router, Server Components & Route Handlers)
- **程式語言**：[TypeScript 5.x](https://www.typescriptlang.org/)
- **資料庫與 ORM**：[PostgreSQL](https://www.postgresql.org/) + [Prisma ORM 5.x](https://www.prisma.io/)
- **試算表引擎**：[ExcelJS](https://github.com/exceljs/exceljs)
- **資料驗證**：[Zod](https://zod.dev/)
- **測試框架**：[Vitest](https://vitest.dev/)
- **容器化**：[Docker](https://www.docker.com/) & Docker Compose
- **持續整合**：[GitHub Actions](https://github.com/features/actions)

---

## 相關規範與文件

- [Excel 題庫製作 SOP](./EXCEL_IMPORT_SOP.md)：題庫工作表欄位規格與撰寫範例。
- [多裝置 UAT 檢核清單](./UAT_RESPONSIVE_CHECKLIST.md)：響應式佈局與填答體驗驗收清單。
- [開發與貢獻指南](./CONTRIBUTING.md)：代碼風格、Commit 規範與 PR 流程。
- [版本更新記錄](./CHANGELOG.md)：詳細版本變更履歷。

---

## 授權與版權宣告

1. **程式碼授權**：本專案原始碼採用 [MIT License](./LICENSE) 授權。
2. **問卷內容版權規範**：
   - MIT License 僅適用於本專案程式碼架構。
   - 使用者匯入或建立之問卷題目、量表、商業題庫或學術研究內容，使用者應確保具備合法使用與發布授權。
