/** Phase 8.1: account status and unlock, used on admin-members.html. */
'use strict';
(() => {
  const section = document.getElementById('authAccountSection');
  const list = document.getElementById('items');
  if (!section || !list) return;
  const info = document.getElementById('authAccountInfo');
  const message = document.getElementById('authAccountMessage');
  const unlockButton = document.getElementById('authAccountUnlock');
  let selectedId = null, actorId = null, canRead = false, canUnlock = false, busy = false;
  const endpoint = id => '/api/admin/members/' + encodeURIComponent(id) + '/auth-account';

  async function refresh() {
    if (!selectedId || !canRead) return;
    const id = selectedId;
    section.hidden = false;
    info.textContent = '讀取中…';
    unlockButton.hidden = true;
    try {
      const data = await api(endpoint(id));
      if (selectedId !== id) return;
      const a = data.account;
      if (!a) { info.textContent = '此會員尚無登入帳號紀錄。'; return; }
      const lines = [
        '登入方式：' + (a.provider === 'password' ? '帳號密碼' : a.provider),
        '登入帳號：' + (a.identifier || '—'),
        'LINE 綁定：' + (a.has_line_binding ? '已綁定' : '未綁定'),
        '密碼失敗次數：' + a.failed_count,
        '鎖定狀態：' + (a.is_locked ? '鎖定中' : '未鎖定'),
        '鎖定截止：' + (a.locked_until || '—'),
        '會員狀態：' + data.member_status
      ];
      info.replaceChildren(...lines.map(line => {
        const div = document.createElement('div'); div.textContent = line; return div;
      }));
      unlockButton.hidden = !canUnlock || id === actorId ||
        (!a.locked_until && Number(a.failed_count) === 0);
    } catch (error) {
      if (selectedId === id) info.textContent = '讀取失敗：' + error.message;
    }
  }

  async function init() {
    if (typeof TOKEN === 'undefined' || !TOKEN) return;
    try {
      const p = await api('/api/auth/permissions');
      canRead = (p.permissions || []).includes('admin.accounts.read');
      canUnlock = (p.permissions || []).includes('admin.accounts.unlock');
      if (!canRead) return;
      const me = await api('/api/auth/me');
      actorId = me.member?.member_id || null;
    } catch (error) { console.warn('[ADMIN_ACCOUNTS]', error.message); }
  }

  list.addEventListener('click', event => {
    const button = event.target.closest('[data-member-id]');
    if (!button || !canRead) return;
    selectedId = button.dataset.memberId;
    message.textContent = '';
    refresh();
  });
  document.getElementById('detailClose')?.addEventListener('click', () => {
    selectedId = null; section.hidden = true;
  });
  unlockButton.addEventListener('click', async () => {
    if (!selectedId || !canUnlock || busy || selectedId === actorId) return;
    const id = selectedId;
    if (!confirm('確定解除 ' + id + ' 的登入鎖定並清除失敗次數？')) return;
    busy = true; unlockButton.disabled = true; message.textContent = '處理中…';
    try {
      const result = await api(endpoint(id) + '/unlock', { method: 'POST' });
      if (id === selectedId) {
        message.textContent = result.changed ? '解除鎖定成功，已寫入稽核紀錄。' : '帳號原本沒有鎖定。';
        await refresh();
      }
    } catch (error) {
      if (id === selectedId) message.textContent = '解除失敗：' + error.message;
    } finally { busy = false; unlockButton.disabled = false; }
  });
  init();
})();
