'use strict';
/* Loaded by app-shell.js on protected pages. */
(() => {
  const KEY = 'member_session_token';
  const MANUAL_KEY = 'member_manual_logout';
  const BASE = 'https://cn-web-backend.kevin83321.workers.dev';
  if (window.CNAuthGuard) return;
  const originalFetch = window.fetch.bind(window);
  let navigating = false;
  const home = reason => {
    const url = new URL('./index.html', location.href);
    url.searchParams.set('auth_error', reason);
    return url.href;
  };
  function redirect(reason) {
    if (navigating) return;
    navigating = true;
    if (reason !== 'FORBIDDEN' && reason !== 'PASSWORD_CHANGE_REQUIRED') {
      localStorage.removeItem(KEY);
      sessionStorage.removeItem(KEY);
      // Prevent automatic LINE sign-in immediately after a revoked session.
      localStorage.setItem(MANUAL_KEY, '1');
    }
    location.replace(home(reason));
  }
  function isApiRequest(input) {
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      return url.origin === new URL(BASE).origin && url.pathname.startsWith('/api/');
    } catch { return false; }
  }
  window.fetch = async function(input, init) {
    const res = await originalFetch(input, init);
    if (!isApiRequest(input)) return res;
    if (res.status === 401) redirect('SESSION_EXPIRED');
    else if (res.status === 403) {
      const body = await res.clone().json().catch(() => ({}));
      if (body.error === 'MEMBER_INACTIVE') redirect('MEMBER_INACTIVE');
      else if (body.error === 'FORBIDDEN') redirect('FORBIDDEN');
      else if (body.error === 'PASSWORD_CHANGE_REQUIRED') redirect('PASSWORD_CHANGE_REQUIRED');
    }
    return res;
  };
  // Check the session even when a page doesn't make an API call immediately.
  const token = localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
  if (!token) redirect('SESSION_EXPIRED');
  else {
    originalFetch(BASE + '/api/auth/me', {
      headers: { Authorization: 'Bearer ' + token }, cache: 'no-store'
    }).then(async res => {
      if (res.status === 401) redirect('SESSION_EXPIRED');
      else if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        if (body.error === 'MEMBER_INACTIVE') redirect('MEMBER_INACTIVE');
      }
      else if (res.ok) { const body=await res.json().catch(()=>({})); if(body.password_change_required) redirect('PASSWORD_CHANGE_REQUIRED'); }
    }).catch(() => { /* Network errors must not log users out. */ });
  }
  window.CNAuthGuard = { redirect, isRedirecting: () => navigating };
})();
