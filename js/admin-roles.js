'use strict';
import { $, esc, api, getToken, errors } from './admin-common.js';
(()=>{
  const $id=id=>document.getElementById(id);
  const permissionLabels={
    'admin.members.read':'查看會員','admin.members.update':'修改會員資料',
    'admin.members.role.update':'修改會員類型','admin.members.status.update':'修改帳號狀態',
    'admin.audit.read':'查看稽核紀錄','admin.roles.read':'查看會員系統角色',
    'admin.roles.assign':'指派管理員角色','admin.roles.catalog.read':'查看角色目錄',
    'admin.roles.create':'建立角色','admin.roles.permissions.manage':'設定角色權限'
  };
  let catalog=null, selected=null, granted=[];
  let originalPermissions = new Set();
  function message(text){$id('notice').textContent=text;}
  function textNode(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;}
  async function load(){
    const result=await api('/api/admin/roles');
    catalog=result;
    const host=$id('roles');host.replaceChildren();
    for(const role of result.roles||[]){
      const card=document.createElement('div');card.className='role-card';
      const info=document.createElement('div');info.append(textNode('strong',role.display_name+' ('+role.system_role+')'));
      info.append(textNode('p',`${role.member_count} 位會員 · ${role.permission_count} 項權限${role.protected?' · 受保護':''}`));
      const btn=textNode('button','查看權限');btn.type='button';btn.addEventListener('click',()=>openRole(role.system_role));
      card.append(info,btn);host.append(card);
    }
    message(`共 ${result.roles.length} 個系統角色`);
  }
  async function openRole(code){
    selected=null;$id('editSection').hidden=false;$id('editMessage').textContent='讀取中…';
    try{
      const d=await api('/api/admin/roles/'+encodeURIComponent(code)+'/permissions');
      selected=d.role;
      const existing=new Set((d.permissions||[]).map(p=>p.permission_code));
      originalPermissions = existing;
      $id('editTitle').textContent=d.role.display_name+' · 權限設定';
      $id('editInfo').textContent=d.role.protected?'此為受保護角色，僅可檢視權限。':'勾選權限後儲存，受影響會員將需要重新登入。';
      const canEdit=granted.includes('admin.roles.permissions.manage')&&!d.role.protected;
      $id('saveButton').hidden=!canEdit;
      const host=$id('permissionOptions');host.replaceChildren();
      const active=new Set(catalog.assignable_permission_codes||[]);
      for(const p of catalog.permissions||[]){
        if(!active.has(p.permission_code)&&!existing.has(p.permission_code))continue;
        const label=document.createElement('label');label.className='permission-row';
        const input=document.createElement('input');input.type='checkbox';input.value=p.permission_code;
        input.checked=existing.has(p.permission_code);input.disabled=!canEdit||!p.enabled||!active.has(p.permission_code);
        const desc=textNode('span',(permissionLabels[p.permission_code]||p.description||p.permission_code)+' — '+p.permission_code);
        label.append(input,desc);host.append(label);
      }
      $id('editMessage').textContent='';
      $id('editSection').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){$id('editMessage').textContent='讀取失敗：'+e.message;}
  }
  $id('createForm').addEventListener('submit',async e=>{
    e.preventDefault();const button=$id('createButton');button.disabled=true;
    try{
      const code=$id('roleCode').value.trim();
      await api('/api/admin/roles',{method:'POST',body:{system_role:code,display_name:$id('roleName').value.trim(),description:$id('roleDescription').value.trim()||null}});
      $id('createForm').reset();await load();await openRole(code);
    }catch(err){message('建立失敗：'+err.message);}finally{button.disabled=false;}
  });
  $id('permissionForm').addEventListener('submit',async e=>{
    e.preventDefault();if(!selected||selected.protected||!granted.includes('admin.roles.permissions.manage'))return;
    const inputs = Array.from($id('permissionOptions').querySelectorAll('input[type=checkbox]'));
    const permissions = [...new Set([
      ...inputs.filter(input => !input.disabled && input.checked).map(input => input.value),
      ...Array.from(originalPermissions).filter(code => !inputs.some(input => input.value === code && !input.disabled))
    ])];
    if(!confirm(`確定更新「${selected.display_name}」的權限？此角色會員將需要重新登入。`))return;
    $id('saveButton').disabled=true;
    try{
      const d=await api('/api/admin/roles/'+encodeURIComponent(selected.system_role)+'/permissions',{method:'PUT',body:{permissions}});
      $id('editMessage').textContent=d.changed?'已更新權限並建立稽核紀錄。':'權限沒有變更。';
      await load();
    }catch(err){$id('editMessage').textContent='儲存失敗：'+err.message;}
    finally{$id('saveButton').disabled=false;}
  });
  async function init(){
    if(!getToken()){location.replace('./index.html');return;}
    try{
      const p=await api('/api/auth/permissions');granted=p.permissions||[];
      if(!granted.includes('admin.roles.catalog.read')){window.CNAuthGuard.redirect('FORBIDDEN');return;}
      $id('createSection').hidden=!granted.includes('admin.roles.create');
      await load();
    }catch(e){message('讀取失敗：'+e.message);}
  }
  init();
})();
