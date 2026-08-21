# 🤝 Contributing Guidelines

感謝您對 Survey System MVP 專案的關注！本指南提供開發與貢獻指引。

---

## 🛠️ 開發流程

1. **Fork 本專案** 並 Clone 至您的開發環境：
   ```bash
   git clone https://github.com/Jake627520/questions.git
   cd questions
   ```
2. **安裝相依套件**：
   ```bash
   npm install
   ```
3. **設定環境變數與本地資料庫**：
   ```bash
   cp .env.example .env
   npx prisma db push
   npx prisma generate
   ```
4. **啟動開發伺服器**：
   ```bash
   npm run dev
   ```

---

## 🧪 程式碼品質與測試要求

在發送 Pull Request 前，請確保所有品質檢查與測試均通過：

```bash
# 1. 執行型別檢查
npm run typecheck

# 2. 執行 ESLint 檢驗
npm run lint

# 3. 執行完整自動化測試
npm test

# 4. 驗證生產構建
npm run build
```

---

## 📜 授權與內容宣告

- 本專案程式碼一律採用 [MIT License](./LICENSE)。
- 貢獻之範例題庫與說明文字必須為原創或具備公開授權，禁止提交包含任何個資、機密或第三方專有版權內容。
