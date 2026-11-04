
/** Shared CN App Shell: DOM only; does not own auth or API sessions. */
'use strict';
(()=>{
 const root=document.querySelector('.app-shell');if(!root)return;
 const page=document.body.dataset.page||'home';
 const pages={home:['CN 會員中心','Member Portal'],hierarchy:['會員階層','CN MEMBER PORTAL'],customers:['服務客戶','CN MEMBER PORTAL'],members:['會員管理','CN MEMBER PORTAL'],audit:['操作紀錄','CN MEMBER PORTAL'],register:['加入 CN','CN MEMBER PORTAL']};
 const title=pages[page]||pages.home;
 const header=document.getElementById('appHeader');
 if(header){
  if(page==='home')header.innerHTML=`<div class="brand"><span class="brand-icon">CN</span><div><strong>CN 會員中心</strong><small>Member Portal</small></div></div><button id="profileButton" class="avatar" aria-label="帳號設定" disabled>人</button>`;
  else header.innerHTML=`<a class="header-back" href="./index.html" aria-label="返回會員中心">‹</a><div class="header-heading"><strong>${title[0]}</strong><small>${title[1]}</small></div><span class="header-mark">CN</span>`;
 }
 const nav=document.getElementById('appFooter');if(!nav)return;
 if(page==='register'){nav.hidden=true;root.style.paddingBottom='0';return}
 if(page==='home'){
  nav.innerHTML=`<button type="button" class="nav-item active" data-tab="home"><span>⌂</span><small>首頁</small></button><button type="button" class="nav-item" data-tab="account"><span>◯</span><small>我的</small></button>`;
  return;
 }
 const items=[['home','⌂','首頁','./index.html',null],['hierarchy','♧','階層','./member-hierarchy.html','member.downline.read'],['customers','◫','客戶','./customer-management.html','customer.read'],['members','▦','管理','./admin-members.html','admin.members.read']];
 function render(perms){
  nav.innerHTML='';for(const [key,icon,label,url,permission] of items){
   if(permission&&perms&&!perms.includes(permission))continue;
   if(permission&&!perms)continue;
   const a=document.createElement('a');a.href=url;a.className='nav-item'+((page===key||(page==='audit'&&key==='members'))?' active':'');
   if(page===key||(page==='audit'&&key==='members'))a.setAttribute('aria-current','page');
   const symbol=document.createElement('span');symbol.textContent=icon;
   const text=document.createElement('small');text.textContent=label;a.append(symbol,text);nav.append(a);
  }
 }
 render(null);
 const token=localStorage.getItem('member_session_token')||sessionStorage.getItem('member_session_token');
 if(!token)return;
 fetch('https://cn-web-backend.kevin83321.workers.dev/api/auth/permissions',{headers:{Authorization:'Bearer '+token},cache:'no-store'})
 .then(r=>{if(!r.ok)throw Error('PERMISSIONS');return r.json()})
 .then(d=>{if(d.success&&Array.isArray(d.permissions))render(d.permissions)})
 .catch(()=>{});
})();
