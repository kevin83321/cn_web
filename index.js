'use strict';

// ============================================================
// 1. 基本設定
// ============================================================

const $ = id => document.getElementById(id);

const CONFIG = {
  gasUrl: 'https://script.google.com/macros/s/AKfycbydJd-dQlw1v1yPf9UCijKKK3nv_rhR4_WKxyJ3cyjCqHi-fffMNvB0PpzvpHPtZHrFow/exec',
  liffId: '2012126330-D7gu42yk'
};

const TOKEN_KEY = 'member_session_token';

let sessionToken =
  sessionStorage.getItem(TOKEN_KEY) || '';

let liffReady = false;
let busy = false;

$('api').value =
  CONFIG.gasUrl ||
  sessionStorage.getItem('gas_url') ||
  '';

$('liffid').value =
  CONFIG.liffId ||
  localStorage.getItem('liff_id') ||
  '';


// ============================================================
// 2. API 效能監控
// ============================================================

// 儲存目前頁面的 API 效能紀錄。
// 不會上傳到 GAS，也不會寫入 Google Sheets。
const apiPerformanceRecords = [];

// 是否在 Console 顯示每次 API 耗時。
const API_PERFORMANCE_LOG = true;

function recordApiPerformance(record) {
  apiPerformanceRecords.push(record);

  if (!API_PERFORMANCE_LOG) return;

  const status = record.success ? 'OK' : 'FAILED';

  console.log(
    `[API] ${record.action} | ` +
    `${record.elapsed_ms.toFixed(0)} ms | ` +
    `HTTP ${record.http_status} | ${status}`
  );
}

