'use strict';
import { CONFIG } from './config.js';

(() => {
  const $ = id => document.getElementById(id);
  const getToken = () => localStorage.getItem(CONFIG.TOKEN_KEY) || sessionStorage.getItem(CONFIG.TOKEN_KEY) || '';
  let inviteUrl = '';
  let inviteType = 'member';
  const params = new URLSearchParams(location.search);
  const initialCustomer = params.get('customer_member_id') || params.get('customer_id') || '';

  function setType(type) {
    inviteType = type;
    $('claimFields').hidden = type !== 'claim';
    $('inviteResult').hidden = true;
    $('inviteLinkOutput').textContent = '';
    inviteUrl = '';
  }
  for (const radio of document.querySelectorAll('input[name="inviteType"]')) {
    radio.addEventListener('change', () => { if (radio.checked) setType(radio.value); });
  }
  if (initialCustomer) {
    $('customerId').value = initialCustomer;
    document.querySelector('input[name="inviteType"][value="claim"]').checked = true;
    setType('claim');
  }

  async function api(path, body) {
    const token = getToken();
    if (!token) throw Error('請先登入會員帳號');
    const res = await fetch(CONFIG.API_BASE + path, {
      method: 'POST', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(body ? {'Content-Type':'application/json'} : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw Error(data.error || `HTTP_${res.status}`);
    return data;
  }

  function checkedUrl(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== location.origin) throw Error('邀請連結來源與目前網站不一致');
    return url.href;
  }
  function message() {
    return inviteType === 'claim'
      ? `邀請你認領 CN 既有客戶帳號。\n請透過以下連結設定 Email 與密碼並完成驗證：\n${inviteUrl}`
      : `邀請你加入 CN 會員中心！\n請透過以下連結完成註冊：\n${inviteUrl}`;
  }
  async function copy(value) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
    const input = document.createElement('textarea');
    input.value = value; document.body.append(input); input.select();
    try { if (!document.execCommand('copy')) throw Error('COPY_FAILED'); } finally { input.remove(); }
  }

  $('createInviteButton').addEventListener('click', async () => {
    const btn = $('createInviteButton');
    if (btn.disabled) return;
    btn.disabled = true; inviteUrl = ''; $('inviteResult').hidden = true;
    $('inviteLinkOutput').textContent = '正在產生連結…';
    try {
      const id = $('customerId').value.trim();
      if (inviteType === 'claim' && !id) throw Error('請輸入客戶會員 ID');
      const data = inviteType === 'claim'
        ? await api('/api/auth/customer-claims', { customer_member_id: id })
        : await api('/api/auth/invitations');
      inviteUrl = checkedUrl(data.url);
      $('inviteUrlText').textContent = inviteUrl;
      $('inviteResult').hidden = false;
      $('inviteLinkOutput').textContent = '邀請連結已產生。';
      $('inviteShareMessage').textContent = '';
    } catch (error) {
      const labels = { CLAIM_ALREADY_PENDING:'此客戶已有尚未到期的認領邀請', CLAIM_UNAVAILABLE:'此客戶不符合認領條件或已建立登入帳號', OUTSIDE_MANAGEMENT_SCOPE:'此客戶不在你的管理範圍', FORBIDDEN:'目前帳號沒有建立邀請的權限', SITE_NOT_CONFIGURED:'網站網址尚未設定' };
      $('inviteLinkOutput').textContent = '產生失敗：' + (labels[error.message] || error.message);
    } finally { btn.disabled = false; }
  });
  $('copyInviteButton').addEventListener('click', async () => {
    try { await copy(inviteUrl); $('inviteShareMessage').textContent = '連結已複製'; }
    catch { $('inviteShareMessage').textContent = '複製失敗，請手動複製'; }
  });
  $('copyInviteTextButton').addEventListener('click', async () => {
    try { await copy(message()); $('inviteShareMessage').textContent = '邀請文字已複製'; }
    catch { $('inviteShareMessage').textContent = '複製失敗'; }
  });
  $('lineShareButton').addEventListener('click', () => {
    if (inviteUrl) location.href = 'https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(inviteUrl);
  });
  $('nativeShareButton').addEventListener('click', async () => {
    if (!inviteUrl) return;
    try {
      if (navigator.share) await navigator.share({ title:'CN 邀請', text:message(), url:inviteUrl });
      else { await copy(message()); $('inviteShareMessage').textContent = '裝置不支援分享，已複製邀請文字'; }
    } catch (error) { if (error.name !== 'AbortError') $('inviteShareMessage').textContent = '分享失敗'; }
  });
})();
