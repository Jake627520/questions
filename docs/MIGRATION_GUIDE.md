# PostgreSQL 資料庫遷移與升級安全指南 (Migration Guide)

## 概述
本專案採用 **Prisma Migrate** 進行版本化資料庫架構管理。所有變更均以 SQL 檔案記錄於 `prisma/migrations/` 目錄中，並透過 CI/CD 執行自動化檢查與部署。

---

## 1. 生產環境部署原則 (Zero-Downtime Principles)
- **永遠使用 `prisma migrate deploy`**：生產環境禁止使用 `prisma db push` 或 `prisma migrate dev`，確保所有套用的 Migration 均經過 Git 審查。
- **向下相容原則 (Expand & Contract)**：
  - 新增欄位一律使用可空 (`NULL`) 或指定 `@default(...)`。
  - 廢棄欄位不可在同一次部署中立即刪除，需分階段（Phase 1: 程式碼停止寫入；Phase 2: 移除欄位）。
- **非同步索引建立**：針對百萬級資料表，建議評估 `CREATE INDEX CONCURRENTLY` 避免表級排他鎖。

---

## 2. 遷移部署步驟 (Deployment SOP)

```bash
# 步驟 1: 備份當前資料庫狀態
pg_dump -U postgres -h localhost -d survey_db --format=custom -f "backup_pre_deploy_$(date +%Y%m%d%H%M%S).dump"

# 步驟 2: 檢查待套用的 Migration
npx prisma migrate status

# 步驟 3: 執行正式遷移
npx prisma migrate deploy

# 步驟 4: 驗證服務健康狀態
curl -f http://localhost:3000/api/health
```

---

## 3. 遷移失敗與復原策略 (Failure & Rollback Strategy)

> [!IMPORTANT]
> **Forward-Fix 優先原則**：關聯式資料庫中多數 DDL 變更無法純靠自動化反向腳本無損復原。若 Migration 發生局部失敗或異常，優先採用「Forward-Fix（建立修正版 Migration 再次發布）」，而非強行手動降級 schema。

### 緊急回滾程序 (Disaster Rollback SOP)
若發生不可復原之資料庫結構損壞：
1. 立即啟動維護模式，導向維護頁面。
2. 終止應用程式寫入連線：
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'survey_db' AND pid <> pg_backend_pid();
   ```
3. 透過部署前備份進行全量還原：
   ```bash
   pg_restore -U postgres -h localhost -d survey_db --clean --if-exists backup_pre_deploy_XXXXX.dump
   ```
4. 回滾應用程式容器映像檔至上一穩定版本。
5. 檢查 `/api/health` 並恢復對外流量。
