'use strict';

const $=id=>document.getElementById(id);

const CONFIG={gasUrl:'',liffId:''}; // 正式部署時可填入固定值

const TOKEN_KEY='member_session_token';

let sessionToken=sessionStorage.getItem(TOKEN_KEY)||'';

let liffReady=false;

let busy=false;

$('api').value=CONFIG.gasUrl||sessionStorage.getItem('gas_url')||'';

$('liffid').value=CONFIG.liffId||localStorage.getItem('liff_id')||'';

function notice(s){$('notice').textContent=s||'';}

function display(data){

 const safe=JSON.parse(JSON.stringify(data));

 if(safe&&typeof safe==='object'){delete safe.token;delete safe.id_token;delete safe.password;}

 $('result').textContent=JSON.stringify(safe,null,2);

}

function setBusy(v){busy=v;document.querySelectorAll('button').forEach(b=>b.disabled=v);}

async function run(fn){if(busy)return;setBusy(true);notice('');try{await fn();}catch(e){notice(e.message||String(e));display({success:false,error:e.message||String(e)});}finally{setBusy(false);}}

function gasUrl(){
 const url=$('api').value.trim();
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(url))
   throw Error('請填寫正確的 GAS /exec URL');
 return url;
}
function saveSettings(){sessionStorage.setItem('gas_url',gasUrl());const id=$('liffid').value.trim();if(id)localStorage.setItem('liff_id',id);notice('設定已儲存');}

async function api(action,extra={}){

 const res=await fetch(gasUrl(),{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...extra})});

 if(!res.ok)throw Error('API HTTP '+res.status);

 return await res.json();

}

function showLoggedIn(member,expires){$('loginPanel').classList.add('hidden');$('memberPanel').classList.remove('hidden');$('memberInfo').textContent=`會員：${member.name||''}（${member.member_id||''}）｜角色：${member.role||''}`;$('expiresInfo').textContent=expires?'Session 到期時間：'+new Date(expires).toLocaleString('zh-TW'):'';}

function showLoggedOut(){sessionToken='';sessionStorage.removeItem(TOKEN_KEY);$('memberPanel').classList.add('hidden');$('loginPanel').classList.remove('hidden');$('confirmPassword').value='';$('password').value='';$('downlineSummary').textContent='';$('downlineResult').textContent='尚未查詢會員階層';}

async function restore(){if(!sessionToken){showLoggedOut();return;}const r=await api('me',{token:sessionToken});display(r);if(!r.success){showLoggedOut();notice('Session 已失效，請重新登入');return;}showLoggedIn(r.member,r.expires_at);await checkBinding(false);}

async function acceptLogin(r){display(r);if(!r.success||!r.token){notice('登入失敗：'+(r.error||'未知錯誤'));return;}sessionToken=r.token;sessionStorage.setItem(TOKEN_KEY,sessionToken);sessionStorage.setItem('gas_url',gasUrl());await restore();}

async function ensureLiff(){if(liffReady)return true;if(!window.liff)throw Error('LIFF SDK 尚未載入');const id=$('liffid').value.trim();if(!id)throw Error('請先設定 LIFF ID');localStorage.setItem('liff_id',id);await liff.init({liffId:id});liffReady=true;if(!liff.isLoggedIn()){liff.login({redirectUri:location.origin+location.pathname+location.search});return false;}return true;}

