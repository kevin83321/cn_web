'use strict';
(() => {
  const API_BASE = 'https://cn-web-backend.kevin83321.workers.dev';
  const TOKEN_KEY = 'member_session_token';
  const $ = id => document.getElementById(id);
  const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
  let customers = [];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function get(path) {
    const response = await fetch(API_BASE + path, {headers:{Authorization:'Bearer '+token},cache:'no-store'});
    const data = await response.json();
    if(!response.ok || !data.success) throw new Error(data.error || 'HTTP_'+response.status);
    return data;
  }
  function render() {
    const q = $('search').value.trim().toLowerCase();
    const filtered = customers.filter(r => [r.customer?.name,r.customer?.member_id,r.distributor_member_id].some(x=>String(x||'').toLowerCase().includes(q)));
    $('count').textContent = `符合 ${filtered.length} 筆／總計 ${customers.length} 筆`;
    $('rows').innerHTML = filtered.map(r => `<tr><td>${esc(r.customer?.name)}</td><td>${esc(r.customer?.member_id)}</td><td>${esc(r.customer?.role)}</td><td>${esc(r.distributor_member_id)}</td><td>${esc(r.created_at)}</td><td><button type="button" data-history="${esc(r.customer?.member_id)}">查看歷史</button></td></tr>`).join('') || '<tr><td colspan="6">沒有符合條件的客戶</td></tr>';
  }
  async function load() {
    if(!token) { $('message').textContent='尚未登入，請先返回會員中心';return; }
    $('reload').disabled=true;$('message').textContent='正在載入服務客戶…';
    try {
      await get('/api/auth/me');
      const result=await get('/api/customers');
      customers=result.customers || [];
      render();$('message').textContent='資料已更新';
    } catch(error) { $('message').textContent='載入失敗：'+error.message; }
    finally { $('reload').disabled=false; }
  }
  async function history(customerId) {
    $('historyPanel').hidden=false;$('historyMessage').textContent='正在查詢…';$('historyRows').innerHTML='';
    try {
      const result=await get('/api/customers/'+encodeURIComponent(customerId)+'/services');
      $('historyMessage').textContent=`${customerId}：${result.total} 筆服務紀錄`;
      $('historyRows').innerHTML=result.services.map(r=>`<tr><td>${esc(r.service_id)}</td><td>${esc(r.distributor_member_id)}</td><td>${esc(r.status)}</td><td>${esc(r.created_at)}</td></tr>`).join('') || '<tr><td colspan="4">沒有可查看的紀錄</td></tr>';
    } catch(error) { $('historyMessage').textContent='查詢失敗：'+error.message; }
  }
  $('reload').addEventListener('click',load);
  $('search').addEventListener('input',render);
  $('rows').addEventListener('click',e=>{const btn=e.target.closest('[data-history]');if(btn)history(btn.dataset.history);});
  load();
})();
