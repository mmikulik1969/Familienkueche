'use strict';
const APP_VERSION='2026-10-30 l';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,9);
const clone=o=>JSON.parse(JSON.stringify(o));
const DAYS=['So','Mo','Di','Mi','Do','Fr','Sa'];
const SLOTS=['Mittag','Abend'];
const LOCS=['Kühlschrank','Tiefkühler','Vorratskammer','Sonstiges'];
const CATS=['Obst & Gemüse','Milch & Eier','Fleisch & Fisch','Brot & Backwaren','Trockenwaren','Konserven & Soßen','Gewürze & Öle','Getränke','Haushalt','Sonstiges'];
const LEVELS=['Leer','Wenig','Da'];
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parseIso=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const fmtDay=d=>DAYS[d.getDay()]+' '+d.getDate()+'.'+(d.getMonth()+1)+'.';
const NOW=new Date(); NOW.setHours(12,0,0,0);
const TODAY=iso(NOW);

/* ---------- Zutaten: Erkennen, Einheiten, Kategorien ---------- */
const UNITMAP={kg:'kg',g:'g',dag:'dag',ml:'ml',dl:'dl',l:'l',el:'EL',tl:'TL','stk':'Stk','stk.':'Stk','stück':'Stk','pkg':'Pkg','pkg.':'Pkg',bund:'Bund',dose:'Dose',zehe:'Zehe',zehen:'Zehe',prise:'Prise'};
const RULES=[
  ['Konserven & Soßen',/passiert|tomatenmark|dose|kokosmilch|brühe|suppe|senf|ketchup|bohnen|mais\b/],
  ['Trockenwaren',/mehl|nudel|spaghetti|penne|reis\b|linse|zucker|haferflock|brösel|rosine|grieß|spätzle|nüsse|müsli|kakao|backpulver/],
  ['Milch & Eier',/milch|butter|\beier\b|^ei$|obers|sahne|rahm|käse|joghurt|topfen|parmesan|mozzarella|quark/],
  ['Fleisch & Fisch',/faschiert|hack|schnitzel|fleisch|huhn|hendl|wurst|schinken|speck|lachs|fisch|würstel/],
  ['Brot & Backwaren',/brot|semmel|toast|gebäck/],
  ['Gewürze & Öle',/salz|pfeffer|\böl\b|öl$|essig|curry|paprikapulver|muskat|zimt|schmalz|kümmel|oregano|vanille/],
  ['Obst & Gemüse',/zwiebel|knoblauch|karott|möhre|erdäpfel|kartoffel|tomate|paprika|zucchini|spinat|salat|apfel|äpfel|zitrone|lauch|sellerie|petersilie|schnittlauch|gurke|pilz|champignon|banane|gemüse|ingwer|kürbis|brokkoli|beere|orange/],
  ['Getränke',/saft|wasser|wein|bier|tee\b|kaffee/],
  ['Haushalt',/papier|spülmittel|waschmittel|müllsack|schwamm|alufolie|backpapier/]
];
const guess=n=>{const s=n.toLowerCase();for(const [c,r] of RULES)if(r.test(s))return c;return 'Sonstiges'};
const stem=n=>String(n).toLowerCase().replace(/\(.*?\)/g,'').trim().replace(/(en|n|e)$/,'');
function parseLine(t){
  t=t.trim(); if(!t)return null;
  const m=t.match(/^(\d+[.,]?\d*|\d+\/\d+|½|¼|¾)\s*(?:(kg|g|dag|ml|dl|l|EL|TL|Stk\.?|Stück|Pkg\.?|Bund|Dose|Zehen?|Prise)(?=\s|$))?\s*(.*)$/i);
  if(!m||!m[3])return {name:t,amount:null,unit:''};
  let a=m[1]; a=a==='½'?.5:a==='¼'?.25:a==='¾'?.75:a.includes('/')?(+a.split('/')[0])/(+a.split('/')[1]):parseFloat(a.replace(',','.'));
  return {name:m[3].trim(),amount:a,unit:m[2]?UNITMAP[m[2].toLowerCase()]:''};
}
const lineStr=g=>(g.amount!=null?String(Math.round(g.amount*100)/100).replace('.',',')+(g.unit?' '+g.unit:'')+' ':'')+g.name;
function norm(a,u){ if(a==null)return [null,u];
  if(u==='kg')return [a*1000,'g']; if(u==='dag')return [a*10,'g']; if(u==='l')return [a*1000,'ml']; if(u==='dl')return [a*100,'ml']; return [a,u]; }
function fmtNum(n){
  if(n>=20)return String(Math.round(n));
  if(n>=10)return String(Math.round(n*2)/2).replace('.',',');
  const r=Math.round(n*4)/4, w=Math.floor(r), f=r-w, fr={0:'',.25:'¼',.5:'½',.75:'¾'}[f];
  return (w||!fr?w:'')+fr;
}
function fmtAmt(a,u){
  if(a==null)return '';
  if(u==='g'&&a>=1000){a/=1000;u='kg'} else if(u==='ml'&&a>=1000){a/=1000;u='l'}
  if(u==='kg'||u==='l'){return String(Math.round(a*10)/10).replace('.',',')+' '+u}
  if(u==='Zehe'&&a>1)u='Zehen';
  return fmtNum(a)+(u?' '+u:'');
}

/* ---------- Zustand ---------- */
const emptyState=()=>({v:1,household:4,recipes:[],pantry:[],plan:[],extras:[],members:[],att:{},openIn:true,checked:{}});
function normalize(d){
  const s=emptyState(); if(!d||typeof d!=='object')return s;
  for(const c of ['recipes','pantry','plan','extras','members'])if(Array.isArray(d[c]))s[c]=d[c];
  if(d.att&&typeof d.att==='object')s.att=d.att;
  if(typeof d.openIn==='boolean')s.openIn=d.openIn;
  if(d.checked&&typeof d.checked==='object')s.checked=d.checked;
  if(Number.isFinite(d.household))s.household=d.household;
  return s;
}
let S=emptyState();
const UI={tab:'plan',week:0,q:'',tag:'',horizon:7,hrange:30,hq:''};
let D=null,C=null,PEND=[],AFTER=null,FOUND=[];
const rec=id=>S.recipes.find(r=>r.id===id);
const findPantry=name=>{const k=stem(name);
  return S.pantry.find(p=>stem(p.name)===k)||(k.length>=4?S.pantry.find(p=>{const q=stem(p.name);return q.length>=4&&(q.includes(k)||k.includes(q))}):undefined)};

/* ---------- Abgleich mit OneDrive ----------
   Jedes Gerät merkt sich den zuletzt abgeglichenen Stand (base). Beim Speichern werden nur
   die eigenen Änderungen gegenüber base auf den aktuellen Stand in OneDrive gelegt. */
const Sync={etag:null,base:null,timer:null,chain:Promise.resolve(),online:true};
const COLL=['recipes','pantry','plan','extras','members'];
function mergeState(base,local,remote){
  const out=clone(remote);
  for(const c of COLL){
    const b=new Map((base[c]||[]).map(x=>[x.id,JSON.stringify(x)]));
    const l=new Map((local[c]||[]).map(x=>[x.id,x]));
    let arr=[...(remote[c]||[])];
    for(const id of b.keys())if(!l.has(id))arr=arr.filter(x=>x.id!==id);
    for(const [id,x] of l){
      if(b.get(id)===JSON.stringify(x))continue;
      const i=arr.findIndex(y=>y.id===id); if(i>=0)arr[i]=x; else arr.push(x);
    }
    out[c]=arr;
  }
  const bc=base.checked||{},ch={...remote.checked};
  for(const k of Object.keys(bc))if(!(k in local.checked))delete ch[k];
  for(const k of Object.keys(local.checked))if(!(k in bc))ch[k]=true;
  out.checked=ch;
  out.household=local.household!==base.household?local.household:remote.household;
  out.openIn=local.openIn!==base.openIn?local.openIn:remote.openIn;
  const flat=o=>{const m=new Map();for(const [k,v] of Object.entries(o||{})){for(const [id,s] of Object.entries(v.m||{}))m.set(k+'\0m\0'+id,s);if(v.g)m.set(k+'\0g',v.g)}return m};
  const fb=flat(base.att),fl=flat(local.att),fm=flat(remote.att);
  for(const k of fb.keys())if(!fl.has(k))fm.delete(k);
  for(const [k,v] of fl)if(!fb.has(k)||fb.get(k)!==v)fm.set(k,v);
  out.att={};
  for(const [k,v] of fm){const [day,t,id]=k.split('\0');const e=out.att[day]||(out.att[day]={m:{},g:0});if(t==='g')e.g=v;else e.m[id]=v}
  return out;
}
const isDirty=()=>!Sync.base||JSON.stringify(S)!==JSON.stringify(Sync.base);
function cacheSave(){try{localStorage.setItem('fk.cache',JSON.stringify({S,base:Sync.base,etag:Sync.etag}))}catch(e){}}
function cacheLoad(){try{const c=JSON.parse(localStorage.getItem('fk.cache'));if(c){S=normalize(c.S);Sync.base=c.base?normalize(c.base):null;Sync.etag=c.etag||null;return true}}catch(e){}return false}
function setSync(txt,ok){const e=$('#sync');if(e)e.innerHTML='<span class="dot'+(ok?' on':'')+'"></span>'+esc(txt)}
const queue=fn=>Sync.chain=Sync.chain.then(fn,fn);
function schedulePush(){clearTimeout(Sync.timer);Sync.timer=setTimeout(()=>queue(doPush),800)}
function commit(){render();cacheSave();schedulePush()}

