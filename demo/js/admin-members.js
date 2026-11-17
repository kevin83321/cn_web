
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

  function renderRelationships(data) {
    const history = Array.isArray(data.history) ? data.history : [];
    const logs = Array.isArray(data.relationship_audit_logs) ? data.relationship_audit_logs : [];
    const serviceRows = history.map(item => `<tr><td>${esc(item.distributor_name || item.distributor_member_id)}</td><td>${esc(item.distributor_amway_id || '—')}</td><td>${esc(item.status)}</td><td>${esc(item.created_at)}</td></tr>`).join('');
    const auditRows = logs.map(item => `<tr><td>${esc(item.created_at)}</td><td>${esc(item.actor_member_id)}</td><td>${esc(item.action)}</td><td><details><summary>查看異動內容</summary><pre>${esc(item.before_value)}</pre><pre>${esc(item.after_value)}</pre></details></td></tr>`).join('');
    state.relationships = data;
    $('hierarchyEditSection').hidden = !state.canEditHierarchy;
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

    $('hierarchyEditToggle').addEventListener('click', () => {
      $('hierarchyEditForm').hidden = !$('hierarchyEditForm').hidden;
      $('hierarchyEditMessage').textContent = '';
    });
    $('hierarchyCancel').addEventListener('click', () => { $('hierarchyEditForm').hidden = true; });
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
