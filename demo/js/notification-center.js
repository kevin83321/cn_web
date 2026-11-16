
'use strict';

import { CONFIG } from './config.js';

(() => {
  const $ = id => document.getElementById(id);

  const root = $('notificationCenter');
  if (!root) return;

  const list = $('notificationList');
  const message = $('notificationMessage');
  const count = $('notificationCount');
  const reload = $('reloadNotifications');
  const unreadOnly = $('notificationUnreadOnly');
  const bell = $('notificationBell');
  const bellCount = $('notificationBellCount');
  const backdrop = $('notificationBackdrop');
  const closeButton = $('closeNotifications');
  let previousFocus = null;
  const dashboard = $('dashboardView');
  const account = $('accountView');
  let initialized = false;

  function isLoggedInView() {
    return Boolean(dashboard && !dashboard.hidden) || Boolean(account && !account.hidden);
  }

  function closePanel() {
    if (root.hidden) return;
    root.hidden = true;
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('notification-open');
    bell?.setAttribute('aria-expanded', 'false');
    if (previousFocus?.isConnected && !previousFocus.hidden) previousFocus.focus();
    previousFocus = null;
  }

  function syncVisibility() {
    const loggedIn = isLoggedInView() && Boolean(token());
    if (bell) bell.hidden = !loggedIn;
    if (!loggedIn) {
      closePanel();
      initialized = false;
      notifications = [];
      if (bellCount) bellCount.hidden = true;
      return;
    }
    if (!initialized) {
      initialized = true;
      loadUnreadCount().catch(() => {
        initialized = false;
      });
    }
  }

  let notifications = [];
  let loading = false;

  const token = () =>
    localStorage.getItem(CONFIG.TOKEN_KEY) ||
    sessionStorage.getItem(CONFIG.TOKEN_KEY) ||
    '';

  async function api(path, options = {}) {
    const t = token();

    if (!t) throw new Error('請先登入');

    const res = await fetch(CONFIG.API_BASE + path, {
      ...options,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${t}`,
        ...(options.body
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(options.headers || {})
      }
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || `HTTP_${res.status}`);
    }

    return data;
  }

  function formatTime(value) {
    if (!value) return '—';

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString('zh-TW');
  }

  function textElement(tag, className, value) {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = value;
    return el;
  }

  function render() {
    list.replaceChildren();

    const visible = notifications.filter(item =>
      !unreadOnly.checked || !item.read_at
    );

    for (const item of visible) {
      const article = document.createElement('article');
      article.className =
        'notification-item' +
        (item.read_at ? '' : ' is-unread');

      const head = document.createElement('div');
      head.className = 'notification-item-head';

      head.append(
        textElement(
          'strong',
          'notification-title',
          item.title || '系統通知'
        )
      );

      if (!item.read_at) {
        head.append(
          textElement(
            'span',
            'notification-unread-label',
            '未讀'
          )
        );
      }

      article.append(head);

      article.append(
        textElement(
          'p',
          'notification-body',
          item.message || ''
        )
      );

      const footer = document.createElement('div');
      footer.className = 'notification-item-footer';

      footer.append(
        textElement(
          'time',
          'notification-time',
          formatTime(item.created_at)
        )
      );

      if (!item.read_at) {
        const button = document.createElement('button');

        button.type = 'button';
        button.className =
          'secondary notification-read-button';
        button.textContent = '標記已讀';

        button.addEventListener('click', () =>
          markRead(item, button)
        );

        footer.append(button);
      }

      article.append(footer);
      list.append(article);
    }

    if (!visible.length) {
      list.append(
        textElement(
          'p',
          'notification-empty',
          unreadOnly.checked
            ? '目前沒有未讀通知'
            : '目前沒有通知'
        )
      );
    }
  }

  async function loadUnreadCount() {
    const data = await api(
      '/api/notifications/unread-count'
    );

    const unread = Number(data.unread_count) || 0;

    count.textContent = `${unread} 則未讀`;

    count.hidden = unread === 0;
    if (bellCount) {
      bellCount.textContent = unread > 99 ? '99+' : String(unread);
      bellCount.hidden = unread === 0;
      bell?.setAttribute('aria-label', unread ? `通知中心，${unread} 則未讀` : '開啟通知中心');
    }

    // Other UI elements may listen for this event.
    document.dispatchEvent(
      new CustomEvent('cn:notifications-updated', {
        detail: { unread_count: unread }
      })
    );
  }

  async function load() {
    if (loading) return;

    loading = true;
    reload.disabled = true;
    message.textContent = '正在載入通知…';

    try {
      const [data] = await Promise.all([
        api('/api/notifications?limit=100'),
        loadUnreadCount()
      ]);

      notifications = Array.isArray(data.notifications)
        ? data.notifications
        : [];

      render();

      message.textContent = '通知已更新';
    } catch (error) {
      message.textContent =
        `載入失敗：${error.message}`;
    } finally {
      loading = false;
      reload.disabled = false;
    }
  }

  async function markRead(item, button) {
    button.disabled = true;

    try {
      await api('/api/notifications/read', {
        method: 'POST',
        body: JSON.stringify({
          notification_id: item.notification_id
        })
      });

      item.read_at = new Date().toISOString();

      render();

      await loadUnreadCount();

      message.textContent = '已標記為已讀';
    } catch (error) {
      message.textContent =
        `操作失敗：${error.message}`;

      button.disabled = false;
    }
  }

  reload.addEventListener('click', load);

  unreadOnly.addEventListener('change', render);

  document.addEventListener(
    'cn:notification-created',
    load
  );

  bell?.addEventListener('click', () => {
    if (!isLoggedInView() || !token()) return;
    const opening = root.hidden;
    if (!opening) { closePanel(); return; }
    previousFocus = document.activeElement;
    root.hidden = false;
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add('notification-open');
    bell.setAttribute('aria-expanded', 'true');
    closeButton?.focus();
    load();
  });

  closeButton?.addEventListener('click', closePanel);
  backdrop?.addEventListener('click', closePanel);
  document.addEventListener('click', event => {
    if (!root.hidden && !root.contains(event.target) && !bell?.contains(event.target)) {
      closePanel();
    }
  });
  document.addEventListener('keydown', event => {
    if (root.hidden) return;
    if (event.key === 'Escape') closePanel();
    if (event.key === 'Tab') {
      const focusables = [...root.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(el => !el.hidden);
      if (!focusables.length) { event.preventDefault(); root.focus(); return; }
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  if (dashboard) new MutationObserver(syncVisibility).observe(dashboard, {attributes:true, attributeFilter:['hidden']});
  if (account) new MutationObserver(syncVisibility).observe(account, {attributes:true, attributeFilter:['hidden']});
  window.addEventListener('pageshow', syncVisibility);
  syncVisibility();
})();
