
/*
 * Stage 8 - Member Hierarchy
 * Standalone member-hierarchy.html
 *
 * Requires:
 *   api(action, extra)
 *   sessionToken
 *
 * GAS API:
 *   member_self
 *   member_downline
 */

(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  const state = {
    members: [],
    root: null,
    expanded: new Set(),
    loaded: false,
    loading: false
  };

  const esc = value =>
    String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));

  const id = m => String(m.member_id || '');
  const parent = m => String(m.parent_member_id || '');

  function sort(items) {
    return items.sort((a, b) =>
      (Number(a.depth) || 0) - (Number(b.depth) || 0) ||
      String(a.name || '').localeCompare(
        String(b.name || ''),
        'zh-Hant'
      )
    );
  }

  function message(text) {
    $('hierarchyMessage').textContent = text;
  }

  function setLoading(value) {
    state.loading = value;

    $('hierarchyReload').disabled = value;
    $('hierarchyExpand').disabled = value;
    $('hierarchyCollapse').disabled = value;
  }

  function filterMembers() {
    const q = $('hierarchySearch').value.trim().toLowerCase();
    const depth = $('hierarchyDepth').value;
    const status = $('hierarchyStatus').value;

    return state.members.filter(m => {
      const matchSearch =
        !q ||
        [
          m.name,
          m.member_id,
          m.parent_member_id
        ].some(v =>
          String(v || '').toLowerCase().includes(q)
        );

      const matchDepth =
        !depth || String(m.depth) === depth;

      const matchStatus =
        !status || String(m.status) === status;

      return matchSearch && matchDepth && matchStatus;
    });
  }

  function renderTable() {
    const items = sort(filterMembers());

    $('hierarchyCount').textContent =
      `符合條件 ${items.length} 人／全部 ${state.members.length} 人`;

    $('hierarchyRows').innerHTML =
      items.map(m => `
        <tr>
          <td>${esc(m.name)}</td>
          <td><code>${esc(m.member_id)}</code></td>
          <td>${esc(m.parent_member_id)}</td>
          <td>${esc(m.depth)}</td>
          <td>${esc(m.status)}</td>
        </tr>
      `).join('') ||
      '<tr><td colspan="5">沒有符合條件的會員</td></tr>';
  }

  function renderTree() {
    const children = new Map();

    for (const member of state.members) {
      const key = parent(member);

      if (!children.has(key)) {
        children.set(key, []);
      }

      children.get(key).push(member);
    }

    const rootId = String(
      state.root?.member_id || ''
    );

    function node(member, level, ancestors = new Set()) {
      const key = id(member);

      // 防止循環階層
      if (ancestors.has(key) || level > 50) {
        return `
          <li class="hierarchy-warning">
            偵測到循環階層：${esc(key)}
          </li>
        `;
      }

      const nextAncestors = new Set(ancestors);
      nextAncestors.add(key);

      const kids = sort([
        ...(children.get(key) || [])
      ]);

      const open = state.expanded.has(key);

      const toggle = kids.length
        ? `
          <button
            type="button"
            class="hierarchy-toggle"
            data-toggle="${esc(key)}"
            aria-expanded="${open}"
          >
            ${open ? '−' : '+'}
          </button>
        `
        : '<span class="hierarchy-toggle-placeholder"></span>';

      return `
        <li>
          <div class="hierarchy-node">
            ${toggle}

            <span>
              ${esc(member.name || key)}
            </span>

            <small>
              ${esc(key)}
              ${level ? ` · 第 ${level} 層` : ' · 本人'}
            </small>
          </div>

          ${
            kids.length && open
              ? `<ul>${kids.map(k =>
                  node(k, level + 1, nextAncestors)
                ).join('')}</ul>`
              : ''
          }
        </li>
      `;
    }

    const root = state.root || {
      member_id: rootId,
      name: '我的會員'
    };

    $('hierarchyTree').innerHTML = `
      <ul class="hierarchy-root">
        ${node(root, 0)}
      </ul>
    `;
  }

  function renderDepthOptions() {
    const depths = [
      ...new Set(
        state.members
          .map(m => Number(m.depth))
          .filter(Number.isFinite)
      )
    ].sort((a, b) => a - b);

    $('hierarchyDepth').innerHTML =
      '<option value="">全部層級</option>' +
      depths.map(n =>
        `<option value="${n}">第 ${n} 層</option>`
      ).join('');
  }

  function render() {
    renderTable();
    renderTree();
  }

  async function load() {
    if (state.loading) return;

    if (!sessionToken) {
      message('尚未登入，請先返回會員中心');
      return;
    }

    setLoading(true);
    message('正在讀取下線資料…');

    try {
      console.log('[HIERARCHY] Loading downline');

      const result = await api('member_downline', {
        token: sessionToken
      });

      console.log('[HIERARCHY] Downline response:', result);

      if (!result.success) {
        throw new Error(
          result.error || 'DOWNLINE_QUERY_FAILED'
        );
      }

      if (!Array.isArray(result.members)) {
        throw new Error('API members 格式錯誤');
      }

      const own = await api('member_self', {
        token: sessionToken
      });

      console.log('[HIERARCHY] Self response:', own);

      if (!own.success || !own.member) {
        throw new Error(
          own.error || 'MEMBER_SELF_FAILED'
        );
      }

      state.members = result.members;
      state.root = own.member;
      state.loaded = true;

      const rootId = String(
        result.root_member_id ||
        own.member.member_id
      );

      state.expanded = new Set([
        rootId,
        ...state.members
          .filter(m => Number(m.depth) === 1)
          .map(id)
      ]);

      renderDepthOptions();
      render();

      message(
        `已載入 ${state.members.length} 名下線會員`
      );

    } catch (error) {
      console.error('[HIERARCHY] Error:', error);
      message('載入失敗：' + error.message);

    } finally {
      setLoading(false);
    }
  }

  function expandAll() {
    if (!state.loaded) return;

    state.expanded = new Set([
      id(state.root),
      ...state.members.map(id)
    ]);

    renderTree();
  }

  function collapseAll() {
    if (!state.loaded) return;

    state.expanded = new Set([
      id(state.root)
    ]);

    renderTree();
  }

  function clear() {
    state.members = [];
    state.root = null;
    state.expanded.clear();
    state.loaded = false;

    $('hierarchyRows').innerHTML = '';
    $('hierarchyTree').innerHTML = '';
    $('hierarchyCount').textContent = '';

    message('請登入後載入資料');
  }

  function init() {
    if (!$('hierarchyPanel')) {
      console.warn(
        '[HIERARCHY] hierarchyPanel not found'
      );
      return;
    }

    $('hierarchyReload').addEventListener(
      'click',
      load
    );

    $('hierarchyExpand').addEventListener(
      'click',
      expandAll
    );

    $('hierarchyCollapse').addEventListener(
      'click',
      collapseAll
    );

    [
      'hierarchySearch',
      'hierarchyDepth',
      'hierarchyStatus'
    ].forEach(key => {
      $(key).addEventListener(
        key === 'hierarchySearch' ? 'input' : 'change',
        renderTable
      );
    });

    $('hierarchyTree').addEventListener(
      'click',
      event => {
        const button = event.target.closest(
          '[data-toggle]'
        );

        if (!button) return;

        const key = button.dataset.toggle;

        if (state.expanded.has(key)) {
          state.expanded.delete(key);
        } else {
          state.expanded.add(key);
        }

        renderTree();
      }
    );

    console.log('[HIERARCHY] Initialized');
  }

  window.Stage8Hierarchy = {
    init,
    load,
    clear,
    expandAll,
    collapseAll
  };

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      init
    );
  } else {
    init();
  }
})();
