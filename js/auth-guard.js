'use strict';
import { CONFIG } from './config.js';
/* Load before page scripts on protected pages (not index.html/login/register). */
(() => {
  
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
    if (reason !== 'FORBIDDEN') {
      localStorage.removeItem(CONFIG.TOKEN_KEY);
      sessionStorage.removeItem(CONFIG.TOKEN_KEY);
      // Prevent automatic LINE sign-in immediately after a revoked session.
      localStorage.setItem(CONFIG.MANUAL_LOGOUT_KEY, '1');
    }
    location.replace(home(reason));
  }
  function isApiRequest(input) {
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      return url.origin === new URL(CONFIG.API_BASE).origin && url.pathname.startsWith('/api/');
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
    }
    return res;
  };
  // Check the session even when a page doesn't make an API call immediately.
  const token = localStorage.getItem(CONFIG.TOKEN_KEY) || sessionStorage.getItem(CONFIG.TOKEN_KEY);
  if (!token) redirect('SESSION_EXPIRED');
  else {
    originalFetch(CONFIG.API_BASE + '/api/auth/me', {
      headers: { Authorization: 'Bearer ' + token }, cache: 'no-store'
    }).then(async res => {
      if (res.status === 401) redirect('SESSION_EXPIRED');
      else if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        if (body.error === 'MEMBER_INACTIVE') redirect('MEMBER_INACTIVE');
      }
    }).catch(() => { /* Network errors must not log users out. */ });
  }
  window.CNAuthGuard = { redirect };
})();
