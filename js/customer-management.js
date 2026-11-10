'use strict';
import { CONFIG } from './config.js';

(() => {
  const $ = id => document.getElementById(id);
  const state = { customers: [], actor: null, busy: false, writable: false, historyId: null, options: { customers: [], distributors: [] } };
  const esc = value => String(value ?? '—').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const messages = {
    UNAUTHORIZED: '登入已失效，請重新登入', FORBIDDEN: '目前帳號沒有操作權限',
    OUTSIDE_MANAGEMENT_SCOPE: '會員不在可管理的組織範圍內', INVALID_ARGUMENT: '請檢查會員 ID',
    INVALID_JSON: '請求格式不正確', MEMBER_NOT_FOUND: '找不到指定會員',
    MEMBER_INACTIVE: '會員帳號未啟用', INVALID_CUSTOMER_ROLE: '此會員類型不能成為服務客戶',
    INVALID_DISTRIBUTOR_ROLE: '指定會員不是直銷商',
    CUSTOMER_ALREADY_ASSIGNED: '此客戶已有有效服務關係',
    CUSTOMER_NOT_ASSIGNED: '此客戶目前沒有有效服務關係',
    SERVICE_CONFLICT: '服務關係已被其他操作變更，請重新載入',
    PASSWORD_CHANGE_REQUIRED: '請先返回會員中心修改密碼',
    RESULT_TOO_LARGE: '查詢結果過多，請聯絡管理員',
    POSSIBLE_DUPLICATE_CUSTOMER: 'Email 或電話已存在，請先查詢既有會員，避免重複建立',
    CREATE_CONFLICT: '資料建立衝突，請重新確認', INVALID_FIELDS: '送出的欄位不正確'
  };
  const explain = error => messages[error?.message] || error?.message || '未知錯誤';
  const getToken = () => localStorage.getItem(CONFIG.TOKEN_KEY) || sessionStorage.getItem(CONFIG.TOKEN_KEY) || '';

  async function request(path, method = 'GET', body) {
    await window.CNAuthGuardReady;
    const token = getToken();
    if (!token) throw Error('UNAUTHORIZED');
    const response = await fetch(CONFIG.API_BASE + path, {
      method, cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    let data;
    try { data = await response.json(); } catch { throw Error('HTTP_' + response.status); }
    if (!response.ok || !data.success) throw Error(data.error || 'HTTP_' + response.status);
    return data;
  }

  function setBusy(busy) {
    state.busy = busy;
    $('reload').disabled = busy;
    $('createButton').disabled = busy || !state.writable;
    for (const id of ['createName','createEmail','createPhone']) $(id).disabled = busy || !state.writable;
    $('operation').disabled = busy || !state.writable;
    $('customerId').disabled = busy || !state.writable;
    $('distributorId').disabled = busy || !state.writable;
    $('submitAction').disabled = busy || !state.writable;
  }

  const labelOf = (member) => `${member.name || '未命名'} (${member.member_id})`;
  function fillSelect(id, items, placeholder) {
    const select = $(id);
    const selected = select.value;
    select.replaceChildren(new Option(placeholder, ''));
    for (const member of items) select.add(new Option(labelOf(member), member.member_id));
    if (items.some(m => m.member_id === selected)) select.value = selected;
  }
  function updateCurrentService() {
    const id = $('customerId').value.trim();
    const customer = state.options.customers.find(m => m.member_id === id)
      || state.customers.find(r => r.customer?.member_id === id)?.customer;
    $('customerInfo').textContent = customer ? `客戶：${labelOf(customer)}` : (id ? '將以輸入的會員 ID 查詢並操作' : '');
    $('currentService').textContent = customer?.current_distributor_id
      ? `目前服務：${customer.current_distributor_name || '未命名'} (${customer.current_distributor_id})`
      : '';
  }
  async function loadOptions(preselectCustomer = '') {
    if (!state.writable) return;
    const operation = $('operation').value;
    try {
      const result = await request('/api/customers/options?operation=' + encodeURIComponent(operation));
      state.options = { customers: result.customers || [], distributors: result.distributors || [] };
      fillSelect('distributorId', state.options.distributors, '請選擇直銷商');
      if (preselectCustomer) $('customerId').value = preselectCustomer;
      updateCurrentService();
    } catch (error) {
      $('actionMessage').textContent = '載入可選會員失敗：' + explain(error);
    }
  }

  function updateOperation() {
    const operation = $('operation').value;
    const ending = operation === 'end-service';
    $('distributorField').hidden = ending;
    $('distributorId').required = !ending;
    $('operationHint').textContent = {
      assign: '指派尚未有有效服務關係的客戶。',
      transfer: '將已有服務關係的客戶轉給另一位直銷商。',
      'end-service': '結束客戶目前的服務關係，歷史紀錄會保留。'
    }[operation];
    $('submitAction').textContent = {
      assign: '確認指派', transfer: '確認轉移', 'end-service': '確認結束服務'
    }[operation];
    updateCurrentService();
  }

  function render() {
    const q = $('search').value.trim().toLowerCase();
    const filtered = state.customers.filter(r =>
      [r.customer?.name, r.customer?.member_id, r.distributor_member_id, state.options.distributors.find(d => d.member_id === r.distributor_member_id)?.name]
        .some(v => String(v || '').toLowerCase().includes(q)));
    $('count').textContent = `符合 ${filtered.length} 筆／總計 ${state.customers.length} 筆`;
    $('rows').innerHTML = filtered.map(r => `
      <tr>
        <td>${esc(r.customer?.name)}</td><td>${esc(r.customer?.member_id)}</td>
        <td>${esc(r.customer?.role)}</td><td>${esc(state.options.distributors.find(d => d.member_id === r.distributor_member_id)?.name || '—')} (${esc(r.distributor_member_id)})</td>
        <td>${esc(r.created_at)}</td>
        <td><button type="button" data-history="${esc(r.customer?.member_id)}">查看歷史</button>
        <button type="button" data-transfer="${esc(r.customer?.member_id)}" data-distributor="${esc(r.distributor_member_id)}" ${state.writable ? '' : 'disabled'}>轉移</button>
        <button type="button" data-end="${esc(r.customer?.member_id)}" ${state.writable ? '' : 'disabled'}>結束</button></td>
      </tr>`).join('') || '<tr><td colspan="6">沒有符合條件的客戶</td></tr>';
  }

  async function load() {
    if (state.busy) return;
    $('reload').disabled = true;
    $('message').textContent = '正在載入服務客戶…';
    try {
      const result = await request('/api/customers');
      state.customers = Array.isArray(result.customers) ? result.customers : [];
      render();
      $('message').textContent = '資料已更新';
    } catch (error) {
      $('message').textContent = '載入失敗：' + explain(error);
    } finally { $('reload').disabled = state.busy; }
  }

  async function history(customerId) {
    state.historyId = customerId;
    $('historyPanel').hidden = false;
    $('historyMessage').textContent = '正在查詢…';
    $('historyRows').replaceChildren();
    try {
      const result = await request('/api/customers/' + encodeURIComponent(customerId) + '/services');
      $('historyMessage').textContent = `${customerId}：${result.total} 筆服務紀錄`;
      $('historyRows').innerHTML = (Array.isArray(result.services) ? result.services : [])
        .map(r => `<tr><td>${esc(r.service_id)}</td><td>${esc(r.distributor_member_id)}</td>
          <td>${esc(r.status)}</td><td>${esc(r.created_at)}</td></tr>`).join('') ||
        '<tr><td colspan="4">沒有可查看的紀錄</td></tr>';
    } catch (error) {
      $('historyMessage').textContent = '查詢失敗：' + explain(error);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!state.writable || state.busy) return;
    const operation = $('operation').value;
    const customer = $('customerId').value.trim();
    const distributor = $('distributorId').value.trim();
    if (!customer || (operation !== 'end-service' && !distributor)) {
      $('actionMessage').textContent = '請填寫必要的會員 ID'; return;
    }
    if (operation !== 'end-service' && customer === distributor) {
      $('actionMessage').textContent = '客戶與服務直銷商不能是同一人'; return;
    }
    const labels = { assign: '指派', transfer: '轉移', 'end-service': '結束' };
    const customerLabel = labelOf(state.options.customers.find(m => m.member_id === customer) || state.customers.find(r => r.customer?.member_id === customer)?.customer || { member_id: customer });
    const distributorLabel = labelOf(state.options.distributors.find(m => m.member_id === distributor) || { member_id: distributor });
    const detail = operation === 'end-service'
      ? `確定結束客戶 ${customerLabel} 的服務關係？\n歷史紀錄會保留。`
      : `確定將客戶 ${customerLabel} ${labels[operation]}至直銷商 ${distributorLabel}？`;
    if (!window.confirm(detail)) return;
    setBusy(true);
    $('actionMessage').textContent = '正在處理…';
    try {
      const body = { customer_member_id: customer };
      if (operation !== 'end-service') body.distributor_member_id = distributor;
      const result = await request('/api/customers/' + operation, 'POST', body);
      $('actionMessage').textContent = result.changed === false
        ? '服務關係沒有變更。' : '操作成功，服務關係與稽核紀錄已更新。';
      if (result.changed !== false) $('manageForm').reset();
      updateOperation();
      setBusy(false);
      await load();
      await loadOptions();
      if (state.historyId === customer) await history(customer);
    } catch (error) {
      $('actionMessage').textContent = '操作失敗：' + explain(error);
      setBusy(false);
    }
  }

  async function createCustomer(event) {
    event.preventDefault();
    if (!state.writable || state.busy) return;
    const name = $('createName').value.trim();
    const email = $('createEmail').value.trim();
    const phone = $('createPhone').value.trim();
    if (!name) { $('createMessage').textContent = '請輸入客戶姓名'; return; }
    if (!window.confirm(`確定新增客戶「${name}」，並指派給自己？`)) return;
    setBusy(true);
    $('createMessage').textContent = '正在建立客戶…';
    try {
      const result = await request('/api/customers/create', 'POST', { name, email, phone });
      $('createMessage').textContent = `建立成功！客戶 ID：${result.customer_member_id}（尚未啟用登入）`;
      $('createForm').reset();
      setBusy(false);
      await load();
      await loadOptions();
    } catch (error) {
      $('createMessage').textContent = '建立失敗：' + explain(error);
      setBusy(false);
    }
  }

  async function init() {
    updateOperation();
    setBusy(true);
    try {
      const [me, perms] = await Promise.all([
        request('/api/auth/me'), request('/api/auth/permissions')
      ]);
      state.actor = me.member || null;
      console.log('[Phase 7] Actor:', state.actor);
      console.log('[Phase 7] Status:', state.actor?.status);
      console.log('[Phase 7] Permissions:', perms.permissions);
      const granted = Array.isArray(perms.permissions) ? perms.permissions : [];
      if (!granted.includes('customer.read') || state.actor?.role !== 'distributor') {
        $('permissionMessage').textContent = '目前帳號無權使用客戶服務管理。';
        $('message').textContent = '無權查詢客戶資料';
        return;
      }
      // Current Worker write endpoints authorize by active distributor role and subtree,
      // rather than a dedicated customer.write permission. Backend remains authoritative.
      state.writable = state.actor.status === 'active';
      $('permissionMessage').textContent = state.writable
        ? '可管理授權組織範圍內的服務關係。' : '帳號目前不可修改服務關係。';
    } catch (error) {
      $('permissionMessage').textContent = '權限驗證失敗：' + explain(error);
      return;
    } finally { setBusy(false); }
    await loadOptions();
    await load();
  }

  $('operation').addEventListener('change', async () => { updateOperation(); await loadOptions(); });
  $('customerId').addEventListener('input', updateCurrentService);
  $('manageForm').addEventListener('submit', submit);
  $('createForm').addEventListener('submit', createCustomer);
  $('reload').addEventListener('click', load);
  $('search').addEventListener('input', render);
  $('rows').addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button || state.busy) return;
    if (button.dataset.history) { history(button.dataset.history); return; }
    if (!state.writable) return;
    if (button.dataset.transfer) {
      $('operation').value = 'transfer';
      updateOperation();
      await loadOptions(button.dataset.transfer);
      $('distributorId').value = '';
      $('customerId').scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('distributorId').focus();
    } else if (button.dataset.end) {
      $('operation').value = 'end-service';
      updateOperation();
      await loadOptions(button.dataset.end);
      $('customerId').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
  init();
})();
