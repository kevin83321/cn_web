
'use strict';

import {
  $,
  esc,
  api,
  getToken,
  errors
} from './admin-common.js';

(() => {
  const state = {
    page: 1,
    pageSize: 20,
    total: 0,
    loading: false,
    authorized: false,
    canEdit: false,
    canEditHierarchy: false,
    canEditService: false,
    selectedServicer: null,
    serviceMode: 'assign',
    serviceSearchRequestId: 0,
    relationships: null,
    selectedParent: null,
    parentSearchRequestId: 0,
    selected: null,
    detailRequestId: 0,
    listRequestId: 0
  };

  const READ_PERMISSION = 'admin.members.read';
  const UPDATE_PERMISSION = 'admin.members.update';
  const HIERARCHY_PERMISSION = 'admin.members.hierarchy.update';
  const SERVICE_PERMISSION = 'admin.members.service.update';

  const roleNames = {
    distributor: '直銷商',
    lifestyle: '生活會員',
    non_member: '一般會員'
  };

  const statusNames = {
    active: '有效',
    inactive: '停用',
    suspended: '暫停'
  };

  const roleText = value =>
    roleNames[value] || value || '—';

  const statusText = value =>
    statusNames[value] || value || '—';

  const errorText = error => {
    const code = error?.message || 'UNKNOWN_ERROR';

    return errors[code] || ('操作失敗：' + code);
  };

  function setMessage(text) {
    const element = $('message');
    if (element) element.textContent = text;
  }

  function setDetailMessage(text) {
    const element = $('detailMessage');
    if (element) element.textContent = text;
  }

  function setSearchDisabled(disabled) {
    const button =
      $('searchButton') ||
      $('filters')?.querySelector('[type="submit"]');

    if (button) button.disabled = disabled;
  }

  function setFiltersDisabled(disabled) {
    $('filters')
      ?.querySelectorAll('input, select, button')
      .forEach(element => {
        element.disabled = disabled;
      });
  }

  function params() {
    const p = new URLSearchParams({
      page: String(state.page),
      page_size: String(state.pageSize)
    });

    for (const key of ['role', 'status']) {
      const value = $(key)?.value || '';
      if (value) p.set(key, value);
    }

    const query = $('query')?.value.trim() || '';
    if (query) p.set('q', query);

    return p.toString();
  }

  function itemCard(member) {
    const memberId = String(member.member_id || '');
    const isSelected = state.selected?.member_id === memberId;
    return `
      <article class="admin-item member-compact-card${isSelected ? ' is-selected' : ''}">
        <div class="member-compact-info">
          <div class="member-compact-identity">
            <strong>${esc(member.name || '未設定姓名')}</strong>
            <span class="member-compact-id">(${esc(memberId)})</span>
          </div>
          <div class="member-compact-meta">
            <span>${esc(roleText(member.role))}</span>
            <span class="member-status-tag">${esc(statusText(member.status))}</span>
          </div>
        </div>
        <button type="button" class="detail-open member-compact-action"
          data-member-id="${esc(memberId)}" aria-label="查看 ${esc(member.name || memberId)} 的詳細資料">
          詳細資料
        </button>
      </article>
    `;
  }

  function updateSelection() {
    document.querySelectorAll('.admin-item')
      .forEach(card => {
        const button = card.querySelector(
          '[data-member-id]'
        );

        card.classList.toggle(
          'is-selected',
          !!state.selected &&
          button?.dataset.memberId ===
            state.selected.member_id
        );
      });
  }

  function updatePagination() {
    const totalPages = Math.max(
      1,
      Math.ceil(state.total / state.pageSize)
    );

    if ($('count')) {
      $('count').textContent =
        `共 ${state.total} 筆`;
    }

    if ($('pageInfo')) {
      $('pageInfo').textContent =
        `第 ${state.page} / ${totalPages} 頁`;
    }

    if ($('previous')) {
      $('previous').disabled =
        state.loading || state.page <= 1;
    }

    if ($('next')) {
      $('next').disabled =
        state.loading || state.page >= totalPages;
    }
  }

  async function load() {
    if (!state.authorized || state.loading) return;

    state.loading = true;
    const requestId = ++state.listRequestId;

    setMessage('正在載入會員資料…');
    setSearchDisabled(true);
    updatePagination();

    try {
      const data = await api(
        '/api/admin/members?' + params()
      );

      if (!Array.isArray(data.items)) {
        throw new Error('INVALID_RESPONSE');
      }

      if (requestId !== state.listRequestId) return;

      state.total = Number(data.total) || 0;
      state.page = Number(data.page) || state.page;

      $('items').innerHTML =
        data.items.map(itemCard).join('') ||
        '<p class="admin-empty">沒有符合條件的會員</p>';

      updateSelection();
      setMessage('');

    } catch (error) {
      console.error('[ADMIN MEMBERS] Load failed:', error);

      if (requestId !== state.listRequestId) return;

      setMessage(errorText(error));
      $('items').replaceChildren();

      if ($('count')) {
        $('count').textContent = '—';
      }

    } finally {
      if (requestId === state.listRequestId) {
        state.loading = false;
        setSearchDisabled(false);
        updatePagination();
      }
    }
  }

  function fillDetail(member) {
    $('detailId').value = member.member_id || '';
    $('detailAmwayId').value = member.amway_id ?? ''; 
    $('detailName').value = member.name || '';
    $('detailEmail').value = member.email || '';
    $('detailPhone').value = member.phone || '';

    $('detailRole').value = roleText(member.role);
    $('detailStatus').value = statusText(member.status);
    $('detailCreated').value = member.created_at || '';

    for (const key of [
      'detailName',
      'detailEmail',
      'detailPhone'
    ]) {
      $(key).readOnly = !state.canEdit;
    }

    $('detailSave').hidden = !state.canEdit;
  }

  // C5-A: admin-only read-only relationship overview.
  function relationshipField(label, value) {
    return `<div class="relationship-field"><dt>${esc(label)}</dt><dd>${esc(value ?? '—')}</dd></div>`;
  }

  function memberLabel(member) {
    return member ? `${member.name || '未命名'} (${member.member_id})${member.amway_id ? ' · 安麗編號：' + member.amway_id : ''}` : '無';
  }

  // C5-D.1: readable, escaped audit history; unknown fields remain visible in raw JSON.
  const auditActionNames = {
    admin_member_hierarchy_update: '修改組織上線',
    admin_member_service_update: '指派／更換服務者',
    admin_member_service_remove: '解除服務者'
  };
  const auditFieldNames = {
    parent_member_id: '直接上線',
    service_distributor_member_id: '服務者',
    service_id: '服務紀錄 ID',
    sync_service: '同步更新服務者',
    reason: '異動原因'
  };
  function auditObject(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  }
  function auditValue(value) {
    if (value === null || value === undefined || value === '') return '無';
    if (typeof value === 'boolean') return value ? '是' : '否';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
  function auditTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
  }
  function auditRowsHtml(log) {
    const before = auditObject(log.before_value);
    const after = auditObject(log.after_value);
    const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
      .filter(key => key !== 'reason' && key !== 'sync_service');
    const changes = keys.filter(key => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null));
    const lines = changes.map(key => `<div class="audit-change-row"><strong>${esc(auditFieldNames[key] || key)}</strong><span>${esc(auditValue(before?.[key]))}</span><span class="audit-change-arrow">→</span><span>${esc(auditValue(after?.[key]))}</span></div>`).join('');
    const reason = after?.reason ?? before?.reason;
    const sync = after?.sync_service;
    const rawBefore = typeof log.before_value === 'string' ? log.before_value : JSON.stringify(log.before_value ?? null);
    const rawAfter = typeof log.after_value === 'string' ? log.after_value : JSON.stringify(log.after_value ?? null);
    return `<div class="audit-entry">
      ${lines || '<p class="audit-muted">沒有可辨識的欄位變更</p>'}
      ${reason != null && reason !== '' ? `<p class="audit-reason"><strong>異動原因：</strong>${esc(auditValue(reason))}</p>` : ''}
      ${sync !== undefined ? `<p class="audit-muted">同步服務者：${esc(auditValue(sync))}</p>` : ''}
      <details class="audit-raw"><summary>檢視原始紀錄</summary><strong>異動前</strong><pre>${esc(rawBefore)}</pre><strong>異動後</strong><pre>${esc(rawAfter)}</pre></details>
    </div>`;
  }

  function renderRelationships(data) {
    const history = Array.isArray(data.history) ? data.history : [];
    const logs = Array.isArray(data.relationship_audit_logs) ? data.relationship_audit_logs : [];
    const serviceRows = history.map(item => `<tr><td>${esc(item.distributor_name || item.distributor_member_id)}</td><td>${esc(item.distributor_amway_id || '—')}</td><td>${esc(item.status)}</td><td>${esc(item.created_at)}</td></tr>`).join('');
    const auditRows = logs.map(item => `<tr><td>${esc(auditTime(item.created_at))}</td><td>${esc(item.actor_member_id || '—')}</td><td>${esc(auditActionNames[item.action] || item.action || '未知操作')}</td><td>${auditRowsHtml(item)}</td></tr>`).join('');
    state.relationships = data;
    $('relationshipActionBar').hidden = !(state.canEditHierarchy || state.canEditService);
    $('hierarchyEditToggle').hidden = !state.canEditHierarchy;
    $('serviceEditToggle').hidden = !state.canEditService;
    $('serviceRemoveToggle').hidden = !state.canEditService || !data.current_servicer;
    $('relationshipContent').innerHTML = `
      <dl class="relationship-fields">
        ${relationshipField('會員安麗編號', data.member?.amway_id || '—')}
        ${relationshipField('直接上線', memberLabel(data.direct_upline))}
        ${relationshipField('直接下線數', data.direct_downline_count)}
        ${relationshipField('全部下線數', data.descendant_count)}
        ${relationshipField('目前服務者', memberLabel(data.current_servicer))}
        ${relationshipField('目前服務 ID', data.current_service_id || '無')}
      </dl>
      <h4>服務歷史</h4>
      <div class="relationship-table-wrap"><table><thead><tr><th>服務者</th><th>安麗編號</th><th>狀態</th><th>建立時間</th></tr></thead><tbody>${serviceRows || '<tr><td colspan="4">尚無服務歷史</td></tr>'}</tbody></table></div>
      `;
    $('auditContent').innerHTML = `<div class="relationship-table-wrap"><table><thead><tr><th>時間</th><th>操作人</th><th>動作</th><th>內容</th></tr></thead><tbody>${auditRows || '<tr><td colspan="4">尚無異動紀錄</td></tr>'}</tbody></table></div>`;
    $('auditMessage').textContent = '';
  }

  async function loadRelationships(memberId, requestId) {
    $('relationshipPanel').hidden = false;
    $('relationshipContent').replaceChildren();
    $('hierarchyEditSection').hidden = true;
    $('serviceEditSection').hidden = true;
    $('relationshipActionBar').hidden = true;
    $('relationshipMessage').textContent = '正在載入關係資料…';
    $('auditMessage').textContent = '正在載入異動紀錄…';
    try {
      const data = await api('/api/admin/members/' + encodeURIComponent(memberId) + '/relationships');
      if (requestId !== state.detailRequestId || state.selected?.member_id !== memberId) return;
      if (!data.member || data.member.member_id !== memberId) throw new Error('INVALID_RESPONSE');
      $('detailAmwayId').value = data.member.amway_id ?? '';
      renderRelationships(data);
      $('relationshipMessage').textContent = '';
    } catch (error) {
      if (requestId !== state.detailRequestId) return;
      $('relationshipMessage').textContent = errorText(error);
      $('auditMessage').textContent = errorText(error);
    }
  }


  function resetHierarchyEditor() {
    state.relationships = null;
    resetServiceEditor();
    state.selectedParent = null;
    state.parentSearchRequestId++;
    $('hierarchyEditForm').hidden = true;
    $('hierarchyEditSection').hidden = true;
    $('hierarchyParentSearch').value = '';
    $('hierarchyParentResults').replaceChildren();
    $('hierarchyParentSearchMessage').textContent = '';
    $('hierarchySelectedParent').textContent = '尚未選擇新上線';
    $('hierarchySyncService').checked = false;
    $('hierarchyReason').value = '';
    $('hierarchyEditMessage').textContent = '';
  }

  function resetServiceEditor() {
    state.serviceSearchRequestId++;
    state.selectedServicer = null;
    state.serviceMode = 'assign';
    $('serviceEditForm').hidden = true;
    $('serviceEditSection').hidden = true;
    $('serviceSearch').value = '';
    $('serviceSearchResults').replaceChildren();
    $('serviceSearchMessage').textContent = '';
    $('serviceSelected').textContent = '尚未選擇服務者';
    $('serviceReason').value = '';
    $('serviceEditMessage').textContent = '';
    $('serviceSearchArea').hidden = false;
  }

  function openServiceEditor(mode) {
    state.serviceSearchRequestId++;
    state.selectedServicer = null;
    state.serviceMode = mode;
    $('hierarchyEditForm').hidden = true;
    $('hierarchyEditSection').hidden = true;
    $('serviceEditSection').hidden = false;
    $('serviceEditForm').hidden = false;
    $('serviceEditTitle').textContent = mode === 'remove' ? '解除服務者' :
      (state.relationships?.current_servicer ? '更換服務者' : '指派服務者');
    $('serviceSearchArea').hidden = mode === 'remove';
    $('serviceSearch').value = '';
    $('serviceSearchResults').replaceChildren();
    $('serviceSearchMessage').textContent = '';
    $('serviceSelected').textContent = '尚未選擇服務者';
    $('serviceReason').value = '';
    $('serviceEditMessage').textContent = '';
    $('serviceSubmit').textContent = mode === 'remove' ? '確認解除' : '確認修改';
  }

  async function searchServicer() {
    const query = $('serviceSearch').value.trim();
    const requestId = ++state.serviceSearchRequestId;
    state.selectedServicer = null;
    $('serviceSelected').textContent = '尚未選擇服務者';
    $('serviceSearchResults').replaceChildren();
    if (!query) { $('serviceSearchMessage').textContent = '請輸入搜尋條件'; return; }
    $('serviceSearchButton').disabled = true;
    $('serviceSearchMessage').textContent = '搜尋中…';
    try {
      const data = await api('/api/admin/members?' + new URLSearchParams({q:query,page:'1',page_size:'20'}));
      if (requestId !== state.serviceSearchRequestId) return;
      const candidates = (data.items || []).filter(m => m.role === 'distributor' && m.status === 'active');
      $('serviceSearchResults').innerHTML = candidates.map(m => `<button type="button" class="hierarchy-parent-choice" data-servicer-id="${esc(m.member_id)}"><strong>${esc(m.name)}</strong><small>${esc(m.member_id)}${m.amway_id ? ' · ' + esc(m.amway_id) : ''}</small></button>`).join('') || '<p>此頁搜尋結果沒有符合條件的有效直銷商</p>';
      $('serviceSearchMessage').textContent = `顯示 ${candidates.length} 位候選人（最多查詢 20 筆）`;
    } catch (error) {
      if (requestId === state.serviceSearchRequestId) $('serviceSearchMessage').textContent = errorText(error);
    } finally {
      if (requestId === state.serviceSearchRequestId) $('serviceSearchButton').disabled = false;
    }
  }

  async function submitServiceChange(event) {
    event.preventDefault();
    const target = state.selected;
    const current = state.relationships?.current_servicer;
    const next = state.selectedServicer;
    const mode = state.serviceMode;
    const reason = $('serviceReason').value.trim();
    if (!state.canEditService || !target) return;
    if (mode !== 'remove' && !next) { $('serviceEditMessage').textContent = '請先選擇服務者'; return; }
    if (mode !== 'remove' && current?.member_id === next.member_id) { $('serviceEditMessage').textContent = '新服務者與目前相同'; return; }
    if (mode === 'remove' && !current) { $('serviceEditMessage').textContent = '目前沒有服務者'; return; }
    if (!reason || reason.length > 500) { $('serviceEditMessage').textContent = '請填寫 1～500 字的異動原因'; return; }
    const action = mode === 'remove' ? '解除' : (current ? '更換' : '指派');
    const prompt = `確認${action} ${target.name} (${target.member_id}) 的服務者？\n目前：${current ? memberLabel(current) : '無'}\n新的：${mode === 'remove' ? '無' : memberLabel(next)}\n組織上線：不變\n原因：${reason}`;
    if (!window.confirm(prompt)) return;
    const button = $('serviceSubmit');
    const requestId = state.detailRequestId;
    button.disabled = true;
    $('serviceEditMessage').textContent = '正在更新服務關係…';
    try {
      const path = '/api/admin/members/' + encodeURIComponent(target.member_id) + '/service';
      const data = await api(path, {method:mode === 'remove' ? 'DELETE' : 'PATCH',body:mode === 'remove' ? {reason} : {distributor_member_id:next.member_id,reason}});
      if (requestId !== state.detailRequestId || state.selected?.member_id !== target.member_id) return;
      $('serviceEditMessage').textContent = data.changed === false ? '服務關係沒有變更' : '服務關係已更新';
      $('serviceEditForm').hidden = true;
      $('serviceEditSection').hidden = true;
      await loadRelationships(target.member_id, requestId);
    } catch (error) {
      if (requestId === state.detailRequestId) $('serviceEditMessage').textContent = errorText(error);
    } finally { button.disabled = false; }
  }

  async function searchHierarchyParent() {
    const query = $('hierarchyParentSearch').value.trim();
    const requestId = ++state.parentSearchRequestId;
    state.selectedParent = null;
    $('hierarchySelectedParent').textContent = '尚未選擇新上線';
    $('hierarchyParentResults').replaceChildren();
    if (!query) { $('hierarchyParentSearchMessage').textContent = '請輸入搜尋條件'; return; }
    $('hierarchyParentSearchButton').disabled = true;
    $('hierarchyParentSearchMessage').textContent = '搜尋中…';
    try {
      const data = await api('/api/admin/members?' + new URLSearchParams({q:query,page:'1',page_size:'20'}));
      if (requestId !== state.parentSearchRequestId) return;
      const candidates = (data.items || []).filter(m => m.member_id !== state.selected?.member_id && m.role === 'distributor' && m.status === 'active');
      $('hierarchyParentResults').innerHTML = candidates.map(m => `<button type="button" class="hierarchy-parent-choice" data-parent-id="${esc(m.member_id)}"><strong>${esc(m.name)}</strong><small>${esc(m.member_id)}${m.amway_id ? ' · ' + esc(m.amway_id) : ''}</small></button>`).join('') || '<p>此頁搜尋結果沒有符合條件的有效直銷商</p>';
      $('hierarchyParentSearchMessage').textContent = `顯示 ${candidates.length} 位候選人（最多查詢 20 筆）`;
    } catch (error) {
      if (requestId === state.parentSearchRequestId) $('hierarchyParentSearchMessage').textContent = errorText(error);
    } finally {
      if (requestId === state.parentSearchRequestId) $('hierarchyParentSearchButton').disabled = false;
    }
  }

  async function submitHierarchyChange(event) {
    event.preventDefault();
    const target = state.selected;
    const current = state.relationships?.direct_upline;
    const next = state.selectedParent;
    const reason = $('hierarchyReason').value.trim();
    const sync = $('hierarchySyncService').checked;
    if (!state.canEditHierarchy || !target) return;
    if (!next) { $('hierarchyEditMessage').textContent = '請先選擇新的直接上線'; return; }
    if (next.member_id === current?.member_id) { $('hierarchyEditMessage').textContent = '新上線與目前相同'; return; }
    if (!reason || reason.length > 500) { $('hierarchyEditMessage').textContent = '請填寫 1～500 字的異動原因'; return; }
    const text = `確認修改 ${target.name} (${target.member_id}) 的直接上線？\n目前：${current ? `${current.name} (${current.member_id})` : "無（根會員）"}\n新的：${next.name} (${next.member_id})\n同步服務者：${sync ? '是' : '否'}\n原因：${reason}`;
    if (!window.confirm(text)) return;
    const button = $('hierarchySubmit');
    const requestId = state.detailRequestId;
    button.disabled = true;
    $('hierarchyEditMessage').textContent = '正在更新組織關係…';
    try {
      const data = await api('/api/admin/members/' + encodeURIComponent(target.member_id) + '/hierarchy', {
        method: 'PATCH', body: {new_parent_member_id:next.member_id,sync_service:sync,reason}
      });
      if (requestId !== state.detailRequestId) return;
      $('hierarchyEditMessage').textContent = data.changed === false ? '組織關係沒有變更' : '組織關係已更新';
      $('hierarchyEditForm').hidden = true;
      $('hierarchyEditSection').hidden = true;
      await loadRelationships(target.member_id, requestId);
      await load();
    } catch (error) {
      if (requestId === state.detailRequestId) $('hierarchyEditMessage').textContent = errorText(error);
    } finally { button.disabled = false; }
  }

  const memberTabs = [
    ['memberTabBasic', 'memberPanelBasic'],
    ['memberTabRelations', 'memberPanelRelations'],
    ['memberTabAudit', 'memberPanelAudit']
  ];

  function selectMemberTab(tabId, focus = false) {
    memberTabs.forEach(([id, panelId]) => {
      const active = id === tabId;
      $(id).setAttribute('aria-selected', String(active));
      $(id).tabIndex = active ? 0 : -1;
      $(panelId).hidden = !active;
    });
    if (focus) $(tabId).focus();
  }

  async function openDetail(memberId) {
    if (!state.authorized) return;

    const requestId = ++state.detailRequestId;
    const panel = $('memberDetail');

    state.selected = null;
    resetHierarchyEditor();
    selectMemberTab('memberTabBasic');
    $('auditContent').replaceChildren();
    $('auditMessage').textContent = '';
    panel.hidden = false;
    $('detailBackdrop').hidden = false;
    document.body.classList.add('member-modal-open');
    $('detailClose').focus();
    $('detailForm').hidden = true;
    $('relationshipPanel').hidden = true;
    $('relationshipContent').replaceChildren();

    setDetailMessage('正在載入會員資料…');
    updateSelection();

    try {
      const data = await api(
        '/api/admin/members/' +
        encodeURIComponent(memberId)
      );

      if (requestId !== state.detailRequestId) return;

      if (!data.member) {
        throw new Error('INVALID_RESPONSE');
      }

      state.selected = data.member;

      fillDetail(state.selected);
      $('detailForm').hidden = false;

      setDetailMessage(
        state.canEdit
          ? '可修改姓名、Email、電話。'
          : '此帳號僅有檢視權限。'
      );

      updateSelection();
      // Independent read: basic member detail remains usable if C4 fails.
      void loadRelationships(memberId, requestId);

      // Modal stays in place; only its content scrolls.

    } catch (error) {
      if (requestId !== state.detailRequestId) return;

      console.error(
        '[ADMIN MEMBERS] Detail failed:',
        error
      );

      state.selected = null;
      $('detailForm').hidden = true;

      setDetailMessage(errorText(error));
      updateSelection();
    }
  }

  function closeDetail() {
    state.detailRequestId++;
    resetHierarchyEditor();
    state.selected = null;

    $('memberDetail').hidden = true;
    $('detailBackdrop').hidden = true;
    document.body.classList.remove('member-modal-open');
    const opener = document.querySelector('.admin-item.is-selected .detail-open');
    if (opener) opener.focus();
    $('detailForm').hidden = true;
    $('relationshipPanel').hidden = true;
    $('relationshipContent').replaceChildren();
    $('auditContent').replaceChildren();
    selectMemberTab('memberTabBasic');

    updateSelection();
  }

  async function saveDetail(event) {
    event.preventDefault();

    if (
      !state.authorized ||
      !state.canEdit ||
      !state.selected
    ) {
      return;
    }

    const memberId = state.selected.member_id;

    const body = {
      name: $('detailName').value.trim(),
      email: $('detailEmail').value.trim() || null,
      phone: $('detailPhone').value.trim() || null
    };

    if (!body.name) {
      setDetailMessage('請輸入會員姓名');
      $('detailName').focus();
      return;
    }

    const button = $('detailSave');

    button.disabled = true;
    setDetailMessage('正在儲存會員資料…');

    try {
      const data = await api(
        '/api/admin/members/' +
        encodeURIComponent(memberId),
        {
          method: 'PATCH',
          body
        }
      );

      if (data.member) {
        state.selected = data.member;
      } else {
        state.selected = {
          ...state.selected,
          ...body
        };
      }

      fillDetail(state.selected);

      setDetailMessage(
        data.changed === false
          ? '資料沒有變更。'
          : '會員資料已儲存。'
      );

      await load();

    } catch (error) {
      console.error(
        '[ADMIN MEMBERS] Save failed:',
        error
      );

      setDetailMessage(errorText(error));

    } finally {
      button.disabled = false;
    }
  }

  async function init() {
    console.log('[ADMIN MEMBERS] Initializing');

    const token = getToken();

    if (!token) {
      location.replace('./index.html');
      return;
    }

    if (!$('items') || !$('filters')) {
      console.error(
        '[ADMIN MEMBERS] Required HTML elements missing'
      );
      return;
    }

    // 會員列表
    $('items').addEventListener('click', event => {
      const button = event.target.closest(
        '[data-member-id]'
      );

      if (button) {
        openDetail(button.dataset.memberId);
      }
    });

    // 詳細資料
    memberTabs.forEach(([tabId], index) => {
      $(tabId).addEventListener('click', () => selectMemberTab(tabId));
      $(tabId).addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? memberTabs.length - 1 :
          (index + (event.key === 'ArrowRight' ? 1 : -1) + memberTabs.length) % memberTabs.length;
        selectMemberTab(memberTabs[next][0], true);
      });
    });
    $('detailClose')?.addEventListener('click', closeDetail);
    $('detailBackdrop')?.addEventListener('click', closeDetail);
    document.addEventListener('keydown', event => {
      if ($('memberDetail')?.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); closeDetail(); }
      if (event.key === 'Tab') {
        const focusable = [...$('memberDetail').querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]), textarea:not([disabled]), a[href]')].filter(el => el.getClientRects().length);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });

    $('serviceEditToggle').addEventListener('click', () => openServiceEditor('assign'));
    $('serviceRemoveToggle').addEventListener('click', () => openServiceEditor('remove'));
    $('serviceCancel').addEventListener('click', () => {
      $('serviceEditForm').hidden = true;
      $('serviceEditSection').hidden = true;
    });
    $('serviceSearchButton').addEventListener('click', searchServicer);
    $('serviceSearch').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void searchServicer(); } });
    $('serviceSearchResults').addEventListener('click', event => {
      const button = event.target.closest('[data-servicer-id]');
      if (!button) return;
      const id = button.dataset.servicerId;
      state.selectedServicer = {member_id:id,name:button.querySelector('strong')?.textContent || id};
      $('serviceSelected').textContent = `已選擇：${state.selectedServicer.name} (${id})`;
    });
    $('serviceEditForm').addEventListener('submit', submitServiceChange);

    $('hierarchyEditToggle').addEventListener('click', () => {
      const shouldOpen = $('hierarchyEditForm').hidden;
      $('serviceEditForm').hidden = true;
      $('serviceEditSection').hidden = true;
      $('hierarchyEditForm').hidden = !shouldOpen;
      $('hierarchyEditSection').hidden = !shouldOpen;
      $('hierarchyEditMessage').textContent = '';
    });
    $('hierarchyCancel').addEventListener('click', () => {
      $('hierarchyEditForm').hidden = true;
      $('hierarchyEditSection').hidden = true;
    });
    $('hierarchyParentSearchButton').addEventListener('click', searchHierarchyParent);
    $('hierarchyParentSearch').addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); void searchHierarchyParent(); }
    });
    $('hierarchyParentResults').addEventListener('click', event => {
      const button = event.target.closest('[data-parent-id]');
      if (!button) return;
      const memberId = button.dataset.parentId;
      state.selectedParent = {member_id:memberId, name:button.querySelector('strong')?.textContent || memberId};
      $('hierarchySelectedParent').textContent = `已選擇：${state.selectedParent.name} (${memberId})`;
    });
    $('hierarchyEditForm').addEventListener('submit', submitHierarchyChange);

    $('detailForm')?.addEventListener(
      'submit',
      saveDetail
    );

    // 搜尋
    $('filters').addEventListener(
      'submit',
      event => {
        event.preventDefault();

        if (!state.authorized || state.loading) return;

        state.page = 1;
        load();
      }
    );

    // 重設搜尋
    $('resetFilters')?.addEventListener(
      'click',
      () => {
        if (!state.authorized || state.loading) return;

        $('filters').reset();
        state.page = 1;
        load();
      }
    );

    // 上一頁
    $('previous')?.addEventListener(
      'click',
      () => {
        if (
          !state.loading &&
          state.page > 1
        ) {
          state.page--;
          load();
        }
      }
    );

    // 下一頁
    $('next')?.addEventListener(
      'click',
      () => {
        if (
          !state.loading &&
          state.page * state.pageSize < state.total
        ) {
          state.page++;
          load();
        }
      }
    );

    setMessage('正在確認管理員權限…');

    try {
      const result = await api(
        '/api/auth/permissions'
      );

      const permissions = result.permissions;

      if (
        !Array.isArray(permissions) ||
        !permissions.includes(READ_PERMISSION)
      ) {
        setMessage('此帳號沒有會員管理查詢權限');
        setFiltersDisabled(true);
        return;
      }

      state.authorized = true;

      state.canEdit = permissions.includes(
        UPDATE_PERMISSION
      );
      state.canEditHierarchy = permissions.includes(HIERARCHY_PERMISSION);
      state.canEditService = permissions.includes(SERVICE_PERMISSION);

      console.log(
        '[ADMIN MEMBERS] Permission verified',
        {
          canEdit: state.canEdit
        }
      );

      await load();

    } catch (error) {
      console.error(
        '[ADMIN MEMBERS] Init failed:',
        error
      );

      setMessage(errorText(error));
      setFiltersDisabled(true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      init,
      { once: true }
    );
  } else {
    init();
  }
})();
