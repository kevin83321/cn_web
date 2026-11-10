
'use strict';

(() => {
  const state = {
    page: 1,
    pageSize: 20,
    total: 0,
    loading: false
  };

  const permission = 'admin.members.read';
  let canEdit = false;
  let selected = null;

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

  const errorText = error =>
    errors[error.message] || ('操作失敗：' + error.message);

  const roleText = value =>
    roleNames[value] || value || '—';

  const statusText = value =>
    statusNames[value] || value || '—';

  function params() {
    const p = new URLSearchParams({
      page: String(state.page),
      page_size: String(state.pageSize)
    });

    for (const key of ['role', 'status']) {
      if ($(key).value) {
        p.set(key, $(key).value);
      }
    }

    if ($('query').value.trim()) {
      p.set('q', $('query').value.trim());
    }

    return p.toString();
  }

  function itemCard(member) {
    return `
      <article class="admin-item${
        selected?.member_id === member.member_id
          ? ' is-selected'
          : ''
      }">
        <div class="admin-item-head">
          <strong>${esc(member.name)}</strong>
          <span class="admin-pill">
            ${esc(roleText(member.role))}
          </span>
        </div>

        <dl>
          <div>
            <dt>會員 ID</dt>
            <dd>${esc(member.member_id)}</dd>
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
          data-member-id="${esc(member.member_id)}"
        >
          查看詳細資料
        </button>
      </article>
    `;
  }

  async function load() {
    if (state.loading) return;

    state.loading = true;

    $('message').textContent = '正在載入…';
    $('previous').disabled = true;
    $('next').disabled = true;
    $('searchButton').disabled = true;

    try {
      const data = await api(
        '/api/admin/members?' + params()
      );

      if (!Array.isArray(data.items)) {
        throw Error('INVALID_RESPONSE');
      }

      state.total = Number(data.total) || 0;
      state.page = Number(data.page) || state.page;

      $('items').innerHTML =
        data.items.map(itemCard).join('') ||
        '<p class="admin-empty">沒有符合條件的會員</p>';

      $('count').textContent =
        `共 ${state.total} 筆`;

      $('pageInfo').textContent =
        `第 ${state.page} / ${
          Math.max(
            1,
            Math.ceil(state.total / state.pageSize)
          )
        } 頁`;

      $('message').textContent = '';

      $('previous').disabled =
        state.page <= 1;

      $('next').disabled =
        state.page * state.pageSize >= state.total;

    } catch (error) {
      $('message').textContent = errorText(error);
      $('items').replaceChildren();
      $('count').textContent = '—';

    } finally {
      state.loading = false;
      $('searchButton').disabled = false;
    }
  }

  async function openDetail(memberId) {
    const panel = $('memberDetail');

    selected = null;
    panel.hidden = false;

    $('detailForm').hidden = true;
    $('detailMessage').textContent =
      '正在載入會員資料…';

    try {
      const data = await api(
        '/api/admin/members/' +
        encodeURIComponent(memberId)
      );

      selected = data.member;

      if (!selected) {
        throw Error('INVALID_RESPONSE');
      }

      $('detailId').value =
        selected.member_id;

      $('detailName').value =
        selected.name || '';

      $('detailEmail').value =
        selected.email || '';

      $('detailPhone').value =
        selected.phone || '';

      $('detailRole').value =
        roleText(selected.role);

      $('detailStatus').value =
        statusText(selected.status);

      $('detailCreated').value =
        selected.created_at || '';

      for (const key of [
        'detailName',
        'detailEmail',
        'detailPhone'
      ]) {
        $(key).readOnly = !canEdit;
      }

      $('detailSave').hidden = !canEdit;
      $('detailForm').hidden = false;

      $('detailMessage').textContent =
        canEdit
          ? '可修改姓名、Email、電話。'
          : '此帳號僅有檢視權限。';

      document.querySelectorAll(
        '.admin-item'
      ).forEach(card => {
        card.classList.toggle(
          'is-selected',
          card.querySelector(
            '[data-member-id]'
          )?.dataset.memberId === memberId
        );
      });

    } catch (error) {
      $('detailMessage').textContent =
        errorText(error);
    }

    panel.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  async function init() {
    if (!TOKEN) {
      location.replace('./index.html');
      return;
    }

    try {
      const permissions = await api(
        '/api/auth/permissions'
      );

      if (
        !Array.isArray(permissions.permissions) ||
        !permissions.permissions.includes(permission)
      ) {
        $('message').textContent =
          '此帳號沒有管理員查詢權限';

        $('filters')
          .querySelectorAll('input,select,button')
          .forEach(el => {
            el.disabled = true;
          });

        return;
      }

      canEdit = permissions.permissions.includes(
        'admin.members.update'
      );

      await load();

    } catch (error) {
      $('message').textContent =
        errorText(error);
    }
  }

  // 會員列表：開啟詳細資料
  $('items').addEventListener('click', event => {
    const button = event.target.closest(
      '[data-member-id]'
    );

    if (button) {
      openDetail(button.dataset.memberId);
    }
  });

  // 關閉詳細資料
  $('detailClose').addEventListener('click', () => {
    $('memberDetail').hidden = true;
    selected = null;

    document.querySelectorAll(
      '.admin-item'
    ).forEach(card => {
      card.classList.remove('is-selected');
    });
  });

  // 儲存會員資料
  $('detailForm').addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      if (!canEdit || !selected) return;

      const body = {
        name: $('detailName').value.trim(),
        email: $('detailEmail').value.trim() || null,
        phone: $('detailPhone').value.trim() || null
      };

      $('detailSave').disabled = true;
      $('detailMessage').textContent = '儲存中…';

      try {
        const data = await api(
          '/api/admin/members/' +
          encodeURIComponent(selected.member_id),
          {
            method: 'PATCH',
            body
          }
        );

        selected = data.member || selected;

        $('detailMessage').textContent =
          data.changed
            ? '已儲存，操作紀錄已建立。'
            : '資料沒有變更。';

        await load();

      } catch (error) {
        $('detailMessage').textContent =
          errorText(error);

      } finally {
        $('detailSave').disabled = false;
      }
    }
  );

  // 搜尋與篩選
  $('filters').addEventListener(
    'submit',
    event => {
      event.preventDefault();
      state.page = 1;
      load();
    }
  );

  // 重設篩選
  $('resetFilters').addEventListener(
    'click',
    () => {
      $('filters').reset();
      state.page = 1;
      load();
    }
  );

  // 上一頁
  $('previous').addEventListener(
    'click',
    () => {
      if (state.page > 1) {
        state.page--;
        load();
      }
    }
  );

  // 下一頁
  $('next').addEventListener(
    'click',
    () => {
      if (
        state.page * state.pageSize <
        state.total
      ) {
        state.page++;
        load();
      }
    }
  );

  init();
})();
