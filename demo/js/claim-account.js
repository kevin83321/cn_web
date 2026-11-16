'use strict';
import { CONFIG } from './config.js';

(async () => {
  const $ = id => document.getElementById(id);
  const token = new URLSearchParams(location.search).get('token') || '';
  // Do not leave bearer token in address bar after reading it.
  history.replaceState(null, '', location.pathname);
  if (!/^[a-f0-9]{64}$/.test(token)) {
    $('claimInfo').textContent = '認領連結無效，請向服務直銷商重新索取。';
    return;
  }
  const errors = {
    CLAIM_INVALID_OR_EXPIRED: '認領連結已過期、撤銷或使用。',
    CLAIM_UNAVAILABLE: '此客戶已啟用帳號或無法認領。',
    REGISTRATION_UNAVAILABLE: '此 Email 無法使用，請更換或聯絡服務直銷商。',
    PLEASE_WAIT_60_SECONDS: '操作太頻繁，請稍後重試。',
    EMAIL_SEND_FAILED: '驗證信寄送失敗，請稍後再試。',
    INVALID_REGISTRATION_DATA: '請確認 Email 與密碼符合規定。'
  };
  async function request(path, options) {
    const res = await fetch(CONFIG.API_BASE + path, { cache:'no-store', ...options });
    const data = await res.json();
    if (!res.ok || !data.success) throw Error(data.error || `HTTP_${res.status}`);
    return data;
  }
  try {
    const data = await request('/api/auth/customer-claims/preview?token=' + encodeURIComponent(token));
    $('claimInfo').textContent = `客戶：${data.customer_name || 'CN 客戶'}；邀請人：${data.inviter_name || '服務直銷商'}。請設定 Email 與密碼完成認領。`;
    $('claimForm').hidden = false;
  } catch (error) {
    $('claimInfo').textContent = errors[error.message] || '無法確認邀請連結，請重新索取。';
    return;
  }
  $('claimForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('claimSubmit');
    const password = $('claimPassword').value;
    if (password !== $('claimPassword2').value) { $('claimMessage').textContent = '兩次密碼不一致。'; return; }
    if (password.length < 12 || password.length > 128) { $('claimMessage').textContent = '密碼長度須介於 12 至 128 字元。'; return; }
    button.disabled = true;
    $('claimMessage').textContent = '正在寄送驗證信…';
    try {
      await request('/api/auth/customer-claims/register', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token,email:$('claimEmail').value.trim(),password})
      });
      $('claimForm').hidden = true;
      $('claimMessage').textContent = '驗證信已寄出，請於 15 分鐘內開啟信件完成認領。';
    } catch (error) {
      $('claimMessage').textContent = errors[error.message] || `寄送失敗：${error.message}`;
    } finally { button.disabled = false; }
  });
})();
