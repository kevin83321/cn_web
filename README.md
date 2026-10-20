# GitHub Pages + GAS + Google Sheets 登入 POC

**僅供功能測試，不可直接作為正式會員登入系統。**

## 內容
- `Config.gs`, `Setup.gs`, `Security.gs`, `AuthService.gs`, `Api.gs`：貼到同一個 Google Apps Script 專案。
- `index.html`：部署到 GitHub Pages。

## 步驟
1. 建立 GAS 專案，加入上述五個 `.gs` 檔案。
2. 在 `Setup.gs` 的 `createTestMember()` 中修改測試密碼（至少 12 碼，不要使用真實密碼）。
3. 從 GAS 編輯器執行 `setupDatabase()`，授權並查看執行紀錄中的 Google Sheets 網址。
4. 執行 `createTestMember()` 建立測試帳號 `demo01`。
5. **移除測試密碼的明文原始碼**（例如刪除 `createTestMember` 中的密碼字串）；之後請勿公開 GAS 原始碼。
6. 部署 GAS：部署 > 新增部署作業 > 網頁應用程式 > 執行身分「我」> 存取權「所有人」。複製 `/exec` URL。
7. GitHub repository 根目錄放 `index.html`，啟用 GitHub Pages。
8. 網頁填入 GAS `/exec` URL，使用 `demo01` 與剛才的測試密碼登入，測試「驗證 Session」與「登出」。
9. 修改 GAS 程式後，請更新網頁應用程式的部署版本，否則 `/exec` 可能仍執行舊版。

## 注意
- 此範例用 GAS 自行實作的低迭代數 PBKDF2（600 次）僅為避免 GAS 執行時間過長的 POC 折衷，**不足以保護正式使用者密碼**。正式環境請改用成熟的身分驗證服務，或經審查且具備足夠密碼雜湊強度的後端。
- Session token 暫存在 `sessionStorage`，可能受 XSS 影響；正式環境優先使用 `Secure; HttpOnly; SameSite` Cookie 搭配適當同源後端。
- 以 `text/plain` 送 JSON 是為了避開 CORS 預檢；不能視為 CSRF 防護或來源驗證。
- GAS `ContentService` 回傳 HTTP 200 並不代表業務成功，必須檢查 JSON 的 `success` 欄位。
- 本 POC 未實作 IP/裝置層級登入限速、帳號救援、密碼重設、CSRF/XSS 全面防護、Session 清理與權限控管；請勿上線給真實會員。
- Google Sheets 是示範資料庫；未來需加入上線/下線階層、角色與權限時，所有資料存取都必須在 GAS 後端檢查。