function onError(e){
  if(e.offline){setSync('Offline: wird später gesendet',false);return}
  if(e.status===401||e.status===403){setSync('Keine Berechtigung für den Ordner',false);return}
  setSync('Fehler: '+(e.detail||e.message)+(e.where?' · '+e.status+' '+e.where:''),false);
}
function applyRemote(rd){
  const remote=normalize(rd.data),dirty=isDirty()&&Sync.base;
  S=dirty?mergeState(Sync.base,S,remote):remote;
  Sync.base=clone(remote); Sync.etag=rd.etag; cacheSave(); render();
  if(D)detailSheet();
  if(dirty)schedulePush();
}
async function doPull(){
  try{
    const m=await Cloud.meta();
    if(!m){if(!Sync.etag||isDirty())await doPush();return}
    if(m.eTag!==Sync.etag){const rd=await Cloud.readData();if(rd&&rd.data)applyRemote(rd);else if(isDirty())await doPush()}
    setSync(isDirty()?'Änderungen offen':'Synchron',!isDirty());
  }catch(e){onError(e)}
}
async function doPush(){
  if(Sync.base&&!isDirty()){return}
  setSync('Speichert …',false);
  try{
    if(!Sync.base){ // noch nie abgeglichen: vorhandene Daten zuerst laden, nie blind überschreiben
      const m=await Cloud.meta();
      if(m){const rd=await Cloud.readData();if(rd&&rd.data)applyRemote(rd);if(!isDirty())return}
    }
    for(let i=0;i<3;i++){
      const json=JSON.stringify(S);
      try{
        Sync.etag=await Cloud.writeData(json,Sync.etag);
        Sync.base=JSON.parse(json); cacheSave();
        setSync(isDirty()?'Änderungen offen':'Gespeichert',!isDirty());
        if(isDirty())schedulePush();
        return;
      }catch(e){
        if(e.status!==412)throw e;
        const rd=await Cloud.readData(); if(!rd)return;
        const remote=normalize(rd.data);
        S=mergeState(Sync.base||emptyState(),S,remote); Sync.base=clone(remote); Sync.etag=rd.etag; render();
      }
    }
    setSync('Konflikt, wird erneut versucht',false);
  }catch(e){onError(e)}
}
function startSync(){
  const tick=()=>queue(()=>isDirty()?doPush().then(doPull):doPull());
  tick(); setInterval(tick,20000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
  window.addEventListener('online',tick);
}

/* ---------- Anwesenheit am Abend ---------- */
const akey=(d,slot='Abend')=>d+'|'+slot;
const getMe=()=>{try{const id=localStorage.getItem('fk.me');return S.members.some(m=>m.id===id)?id:''}catch(e){return ''}};
const setMe=id=>{try{localStorage.setItem('fk.me',id)}catch(e){}};
function attNums(d,slot='Abend'){
  const a=S.att[akey(d,slot)]||{m:{},g:0};
  const inn=S.members.filter(m=>a.m[m.id]==='in').length, out=S.members.filter(m=>a.m[m.id]==='out').length;
  return {inn,out,open:S.members.length-inn-out,g:a.g||0,any:!!(inn||out||a.g)};
}
function attCount(d,slot){
  const n=attNums(d,slot); if(!n.any)return null;
  return Math.max(1,n.inn+(S.openIn!==false?n.open:0)+n.g);
}
const pers=e=>e.manual?e.persons:(attCount(e.date,e.slot)??e.persons);
const isAuto=e=>!e.manual&&attCount(e.date,e.slot)!=null;
function setAtt(d,id,v){
  const k=akey(d),a=S.att[k]||(S.att[k]={m:{},g:0});
  if(v)a.m[id]=v; else delete a.m[id];
  if(!Object.keys(a.m).length&&!a.g)delete S.att[k];
}
function attSummary(d){
  const n=attNums(d); if(!S.members.length)return '';
  const p=[`${n.inn} dabei`]; if(n.open)p.push(`${n.open} offen`); if(n.out)p.push(`${n.out} nicht`); if(n.g)p.push(`+${n.g} Gäste`);
  return p.join(' · ');
}
function attCard(){
  if(!S.members.length)return `<div class="card hh"><div><b>Wer isst mit?</b><div class="small muted">Familienmitglieder anlegen, dann könnt ihr euch für den Abend an- und abmelden.</div></div><button class="btn sm" data-act="members">Einrichten</button></div>`;
  const me=getMe();
  let h=`<div class="card att"><div class="att-h"><b>Abendessen: wer ist dabei?</b><button class="btn sm quiet" data-act="members">Mitglieder</button></div>`;
  if(!me)h+=`<div class="small muted" style="margin-bottom:6px">Damit du dich selbst anmelden kannst: <button class="linkbtn" data-act="members">Wer bist du?</button></div>`;
  for(let i=0;i<3;i++){
    const d=addDays(NOW,i),k=iso(d),st=me?S.att[akey(k)]?.m?.[me]:'';
    h+=`<div class="att-row"><button class="att-d" data-act="att" data-id="${k}"><b>${i===0?'Heute':i===1?'Morgen':fmtDay(d)}</b><span class="small muted">${esc(attSummary(k))}</span></button>
    ${me?`<span class="seg"><button class="l2${st==='in'?' on':''}" data-act="meSet" data-id="${k}" data-v="in">Dabei</button><button class="l0${st==='out'?' on':''}" data-act="meSet" data-id="${k}" data-v="out">Nicht dabei</button></span>`:''}</div>`;
  }
  return h+'</div>';
}
function attSheet(k){
  AT=k; const a=S.att[akey(k)]||{m:{},g:0}, n=attNums(k), c=attCount(k,'Abend');
  const meals=S.plan.filter(e=>e.date===k&&e.slot==='Abend').map(e=>({e,r:rec(e.rid)})).filter(x=>x.r);
  sheet(`<div class="card">${S.members.map(m=>{const v=a.m[m.id]||'';
    return `<div class="prow"><span class="n">${esc(m.name)}</span><span class="seg">
    <button class="l2${v==='in'?' on':''}" data-act="attSet" data-id="${m.id}" data-v="in">Dabei</button>
    <button class="l1${v===''?' on':''}" data-act="attSet" data-id="${m.id}" data-v="">Offen</button>
    <button class="l0${v==='out'?' on':''}" data-act="attSet" data-id="${m.id}" data-v="out">Nicht</button></span></div>`}).join('')}</div>
  <div class="card hh" style="margin-top:10px"><div><b>Gäste</b><div class="small muted">Weitere Personen ohne Konto</div></div>
  <span class="pers"><button data-act="attG" data-d="-1" aria-label="Weniger Gäste">−</button><b>${a.g||0}</b><button data-act="attG" data-d="1" aria-label="Mehr Gäste">+</button></span></div>
  <label class="chk"><input type="checkbox" data-act="openIn"${S.openIn!==false?' checked':''}> Offene zählen als dabei</label>
  <p style="margin:8px 0"><b>${c==null?'Noch keine Angaben.':`Es wird für ${c} ${c===1?'Person':'Personen'} gekocht.`}</b>
  ${meals.length?`<br><span class="small muted">${meals.map(({e,r})=>`${esc(r.title)}: ${pers(e)} Pers.${isAuto(e)?' (automatisch)':' (von Hand eingestellt)'}`).join('<br>')}</span>`:''}</p>
  ${meals.some(({e})=>e.manual)?`<div class="acts"><button class="btn quiet" data-act="attAuto">Wieder automatisch berechnen</button></div>`:''}`,'Anwesenheit '+fmtDay(parseIso(k))+' Abend');
}
function membersSheet(){
  const me=getMe(), acc=Cloud.account(), accName=acc?.name||'';
  sheet(`<p class="muted small" style="margin-top:0">Wer regelmäßig mitisst. Tippe „Das bin ich" bei deinem Namen, dann kannst du dich auf diesem Gerät mit einem Tipp an- und abmelden. Kinder ohne eigenes Handy meldet ihr in der Anwesenheit mit an.</p>
  <div class="card">${S.members.map(m=>`<div class="prow"><span class="n">${esc(m.name)}</span>
    <button class="btn sm ${m.id===me?'':'quiet'}" data-act="iam" data-id="${m.id}">${m.id===me?'Das bin ich ✓':'Das bin ich'}</button>
    <button class="x" data-act="memDel" data-id="${m.id}" aria-label="${esc(m.name)} entfernen">×</button></div>`).join('')||'<div class="empty" style="padding:12px">Noch niemand angelegt.</div>'}</div>
  <form class="addrow" style="grid-template-columns:1fr auto;margin-top:12px" data-form="addMember"><input type="text" id="mn" placeholder="Name, z. B. Anna" aria-label="Name"><button class="btn" type="submit">+</button></form>
  ${accName&&!S.members.some(m=>m.name===accName)?`<div class="acts"><button class="btn ghost sm" data-act="memSelf">„${esc(accName)}" hinzufügen (dein Microsoft-Name)</button></div>`:''}`,'Familienmitglieder');
}
let AT='';

/* ---------- Einkaufsliste berechnen ---------- */
function shopLines(){
  const to=iso(addDays(NOW,UI.horizon-1)),m=new Map();
  for(const e of S.plan){
    if(e.date<TODAY||e.date>to)continue;
    const r=rec(e.rid); if(!r)continue; const f=pers(e)/r.servings;
    for(const g of r.ing){
      const [a,u]=norm(g.amount==null?null:g.amount*f,g.unit), k=stem(g.name)+'|'+u;
      let l=m.get(k); if(!l){l={key:k,name:g.name,unit:u,amount:null,cat:guess(g.name),from:new Set()};m.set(k,l)}
      if(a!=null)l.amount=(l.amount||0)+a; l.from.add(r.title);
    }
  }
  const need=[],have=[];
  for(const l of m.values()){const p=findPantry(l.name); l.stock=p?p.level:-1; (p&&p.level===2?have:need).push(l)}
  for(const x of S.extras)need.push({key:'x:'+x.id,name:x.name,unit:x.unit||'',amount:x.amount,cat:x.cat||guess(x.name),from:new Set(),extra:true,id:x.id});
  return {need,have};
}
const openCount=()=>shopLines().need.filter(l=>!S.checked[l.key]).length;

/* ---------- Ansichten ---------- */
const ICON={
  plan:'<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  rec:'<svg viewBox="0 0 24 24"><path d="M5 4.5h10.5A3.5 3.5 0 0 1 19 8v11.5H8.5A3.5 3.5 0 0 1 5 16z"/><path d="M5 16a3.5 3.5 0 0 1 3.5-3.5H19"/></svg>',
  pan:'<svg viewBox="0 0 24 24"><path d="M4 9h16v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5z"/><path d="M3 4.5h18V9H3zM10 13h4"/></svg>',
  shop:'<svg viewBox="0 0 24 24"><path d="M3.5 4h2.2l2.2 11h10l2-8H7"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>',
  hist:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>'
};
function render(){
  const n=openCount();
  $('#tabs').innerHTML=[['plan','Plan'],['rec','Rezepte'],['pan','Vorrat'],['shop','Einkauf'],['hist','Verlauf']].map(([k,t])=>
    `<button data-act="tab" data-id="${k}" class="${UI.tab===k?'on':''}" aria-label="${t}">${ICON[k]}<span>${t}</span>${k==='shop'&&n?`<span class="badge">${n}</span>`:''}</button>`).join('');
  $('#app').innerHTML=({plan:planView,rec:recView,pan:panView,shop:shopView,hist:histView})[UI.tab]();
}
function stepper(id,v){return `<span class="pers"><button data-act="pers" data-id="${id}" data-d="-1" aria-label="Eine Person weniger">−</button><b>${v}</b>Pers.<button data-act="pers" data-id="${id}" data-d="1" aria-label="Eine Person mehr">+</button></span>`}

function planView(){
  const mon=addDays(NOW,-((NOW.getDay()+6)%7)+UI.week*7), sun=addDays(mon,6);
  let h=`<div class="card hh"><div><b>Standard</b><div class="small muted">Für neue Mahlzeiten vorgewählt</div></div>${stepper('household',S.household)}</div>
  <div class="card hh"><div><b>Ausgewogen essen?</b><div class="small muted">Einschätzung und Vorschläge nach eurem Plan</div></div><button class="btn sm" data-act="balance">Vorschläge</button></div>
  ${attCard()}
  <div class="weeknav"><button class="arrow" data-act="week" data-d="-1" aria-label="Vorige Woche">‹</button>
  <div style="text-align:center"><h2 style="font-size:1.1rem">${UI.week===0?'Diese Woche':UI.week===1?'Nächste Woche':UI.week===-1?'Letzte Woche':'Woche ab '+fmtDay(mon)}</h2><div class="small muted">${fmtDay(mon)} – ${fmtDay(sun)}</div></div>
  <button class="arrow" data-act="week" data-d="1" aria-label="Nächste Woche">›</button></div><div style="height:12px"></div>`;
  for(let i=0;i<7;i++){
    const d=addDays(mon,i),k=iso(d),es=S.plan.filter(e=>e.date===k);
    h+=`<section class="card day${k===TODAY?' today':''}"><div class="day-h"><b>${fmtDay(d)}</b>${k===TODAY?'<span class="tag">Heute</span>':''}<button class="add" data-act="addPlan" data-id="${k}" aria-label="Gericht planen am ${fmtDay(d)}">+</button></div>`;
    if(!es.length)h+=`<div class="empty">Noch nichts geplant</div>`;
    es.sort((a,b)=>SLOTS.indexOf(a.slot)-SLOTS.indexOf(b.slot)).forEach(e=>{
      const r=rec(e.rid); if(!r)return;
      const pe=pers(e),fl=isAuto(e)?'<span class="flag">nach Anmeldung</span>':pe>S.household?'<span class="flag">Besuch</span>':pe<S.household?'<span class="flag">weniger</span>':'';
      h+=`<div class="meal"><div class="mt"><span class="slot">${e.slot}</span><button class="name" data-act="open" data-id="${r.id}" data-p="${pe}">${esc(r.title)}</button></div>
      <div>${stepper(e.id,pe)}${fl}</div><button class="x" data-act="rmPlan" data-id="${e.id}" aria-label="Entfernen">×</button></div>`;
    });
    if(S.members.length)h+=`<button class="att-line" data-act="att" data-id="${k}">Abend: ${esc(attSummary(k))} ›</button>`;
    h+='</section>';
  }
  return h+`<div class="acts"><button class="btn quiet" data-act="tab" data-id="shop">Einkaufsliste ansehen</button></div>`;
}

function covOf(r){const t=r.ing.length,h=r.ing.filter(g=>{const p=findPantry(g.name);return p&&p.level===2}).length;return {t,h}}
function recView(){
  const tags=[...new Set(S.recipes.flatMap(r=>r.tags))].sort();
  return `<div class="section-h"><h2>Rezepte (${S.recipes.length})</h2><button class="btn sm" data-act="newRecipe">+ Rezept</button></div>
  <div class="acts" style="margin:0 0 10px"><button class="btn sm quiet" data-act="fromPantry">Was kochen wir? Aus dem Vorrat</button></div>
  <input type="search" id="q" placeholder="Rezept oder Zutat suchen" value="${esc(UI.q)}" aria-label="Suchen">
  <div class="chips">${tags.map(t=>`<button class="chip${UI.tag===t?' on':''}" data-act="tag" data-id="${esc(t)}">${esc(t)}</button>`).join('')}</div>
  <div id="rlist">${recList()}</div>`;
}
function recList(){
  const q=UI.q.trim().toLowerCase();
  const l=S.recipes.filter(r=>(!UI.tag||r.tags.includes(UI.tag))&&(!q||r.title.toLowerCase().includes(q)||r.source.toLowerCase().includes(q)||r.ing.some(g=>g.name.toLowerCase().includes(q))));
  if(!l.length)return `<div class="empty">${S.recipes.length?'Keine Treffer.':'Noch keine Rezepte. Mit „+ Rezept" das erste anlegen, oder unter ⋮ Rezepte aus dem Prototyp übernehmen.'}</div>`;
  return l.map(r=>{const c=covOf(r);return `<button class="card rcard" data-act="open" data-id="${r.id}"><h3>${esc(r.title)}</h3>
    <div class="meta">${esc(r.source||'Ohne Quelle')}</div><div class="meta">${r.servings} Portionen · ${c.t} Zutaten · <span class="cov">${c.h} davon im Vorrat</span></div>
    <div class="tags">${r.tags.map(t=>`<span>${esc(t)}</span>`).join('')}</div></button>`}).join('');
}

function panView(){
  let h=`<div class="section-h"><h2>Vorrat</h2><span class="small muted">Grob: Da · Wenig · Leer</span></div>
  <form class="addrow" data-form="addPantry"><input type="text" id="pn" placeholder="Neuer Artikel, z. B. Nudeln" aria-label="Artikel"><select id="pl" aria-label="Lagerort">${LOCS.map(l=>`<option>${l}</option>`).join('')}</select><button class="btn" type="submit">+</button></form>`;
  for(const loc of LOCS){
    const items=S.pantry.filter(p=>p.loc===loc).sort((a,b)=>a.level-b.level||a.name.localeCompare(b.name));
    if(!items.length)continue;
    h+=`<div class="grp"><h3>${loc}</h3><div class="card">${items.map(p=>`<div class="prow"><span class="n">${esc(p.name)}</span>
      <span class="seg">${[0,1,2].map(v=>`<button class="l${v}${p.level===v?' on':''}" data-act="lvl" data-id="${p.id}" data-d="${v}">${LEVELS[v]}</button>`).join('')}</span>
      <button class="x" data-act="rmPantry" data-id="${p.id}" aria-label="${esc(p.name)} entfernen">×</button></div>`).join('')}</div></div>`;
  }
  if(!S.pantry.length)h+=`<div class="empty">Der Vorrat ist leer. Nach dem ersten Einkauf füllt er sich automatisch.</div>`;
  return h;
}

function shopView(){
  const {need,have}=shopLines();
  const by={}; need.forEach(l=>(by[l.cat]||(by[l.cat]=[])).push(l));
  const checked=need.filter(l=>S.checked[l.key]).length;
  let h=`<div class="section-h"><h2>Einkauf</h2><span class="seg2">${[3,7,14].map(n=>`<button class="${UI.horizon===n?'on':''}" data-act="hor" data-d="${n}">${n} Tage</button>`).join('')}</span></div>
  <form class="addrow" style="grid-template-columns:1fr auto" data-form="addExtra"><input type="text" id="xn" placeholder="Etwas dazuschreiben, z. B. 2 l Milch" aria-label="Artikel"><button class="btn" type="submit">+</button></form>`;
  if(need.some(l=>!S.checked[l.key]))h+=`<div class="acts" style="margin:0 0 12px"><button class="btn sm quiet" data-act="shareList">Liste senden (WhatsApp, E-Mail, SMS)</button></div>`;
  if(!need.length)h+=`<div class="empty">Nichts zu kaufen für die nächsten ${UI.horizon} Tage. Plane Gerichte im Plan oder schreibe Artikel dazu.</div>`;
  for(const c of CATS){
    if(!by[c])continue;
    h+=`<div class="grp"><h3>${c}</h3><div class="card">${by[c].sort((a,b)=>a.name.localeCompare(b.name)).map(l=>{
      const sub=l.extra?'Zusätzlich':[...l.from].join(', ')+(l.stock===1?' · wenig da':'');
      return `<button class="line${S.checked[l.key]?' done':''}" data-act="chk" data-id="${esc(l.key)}"><span class="box">${S.checked[l.key]?'✓':''}</span>
      <span class="l-main"><b>${esc(l.name)}</b><span class="l-sub">${esc(sub)}</span></span><span class="l-amt">${fmtAmt(l.amount,l.unit)}</span></button>`}).join('')}</div></div>`;
  }
  if(have.length)h+=`<details class="card cov-d"><summary>Schon im Vorrat (${have.length})</summary><ul>${have.map(l=>`<li>${esc(l.name)} ${fmtAmt(l.amount,l.unit)}</li>`).join('')}</ul></details>`;
  if(checked)h+=`<div class="finish"><button class="btn" data-act="finish">${checked} abgehakt: In den Vorrat übernehmen</button></div>`;
  return h;
}

/* ---------- Verlauf: was wir wann gegessen haben ---------- */
const past=()=>S.plan.filter(e=>e.date<TODAY).map(e=>({...e,persons:pers(e),t:rec(e.rid)?.title||e.title||'Gelöschtes Rezept'}));
function histView(){
  return `<div class="section-h"><h2>Verlauf</h2><span class="seg2">${[[30,'30 Tage'],[90,'90 Tage'],[0,'Alles']].map(([n,l])=>`<button class="${UI.hrange===n?'on':''}" data-act="hrange" data-d="${n}">${l}</button>`).join('')}</span></div>
  <div class="acts" style="margin:0 0 10px"><button class="btn sm" data-act="backfill">+ Mahlzeit nachtragen</button></div>
  <input type="search" id="hq" placeholder="Gericht suchen" value="${esc(UI.hq)}" aria-label="Im Verlauf suchen">
  <div id="hlist">${histList()}</div>`;
}
function histList(){
  const from=UI.hrange?iso(addDays(NOW,-UI.hrange)):'0000-00-00', q=UI.hq.trim().toLowerCase();
  const all=past();
  const list=all.filter(e=>e.date>=from&&(!q||e.t.toLowerCase().includes(q)))
    .sort((a,b)=>b.date.localeCompare(a.date)||SLOTS.indexOf(b.slot)-SLOTS.indexOf(a.slot));
  if(!all.length)return `<div class="empty">Noch nichts im Verlauf. Geplante Mahlzeiten erscheinen hier, sobald ihr Tag vorbei ist.</div>`;
  const cnt=new Map(); list.forEach(e=>cnt.set(e.t,(cnt.get(e.t)||0)+1));
  const top=[...cnt].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).filter(x=>x[1]>1).slice(0,5);
  let h=`<div class="card hh" style="display:block"><b>${list.length} Mahlzeiten</b> · ${cnt.size} verschiedene Gerichte
    ${top.length?`<div class="small muted" style="margin-top:4px">Am häufigsten: ${top.map(([t,n])=>`${esc(t)} (${n}×)`).join(', ')}</div>`:''}</div>`;
  const last=new Map(); all.forEach(e=>{if(e.rid&&(!last.get(e.rid)||e.date>last.get(e.rid)))last.set(e.rid,e.date)});
  const old=S.recipes.map(r=>({r,d:last.get(r.id)||''})).filter(x=>!x.d||x.d<iso(addDays(NOW,-60))).sort((a,b)=>a.d.localeCompare(b.d)).slice(0,3);
  if(!q&&old.length)h+=`<div class="card hh" style="display:block"><b>Länger nicht gekocht</b>${old.map(({r,d})=>`<div class="meal" style="margin-top:6px"><div class="mt"><button class="name" data-act="open" data-id="${r.id}">${esc(r.title)}</button>
    <span class="slot">${d?'zuletzt '+fmtDay(parseIso(d)):'noch nie geplant'}</span></div><button class="btn sm quiet" data-act="again" data-id="${r.id}">Einplanen</button></div>`).join('')}</div>`;
  if(!list.length)return h+`<div class="empty">Keine Treffer in diesem Zeitraum.</div>`;
  let month='';
  for(const e of list){
    const d=parseIso(e.date), m=d.toLocaleDateString('de-AT',{month:'long',year:'numeric'});
    if(m!==month){month=m;h+=`<div class="grp" style="margin:14px 0 6px"><h3>${esc(m)}</h3></div>`}
    const r=rec(e.rid);
    h+=`<div class="card hist-row"><div class="hd"><b>${fmtDay(d)}</b><span class="slot">${e.slot}</span></div>
      <div class="mt">${r?`<button class="name" data-act="open" data-id="${r.id}" data-p="${e.persons}">${esc(e.t)}</button>`:`<span class="name">${esc(e.t)}</span>`}<span class="small muted">${e.persons} Pers.</span></div>
      ${r?`<button class="btn sm quiet" data-act="again" data-id="${r.id}" data-p="${e.persons}">Nochmal</button>`:''}
      <button class="x" data-act="rmPlan" data-id="${e.id}" aria-label="Aus dem Verlauf entfernen">×</button></div>`;
  }
  return h;
}

/* ---------- Sheets ---------- */
function hydrate(root){
  root.querySelectorAll('img[data-ph]').forEach(async im=>{
    try{im.src=await Cloud.photoUrl(im.dataset.ph)}catch(e){im.alt='Foto nicht ladbar'}
  });
}
function sheet(inner,title){
  const s=$('#sheet'); s.innerHTML=`<div class="scrim" data-act="close"></div><div class="panel" role="dialog" aria-label="${esc(title)}"><div class="ph"><h2>${esc(title)}</h2><button class="close" data-act="close" aria-label="Schließen">×</button></div>${inner}</div>`;
  s.hidden=false; document.body.classList.add('lock'); hydrate(s);
}
function closeSheet(){$('#sheet').hidden=true;$('#sheet').innerHTML='';document.body.classList.remove('lock');D=null;C=null;PEND=[]}
function toast(t){const e=$('#toast');e.textContent=t;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>e.hidden=true,2600)}

