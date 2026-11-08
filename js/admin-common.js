'use strict';
const API_BASE='https://cn-web-backend.kevin83321.workers.dev';
const TOKEN=localStorage.getItem('member_session_token')||sessionStorage.getItem('member_session_token')||'';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const errors={UNAUTHORIZED:'登入已失效，正在返回登入頁面',FORBIDDEN:'沒有管理員查詢權限',INVALID_FILTER:'篩選條件不正確',INVALID_PAGINATION:'分頁參數不正確'};
async function api(path, options={}){await window.CNAuthGuardReady;const r=await fetch(API_BASE+path,{cache:'no-store',method:options.method||'GET',headers:{Authorization:'Bearer '+TOKEN,...(options.body!==undefined?{'Content-Type':'application/json'}:{})},...(options.body!==undefined?{body:JSON.stringify(options.body)}:{})});let d;try{d=await r.json()}catch{throw Error('HTTP_'+r.status)}if(!r.ok||!d.success){const e=new Error(d.error||'HTTP_'+r.status);e.status=r.status;throw e}return d}
