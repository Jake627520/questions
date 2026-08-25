# 災難復原與資料備份手冊 (Disaster Recovery & Backup SOP)

## 概述
本手冊定義 Survey Intelligence System 之 PostgreSQL 資料庫備份策略、還原作業標準流程與 RPO/RTO 目標。

---

## 1. 災難復原目標 (DR Objectives)
- **RPO (Recovery Point Objective)**：$< 1$ 小時（每日全量備份 + 每小時 WAL 歸檔）。
- **RTO (Recovery Time Objective)**：$< 30$ 分鐘（自動化腳本還原至新實例）。

---

## 2. 自動化備份策略 (Backup Strategy)

### 每日全量備份 (Daily Full Backup)
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/survey_db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/survey_db_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

# 執行自訂格式壓縮備份 (包含 schema 與 data)
pg_dump -U postgres -h localhost -d survey_db \
  --format=custom \
  --compress=9 \
  --file="${BACKUP_FILE}"

# 保留最近 30 天備份，自動清除過期檔案
find "${BACKUP_DIR}" -type f -name "survey_db_*.dump" -mtime +30 -delete
```

---

## 3. 還原作業流程 (Restore Procedure)

### 完整復原演練 (Restore Verification Drill)
```bash
# 步驟 1: 建立或切換至目標資料庫
createdb -U postgres -h localhost survey_db_recovery

# 步驟 2: 執行結構與資料還原
pg_restore -U postgres -h localhost -d survey_db_recovery \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  "${BACKUP_FILE}"

# 步驟 3: 驗證關鍵表筆數與完整性
psql -U postgres -h localhost -d survey_db_recovery -c "SELECT count(*) FROM surveys;"
psql -U postgres -h localhost -d survey_db_recovery -c "SELECT count(*) FROM responses;"
psql -U postgres -h localhost -d survey_db_recovery -c "SELECT count(*) FROM report_exports;"
```

---

## 4. 定期演練計畫 (Drill Frequency)
- 每季度執行一次離線沙盒環境還原演練。
- 演練後需完整執行 `npm test` 與 `/api/health` 測試，確保還原後系統合約無損。
