'use strict';
import { CONFIG } from './config.js';

(async () => {
  const status = document.getElementById('status');
  const link = document.getElementById('returnLink');
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const flow = params.get('flow') || 'email';
  const routes = {
    email: '/api/auth/email/verify',
    invitation: '/api/auth/invitations/verify-email',
    customer_claim: '/api/auth/customer-claims/verify-email'
  };
  const success = {
    email: 'Email 驗證成功！',
    invitation: '邀請註冊完成！現在可以使用 Email 與密碼登入。',
    customer_claim: '客戶帳號認領成功！現在可以使用 Email 與密碼登入。'
  };
  const errors = {
    TOKEN_INVALID_OR_EXPIRED: '此驗證連結已使用或已過期。若已完成驗證，請直接登入；若尚未完成，請重新申請驗證連結。',
    INVITE_INVALID_OR_EXPIRED: '邀請連結已使用、已撤銷或已過期。若已完成註冊，請直接登入；否則請向邀請人索取新連結。',
    CLAIM_INVALID_OR_EXPIRED: '認領連結已使用、已撤銷或已過期。若已完成認領，請直接登入；否則請聯絡服務直銷商。',
    EMAIL_ALREADY_USED: '此 Email 已被其他帳號使用。',
    REGISTRATION_CONFLICT: '帳號資料發生衝突，請聯絡服務直銷商。',
    CLAIM_CONFLICT: '客戶帳號可能已被認領，請聯絡服務直銷商。'
  };

  // Remove the one-time secret from the address bar and browser history.
  window.history.replaceState(null, '', window.location.pathname);
  if (!Object.prototype.hasOwnProperty.call(routes, flow)) {
    status.textContent = '不支援的驗證流程。';
    return;
  }
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    status.textContent = '缺少有效的驗證資訊。';
    return;
  }
  if (flow !== 'email' && link) {
    link.href = './index.html';
    link.textContent = '返回登入頁面';
  }
  try {
    const res = await fetch(CONFIG.API_BASE + routes[flow], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store'
    });
    const data = await res.json();
    status.textContent = res.ok && data.success
      ? success[flow]
      : '驗證失敗：' + (errors[data.error] || data.error || '請稍後再試。');
  } catch {
    status.textContent = '無法連線驗證服務，請稍後再試。';
  }
})();
