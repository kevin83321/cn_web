'use strict';
import { $, api, getToken, errors } from './admin-common.js';

(() => {
  const LABELS = {
    'admin.members.read': '查看會員',
    'admin.members.update': '修改會員資料',
    'admin.members.role.update': '修改會員類型',
    'admin.members.status.update': '修改帳號狀態',
    'admin.audit.read': '查看稽核紀錄',
    'admin.roles.read': '查看會員系統角色',
    'admin.roles.assign': '指派管理員角色',
    'admin.roles.catalog.read': '查看角色目錄',
    'admin.roles.create': '建立角色',
    'admin.roles.permissions.manage': '設定角色權限'
  };
  const state = { catalog: null, selected: null, granted: [], detailRequest: 0, loading: false, saving: false };
  const errText = e => errors?.[e?.message] || e?.message || '未知錯誤';
  const node = (tag, value, cls) => {
    const el = document.createElement(tag);
    if (value !== undefined) el.textContent = String(value);
    if (cls) el.className = cls;
    return el;
  };
  const notice = text => { $('notice').textContent = text; };
  const has = permission => state.granted.includes(permission);
  const groupOf = code => {
    if (code.startsWith('admin.members.')) return '會員管理';
    if (code.startsWith('admin.roles.')) return '角色與權限';
    if (code.startsWith('admin.audit.')) return '稽核與紀錄';
    return '其他權限';
  };

  async function loadRoles() {
    if (state.loading) return;
    state.loading = true;
    $('reloadRoles').disabled = true;
    notice('正在載入角色…');
    try {
      const result = await api('/api/admin/roles');
      if (!Array.isArray(result.roles)) throw Error('INVALID_RESPONSE');
      state.catalog = result;
      const host = $('roles');
      host.replaceChildren();
      for (const role of result.roles) {
        const card = node('article', undefined, 'role-card');
        const info = node('div', undefined, 'role-card-info');
        const heading = node('div', undefined, 'role-card-heading');
        heading.append(node('strong', role.display_name || role.system_role));
        if (role.protected) heading.append(node('span', '受保護', 'role-protected'));
        info.append(heading, node('code', role.system_role, 'role-code'));
        info.append(node('p', `${Number(role.member_count) || 0} 位會員 · ${Number(role.permission_count) || 0} 項權限`));
        const button = node('button', '查看權限', 'role-secondary');
        button.type = 'button';
        button.addEventListener('click', () => openRole(role.system_role));
        card.append(info, button);
        host.append(card);
      }
      if (!result.roles.length) host.append(node('p', '目前沒有可顯示的角色', 'role-muted'));
      notice(`共 ${result.roles.length} 個系統角色`);
    } catch (e) {
      notice('讀取角色失敗：' + errText(e));
    } finally {
      state.loading = false;
      $('reloadRoles').disabled = false;
    }
  }

  function renderPermissions(detail) {
    const role = detail.role;
    const existing = new Set((detail.permissions || []).map(p => typeof p === 'string' ? p : p.permission_code));
    const assignable = new Set(state.catalog?.assignable_permission_codes || []);
    const canEdit = has('admin.roles.permissions.manage') && !role.protected;
    const groups = new Map();
    for (const p of state.catalog?.permissions || []) {
      const code = p.permission_code;
      if (!code || (!assignable.has(code) && !existing.has(code))) continue;
      const group = groupOf(code);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(p);
    }
    const host = $('permissionOptions');
    host.replaceChildren();
    for (const [groupName, permissions] of groups) {
      const section = node('fieldset', undefined, 'permission-group');
      section.append(node('legend', groupName));
      for (const p of permissions) {
        const label = node('label', undefined, 'permission-row');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = p.permission_code;
        checkbox.checked = existing.has(p.permission_code);
        checkbox.disabled = !canEdit || !p.enabled || !assignable.has(p.permission_code);
        const text = node('span', undefined, 'permission-description');
        text.append(node('strong', LABELS[p.permission_code] || p.description || p.permission_code));
        text.append(node('small', p.permission_code));
        if (!p.enabled) text.append(node('small', '此權限目前停用'));
        label.append(checkbox, text);
        section.append(label);
      }
      host.append(section);
    }
    if (!groups.size) host.append(node('p', '目前沒有可顯示的權限', 'role-muted'));
    $('saveButton').hidden = !canEdit;
    $('editTitle').textContent = `${role.display_name || role.system_role} · 權限設定`;
    $('editInfo').textContent = role.protected
      ? '受保護角色僅可檢視，不可修改權限。'
      : canEdit ? '調整勾選後儲存。變更可能使相關會員需要重新登入。' : '目前只有檢視權限。';
    $('permissionSummary').textContent = `已啟用 ${existing.size} 項角色權限`;
  }

  async function openRole(code) {
    const requestId = ++state.detailRequest;
    state.selected = null;
    $('editSection').hidden = false;
    $('permissionOptions').replaceChildren();
    $('saveButton').hidden = true;
    $('editMessage').textContent = '正在讀取權限…';
    try {
      const detail = await api('/api/admin/roles/' + encodeURIComponent(code) + '/permissions');
      if (requestId !== state.detailRequest) return;
      if (!detail.role) throw Error('INVALID_RESPONSE');
      state.selected = detail.role;
      renderPermissions(detail);
      $('editMessage').textContent = '';
      $('editSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      if (requestId === state.detailRequest) $('editMessage').textContent = '讀取失敗：' + errText(e);
    }
  }

  async function createRole(event) {
    event.preventDefault();
    const button = $('createButton');
    button.disabled = true;
    try {
      const code = $('roleCode').value.trim();
      await api('/api/admin/roles', {
        method: 'POST',
        body: {
          system_role: code,
          display_name: $('roleName').value.trim(),
          description: $('roleDescription').value.trim() || null
        }
      });
      $('createForm').reset();
      await loadRoles();
      await openRole(code);
      notice('角色已建立');
    } catch (e) {
      notice('建立失敗：' + errText(e));
    } finally {
      button.disabled = false;
    }
  }

  async function savePermissions(event) {
    event.preventDefault();
    if (state.saving || !state.selected || state.selected.protected || !has('admin.roles.permissions.manage')) return;
    const role = state.selected;
    const permissions = Array.from($('permissionOptions').querySelectorAll('input[type="checkbox"]:checked')).map(el => el.value);
    if (!confirm(`確定更新「${role.display_name}」的權限？相關會員可能需要重新登入。`)) return;
    state.saving = true;
    $('saveButton').disabled = true;
    $('editMessage').textContent = '正在儲存…';
    try {
      const result = await api('/api/admin/roles/' + encodeURIComponent(role.system_role) + '/permissions', {
        method: 'PUT', body: { permissions }
      });
      $('editMessage').textContent = result.changed === false ? '權限沒有變更。' : '權限已更新。';
      await loadRoles();
      await openRole(role.system_role);
      $('editMessage').textContent = result.changed === false ? '權限沒有變更。' : '權限已更新。';
    } catch (e) {
      $('editMessage').textContent = '儲存失敗：' + errText(e);
    } finally {
      state.saving = false;
      $('saveButton').disabled = false;
    }
  }

  async function init() {
    if (!getToken()) { location.replace('./index.html'); return; }
    $('reloadRoles').addEventListener('click', loadRoles);
    $('closeRole').addEventListener('click', () => {
      state.detailRequest++;
      state.selected = null;
      $('editSection').hidden = true;
    });
    $('createForm').addEventListener('submit', createRole);
    $('permissionForm').addEventListener('submit', savePermissions);
    try {
      const result = await api('/api/auth/permissions');
      state.granted = Array.isArray(result.permissions) ? result.permissions : [];
      if (!has('admin.roles.catalog.read')) { notice('沒有角色目錄檢視權限'); $('reloadRoles').disabled = true; return; }
      $('createSection').hidden = !has('admin.roles.create');
      await loadRoles();
    } catch (e) {
      notice('權限確認失敗：' + errText(e));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
