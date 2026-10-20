# 第 4～5 階段：LINE LIFF 登入與綁定（POC）

## 更新現有 GAS

- 保留原有 `Config.gs`、`Setup.gs`、`Security.gs`、`AuthService.gs`，以此 ZIP 內的 `AuthService.gs`、`Api.gs` 取代原版本，新增 `LineAuth.gs`。
- 在 GAS 專案的「專案設定 → 指令碼屬性」新增 `LINE_CHANNEL_ID`：填入 **LINE Login Channel ID**（不是 LIFF ID，不是 Messaging API Channel ID）。
- `AuthAccounts` 既有欄位可沿用；LINE 身分以 `provider=line`、`identifier=<LINE sub>` 另存一列，指向相同 member_id。
- 更新現有 Web App 部署：管理部署作業 → 編輯 → 新增版本 → 部署。
- **勿再次執行** `setupDatabase()` 或 `createTestMember()` 以避免不必要的變更（若現有表已建立）。

## LINE Developers 設定

1. 建立/使用 LINE Login channel，建立 LIFF App。
2. Endpoint URL 設為 GitHub Pages 上 `https://<user>.github.io/<repo>/liff.html`，Scopes 至少包含 `openid`。
3. LIFF SDK 的 `liffId` 填 LIFF ID；GAS Script Property `LINE_CHANNEL_ID` 填該 LIFF 所屬的 LINE Login channel ID。
4. LIFF 應透過其 LIFF URL 開啟，尤其測試 LINE App 內流程時。

## 測試步驟

1. 先在一般 `index.html` 以 demo01 登入，複製測試 Session Token（或在同源同分頁環境中讀取 `sessionStorage`）。
2. 在 `liff.html` 填 GAS URL 與 LIFF ID，點「初始化 LIFF / LINE 授權」。
3. 貼入一般登入 Session Token，輸入帳密，點「綁定目前 LINE 身分」。
4. 點「LINE 登入（已綁定）」；應取得新的系統 Session Token 與同一 member_id。
5. 以另一個 LINE 帳號綁定已綁定會員應失敗；以同一 LINE 帳號綁定不同會員應失敗。
6. 查詢綁定狀態、解除綁定、再測 LINE 登入應回傳 LINE_NOT_BOUND。

## 安全邊界與已知限制

- 這是 **POC**。原始專案的密碼 PBKDF2 迭代次數僅 600，且 `randomHex_()` 由 UUID 字串拼接，**不應視為適合正式部署的密碼雜湊與高強度 Session Token 方案**。
- 目前綁定流程要求有效系統 Session、密碼再次確認及有效 LINE ID Token。正式版建議加入綁定交易的 state/nonce、重試限制、AuditLog、重新驗證時效限制、撤銷 LINE 登入 Session 等。
- `line_unbind` 刪除 LINE 身分並撤銷其他 Session；本次登入 Session 保留。正式版應記錄 Session 的 auth_method，並在解除綁定時撤銷所有由 LINE 登入的 Session。
- 不要在 GitHub Pages 原始碼、Console、網址參數或測試截圖中暴露正式密碼與 Token。
- 不要將 LIFF `getProfile().userId` 當作後端驗證憑證。後端透過 LINE 的 `/oauth2/v2.1/verify` 驗證 ID Token，再使用回傳的 `sub`。
- API 使用 `text/plain` 避免 JSON 預檢；跨域成功與否以實際瀏覽器測試為準。
- 此範例未包含速率限制、帳號復原、正式身分驗證服務，請勿直接用於真實會員。
