'use strict';
(()=>{const state={page:1,pageSize:20,total:0,loading:false};const permission='admin.members.read';let canEdit=false;let selected=null;
function params(){const p=new URLSearchParams({page:String(state.page),page_size:String(state.pageSize)});for(const k of ['role','status']){if($(k).value)p.set(k,$(k).value)}if($('query').value.trim())p.set('q',$('query').value.trim());return p}
function itemCard(r){return `<article class="admin-item"><div class="admin-item-head"><strong>${esc(r.name)}</strong><span class="admin-pill">${esc(({distributor:'直銷商',lifestyle:'生活會員',non_member:'一般會員'})[r.role]||r.role)}</span></div><dl><div><dt>會員 ID</dt><dd>${esc(r.member_id)}</dd></div><div><dt>狀態</dt><dd>${esc(r.status)}</dd></div><div><dt>建立時間</dt><dd>${esc(r.created_at)}</dd></div></dl><button type="button" class="detail-open" data-member-id="${esc(r.member_id)}">查看詳細資料</button></article>`}
async function load(){if(state.loading)return;state.loading=true;$('message').textContent='正在載入…';$('previous').disabled=true;$('next').disabled=true;try{const d=await api('/api/admin/members?'+params());if(!Array.isArray(d.items))throw Error('INVALID_RESPONSE');state.total=Number(d.total)||0;state.page=Number(d.page)||state.page;$('items').innerHTML=d.items.map(itemCard).join('')||'<p class="admin-empty">沒有符合條件的紀錄</p>';$('count').textContent=`共 ${state.total} 筆`;$('pageInfo').textContent=`第 ${state.page} / ${Math.max(1,Math.ceil(state.total/state.pageSize))} 頁`;$('message').textContent='';$('previous').disabled=state.page<=1;$('next').disabled=state.page*state.pageSize>=state.total;}catch(e){$('message').textContent=errors[e.message]||('查詢失敗：'+e.message);$('items').replaceChildren();}finally{state.loading=false}}
async function init(){if(!TOKEN){location.replace('./index.html');return}try{const p=await api('/api/auth/permissions');if(!Array.isArray(p.permissions)||!p.permissions.includes(permission)){$('message').textContent='此帳號沒有管理員查詢權限';return}canEdit=p.permissions.includes('admin.members.update');await load()}catch(e){$('message').textContent=errors[e.message]||('權限驗證失敗：'+e.message)}}
$('items').addEventListener('click',event=>{const button=event.target.closest('[data-member-id]');if(button)openDetail(button.dataset.memberId)});
async function openDetail(id){
 $('detailMessage').textContent='正在載入會員資料…';$('memberDetail').hidden=false;
 try{const d=await api('/api/admin/members/'+encodeURIComponent(id));selected=d.member;
  $('detailId').value=selected.member_id;$('detailName').value=selected.name||'';
  $('detailEmail').value=selected.email||'';$('detailPhone').value=selected.phone||'';
  $('detailRole').value=({distributor:'直銷商',lifestyle:'生活會員',non_member:'一般會員'})[selected.role]||selected.role;
  $('detailStatus').value=selected.status;$('detailCreated').value=selected.created_at;
  for(const id of ['detailName','detailEmail','detailPhone'])$(id).readOnly=!canEdit;
  $('detailSave').hidden=!canEdit;$('detailMessage').textContent=canEdit?'可修改姓名、Email、電話。':'僅有檢視權限。';
  $('memberDetail').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){selected=null;$('detailMessage').textContent=errors[e.message]||('讀取失敗：'+e.message)}
}
$('detailClose').addEventListener('click',()=>{$('memberDetail').hidden=true;selected=null});
$('detailForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!canEdit||!selected)return;
 const body={name:$('detailName').value.trim(),email:$('detailEmail').value.trim()||null,phone:$('detailPhone').value.trim()||null};
 $('detailSave').disabled=true;$('detailMessage').textContent='儲存中…';
 try{const d=await api('/api/admin/members/'+encodeURIComponent(selected.member_id),{method:'PATCH',body});
  selected=d.member;$('detailMessage').textContent=d.changed?'已儲存，操作紀錄已建立。':'資料沒有變更。';
  await load();
 }catch(e){$('detailMessage').textContent=errors[e.message]||('儲存失敗：'+e.message)}
 finally{$('detailSave').disabled=false}
});
$('filters').addEventListener('submit',e=>{e.preventDefault();state.page=1;load()});$('previous').addEventListener('click',()=>{if(state.page>1){state.page--;load()}});$('next').addEventListener('click',()=>{if(state.page*state.pageSize<state.total){state.page++;load()}});init();})();