function tokenExpired(jwt){try{const p=jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');const payload=JSON.parse(atob(p));return !payload.exp||Date.now()>=Number(payload.exp)*1000-60000;}catch(_){return true;}}

async function lineToken(){if(!await ensureLiff())return null;const idToken=liff.getIDToken();if(!idToken||tokenExpired(idToken)){

 liff.logout();liffReady=false;notice('LINE 授權已過期，請重新登入 LINE');

 // LINE SDK logout 後重新初始化，再發起登入，避免依賴已登出的 SDK 狀態。

 await liff.init({liffId:$('liffid').value.trim()});liffReady=true;

 liff.login({redirectUri:location.origin+location.pathname+location.search});return null;

 }return idToken;}

async function checkBinding(render=true){const r=await api('line_status',{token:sessionToken});if(render)display(r);if(!r.success){if(r.error==='UNAUTHORIZED'){showLoggedOut();notice('Session 已失效');}else notice(r.error||'查詢失敗');return;}$('bindInfo').textContent=r.bound?'LINE 綁定狀態：已綁定':'LINE 綁定狀態：尚未綁定';}

$('saveSettings').onclick=()=>run(async()=>saveSettings());

$('loginForm').onsubmit=e=>{e.preventDefault();run(async()=>{const r=await api('login',{username:$('username').value.trim(),password:$('password').value});await acceptLogin(r);});};

$('lineLogin').onclick=()=>run(async()=>{const id_token=await lineToken();if(!id_token)return;await acceptLogin(await api('line_login',{id_token}));});

$('refresh').onclick=()=>run(restore);
$('openHierarchy').onclick=()=>{if(!sessionToken){notice('請先登入會員');return;}sessionStorage.setItem('gas_url',gasUrl());window.location.assign('./member-hierarchy.html');};

$('openCustomerManagement').onclick=()=>{if(!sessionToken){notice('請先登入會員');return;}sessionStorage.setItem('gas_url',gasUrl());window.location.assign('./customer-management.html');};

$('checkBind').onclick=()=>run(()=>checkBinding(true));

$('bind').onclick=()=>run(async()=>{if(!sessionToken)throw Error('請先登入會員');const password=$('confirmPassword').value;if(!password)throw Error('請輸入會員密碼');const id_token=await lineToken();if(!id_token)return;const r=await api('line_bind',{token:sessionToken,password,id_token});display(r);$('confirmPassword').value='';if(r.success){notice('LINE 綁定成功');await checkBinding(false);}else notice('綁定失敗：'+(r.error||'未知錯誤'));});

$('unbind').onclick=()=>run(async()=>{if(!sessionToken)throw Error('請先登入會員');const password=$('confirmPassword').value;if(!password)throw Error('請輸入會員密碼');if(!confirm('確定解除 LINE 綁定？解除後將無法使用 LINE 登入，直到重新綁定。'))return;const r=await api('line_unbind',{token:sessionToken,password});display(r);$('confirmPassword').value='';if(r.success){notice('已解除 LINE 綁定');await checkBinding(false);}else notice('解除失敗：'+(r.error||'未知錯誤'));});

$('logout').onclick=()=>run(async()=>{const t=sessionToken;showLoggedOut();try{const r=await api('logout',{token:t});display(r);notice(r.success?'已登出':'已清除本機登入狀態，後端登出回應：'+(r.error||'失敗'));}catch(e){notice('已清除本機登入狀態；無法確認伺服器 Session 是否撤銷：'+e.message);}});

$('memberSelf').onclick=()=>run(async()=>{

 if(!sessionToken)throw Error('請先登入會員');

 const r=await api('member_self',{token:sessionToken});display(r);

 $('downlineSummary').textContent=r.success?'會員資料查詢成功':'查詢失敗：'+(r.error||'未知錯誤');

 $('downlineResult').textContent=JSON.stringify(r,null,2);

});

$('memberDownline').onclick=()=>run(async()=>{

 if(!sessionToken)throw Error('請先登入會員');

 const r=await api('member_downline',{token:sessionToken});display(r);

 const list=Array.isArray(r.members)?r.members:Array.isArray(r.downline)?r.downline:Array.isArray(r.data)?r.data:null;

 $('downlineSummary').textContent=!r.success?'查詢失敗：'+(r.error||'未知錯誤'):list?'查詢成功，共 '+list.length+' 名下線會員':'查詢成功（請檢查回應欄位結構）';

 $('downlineResult').textContent=JSON.stringify(r,null,2);

});


// Stage 9B: read-only API test controls.
const stage9Actions = {
  testAdminMembers: 'admin_members',
  testMemberCustomers: 'member_customers',
  testAdminAuditLogs: 'admin_audit_logs'
};
Object.entries(stage9Actions).forEach(([buttonId, action]) => {
  $(buttonId).addEventListener('click', () => run(async () => {
    if (!sessionToken) throw Error('請先登入會員');
    const payload = {token: sessionToken};
    if (action === 'admin_audit_logs') payload.limit = 20;
    const response = await api(action, payload);
    display(response);
    $('stage9Result').textContent = JSON.stringify(redactSecrets(response), null, 2);
    $('stage9Status').textContent = response.success
      ? action + ' 查詢成功'
      : action + ' 查詢失敗：' + (response.error || '未知錯誤');
  }));
});
function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [
      key, /^(token|id_token|password|password_hash|salt|token_hash)$/i.test(key)
        ? '[REDACTED]' : redactSecrets(val)
    ]));
  }
  return value;
}

if(sessionToken)run(restore);else showLoggedOut();
