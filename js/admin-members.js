'use strict';
(() => {
  // admin-common.js provides $, esc, api, TOKEN, errors.
  const state = { page: 1, pageSize: 20, total: 0, loading: false };
  const permissions = { read: false, profile: false, role: false, status: false };
  const roleNames = { distributor: '直銷商', lifestyle: '生活會員', non_member: '一般會員' };
  const statusNames = { active: '啟用', inactive: '停用', suspended: '暫停' };
  let selected = null;
  let busy = false;

  function errorText(error) {
    const code = error && error.message ? error.message : 'UNKNOWN';
    return (typeof errors !== 'undefined' && errors[code]) || code;
  }
  function params() {
    const p = new URLSearchParams({ page: String(state.page), page_size: String(state.pageSize) });
    for (const key of ['role', 'status']) if ($(key).value) p.set(key, $(key).value);
    if ($('query').value.trim()) p.set('q', $('query').value.trim());
    return p.toString();
  }
  function itemCard(r) {
    return `<article class="admin-item"><div class="admin-item-head"><strong>${esc(r.name)}</strong><span class="admin-pill">${esc(roleNames[r.role] || r.role)}</span></div><dl><div><dt>會員 ID</dt><dd>${esc(r.member_id)}</dd></div><div><dt>狀態</dt><dd>${esc(statusNames[r.status] || r.status)}</dd></div><div><dt>建立時間</dt><dd>${esc(r.created_at)}</dd></div></dl><button type="button" class="detail-open" data-member-id="${esc(r.member_id)}">查看詳細資料</button></article>`;
  }
  async function load() {
    if (state.loading) return;
    state.loading = true;
    $('message').textContent = '正在載入…';
    $('previous').disabled = $('next').disabled = true;
    try {
      const d = await api('/api/admin/members?' + params());
      if (!Array.isArray(d.items)) throw Error('INVALID_RESPONSE');
      state.total = Number(d.total) || 0;
      state.page = Number(d.page) || state.page;
      $('items').innerHTML = d.items.map(itemCard).join('') || '<p class="admin-empty">沒有符合條件的紀錄</p>';
      $('count').textContent = `共 ${state.total} 筆`;
      $('pageInfo').textContent = `第 ${state.page} / ${Math.max(1, Math.ceil(state.total / state.pageSize))} 頁`;
      $('message').textContent = '';
      $('previous').disabled = state.page <= 1;
      $('next').disabled = state.page * state.pageSize >= state.total;
    } catch (e) {
      $('message').textContent = '查詢失敗：' + errorText(e);
      $('items').replaceChildren();
    } finally { state.loading = false; }
  }
  function setBusy(value) {
    busy = value;
    $('detailSave').disabled = value;
    $('roleSave').disabled = value;
    $('statusToggle').disabled = value;
    $('detailClose').disabled = value;
  }
  function displayMember(m) {
    selected = m;
    $('detailId').value = m.member_id;
    $('detailName').value = m.name || '';
    $('detailEmail').value = m.email || '';
    $('detailPhone').value = m.phone || '';
    $('detailCreated').value = m.created_at || '';
    for (const key of ['detailName', 'detailEmail', 'detailPhone']) $(key).readOnly = !permissions.profile;
    $('detailSave').hidden = !permissions.profile;
    const knownRole = Object.hasOwn(roleNames, m.role);
    $('detailRole').value = knownRole ? m.role : 'non_member';
    // Do not silently overwrite an unknown legacy role.
    $('detailRole').disabled = !permissions.role || !knownRole;
    $('roleSave').hidden = !permissions.role || !knownRole;
    $('roleMessage').textContent = knownRole ? '' : `目前會員類型「${m.role}」不在可編輯清單，請先確認後端資料。`;
    $('statusLabel').textContent = statusNames[m.status] || m.status;
    const ownAccount = m.member_id === currentActorId();
    const editableStatus = permissions.status && ['active', 'inactive'].includes(m.status) && !ownAccount;
    $('statusToggle').hidden = !editableStatus;
    $('statusToggle').textContent = m.status === 'active' ? '停用會員' : '重新啟用會員';
    $('statusToggle').classList.toggle('phase6-danger', m.status === 'active');
    $('statusToggle').classList.toggle('phase6-primary', m.status === 'inactive');
    $('statusMessage').textContent = ownAccount ? '不可變更自己的帳號狀態。' :
      (!['active', 'inactive'].includes(m.status) ? '此狀態目前僅支援檢視。' : '');
  }
  // Resolve actor identity from /api/members/me only when needed. Do not trust UI for authorization.
  let actorId = null;
  function currentActorId() { return actorId; }
  async function init() {
    if (!TOKEN) { location.replace('./index.html'); return; }
    try {
      const p = await api('/api/auth/permissions');
      const granted = Array.isArray(p.permissions) ? p.permissions : [];
      permissions.read = granted.includes('admin.members.read');
      permissions.profile = granted.includes('admin.members.update');
      permissions.role = granted.includes('admin.members.role.update');
      permissions.status = granted.includes('admin.members.status.update');
      if (!permissions.read) { $('message').textContent = '此帳號沒有管理員查詢權限'; return; }
      // Actor identity is only a UI safeguard; the Worker independently blocks self-deactivation.
      try {
        const me = await api('/api/members/me');
        actorId = me.member?.member_id || me.member_id || me.data?.member_id || null;
      } catch (_) { /* Backend is authoritative. */ }
      await load();
    } catch (e) { $('message').textContent = '權限驗證失敗：' + errorText(e); }
  }
  async function openDetail(id) {
    if (busy) return;
    $('memberDetail').hidden = false;
    $('detailMessage').textContent = '正在載入會員資料…';
    $('roleMessage').textContent = $('statusMessage').textContent = '';
    try {
      const d = await api('/api/admin/members/' + encodeURIComponent(id));
      if (!d.member) throw Error('INVALID_RESPONSE');
      displayMember(d.member);
      $('detailMessage').textContent = permissions.profile ? '可修改姓名、Email、電話。' : '基本資料為唯讀。';
      $('memberDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { selected = null; $('detailMessage').textContent = '讀取失敗：' + errorText(e); }
  }
  $('items').addEventListener('click', e => {
    const button = e.target.closest('[data-member-id]');
    if (button) openDetail(button.dataset.memberId);
  });
  $('detailClose').addEventListener('click', () => {
    if (busy) return;
    $('memberDetail').hidden = true;
    selected = null;
  });
  $('detailForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!permissions.profile || !selected || busy) return;
    const body = {
      name: $('detailName').value.trim(),
      email: $('detailEmail').value.trim() || null,
      phone: $('detailPhone').value.trim() || null
    };
    setBusy(true);
    $('detailMessage').textContent = '儲存中…';
    try {
      const d = await api('/api/admin/members/' + encodeURIComponent(selected.member_id), { method: 'PATCH', body });
      if (d.member) displayMember(d.member);
      $('detailMessage').textContent = d.changed ? '基本資料已儲存，操作紀錄已建立。' : '資料沒有變更。';
      await load();
    } catch (err) { $('detailMessage').textContent = '儲存失敗：' + errorText(err); }
    finally { setBusy(false); }
  });
  $('roleForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!permissions.role || !selected || busy) return;
    const role = $('detailRole').value;
    if (role === selected.role) { $('roleMessage').textContent = '會員類型沒有變更。'; return; }
    if (!Object.hasOwn(roleNames, role)) return;
    if (!window.confirm(`確定將會員 ${selected.member_id} 的類型從「${roleNames[selected.role] || selected.role}」改為「${roleNames[role]}」？`)) return;
    setBusy(true);
    $('roleMessage').textContent = '更新中…';
    try {
      const d = await api('/api/admin/members/' + encodeURIComponent(selected.member_id) + '/role', { method: 'PATCH', body: { role } });
      if (d.member) displayMember(d.member);
      $('roleMessage').textContent = d.changed ? '會員類型已更新，稽核紀錄已建立。' : '會員類型沒有變更。';
      await load();
    } catch (err) {
      $('roleMessage').textContent = '更新失敗：' + errorText(err);
      // Refresh server state after a possible concurrency conflict.
      try { const d = await api('/api/admin/members/' + encodeURIComponent(selected.member_id)); if (d.member) displayMember(d.member); } catch (_) {}
    } finally { setBusy(false); }
  });
  $('statusToggle').addEventListener('click', async () => {
    if (!permissions.status || !selected || busy) return;
    const id = selected.member_id;
    const next = selected.status === 'active' ? 'inactive' : 'active';
    if (!['active', 'inactive'].includes(selected.status)) return;
    const message = next === 'inactive'
      ? `確定停用會員 ${id}？\n\n停用後該會員的所有現有 Session 將被撤銷，必須重新啟用才能登入。`
      : `確定重新啟用會員 ${id}？\n\n原有 Session 不會恢復，會員需要重新登入。`;
    if (!window.confirm(message)) return;
    setBusy(true);
    $('statusMessage').textContent = '處理中…';
    try {
      const d = await api('/api/admin/members/' + encodeURIComponent(id) + '/status', { method: 'PATCH', body: { status: next } });
      if (d.member) displayMember(d.member);
      $('statusMessage').textContent = d.changed ? '帳號狀態已更新，稽核紀錄已建立。' : '帳號狀態沒有變更。';
      await load();
    } catch (err) {
      $('statusMessage').textContent = '更新失敗：' + errorText(err);
      try { const d = await api('/api/admin/members/' + encodeURIComponent(id)); if (d.member) displayMember(d.member); } catch (_) {}
    } finally { setBusy(false); }
  });
  $('filters').addEventListener('submit', e => { e.preventDefault(); state.page = 1; load(); });
  $('previous').addEventListener('click', () => { if (state.page > 1) { state.page--; load(); } });
  $('next').addEventListener('click', () => { if (state.page * state.pageSize < state.total) { state.page++; load(); } });
  init();
})();
