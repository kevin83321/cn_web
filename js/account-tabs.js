'use strict';
(() => {
  const keys = ['account', 'security', 'history'];
  const activate = (key, focus = false) => {
    if (!keys.includes(key)) key = 'account';
    for (const id of keys) {
      const tab = document.getElementById('tab-' + id);
      const panel = document.getElementById('panel-' + id);
      if (!tab || !panel) continue;
      const active = id === key;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      panel.hidden = !active;
      if (active && focus) tab.focus();
    }
    if (location.hash !== '#' + key) history.replaceState(null, '', '#' + key);
  };
  document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelector('.account-tabs');
    if (!tabs) return;
    tabs.addEventListener('click', event => {
      const tab = event.target.closest('[data-tab]');
      if (tab) activate(tab.dataset.tab);
    });
    tabs.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      const current = keys.indexOf(document.activeElement?.dataset.tab);
      if (current < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length;
      activate(keys[next], true);
    });
    activate(location.hash.slice(1));
    window.addEventListener('hashchange', () => activate(location.hash.slice(1)));
  });
})();
