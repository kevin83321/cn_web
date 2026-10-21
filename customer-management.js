'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const token = sessionStorage.getItem('member_session_token') || '';
  const gasUrl = sessionStorage.getItem('gas_url') || '';
  let busy = false;
  let actorId = "";
  let actorIsAdmin = false;
  let distributors = [];
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
  function fillSelect(id, items, selected) {
    const el=$(id); const previous=selected||el.value; el.replaceChildren();
    const empty=new Option('請選擇直銷商','');el.add(empty);
    items.forEach(m=>el.add(new Option((m.name||'未命名')+'（'+m.member_id+'）',m.member_id)));
    if(items.some(m=>m.member_id===previous))el.value=previous;
    else if(!actorIsAdmin && items.some(m=>m.member_id===actorId))el.value=actorId;
  }
  async function loadDistributors() {
    const r=await api('distributor_search');
    if(!r.success)throw Error(r.error||'DISTRIBUTOR_SEARCH_FAILED');
    distributors=r.members||[];
    ['createParent','createDistributor','assignDistributor','transferDistributor'].forEach(id=>fillSelect(id,distributors));
    if(!actorIsAdmin) {
      $('createParent').value=actorId;
      $('createDistributor').value=actorId;
      $('createParent').disabled=true;
      $('createDistributor').disabled=true;
    }
  }
  function updateRoleFields() {
    const distributor=get('createRole')==='distributor';
    $('createServiceBox').classList.toggle('hidden',distributor);
    $('createDistributor').required=!distributor;
  }
  function showSearchResult(r) {
    const rows=$('searchCustomerRows');rows.replaceChildren();
    $('searchCustomerStatus').textContent='找到 '+(r.members||[]).length+' 位會員';
    if(!(r.members||[]).length) {const td=rows.insertRow().insertCell();td.colSpan=5;td.textContent='沒有符合條件的會員';return;}
    r.members.forEach(m=>{
      const tr=rows.insertRow();
      [m.member_id,m.name,m.role,m.service_status==='assigned'?'已指定：'+m.distributor_member_id:m.service_status==='duplicate'?'資料異常：重複服務':'尚未指定'].forEach(value=>{tr.insertCell().textContent=String(value||'');});
      const cell=tr.insertCell();const b=document.createElement('button');b.type='button';b.textContent='選取';b.className='muted';
      b.onclick=()=>{$('assignCustomer').value=m.member_id;if(m.service_status==='assigned'){$('transferCustomer').value=m.member_id;$('endCustomer').value=m.member_id;}$('historyCustomer').value=m.member_id;status('已選取 '+m.name+'（'+m.member_id+'）');};cell.appendChild(b);
    });
  }
  $('searchCustomerForm').onsubmit=e=>{e.preventDefault();execute('customer_search',{query:get('customerQuery')},showSearchResult);};
  $('refreshDistributors').onclick=async()=>{if(busy)return;setBusy(true);try{await loadDistributors();status('已更新直銷商清單');}catch(e){status('查詢失敗：'+e.message);}finally{setBusy(false);}};
  $('createRole').onchange=updateRoleFields;
  $('createMemberForm').onsubmit=e=>{
    e.preventDefault();const name=get('createName'),role=get('createRole');
    const parent_member_id=actorIsAdmin?get('createParent'):actorId;
    const distributor_member_id=actorIsAdmin?get('createDistributor'):actorId;
    if(!parent_member_id||(role!=='distributor'&&!distributor_member_id)){status('請選擇上線與服務直銷商');return;}
    if(!confirmChange('建立 '+name+'（'+role+'）'))return;
    execute('customer_create',{name,role,parent_member_id,distributor_member_id},async r=>{
      $('createMemberForm').reset();updateRoleFields();await loadDistributors();
      if(r.member){$('assignCustomer').value=r.member.member_id;$('historyCustomer').value=r.member.member_id;}
      status('建立成功：'+(r.member?.member_id||'')+(r.service_created?'（已指定服務）':'（直銷商已建立）'));
      try {const customers=await api('member_customers');if(customers.success)renderCustomers(customers);}catch(e){console.warn('CUSTOMER_REFRESH_FAILED',e);}
    });
  };

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
    try {const r=await api('me');if(!r.success)throw Error(r.error||'SESSION_INVALID');$('authStatus').textContent='已登入：'+(r.member?.name||r.member?.member_id||'會員');actorId=r.member?.member_id||'';const self=await api('member_self');actorIsAdmin=!!(self.member?.system_admin||self.system_admin||r.member?.system_admin);const admins=await api('admin_members');if(admins.success)actorIsAdmin=true;$('customerPanel').classList.remove('hidden');updateRoleFields();await loadDistributors();}
    catch(e){$('authStatus').textContent='無法驗證 Session：'+e.message;}
  })();
})();