function detailSheet(){
  const r=rec(D.rid); if(!r){closeSheet();return}
  const f=D.persons/r.servings, src=/^https?:\/\//.test(r.source)?`<a href="${esc(r.source)}" target="_blank" rel="noopener">${esc(r.source)}</a>`:esc(r.source||'Ohne Quelle');
  const body=`<div class="muted small">${src}</div><div class="tags">${r.tags.map(t=>`<span>${esc(t)}</span>`).join('')}</div>
  ${(r.photos||[]).length?`<div class="photos">${r.photos.map(p=>`<img data-ph="${esc(p.name)}" data-act="zoom" alt="Foto aus dem Kochbuch">`).join('')}</div>`:''}
  <div class="card hh" style="margin-top:12px"><div><b>Für wie viele?</b><div class="small muted">Original: ${r.servings} Portionen</div></div>
  <span class="pers"><button data-act="dp" data-d="-1" aria-label="Weniger">−</button><b>${D.persons}</b>Pers.<button data-act="dp" data-d="1" aria-label="Mehr">+</button></span></div>
  <h3 style="margin-top:14px">Zutaten</h3><ul class="ing">${r.ing.map(g=>{
    const [a,u]=norm(g.amount==null?null:g.amount*f,g.unit), p=findPantry(g.name);
    const pill=p?(p.level===2?'<span class="pill good">da</span>':p.level===1?'<span class="pill warm">wenig</span>':'<span class="pill bad">leer</span>'):'<span class="pill bad">fehlt</span>';
    return `<li><span class="a">${fmtAmt(a,u)}</span><span class="t">${esc(g.name)}</span>${pill}</li>`}).join('')}</ul>
  ${r.steps.length?`<h3 style="margin-top:16px">Zubereitung</h3><ol class="steps">${r.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`:''}
  <div class="acts"><button class="btn" data-act="planThis">Einplanen</button><button class="btn quiet" data-act="cooked">Gekocht</button><button class="btn ghost" data-act="editRecipe">Bearbeiten</button></div>`;
  sheet(body,r.title);
}
function planSheet(date,rid,persons){
  PS={rid:rid&&rec(rid)?rid:'',sort:'az',q:''};
  sheet(`<label class="f" for="prq" style="margin-top:0">Gericht</label>
  <input type="search" id="prq" placeholder="Gericht suchen" autocomplete="off" aria-label="Gericht suchen">
  <div id="prsort" class="seg2" style="margin:8px 0"></div>
  <div id="prlist" class="pick" role="listbox" aria-label="Gerichte"></div>
  <label class="f" for="pd">Tag (auch früher möglich, zum Nachtragen)</label><input type="date" id="pd" value="${esc(date)}">
  <label class="f" for="ps">Mahlzeit</label><select id="ps">${SLOTS.map(s=>`<option${s==='Abend'?' selected':''}>${s}</option>`).join('')}</select>
  <label class="f">Personen</label><span class="step"><button data-act="step" data-d="-1" aria-label="Weniger">−</button><output id="pp">${persons||S.household}</output><button data-act="step" data-d="1" aria-label="Mehr">+</button></span>
  <div class="hint">Mahlzeiten an vergangenen Tagen erscheinen im Verlauf.</div>
  <div class="acts"><button class="btn" data-act="savePlan">Hinzufügen</button></div>`,'Gericht planen oder nachtragen');
  paintPick(true);
}
let PS={rid:'',sort:'az',q:''};
function paintPick(scroll){
  const q=PS.q.trim().toLowerCase();
  let rs=S.recipes.filter(r=>!q||r.title.toLowerCase().includes(q)||r.tags.some(t=>t.toLowerCase().includes(q))||r.ing.some(g=>g.name.toLowerCase().includes(q)));
  const az=(a,b)=>a.title.localeCompare(b.title,'de');
  rs=PS.sort==='vorrat'?rs.map(r=>({r,c:covOf(r)})).sort((x,y)=>y.c.h/y.c.t-x.c.h/x.c.t||az(x.r,y.r)).map(x=>x.r):rs.sort(az);
  $('#prsort').innerHTML=[['az','A–Z'],['vorrat','Passt zum Vorrat']].map(([k,l])=>`<button class="${PS.sort===k?'on':''}" data-act="pickSort" data-id="${k}">${l}</button>`).join('');
  $('#prlist').innerHTML=rs.length?rs.map(r=>{const c=covOf(r);
    return `<button class="pick-row${r.id===PS.rid?' on':''}" role="option" aria-selected="${r.id===PS.rid}" data-act="pickR" data-id="${r.id}"><span class="pt">${esc(r.title)}</span>
    <span class="ps">${c.h}/${c.t} Zutaten im Vorrat${r.tags.length?' · '+esc(r.tags.slice(0,2).join(', ')):''}</span><span class="pc" aria-hidden="true">${r.id===PS.rid?'✓':''}</span></button>`}).join('')
    :'<div class="empty" style="padding:12px">Kein Gericht gefunden.</div>';
  if(scroll)$('#prlist .on')?.scrollIntoView({block:'nearest'});
}
function cookedSheet(){
  const r=rec(C.rid), items=[];
  r.ing.forEach(g=>{const p=findPantry(g.name); if(p&&!items.includes(p))items.push(p)});
  if(!items.length){toast('Keine Zutat des Rezepts steht im Vorrat.');return}
  sheet(`<p class="muted small" style="margin-top:0">Was ist nach dem Kochen weniger geworden? Nur anpassen, was sich geändert hat.</p><div class="card">${items.map(p=>{const v=C.ch[p.id]??p.level;
    return `<div class="prow"><span class="n">${esc(p.name)}</span><span class="seg">${[0,1,2].map(x=>`<button class="l${x}${v===x?' on':''}" data-act="cl" data-id="${p.id}" data-d="${x}">${LEVELS[x]}</button>`).join('')}</span></div>`}).join('')}</div>
  <div class="acts"><button class="btn" data-act="applyCooked">Übernehmen</button></div>`,'Vorrat anpassen');
}
function recipeForm(d,id){
  sheet(`<label class="f" for="rt">Name</label><input type="text" id="rt" value="${esc(d.title)}">
  <label class="f" for="rs">Quelle (Kochbuch und Seite oder Link)</label><input type="text" id="rs" value="${esc(d.source)}" placeholder="z. B. Omas Kochbuch, S. 84">
  <label class="f" for="rv">Portionen im Rezept</label><input type="number" id="rv" min="1" max="30" value="${d.servings}">
  <label class="f" for="rg">Tags (mit Komma trennen)</label><input type="text" id="rg" value="${esc(d.tags)}" placeholder="Nudeln, Kinder, schnell">
  <label class="f" for="ri">Zutaten (eine pro Zeile, z. B. „500 g Mehl")</label><textarea id="ri" style="min-height:170px">${esc(d.ing)}</textarea>
  <label class="f" for="rz">Zubereitung (ein Schritt pro Zeile)</label><textarea id="rz">${esc(d.steps)}</textarea>
  <label class="f" for="newph">Fotos der Kochbuchseite (optional)</label>
  <div class="photos" id="exph">${(d.photos||[]).map(p=>`<span class="ph1" data-name="${esc(p.name)}"><img data-ph="${esc(p.name)}" alt="Foto aus dem Kochbuch"><button class="x" data-act="rmPhoto" aria-label="Foto entfernen">×</button></span>`).join('')}</div>
  ${PEND.length?`<label class="chk"><input type="checkbox" id="keepph" checked> ${PEND.length>1?PEND.length+' eingelesene Fotos':'Eingelesenes Foto'} beim Rezept speichern</label>`:''}
  <input type="file" id="newph" accept="image/*" multiple>
  <div class="acts"><button class="btn" data-act="saveRecipe" data-id="${id||''}">Speichern</button>${id?`<button class="btn danger" data-act="delRecipe" data-id="${id}">Löschen</button>`:''}</div>`,id?'Rezept bearbeiten':'Neues Rezept');
}
async function shrink(f){
  try{const bm=await createImageBitmap(f),sc=Math.min(1,1600/Math.max(bm.width,bm.height)),c=document.createElement('canvas');
    c.width=Math.round(bm.width*sc);c.height=Math.round(bm.height*sc);c.getContext('2d').drawImage(bm,0,0,c.width,c.height);
    return await new Promise(r=>c.toBlob(r,'image/jpeg',.85))}catch(e){return f}
}
async function storeRecipe(r,picked,btn){
  btn.disabled=true; btn.textContent='Speichert …';
  for(const f of picked){
    const name='foto-'+uid()+'.jpg';
    try{await Cloud.putFile(name,await shrink(f));r.photos.push({name})}catch(e){toast('Ein Foto konnte nicht hochgeladen werden.')}
  }
  const old=rec(r.id);
  for(const p of old?.photos||[])if(!r.photos.some(q=>q.name===p.name))Cloud.delFile(p.name);
  const i=S.recipes.findIndex(x=>x.id===r.id); if(i>=0)S.recipes[i]=r; else S.recipes.push(r);
  closeSheet();UI.tab='rec';commit();toast('Rezept gespeichert.');
}

/* ---------- Einstellungen, Familie, Import und Export ---------- */
function settingsSheet(link){
  const a=Cloud.account(), own=Cloud.loc()?.own;
  sheet(`<p class="muted small" style="margin-top:0">Angemeldet als <b>${esc(a?.name||a?.username||'')}</b><br>${esc(a?.username||'')}</p>
  <h3>Familie einladen</h3>
  <p class="small muted">Erzeugt einen Link zum Ordner „Familienkueche" in deinem OneDrive. Wer den Link hat, kann Rezepte, Vorrat und Fotos lesen und ändern. Gib ihn nur in der Familie weiter. Du kannst ihn jederzeit in OneDrive unter „Teilen verwalten" widerrufen.</p>
  ${link?`<div class="linkbox"><input type="text" id="lnk" readonly value="${esc(link)}"><button class="btn sm" data-act="copyLink">Kopieren</button></div>`
        :`<div class="acts" style="margin-top:8px"><button class="btn quiet" data-act="makeLink">${own?'Link erzeugen':'Link aus dem Ordner erzeugen'}</button></div>`}
  <h3 style="margin-top:20px">Rezepte übernehmen</h3>
  <p class="small muted">Aus dem Prototyp: dort unter „Rezepte" auf „Export" tippen, Text kopieren und hier einfügen.</p>
  <div class="acts"><button class="btn quiet" data-act="importSheet">Rezepte einfügen</button><button class="btn quiet" data-act="exportSheet">Alles exportieren</button></div>
  <h3 style="margin-top:20px">Claude-Zugang</h3>
  <p class="small muted">Für Foto-Auslesen, Rezeptsuche im Netz und Vorschläge. Der Schlüssel bleibt nur auf diesem Gerät.</p>
  ${AI.has()?`<p class="small">Schlüssel gespeichert (endet auf …${esc(AI.get().slice(-4))}).</p><div class="acts"><button class="btn quiet sm" data-act="testKey">Testen</button><button class="btn danger sm" data-act="delKey">Entfernen</button></div>`
    :`<input type="password" id="akey" placeholder="sk-ant-…" autocomplete="off" aria-label="Claude-Schlüssel"><div class="acts"><button class="btn quiet sm" data-act="saveKey">Speichern</button><button class="btn ghost sm" data-act="keyHelp">Wo bekomme ich den?</button></div>`}
  <div class="acts" style="margin-top:24px"><button class="btn danger" data-act="logout">Abmelden</button><button class="btn ghost" data-act="syncNow">Jetzt abgleichen</button><button class="btn ghost" data-act="diag">Verbindung prüfen</button><button class="btn ghost" data-act="update">App aktualisieren</button></div>
  <p class="small muted">Version ${APP_VERSION}</p>`,'Einstellungen');
}
function importSheet(){
  sheet(`<p class="small muted" style="margin-top:0">Füge hier den Export-Text ein. Rezepte mit gleichem Namen werden übersprungen. Fotos aus dem Prototyp werden nicht mitgenommen.</p>
  <textarea id="imp" style="min-height:200px" placeholder="{ &quot;fk&quot;: 1, … }"></textarea>
  <div class="acts"><button class="btn" data-act="doImport">Übernehmen</button></div>`,'Rezepte einfügen');
}
function exportSheet(){
  const txt=JSON.stringify({fk:1,recipes:S.recipes,pantry:S.pantry},null,1);
  sheet(`<p class="small muted" style="margin-top:0">Eine Kopie aller Rezepte und des Vorrats (ohne Fotos). Zum Sichern in eine Notiz oder Datei einfügen.</p>
  <textarea id="exp" readonly style="min-height:220px">${esc(txt)}</textarea>
  <div class="acts"><button class="btn" data-act="copyExp">Kopieren</button></div>`,'Export');
}
function copyText(el,msg){
  el.select?.();
  (navigator.clipboard?.writeText(el.value)||Promise.reject()).then(()=>toast(msg),()=>{try{document.execCommand('copy');toast(msg)}catch(e){toast('Bitte von Hand kopieren.')}});
}
function doImport(){
  let d; try{d=JSON.parse($('#imp').value.trim())}catch(e){toast('Das ist kein gültiger Export-Text.');return}
  if(!d||!Array.isArray(d.recipes)){toast('Im Text fehlen die Rezepte.');return}
  const have=new Set(S.recipes.map(r=>r.title.toLowerCase())); let n=0;
  for(const r of d.recipes){
    if(!r||!r.title||!Array.isArray(r.ing)||have.has(String(r.title).toLowerCase()))continue;
    S.recipes.push({id:uid(),title:String(r.title),source:String(r.source||''),servings:Math.max(1,+r.servings||4),tags:(r.tags||[]).map(String),
      ing:r.ing.map(g=>({name:String(g.name),amount:g.amount==null?null:+g.amount,unit:String(g.unit||'')})),steps:(r.steps||[]).map(String),photos:[]});
    have.add(String(r.title).toLowerCase()); n++;
  }
  let p=0;
  for(const x of d.pantry||[])if(x&&x.name&&!findPantry(x.name)){S.pantry.push({id:uid(),name:String(x.name),loc:LOCS.includes(x.loc)?x.loc:'Sonstiges',level:[0,1,2].includes(x.level)?x.level:2});p++}
  closeSheet();UI.tab='rec';commit();toast(n+' Rezepte, '+p+' Vorratsartikel übernommen.');
}

/* ---------- Vorschlag aus dem Vorrat und Einkaufsliste senden ---------- */
const ASSUMED=/^(salz|pfeffer|wasser)\b/i; // gilt immer als vorhanden
const COOK={max:2};
function pantryScore(r){
  const miss=[],low=[];
  for(const g of r.ing){
    if(ASSUMED.test(g.name.trim()))continue;
    const p=findPantry(g.name);
    if(!p||p.level===0)miss.push(g.name); else if(p.level===1)low.push(g.name);
  }
  return {miss,low};
}
function cookSheet(){
  if(!S.recipes.length){toast('Lege zuerst ein Rezept an.');return}
  sheet(`<p class="muted small" style="margin-top:0">Gerichte aus eurer Sammlung, die zu eurem Vorrat passen. Salz, Pfeffer und Wasser zählen als vorhanden.</p>
  <div id="cookfilter" class="seg2" style="margin:0 0 10px"></div><div id="cooklist"></div>
  <div class="acts"><button class="btn ghost" data-act="cookNet">Neue Ideen aus dem Netz</button></div>`,'Aus dem Vorrat kochen');
  paintCook();
}
function paintCook(){
  $('#cookfilter').innerHTML=[[0,'Alles da'],[2,'Bis 2 fehlen'],[99,'Alle']].map(([n,l])=>`<button class="${COOK.max===n?'on':''}" data-act="cookMax" data-d="${n}">${l}</button>`).join('');
  const sc=S.recipes.map(r=>({r,...pantryScore(r)})).filter(x=>x.miss.length<=COOK.max)
    .sort((a,b)=>a.miss.length-b.miss.length||a.low.length-b.low.length||a.r.title.localeCompare(b.r.title,'de')).slice(0,10);
  $('#cooklist').innerHTML=sc.length?sc.map(({r,miss,low})=>{
    const st=!miss.length&&!low.length?'<span class="pill good">Alles da</span>':
      (miss.length?`<span class="pill bad">Es fehlen: ${esc(miss.slice(0,4).join(', '))}${miss.length>4?' …':''}</span>`:'')+(low.length?` <span class="pill warm">Knapp: ${esc(low.slice(0,3).join(', '))}</span>`:'');
    return `<div class="card rcard" style="cursor:default"><h3>${esc(r.title)}</h3><div class="meta" style="margin:4px 0">${st}</div>
      <div class="acts" style="margin-top:8px"><button class="btn sm" data-act="planOwn" data-id="${r.id}">Einplanen</button><button class="btn sm quiet" data-act="open" data-id="${r.id}">Ansehen</button></div></div>`}).join('')
    :`<div class="empty">${S.pantry.length?'Kein Gericht passt so genau. Probiere „Bis 2 fehlen" oder „Alle".':'Der Vorrat ist noch leer. Trage ihn unter „Vorrat" ein, dann kann ich passende Gerichte finden.'}</div>`;
}
function shopText(){
  const open=shopLines().need.filter(l=>!S.checked[l.key]);
  if(!open.length)return '';
  const by={}; open.forEach(l=>(by[l.cat]||(by[l.cat]=[])).push(l));
  let t=`Einkaufsliste ${fmtDay(NOW)} – ${fmtDay(addDays(NOW,UI.horizon-1))}\n`;
  for(const c of CATS){
    if(!by[c])continue;
    t+=`\n${c}\n`+by[c].sort((x,y)=>x.name.localeCompare(y.name,'de')).map(l=>`• ${[fmtAmt(l.amount,l.unit),l.name].filter(Boolean).join(' ')}`).join('\n')+'\n';
  }
  return t.trim();
}
function setShareLinks(){
  const t=encodeURIComponent($('#stxt').value);
  $('#sh-wa').href='https://wa.me/?text='+t;
  $('#sh-mail').href='mailto:?subject='+encodeURIComponent('Einkaufsliste')+'&body='+t;
  $('#sh-sms').href='sms:?&body='+t;
}
function shareSheet(){
  const t=shopText(); if(!t){toast('Es gibt nichts zu senden.');return}
  sheet(`<p class="muted small" style="margin-top:0">Nur Artikel, die noch nicht abgehakt sind. Du kannst den Text vor dem Senden ändern.</p>
  <textarea id="stxt" style="min-height:230px">${esc(t)}</textarea>
  <div class="share-btns">${navigator.share?'<button class="btn" data-act="nativeShare">Teilen …</button>':''}
  <a class="btn" id="sh-wa" target="_blank" rel="noopener">WhatsApp</a><a class="btn quiet" id="sh-mail">E-Mail</a><a class="btn quiet" id="sh-sms">SMS</a>
  <button class="btn ghost" data-act="copyList">Kopieren</button></div>`,'Einkaufsliste senden');
  setShareLinks();
}

/* ---------- Claude: Foto auslesen, Rezepte im Netz suchen, Vorschläge ---------- */
const prefill=r=>({title:r.title||'',source:r.source||'',servings:Math.max(1,+r.servings||4),tags:(r.tags||[]).join(', '),ing:(r.ingredients||[]).join('\n'),steps:(r.steps||[]).join('\n'),photos:[]});
function aiError(e){
  if(e.code==='no-key')return 'Es ist kein Claude-Schlüssel hinterlegt.';
  if(e.offline)return 'Keine Verbindung zu Claude.';
  if(e.status===401)return 'Der Claude-Schlüssel wurde abgelehnt. Bitte unter ⋮ prüfen.';
  if(e.status===429)return 'Gerade zu viele Anfragen. Bitte kurz warten.';
  if(e.status===402||/credit|balance/i.test(e.message||''))return 'Das Guthaben im Anthropic-Konto ist aufgebraucht.';
  return e.message||'Das hat nicht geklappt.';
}
function keySheet(next){
  AFTER=next;
  sheet(`<p style="margin-top:0">Dafür braucht die App einen Zugang zu Claude. Er läuft über dein Konto bei Anthropic und wird nach Verbrauch abgerechnet, in der Regel wenige Cent pro Anfrage.</p>
  <ol class="steps small"><li>Öffne <a href="https://console.anthropic.com/" target="_blank" rel="noopener">console.anthropic.com</a> und melde dich an.</li>
  <li>Lade unter „Billing" etwas Guthaben auf und stelle ein Monatslimit ein.</li>
  <li>Erzeuge unter „API keys" einen Schlüssel und kopiere ihn.</li></ol>
  <label class="f" for="akey">Schlüssel</label><input type="password" id="akey" placeholder="sk-ant-…" autocomplete="off">
  <p class="small muted">Der Schlüssel wird nur in diesem Browser gespeichert. Auf jedem Gerät der Familie ist er einmal einzugeben.</p>
  <div class="acts"><button class="btn" data-act="saveKey">Speichern und weiter</button></div>`,'Claude-Zugang einrichten');
}
function addSheet(){
  sheet(`<div class="choice"><button class="btn" data-act="aiPhoto">Foto aus dem Kochbuch auslesen</button>
  <button class="btn quiet" data-act="aiSearch">Im Netz nach Rezepten suchen</button>
  <button class="btn ghost" data-act="manual">Von Hand eingeben</button></div>`,'Rezept hinzufügen');
}
function photoSheet(){
  if(!AI.has())return keySheet('aiPhoto');
  sheet(`<p class="muted small" style="margin-top:0">Fotografiere die Rezeptseite. Geht das Rezept über zwei Seiten, wähle bis zu 4 Fotos.</p>
  <input type="file" id="files" accept="image/*" multiple aria-label="Fotos wählen"><div class="acts"><button class="btn" id="go" data-act="doPhoto">Rezept auslesen</button></div>`,'Foto auslesen');
}
function searchSheet(){
  if(!AI.has())return keySheet('aiSearch');
  sheet(`<label class="f" for="sq" style="margin-top:0">Was möchtet ihr essen?</label><input type="text" id="sq" placeholder="z. B. italienisches Nudelgericht mit Ravioli">
  <label class="chk"><input type="checkbox" id="spant" checked> Zutaten aus dem Vorrat bevorzugen</label>
  <div class="acts"><button class="btn" id="go" data-act="doSearch">Suchen</button></div><div id="sres"></div>`,'Rezepte im Netz suchen');
}
async function doPhoto(){
  const fs=[...$('#files').files].slice(0,4); if(!fs.length){toast('Bitte zuerst ein Foto wählen.');return}
  const btn=$('#go'); btn.disabled=true; btn.textContent='Liest …';
  try{
    const bl=await Promise.all(fs.map(shrink));
    const r=await AI.readRecipe(bl);
    if(!r.title&&!(r.ingredients||[]).length){toast('Auf den Fotos wurde kein Rezept erkannt.');btn.disabled=false;btn.textContent='Rezept auslesen';return}
    PEND=bl; recipeForm(prefill(r)); toast('Bitte kurz prüfen, dann speichern.');
  }catch(e){btn.disabled=false;btn.textContent='Rezept auslesen';toast(aiError(e))}
}
async function doSearch(){
  const q=$('#sq').value.trim(); if(q.length<3){toast('Bitte eingeben, worauf ihr Lust habt.');return}
  const btn=$('#go'); btn.disabled=true; btn.textContent='Sucht …'; $('#sres').innerHTML='<p class="muted small">Das dauert etwa eine halbe Minute.</p>';
  const pantry=$('#spant').checked?S.pantry.filter(p=>p.level===2).map(p=>p.name).slice(0,40):[];
  try{
    FOUND=await AI.searchRecipes({query:q,persons:S.household,pantry});
    $('#sres').innerHTML=FOUND.length?`<p class="muted small">Tippe auf ein Rezept, um es zu prüfen und zu speichern. Die Texte sind zusammengefasst, die Quelle steht dabei.</p>`+FOUND.map((r,i)=>`<button class="card rcard" data-act="useRes" data-id="${i}"><h3>${esc(r.title)}</h3><div class="meta">${esc(r.summary||'')}</div>
      <div class="meta">${r.servings||'?'} Portionen · ${r.ingredients.length} Zutaten · ${esc(hostOf(r.source))}</div><div class="tags">${(r.tags||[]).map(t=>`<span>${esc(t)}</span>`).join('')}</div></button>`).join('')
      :'<p class="muted">Dazu wurde nichts Brauchbares gefunden. Versuche eine andere Beschreibung.</p>';
  }catch(e){$('#sres').innerHTML='';toast(aiError(e))}
  btn.disabled=false;btn.textContent='Erneut suchen';
}
const hostOf=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch(e){return ''}};
async function balanceSheet(){
  if(!AI.has())return keySheet('balance');
  const from=iso(addDays(NOW,-10)),to=iso(addDays(NOW,7));
  const meals=S.plan.filter(e=>e.date>=from&&e.date<=to).sort((a,b)=>a.date.localeCompare(b.date)).map(e=>{const r=rec(e.rid);return r?`${e.date} ${e.slot}: ${r.title} (${r.ing.map(g=>g.name).join(', ')})`:null}).filter(Boolean);
  if(meals.length<3){toast('Plane zuerst ein paar Mahlzeiten, dann gibt es etwas zu beurteilen.');return}
  sheet('<p class="muted">Claude sieht sich euren Plan an …</p>','Ausgewogen essen?');
  try{
    const own=S.recipes.map(r=>`${r.id} | ${r.title} | ${r.tags.join(', ')} | ${r.ing.map(g=>g.name).slice(0,12).join(', ')}`);
    const res=await AI.balance({persons:S.household,meals,own});
    FOUND=res.suggestions.filter(s=>s.kind==='new'||rec(s.recipe_id));
    sheet(`<p style="margin-top:0">${esc(res.assessment)}</p><p class="small muted">Das ist eine grobe Orientierung und keine Ernährungsberatung.</p>
    <h3>Vorschläge</h3>${FOUND.map((s,i)=>{const own=s.kind==='own';const t=own?rec(s.recipe_id).title:s.title;
      return `<div class="card rcard" style="cursor:default"><h3>${esc(t)}</h3><div class="meta">${esc(s.why)}</div><div class="meta">${own?'Aus eurer Sammlung':'Neues Rezept'}</div>
      <div class="acts" style="margin-top:8px">${own?`<button class="btn sm" data-act="planOwn" data-id="${s.recipe_id}">Einplanen</button>`:`<button class="btn sm" data-act="useSugg" data-id="${i}">Rezept ansehen</button>`}</div></div>`}).join('')}`,'Ausgewogen essen?');
  }catch(e){closeSheet();toast(aiError(e))}
}

