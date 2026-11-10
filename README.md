# Survey System & Analytics Engine (企業級問卷調查與統計分析系統)

[![CI](https://github.com/Jake627520/questions/actions/workflows/ci.yml/badge.svg)](https://github.com/Jake627520/questions/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Release](https://img.shields.io/badge/Release-analytics--v1.0.0-emerald.svg)](https://github.com/Jake627520/questions/releases/tag/analytics-v1.0.0)

專為企業、研究機構與組織設計的高可靠度問卷調查、生命週期治理與統計分析系統。

- **線上正式環境**：[https://questions-survey-system1.vercel.app/](https://questions-survey-system1.vercel.app/)
- **套件版本**：`0.2.0`（`package.json`）。變更紀錄最新章節是 `1.0.1`（[CHANGELOG.md](./CHANGELOG.md)）。分析引擎契約標籤是 [`analytics-v1.0.0`](https://github.com/Jake627520/questions/releases/tag/analytics-v1.0.0)。這三個編號沒有對齊，以各來源為準，不要把其中一個當成唯一的「目前版本」。
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
- **$k$-匿名性與小樣本細格抑制 ($k$-Anonymity Cell Suppression)**：預設門檻 $k=5$（`minCellSize`）。這不是差分隱私，不會對次數加噪。
  - **一級抑制 (Primary Suppression)**：細格次數 $0 < n < 5$ 時，`count` 與百分比改為 `null`、`isSuppressed: true`，顯示值為 `<5`。次數為 0 的細格保留真實 0。
  - **二級/互補抑制 (Secondary/Complementary Suppression)**：若單列或單行僅有 1 個被抑制細格，再遮蔽該列/行最小的正數細格（顯示 `—`），防止透過邊際總和反推真實次數。
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
  - CSPRNG 256-bit Session Token 只放在 HttpOnly / Secure（production）/ SameSite=Lax Cookie。資料庫只存該 token 的 SHA-256。部署 `20261110120000_hash_session_tokens` 會清掉既有 session，使用者必須重新登入。
  - `crypto.scrypt` 加上獨立 16-byte Salt 雜湊，時序安全比較 (`timingSafeEqual`)。
  - 安全邀請連結與密碼重設 Token（SHA-256 雜湊儲存、過期與單次使用保護）。
  - 回應標頭：`Content-Security-Policy`、`X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`Referrer-Policy`、`Permissions-Policy`（見 `next.config.mjs`）。Script CSP 保留 `'unsafe-inline'`，以相容 Next 內嵌腳本與主題啟動腳本。

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
- **草稿暫存與恢復**：填答者可中途暫存。公開問卷以 `publicToken` 識別問卷，以 `responseId` 接續同一份 `IN_PROGRESS` 草稿。

---

## 快速開始

### 環境需求
- Node.js 20.x（CI 與 `Dockerfile` 使用 Node 20。本機 Node 22 可以跑這份程式，但不是 CI 鎖定的版本）
- PostgreSQL 15（`docker-compose.yml` 與 CI 都是 `postgres:15-alpine`）
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
   `.env.example` 的 `DATABASE_URL` 與 `docker-compose.yml`、CI 相同：使用者 `postgres`、密碼 `postgrespassword`、資料庫 `survey_db`、埠 `5432`。另外還有：
   - `CRON_SECRET`：`POST /api/cron/cleanup` 沒有這個值會直接 503。
   - `NEXT_PUBLIC_APP_URL`：canonical / Open Graph 的來源。沒設時程式預設為正式站網址。
   - `RESPONSE_IP_HMAC_SECRET`、`TRUSTED_PROXY_HOPS`：選用，說明寫在 `.env.example`。

3. **執行資料庫遷移與用戶端生成**：
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```
   `npm run prisma:migrate` 是 `prisma migrate dev`（開發時產生 migration），不是套用既有 migration 的指令。

4. **載入測試示範資料 (可選)**：
   ```bash
   npm run prisma:seed
   ```
   這會執行 `tsx prisma/seed.ts`，寫入一份示範問卷。它不會建立可登入的使用者。

5. **啟動本機開發伺服器**：
   ```bash
   npm run dev
   ```
   開啟瀏覽器連線：`http://localhost:3000`

---

## Docker 容器化部署

本專案提供生產環境 Multi-stage `Dockerfile` 與具備健康檢查的 `docker-compose.yml`。Postgres 發布在宿主機 `5432`，應用發布在 `3000`。映像檔的啟動指令是 `node server.js`（standalone 輸出），不是 `next start`。Compose 不會自動跑 migration。

```bash
# 啟動 PostgreSQL 與 Next.js 應用服務
docker compose up -d

# 在宿主機套用 migration（密碼與 compose / CI 相同）
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/survey_db?schema=public" npx prisma migrate deploy

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

# 執行全套 Vitest（需要已遷移的 PostgreSQL；案例數以本次輸出為準，文件不寫死）
npm test

# 執行生產環境編譯建置（E2E 的 webServer 會執行 npm start，必須先有 standalone 輸出）
npm run build

# 執行 Playwright 瀏覽器端對端測試 (8 大 Golden Paths 驗收閘門)
# 需要 DATABASE_URL、已 migrate 的資料庫，以及 Chromium
npx playwright install --with-deps chromium
npm run test:e2e
```

### 測試覆蓋範疇：
- **Playwright 瀏覽器 E2E 驗收閘門 (8 大 Golden Paths)**：
  - `E2E-01`：登入認證與多租戶主控台導向。
  - `E2E-02`：問卷生命週期流轉（Excel 匯入 ➔ DRAFT ➔ PUBLISHED ➔ CLOSED ➔ ARCHIVED）。
  - `E2E-03`：公開問卷填答者旅程（高熵 Token 填答 ➔ 暫存草稿 ➔ 狀態恢復 ➔ 提交）。
  - `E2E-04`：問卷版本邊界鎖定與 Clone Version 衍生 v2，作答資料嚴格隔離。
  - `E2E-05`：團隊成員 RBAC 授權與角色動態變更即時反映。
  - `E2E-06`：Viewer 角色特權防護（UI 操作阻絕與 API 403 攔截）。
  - `E2E-07`：雙變量統計交叉分析看板、$k=5$ 匿名細格抑制渲染與 Excel 報表匯出。
  - `E2E-08`：跨租戶瀏覽器隔離與資安迴歸（越權存取阻絕、DOM 與 Network 零資料洩漏）。
- **交叉分析與統計引擎測試**：卡方檢定、Cramér's V、邊際加總、Lanczos 近似。
- **隱私逆推與差分攻擊測試**：$k=5$ 門檻抑制、二級互補抑制、多維度交集逆推防禦。
- **安全迴歸與邊界測試**：Tenant 隔離、RBAC 越權阻絕、IDOR 攻擊模擬、Public Token 邊界。
- **Excel Round-trip 保真度測試**：匯入 ➔ 資料庫 ➔ 匯出 ➔ 二次匯入 100% 零屬性遺失。
- **問卷生命週期與版本隔離測試**：狀態機流轉、前置發布清單、排程配額守衛、版本交叉分析隔離。

---

## 啟動已建置的應用

`next.config.mjs` 設定 `output: "standalone"`。`next start` 會警告它不支援這個輸出，所以 `npm start` 不呼叫 `next start`。

- **Vercel**：平台自己建置與提供服務，不使用 `npm start`，也不執行映像檔裡的 `node server.js`。
- **Docker**：`Dockerfile` 的 `CMD` 是 `node server.js`。standalone 目錄、`public` 與 `.next/static` 在映像檔組裝時複製進去。
- **本機或 CI 的生產伺服器**（Playwright 的 `webServer` 也是這條）：

```bash
npm run build
npm start
```

`npm start`（`scripts/start-standalone.mjs`）把 `public`（若存在）與 `.next/static` 複製到 `.next/standalone`，再執行 `node .next/standalone/server.js`，監聽 `0.0.0.0:3000`。

---

## 技術棧

版本以 `package.json` 為準。目前主要版本是：

- **核心框架**：[Next.js 15.5](https://nextjs.org/) (App Router, Server Components & Route Handlers) 與 [React 18.3](https://react.dev/)
- **程式語言**：[TypeScript 5.x](https://www.typescriptlang.org/)
- **資料庫與 ORM**：[PostgreSQL 15](https://www.postgresql.org/) + [Prisma ORM 5.x](https://www.prisma.io/)
- **試算表引擎**：[ExcelJS 4.4](https://github.com/exceljs/exceljs)
- **資料驗證**：[Zod 4.x](https://zod.dev/)
- **測試框架**：[Vitest 5.x](https://vitest.dev/) 與 [Playwright](https://playwright.dev/)
- **容器化**：[Docker](https://www.docker.com/) & Docker Compose
- **持續整合**：[GitHub Actions](https://github.com/features/actions)（`.github/workflows/ci.yml`：Node 20、Postgres 15、lint、typecheck、Vitest、build、Playwright）

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
