'use strict';
(() => {
  // This module attaches to the existing Phase 6 member detail UI without changing its API logic.
  const section = document.getElementById('systemRoleSection');
  const toggle = document.getElementById('systemRoleToggle');
  const status = document.getElementById('systemRoleStatus');
  const message = document.getElementById('systemRoleMessage');
  const permissionsView = document.getElementById('systemRolePermissions');
  const detail = document.getElementById('memberDetail');
  const detailId = document.getElementById('detailId');
  if (!section || !toggle || !detail) return;
  let canRead = false, canAssign = false, selectedId = null, enabled = false, busy = false;
  let actorId = null;
  const errorText = err => (typeof errors !== 'undefined' && errors[err?.message]) || err?.message || 'UNKNOWN';
  const endpoint = id => '/api/admin/members/' + encodeURIComponent(id) + '/system-roles';
  async function refresh() {
    if (!canRead || !selectedId) return;
    const id = selectedId;
    section.hidden = false;
    status.textContent = '讀取中…';
    toggle.hidden = true;
    message.textContent = '';
    try {
      const result = await api(endpoint(id));
      if (id !== selectedId) return;
      enabled = (result.roles || []).some(r => r.system_role === 'admin' && Number(r.enabled) === 1);
      status.textContent = enabled ? '已啟用' : '未啟用';
      const entries = (result.permissions || []).filter(p => p.system_role === 'admin');
      permissionsView.textContent = entries.length ? 'admin 權限：' + entries.map(p => p.permission_code + (Number(p.permission_enabled) ? '' : '（停用）')).join('、') : '尚未配置 admin 權限。';
      toggle.hidden = !canAssign || id === actorId;
      toggle.textContent = enabled ? '撤銷管理員角色' : '指派管理員角色';
    } catch (err) {
      status.textContent = '無法讀取';
      message.textContent = '讀取失敗：' + errorText(err);
    }
  }
  async function init() {
    if (typeof TOKEN === 'undefined' || !TOKEN) return;
    try {
      const p = await api('/api/auth/permissions');
      canRead = (p.permissions || []).includes('admin.roles.read');
      canAssign = (p.permissions || []).includes('admin.roles.assign');
      if (!canRead) return;
      const me = await api('/api/auth/me');
      actorId = me.member?.member_id || null;
    } catch (_) { return; }
  }
  // The detail form is populated asynchronously by Phase 6 code. Observe its ID field.
  // Poll-free MutationObserver does not detect input.value property assignments, so hook
  // into the detail-opening click and fetch after the existing detail request settles.
  document.getElementById('items')?.addEventListener('click', async e => {
    const button = e.target.closest('[data-member-id]');
    if (!button || !canRead) return;
    selectedId = button.dataset.memberId;
    section.hidden = false;
    await refresh();
  });
  document.getElementById('detailClose')?.addEventListener('click', () => {
    selectedId = null;
    section.hidden = true;
  });
  toggle.addEventListener('click', async () => {
    if (!selectedId || !canAssign || busy || selectedId === actorId) return;
    const id = selectedId;
    const method = enabled ? 'DELETE' : 'PUT';
    const verb = enabled ? '撤銷' : '指派';
    if (!confirm(`確定${verb}會員 ${id} 的 admin 系統角色？\n角色變更後，該會員的既有 Session 將失效。`)) return;
    busy = true;
    toggle.disabled = true;
    message.textContent = '處理中…';
    try {
      const result = await api(endpoint(id) + '/admin', { method });
      if (id !== selectedId) return;
      await refresh();
      message.textContent = result.changed ? `${verb}成功，稽核紀錄已建立。` : '角色沒有變更。';
    } catch (err) {
      if (id === selectedId) { message.textContent = '更新失敗：' + errorText(err); await refresh(); }
    } finally { busy = false; toggle.disabled = false; }
  });
  init();
})();
