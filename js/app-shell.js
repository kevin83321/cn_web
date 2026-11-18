
/**
 * CN Member Portal - Shared App Shell
 *
 * 負責：
 * 1. 共用 Header
 * 2. 共用 Footer（首頁 / 我的）
 * 3. 導覽狀態
 *
 * 不負責：
 * - LINE Login
 * - Session 驗證
 * - RBAC
 * - Workers API
 */

'use strict';

// App Shell 是全站共用入口；只有受保護頁面才載入 Auth Guard。
// 使用 Promise 確保頁面 API 呼叫前，攔截器已完成安裝。
window.CNAuthGuardReady = (() => {
  const page = location.pathname.split('/').pop().toLowerCase();
  if (!page || ['index.html', 'register.html', 'login.html'].includes(page)) {
    return Promise.resolve(null);
  }
  if (window.CNAuthGuard) return Promise.resolve(window.CNAuthGuard);
  const source = document.currentScript && document.currentScript.src;
  const url = new URL('./auth-guard.js', source || location.href);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = url.href;
    script.onload = () => window.CNAuthGuard
      ? resolve(window.CNAuthGuard)
      : reject(new Error('AUTH_GUARD_NOT_INITIALIZED'));
    script.onerror = () => reject(new Error('AUTH_GUARD_LOAD_FAILED'));
    document.head.appendChild(script);
  });
})();

(() => {
  const root = document.querySelector('.app-shell');

  if (!root) return;

  const page = document.body.dataset.page || 'home';

  const pages = {
    home: ['CN 會員中心', 'Member Portal'],
    hierarchy: ['會員階層', 'CN MEMBER PORTAL'],
    customers: ['服務客戶', 'CN MEMBER PORTAL'],
    members: ['會員管理', 'CN MEMBER PORTAL'],
    audit: ['操作紀錄', 'CN MEMBER PORTAL'],
    register: ['加入 CN', 'CN MEMBER PORTAL'],
    admin: ['管理中心', 'CN MEMBER PORTAL'],
  };

  const title = pages[page] || pages.home;

  // ============================================================
  // Header
  // ============================================================

  const header = document.getElementById('appHeader');

  if (header) {
    if (page === 'home') {
      header.innerHTML = `
        <div class="brand">
          <span class="brand-icon">CN</span>

          <div>
            <strong>CN 會員中心</strong>
          </div>
        </div>

        <button id="notificationBell" class="notification-bell" type="button" aria-label="開啟通知中心" aria-controls="notificationCenter" aria-expanded="false" hidden>
          <span aria-hidden="true">🔔</span>
          <span id="notificationBellCount" class="notification-bell-count" hidden></span>
        </button>

        <button
          id="profileButton"
          type="button"
          class="avatar"
          aria-label="帳號設定"
          disabled
        >
          人
        </button>
      `;
    } else {
      header.innerHTML = `
        <a
          class="header-back"
          href="./index.html"
          aria-label="返回上一頁"
        >
          ‹
        </a>

        <div class="header-heading">
          <strong>${title[0]}</strong>
        </div>

        <span class="header-mark">CN</span>
      `;
    }
  }
  const backButton = header?.querySelector('.header-back');

  if (backButton) {
    backButton.addEventListener('click', event => {
      const referrer = document.referrer;

      if (!referrer) return;

      try {
        const previous = new URL(referrer);

        // 僅允許返回同一個網站的頁面
        if (
          previous.origin === location.origin &&
          previous.pathname !== location.pathname
        ) {
          event.preventDefault();
          history.back();
        }
      } catch (error) {
        console.warn('[APP SHELL] Invalid referrer:', error);
      }
    });
  }
  // ============================================================
  // Footer
  // ============================================================

  const nav = document.getElementById('appFooter');

  if (!nav) return;

  // 註冊頁面不顯示 Footer
  if (page === 'register') {
    nav.hidden = true;
    root.style.paddingBottom = '0';
    return;
  }

  // 所有頁面都使用相同的 Footer
  nav.innerHTML = `
    <a
      href="./index.html"
      class="nav-item"
      data-nav="home"
      aria-label="首頁"
    >
      <span>⌂</span>
      <small>首頁</small>
    </a>

    <a
      href="./index.html#account"
      class="nav-item"
      data-nav="account"
      aria-label="我的"
    >
      <span>◯</span>
      <small>我的</small>
    </a>
    <a
      href="./admin.html"
      class="nav-item"
      data-nav="admin"
      aria-label="管理中心"
      hidden
    >
      <span>⚙</span>
      <small>管理</small>
    </a>
  `;

  const ADMIN_DESTINATIONS = [
    ['admin.members.read', './admin.html'],
    ['admin.audit.read', './admin.html'],
    ['admin.roles.catalog.read', './admin.html']
  ];

  window.CNAppShell = window.CNAppShell || {};

  window.CNAppShell.setPermissions = function (permissions) {
    const adminLink = document.querySelector(
      '#appFooter [data-nav="admin"]'
    );

    if (!adminLink) return;

    const granted = new Set(
      Array.isArray(permissions) ? permissions : []
    );

    const destination = ADMIN_DESTINATIONS.find(
      ([permission]) => granted.has(permission)
    );

    adminLink.hidden = !destination;

    if (destination) {
      adminLink.href = destination[1];
    }
  };

  // ============================================================
  // Shared Footer Permissions
  // ============================================================

  async function syncFooterPermissions() {
    const adminLink = nav.querySelector('[data-nav="admin"]');

    if (!adminLink) return;

    // 權限尚未確認前，預設隱藏
    adminLink.hidden = true;

    try {
      // 等待 Auth Guard 安裝完成
      if (window.CNAuthGuardReady) {
        await window.CNAuthGuardReady;
      }

      // 取得 API 設定與登入 Token
      const { CONFIG } = await import('./config.js');

      const token =
        localStorage.getItem(CONFIG.TOKEN_KEY) ||
        sessionStorage.getItem(CONFIG.TOKEN_KEY);

      if (!token) return;

      const response = await fetch(
        CONFIG.API_BASE + '/api/auth/permissions',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          },
          cache: 'no-store'
        }
      );

      if (!response.ok) return;

      const data = await response.json();

      if (!data.success || !Array.isArray(data.permissions)) {
        return;
      }

      window.CNAppShell.setPermissions(data.permissions);

    } catch (error) {
      console.error('[APP SHELL] Footer permission sync failed:', error);
      adminLink.hidden = true;
    }
  }

  // 所有頁面都同步 Footer 權限
  void syncFooterPermissions();

  // ============================================================
  // Navigation State
  // ============================================================

  function updateNavigation() {
    const accountSelected =
      page === 'home' &&
      location.hash === '#account';

    const activeNav =
      page === 'home'
        ? (accountSelected ? 'account' : 'home')
        : (
            location.pathname
              .split('/')
              .pop()
              .startsWith('admin')
              ? 'admin'
              : ''
          );

    nav.querySelectorAll('[data-nav]').forEach(link => {
      const active = link.dataset.nav === activeNav;

      link.classList.toggle('active', active);

      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  updateNavigation();

  window.addEventListener('hashchange', updateNavigation);

  // ============================================================
  // Home Page Navigation
  // ============================================================

  if (page === 'home') {
    nav.querySelectorAll(
      '[data-nav="home"], [data-nav="account"]'
    ).forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();

        window.dispatchEvent(
          new CustomEvent('cn:navigate', {
            detail: {
              tab: link.dataset.nav
            }
          })
        );
      });
    });
  }

})();
