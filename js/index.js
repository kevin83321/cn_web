'use strict';

(() => {

  // ============================================================
  // 1. Configuration
  // ============================================================

  const CONFIG = {
    API_BASE: 'https://cn-web-backend.kevin83321.workers.dev',

    LIFF_ID: '2012126330-D7gu42yk',

    TOKEN_KEY: 'member_session_token',

    MANUAL_LOGOUT_KEY: 'member_manual_logout',

    REGISTRATION_REASON_KEY: 'cn_registration_reason',

    LINE_REDIRECT_KEY: 'cn_line_redirect_attempt',

    LINE_REDIRECT_COOLDOWN: 15000,

    LINE_TOKEN_EXPIRY_BUFFER: 60
  };


  // ============================================================
  // 2. Helpers
  // ============================================================

  const $ = id => document.getElementById(id);

  const views = [
    'loadingView',
    'errorView',
    'guestView',
    'passwordView',
    'dashboardView',
    'accountView'
  ];

  const state = {
    token:
      localStorage.getItem(CONFIG.TOKEN_KEY) ||
      sessionStorage.getItem(CONFIG.TOKEN_KEY) ||
      '',

    member: null,

    permissions: [],

    liffPromise: null,

    working: false,

    lastError: null
  };


  // ============================================================
  // 3. Feature Definitions
  // ============================================================

  const features = [

    {
      id: 'hierarchy',
      title: '會員階層',
      detail: '查看我的組織',
      icon: '♧',
      url: './member-hierarchy.html',
      permission: 'member.downline.read'
    },

    {
      id: 'customers',
      title: '服務客戶',
      detail: '管理客戶關係',
      icon: '♧',
      url: './customer-management.html',
      permission: 'customer.read'
    },

    {
      id: 'profile',
      title: '個人資料',
      detail: '查看會員資訊',
      icon: '◉',
      tab: 'account',
      permission: 'member.self.read'
    },

    {
      id: 'account',
      title: '帳號設定',
      detail: '登入與安全',
      icon: '⚙',
      tab: 'account',
      permission: null
    }

  ];


  const adminFeatures = [

    {
      id: 'adminMembers',
      title: '全部會員',
      detail: '管理會員資料',
      icon: '▦',
      permission: 'admin.members.read',
      url: './admin-members.html'
    },
    {
      id: 'adminAudit',
      title: '操作紀錄',
      detail: '查詢稽核紀錄',
      icon: '≡',
      permission: 'admin.audit.read',
      url: './admin-audit-logs.html'
    },
    {
      id: 'adminRoles',
      title: '系統管理權限',
      detail: '管理系統權限',
      icon: '≡',
      permission: 'admin.roles.catalog.read',
      url: './admin-roles.html'
    },


  ];


  // ============================================================
  // 4. UI State
  // ============================================================

  function show(view) {

    for (const id of views) {
      const element = $(id);

      if (element) {
        element.hidden = id !== view;
      }
    }

    const isAuthenticatedView = [
      'dashboardView',
      'accountView'
    ].includes(view);

    const bottomNav = $('appFooter');

    if (bottomNav) {
      bottomNav.hidden = !isAuthenticatedView;
    }

    const profileButton = $('profileButton');

    if (profileButton) {
      profileButton.disabled = !state.member;
    }

    const currentTab =
      view === 'accountView' ? 'account' : 'home';

    document
      .querySelectorAll('[data-nav], [data-tab]')
      .forEach(element => {

        const tab =
          element.dataset.nav ||
          element.dataset.tab;

        const active = tab === currentTab;

        element.classList.toggle('active', active);

        if (active) {
          element.setAttribute('aria-current', 'page');
        } else {
          element.removeAttribute('aria-current');
        }

      });

  }


  function busy(
    message = '正在確認登入狀態…'
  ) {

    $('loadingText').textContent = message;

    show('loadingView');

  }


  function fail(message, error = null) {

    state.lastError = error;

    $('errorText').textContent = message;

    show('errorView');

  }


  function errorMessage(error) {

    const messages = {

      INVALID_LINE_TOKEN:
        'LINE 身分驗證失敗，請重新登入 LINE',

      LINE_RELOGIN_REQUIRED:
        'LINE 登入資訊已失效，請重新登入 LINE',

      LINE_ID_TOKEN_MISSING:
        '無法取得 LINE 登入資訊',

      LINE_TOKEN_EXPIRED:
        'LINE 登入資訊已過期',

      LINE_NOT_BOUND:
        'LINE 尚未綁定會員帳號',

      SESSION_EXPIRED:
        '登入已過期，請重新登入',

      UNAUTHORIZED:
        '登入驗證失敗',

      Failed_to_fetch:
        '網路連線異常，請檢查網路後重試'

    };

    if (error?.message === 'Failed to fetch') {
      return messages.Failed_to_fetch;
    }

    return (
      messages[error?.message] ||
      error?.message ||
      '發生未知錯誤'
    );

  }


  // ============================================================
  // 5. Session Management
  // ============================================================

  function saveSession(token) {

    if (!token) {
      throw new Error('SESSION_TOKEN_MISSING');
    }

    state.token = token;

    localStorage.setItem(
      CONFIG.TOKEN_KEY,
      token
    );

    sessionStorage.removeItem(
      CONFIG.TOKEN_KEY
    );

    localStorage.removeItem(
      CONFIG.MANUAL_LOGOUT_KEY
    );

  }


  function clearSession() {

    state.token = '';

    state.member = null;

    state.permissions = [];

    localStorage.removeItem(
      CONFIG.TOKEN_KEY
    );

    sessionStorage.removeItem(
      CONFIG.TOKEN_KEY
    );

  }


  function isManualLogout() {

    return (
      localStorage.getItem(
        CONFIG.MANUAL_LOGOUT_KEY
      ) === '1'
    );

  }


  // ============================================================
  // 6. Workers API
  // ============================================================

  async function api(
    path,
    {
      method = 'GET',
      body,
      auth = true
    } = {}
  ) {

    const headers = {};

    if (auth && state.token) {

      headers.Authorization =
        'Bearer ' + state.token;

    }

    if (body !== undefined) {

      headers['Content-Type'] =
        'application/json';

    }

    const response = await fetch(
      CONFIG.API_BASE + path,
      {
        method,

        cache: 'no-store',

        headers,

        ...(body !== undefined
          ? {
              body: JSON.stringify(body)
            }
          : {})
      }
    );

    let data;

    try {

      data = await response.json();

    } catch {

      throw new Error(
        'HTTP_' + response.status
      );

    }

    if (
      !response.ok ||
      !data.success
    ) {

      const error = new Error(
        data.error ||
        'HTTP_' + response.status
      );

      error.status = response.status;

      error.data = data;

      throw error;

    }

    return data;

  }


  // ============================================================
  // 7. LIFF Initialization
  // ============================================================

  async function initLiff() {

    if (!window.liff) {

      throw new Error(
        'LINE SDK 載入失敗'
      );

    }

    if (!state.liffPromise) {

      state.liffPromise = liff.init({
        liffId: CONFIG.LIFF_ID
      })
        .then(() => {

          console.log(
            '[LINE] LIFF initialized'
          );

          return true;

        })
        .catch(error => {

          state.liffPromise = null;

          throw error;

        });

    }

    return state.liffPromise;

  }


  // ============================================================
  // 8. LINE ID Token Validation
  // ============================================================

  function getLineTokenInfo() {

    if (!window.liff) {
      return null;
    }

    if (!liff.isLoggedIn()) {
      return null;
    }

    const decoded =
      liff.getDecodedIDToken();

    if (!decoded) {
      return null;
    }

    const now =
      Math.floor(Date.now() / 1000);

    const expiresAt =
      Number(decoded.exp || 0);

    return {

      issuer: decoded.iss,

      audience: String(
        decoded.aud || ''
      ),

      expiresAt,

      remainingSeconds:
        expiresAt - now,

      expired:
        expiresAt <=
        now +
        CONFIG.LINE_TOKEN_EXPIRY_BUFFER

    };

  }


  function isLineTokenValid() {

    const info = getLineTokenInfo();

    if (!info) {
      return false;
    }

    if (info.issuer !==
        'https://access.line.me') {

      return false;

    }

    // LIFF ID 前半段是 LINE Login Channel ID
    const expectedChannelId =
      CONFIG.LIFF_ID.split('-')[0];

    if (
      info.audience !==
      expectedChannelId
    ) {

      console.warn(
        '[LINE] Channel mismatch'
      );

      return false;

    }

    return !info.expired;

  }


  // ============================================================
  // 9. LINE Redirect Protection
  // ============================================================

  function canRedirectLine() {

    const lastAttempt = Number(
      sessionStorage.getItem(
        CONFIG.LINE_REDIRECT_KEY
      ) || 0
    );

    const now = Date.now();

    return (
      now - lastAttempt >=
      CONFIG.LINE_REDIRECT_COOLDOWN
    );

  }


  function markLineRedirect() {

    sessionStorage.setItem(
      CONFIG.LINE_REDIRECT_KEY,
      String(Date.now())
    );

  }


  function clearLineRedirect() {

    sessionStorage.removeItem(
      CONFIG.LINE_REDIRECT_KEY
    );

  }


  function redirectLine({
    force = false
  } = {}) {

    if (
      !force &&
      !canRedirectLine()
    ) {

      throw new Error(
        'LINE_RELOGIN_REQUIRED'
      );

    }

    markLineRedirect();

    const redirectUri =
      location.origin +
      location.pathname +
      location.search;

    console.log(
      '[LINE] Redirecting to LINE Login'
    );

    liff.login({
      redirectUri
    });

  }


  // ============================================================
  // 10. LINE Logout / Reauthentication
  // ============================================================

  async function reauthenticateLine({
    force = false
  } = {}) {

    await initLiff();

    if (
      !force &&
      !canRedirectLine()
    ) {

      throw new Error(
        'LINE_RELOGIN_REQUIRED'
      );

    }

    if (liff.isLoggedIn()) {

      liff.logout();

    }

    redirectLine({ force });

    return 'redirecting';

  }


  // ============================================================
  // 11. LINE Login
  // ============================================================

  async function tryLine({
    interactive = false
  } = {}) {

    await initLiff();

    // ----------------------------------------------------------
    // LINE 尚未登入
    // ----------------------------------------------------------

    if (!liff.isLoggedIn()) {

      if (interactive) {

        redirectLine({
          force: true
        });

        return 'redirecting';

      }

      return 'guest';

    }

    // ----------------------------------------------------------
    // LINE Token 檢查
    // ----------------------------------------------------------

    const tokenInfo =
      getLineTokenInfo();

    if (!isLineTokenValid()) {

      console.warn(
        '[LINE] Invalid or expired ID Token',
        {
          expiresAt:
            tokenInfo?.expiresAt,

          remainingSeconds:
            tokenInfo?.remainingSeconds
        }
      );

      return reauthenticateLine();

    }

    // ----------------------------------------------------------
    // 取得 LINE ID Token
    // ----------------------------------------------------------

    const id_token =
      liff.getIDToken();

    if (!id_token) {

      throw new Error(
        'LINE_ID_TOKEN_MISSING'
      );

    }

    // ----------------------------------------------------------
    // Workers LINE Login
    // ----------------------------------------------------------

    try {

      const data = await api(
        '/api/auth/line',
        {
          method: 'POST',

          body: {
            id_token
          },

          auth: false
        }
      );

      if (!data.token) {

        throw new Error(
          'SESSION_TOKEN_MISSING'
        );

      }

      saveSession(data.token);

      clearLineRedirect();

      console.log(
        '[LINE] Login successful'
      );

      return 'success';

    } catch (error) {

      // --------------------------------------------------------
      // LINE 尚未綁定
      // --------------------------------------------------------

      if (
        error.message ===
        'LINE_NOT_BOUND'
      ) {

        sessionStorage.setItem(
          CONFIG.REGISTRATION_REASON_KEY,
          'LINE_NOT_BOUND'
        );

        clearLineRedirect();

        location.replace(
          './register.html'
        );

        return 'redirecting';

      }

      // --------------------------------------------------------
      // Workers 拒絕 LINE Token
      // --------------------------------------------------------

      if (
        error.message ===
        'INVALID_LINE_TOKEN'
      ) {

        console.warn(
          '[LINE] Workers rejected ID Token'
        );

        // 不直接自動重新登入，避免無限循環
        throw new Error(
          'LINE_RELOGIN_REQUIRED'
        );

      }

      throw error;

    }

  }


  // ============================================================
  // 12. Permissions
  // ============================================================

  function can(permission) {

    if (permission === null) {
      return true;
    }

    return state.permissions.includes(
      permission
    );

  }

  async function loadPermissions() {

    const data = await api(
      '/api/auth/permissions'
    );

    if (
      !Array.isArray(data.permissions) ||
      !data.permissions.every(
        permission => typeof permission === 'string'
      )
    ) {
      throw new Error(
        'INVALID_PERMISSIONS_RESPONSE'
      );
    }

    state.permissions = data.permissions;

  }


  // ============================================================
  // 13. Feature Cards
  // ============================================================

  function makeCard(item) {

    const button =
      document.createElement(
        'button'
      );

    button.className =
      'feature-card';

    button.type = 'button';

    const icon =
      document.createElement(
        'span'
      );

    icon.className =
      'feature-icon';

    icon.textContent =
      item.icon;

    const title =
      document.createElement(
        'strong'
      );

    title.textContent =
      item.title;

    const detail =
      document.createElement(
        'small'
      );

    detail.textContent =
      item.detail;

    button.append(
      icon,
      title,
      detail
    );

    button.addEventListener(
      'click',
      () => {

        if (item.tab) {

          navigate(item.tab);

          return;
        }

        if (item.url) {

          location.href =
            item.url;

        }

      }
    );

    return button;

  }


  // ============================================================
  // 14. Dashboard
  // ============================================================

  function renderDashboard() {

    const member =
      state.member || {};

    $('memberName').textContent =
      member.name ||
      member.member_id ||
      '會員';

    $('memberId').textContent =
      member.member_id ||
      '—';

    const roleNames = {

      distributor: '直銷商',

      lifestyle: '生活會員',

      non_member: '一般會員'

    };

    $('memberRole').textContent =
      roleNames[member.role] ||
      member.role ||
      '會員';

    $('accountName').textContent =
      member.name ||
      '會員';

    $('accountId').textContent =
      member.member_id ||
      '—';

    // ----------------------------------------------------------
    // Greeting
    // ----------------------------------------------------------

    const hour =
      new Date().getHours();

    $('greetingText').textContent =
      hour < 11
        ? '早安，歡迎回來'
        : hour < 18
          ? '午安，歡迎回來'
          : '晚安，歡迎回來';

    // ----------------------------------------------------------
    // Member Features
    // ----------------------------------------------------------

    const availableFeatures =
      features.filter(item =>
        can(item.permission)
      );

    $('featureGrid').replaceChildren(
      ...availableFeatures.map(
        makeCard
      )
    );

    // ----------------------------------------------------------
    // Admin Features
    // ----------------------------------------------------------

    const availableAdminFeatures =
      adminFeatures.filter(item =>
        can(item.permission)
      );

    $('adminSection').hidden =
      availableAdminFeatures.length === 0;

    $('adminGrid').replaceChildren(
      ...availableAdminFeatures.map(
        makeCard
      )
    );

    navigate(
      location.hash === '#account'
        ? 'account'
        : 'home'
    );

  }


  // ============================================================
  // 15. Enter Dashboard
  // ============================================================

  async function enterDashboard() {

    const result = await api(
      '/api/auth/me'
    );

    if (!result.member) {

      throw new Error(
        'MEMBER_NOT_FOUND'
      );

    }

    state.member =
      result.member;

    await loadPermissions();

    renderDashboard();

    // A valid session with insufficient permission remains signed in.
    const reason = new URLSearchParams(location.search).get('auth_error');
    if (reason === 'FORBIDDEN') {
      history.replaceState(null, '', location.pathname + location.hash);
      alert('沒有使用此功能的權限，已返回首頁。');
    }

  }


  // ============================================================
  // 16. Initialize Authentication
  // ============================================================

  async function initialize() {

    if (state.working) {
      return;
    }

    state.working = true;

    busy();

    try {

      // Redirects from protected pages should show login instead of
      // silently signing in through LINE again.
      const reason = new URLSearchParams(location.search).get('auth_error');
      if (reason === 'SESSION_EXPIRED' || reason === 'MEMBER_INACTIVE') {
        clearSession();
        localStorage.setItem(CONFIG.MANUAL_LOGOUT_KEY, '1');
        history.replaceState(null, '', location.pathname + location.hash);
        show('guestView');
        alert(reason === 'MEMBER_INACTIVE'
          ? '帳號已停用，請聯絡管理員。'
          : '登入已失效，請重新登入。');
        return;
      }

      // --------------------------------------------------------
      // A. 優先恢復現有 Session
      // --------------------------------------------------------

      if (state.token) {

        try {

          await enterDashboard();

          return;

        } catch (error) {

          // 只有 Session 無效才清除
          if (
            error.status !== 401 &&
            error.status !== 403
          ) {

            throw error;

          }

          console.warn(
            '[AUTH] Session expired'
          );

          clearSession();

        }

      }

      // --------------------------------------------------------
      // B. 使用者曾主動登出
      // --------------------------------------------------------

      if (isManualLogout()) {

        show('guestView');

        return;

      }

      // --------------------------------------------------------
      // C. LINE 自動登入
      // --------------------------------------------------------

      busy(
        '正在使用 LINE 確認身分…'
      );

      const result =
        await tryLine();

      if (
        result === 'success'
      ) {

        await enterDashboard();

      } else if (
        result === 'guest'
      ) {

        show('guestView');

      }

      // redirecting:
      // 等待瀏覽器跳轉，不再操作畫面

    } catch (error) {

      console.error(
        '[AUTH]',
        error
      );

      fail(
        errorMessage(error),
        error
      );

    } finally {

      state.working = false;

    }

  }


  // ============================================================
  // 17. Password Login
  // ============================================================

  async function loginPassword(event) {

    event.preventDefault();

    if (state.working) {
      return;
    }

    state.working = true;

    busy(
      '正在登入…'
    );

    try {

      const identifier =
        $('identifier').value.trim();

      const password =
        $('password').value;

      const data = await api(
        '/api/auth/login',
        {
          method: 'POST',

          body: {
            identifier,
            password
          },

          auth: false
        }
      );

      saveSession(
        data.token
      );

      $('password').value = '';

      await enterDashboard();

    } catch (error) {

      console.error(
        '[AUTH] Password login failed',
        error
      );

      fail(
        '登入失敗：' +
        errorMessage(error),
        error
      );

    } finally {

      state.working = false;

    }

  }


  // ============================================================
  // 18. Logout
  // ============================================================

  async function logout() {

    if (
      !confirm(
        '確定登出會員帳號？'
      )
    ) {

      return;

    }

    try {

      await api(
        '/api/auth/logout',
        {
          method: 'POST'
        }
      );

    } catch (error) {

      console.warn(
        '[AUTH] Logout API failed',
        error.message
      );

    }

    clearSession();

    localStorage.setItem(
      CONFIG.MANUAL_LOGOUT_KEY,
      '1'
    );

    // 不呼叫 liff.logout()
    // 避免使用者登出後立即重新 LINE Login

    show('guestView');

  }


  // ============================================================
  // 19. Retry
  // ============================================================

  async function retry() {

    // 一般錯誤：重新執行初始化
    // LINE Token 錯誤：要求重新 LINE Login

    const error =
      state.lastError;

    if (
      error?.message ===
      'LINE_RELOGIN_REQUIRED'
    ) {

      try {

        busy(
          '正在重新登入 LINE…'
        );

        await reauthenticateLine({
          force: true
        });

      } catch (e) {

        fail(
          errorMessage(e),
          e
        );

      }

      return;

    }

    initialize();

  }


  // ============================================================
  // 20. LINE Login Button
  // ============================================================

  async function loginLine() {

    if (state.working) {
      return;
    }

    state.working = true;

    busy(
      '正在連線 LINE…'
    );

    try {

      localStorage.removeItem(
        CONFIG.MANUAL_LOGOUT_KEY
      );

      const result =
        await tryLine({
          interactive: true
        });

      if (
        result === 'success'
      ) {

        await enterDashboard();

      }

    } catch (error) {

      console.error(
        '[LINE] Login failed',
        error
      );

      fail(
        errorMessage(error),
        error
      );

    } finally {

      state.working = false;

    }

  }


  // ============================================================
  // 21. Navigation
  // ============================================================

  function navigate(tab) {

    // 尚未完成登入時，不允許切換會員畫面
    if (!state.member) {
      return;
    }

    const isAccount = tab === 'account';

    const view = isAccount
      ? 'accountView'
      : 'dashboardView';

    const hash = isAccount
      ? '#account'
      : '';

    show(view);

    const targetUrl =
      location.pathname +
      location.search +
      hash;

    history.replaceState(
      null,
      '',
      targetUrl
    );

  }


  // ============================================================
  // 22. Event Listeners
  // ============================================================

  $('retryButton').addEventListener(
    'click',
    retry
  );


  $('manualLoginButton').addEventListener(
    'click',
    () => show('passwordView')
  );


  $('passwordLoginButton').addEventListener(
    'click',
    () => show('passwordView')
  );


  $('backToLineButton').addEventListener(
    'click',
    () => show('guestView')
  );


  $('passwordForm').addEventListener(
    'submit',
    loginPassword
  );


  $('lineLoginButton').addEventListener(
    'click',
    loginLine
  );


  $('logoutButton').addEventListener(
    'click',
    logout
  );


  $('profileButton').addEventListener(
    'click',
    () => navigate('account')
  );

  // ============================================================
  // Shared App Shell Navigation
  // ============================================================

  window.addEventListener('cn:navigate', event => {

    const tab = event.detail?.tab;

    if (tab === 'home' || tab === 'account') {
      navigate(tab);
    }

  });

  // 支援瀏覽器返回 / 前進造成的 Hash 變化
  window.addEventListener('hashchange', () => {

    if (!state.member) {
      return;
    }

    navigate(
      location.hash === '#account'
        ? 'account'
        : 'home'
    );

  });

  document
    .querySelectorAll('[data-tab]')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          navigate(
            button.dataset.tab
          );

        }
      );

    });


  // ============================================================
  // 23. Application Startup
  // ============================================================

  initialize();

})();