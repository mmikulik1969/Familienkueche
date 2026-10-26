/* Einfacher Offline-Speicher: zuerst Netz, bei Fehler die zuletzt geladene Fassung. */
const CACHE='fk-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{
    if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c))}
    return r;
  }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./'))));
});