/* ---------- Anmeldung und Start ---------- */
function gate(html){
  $('#tabnav').hidden=true; $('#gear').hidden=true; setSync('',false);
  $('#app').innerHTML=`<div class="gate">${html}</div>`;
}
const gateErr=m=>`<div class="err" role="alert">${esc(m)}</div>`;
function loginGate(err){
  gate(`<div class="card"><h2>Willkommen</h2><p class="muted">Melde dich mit deinem privaten Microsoft-Konto an. Rezepte, Vorrat und Fotos liegen danach im OneDrive der Familie.</p>
  <button class="btn" data-act="login">Mit Microsoft anmelden</button>${err?gateErr(err):''}</div>
  <div class="acts"><button class="btn quiet sm" data-act="reset">Klappt nicht? Anmeldung zurücksetzen</button></div>
  <p class="small muted" style="overflow-wrap:anywhere">Rücksprung-Adresse dieser App (muss in Azure genau so stehen):<br><code class="k">${esc(Cloud.redirectUri)}</code></p>`);
}
function setupGate(err){
  const a=Cloud.account();
  gate(`<p class="small muted">Angemeldet als ${esc(a?.username||'')}</p>
  <div class="card"><h2>Ich lege die Familienküche an</h2><p class="muted">Erstellt den Ordner „Familienkueche" in deinem OneDrive. Das macht nur die erste Person.</p>
  <button class="btn" data-act="createNew" id="gcreate">Ordner anlegen</button></div>
  <div class="card"><h2>Ich habe einen Link</h2><p class="muted">Füge den Familien-Link ein, den du bekommen hast.</p>
  <input type="text" id="glink" placeholder="https://1drv.ms/…" aria-label="Familien-Link"><div class="acts"><button class="btn" data-act="joinLink" id="gjoin">Beitreten</button></div></div>
  <div class="acts"><button class="btn danger" data-act="logout">Anderes Konto verwenden</button></div>${err?gateErr(err):''}`);
}
function errText(e){
  if(e.offline)return 'Keine Verbindung. Bitte später erneut versuchen.';
  if(e.message==='not-folder')return 'Der Link zeigt auf eine Datei. Er muss auf den Ordner „Familienkueche" zeigen.';
  if(e.status===401||e.status===403)return 'Zugriff verweigert. Prüfe, ob du mit dem richtigen Konto angemeldet bist und der Link Bearbeiten erlaubt.';
  if(e.status===404)return 'Der Link wurde nicht gefunden. Prüfe, ob er vollständig kopiert wurde.';
  return 'Das hat nicht geklappt: '+(e.detail||e.message);
}
function run(){
  $('#tabnav').hidden=false; $('#gear').hidden=false;
  cacheLoad(); render(); setSync('Verbindet …',false); startSync();
}
async function start(){
  $('#today').textContent=fmtDay(NOW);
  if(!/[#&]code=/.test(location.hash)){ // liegengebliebener Anmeldevorgang von einem Abbruch
    for(const st of [localStorage,sessionStorage]){try{Object.keys(st).filter(k=>/interaction\.status/.test(k)).forEach(k=>st.removeItem(k))}catch(e){}}
  }
  try{await Cloud.init()}catch(e){loginGate('Die Anmeldung konnte nicht gestartet werden: '+(e.message||e.errorCode||e));return}
  if(!Cloud.account())return loginGate();
  if(!Cloud.loc())return setupGate();
  run();
}

/* ---------- Ereignisse ---------- */
document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-act]'); if(!t)return;
  const a=t.dataset.act,id=t.dataset.id,d=+t.dataset.d;
  switch(a){
    case 'login':t.disabled=true;Cloud.login().catch(x=>{t.disabled=false;loginGate(x.message||String(x))});break;
    case 'logout':Cloud.logout();break;
    case 'update':{try{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k)}catch(x){}
      location.replace(location.pathname+'?neu='+Date.now());break}
    case 'reset':{try{localStorage.clear();sessionStorage.clear()}catch(x){}
      try{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k)}catch(x){}
      location.replace(location.pathname);break}
    case 'createNew':{t.disabled=true;t.textContent='Legt an …';
      try{await Cloud.createFolder();S=emptyState();Sync.base=null;Sync.etag=null;cacheSave();run()}catch(x){setupGate(errText(x))}break}
    case 'joinLink':{const u=$('#glink').value.trim();if(!u){toast('Bitte den Link einfügen.');break}
      t.disabled=true;t.textContent='Verbindet …';
      try{await Cloud.join(u);S=emptyState();Sync.base=null;Sync.etag=null;cacheSave();run()}catch(x){setupGate(errText(x))}break}
    case 'settings':settingsSheet();break;
    case 'diag':{t.disabled=true;t.textContent='Prüft …';let r;try{r=await Cloud.diagnose()}catch(x){r='FEHLER '+(x.detail||x.message)}
      sheet(`<p class="small muted" style="margin-top:0">Ergebnis des Verbindungstests (Version ${APP_VERSION}). Mach bitte einen Screenshot davon.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8rem;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px">${esc(r)}</pre>`,'Verbindungstest');break}
    case 'makeLink':try{t.disabled=true;settingsSheet(await Cloud.createLink())}catch(x){toast(errText(x));t.disabled=false}break;
    case 'copyLink':copyText($('#lnk'),'Link kopiert.');break;
    case 'syncNow':closeSheet();setSync('Gleicht ab …',false);queue(()=>isDirty()?doPush().then(doPull):doPull());break;
    case 'importSheet':importSheet();break;
    case 'doImport':doImport();break;
    case 'exportSheet':exportSheet();break;
    case 'copyExp':copyText($('#exp'),'Export kopiert.');break;
    case 'tab':UI.tab=id;closeSheet();render();window.scrollTo(0,0);break;
    case 'close':closeSheet();break;
    case 'week':UI.week+=d;render();break;
    case 'hrange':UI.hrange=d;render();break;
    case 'members':membersSheet();break;
    case 'iam':setMe(id);membersSheet();render();break;
    case 'memDel':S.members=S.members.filter(m=>m.id!==id);commit();membersSheet();break;
    case 'memSelf':{const n=Cloud.account()?.name;if(n){const m={id:uid(),name:n};S.members.push(m);if(!getMe())setMe(m.id);commit();membersSheet()}break}
    case 'att':attSheet(id);break;
    case 'meSet':{const me=getMe();if(!me)break;const cur=S.att[akey(id)]?.m?.[me]||'';setAtt(id,me,cur===t.dataset.v?'':t.dataset.v);commit();break}
    case 'attSet':setAtt(AT,id,t.dataset.v);commit();attSheet(AT);break;
    case 'attG':{const k=akey(AT),x=S.att[k]||(S.att[k]={m:{},g:0});x.g=Math.max(0,Math.min(20,(x.g||0)+d));if(!Object.keys(x.m).length&&!x.g)delete S.att[k];commit();attSheet(AT);break}
    case 'openIn':S.openIn=!(S.openIn!==false);commit();attSheet(AT);break;
    case 'attAuto':S.plan.forEach(e=>{if(e.date===AT&&e.slot==='Abend')delete e.manual});commit();attSheet(AT);break;
    case 'fromPantry':cookSheet();break;
    case 'cookMax':COOK.max=d;paintCook();break;
    case 'cookNet':searchSheet();if($('#sq'))$('#sq').value='ein alltagstaugliches Gericht, das gut zu meinem Vorrat passt';break;
    case 'shareList':shareSheet();break;
    case 'copyList':copyText($('#stxt'),'Liste kopiert.');break;
    case 'nativeShare':navigator.share({title:'Einkaufsliste',text:$('#stxt').value}).catch(()=>{});break;
    case 'backfill':if(!S.recipes.length){toast('Lege zuerst ein Rezept an.');break}planSheet(iso(addDays(NOW,-1)),null);break;
    case 'again':planSheet(TODAY,id,+t.dataset.p||S.household);break;
    case 'pers':
      if(id==='household'){S.household=Math.min(20,Math.max(1,S.household+d))}
      else{const p=S.plan.find(x=>x.id===id);if(p){p.persons=Math.min(30,Math.max(1,pers(p)+d));p.manual=true}}
      commit();break;
    case 'rmPlan':S.plan=S.plan.filter(x=>x.id!==id);commit();break;
    case 'addPlan':if(!S.recipes.length){toast('Lege zuerst ein Rezept an.');UI.tab='rec';render();break}planSheet(id,null);break;
    case 'open':D={rid:id,persons:+t.dataset.p||S.household};detailSheet();break;
    case 'dp':D.persons=Math.min(30,Math.max(1,D.persons+d));detailSheet();break;
    case 'zoom':t.classList.toggle('big');break;
    case 'planThis':{const r=D.rid,p=D.persons;planSheet(TODAY,r,p);D=null;break}
    case 'step':{const o=$('#pp');o.textContent=Math.min(30,Math.max(1,(+o.textContent)+d));break}
    case 'pickR':PS.rid=id;paintPick();break;
    case 'pickSort':PS.sort=id;paintPick();break;
    case 'savePlan':{
      if(!PS.rid||!rec(PS.rid)){toast('Bitte ein Gericht wählen.');break}
      if(!/^\d{4}-\d{2}-\d{2}$/.test($('#pd').value)){toast('Bitte einen Tag wählen.');break}
      S.plan.push({id:uid(),date:$('#pd').value,slot:$('#ps').value,rid:PS.rid,title:rec(PS.rid)?.title||'',persons:+$('#pp').textContent,manual:+$('#pp').textContent!==S.household});
      const nd=S.plan[S.plan.length-1].date;
      closeSheet();
      if(nd<TODAY)toast('Im Verlauf nachgetragen.');
      else{UI.tab='plan';UI.week=Math.floor((parseIso(nd)-addDays(NOW,-((NOW.getDay()+6)%7)))/(7*864e5));toast('Eingeplant.')}
      commit();break}
    case 'cooked':C={rid:D.rid,ch:{}};cookedSheet();break;
    case 'cl':C.ch[id]=d;cookedSheet();break;
    case 'applyCooked':{for(const [pid,v] of Object.entries(C.ch)){const p=S.pantry.find(x=>x.id===pid);if(p)p.level=v}closeSheet();commit();toast('Vorrat angepasst.');break}
    case 'tag':UI.tag=UI.tag===id?'':id;render();break;
    case 'newRecipe':addSheet();break;
    case 'manual':PEND=[];recipeForm({title:'',source:'',servings:S.household,tags:'',ing:'',steps:'',photos:[]});break;
    case 'aiPhoto':photoSheet();break;
    case 'aiSearch':searchSheet();break;
    case 'doPhoto':doPhoto();break;
    case 'doSearch':doSearch();break;
    case 'useRes':{PEND=[];recipeForm(prefill(FOUND[+id]));toast('Bitte prüfen, dann speichern.');break}
    case 'balance':balanceSheet();break;
    case 'planOwn':planSheet(TODAY,id);break;
    case 'useSugg':{PEND=[];recipeForm(prefill(FOUND[+id]));toast('Bitte prüfen, dann speichern.');break}
    case 'keyHelp':keySheet(null);break;
    case 'saveKey':{const v=($('#akey')?.value||'').trim();
      if(!/^sk-ant-/.test(v)){toast('Das sieht nicht nach einem Schlüssel aus. Er beginnt mit sk-ant-.');break}
      AI.set(v);toast('Schlüssel gespeichert.');const n=AFTER;AFTER=null;closeSheet();
      if(n==='aiPhoto')photoSheet();else if(n==='aiSearch')searchSheet();else if(n==='balance')balanceSheet();else settingsSheet();break}
    case 'delKey':AI.set('');toast('Schlüssel entfernt.');settingsSheet();break;
    case 'testKey':{t.disabled=true;t.textContent='Testet …';try{await AI.test();toast('Der Zugang funktioniert.')}catch(x){toast(aiError(x))}t.disabled=false;t.textContent='Testen';break}
    case 'editRecipe':{const r=rec(D.rid);closeSheet();recipeForm({title:r.title,source:r.source,servings:r.servings,tags:r.tags.join(', '),ing:r.ing.map(lineStr).join('\n'),steps:r.steps.join('\n'),photos:r.photos||[]},r.id);break}
    case 'rmPhoto':t.closest('.ph1').remove();break;
    case 'saveRecipe':{
      const title=$('#rt').value.trim(); if(!title){toast('Bitte einen Namen eingeben.');break}
      const ing=$('#ri').value.split('\n').map(parseLine).filter(Boolean); if(!ing.length){toast('Bitte mindestens eine Zutat eingeben.');break}
      const r={id:id||uid(),title,source:$('#rs').value.trim(),servings:Math.max(1,+$('#rv').value||4),tags:$('#rg').value.split(',').map(s=>s.trim()).filter(Boolean),ing,
        steps:$('#rz').value.split('\n').map(s=>s.trim()).filter(Boolean),photos:[...document.querySelectorAll('#exph .ph1')].map(el=>({name:el.dataset.name}))};
      storeRecipe(r,[...$('#newph').files,...($('#keepph')?.checked?PEND:[])],t);break}
    case 'delRecipe':(rec(id)?.photos||[]).forEach(p=>Cloud.delFile(p.name));{const t=rec(id)?.title;S.recipes=S.recipes.filter(x=>x.id!==id);S.plan=S.plan.filter(x=>x.rid!==id||x.date<TODAY);S.plan.forEach(x=>{if(x.rid===id){x.title=x.title||t;x.rid=''}})}closeSheet();commit();toast('Rezept gelöscht. Frühere Mahlzeiten bleiben im Verlauf.');break;
    case 'lvl':{const p=S.pantry.find(x=>x.id===id);if(p){p.level=d;commit()}break}
    case 'rmPantry':S.pantry=S.pantry.filter(x=>x.id!==id);commit();break;
    case 'hor':UI.horizon=d;render();break;
    case 'chk':if(S.checked[id])delete S.checked[id];else S.checked[id]=true;commit();break;
    case 'finish':{
      const {need}=shopLines(),done=need.filter(l=>S.checked[l.key]);
      for(const l of done){
        if(l.extra){S.extras=S.extras.filter(x=>x.id!==l.id)}
        const p=findPantry(l.name);
        if(p)p.level=2; else S.pantry.push({id:uid(),name:l.name,level:2,loc:/Milch|Fleisch|Obst/.test(l.cat)?'Kühlschrank':l.cat==='Haushalt'||l.cat==='Sonstiges'?'Sonstiges':'Vorratskammer'});
      }
      S.checked={};commit();toast(done.length+' Artikel im Vorrat.');break}
  }
});
document.addEventListener('input',e=>{if(e.target.id==='q'){UI.q=e.target.value;$('#rlist').innerHTML=recList()}if(e.target.id==='hq'){UI.hq=e.target.value;$('#hlist').innerHTML=histList()}if(e.target.id==='prq'){PS.q=e.target.value;paintPick()}if(e.target.id==='stxt')setShareLinks()});
document.addEventListener('submit',e=>{
  const f=e.target.dataset.form; if(!f)return; e.preventDefault();
  if(f==='addPantry'){const n=$('#pn').value.trim();if(!n)return;S.pantry.push({id:uid(),name:n,loc:$('#pl').value,level:2});commit();$('#pn').focus()}
  if(f==='addMember'){const n=$('#mn').value.trim();if(!n)return;const m={id:uid(),name:n};S.members.push(m);if(!getMe()&&S.members.length===1)setMe(m.id);commit();membersSheet();$('#mn').focus()}
  if(f==='addExtra'){const g=parseLine($('#xn').value);if(!g)return;S.extras.push({id:uid(),name:g.name,amount:g.amount,unit:g.unit,cat:guess(g.name)});commit();$('#xn').focus()}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#sheet').hidden)closeSheet();if(e.key==='Enter'&&e.target.id==='sq')doSearch()});
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
start();
