'use strict';
import { CONFIG } from './config.js';

(() => {
  const $ = id => document.getElementById(id);
  const root = $('invitationHistory');
  if (!root) return;
  const token = () => localStorage.getItem(CONFIG.TOKEN_KEY) || sessionStorage.getItem(CONFIG.TOKEN_KEY) || '';
  const label = { member: '新會員邀請', claim: '既有客戶認領' };
  const statusLabel = { pending: '等待使用', used: '已完成', revoked: '已撤銷', expired: '已過期' };
  const roleLabel = {non_member: '一般會員', distributor: '直銷商'};

  function roleOf(item) {
    return item.type === 'claim' ? 'claim' : (item.invited_role || 'non_member');
  }

  function targetOf(item) {
    if (item.type === 'claim') {
      return `${item.target_name || '未命名'} (${item.target_member_id || '—'})`;
    }

    const role = roleLabel[roleOf(item)] || '未知身分';

    if (item.target_member_id) {
      return `${item.target_name || '未命名'} (${item.target_member_id})\n受邀身分：${role}`;
    }

    return `新會員（尚未註冊）\n受邀身分：${role}`;
  }
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
    const type = $('historyTypeFilter').value;
    const role = $('historyRoleFilter').value;

    const matches = row =>
      (type === 'all' || row.type === type) &&
      (role === 'all' || roleOf(row) === role);

    const list = rows.filter(row =>
      matches(row) &&
      (filter === 'all' || row.status === filter)
    );
    const summary = $('historySummary');
    summary.replaceChildren();
    for (const [key, title] of [['all', '全部'], ['pending', '等待使用'], ['used', '已完成'], ['revoked', '已撤銷'], ['expired', '已過期']]) {
      const count = rows.filter(row => matches(row) && (key === 'all' || row.status === key)).length;
      const pill = document.createElement('span');
      pill.className = 'history-stat';
      pill.textContent = `${title} ${count}`;
      summary.append(pill);
    }
    const tbody = $('historyRows');
    tbody.replaceChildren();
    for (const item of list) {
      const tr = document.createElement('tr');
      const values = [
        label[item.type] || item.type,
        item.type === targetOf(item),
        statusLabel[item.status] || item.status,
        date(item.created_at),
        date(item.expires_at)
      ];
      const headings = ['類型', '邀請對象', '狀態', '建立時間', '到期時間'];
      values.forEach((value, index) => {
        const td = cell(value);
        if (index === 1) {
          td.style.whiteSpace = 'pre-line';
        }
        td.dataset.label = headings[index];
        if (index === 2) td.dataset.status = item.status;
        tr.append(td);
      });
      const action = document.createElement('td');
      if (item.status === 'pending') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary';
        button.textContent = '撤銷';
        button.addEventListener('click', () => revoke(item, button));
        action.append(button);
      } else action.textContent = '—';
      action.dataset.label = '操作';
      tr.append(action);
      tbody.append(tr);
    }
    $('historyCount').textContent = `顯示 ${list.length} 筆／已載入 ${rows.length} 筆（最多最近 200 筆）`;
    if (!list.length) {
      const tr = document.createElement('tr');
      const td = cell('沒有符合條件的邀請紀錄');
      td.colSpan = 6;
      td.className = 'history-empty';
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
  $('historyTypeFilter').addEventListener('change', render);
  $('historyRoleFilter').addEventListener('change', render);
  // Newly generated invitations should appear in history without another page load.
  document.addEventListener('cn:invitation-created', load);
  load();
})();
