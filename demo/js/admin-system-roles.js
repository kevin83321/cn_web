'use strict';
(() => {
  const section = document.getElementById('systemRoleSection');
  const items = document.getElementById('items');
  if (!section || !items) return;
  const message = document.getElementById('systemRoleMessage');
  const status = document.getElementById('systemRoleStatus');
  const permissionView = document.getElementById('systemRolePermissions');
  const oldToggle = document.getElementById('systemRoleToggle');
  if (oldToggle) oldToggle.remove();
  let selectedId = null, actorId = null, canRead = false, canAssign = false, busy = false;
  const roleList = document.createElement('div');
  roleList.className = 'system-role-list';
  roleList.id = 'systemRoleList';
  permissionView.before(roleList);
  const errorText = err => (typeof errors !== 'undefined' && errors[err?.message]) || err?.message || 'UNKNOWN';
  const endpoint = id => '/api/admin/members/' + encodeURIComponent(id) + '/system-roles';

  async function refresh() {
    if (!canRead || !selectedId) return;
    const id = selectedId;
    section.hidden = false;
    status.textContent = '讀取中…';
    roleList.replaceChildren();
    permissionView.textContent = '';
    try {
      const result = await api(endpoint(id));
      if (selectedId !== id) return;
      const active = new Set((result.roles || []).filter(r => Number(r.enabled) === 1).map(r => r.system_role));
      status.textContent = `已指派 ${active.size} 個角色`;
      for (const definition of result.definitions || []) {
        const row = document.createElement('div');
        row.className = 'system-role-item';
        const info = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = `${definition.display_name} (${definition.system_role})`;
        const state = document.createElement('small');
        state.textContent = active.has(definition.system_role) ? '已指派' : '未指派';
        info.append(name, state);
        row.append(info);
        if (canAssign && id !== actorId) {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.role = definition.system_role;
          button.dataset.method = active.has(definition.system_role) ? 'DELETE' : 'PUT';
          button.textContent = active.has(definition.system_role) ? '撤銷角色' : '指派角色';
          button.disabled = busy || (result.member_status !== 'active' && !active.has(definition.system_role));
          row.append(button);
        }
        roleList.append(row);
      }
      if (!(result.definitions || []).length) status.textContent = '尚無可用角色';
      const effective = (result.permissions || []).filter(p => active.has(p.system_role) && Number(p.permission_enabled) === 1);
      permissionView.textContent = effective.length
        ? '已指派角色的權限：' + [...new Set(effective.map(p => p.permission_code))].join('、')
        : '目前沒有已指派角色的啟用權限。';
    } catch (err) {
      status.textContent = '讀取失敗';
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
    } catch (_) { /* existing auth UI handles authentication */ }
  }

  items.addEventListener('click', e => {
    const button = e.target.closest('[data-member-id]');
    if (!button || !canRead) return;
    selectedId = button.dataset.memberId;
    message.textContent = '';
    refresh();
  });
  document.getElementById('detailClose')?.addEventListener('click', () => {
    selectedId = null;
    section.hidden = true;
  });
  roleList.addEventListener('click', async e => {
    const button = e.target.closest('button[data-role]');
    if (!button || !selectedId || !canAssign || busy || selectedId === actorId) return;
    const id = selectedId, code = button.dataset.role, method = button.dataset.method;
    const verb = method === 'PUT' ? '指派' : '撤銷';
    if (!confirm(`確定要對 ${id} ${verb}「${code}」系統角色？\n異動後，該會員現有 Session 將失效。`)) return;
    busy = true;
    for (const b of roleList.querySelectorAll('button')) b.disabled = true;
    message.textContent = '處理中…';
    try {
      const result = await api(endpoint(id) + '/' + encodeURIComponent(code), { method });
      if (id !== selectedId) return;
      await refresh();
      message.textContent = result.changed ? `${verb}成功，已記錄稽核並撤銷現有 Session。` : '角色沒有變更。';
    } catch (err) {
      if (id === selectedId) {
        message.textContent = '更新失敗：' + errorText(err);
        await refresh();
      }
    } finally {
      busy = false;
      if (id === selectedId) await refresh();
    }
  });
  init();
})();
