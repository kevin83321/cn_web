'use strict';

import { api, esc } from './admin-common.js';

const FEATURES = [
  { permission: 'admin.members.read', title: '全部會員', description: '查詢及管理會員資料', url: './admin-members.html' },
  { permission: 'admin.roles.catalog.read', title: '系統管理權限', description: '管理角色及權限', url: './admin-roles.html' },
  { permission: 'admin.audit.read', title: '操作紀錄', description: '查詢管理異動紀錄', url: './admin-audit-logs.html' }
];

let requestSequence = 0;
let loading = false;

function show(message, features) {
  const notice = document.getElementById('adminMessage');
  const container = document.getElementById('adminFeatures');
  if (!notice || !container) return;
  notice.textContent = message;
  container.innerHTML = features.map(feature => `
    <a class="admin-item" href="${feature.url}">
      <strong>${esc(feature.title)}</strong>
      <p>${esc(feature.description)}</p>
    </a>
  `).join('');
  container.hidden = features.length === 0;
}

async function init() {
  if (loading) return;
  loading = true;
  const sequence = ++requestSequence;
  show('正在確認登入狀態與管理權限…', []);
  // Fail closed: never retain stale admin navigation on a refresh failure.
  window.CNAppShell?.setPermissions([]);
  try {
    const identity = await api('/api/auth/me');
    if (!identity.member || !identity.member.member_id) {
      throw new Error('INVALID_IDENTITY');
    }
    const result = await api('/api/auth/permissions');
    if (!Array.isArray(result.permissions) ||
        !result.permissions.every(permission => typeof permission === 'string')) {
      throw new Error('INVALID_PERMISSIONS');
    }
    if (sequence !== requestSequence) return;
    const permissions = [...new Set(result.permissions)];
    const allowed = FEATURES.filter(feature => permissions.includes(feature.permission));
    window.CNAppShell?.setPermissions(permissions);
    show(allowed.length ? '' : '此帳號沒有管理功能的存取權限', allowed);
  } catch (error) {
    if (sequence !== requestSequence) return;
    window.CNAppShell?.setPermissions([]);
    const code = error?.message || '';
    const message = error?.status === 401 || code === 'UNAUTHORIZED' || code === 'SESSION_EXPIRED'
      ? '登入已失效，請重新登入'
      : code === 'PASSWORD_CHANGE_REQUIRED'
        ? '請先完成密碼變更，再使用管理功能'
        : error?.status === 403 || code === 'FORBIDDEN'
          ? '目前沒有管理功能的存取權限'
          : '無法載入管理權限，請稍後重新整理';
    show(message, []);
    console.error('[ADMIN HOME] Initialization failed:', error);
  } finally {
    if (sequence === requestSequence) loading = false;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  void init();
}

// Refresh permissions when the page becomes visible after a role/session change.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void init();
});
