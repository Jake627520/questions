# 系統維運手冊與應急處置指南 (Operational Runbook)

## 概述
本手冊提供日常上線檢查表、系統指標監控告警門檻、常見故障情境排查 SOP 與緊急升級回滾流程。

---

## 1. 上線發布檢查清單 (Deployment Checklist)

發布前確認：
- [ ] 執行 `npm test`，確認 55+ 測試套件 100% 綠燈。
- [ ] 執行 `npm run typecheck` 與 `npm run lint`，確認零警告與型別錯誤。
- [ ] 檢查 `prisma/migrations/` 確認包含所有新版本的 SQL Migration。
- [ ] 確認生產環境環境變數已設定：
  - `DATABASE_URL`
  - `JWT_SECRET` / `SESSION_SECRET`
  - `CRON_SECRET`
  - `HMAC_SECRET`

發布後確認：
- [ ] 呼叫 `GET /api/health`，確認回應為 `200 OK` 且 `database: "UP"`。
- [ ] 呼叫 `POST /api/cron/cleanup` 驗證排程清理授權與執行正常。
- [ ] 監控伺服器日誌 10 分鐘，確認無未捕獲異常 (Uncaught Exceptions)。

---

## 2. 監控指標與告警門檻 (Monitoring & Alerts)

| 監控指標 (Metric) | 正常範圍 | 預警門檻 (Warning) | 緊急告警 (Critical) | 應對動作 |
|---|---|---|---|---|
| `/api/health` 狀態 | 200 OK | 連續 1 次 503 | 連續 3 次 503 | 檢查 DB 連線池與 PostgreSQL 實例狀態 |
| 記憶體使用 (Heap Used) | $< 300\text{ MB}$ | $> 500\text{ MB}$ | $> 800\text{ MB}$ | 檢查是否有非串流之超大 XLSX 匯出 |
| HTTP 5xx 錯誤率 | $< 0.1\%$ | $> 1\%$ | $> 5\%$ | 啟動日誌分析，鎖定異常端點 |
| Rate Limit 觸發次數 | $< 10\text{ 次/分}$ | $> 50\text{ 次/分}$ | $> 200\text{ 次/分}$ | 識別惡意 IP / 攻擊者，評估 WAF 封鎖 |

---

## 3. 緊急故障處置 SOP (Incident Response)

### 情境 A: 資料庫連線池耗盡 (DB Connection Exhaustion)
1. 查詢當前連線數與慢查詢：
   ```sql
   SELECT pid, now() - query_start AS duration, query, state 
   FROM pg_stat_activity 
   WHERE state != 'idle' 
   ORDER BY duration DESC;
   ```
2. 終止長時間阻塞之查詢：
   ```sql
   SELECT pg_cancel_backend(pid);
   ```
3. 評估調整 Prisma 連線池上限（`connection_limit` 參數）。

### 情境 B: 遭受惡意請求或 DoS 攻擊
1. 從 Reverse Proxy (如 Nginx / Cloudflare / Vercel) 查看異常請求來源 IP。
2. 啟動 WAF 速率限制或在邊界直接封鎖惡意 IP。
3. 檢查系統內建之 `checkRateLimit` 機制是否正常回傳 429。
