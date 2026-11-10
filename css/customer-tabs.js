'use strict';
(() => {
  const tabs = [...document.querySelectorAll('[data-customer-tab]')];
  const panels = {
    query: document.getElementById('panel-query'),
    manage: document.getElementById('panel-manage')
  };
  function activate(name, focus = false) {
    if (!panels[name]) return;
    tabs.forEach(tab => {
      const selected = tab.dataset.customerTab === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    Object.entries(panels).forEach(([key, panel]) => { panel.hidden = key !== name; });
    history.replaceState(null, '', location.pathname + location.search + '#' + name);
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab.dataset.customerTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
        (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      activate(tabs[next].dataset.customerTab, true);
    });
  });
  // Existing customer-management.js fills the selected customer after this click.
  // Capture phase switches panels before that handler scrolls to the form.
  document.getElementById('rows')?.addEventListener('click', event => {
    if (event.target.closest('[data-transfer], [data-end], [data-assign]')) activate('manage');
  }, true);
  activate(location.hash === '#manage' ? 'manage' : 'query');
})();
