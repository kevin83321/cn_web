(() => {
  const tabs = [document.getElementById('inviteTabCreate'), document.getElementById('inviteTabHistory')];
  const panels = [document.getElementById('invitePanelCreate'), document.getElementById('invitePanelHistory')];
  function activate(index, focus = false) {
    tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; panels[i].hidden = i !== index; });
    if (focus) tabs[index].focus();
    if (location.hash !== (index ? '#history' : '#create')) history.replaceState(null, '', index ? '#history' : '#create');
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => activate(i));
    tab.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault(); activate(event.key === 'ArrowRight' ? (i + 1) % 2 : (i + 1) % 2, true);
    });
  });
  window.addEventListener('hashchange', () => activate(location.hash === '#history' ? 1 : 0));
  activate(location.hash === '#history' ? 1 : 0);
})();
