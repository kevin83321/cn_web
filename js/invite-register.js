'use strict';
import { CONFIG } from './config.js';
(()=>{
  const $=id=>document.getElementById(id);
  const invite=new URLSearchParams(location.search).get('invite')||'';
  const msg=(text)=>{$('inviteMessage').textContent=text;};
  async function call(path,options={}){
    const r=await fetch(CONFIG.API_BASE+path,{...options,cache:'no-store'});
    const data=await r.json();
    if(!r.ok||!data.success)throw Error(data.error||`HTTP_${r.status}`);
    return data;
  }
  if(!/^[a-f0-9]{64}$/.test(invite)){msg('邀請連結無效，請向邀請人重新索取。');$('inviteForm').hidden=true;return;}
  call('/api/auth/invitations/preview?invite='+encodeURIComponent(invite)).then(data=>{
    $('inviter').textContent='邀請人：'+(data.inviter_name||'CN 會員');
    $('inviteForm').hidden=false;
  }).catch(()=>msg('邀請連結已過期或已使用，請向邀請人重新索取。'));
  $('inviteForm').addEventListener('submit',async e=>{
    e.preventDefault();const btn=$('inviteSubmit');btn.disabled=true;
    try{
      const password=$('invitePassword').value;
      if(password!==$('invitePassword2').value)throw Error('兩次密碼不一致');
      if(password.length<12)throw Error('密碼至少需要 12 個字元');
      await call('/api/auth/invitations/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invite,email:$('inviteEmail').value,name:$('inviteName').value,password})});
      msg('驗證信已寄出，請於 15 分鐘內開啟信件完成註冊。');
      $('inviteForm').hidden=true;
    }catch(error){msg(({PLEASE_WAIT_60_SECONDS:'請稍後再試',EMAIL_SEND_FAILED:'驗證信寄送失敗，請稍後重試',REGISTRATION_UNAVAILABLE:'此 Email 無法註冊，請使用其他 Email 或聯繫管理員'})[error.message]||error.message);}
    finally{btn.disabled=false;}
  });
})();
