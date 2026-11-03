'use strict';

// ============================================================
// 1. 基本設定
// ============================================================

const $ = id => document.getElementById(id);

const CONFIG = {
  apiBaseUrl: 'https://cn-web-backend.kevin83321.workers.dev',
  liffId: '2012126330-D7gu42yk'
};

const TOKEN_KEY = 'member_session_token';
const MANUAL_LOGOUT_KEY = 'member_manual_logout';

let sessionToken = localStorage.getItem(TOKEN_KEY) || '';
let liffReady = false;
let liffInitPromise = null;
let busy = false;

$('api').value = CONFIG.apiBaseUrl;
$('liffid').value = CONFIG.liffId;

// ============================================================
// 2. API 效能監控
// ============================================================

const apiPerformanceRecords = [];
const API_PERFORMANCE_LOG = true;

function recordApiPerformance(record) {
  apiPerformanceRecords.push(record);

  if (!API_PERFORMANCE_LOG) return;

  console.log(
    `[API] ${record.action} | ` +
    `${record.elapsed_ms.toFixed(0)} ms | ` +
    `HTTP ${record.http_status} | ` +
    (record.success ? 'OK' : 'FAILED')
  );
}

function apiPerfReport() {
  if (!apiPerformanceRecords.length) {
    console.log('目前沒有 API 效能紀錄');
    return [];
  }

  const groups = {};

  for (const record of apiPerformanceRecords) {
    if (!groups[record.action]) {
      groups[record.action] = [];
    }

    groups[record.action].push(record);
  }

  const report = Object.entries(groups).map(
    ([action, records]) => {
      const times = records.map(r => r.elapsed_ms);

      return {
        action,
        count: records.length,
        avg_ms: Math.round(
          times.reduce((a, b) => a + b, 0) / times.length
        ),
        min_ms: Math.round(Math.min(...times)),
        max_ms: Math.round(Math.max(...times)),
        failed: records.filter(r => !r.success).length
      };
    }
  );

  report.sort((a, b) => b.avg_ms - a.avg_ms);

  console.table(report);

  return report;
}

function apiPerfDetails() {
  console.table(apiPerformanceRecords);
  return apiPerformanceRecords.slice();
}

function apiPerfClear() {
  apiPerformanceRecords.length = 0;
  console.log('API 效能紀錄已清除');
}

window.apiPerfReport = apiPerfReport;
window.apiPerfDetails = apiPerfDetails;
window.apiPerfClear = apiPerfClear;

// ============================================================
// 3. 共用 UI 函式
// ============================================================

function notice(message) {
  $('notice').textContent = message || '';
}

function redactSecrets(value) {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [
        key,
        /^(token|id_token|password|password_hash|salt|token_hash)$/i
          .test(key)
          ? '[REDACTED]'
          : redactSecrets(val)
      ])
    );
  }

  return value;
}

function display(data) {
  $('result').textContent = JSON.stringify(
    redactSecrets(data),
    null,
    2
  );
}

function setBusy(value) {
  busy = value;

  document.querySelectorAll('button').forEach(button => {
    button.disabled = value;
  });
}

async function run(fn) {
  if (busy) return;

  setBusy(true);
  notice('');

  try {
    await fn();
  } catch (error) {
    const message = error.message || String(error);

    notice(message);

    display({
      success: false,
      error: message
    });

    console.error('[APP ERROR]', error);
  } finally {
    setBusy(false);
  }
}

// ============================================================
// 4. Workers API 設定
// ============================================================

function apiUrl() {
  const value = $('api').value.trim().replace(/\/+$/, '');

  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw Error('請填寫正確的 Workers API URL');
  }

  if (
    parsed.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(parsed.hostname)
  ) {
    throw Error('Workers API 必須使用 HTTPS');
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw Error('API URL 不應包含帳密或查詢參數');
  }

  return (
    parsed.origin +
    (parsed.pathname === '/'
      ? ''
      : parsed.pathname.replace(/\/+$/, ''))
  );
}

function saveSettings() {
  sessionStorage.setItem('api_url', apiUrl());

  const id = $('liffid').value.trim();

  if (id) {
    localStorage.setItem('liff_id', id);
  }

  notice('設定已儲存');
}

// ============================================================
// 5. Workers REST API
// ============================================================

