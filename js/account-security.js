/* Phase 8.3 - self-service account security */
'use strict';
(() => {
  const BASE = 'https://cn-web-backend.kevin83321.workers.dev';
  const LIFF_ID = '2012126330-D7gu42yk';
  const $ = id => document.getElementById(id);
  const token = () => localStorage.getItem('member_session_token') || sessionStorage.getItem('member_session_token') || '';
  const show = (message, error=false) => { $('message').textContent=message; $('message').style.color=error?'#b42318':'#3156ac'; };
  const notify = (message, error=false) => { show(message, error); window.alert(message); };
  let status = null;
  async function api(path, options={}) {
    const t=token();
    if(!t) { location.replace('./index.html'); throw Error('UNAUTHORIZED'); }
    const response=await fetch(BASE+path, {method:options.method||'GET',cache:'no-store',headers:{Authorization:'Bearer '+t,...(options.body?{'Content-Type':'application/json'}:{})},...(options.body?{body:JSON.stringify(options.body)}:{})});
    const data=await response.json();
    if(!response.ok || !data.success) throw Error(data.error || 'REQUEST_FAILED');
    return data;
  }
  async function refresh() {
    const data=await api('/api/auth/account-security');
    status=data.account;
    $('identifier').textContent=status.identifier || '未設定';
    $('passwordStatus').textContent=status.password_enabled?'已啟用':'未啟用';
    $('lineStatus').textContent=status.line_bound?'已綁定':'未綁定';
    $('bindLine').hidden=status.line_bound || !status.password_enabled;
    $('unbindLine').hidden=!status.line_bound || !status.password_enabled;
  }
  async function lineIdToken() {
    if(typeof liff==='undefined') throw Error('LINE_SDK_UNAVAILABLE');
    await liff.init({liffId:LIFF_ID});
    if(!liff.isLoggedIn()) {
      sessionStorage.setItem('cn_security_line_bind','1');
      liff.login({redirectUri:location.href});
      return null;
    }
    const id=liff.getIDToken();
    if(!id) throw Error('LINE_ID_TOKEN_MISSING');
    return id;
  }
  async function bindLine() {
    if(status?.line_bound) return;
    const password=prompt('請輸入目前的帳號密碼以確認 LINE 綁定：');
    if(password===null) return;
    if(!password) {show('請輸入目前密碼',true);return;}
    try {
      show('正在確認 LINE 身分…');
      const id_token=await lineIdToken();
      if(!id_token) return;
      await api('/api/auth/line/bind',{method:'POST',body:{password,id_token}});
      sessionStorage.removeItem('cn_security_line_bind');
      await refresh();show('LINE 綁定成功');
    } catch(e) {show('LINE 綁定失敗：'+e.message,true);}
  }
  async function unbindLine() {
    if(!status?.line_bound) return;
    const password=prompt('解除 LINE 綁定後，其他裝置將登出。請輸入目前密碼：');
    if(password===null) return;
    if(!password) {show('請輸入目前密碼',true);return;}
    if(!confirm('確定解除 LINE 綁定？')) return;
    try {await api('/api/auth/line/unbind',{method:'POST',body:{password}});await refresh();show('已解除 LINE 綁定');}
    catch(e){show('解除失敗：'+e.message,true);}
  }
  async function changePassword(event) {
    event.preventDefault();
    const form=event.currentTarget, current=form.elements.current.value, next=form.elements.next.value;
    if(next!==form.elements.confirm.value) {notify('新密碼與確認密碼不一致',true);return;}
    if(!/^(?=.{12,128}$)(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/.test(next)) {notify('密碼需 12–128 字元，包含英文大小寫、數字及特殊符號',true);return;}
    const button=form.querySelector('button[type=submit]');button.disabled=true;
    try {await api('/api/auth/change-password',{method:'POST',body:{current_password:current,new_password:next}});form.reset();notify('密碼修改成功！其他裝置的 Session 已撤銷。');await refresh();}
    catch(e){notify('密碼修改失敗：'+e.message,true);}
    finally{button.disabled=false;}
  }
  document.addEventListener('DOMContentLoaded',async()=>{
    $('passwordForm').addEventListener('submit',changePassword);
    $('bindLine').addEventListener('click',bindLine);
    $('unbindLine').addEventListener('click',unbindLine);
    try {if(window.CNAuthGuardReady) await window.CNAuthGuardReady;await refresh();show('');}
    catch(e){show('載入失敗：'+e.message,true);return;}
    if(sessionStorage.getItem('cn_security_line_bind')==='1') {
      sessionStorage.removeItem('cn_security_line_bind');
      show('LINE 已登入，請再次點選「綁定 LINE」並輸入密碼完成綁定');
    }
  });
})();
