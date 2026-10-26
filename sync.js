'use strict';
/* Anmeldung (Microsoft) und Speicherung (OneDrive über Microsoft Graph).
   Alle Daten liegen im Ordner "Familienkueche" im OneDrive: daten.json plus Fotos. */
const Cloud=(()=>{
  const CLIENT_ID='790ddaaf-0084-46da-b5af-a87bfa398e64';
  const SCOPES=['Files.ReadWrite.All','User.Read'];
  const GRAPH='https://graph.microsoft.com/v1.0';
  const LOC_KEY='fk.loc';
  const redirectUri=location.origin+location.pathname.replace(/index\.html$/,'');
  const app=new msal.PublicClientApplication({
    auth:{clientId:CLIENT_ID,authority:'https://login.microsoftonline.com/consumers',redirectUri,navigateToLoginRequestUrl:false},
    cache:{cacheLocation:'localStorage'}
  });
  let account=null,loc=null;
  try{loc=JSON.parse(localStorage.getItem(LOC_KEY))}catch(e){}

  async function init(){
    await app.initialize();
    const r=await app.handleRedirectPromise();
    account=r?.account||app.getAllAccounts()[0]||null;
    if(account)app.setActiveAccount(account);
    return account;
  }
  const login=()=>app.loginRedirect({scopes:SCOPES,prompt:'select_account'});
  const logout=()=>{try{localStorage.removeItem(LOC_KEY)}catch(e){}return app.logoutRedirect({account,postLogoutRedirectUri:redirectUri})};
  async function token(){
    try{return (await app.acquireTokenSilent({scopes:SCOPES,account})).accessToken}
    catch(e){
      if(e instanceof msal.InteractionRequiredAuthError||e.errorCode==='login_required'){
        await app.acquireTokenRedirect({scopes:SCOPES,account});
        return new Promise(()=>{});
      }
      throw e;
    }
  }
  async function gx(path,opt={}){
    const t=await token();
    try{return await fetch(path.startsWith('http')?path:GRAPH+path,{...opt,headers:{Authorization:'Bearer '+t,...(opt.headers||{})}})}
    catch(e){const x=new Error('offline');x.offline=true;throw x}
  }
  async function fail(r){
    const x=new Error('HTTP '+r.status);x.status=r.status;try{x.where=new URL(r.url).pathname.replace('/v1.0','').slice(0,90)}catch(e){}
    try{x.detail=(await r.json())?.error?.message}catch(e){}
    return x;
  }
  async function jx(path,opt){
    const r=await gx(path,opt);
    if(!r.ok)throw await fail(r);
    return r.status===204?null:r.json();
  }
  const JSONH={'Content-Type':'application/json'};
  const fixId=d=>/^[0-9a-f]{16}$/i.test(d)?d.toUpperCase():d; // private OneDrive-IDs sind großgeschrieben gültig
  const drv=()=>loc.own?'/me/drive':`/drives/${fixId(loc.driveId)}`;
  const item=id=>`${drv()}/items/${id}`;
  const base=()=>item(loc.folderId);
  let files=new Map(); // Dateiname -> {id,name,eTag} im Ordner
  const setLoc=l=>{loc=l;files=new Map();try{localStorage.setItem(LOC_KEY,JSON.stringify(l))}catch(e){}};

  /* Ordner anlegen (erste Person) oder per Link beitreten (alle anderen) */
  async function createFolder(){
    let it;
    try{it=await jx('/me/drive/root/children',{method:'POST',headers:JSONH,body:JSON.stringify({name:'Familienkueche',folder:{},'@microsoft.graph.conflictBehavior':'fail'})})}
    catch(e){if(e.status!==409)throw e;it=await jx('/me/drive/root:/Familienkueche')}
    setLoc({driveId:it.parentReference.driveId,folderId:it.id,own:true});
    return loc;
  }
  async function createLink(){
    const r=await jx(`${base()}/createLink`,{method:'POST',headers:JSONH,body:JSON.stringify({type:'edit',scope:'anonymous'})});
    return r.link.webUrl;
  }
  async function join(url){
    const id='u!'+btoa(unescape(encodeURIComponent(url.trim()))).replace(/=+$/,'').replace(/\//g,'_').replace(/\+/g,'-');
    const it=await jx(`/shares/${id}/driveItem?$select=id,name,folder,parentReference`,{headers:{Prefer:'redeemSharingLinkIfNecessary'}});
    if(!it.folder){const x=new Error('not-folder');throw x}
    setLoc({driveId:it.parentReference.driveId,folderId:it.id,own:false});
    return loc;
  }

  /* Dateien im Ordner: immer über die Datei-ID ansprechen, nie über Ordner-ID plus Pfad */
  async function list(){
    let url=`${base()}/children?$select=id,name,eTag&$top=200`; const m=new Map();
    while(url){const j=await jx(url);for(const it of j.value)m.set(it.name,it);url=j['@odata.nextLink']||null}
    files=m; return m;
  }
  async function find(name,fresh){
    if(!fresh&&files.has(name))return files.get(name);
    await list(); return files.get(name)||null;
  }
  async function ensure(name){
    let it=await find(name); if(it)return it;
    try{it=await jx(base()+'/children',{method:'POST',headers:JSONH,body:JSON.stringify({name,file:{},'@microsoft.graph.conflictBehavior':'fail'})})}
    catch(e){if(e.status!==409)throw e;it=await find(name,true)}
    files.set(name,it); return it;
  }

  /* daten.json */
  async function meta(){
    const it=files.get('daten.json');
    if(it){
      const r=await gx(item(it.id)+'?$select=id,eTag');
      if(r.ok){const j=await r.json();files.set('daten.json',{...it,eTag:j.eTag});return j}
      if(r.status!==404)throw await fail(r);
      files.delete('daten.json');
    }
    return find('daten.json',true);
  }
  async function readData(){
    const m=await meta(); if(!m)return null;
    const j=await jx(item(m.id));
    let r=null;
    try{if(j['@microsoft.graph.downloadUrl'])r=await fetch(j['@microsoft.graph.downloadUrl'])}catch(e){}
    if(!r||!r.ok)r=await gx(item(m.id)+'/content');
    if(!r.ok)throw await fail(r);
    const txt=await r.text();
    return {etag:j.eTag,data:txt.trim()?JSON.parse(txt):null};
  }
  async function writeData(json,etag){
    const it=await ensure('daten.json');
    const h={'Content-Type':'application/json'}; if(etag)h['If-Match']=etag;
    const r=await gx(item(it.id)+'/content',{method:'PUT',headers:h,body:json});
    if(r.status===412){const x=new Error('conflict');x.status=412;throw x}
    if(!r.ok)throw await fail(r);
    const j=await r.json(); files.set('daten.json',{id:it.id,name:'daten.json',eTag:j.eTag});
    return j.eTag;
  }

  /* Fotos */
  const photos=new Map();
  async function putFile(name,blob){
    const it=await ensure(name);
    const r=await gx(item(it.id)+'/content',{method:'PUT',headers:{'Content-Type':blob.type||'image/jpeg'},body:blob});
    if(!r.ok)throw await fail(r);
    photos.set(name,URL.createObjectURL(blob));
  }
  async function photoUrl(name){
    if(photos.has(name))return photos.get(name);
    const it=await find(name); if(!it)throw new Error('Foto nicht gefunden');
    const r=await gx(item(it.id)+'/content');
    if(!r.ok)throw await fail(r);
    const u=URL.createObjectURL(await r.blob()); photos.set(name,u); return u;
  }
  const delFile=async name=>{
    photos.delete(name);
    try{const it=await find(name);if(it){await gx(item(it.id),{method:'DELETE'});files.delete(name)}}catch(e){}
  };

  /* Verbindungstest: legt eine Testdatei an, beschreibt, liest und löscht sie */
  async function diagnose(){
    const out=[];
    const step=async(label,fn)=>{
      try{const r=await fn();out.push('OK      '+label+(r?' · '+r:''));return true}
      catch(e){out.push('FEHLER  '+label+' · '+(e.status||'')+' '+(e.detail||e.message)+(e.where?' · '+e.where:''));return false}
    };
    out.push('Ordner-ID: '+loc.folderId,'Laufwerk: '+loc.driveId+(loc.own?' (eigenes)':' (geteilt)'));
    await step('Ordner lesen',async()=>{const j=await jx(base()+'?$select=id,name,folder');return j.name});
    await step('Ordnerinhalt auflisten',async()=>{const m=await list();return [...m.keys()].join(', ')||'leer'});
    let id=null;
    await step('Testdatei anlegen',async()=>{
      const it=await jx(base()+'/children',{method:'POST',headers:JSONH,body:JSON.stringify({name:'diagnose.txt',file:{},'@microsoft.graph.conflictBehavior':'replace'})});
      id=it.id;return 'ok'});
    if(id){
      await step('Testdatei beschreiben',async()=>{const r=await gx(item(id)+'/content',{method:'PUT',headers:{'Content-Type':'text/plain'},body:'hallo'});if(!r.ok)throw await fail(r)});
      await step('Testdatei lesen',async()=>{const r=await gx(item(id)+'/content');if(!r.ok)throw await fail(r);return await r.text()});
      await step('Testdatei löschen',async()=>{const r=await gx(item(id),{method:'DELETE'});if(!r.ok)throw await fail(r)});
    }
    return out.join('\n');
  }

  return {diagnose,redirectUri,init,login,logout,account:()=>account,loc:()=>loc,createFolder,createLink,join,meta,readData,writeData,putFile,photoUrl,delFile};
})();