const WORKERS_ROUTES = {
  login: {
    method: 'POST',
    path: '/api/auth/login',
    auth: false
  },

  me: {
    method: 'GET',
    path: '/api/auth/me',
    auth: true
  },

  logout: {
    method: 'POST',
    path: '/api/auth/logout',
    auth: true
  },

  line_login: {
    method: 'POST',
    path: '/api/auth/line',
    auth: false
  },

  line_status: {
    method: 'GET',
    path: '/api/auth/line/status',
    auth: true
  },

  line_bind: {
    method: 'POST',
    path: '/api/auth/line/bind',
    auth: true
  },

  line_unbind: {
    method: 'POST',
    path: '/api/auth/line/unbind',
    auth: true
  },
  member_self: {
  method: 'GET',
  path: '/api/members/me',
  auth: true
  },

  member_downline: {
    method: 'GET',
    path: '/api/members/downline?recursive=true',
    auth: true
  },
};

async function api(action, extra = {}) {
  const start = performance.now();

  let httpStatus = 0;
  let success = false;

  try {
    const route = WORKERS_ROUTES[action];

    if (!route) {
      return {
        success: false,
        error: 'NOT_IMPLEMENTED',
        message: `Workers 尚未實作 ${action}`
      };
    }

    const authToken = extra.token || sessionToken;

    if (route.auth && !authToken) {
      return {
        success: false,
        error: 'UNAUTHORIZED'
      };
    }

    const headers = {
      Accept: 'application/json'
    };

    if (route.auth) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const options = {
      method: route.method,
      headers,
      cache: 'no-store'
    };

    if (route.method === 'POST') {
      headers['Content-Type'] = 'application/json';

      const { token: ignored, ...body } = extra;

      options.body = JSON.stringify(body);
    }

    const response = await fetch(
      apiUrl() + route.path,
      options
    );

    httpStatus = response.status;

    const result = await response.json();

    success = response.ok && result?.success === true;

    return result;

  } catch (error) {
    console.error(
      `[API ERROR] ${action}`,
      error.message || String(error)
    );

    throw error;

  } finally {
    recordApiPerformance({
      action,
      elapsed_ms: performance.now() - start,
      http_status: httpStatus,
      success,
      timestamp: new Date().toISOString()
    });
  }
}

// ============================================================
// 6. 登入狀態
// ============================================================

function showLoggedIn(member, expires) {
  $('loginPanel').classList.add('hidden');
  $('memberPanel').classList.remove('hidden');

  $('memberInfo').textContent =
    `會員：${member.name || ''}` +
    `（${member.member_id || ''}）` +
    `｜角色：${member.role || ''}`;

  $('expiresInfo').textContent = expires
    ? 'Session 到期時間：' +
      new Date(expires).toLocaleString('zh-TW')
    : '';
}

function showLoggedOut({ clearToken = true } = {}) {
  if (clearToken) {
    sessionToken = '';

    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }

  $('memberPanel').classList.add('hidden');
  $('loginPanel').classList.remove('hidden');

  $('confirmPassword').value = '';
  $('password').value = '';

  $('downlineSummary').textContent = '';
  $('downlineResult').textContent = '尚未查詢會員階層';
}

async function restore({ showError = true } = {}) {
  if (!sessionToken) {
    return false;
  }

  const result = await api('me', {
    token: sessionToken
  });

  display(result);

  if (!result.success) {
    if (
      result.error === 'UNAUTHORIZED' ||
      result.error === 'SESSION_EXPIRED' ||
      result.error === 'INVALID_SESSION'
    ) {
      sessionToken = '';

      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    }

    if (showError) {
      showLoggedOut();
      notice('Session 已失效，請重新登入');
    }

    return false;
  }

  showLoggedIn(
    result.member,
    result.expires_at
  );

  return true;
}

async function acceptLogin(result) {
  display(result);

  if (!result.success || !result.token) {
    notice(
      '登入失敗：' +
      (result.error || '未知錯誤')
    );

    return false;
  }

  sessionToken = result.token;

  localStorage.setItem(TOKEN_KEY, sessionToken);
  sessionStorage.removeItem(TOKEN_KEY);

  localStorage.removeItem(MANUAL_LOGOUT_KEY);

  sessionStorage.setItem('api_url', apiUrl());

  return await restore();
}

// ============================================================
// 7. LINE LIFF
// ============================================================

async function ensureLiff() {
  if (!window.liff) {
    throw new Error('LIFF SDK 尚未載入');
  }

  const liffId = $('liffid').value.trim();

  if (!liffId) {
    throw new Error('LIFF ID 未設定');
  }

  if (!liffInitPromise) {
    liffInitPromise = liff.init({ liffId })
      .then(() => {
        liffReady = true;
        return true;
      })
      .catch(error => {
        liffReady = false;
        liffInitPromise = null;
        throw error;
      });
  }

  await liffInitPromise;

  if (!liff.isLoggedIn()) {
    liff.login({
      redirectUri:
        location.origin +
        location.pathname +
        location.search
    });

    return false;
  }

  return true;
}

