/* Phase 8.3 - self-service account security */
'use strict';
import { CONFIG } from './config.js';

(() => {
  
  const $ = id => document.getElementById(id);
  const token = () => localStorage.getItem(CONFIG.TOKEN_KEY) || sessionStorage.getItem(CONFIG.TOKEN_KEY) || '';
  const show = (message, error=false) => { $('message').textContent=message; $('message').style.color=error?'#b42318':'#3156ac'; };
  const notify = (message, error=false) => { show(message, error); window.alert(message); };
  let status = null;
  async function api(path, options={}) {
    const t=token();
    if(!t) { location.replace('./index.html'); throw Error('UNAUTHORIZED'); }
    const response=await fetch(CONFIG.API_BASE+path, {method:options.method||'GET',cache:'no-store',headers:{Authorization:'Bearer '+t,...(options.body?{'Content-Type':'application/json'}:{})},...(options.body?{body:JSON.stringify(options.body)}:{})});
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
    await liff.init({liffId:CONFIG.LIFF_ID});
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
  const formatDate = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '未知' : d.toLocaleString('zh-TW'); };
  const sessionMessage = (message, error=false) => { $('sessionsMessage').textContent=message; $('sessionsMessage').style.color=error?'#b42318':'#3156ac'; };
  async function refreshSessions() {
    const container=$('sessionList');
    sessionMessage('正在載入登入裝置…');
    try {
      const data=await api('/api/auth/sessions');
      container.replaceChildren();
      const sessions=data.sessions||[];
      if(!sessions.length) { sessionMessage('沒有有效的登入工作階段'); return; }
      sessionMessage(`目前有 ${sessions.length} 個有效 Session`);
      for(const session of sessions) {
        const card=document.createElement('article');card.className='session-card'+(session.is_current?' current':'');
        const title=document.createElement('div');title.className='session-title';
        title.textContent=(session.is_current?'目前使用的裝置 · ':'')+(session.user_agent||'未知裝置');
        const meta=document.createElement('div');meta.className='session-meta';
        meta.textContent=`登入：${formatDate(session.created_at)} ｜ 最後活動：${formatDate(session.last_seen_at)} ｜ 到期：${formatDate(session.expires_at)}`;
        card.append(title,meta);
        if(!session.is_current) {
          const button=document.createElement('button');button.className='secondary';button.type='button';button.textContent='登出此裝置';
          button.addEventListener('click',async()=>{
            if(!confirm('確定登出這個裝置？')) return;
            button.disabled=true;
            try { await api('/api/auth/sessions/'+encodeURIComponent(session.session_id)+'/revoke',{method:'POST'});await refreshSessions();alert('已登出指定裝置'); }
            catch(e) {sessionMessage('登出失敗：'+e.message,true);alert('登出失敗：'+e.message);button.disabled=false;}
          });card.append(button);
        }
        container.append(card);
      }
    } catch(e) { sessionMessage('載入失敗：'+e.message,true); }
  }
  async function revokeOthers() {
    if(!confirm('確定登出其他所有裝置？目前這個裝置會保留登入。')) return;
    const button=$('revokeOtherSessions');button.disabled=true;
    try { const data=await api('/api/auth/sessions/revoke-others',{method:'POST'});await refreshSessions();alert(`已登出 ${data.revoked} 個其他裝置`); }
    catch(e) {sessionMessage('操作失敗：'+e.message,true);alert('操作失敗：'+e.message);}
    finally {button.disabled=false;}
  }
  const eventLabels = {
    password_login_success:'密碼登入成功',password_login_failed:'密碼登入失敗',
    password_account_locked:'密碼帳號鎖定',line_login_success:'LINE 登入成功',
    member_password_change:'會員修改密碼',admin_auth_account_password_reset:'管理員重設密碼',
    admin_auth_account_unlock:'管理員解除帳號鎖定',
    member_session_revoke:'登出指定裝置',member_sessions_revoke_others:'登出其他所有裝置'
  };
  async function refreshSecurityEvents() {
    const list=$('securityEventsList'), message=$('securityEventsMessage');
    message.textContent='正在載入安全紀錄…';
    try {
      const data=await api('/api/auth/security-events?limit=30');
      list.replaceChildren();
      const events=data.events||[];
      message.textContent=events.length?`最近 ${events.length} 筆安全紀錄`:'目前沒有安全紀錄';
      for(const item of events) {
        const card=document.createElement('article');card.className='security-event';
        const title=document.createElement('strong');title.textContent=eventLabels[item.type]||'帳號安全事件';
        const detail=document.createElement('div');detail.className='session-meta';
        detail.textContent=formatDate(item.at)+(item.device?' ｜ '+item.device:'');
        card.append(title,detail);list.append(card);
      }
    } catch(e) { message.textContent='載入失敗：'+e.message; }
  }
  document.addEventListener('DOMContentLoaded',async()=>{
    $('refreshSessions').addEventListener('click',refreshSessions);
    $('refreshSecurityEvents').addEventListener('click',refreshSecurityEvents);
    $('revokeOtherSessions').addEventListener('click',revokeOthers);
    $('passwordForm').addEventListener('submit',changePassword);
    $('bindLine').addEventListener('click',bindLine);
    $('unbindLine').addEventListener('click',unbindLine);
    try {if(window.CNAuthGuardReady) await window.CNAuthGuardReady;await refresh();show('');await refreshSessions();await refreshSecurityEvents();}
    catch(e){show('載入失敗：'+e.message,true);return;}
    if(sessionStorage.getItem('cn_security_line_bind')==='1') {
      sessionStorage.removeItem('cn_security_line_bind');
      show('LINE 已登入，請再次點選「綁定 LINE」並輸入密碼完成綁定');
    }
  });
})();
