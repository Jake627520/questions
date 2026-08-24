# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-08-21

### Milestone 1 (M1)
- 核心問卷流程與資料庫架構（PostgreSQL + Prisma）。
- 純函數核心計分引擎：支援 0 分與 NULL 嚴格區分、特殊非線性分數、負向題目反向計分。
- Excel 雙 Sheet（`questions`、`choices`）匯入與報表匯出。
- 「其他」必填文字與「以上皆非」互斥防呆。
- 線上填答頁面、統計分析頁面。

### Milestone 2 (M2)
- 條件式顯示 / 跳題（Skip Logic）基礎引擎。
- 複選題 `min_selections` / `max_selections` 數量限制。
- 數值題 `min_value` / `max_value` 範圍檢核。
- 輕量問卷版本控制（`version` 欄位與 `parent_survey_id` 關聯）。
- 條件隱藏題目自動豁免必填與排除計分。

### Milestone 3 (M3)
- 條件跳題直覺簡寫語法解析（`SHOW IF Q1 in [...]`、`SHOW IF Q5 contains slack`、`HIDE IF ...`）。
- 拓撲循環相依（Circular Dependency）檢測防護。
- 草稿暫存與進度恢復（`ResponseStatus.IN_PROGRESS`，透過 `?responseId` 恢復）。
- 統計分母校正（被隱藏題目與草稿不計入分母）。
- 問卷版本一鍵複製 API。

### Milestone 4 (M4)
- 簡寫語法支援選項中文標籤（`label`）智慧比對。
- 條件題目顯現時的提示文字支援（`visibility_hint`）。
- 回覆名單與草稿管理頁面（支援草稿刪除、已完成回覆保護）。
- Excel 匯入多錯誤定位強化（附帶 Excel 列號與題目代碼）。
- 累計 56 項自動化測試全數通過。

### Milestone 5 (M5) - Production Readiness & Hardening
- **複選題資料正規化**：新增 `AnswerChoice` (`answer_choices`) 關聯模型，並保持 `raw_value` 原始答案 100% 向後相容。
- **問卷發布保護鎖 (Published Survey Lock)**：已發布問卷鎖定題目結構不可修改，強制以版本複製 (`version + 1`) 升級。
- **匿名問卷策略**：新增 `is_anonymous` 與 `collect_identity` 欄位，嚴格保護作答隱私。
- **Excel Round-trip 雙向無損測試**：驗證 `Excel -> Import -> DB -> Export -> Re-import` 完整流程 0 屬性遺失。
- **26 題大型複雜題庫**：產出 `demo-complex-survey.xlsx`，涵蓋 6 大題型與所有 15+ 項進階業務防呆。
- **確定性統計基準資料集**：固定資料集檢驗百分比、平均數、0分 vs NULL、隱藏題排除與草稿排除。
- **GitHub Actions CI**：建立 `.github/workflows/ci.yml`（Node 20 + PostgreSQL service + lint + typecheck + test + build）。
- **Production Docker**：建立 Multi-stage `Dockerfile` 與具備 PostgreSQL healthcheck 的 `docker-compose.yml`。
- **安全與開源文件強化**：建立 `CONTRIBUTING.md`、`UAT_RESPONSIVE_CHECKLIST.md` 與問卷內容版權告示。
- 累計 **61 項自動化測試全數通過**。

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

### Phase M9: Survey Management, Analytics & Intelligence
- **Workspace Dashboard & Lifecycle (M9-A, M9-B, M9-C)**: 問卷工作區搜尋過濾、版本生命週期及協作權限。
- **Question Analytics Pure Engine (M9-E.1)**:
  - 獨立純函數聚合運算引擎，計算作答率、選項分佈、數值描述統計（Mean, Median, Range, Sample SD）。
  - 嚴格遵守數學邊界（$N < 2 \implies \text{null}$）與語意規範（有效作答/未作答，0 誤導性推論）。
- **Analytics Dashboard UX (M9-E.2)**:
  - 4 大 KPI 總覽卡片與雙軸（狀態 × 時間）多維即時篩選。
  - 題型專屬 Badge、多選題分母說明橫幅、極化啟發式標籤 (Heuristic Signal)。
  - 2-Way 交叉分析 Tab 與 `MIN_CELL_SIZE = 5` 互補抑制隱私防護。
- **Filter-Aware Multi-Sheet Export & Reporting (M9-E.3)**:
  - **五大 Sheet 結構化 Excel 匯出**：`匯出資訊 (Meta)`、`填答總覽 (Responses)`、`作答明細 (Answers)`、`題目統計摘要 (Summary)` 與 `題目與選項設定`。
  - **篩選感知**：即時套用 Dashboard 的 `statusFilter` 與 `timeRange` 篩選參數。
  - **輕量化列印報表**：提供「列印報表」功能，整合 `@media print` 專屬樣式與表頭資訊。
  - **安全與隱私**：遵循 RBAC（需要 EDITOR 以上權限匯出），匿名問卷零機密個資洩漏。
- 累計 **427 項自動化測試全數通過**。

