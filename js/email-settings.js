(() => {
  'use strict';

  const BASE = 'https://cn-web-backend.kevin83321.workers.dev';
  const token = () => localStorage.getItem('member_session_token') || sessionStorage.getItem('member_session_token') || '';
  const msg = document.getElementById('emailStatus');
  const form = document.getElementById('emailForm');
  if (!msg || !form) return;
  const btn = form.querySelector('button[type="submit"]') || form.querySelector('button');
  if (!btn) return;
  const originalLabel = btn.textContent.trim() || '寄送驗證信';
  let busy = false;
  let cooldownUntil = 0;
  let countdownTimer = null;

  function updateButton() {
    const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    btn.disabled = busy || seconds > 0;
    btn.textContent = seconds > 0 ? `重新寄送（${seconds} 秒）` : (busy ? '寄送中…' : originalLabel);
    if (!seconds && countdownTimer !== null) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function setCooldown(seconds) {
    const value = Math.max(0, Math.ceil(Number(seconds) || 0));
    cooldownUntil = Date.now() + value * 1000;
    if (countdownTimer !== null) clearInterval(countdownTimer);
    countdownTimer = value > 0 ? setInterval(updateButton, 1000) : null;
    updateButton();
  }

  async function api(path, options = {}) {
    const res = await fetch(BASE + path, {
      ...options,
      headers: {
        Authorization: 'Bearer ' + token(),
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      },
      cache: 'no-store'
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      const error = new Error(data.error || 'REQUEST_FAILED');
      error.cooldownSeconds = data.cooldown_seconds;
      throw error;
    }
    return data;
  }

  async function refresh() {
    try {
      const data = await api('/api/auth/email/status');
      msg.textContent = data.email ? (data.verified ? '已驗證：' : '尚未驗證：') + data.email : '尚未設定 Email';
      if (data.email) form.elements.email.value = data.email;
      setCooldown(data.cooldown_seconds || 0);
    } catch (error) {
      msg.textContent = '無法讀取 Email 狀態：' + error.message;
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || cooldownUntil > Date.now()) return;
    busy = true;
    updateButton();
    try {
      const data = await api('/api/auth/email/request-verification', {
        method: 'POST',
        body: JSON.stringify({ email: form.elements.email.value.trim() })
      });
      const text = data.already_verified ? '這個 Email 已經驗證完成。' : '驗證信已寄出，請在 15 分鐘內開啟信中的連結。';
      msg.textContent = text;
      if (!data.already_verified) setCooldown(data.cooldown_seconds || 60);
      alert(text);
    } catch (error) {
      if (Number(error.cooldownSeconds) > 0) setCooldown(error.cooldownSeconds);
      const message = error.message === 'PLEASE_WAIT_60_SECONDS' || error.message === 'PLEASE_WAIT_TO_RETRY'
        ? '請等待倒數結束後再試。'
        : '寄送失敗：' + error.message;
      msg.textContent = message;
      alert(message);
    } finally {
      busy = false;
      updateButton();
    }
  });

  updateButton();
  refresh();
})();