function tokenExpired(jwt) {
  try {
    const payload = jwt
      .split('.')[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const decoded = JSON.parse(atob(payload));

    return (
      !decoded.exp ||
      Date.now() >= Number(decoded.exp) * 1000 - 60000
    );
  } catch {
    return true;
  }
}

async function lineToken() {
  if (!await ensureLiff()) {
    return null;
  }

  const idToken = liff.getIDToken();

  if (!idToken || tokenExpired(idToken)) {
    liff.logout();

    liffReady = false;

    notice('LINE 授權已過期，請重新登入 LINE');

    await liff.init({
      liffId: $('liffid').value.trim()
    });

    liffReady = true;

    liff.login({
      redirectUri:
        location.origin +
        location.pathname +
        location.search
    });

    return null;
  }

  return idToken;
}

// ============================================================
// 8. LINE 綁定狀態
// ============================================================

async function checkBinding(render = true) {
  const result = await api('line_status', {
    token: sessionToken
  });

  if (render) {
    display(result);
  }

  if (!result.success) {
    if (result.error === 'UNAUTHORIZED') {
      showLoggedOut();
      notice('Session 已失效');
    } else {
      notice(result.error || '查詢失敗');
    }

    return;
  }

  $('bindInfo').textContent = result.bound
    ? 'LINE 綁定狀態：已綁定'
    : 'LINE 綁定狀態：尚未綁定';
}

// ============================================================
// 9. 設定與登入
// ============================================================

$('saveSettings').onclick = () =>
  run(async () => saveSettings());

$('loginForm').onsubmit = event => {
  event.preventDefault();

  run(async () => {
    const result = await api('login', {
      username: $('username').value.trim(),
      password: $('password').value
    });

    await acceptLogin(result);
  });
};

// ============================================================
// 10. LINE 登入
// ============================================================

$('lineLogin').onclick = () =>
  run(async () => {
    const id_token = await lineToken();

    if (!id_token) {
      return;
    }

    const result = await api('line_login', {
      id_token
    });

    await acceptLogin(result);
  });

// ============================================================
// 11. Session 更新
// ============================================================

$('refresh').onclick = () =>
  run(restore);

// ============================================================
// 12. 頁面切換
// ============================================================

$('openHierarchy').onclick = () => {
  if (!sessionToken) {
    notice('請先登入會員');
    return;
  }

  sessionStorage.setItem('api_url', apiUrl());

  window.location.assign('./member-hierarchy.html');
};

$('openCustomerManagement').onclick = () => {
  if (!sessionToken) {
    notice('請先登入會員');
    return;
  }

  sessionStorage.setItem('api_url', apiUrl());

  window.location.assign('./customer-management.html');
};

// ============================================================
// 13. LINE 綁定
// ============================================================

$('checkBind').onclick = () =>
  run(() => checkBinding(true));

$('bind').onclick = () =>
  run(async () => {
    if (!sessionToken) {
      throw Error('請先登入會員');
    }

    const password = $('confirmPassword').value;

    if (!password) {
      throw Error('請輸入會員密碼');
    }

    const id_token = await lineToken();

    if (!id_token) {
      return;
    }

    const result = await api('line_bind', {
      token: sessionToken,
      password,
      id_token
    });

    display(result);

    $('confirmPassword').value = '';

    if (result.success) {
      notice('LINE 綁定成功');
      await checkBinding(false);
    } else {
      notice(
        '綁定失敗：' +
        (result.error || '未知錯誤')
      );
    }
  });

// ============================================================
// 14. LINE 解除綁定
// ============================================================

$('unbind').onclick = () =>
  run(async () => {
    if (!sessionToken) {
      throw Error('請先登入會員');
    }

    const password = $('confirmPassword').value;

    if (!password) {
      throw Error('請輸入會員密碼');
    }

    if (!confirm(
      '確定解除 LINE 綁定？解除後將無法使用 LINE 登入，直到重新綁定。'
    )) {
      return;
    }

    const result = await api('line_unbind', {
      token: sessionToken,
      password
    });

    display(result);

    $('confirmPassword').value = '';

    if (result.success) {
      notice('已解除 LINE 綁定');
      await checkBinding(false);
    } else {
      notice(
        '解除失敗：' +
        (result.error || '未知錯誤')
      );
    }
  });

// ============================================================
// 15. 登出
// ============================================================

$('logout').onclick = () =>
  run(async () => {
    const token = sessionToken;

    localStorage.setItem(MANUAL_LOGOUT_KEY, '1');

    showLoggedOut();

    try {
      const result = await api('logout', {
        token
      });

      display(result);

      notice(
        result.success
          ? '已登出'
          : '已清除本機登入狀態，後端登出回應：' +
            (result.error || '失敗')
      );

    } catch (error) {
      notice(
        '已清除本機登入狀態；無法確認伺服器 Session 是否撤銷：' +
        error.message
      );
    }
  });

// ============================================================
// 16. 會員資料
// ============================================================

$('memberSelf').onclick = () =>
  run(async () => {
    if (!sessionToken) {
      throw Error('請先登入會員');
    }

    const result = await api('member_self', {
      token: sessionToken
    });

    display(result);

    $('downlineSummary').textContent =
      result.success
        ? '會員資料查詢成功'
        : '查詢失敗：' +
          (result.error || '未知錯誤');

    $('downlineResult').textContent =
      JSON.stringify(redactSecrets(result), null, 2);
  });

$('memberDownline').onclick = () =>
  run(async () => {
    if (!sessionToken) {
      throw Error('請先登入會員');
    }

    const result = await api('member_downline', {
      token: sessionToken
    });

    display(result);

    const list = Array.isArray(result.members)
      ? result.members
      : Array.isArray(result.downline)
        ? result.downline
        : Array.isArray(result.data)
          ? result.data
          : null;

    $('downlineSummary').textContent =
      !result.success
        ? '查詢失敗：' +
          (result.error || '未知錯誤')
        : list
          ? '查詢成功，共 ' +
            list.length +
            ' 名下線會員'
          : '查詢成功（請檢查回應欄位結構）';

    $('downlineResult').textContent =
      JSON.stringify(redactSecrets(result), null, 2);
  });

// ============================================================
// 17. Stage 9B API 測試
// ============================================================
// ============================================================
// Stage 9B - Management Navigation
// ============================================================

const managementPages = {
  testMemberCustomers: './customer-management.html'
};

Object.entries(managementPages).forEach(
  ([buttonId, url]) => {
    const button = $(buttonId);

    if (!button) return;

    button.addEventListener('click', () => {
      if (!sessionToken) {
        alert('請先登入會員');
        return;
      }

      location.href = url;
    });
  }
);

// 尚未實作的管理功能
const pendingFeatures = {
  testAdminMembers: '會員管理功能尚未開放',
  testAdminAuditLogs: '操作紀錄功能尚未開放'
};

Object.entries(pendingFeatures).forEach(
  ([buttonId, message]) => {
    const button = $(buttonId);

    if (!button) return;

    button.disabled = true;
    button.title = message;
  }
);

// ============================================================
// 18. LIFF 自動登入初始化
// ============================================================

async function initializeAuth() {
  console.log('[AUTH] 初始化登入狀態');

  // 使用者主動登出後，不自動登入。
  if (localStorage.getItem(MANUAL_LOGOUT_KEY) === '1') {
    console.log('[AUTH] Manual logout detected');

    showLoggedOut();
    return;
  }

  // 優先恢復既有 Workers Session。
  if (sessionToken) {
    try {
      const restored = await restore({
        showError: false
      });

      if (restored) {
        console.log('[AUTH] Existing Workers session restored');
        return;
      }

    } catch (error) {
      console.error('[AUTH] Restore failed', error);

      // 網路暫時異常時保留 Token。
      showLoggedOut({
        clearToken: false
      });

      notice('目前無法驗證登入狀態，請稍後重試');
      return;
    }
  }

  // 沒有有效 Session 時，使用 LINE 自動登入。
  try {
    const ready = await ensureLiff();

    if (!ready) {
      return;
    }

    const id_token = await lineToken();

    if (!id_token) {
      return;
    }

    const result = await api('line_login', {
      id_token
    });

    if (result.success && result.token) {
      const ok = await acceptLogin(result);

      if (ok) {
        console.log('[AUTH] LINE auto login successful');
        return;
      }
    }

    console.log(
      '[AUTH] LINE auto login unavailable:',
      result.error || 'Unknown error'
    );

    showLoggedOut();

    notice(
      result.error === 'LINE_NOT_BOUND'
        ? 'LINE 尚未綁定會員，請先使用帳號密碼登入並完成綁定'
        : 'LINE 自動登入未完成：' +
          (result.error || '未知錯誤')
    );

  } catch (error) {
    console.error('[AUTH] Auto login failed', error);

    showLoggedOut({
      clearToken: false
    });

    notice(
      '自動登入失敗：' +
      (error.message || String(error))
    );
  }
}

// ============================================================
// 19. 初始化
// ============================================================

run(initializeAuth);

console.log(
  '[APP] index.js loaded. ' +
  '使用 apiPerfReport() 查看 API 效能統計。'
);