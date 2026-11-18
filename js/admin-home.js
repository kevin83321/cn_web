
'use strict';

import { api, esc } from './admin-common.js';

const FEATURES = [
  {
    permission: 'admin.members.read',
    title: '全部會員',
    description: '查詢及管理會員資料',
    url: './admin-members.html'
  },
  {
    permission: 'admin.roles.catalog.read',
    title: '系統管理權限',
    description: '管理角色及權限',
    url: './admin-roles.html'
  },
  {
    permission: 'admin.audit.read',
    title: '操作紀錄',
    description: '查詢管理異動紀錄',
    url: './admin-audit-logs.html'
  }
];

async function init() {
  const message = document.getElementById('adminMessage');
  const container = document.getElementById('adminFeatures');

  try {
    const result = await api('/api/auth/permissions');
    const permissions = Array.isArray(result.permissions)
      ? result.permissions
      : [];

    window.CNAppShell?.setPermissions(permissions);

    const allowed = FEATURES.filter(
      feature => permissions.includes(feature.permission)
    );

    if (!allowed.length) {
      message.textContent = '此帳號沒有管理功能的存取權限';
      return;
    }

    container.innerHTML = allowed.map(feature => `
      <a class="admin-item" href="${feature.url}">
        <strong>${esc(feature.title)}</strong>
        <p>${esc(feature.description)}</p>
      </a>
    `).join('');

    container.hidden = false;
    message.textContent = '';

  } catch (error) {
    console.error('[ADMIN HOME]', error);
    container.hidden = true;
    message.textContent =
      error.status === 401 || error.message === 'UNAUTHORIZED'
        ? '登入已失效，請重新登入'
        : '無法取得管理權限，請稍後再試';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
