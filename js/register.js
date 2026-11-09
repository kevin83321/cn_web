'use strict';
import { CONFIG } from './config.js';

(() => {
  
  const $ = id => document.getElementById(id);
  let busy = false;
  let liffPromise;
  const views = ['choiceView', 'bindView', 'newView'];
  function show(id) {
    views.forEach(v => $(v).hidden = v !== id);
    $('registerMessage').textContent = '';
  }
  function message(text) { $('registerMessage').textContent = text; }
  async function initLine() {
    if (!window.liff) throw Error('LINE SDK 載入失敗');
    if (!liffPromise) liffPromise = liff.init({liffId: CONFIG.LIFF_ID}).catch(e => {liffPromise = null; throw e;});
    await liffPromise;
    if (!liff.isLoggedIn()) {
      liff.login({redirectUri: location.origin + location.pathname + location.search});
      return false;
    }
    if (!liff.getIDToken()) throw Error('無法取得 LINE ID Token，請重新登入 LINE');
    return true;
  }
  async function request(path, body, token = '') {
    const response = await fetch(CONFIG.API_BASE + path, {
      method: 'POST',
      headers: {'Content-Type':'application/json', ...(token ? {Authorization:'Bearer '+token} : {})},
      body: JSON.stringify(body)
    });
    let result;
    try { result = await response.json(); } catch { throw Error('HTTP_'+response.status); }
    if (!response.ok || !result.success) throw Error(result.error || 'HTTP_'+response.status);
    return result;
  }
  async function bind(event) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    $('bindSubmit').disabled = true;
    let temporaryToken = '';
    try {
      message('正在驗證會員帳號…');
      const identifier = $('identifier').value.trim();
      const password = $('password').value;
      const login = await request('/api/auth/login', {identifier,password});
      temporaryToken = login.token;
      if (!temporaryToken) throw Error('登入回傳缺少 Session');
      message('正在確認 LINE 身分…');
      if (!await initLine()) return; // LINE redirect, password must be re-entered afterward.
      const id_token = liff.getIDToken();
      message('正在綁定 LINE…');
      await request('/api/auth/line/bind', {password,id_token}, temporaryToken);
      // Keep the verified member session; never persist the password.
      localStorage.setItem(CONFIG.TOKEN_KEY,temporaryToken);
      localStorage.removeItem(CONFIG.MANUAL_LOGOUT_KEY);
      $('password').value = '';
      location.replace('./index.html');
    } catch (e) {
      console.error('[REGISTER/BIND]',e);
      message(({PASSWORD_INVALID:'密碼不正確',LINE_ALREADY_BOUND:'此 LINE 已綁定其他會員',ACCOUNT_LOCKED:'帳號暫時鎖定'})[e.message] || '綁定失敗：'+e.message);
    } finally {
      $('password').value = '';
      $('bindSubmit').disabled = false;
      busy = false;
    }
  }
  $('existingButton').addEventListener('click',()=>show('bindView'));
  $('newButton').addEventListener('click',()=>show('newView'));
  $('switchToBind').addEventListener('click',()=>show('bindView'));
  document.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>show('choiceView')));
  $('bindForm').addEventListener('submit',bind);
  // LINE redirect may occur here. Do not persist sensitive form data across redirects.
  initLine().catch(e => message('LINE 初始化失敗：'+e.message));
})();