// 查看所有 API 效能紀錄。
function apiPerfReport() {
  if (!apiPerformanceRecords.length) {
    console.log('目前沒有 API 效能紀錄');
    return [];
  }

  const groups = {};

  for (const record of apiPerformanceRecords) {
    const action = record.action;

    if (!groups[action]) {
      groups[action] = [];
    }

    groups[action].push(record);
  }

  const report = Object.entries(groups).map(
    ([action, records]) => {
      const times = records.map(r => r.elapsed_ms);

      const total = times.reduce(
        (sum, value) => sum + value,
        0
      );

      return {
        action,
        count: records.length,
        avg_ms: Math.round(total / records.length),
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

// 查看每次 API 的原始耗時紀錄。
function apiPerfDetails() {
  console.table(apiPerformanceRecords);

  return apiPerformanceRecords.slice();
}

// 清除效能紀錄。
function apiPerfClear() {
  apiPerformanceRecords.length = 0;

  console.log('API 效能紀錄已清除');
}

// 方便在 Chrome DevTools Console 直接呼叫。
window.apiPerfReport = apiPerfReport;
window.apiPerfDetails = apiPerfDetails;
window.apiPerfClear = apiPerfClear;


// ============================================================
// 3. 共用 UI 函式
// ============================================================

function notice(s) {
  $('notice').textContent = s || '';
}

function redactSecrets(value) {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [
        key,
        /^(token|id_token|password|password_hash|salt|token_hash)$/i.test(key)
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

function setBusy(v) {
  busy = v;

  document.querySelectorAll('button').forEach(
    button => {
      button.disabled = v;
    }
  );
}

async function run(fn) {
  if (busy) return;

  setBusy(true);
  notice('');

  try {
    await fn();

  } catch (e) {
    const message = e.message || String(e);

    notice(message);

    display({
      success: false,
      error: message
    });

    console.error('[APP ERROR]', e);

  } finally {
    setBusy(false);
  }
}


// ============================================================
// 4. GAS 設定
// ============================================================

function gasUrl() {
  const url = $('api').value.trim();

  if (
    !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(url)
  ) {
    throw Error('請填寫正確的 GAS /exec URL');
  }

  return url;
}

function saveSettings() {
  sessionStorage.setItem('gas_url', gasUrl());

  const id = $('liffid').value.trim();

  if (id) {
    localStorage.setItem('liff_id', id);
  }

  notice('設定已儲存');
}


// ============================================================
// 5. 共用 API — POST + 效能量測
// ============================================================

async function api(action, extra = {}) {
  const start = performance.now();

  let httpStatus = 0;
  let success = false;

  try {
    const response = await fetch(gasUrl(), {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action,
        ...extra
      })
    });

    httpStatus = response.status;

    if (!response.ok) {
      throw Error('API HTTP ' + response.status);
    }

    const result = await response.json();

    // 偵測是否意外取得 GAS 預設 GET 回應。
    if (
      result &&
      result.method === 'GET' &&
      result.message === 'GAS Member API'
    ) {
      throw Error(
        'GAS 回傳預設 GET 訊息，請檢查前端請求、部署版本及 API URL'
      );
    }

    success = result && result.success === true;

    return result;

  } catch (error) {
    console.error(
      `[API ERROR] ${action}`,
      error.message || String(error)
    );

    throw error;

  } finally {
    const elapsed = performance.now() - start;

    recordApiPerformance({
      action,
      elapsed_ms: elapsed,
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

function showLoggedOut() {
  sessionToken = '';

  sessionStorage.removeItem(TOKEN_KEY);

  $('memberPanel').classList.add('hidden');
  $('loginPanel').classList.remove('hidden');

  $('confirmPassword').value = '';
  $('password').value = '';

  $('downlineSummary').textContent = '';
  $('downlineResult').textContent = '尚未查詢會員階層';
}

async function restore() {
  if (!sessionToken) {
    showLoggedOut();
    return;
  }

  const result = await api('me', {
    token: sessionToken
  });

  display(result);

  if (!result.success) {
    showLoggedOut();
    notice('Session 已失效，請重新登入');
    return;
  }

  showLoggedIn(
    result.member,
    result.expires_at
  );

  await checkBinding(false);
}

async function acceptLogin(result) {
  display(result);

  if (!result.success || !result.token) {
    notice(
      '登入失敗：' +
      (result.error || '未知錯誤')
    );

    return;
  }

  sessionToken = result.token;

  sessionStorage.setItem(
    TOKEN_KEY,
    sessionToken
  );

  sessionStorage.setItem(
    'gas_url',
    gasUrl()
  );

  await restore();
}


// ============================================================
// 7. LINE LIFF
// ============================================================

async function ensureLiff() {
  if (liffReady) return true;

  if (!window.liff) {
    throw Error('LIFF SDK 尚未載入');
  }

  const id = $('liffid').value.trim();

  if (!id) {
    throw Error('請先設定 LIFF ID');
  }

  localStorage.setItem('liff_id', id);

  await liff.init({
    liffId: id
  });

  liffReady = true;

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
    const p = jwt
      .split('.')[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const payload = JSON.parse(atob(p));

    return (
      !payload.exp ||
      Date.now() >= Number(payload.exp) * 1000 - 60000
    );

  } catch (_) {
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
// 9. 設定、登入與 LINE 操作
// ============================================================

$('saveSettings').onclick = () =>
  run(async () => saveSettings());

$('loginForm').onsubmit = e => {
  e.preventDefault();

  run(async () => {
    const result = await api('login', {
      username: $('username').value.trim(),
      password: $('password').value
    });

    await acceptLogin(result);
  });
};

$('lineLogin').onclick = () =>
  run(async () => {
    const id_token = await lineToken();

    if (!id_token) return;

    const result = await api('line_login', {
      id_token
    });

    await acceptLogin(result);
  });

$('refresh').onclick = () =>
  run(restore);

$('openHierarchy').onclick = () => {
  if (!sessionToken) {
    notice('請先登入會員');
    return;
  }

  sessionStorage.setItem(
    'gas_url',
    gasUrl()
  );

  window.location.assign(
    './member-hierarchy.html'
  );
};

$('openCustomerManagement').onclick = () => {
  if (!sessionToken) {
    notice('請先登入會員');
    return;
  }

  sessionStorage.setItem(
    'gas_url',
    gasUrl()
  );

  window.location.assign(
    './customer-management.html'
  );
};

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

    if (!id_token) return;

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

$('unbind').onclick = () =>
  run(async () => {
    if (!sessionToken) {
      throw Error('請先登入會員');
    }

    const password = $('confirmPassword').value;

    if (!password) {
      throw Error('請輸入會員密碼');
    }

    if (
      !confirm(
        '確定解除 LINE 綁定？解除後將無法使用 LINE 登入，直到重新綁定。'
      )
    ) {
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

$('logout').onclick = () =>
  run(async () => {
    const token = sessionToken;

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
// 10. 會員資料
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
      JSON.stringify(result, null, 2);
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
      JSON.stringify(result, null, 2);
  });


// ============================================================
// 11. Stage 9B API 測試
// ============================================================

const stage9Actions = {
  testAdminMembers: 'admin_members',
  testMemberCustomers: 'member_customers',
  testAdminAuditLogs: 'admin_audit_logs'
};

Object.entries(stage9Actions).forEach(
  ([buttonId, action]) => {
    $(buttonId).addEventListener(
      'click',
      () => run(async () => {
        if (!sessionToken) {
          throw Error('請先登入會員');
        }

        const payload = {
          token: sessionToken
        };

        if (action === 'admin_audit_logs') {
          payload.limit = 20;
        }

        const response = await api(
          action,
          payload
        );

        display(response);

        $('stage9Result').textContent =
          JSON.stringify(
            redactSecrets(response),
            null,
            2
          );

        $('stage9Status').textContent =
          response.success
            ? action + ' 查詢成功'
            : action +
              ' 查詢失敗：' +
              (response.error || '未知錯誤');
      })
    );
  }
);


// ============================================================
// 12. 初始化
// ============================================================

if (sessionToken) {
  run(restore);
} else {
  showLoggedOut();
}

console.log(
  '[APP] index.js loaded. ' +
  '使用 apiPerfReport() 查看 API 效能統計。'
);