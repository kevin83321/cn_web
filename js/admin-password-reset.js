'use strict';
/* Include after admin-common.js and admin-members.js on admin-members.html. */
(() => {
  const host = document.getElementById('memberDetail');
  if (!host) return;
  const section = document.createElement('section');
  section.className = 'cn-panel';
  section.innerHTML = `<h3>密碼重設</h3><p id="resetNotice" role="status">確認權限中…</p>
    <button type="button" id="resetPasswordButton" hidden>重設會員密碼</button>
    <div id="resetResult" hidden><p>臨時密碼僅顯示一次，請以安全方式交付會員。</p>
    <input id="temporaryPassword" type="text" readonly autocomplete="off" aria-label="一次性臨時密碼">
    <button type="button" id="hideTemporaryPassword">清除畫面上的臨時密碼</button></div>`;
  host.append(section);
  const $=id=>document.getElementById(id);
  let canReset=false, actorId=null, selectedId=null;
  const clear=()=>{$('temporaryPassword').value='';$('resetResult').hidden=true;};
  $('hideTemporaryPassword').addEventListener('click',clear);
  async function init(){
    try{
      const p=await api('/api/auth/permissions');
      canReset=(p.permissions||[]).includes('admin.accounts.password.reset');
      if(canReset){const me=await api('/api/auth/me');actorId=me.member?.member_id||null;}
      $('resetNotice').textContent=canReset?'僅管理員可重設其他會員密碼。':'沒有重設密碼權限。';
    }catch(e){$('resetNotice').textContent='權限確認失敗：'+e.message;}
  }
  document.getElementById('items')?.addEventListener('click',e=>{
    const button=e.target.closest('[data-member-id]');if(!button)return;
    selectedId=button.dataset.memberId;clear();
    $('resetPasswordButton').hidden=!canReset||selectedId===actorId;
  });
  document.getElementById('detailClose')?.addEventListener('click',()=>{selectedId=null;clear();});
  $('resetPasswordButton').addEventListener('click',async()=>{
    if(!canReset||!selectedId||selectedId===actorId)return;
    if(!confirm(`確定重設 ${selectedId} 的密碼？所有既有 Session 將失效，且會員下次登入必須修改密碼。`))return;
    const button=$('resetPasswordButton');button.disabled=true;clear();
    try{
      const result=await api('/api/admin/members/'+encodeURIComponent(selectedId)+'/auth-account/reset-password',{method:'POST'});
      $('temporaryPassword').value=result.temporary_password;
      $('resetResult').hidden=false;
      $('resetNotice').textContent='重設成功。請立即交付臨時密碼，離開後無法再次取得。';
    }catch(e){$('resetNotice').textContent='重設失敗：'+e.message;}
    finally{button.disabled=false;}
  });
  init();
})();
