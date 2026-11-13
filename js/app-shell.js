
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
    register: ['加入 CN', 'CN MEMBER PORTAL']
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
            <small>Member Portal</small>
          </div>
        </div>

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
          aria-label="返回會員中心"
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
  `;

  // ============================================================
  // Navigation State
  // ============================================================

  function updateNavigation() {
    const accountSelected =
      page === 'home' &&
      location.hash === '#account';

    nav.querySelectorAll('[data-nav]').forEach(link => {
      const active =
        page === 'home' &&
        link.dataset.nav === (
          accountSelected ? 'account' : 'home'
        );

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

  // 首頁交給 index.js 處理實際畫面切換
  if (page === 'home') {
    nav.querySelectorAll('[data-nav]').forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();

        const tab = link.dataset.nav;

        window.dispatchEvent(
          new CustomEvent('cn:navigate', {
            detail: { tab }
          })
        );
      });
    });
  }

})();
