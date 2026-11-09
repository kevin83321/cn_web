'use strict';
(()=>{
  const button=document.getElementById('createInviteButton');
  const output=document.getElementById('inviteLinkOutput');
  if(!button||!output)return;
  button.addEventListener('click',async()=>{
    button.disabled=true;output.textContent='產生邀請連結中…';
    try{
      const token=localStorage.getItem('member_session_token')||sessionStorage.getItem('member_session_token');
      if(!token)throw Error('請先登入');
      const res=await fetch('https://cn-web-backend.kevin83321.workers.dev/api/auth/invitations',{method:'POST',headers:{Authorization:'Bearer '+token}});
      const data=await res.json();if(!res.ok||!data.success)throw Error(data.error||'產生失敗');
      output.textContent=data.url;
      await navigator.clipboard.writeText(data.url).catch(()=>{});
    }catch(e){output.textContent='無法產生邀請連結：'+e.message;}
    finally{button.disabled=false;}
  });
})();
