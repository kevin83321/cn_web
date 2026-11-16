
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
    selected: null,
    detailRequestId: 0,
    listRequestId: 0
  };

  const READ_PERMISSION = 'admin.members.read';
  const UPDATE_PERMISSION = 'admin.members.update';

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

    const isSelected =
      state.selected?.member_id === memberId;

    return `
      <article class="admin-item${
        isSelected ? ' is-selected' : ''
      }">
        <div class="admin-item-head">
          <strong>${esc(member.name || '未設定姓名')}</strong>

          <span class="admin-pill">
            ${esc(roleText(member.role))}
          </span>
        </div>

        <dl>
          <div>
            <dt>會員 ID</dt>
            <dd>${esc(memberId)}</dd>
          </div>

          <div>
            <dt>狀態</dt>
            <dd>${esc(statusText(member.status))}</dd>
          </div>

          <div>
            <dt>建立時間</dt>
            <dd>${esc(member.created_at)}</dd>
          </div>
        </dl>

        <button
          type="button"
          class="detail-open"
          data-member-id="${esc(memberId)}"
        >
          查看詳細資料
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
    return member ? `${member.name || '未命名'} (${member.member_id})` : '無';
  }

  function renderRelationships(data) {
    const history = Array.isArray(data.history) ? data.history : [];
    const logs = Array.isArray(data.relationship_audit_logs) ? data.relationship_audit_logs : [];
    const serviceRows = history.map(item => `<tr><td>${esc(item.distributor_name || item.distributor_member_id)}</td><td>${esc(item.status)}</td><td>${esc(item.created_at)}</td></tr>`).join('');
    const auditRows = logs.map(item => `<tr><td>${esc(item.created_at)}</td><td>${esc(item.actor_member_id)}</td><td>${esc(item.action)}</td><td><details><summary>查看異動內容</summary><pre>${esc(item.before_value)}</pre><pre>${esc(item.after_value)}</pre></details></td></tr>`).join('');
    $('relationshipContent').innerHTML = `
      <dl class="relationship-fields">
        ${relationshipField('直接上線', memberLabel(data.direct_upline))}
        ${relationshipField('直接下線數', data.direct_downline_count)}
        ${relationshipField('全部下線數', data.descendant_count)}
        ${relationshipField('目前服務者', memberLabel(data.current_servicer))}
        ${relationshipField('目前服務 ID', data.current_service_id || '無')}
      </dl>
      <h4>服務歷史</h4>
      <div class="relationship-table-wrap"><table><thead><tr><th>服務者</th><th>狀態</th><th>建立時間</th></tr></thead><tbody>${serviceRows || '<tr><td colspan="3">尚無服務歷史</td></tr>'}</tbody></table></div>
      <h4>關係異動紀錄（最近 50 筆）</h4>
      <div class="relationship-table-wrap"><table><thead><tr><th>時間</th><th>操作人</th><th>動作</th><th>內容</th></tr></thead><tbody>${auditRows || '<tr><td colspan="4">尚無異動紀錄</td></tr>'}</tbody></table></div>`;
  }

  async function loadRelationships(memberId, requestId) {
    $('relationshipPanel').hidden = false;
    $('relationshipContent').replaceChildren();
    $('relationshipMessage').textContent = '正在載入關係資料…';
    try {
      const data = await api('/api/admin/members/' + encodeURIComponent(memberId) + '/relationships');
      if (requestId !== state.detailRequestId || state.selected?.member_id !== memberId) return;
      if (!data.member || data.member.member_id !== memberId) throw new Error('INVALID_RESPONSE');
      renderRelationships(data);
      $('relationshipMessage').textContent = '';
    } catch (error) {
      if (requestId !== state.detailRequestId) return;
      $('relationshipMessage').textContent = errorText(error);
    }
  }

  async function openDetail(memberId) {
    if (!state.authorized) return;

    const requestId = ++state.detailRequestId;
    const panel = $('memberDetail');

    state.selected = null;
    panel.hidden = false;
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

      panel.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });

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
    state.selected = null;

    $('memberDetail').hidden = true;
    $('detailForm').hidden = true;
    $('relationshipPanel').hidden = true;
    $('relationshipContent').replaceChildren();

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
    $('detailClose')?.addEventListener(
      'click',
      closeDetail
    );

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
