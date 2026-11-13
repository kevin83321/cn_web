'use strict';
import { $, esc, api, getToken, errors } from './admin-common.js';

(() => {
  const state = { page: 1, pageSize: 20, total: 0, loading: false, authorized: false };
  const permission = 'admin.audit.read';
  const errorText = e => errors[e?.message] || `查詢失敗：${e?.message || 'UNKNOWN_ERROR'}`;
  const value = v => v == null || v === '' ? '—' : String(v);
  const categoryNames = {
    customer: '客戶服務',
    member: '會員管理',
    permission: '角色權限',
    security: '帳號安全',
    other: '其他'
  };
  const formatTime = raw => {
    if (!raw) return '—';

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return value(raw);

    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  };

  function params() {
    const p = new URLSearchParams({page: String(state.page), page_size: String(state.pageSize)});
    const actor = $('actor').value.trim();
    const action = $('action').value.trim();
    if (actor) p.set('actor_member_id', actor);
    if (action) p.set('action', action);
    return p.toString();
  }
  
  
  function itemCard(r) {
    const changes = Array.isArray(r.changes) ? r.changes : [];

    // 名稱與 ID 統一顯示
    function memberLabel(name, id) {
      const memberName = name ? String(name).trim() : '';
      const memberId = id ? String(id).trim() : '';

      if (memberName && memberId) {
        return `${memberName} (${memberId})`;
      }
      return memberName || memberId || '—';
    }

    const actor = memberLabel(r.actor_name, r.actor_member_id);
    const target = memberLabel(r.target_name, r.target_member_id);

    const changeHtml = changes.length
      ? changes.map(c => `
          <div class="audit-change">
            <div class="audit-change-label">
              ${esc(value(c.field))}
            </div>
            <div class="audit-change-values">
              <span>${esc(value(c.before))}</span>
              <span class="audit-change-arrow" aria-hidden="true">→</span>
              <strong>${esc(value(c.after))}</strong>
            </div>
          </div>
        `).join('')
      : '<p class="audit-no-change">無可顯示的變更明細</p>';

    return `
      <article class="admin-item audit-item">

        <div class="admin-item-head">
          <div class="audit-heading">
            <strong>${esc(value(r.title || r.action))}</strong>
            <time class="audit-time">
              ${esc(formatTime(r.created_at))}
            </time>
          </div>

          <span class="admin-pill">
            ${esc(categoryNames[r.category] || '其他')}
          </span>
        </div>

        <p class="audit-summary">
          ${esc(value(r.summary))}
        </p>

        <div class="audit-members">
          <div class="audit-member">
            <span class="audit-member-label">操作人員</span>
            <strong class="audit-member-value">
              ${esc(actor)}
            </strong>
          </div>

          <div class="audit-member">
            <span class="audit-member-label">操作對象</span>
            <strong class="audit-member-value">
              ${esc(target)}
            </strong>
          </div>
        </div>

        <div class="audit-changes">
          <strong class="audit-section-title">變更內容</strong>
          ${changeHtml}
        </div>

        <details class="audit-details">
          <summary>技術資訊</summary>
          <dl>
            <div>
              <dt>事件 ID</dt>
              <dd class="audit-break">
                ${esc(value(r.audit_id))}
              </dd>
            </div>

            <div>
              <dt>事件代碼</dt>
              <dd class="audit-break">
                ${esc(value(r.action))}
              </dd>
            </div>
          </dl>
        </details>

      </article>
    `;
  }



  function pager() {
    const pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    $('pageInfo').textContent = `第 ${state.page} / ${pages} 頁`;
    $('previous').disabled = state.loading || state.page <= 1;
    $('next').disabled = state.loading || state.page >= pages;
  }

  async function load() {
    if (!state.authorized || state.loading) return;
    state.loading = true;
    $('message').textContent = '正在載入操作紀錄…';
    $('searchButton').disabled = true;
    $('resetFilters').disabled = true;
    pager();
    try {
      const d = await api('/api/admin/audit-logs?' + params());
      if (!Array.isArray(d.items)) throw new Error('INVALID_RESPONSE');
      state.total = Number(d.total) || 0;
      state.page = Number(d.page) || state.page;
      $('items').innerHTML = d.items.map(itemCard).join('') || '<p class="admin-empty">沒有符合條件的紀錄</p>';
      $('count').textContent = `共 ${state.total} 筆`;
      $('message').textContent = '';
    } catch (e) {
      console.error('[AUDIT] Load failed', e);
      $('message').textContent = errorText(e);
      $('items').replaceChildren();
      $('count').textContent = '—';
    } finally {
      state.loading = false;
      $('searchButton').disabled = false;
      $('resetFilters').disabled = false;
      pager();
    }
  }

  async function loadFilters() {
    try {
      const data = await api('/api/admin/audit-filters');
      if (!Array.isArray(data.actors) || !Array.isArray(data.actions)) throw Error('INVALID_RESPONSE');
      for (const [id, values] of [['actor', data.actors], ['action', data.actions]]) {
        const select = $(id);
        const previous = select.value;
        select.replaceChildren(new Option(id === 'actor' ? '全部操作人員' : '全部操作類型', ''));
        for (const value of values) {
          if (typeof value === 'string' && value) select.add(new Option(value, value));
        }
        if ([...select.options].some(o => o.value === previous)) select.value = previous;
      }
    } catch (e) {
      console.error('[AUDIT] Filter options failed', e);
      $('filterHint').textContent = '無法載入下拉選項，請重新整理頁面：' + errorText(e);
      $('actor').disabled = true;
      $('action').disabled = true;
    }
  }

  async function init() {
    if (!getToken()) { location.replace('./index.html'); return; }
    $('filters').addEventListener('submit', e => {e.preventDefault(); if (state.loading || !state.authorized) return; state.page = 1; load();});
    $('resetFilters').addEventListener('click', () => {if (state.loading || !state.authorized) return; $('filters').reset(); state.page = 1; load();});
    $('previous').addEventListener('click', () => {if (!state.loading && state.page > 1) {state.page--; load();}});
    $('next').addEventListener('click', () => {if (!state.loading && state.page * state.pageSize < state.total) {state.page++; load();}});
    try {
      const d = await api('/api/auth/permissions');
      if (!Array.isArray(d.permissions) || !d.permissions.includes(permission)) {
        $('message').textContent = '此帳號沒有操作紀錄查詢權限';
        $('filters').querySelectorAll('select,button').forEach(el => {el.disabled = true;});
        return;
      }
      state.authorized = true;
      await Promise.all([loadFilters(), load()]);
    } catch (e) {
      console.error('[AUDIT] Permission check failed', e);
      $('message').textContent = errorText(e);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();
})();
