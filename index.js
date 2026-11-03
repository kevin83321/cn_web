'use strict';
(() => {
  const API_BASE = 'https://cn-web-backend.kevin83321.workers.dev';
  const LIFF_ID = '2012126330-D7gu42yk'; // Confirm against LINE Developers
  const TOKEN_KEY = 'member_session_token';
  const MANUAL_LOGOUT_KEY = 'member_manual_logout';
  const $ = id => document.getElementById(id);
  const views = ['loadingView','errorView','guestView','passwordView','dashboardView','accountView'];
  const state = { token: localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '', member: null, permissions: [], liffPromise: null, working: false };
  const features = [
    { id:'hierarchy', title:'會員階層', detail:'查看我的組織', icon:'♧', url:'./member-hierarchy.html', permission:'member.downline.read' },
    { id:'customers', title:'服務客戶', detail:'管理客戶關係', icon:'♧', url:'./customer-management.html', permission:'customer.read' },
    { id:'profile', title:'個人資料', detail:'查看會員資訊', icon:'◉', tab:'account', permission:'member.self.read' },
    { id:'account', title:'帳號設定', detail:'登入與安全', icon:'⚙', tab:'account', permission:null }
  ];
  const adminFeatures = [
    { title:'全部會員',detail:'管理會員資料',icon:'▦',permission:'admin.members.read',url:'./admin-members.html' },
    { title:'操作紀錄',detail:'查詢稽核紀錄',icon:'≡',permission:'admin.audit.read',url:'./admin-audit-logs.html' }
  ];

  function show(view) {
    for (const id of views) $(id).hidden = id !== view;
    $('bottomNav').hidden = !['dashboardView','accountView'].includes(view);
    $('profileButton').disabled = !state.member;
    document.querySelectorAll('[data-tab]').forEach(el => el.classList.toggle('active',el.dataset.tab === (view === 'accountView' ? 'account' : 'home')));
  }
  function busy(text='正在確認登入狀態…') { $('loadingText').textContent=text;show('loadingView'); }
  function fail(message) { $('errorText').textContent=message;show('errorView'); }
  function clearSession() {
    state.token='';state.member=null;state.permissions=[];
    localStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(TOKEN_KEY);
  }
  async function api(path,{method='GET',body,auth=true}={}) {
    const response=await fetch(API_BASE+path,{method,cache:'no-store',headers:{
      ...(auth&&state.token?{Authorization:'Bearer '+state.token}:{}),
      ...(body?{'Content-Type':'application/json'}:{})
    },...(body?{body:JSON.stringify(body)}:{})});
    let data;try{data=await response.json();}catch{throw new Error('HTTP_'+response.status);}
    if(!response.ok||!data.success){const err=new Error(data.error||'HTTP_'+response.status);err.status=response.status;throw err;}
    return data;
  }
  async function initLiff() {
    if(!window.liff) throw new Error('LINE SDK 載入失敗');
    if(!state.liffPromise) state.liffPromise=liff.init({liffId:LIFF_ID}).catch(e=>{state.liffPromise=null;throw e;});
    await state.liffPromise;
  }
  function redirectLine() {
    const redirectUri=location.origin+location.pathname+location.search;
    liff.login({redirectUri});
  }
  async function tryLine({interactive=false}={}) {
    await initLiff();
    if(!liff.isLoggedIn()) {
      if(interactive){redirectLine();return 'redirecting';}
      return 'guest';
    }
    const id_token=liff.getIDToken();
    if(!id_token) throw new Error('LINE_ID_TOKEN_MISSING');
    try {
      const data=await api('/api/auth/line',{method:'POST',body:{id_token},auth:false});
      state.token=data.token;
      localStorage.setItem(TOKEN_KEY,state.token);
      localStorage.removeItem(MANUAL_LOGOUT_KEY);
      return 'success';
    } catch(e) {
      if(e.message==='LINE_NOT_BOUND') {
        // Keep LINE session; the registration page may use its ID token.
        sessionStorage.setItem('cn_registration_reason','LINE_NOT_BOUND');
        location.replace('./register.html');
        return 'redirecting';
      }
      throw e;
    }
  }
  function can(permission) {
    // Permissions must be returned by a trusted backend endpoint.
    return permission === null || state.permissions.includes(permission);
  }
  function makeCard(item) {
    const btn=document.createElement('button');
    btn.className='feature-card';btn.type='button';
    const icon=document.createElement('span');icon.className='feature-icon';icon.textContent=item.icon;
    const title=document.createElement('strong');title.textContent=item.title;
    const detail=document.createElement('small');detail.textContent=item.detail;
    btn.append(icon,title,detail);
    btn.addEventListener('click',()=>{if(item.tab){show(item.tab==='account'?'accountView':'dashboardView');return;}if(item.url)location.href=item.url;});
    return btn;
  }
  async function loadPermissions() {
    // Backend permission endpoint not implemented yet. Do not grant write/admin
    // permissions from client-side role inference.
    try {
      const data=await api('/api/auth/permissions');
      state.permissions=Array.isArray(data.permissions)?data.permissions:[];
    } catch(e) {
      if(e.status!==404&&e.message!=='NOT_IMPLEMENTED') console.warn('權限查詢失敗',e.message);
      // Temporary compatibility: only show existing read-only navigation.
      state.permissions=['member.self.read'];
      if(state.member?.role==='distributor' && state.member?.status==='active')
        state.permissions.push('member.downline.read','customer.read');
    }
  }
  function renderDashboard() {
    const m=state.member||{};
    $('memberName').textContent=m.name||m.member_id||'會員';
    $('memberId').textContent=m.member_id||'—';
    $('memberRole').textContent=({distributor:'直銷商',lifestyle:'生活會員',non_member:'一般會員'})[m.role]||m.role||'會員';
    $('accountName').textContent=m.name||'會員';
    $('accountId').textContent=m.member_id||'—';
    const hour=new Date().getHours();
    $('greetingText').textContent=hour<11?'早安，歡迎回來':hour<18?'午安，歡迎回來':'晚安，歡迎回來';
    $('featureGrid').replaceChildren(...features.filter(x=>can(x.permission)).map(makeCard));
    const admin=adminFeatures.filter(x=>can(x.permission));
    $('adminSection').hidden=admin.length===0;
    $('adminGrid').replaceChildren(...admin.map(makeCard));
    show('dashboardView');
  }
  async function enterDashboard() {
    const result=await api('/api/auth/me');
    state.member=result.member;
    if(!state.member)throw new Error('MEMBER_NOT_FOUND');
    await loadPermissions();
    renderDashboard();
  }
  async function initialize() {
    if(state.working)return;
    state.working=true;busy();
    try {
      if(state.token) {
        try {await enterDashboard();return;}
        catch(e) {
          if(e.status!==401 && e.status!==403) throw e;
          clearSession();
        }
      }
      if(localStorage.getItem(MANUAL_LOGOUT_KEY)==='1') {show('guestView');return;}
      busy('正在使用 LINE 確認身分…');
      const result=await tryLine();
      if(result==='success') await enterDashboard();
      else if(result==='guest') show('guestView');
    } catch(e) {
      console.error('[AUTH]',e);
      fail(e.message==='Failed to fetch'?'網路連線異常，請檢查網路後重試':e.message);
    } finally {state.working=false;}
  }
  async function loginPassword(e) {
    e.preventDefault();if(state.working)return;
    state.working=true;busy('正在登入…');
    try {
      const data=await api('/api/auth/login',{method:'POST',body:{identifier:$('identifier').value.trim(),password:$('password').value},auth:false});
      state.token=data.token;
      localStorage.setItem(TOKEN_KEY,state.token);
      localStorage.removeItem(MANUAL_LOGOUT_KEY);
      $('password').value='';
      await enterDashboard();
    }catch(e){fail('登入失敗：'+e.message);}
    finally{state.working=false;}
  }
  async function logout() {
    if(!confirm('確定登出會員帳號？'))return;
    try{await api('/api/auth/logout',{method:'POST'});}catch(e){console.warn('登出 API 回應',e.message);}
    clearSession();localStorage.setItem(MANUAL_LOGOUT_KEY,'1');
    // Do not call liff.logout(): manual logout should not force a new LINE redirect.
    show('guestView');
  }
  $('retryButton').addEventListener('click',initialize);
  $('manualLoginButton').addEventListener('click',()=>show('passwordView'));
  $('passwordLoginButton').addEventListener('click',()=>show('passwordView'));
  $('backToLineButton').addEventListener('click',()=>show('guestView'));
  $('passwordForm').addEventListener('submit',loginPassword);
  $('lineLoginButton').addEventListener('click',async()=>{
    if(state.working)return;
    state.working=true;busy('正在連線 LINE…');
    try{
      localStorage.removeItem(MANUAL_LOGOUT_KEY);
      const result=await tryLine({interactive:true});
      if(result==='success')await enterDashboard();
    }catch(e){fail(e.message);}finally{state.working=false;}
  });
  $('logoutButton').addEventListener('click',logout);
  $('profileButton').addEventListener('click',()=>show('accountView'));
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.tab==='account'?'accountView':'dashboardView')));
  initialize();
})();
