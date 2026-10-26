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
  const setLoc=l=>{loc=l;try{localStorage.setItem(LOC_KEY,JSON.stringify(l))}catch(e){}};
  const fixId=d=>/^[0-9a-f]{16}$/i.test(d)?d.toUpperCase():d; // private OneDrive-IDs sind großgeschrieben gültig
  const base=()=>loc.own?`/me/drive/items/${loc.folderId}`:`/drives/${fixId(loc.driveId)}/items/${loc.folderId}`;
  const file=n=>`${base()}:/${encodeURIComponent(n)}`;

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

  /* daten.json */
  async function meta(){
    const r=await gx(file('daten.json'));
    if(r.status===404)return null;
    if(!r.ok)throw await fail(r);
    return r.json();
  }
  async function readData(){
    const m=await meta(); if(!m)return null;
    const dl=m['@microsoft.graph.downloadUrl'];
    let r;
    try{r=dl?await fetch(dl):null}catch(e){r=null}
    if(!r||!r.ok)r=await gx(file('daten.json')+':/content');
    if(!r.ok)throw await fail(r);
    return {etag:m.eTag,data:JSON.parse(await r.text())};
  }
  async function writeData(json,etag){
    const h={'Content-Type':'application/json'}; if(etag)h['If-Match']=etag;
    const r=await gx(file('daten.json')+':/content',{method:'PUT',headers:h,body:json});
    if(r.status===412){const x=new Error('conflict');x.status=412;throw x}
    if(!r.ok)throw await fail(r);
    return (await r.json()).eTag;
  }

  /* Fotos */
  const photos=new Map();
  async function putFile(name,blob){
    const r=await gx(file(name)+':/content',{method:'PUT',headers:{'Content-Type':blob.type||'image/jpeg'},body:blob});
    if(!r.ok)throw await fail(r);
    photos.set(name,URL.createObjectURL(blob));
  }
  async function photoUrl(name){
    if(photos.has(name))return photos.get(name);
    const r=await gx(file(name)+':/content');
    if(!r.ok)throw await fail(r);
    const u=URL.createObjectURL(await r.blob()); photos.set(name,u); return u;
  }
  const delFile=async name=>{photos.delete(name);try{await gx(file(name),{method:'DELETE'})}catch(e){}};

  return {redirectUri,init,login,logout,account:()=>account,loc:()=>loc,createFolder,createLink,join,meta,readData,writeData,putFile,photoUrl,delFile};
})();
