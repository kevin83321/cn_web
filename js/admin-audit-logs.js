'use strict';
import { $, esc, api, getToken, errors } from './admin-common.js';

(() => {
  const state = { page: 1, pageSize: 20, total: 0, loading: false, authorized: false };
  const permission = 'admin.audit.read';
  const errorText = e => errors[e?.message] || `查詢失敗：${e?.message || 'UNKNOWN_ERROR'}`;
  const value = v => v == null || v === '' ? '—' : String(v);
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

    const changeHtml = changes.length
      ? changes.map(c => `
          <div class="audit-change">
            <div class="audit-change-label">
              ${esc(value(c.field))}
            </div>
            <div class="audit-change-values">
              <span>${esc(value(c.before))}</span>
              <span aria-hidden="true">→</span>
              <strong>${esc(value(c.after))}</strong>
            </div>
          </div>
        `).join('')
      : '<p class="audit-no-change">無可顯示的變更明細</p>';

    return `
      <article class="admin-item audit-item">
        <div class="admin-item-head">
          <strong>${esc(value(r.title || r.action))}</strong>
          <span class="admin-pill">
            ${esc(value(r.category || 'other'))}
          </span>
        </div>

        <div class="audit-action-code">
          ${esc(value(r.action))}
        </div>

        <p class="audit-summary">
          ${esc(value(r.summary))}
        </p>

        <dl>
          <div>
            <dt>操作人員</dt>
            <dd class="audit-break">
              ${esc(value(r.actor_member_id))}
            </dd>
          </div>

          <div>
            <dt>操作對象</dt>
            <dd class="audit-break">
              ${esc(value(r.target_member_id))}
            </dd>
          </div>

          <div>
            <dt>操作時間</dt>
            <dd>${esc(formatTime(r.created_at))}</dd>
          </div>
        </dl>

        <div class="audit-changes">
          <strong>變更內容</strong>
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
      </article>`;
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
