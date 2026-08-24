# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.1] - 2026-08-24

### Phase M10-A.1: Survey Lifecycle State Machine & Version Boundary
- **Survey Lifecycle State Machine**:
  - 導入四態生命週期模型：`DRAFT` ➔ `PUBLISHED` ➔ `CLOSED` ➔ `ARCHIVED`。
  - 純領域狀態機引擎（`src/lib/survey-lifecycle.ts`），阻絕已發布問卷逆向篡改。
  - 問卷發布前防呆檢查清單（`validateSurveyPrePublishChecklist`）。
- **Collection Eligibility Guards**:
  - 支援排程與配額限制：`startDate`（開始時間）、`endDate`（截止時間）、`responseQuota`（配額上限）。
  - 公開問卷存取與提交端點即時動態阻絕。
- **Survey Duplication & Version Boundary**:
  - `POST /api/surveys/[id]/duplicate`：複製題目結構為全新獨立問卷（`v1 DRAFT`）。
  - `POST /api/surveys/[id]/restore`：安全還原歸檔問卷。
  - 受保護刪除守衛：已收集作答或處於發布中之問卷禁止物理刪除，強制引導使用封存歸檔。
- 累計 **50 個測試套件、500 項自動化測試全數通過**。

---

## [1.0.0] - 2026-08-24

### Analytics Engine v1.0.0 (Production Ready & Contract Frozen)
- **F.1 2-Way Cross-tabulation Engine**:
  - 純函數雙變量交叉矩陣運算，支援單選與複選題分母正規化。
- **F.2 Statistical Inference Engine**:
  - Pearson $\chi^2$ 獨立性檢定、自由度計算與 Lanczos 不完全伽瑪 p-value 數值解。
  - Cramér's V 關聯強度指標計算。
- **F.3 Differential Privacy & Suppression Engine**:
  - $k$-Anonymity（$k=5$）門檻抑制與二級互補抑制（Secondary/Complementary Suppression）。
- **F.4 ~ F.6 Multi-Presentation Consistency**:
  - 凍結 `ProtectedCrossTabResult` DTO，統一 Web Dashboard/Heatmap、REST API 與多工作表 Excel 匯出格式。
- **G.1 ~ G.8 Enterprise Security & Attack Validation Gates**:
  - G.1 數值微分驗證、G.2 隱私逆推防禦、G.3 租戶隔離/IDOR 稽核、G.4 負載效能基準測試。
  - G.5 審計日誌與版本治理、G.6 聯立線性方程式差分攻擊防護、G.7 實體 API E2E 測試、G.8 黃金基準數據回歸凍結。
- 發布 Git Tag `analytics-v1.0.0`。

---

## [0.2.0] - 2026-08-24

### Phase M6 ~ M8: Multi-Tenant Architecture, RBAC & Enterprise Security
- **Multi-Tenant Foundation (M6-B)**: 引入 `Organization` 與 `Membership` 租戶隔離模型。
- **Excel Import Security & Audit (M6-C, M6-D, M9-E.0)**:
  - Magic Bytes 簽章校驗與 Formula Injection 公式注入防護。
  - Strict Boolean (`parseStrictBoolean`) 與 Strict Order (`parseStrictOrderNum`) 驗證。
  - $transaction 原子交易支援與 Import History 診斷稽核日誌。
- **RBAC & Authentication (M7, M8)**:
  - CSPRNG Session 管理、scrypt 密碼雜湊、時序安全防護。
  - 角色最小權限模型 (OWNER, ADMIN, EDITOR, VIEWER) 與垂直越權阻絕。
  - 帳號重設安全流程與企業級成員邀請機制。

---

## [0.1.0] - 2026-08-21

### Milestone 1 ~ Milestone 5
- 核心問卷引擎、原始答案正規化儲存模型、條件跳題簡寫語法與拓撲循環檢測。
- Excel 題庫雙向無損匯入匯出與多錯誤診斷。
- 匿名問卷策略與草稿暫存恢復。
