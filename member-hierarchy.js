/* Stage 8: Member hierarchy UI. Requires existing api(action, extra), sessionToken and run(fn). */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = {members: [], root: null, expanded: new Set(), loaded: false};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parent = m => String(m.parent_member_id || '');
  const id = m => String(m.member_id || '');
  const sort = a => a.sort((x,y) => (Number(x.depth)||0)-(Number(y.depth)||0) || String(x.name||'').localeCompare(String(y.name||''),'zh-Hant'));
  function filterMembers() {
    const q = $('hierarchySearch').value.trim().toLowerCase();
    const depth = $('hierarchyDepth').value;
    const status = $('hierarchyStatus').value;
    return state.members.filter(m => (!q || [m.name,m.member_id,m.parent_member_id].some(v => String(v||'').toLowerCase().includes(q))) && (!depth || String(m.depth) === depth) && (!status || String(m.status) === status));
  }
  function renderTable() {
    const items = sort(filterMembers());
    $('hierarchyCount').textContent = `符合條件 ${items.length} 人／全部 ${state.members.length} 人`;
    $('hierarchyRows').innerHTML = items.map(m => `<tr><td>${esc(m.name)}</td><td><code>${esc(m.member_id)}</code></td><td>${esc(m.parent_member_id)}</td><td>${esc(m.depth)}</td><td>${esc(m.status)}</td></tr>`).join('') || '<tr><td colspan="5">沒有符合條件的會員</td></tr>';
  }
  function renderTree() {
    const children = new Map();
    for (const m of state.members) {
      const p = parent(m);
      if (!children.has(p)) children.set(p, []);
      children.get(p).push(m);
    }
    const rootId = state.root?.member_id || '';
    const seen = new Set();
    function node(m, level) {
      const key = id(m);
      if (seen.has(key) || level > 50) return `<li class="hierarchy-warning">偵測到重複或循環階層：${esc(key)}</li>`;
      seen.add(key);
      const kids = sort([...(children.get(key)||[])]);
      const open = state.expanded.has(key);
      const toggle = kids.length ? `<button type="button" class="hierarchy-toggle" data-toggle="${esc(key)}" aria-expanded="${open}">${open?'−':'+'}</button>` : '<span class="hierarchy-toggle-placeholder"></span>';
      return `<li><div class="hierarchy-node">${toggle}<span>${esc(m.name||key)}</span><small>${esc(key)}${level ? ` · 第 ${level} 層` : ' · 本人'}</small></div>${kids.length && open ? `<ul>${kids.map(k=>node(k,level+1)).join('')}</ul>`:''}</li>`;
    }
    const root = state.root || {member_id:rootId,name:'我的會員'};
    // The API returns only descendants; the root comes from the logged-in member.
    $('hierarchyTree').innerHTML = `<ul class="hierarchy-root">${node(root,0)}</ul>`;
  }
  function render() {renderTable();renderTree();}
  async function load() {
    if (!sessionToken) throw Error('請先登入');
    $('hierarchyMessage').textContent = '正在讀取下線資料…';
    const r = await api('member_downline', {token:sessionToken});
    if (!r.success) { $('hierarchyMessage').textContent = '查詢失敗：'+(r.error||'UNKNOWN'); return; }
    if (!Array.isArray(r.members)) throw Error('API members 格式錯誤');
    state.members = r.members;
    const rootId = String(r.root_member_id||'');
    const own = await api('member_self',{token:sessionToken});
    state.root = own.success && own.member ? own.member : {member_id:rootId,name:'我的會員'};
    state.expanded = new Set([rootId,...state.members.filter(m=>Number(m.depth)===1).map(id)]);
    state.loaded = true;
    $('hierarchyMessage').textContent = `已載入 ${state.members.length} 名下線會員`;
    $('hierarchyDepth').innerHTML = '<option value="">全部層級</option>'+[...new Set(state.members.map(m=>Number(m.depth)).filter(Number.isFinite))].sort((a,b)=>a-b).map(n=>`<option value="${n}">第 ${n} 層</option>`).join('');
    render();
  }
  function init() {
    const panel = $('hierarchyPanel');
    if (!panel) return;
    $('hierarchyReload').addEventListener('click',()=>run(load));
    ['hierarchySearch','hierarchyDepth','hierarchyStatus'].forEach(k=>$(k).addEventListener(k==='hierarchySearch'?'input':'change',renderTable));
    $('hierarchyTree').addEventListener('click',e=>{
      const b=e.target.closest('[data-toggle]'); if(!b)return;
      const key=b.dataset.toggle;
      if(state.expanded.has(key))state.expanded.delete(key);else state.expanded.add(key);
      renderTree();
    });
    $('hierarchyExpand').addEventListener('click',()=>{state.expanded = new Set([state.root?.member_id,...state.members.map(id)]);renderTree();});
    $('hierarchyCollapse').addEventListener('click',()=>{state.expanded = new Set([state.root?.member_id]);renderTree();});
  }
  window.Stage8Hierarchy = {init,load,clear(){state.members=[];state.root=null;state.loaded=false;$('hierarchyRows').innerHTML='';$('hierarchyTree').innerHTML='';$('hierarchyMessage').textContent='請登入後載入資料';}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
