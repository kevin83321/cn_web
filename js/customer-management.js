'use strict';
import { CONFIG } from './config.js';

(() => {
  
  const $ = id => document.getElementById(id);
  const token = localStorage.getItem(CONFIG.TOKEN_KEY) || sessionStorage.getItem(CONFIG.TOKEN_KEY) || '';
  const state = { customers: [], actor: null, busy: false };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

  const ERROR_MESSAGES = {
    UNAUTHORIZED: '登入已失效，請返回會員中心重新登入',
    FORBIDDEN: '目前帳號沒有操作權限',
    OUTSIDE_MANAGEMENT_SCOPE: '會員不在可管理範圍內',
    INVALID_ARGUMENT: '請檢查會員 ID 是否正確',
    MEMBER_INACTIVE: '會員狀態不是有效狀態',
    CUSTOMER_ALREADY_ASSIGNED: '此客戶已有有效服務關係',
    CUSTOMER_NOT_ASSIGNED: '此客戶目前沒有有效服務關係',
    SERVICE_CONFLICT: '服務關係已被其他操作更新，請重新載入'
  };

  function explain(error) {
    return ERROR_MESSAGES[error.message] || error.message;
  }

  async function request(path, method = 'GET', body = undefined) {
    await window.CNAuthGuardReady;
    const response = await fetch(CONFIG.API_BASE + path, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: 'Bearer ' + token,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    let data;
    try { data = await response.json(); }
    catch { throw new Error('HTTP_' + response.status); }
    if (!response.ok || !data.success) throw new Error(data.error || 'HTTP_' + response.status);
    return data;
  }

  function setBusy(busy) {
    state.busy = busy;
    $('reload').disabled = busy;
    $('submitAction').disabled = busy || !canManage();
    $('operation').disabled = busy || !canManage();
    $('customerId').disabled = busy || !canManage();
    $('distributorId').disabled = busy || !canManage();
  }

  function canManage() {
    return state.actor?.role === 'distributor' && state.actor?.status === 'active';
  }

  function updateOperation() {
    const op = $('operation').value;
    const needsDistributor = op !== 'end-service';
    $('distributorField').hidden = !needsDistributor;
    $('distributorId').required = needsDistributor;
    $('submitAction').textContent = ({
      assign: '確認指派', transfer: '確認轉移', 'end-service': '確認結束服務'
    })[op];
    $('operationHint').textContent = ({
      assign: '客戶必須尚未有有效服務關係。',
      transfer: '將原服務關係改為 inactive，再建立新的 active 關係。',
      'end-service': '結束目前有效的服務關係；歷史資料仍會保留。'
    })[op];
  }

  function render() {
    const q = $('search').value.trim().toLowerCase();
    const filtered = state.customers.filter(r =>
      [r.customer?.name, r.customer?.member_id, r.distributor_member_id]
        .some(x => String(x || '').toLowerCase().includes(q))
    );
    $('count').textContent = `符合 ${filtered.length} 筆／總計 ${state.customers.length} 筆`;
    $('rows').innerHTML = filtered.map(r => {
      const cid = esc(r.customer?.member_id);
      const did = esc(r.distributor_member_id);
      return `<tr>
        <td data-label="客戶姓名">${esc(r.customer?.name)}</td>
        <td data-label="客戶 ID"><code>${cid}</code></td>
        <td data-label="會員類型">${esc(r.customer?.role)}</td>
        <td data-label="服務直銷商"><code>${did}</code></td>
        <td data-label="建立時間">${esc(r.created_at)}</td>
        <td class="row-actions" data-label="操作">
          <button type="button" data-history="${cid}">查看歷史</button>
          ${canManage() ? `<button type="button" data-transfer="${cid}">轉移</button>
          <button type="button" class="danger" data-end="${cid}">結束服務</button>` : ''}
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="6">沒有符合條件的客戶</td></tr>';
  }

  async function load() {
    if (!token) {
      $('message').textContent = '尚未登入，請先返回會員中心';
      $('permissionMessage').textContent = '請先登入';
      return;
    }
    setBusy(true);
    $('message').textContent = '正在載入服務客戶…';
    try {
      const me = await request('/api/auth/me');
      state.actor = me.member;
      $('permissionMessage').textContent = canManage()
        ? '目前可操作服務關係（實際可管理範圍由後端驗證）。'
        : '目前帳號僅提供查詢，不能異動服務關係。';
      const result = await request('/api/customers');
      if (!Array.isArray(result.customers)) throw new Error('API_CUSTOMERS_FORMAT_ERROR');
      state.customers = result.customers;
      render();
      $('message').textContent = '資料已更新';
    } catch (error) {
      state.actor = null;
      $('permissionMessage').textContent = '無法確認權限';
      $('message').textContent = '載入失敗：' + explain(error);
    } finally {
      setBusy(false);
    }
  }

  async function history(customerId) {
    $('historyPanel').hidden = false;
    $('historyMessage').textContent = '正在查詢…';
    $('historyRows').innerHTML = '';
    try {
      const result = await request('/api/customers/' + encodeURIComponent(customerId) + '/services');
      if (!Array.isArray(result.services)) throw new Error('API_SERVICES_FORMAT_ERROR');
      $('historyMessage').textContent = `${customerId}：${result.total ?? result.services.length} 筆服務紀錄`;
      $('historyRows').innerHTML = result.services.map(r => `<tr>
        <td data-label="服務 ID">${esc(r.service_id)}</td><td data-label="服務直銷商">${esc(r.distributor_member_id)}</td>
        <td>${esc(r.status)}</td><td data-label="建立時間">${esc(r.created_at)}</td>
      </tr>`).join('') || '<tr><td colspan="4">沒有可查看的紀錄</td></tr>';
    } catch (error) {
      $('historyMessage').textContent = '查詢失敗：' + explain(error);
    }
  }

  function fillForm(operation, customerId) {
    $('operation').value = operation;
    $('customerId').value = customerId;
    $('distributorId').value = '';
    updateOperation();
    $('actionMessage').textContent = '';
    $('manageForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (operation === 'transfer') $('distributorId').focus();
  }

  async function submitAction(event) {
    event.preventDefault();
    if (state.busy || !canManage()) return;
    const operation = $('operation').value;
    const customer_member_id = $('customerId').value.trim();
    const distributor_member_id = $('distributorId').value.trim();
    if (!customer_member_id || (operation !== 'end-service' && !distributor_member_id)) {
      $('actionMessage').textContent = '請填寫必要的會員 ID';
      return;
    }
    const descriptions = {
      assign: `將客戶 ${customer_member_id} 指派給 ${distributor_member_id}？`,
      transfer: `將客戶 ${customer_member_id} 轉移給 ${distributor_member_id}？`,
      'end-service': `確定結束客戶 ${customer_member_id} 的目前服務關係？`
    };
    if (!window.confirm(descriptions[operation])) return;

    setBusy(true);
    $('actionMessage').textContent = '正在處理…';
    try {
      const body = { customer_member_id };
      if (operation !== 'end-service') body.distributor_member_id = distributor_member_id;
      const result = await request('/api/customers/' + operation, 'POST', body);
      $('actionMessage').textContent = result.changed === false ? '沒有需要變更的資料' : '操作成功，已更新服務關係';
      // Only reload after mutation completes; do not send duplicate writes.
      await load();
      $('actionMessage').textContent = result.changed === false ? '沒有需要變更的資料' : '操作成功，列表已更新';
    } catch (error) {
      $('actionMessage').textContent = '操作失敗：' + explain(error);
    } finally {
      setBusy(false);
    }
  }

  $('reload').addEventListener('click', load);
  $('search').addEventListener('input', render);
  $('operation').addEventListener('change', updateOperation);
  $('manageForm').addEventListener('submit', submitAction);
  $('rows').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.history !== undefined) history(button.dataset.history);
    if (button.dataset.transfer !== undefined && canManage()) fillForm('transfer', button.dataset.transfer);
    if (button.dataset.end !== undefined && canManage()) fillForm('end-service', button.dataset.end);
  });
  updateOperation();
  load();
})();
