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
