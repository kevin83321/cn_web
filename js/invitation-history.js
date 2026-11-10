'use strict';
import { CONFIG } from './config.js';

(() => {
  const $ = id => document.getElementById(id);
  const root = $('invitationHistory');
  if (!root) return;
  const token = () => localStorage.getItem(CONFIG.TOKEN_KEY) || sessionStorage.getItem(CONFIG.TOKEN_KEY) || '';
  const label = { member: '新會員邀請', claim: '既有客戶認領' };
  const statusLabel = { pending: '等待使用', used: '已完成', revoked: '已撤銷', expired: '已過期' };
  let rows = [];

  async function api(path, options = {}) {
    const t = token();
    if (!t) throw Error('請先登入');
    const res = await fetch(CONFIG.API_BASE + path, {
      cache: 'no-store',
      ...options,
      headers: { Authorization: `Bearer ${t}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw Error(data.error || `HTTP_${res.status}`);
    return data;
  }
  function date(value) {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString('zh-TW');
  }
  function cell(text) {
    const td = document.createElement('td');
    td.textContent = text;
    return td;
  }
  function render() {
    const filter = $('historyFilter').value;
    const list = filter === 'all' ? rows : rows.filter(row => row.status === filter);
    const tbody = $('historyRows');
    tbody.replaceChildren();
    for (const item of list) {
      const tr = document.createElement('tr');
      tr.append(
        cell(label[item.type] || item.type),
        cell(item.type === 'claim' ? `${item.target_name || '未命名'} (${item.target_member_id || '—'})` : '新會員（尚未註冊）'),
        cell(statusLabel[item.status] || item.status),
        cell(date(item.created_at)),
        cell(date(item.expires_at))
      );
      const action = document.createElement('td');
      if (item.status === 'pending') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary';
        button.textContent = '撤銷';
        button.addEventListener('click', () => revoke(item, button));
        action.append(button);
      } else action.textContent = '—';
      tr.append(action);
      tbody.append(tr);
    }
    $('historyCount').textContent = `顯示 ${list.length} 筆／已載入 ${rows.length} 筆（最多最近 200 筆）`;
    if (!list.length) {
      const tr = document.createElement('tr');
      const td = cell('沒有符合條件的邀請紀錄');
      td.colSpan = 6;
      tr.append(td);
      tbody.append(tr);
    }
  }
  async function load() {
    $('historyMessage').textContent = '正在載入邀請紀錄…';
    try {
      const data = await api('/api/auth/invitation-history');
      rows = Array.isArray(data.records) ? data.records : [];
      render();
      $('historyMessage').textContent = '邀請紀錄已更新';
    } catch (error) {
      $('historyMessage').textContent = `載入失敗：${error.message}`;
    }
  }
  async function revoke(item, button) {
    if (!window.confirm(`確定撤銷這筆${label[item.type]}？撤銷後原連結將無法使用。`)) return;
    button.disabled = true;
    try {
      await api('/api/auth/invitation-history/revoke', {
        method: 'POST', body: JSON.stringify({ type: item.type, id: item.id })
      });
      $('historyMessage').textContent = '邀請已撤銷';
      await load();
      // Refresh eligible customers on the next selection; reload is simplest and reliable.
    } catch (error) {
      $('historyMessage').textContent = `撤銷失敗：${error.message}`;
      button.disabled = false;
    }
  }
  $('reloadHistory').addEventListener('click', load);
  $('historyFilter').addEventListener('change', render);
  // Newly generated invitations should appear in history without another page load.
  document.addEventListener('cn:invitation-created', load);
  load();
})();
