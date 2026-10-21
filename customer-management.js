'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const token = sessionStorage.getItem('member_session_token') || '';
  const gasUrl = sessionStorage.getItem('gas_url') || '';
  let busy = false;
  const secretPattern = /^(token|id_token|password|password_hash|salt|token_hash)$/i;
  function sanitize(value) {
    if (Array.isArray(value)) return value.map(sanitize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, secretPattern.test(k) ? '[REDACTED]' : sanitize(v)]));
    return value;
  }
  function print(result) { $('apiResult').textContent = JSON.stringify(sanitize(result), null, 2); }
  function status(message) { $('actionStatus').textContent = message; }
  function setBusy(value) { busy=value; $('customerPanel').querySelectorAll('button').forEach(b => b.disabled=value); }
  async function api(action, extra={}) {
    if (!token) throw new Error('尚未登入');
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(gasUrl)) throw new Error('找不到有效 GAS /exec URL，請返回會員中心儲存設定');
    const response = await fetch(gasUrl, {method:'POST', redirect:'follow', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action, token, ...extra})});
    if (!response.ok) throw new Error('API HTTP '+response.status);
    return response.json();
  }
  async function execute(action, payload, onSuccess) {
    if (busy) return;
    setBusy(true); status('處理中…');
    try {
      const result=await api(action,payload);
      print(result);
      if (!result.success) { status('失敗：'+(result.error||'未知錯誤')); return; }
      status('完成：'+action);
      if (onSuccess) await onSuccess(result);
    } catch(e) { status('錯誤：'+e.message); print({success:false,error:e.message}); }
    finally { setBusy(false); }
  }
  function get(id) { return $(id).value.trim(); }
  function confirmChange(text) { return window.confirm(text+'\n\n此操作將修改 Google Sheets 資料，確定繼續？'); }
  function renderCustomers(result) {
    // Different backend versions may return members/customers/data.
    const list = [result.customers, result.members, result.data].find(Array.isArray);
    if (!list) { $('customerCount').textContent='API 查詢成功，但回應沒有可辨識的陣列欄位；請查看下方 JSON。'; return; }
    $('customerCount').textContent='共 '+list.length+' 筆';
    const tbody=$('customerRows'); tbody.replaceChildren();
    if (!list.length) { const tr=tbody.insertRow(); const td=tr.insertCell();td.colSpan=4;td.textContent='目前沒有服務客戶';return; }
    list.forEach(item => {
      const m=item.customer||item.member||item;
      const tr=tbody.insertRow();
      [m.member_id||m.customer_member_id||item.customer_member_id||'', m.name||m.customer_name||'', item.distributor_member_id||item.service_distributor_member_id||'', item.status||m.status||''].forEach(v=>{const td=tr.insertCell();td.textContent=String(v);});
    });
  }
  async function reloadCustomers() { await execute('member_customers',{},renderCustomers); }
  $('backToMember').onclick=()=>{location.href='./index.html';};
  $('loadCustomers').onclick=reloadCustomers;
  $('assignForm').onsubmit=e=>{e.preventDefault();const customer_member_id=get('assignCustomer'),distributor_member_id=get('assignDistributor');if(!confirmChange('指定 '+distributor_member_id+' 服務 '+customer_member_id))return;execute('customer_service_assign',{customer_member_id,distributor_member_id},()=>{ $('assignForm').reset(); });};
  $('transferForm').onsubmit=e=>{e.preventDefault();const customer_member_id=get('transferCustomer'),distributor_member_id=get('transferDistributor');if(!confirmChange('將 '+customer_member_id+' 轉移給 '+distributor_member_id))return;execute('customer_service_transfer',{customer_member_id,distributor_member_id},()=>{$('transferForm').reset();});};
  $('endForm').onsubmit=e=>{e.preventDefault();const customer_member_id=get('endCustomer');if(!confirmChange('結束 '+customer_member_id+' 的服務關係'))return;execute('customer_service_end',{customer_member_id},()=>{$('endForm').reset();});};
  $('historyForm').onsubmit=e=>{e.preventDefault();execute('customer_service_history',{customer_member_id:get('historyCustomer')},r=>{$('historyResult').textContent=JSON.stringify(sanitize(r),null,2);});};
  (async()=>{
    if (!token||!gasUrl) { $('authStatus').textContent='尚未登入或缺少 GAS URL，請返回會員中心。'; return; }
    try {const r=await api('me');if(!r.success)throw Error(r.error||'SESSION_INVALID');$('authStatus').textContent='已登入：'+(r.member?.name||r.member?.member_id||'會員');$('customerPanel').classList.remove('hidden');}
    catch(e){$('authStatus').textContent='無法驗證 Session：'+e.message;}
  })();
})();
