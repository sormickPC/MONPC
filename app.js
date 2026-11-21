'use strict';
/* Virtual Desktop — client. Règle d'or : aucune donnée utilisateur/distante n'entre dans le DOM via innerHTML
   (sauf HTML passé par clean(), liste blanche). Mots de passe et jeton : jamais dans localStorage. */
const $=(s,r=document)=>r.querySelector(s);
const el=(t,p={},...c)=>{const e=document.createElement(t);for(const[k,v]of Object.entries(p))k==='style'?e.style.cssText=v:k in e?e[k]=v:e.setAttribute(k,v);e.append(...c);return e};
const opts=(sel,items)=>sel.replaceChildren(...items.map(([v,t])=>el('option',{value:v,textContent:t})));

/* ---------- État persistant (validé au chargement) ---------- */
const DEF=()=>({apps:[],desk:[],wp:{t:'p',v:0,fit:'cover'},pl:{},conns:[],proxy:'',docs:{}});
const S=(()=>{try{const o=JSON.parse(localStorage.vd);const s={...DEF(),...(o&&typeof o==='object'?o:{})};
  for(const k of['apps','desk','conns'])if(!Array.isArray(s[k]))s[k]=[];for(const k of['pl','docs'])if(!s[k]||typeof s[k]!=='object')s[k]={};return s}catch{return DEF()}})();
const save=()=>{try{localStorage.vd=JSON.stringify(S);return true}catch{alert('Stockage local plein ou indisponible.');return false}};
const mem=Object.create(null);                       // mots de passe : mémoire de session uniquement
const uid=()=>crypto.randomUUID().slice(0,8),ext=n=>String(n).split('.').pop().toLowerCase();
const httpUrl=u=>{try{const x=new URL(u);return/^https?:$/.test(x.protocol)&&!x.username?x.href:null}catch{return null}};
const openTab=u=>{const h=httpUrl(u);if(h)window.open(h,'_blank','noopener,noreferrer')};

/* ---------- Assainisseur HTML (liste blanche) pour l'éditeur ---------- */
const OK=new Set('B I U S STRIKE STRONG EM P BR DIV SPAN H1 H2 H3 UL OL LI A FONT BLOCKQUOTE'.split(' '));
const DROP=/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|SVG|MATH|TEMPLATE|NOSCRIPT)$/;
const CSS_OK=/^(color|background-color|font-size|text-align|font-weight|font-style|text-decoration(-line)?)$/,VAL_OK=/^[#\w\s%.,()-]+$/;
function clean(html){const d=new DOMParser().parseFromString(String(html),'text/html'),root=document.createElement('div');
  (function walk(n,to){for(const c of n.childNodes){
    if(c.nodeType===3)to.append(c.textContent);
    else if(c.nodeType===1){if(!OK.has(c.tagName)){if(!DROP.test(c.tagName))walk(c,to);continue}
      const e=document.createElement(c.tagName);
      if(c.tagName==='A'){const h=httpUrl(c.getAttribute('href'));if(h){e.href=h;e.rel='noopener noreferrer';e.target='_blank'}}
      if(c.tagName==='FONT'){const col=c.getAttribute('color'),sz=c.getAttribute('size');if(/^#[0-9a-f]{3,8}$/i.test(col))e.setAttribute('color',col);if(/^[1-7]$/.test(sz))e.setAttribute('size',sz)}
      for(const r of(c.getAttribute('style')||'').split(';')){const[k,v]=r.split(':').map(x=>x&&x.trim());if(k&&v&&CSS_OK.test(k)&&VAL_OK.test(v))e.style.setProperty(k,v)}
      walk(c,e);to.append(e)}}})(d.body,root);return root.innerHTML}

/* ---------- Gestionnaire de fenêtres ---------- */
let Z=10;const bar=$('#bar');
function win(title,body,o={}){
  const w=el('div',{className:'win',role:'dialog','aria-label':title}),tb=el('div',{className:'tb'},el('span',{className:'tt',textContent:title}));
  w.style.cssText=`left:${40+Math.random()*100}px;top:${30+Math.random()*60}px;width:${Math.min(o.w||560,innerWidth-10)}px;height:${Math.min(o.h||400,innerHeight-60)}px`;
  const front=()=>w.style.zIndex=++Z,task=el('button',{className:'tk',textContent:title,onclick:()=>{w.hidden=false;front()}});
  const mk=(t,l,f)=>tb.append(el('button',{textContent:t,title:l,'aria-label':l,onclick:e=>{e.stopPropagation();f()}}));
  mk('–','Réduire',()=>w.hidden=true);mk('▢','Agrandir',()=>w.classList.toggle('max'));
  mk('×','Fermer',()=>{o.onclose&&o.onclose();w.remove();task.remove()});
  tb.onpointerdown=e=>{if(e.target.closest('button')||w.classList.contains('max'))return;front();tb.setPointerCapture(e.pointerId);
    const dx=e.clientX-w.offsetLeft,dy=e.clientY-w.offsetTop;
    tb.onpointermove=m=>{w.style.left=m.clientX-dx+'px';w.style.top=Math.max(0,m.clientY-dy)+'px'};tb.onpointerup=()=>tb.onpointermove=null};
  w.onpointerdown=front;w.append(tb,el('div',{className:'bd'},...body));if(innerWidth<700)w.classList.add('max');
  front();$('#desk').append(w);bar.append(task);return w}

/* ---------- Fond d'écran ---------- */
const PRE=['linear-gradient(135deg,#0f1b2d,#2b3a67 60%,#f2b134 160%)','linear-gradient(160deg,#1d3b2f,#0b1d2a)','linear-gradient(200deg,#4a1d3d,#14213d)','#101418'];
function applyWp(){const d=$('#desk'),w=S.wp;d.style.background='';
  if(w.t==='p'){d.style.background=PRE[w.v]||PRE[0];return}
  const ok=/^data:image\/(png|jpe?g|gif|webp);base64,[\w+/=]+$/.test(w.v)||httpUrl(w.v);if(!ok){S.wp=DEF().wp;return applyWp()}
  d.style.backgroundImage=`url("${w.v.replace(/["\\\n]/g,c=>encodeURIComponent(c))}")`;d.style.backgroundPosition='center';d.style.backgroundRepeat='no-repeat';
  d.style.backgroundSize=['cover','contain','100% 100%'].includes(w.fit)?w.fit:'cover'}
function wpWin(){const fit=el('select');opts(fit,[['cover','Remplir'],['contain','Contenir'],['100% 100%','Étirer']]);fit.value=S.wp.fit;fit.onchange=()=>{S.wp.fit=fit.value;save();applyWp()};
  const url=el('input',{placeholder:'URL https://… de l’image'}),pick=el('input',{type:'file',accept:'image/png,image/jpeg,image/gif,image/webp'});
  const set=v=>{S.wp={t:'u',v,fit:fit.value};if(save())applyWp()};
  pick.onchange=()=>{const f=pick.files[0];if(!f||f.size>2e6)return alert('Image de 2 Mo maximum (sinon, utilisez une URL).');const r=new FileReader();r.onload=()=>set(r.result);r.readAsDataURL(f)};
  win('Fond d’écran',[el('div',{className:'row'},...PRE.map((p,i)=>el('button',{textContent:'Thème '+(i+1),onclick:()=>{S.wp={t:'p',v:i,fit:fit.value};save();applyWp()}}))),
    el('div',{className:'row'},url,el('button',{textContent:'Appliquer',onclick:()=>{const h=httpUrl(url.value);h?set(h):alert('URL http(s) invalide')}})),
    el('div',{className:'row'},pick),el('div',{className:'row'},'Ajustement :',fit)],{w:420,h:260})}

/* ---------- Proxy (optionnel) ---------- */
const api=async(p,b)=>{if(!S.proxy)throw Error('Proxy non configuré (Réglages).');
  const r=await fetch(S.proxy+p,{method:'POST',headers:{'content-type':'application/json','x-token':sessionStorage.vdt||''},body:JSON.stringify(b),credentials:'omit',referrerPolicy:'no-referrer'});
  if(!r.ok)throw Error('Proxy : HTTP '+r.status);return r};

/* ---------- Raccourcis web : bureau, App Store, Mes apps ---------- */
const appById=id=>S.apps.find(a=>a.id===id);
function renderDesk(){const c=$('#icons');c.replaceChildren();
  S.desk.map(appById).filter(Boolean).forEach(a=>c.append(el('div',{className:'ic'},
    el('button',{className:'o',onclick:()=>matchMedia('(pointer:coarse)').matches&&launch(a),ondblclick:()=>launch(a),onkeydown:e=>e.key==='Enter'&&launch(a),'aria-label':'Ouvrir '+a.name},el('b',{textContent:a.icon||'🌐'}),el('span',{textContent:a.name})),
    el('button',{className:'x',textContent:'×',title:'Retirer du bureau (reste dans l’App Store)','aria-label':'Retirer '+a.name+' du bureau',onclick:()=>{S.desk=S.desk.filter(x=>x!==a.id);save();renderDesk()}}))))}
async function launch(a){
  if(a.mode==='tab')return openTab(a.url);
  let src=a.url,sandbox='allow-scripts allow-forms allow-popups allow-same-origin',proxied=false;
  if(S.proxy){try{const r=await(await api('/api/open',{url:a.url})).json();
      if(!r.proxiable)return openTab(a.url);                       // repli automatique : nouvel onglet
      if(!r.embeddable){src=S.proxy+r.path;sandbox='allow-scripts allow-forms allow-popups';proxied=true}}catch{}}
  const f=el('iframe',{sandbox,referrerPolicy:'no-referrer',title:a.name});f.src=src;
  const onMsg=async e=>{if(!proxied||e.source!==f.contentWindow)return;const h=httpUrl(e.data&&e.data.vdNav);   // navigation relayée par le proxy
    if(h)try{const r=await(await api('/api/open',{url:h})).json();r.proxiable?(f.src=r.embeddable?h:S.proxy+r.path):openTab(h)}catch{openTab(h)}};
  addEventListener('message',onMsg);
  win(a.name,[el('div',{className:'warn'},'Page vide ou bloquée ? ',el('button',{textContent:'Ouvrir dans un onglet',onclick:()=>openTab(a.url)}),S.proxy?'':' Proxy non configuré (Réglages).'),f],{w:700,h:480,onclose:()=>removeEventListener('message',onMsg)})}
function storeWin(){
  const n=el('input',{placeholder:'Nom',maxLength:40}),u=el('input',{placeholder:'https://…'}),i=el('input',{placeholder:'🌐',size:2,maxLength:4,style:'flex:0 0 56px'}),cat=el('input',{placeholder:'Catégorie',maxLength:30}),
    m=el('select');opts(m,[['window','Dans le bureau'],['tab','Nouvel onglet']]);const list=el('div');let edit=null;
  const draw=()=>{list.replaceChildren();S.apps.forEach(a=>{const on=S.desk.includes(a.id);list.append(el('div',{className:'li'},
    el('span',{textContent:`${a.icon||'🌐'} ${a.name} · ${a.cat||'—'} · ${a.mode==='tab'?'onglet':'fenêtre'}`,onclick:()=>launch(a)}),
    el('button',{textContent:on?'Retirer du bureau':'Mettre sur le bureau',onclick:()=>{S.desk=on?S.desk.filter(x=>x!==a.id):[...S.desk,a.id];save();renderDesk();draw()}}),
    el('button',{textContent:'Éditer',onclick:()=>{edit=a;n.value=a.name;u.value=a.url;i.value=a.icon||'';cat.value=a.cat||'';m.value=a.mode}}),
    el('button',{textContent:'Supprimer',title:'Suppression définitive',onclick:()=>{if(confirm('Supprimer définitivement « '+a.name+' » ?')){S.apps=S.apps.filter(x=>x!==a);S.desk=S.desk.filter(x=>x!==a.id);save();renderDesk();draw()}}})))});
    if(!S.apps.length)list.append(el('small',{textContent:'Aucune app : ajoutez un raccourci ci-dessus.'}))};
  win('App Store',[el('div',{className:'row'},n,u),el('div',{className:'row'},i,cat,m,el('button',{textContent:'Enregistrer',onclick:()=>{
    const h=httpUrl(u.value.trim());if(!n.value.trim()||!h)return alert('Nom et URL http(s) valides requis.');
    const d={name:n.value.trim(),url:h,icon:[...i.value].slice(0,2).join(''),cat:cat.value.trim(),mode:m.value==='tab'?'tab':'window'};
    edit?Object.assign(edit,d):S.apps.push({id:uid(),...d});edit=null;n.value=u.value=i.value=cat.value='';save();renderDesk();draw()}})),list],{w:660,h:420});draw()}
const myApps=()=>win('Mes apps',S.apps.length?S.apps.map(a=>el('div',{className:'li',onclick:()=>launch(a)},el('b',{textContent:a.icon||'🌐'}),el('span',{textContent:a.name}))):[el('small',{textContent:'Vide : ajoutez des apps dans l’App Store.'})],{w:320,h:360});

/* ---------- Stockages WebDAV / SFTP ---------- */
const b64=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b)});
const full=(c,p)=>('/'+(c.base||'')).replace(/\/+/g,'/').replace(/\/$/,'')+p,J=(a,b)=>a.replace(/\/$/,'')+'/'+b,up=p=>p.replace(/\/[^/]+\/?$/,'')||'/';
const cx=c=>({...c,pass:mem[c.id]});
async function dav(c,method,p,body,h={}){const base=httpUrl(c.url);if(!base)throw Error('URL WebDAV invalide');
  const url=base.replace(/\/$/,'')+encodeURI(full(c,p)),auth='Basic '+btoa(unescape(encodeURIComponent(c.user+':'+(mem[c.id]||''))));
  const r=S.proxy?await api('/api/dav',{url,method,headers:h,auth,b64:body&&await b64(body)}):await fetch(url,{method,headers:{...h,Authorization:auth},body,credentials:'omit',referrerPolicy:'no-referrer'}).catch(()=>{throw Error('Requête bloquée (CORS ?) — configurez le proxy.')});
  if(!r.ok&&r.status!==207)throw Error('HTTP '+r.status);return r}
const FS={
  async list(c,p){if(c.type==='sftp')return(await api('/api/sftp/list',{conn:cx(c),path:full(c,p)})).json();
    const x=new DOMParser().parseFromString(await(await dav(c,'PROPFIND',p,null,{Depth:'1'})).text(),'text/xml'),out=[];
    [...x.getElementsByTagNameNS('*','response')].slice(1).forEach(r=>{const g=t=>(r.getElementsByTagNameNS('*',t)[0]||{}).textContent||'';
      out.push({name:decodeURIComponent(g('href').replace(/\/$/,'').split('/').pop()),dir:!!r.getElementsByTagNameNS('*','collection').length,size:+g('getcontentlength')||0})});return out},
  async read(c,p){return c.type==='sftp'?(await api('/api/sftp/read',{conn:cx(c),path:full(c,p)})).blob():(await dav(c,'GET',p)).blob()},
  async write(c,p,b){return c.type==='sftp'?api('/api/sftp/write',{conn:cx(c),path:full(c,p),b64:await b64(b)}):dav(c,'PUT',p,b)}};
function connWin(){const list=el('div'),F={},fields=[['name','Nom'],['type',''],['url','URL WebDAV'],['host','Hôte SFTP'],['port','Port SFTP'],['user','Utilisateur'],['pass','Mot de passe'],['base','Chemin de base'],['fp','Empreinte SFTP (SHA256:…)']];
  const ins=fields.map(([k,l])=>F[k]=k==='type'?(()=>{const s=el('select');opts(s,[['dav','WebDAV'],['sftp','SFTP']]);return s})():el('input',{placeholder:l,type:k==='pass'?'password':'text',autocomplete:'off',maxLength:300}));
  const draw=()=>{list.replaceChildren();S.conns.forEach(c=>list.append(el('div',{className:'li'},el('span',{textContent:`${c.type.toUpperCase()} · ${c.name}`}),
    el('button',{textContent:'Ouvrir',onclick:()=>{if(mem[c.id]==null){const p=prompt('Mot de passe pour '+c.name+' ?');if(p==null)return;mem[c.id]=p}explorer(c)}}),
    el('button',{textContent:'Supprimer',onclick:()=>{delete mem[c.id];S.conns=S.conns.filter(x=>x!==c);save();draw()}}))))};
  win('Stockages cloud',[el('div',{className:'row'},...ins),el('div',{className:'row'},el('button',{textContent:'Ajouter la connexion',onclick:()=>{
    const c={id:uid()};fields.forEach(([k])=>c[k]=F[k].value.trim());
    if(!c.name||!c.user)return alert('Nom et utilisateur requis.');
    if(c.type==='dav'&&!httpUrl(c.url))return alert('URL WebDAV http(s) invalide.');
    if(c.type==='sftp'&&(!/^[\w.-]+$/.test(c.host)||!(+c.port>0||c.port==='')))return alert('Hôte ou port SFTP invalide.');
    mem[c.id]=c.pass;delete c.pass;S.conns.push(c);save();draw();F.pass.value=''}}),
    el('small',{textContent:'Le mot de passe reste en mémoire de session ; l’empreinte SFTP est vérifiée par le proxy.'})),list],{w:640,h:440});draw()}
const isAudio=n=>/^(mp3|ogg|oga|wav|flac|m4a|aac|opus)$/.test(ext(n)),blobOf=t=>t.blob?Promise.resolve(t.blob):FS.read(t.c,t.path);
function explorer(c){let p='/',files=[];const list=el('div'),path=el('b'),loc=el('input',{type:'file',multiple:true,'aria-label':'Fichier local'});
  loc.onchange=()=>{const l=[...loc.files].map(f=>({name:f.name,blob:f}));l.length&&openFile(l,0)};
  const ld=async q=>{try{const it=(await FS.list(c,q)).sort((a,b)=>b.dir-a.dir||String(a.name).localeCompare(String(b.name)));p=q;path.textContent=c.name+' : '+p;list.replaceChildren();
      if(p!=='/')list.append(el('div',{className:'li',onclick:()=>ld(up(p))},el('span',{textContent:'⬆ ..'})));
      files=it.filter(x=>!x.dir).map(x=>({name:String(x.name),c,path:J(p,String(x.name))}));
      it.forEach(x=>list.append(el('div',{className:'li',onclick:()=>x.dir?ld(J(p,String(x.name))):openFile(files,files.findIndex(f=>f.name===x.name))},
        el('span',{textContent:(x.dir?'📁 ':'📄 ')+x.name}),el('small',{textContent:x.dir?'':Math.round(x.size/1024)+' Ko'}))))}
    catch(e){list.replaceChildren(el('div',{className:'warn'},e.message+' ',httpUrl(c.url)?el('button',{textContent:'Ouvrir dans un onglet',onclick:()=>openTab(c.url)}):''))}};
  win('Explorateur — '+c.name,[el('div',{className:'row'},path,el('button',{textContent:'🎵 Lire le dossier',onclick:()=>{const a=files.filter(f=>isAudio(f.name));a.length?player(a,0):alert('Aucun fichier audio ici.')}}),
    el('button',{textContent:'📝 Nouveau texte',onclick:()=>editor('sans-titre.txt',{text:''},{c,path:J(p,'sans-titre.txt')})}),loc),list],{w:580,h:420});ld(p)}
async function openFile(files,i){const t=files[i],e=ext(t.name);let b;try{b=await blobOf(t)}catch(x){return alert(x.message)}
  if(isAudio(t.name)){const a=files.filter(f=>isAudio(f.name));return player(a,a.indexOf(t))}
  const u=URL.createObjectURL(b),done=()=>URL.revokeObjectURL(u);
  if(/^(mp4|webm|ogv|mov)$/.test(e))win(t.name,[el('video',{src:u,controls:true})],{w:640,h:400,onclose:done});
  else if(/^(png|jpe?g|gif|webp|bmp)$/.test(e))win(t.name,[el('img',{src:u,alt:t.name})],{w:520,h:400,onclose:done});
  else if(e==='pdf')win(t.name,[el('iframe',{src:u,sandbox:'',title:t.name})],{w:640,h:480,onclose:done});
  else{done();if(b.size>5e6)return alert('Fichier texte trop volumineux (5 Mo max).');const x=await b.text();
    editor(t.name,/^html?$/.test(e)?{html:x}:{text:x},t.c?{c:t.c,path:t.path}:null)}}

/* ---------- Lecteur de musique + playlists ---------- */
const P={q:[],i:0,a:new Audio(),loop:0,shuf:false,w:null,url:null};
function player(q,i){P.q=q;if(!P.w||!P.w.isConnected)buildPlayer();play(Math.max(0,i))}
async function play(i){P.i=i;const t=P.q[i];if(!t)return;try{const b=await blobOf(t);if(P.url)URL.revokeObjectURL(P.url);P.url=URL.createObjectURL(b);P.a.src=P.url;await P.a.play();P.now.textContent='♪ '+t.name;P.draw()}catch(e){P.now.textContent=e.message}}
const nextTrack=d=>{if(!P.q.length)return;let n=P.shuf?Math.floor(Math.random()*P.q.length):P.i+d;if(n>=P.q.length){if(!P.loop)return;n=0}if(n<0)n=P.q.length-1;play(n)};
function buildPlayer(){P.now=el('b',{textContent:'—'});const pr=el('input',{type:'range',min:0,max:1000,value:0,'aria-label':'Progression',oninput:()=>{if(P.a.duration)P.a.currentTime=P.a.duration*pr.value/1000}}),tm=el('small'),
  vol=el('input',{type:'range',min:0,max:1,step:.01,value:P.a.volume,'aria-label':'Volume',oninput:()=>P.a.volume=vol.value}),ql=el('div'),sel=el('select');
  const loopB=el('button',{textContent:'🔁 off',onclick:()=>{P.loop=(P.loop+1)%3;loopB.textContent=['🔁 off','🔁 tout','🔂 piste'][P.loop]}}),shB=el('button',{textContent:'🔀 off',onclick:()=>{P.shuf=!P.shuf;shB.textContent='🔀 '+(P.shuf?'on':'off')}});
  const fmt=s=>isFinite(s)?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00',ps=()=>opts(sel,[['','Playlist…'],...Object.keys(S.pl).map(k=>[k,k])]),cur=()=>S.pl[sel.value];
  P.a.ontimeupdate=()=>{pr.value=P.a.duration?P.a.currentTime/P.a.duration*1000:0;tm.textContent=fmt(P.a.currentTime)+' / '+fmt(P.a.duration)};
  P.a.onended=()=>P.loop===2?play(P.i):nextTrack(1);
  P.draw=()=>ql.replaceChildren(...P.q.map((t,k)=>el('div',{className:'li'+(k===P.i?' on':''),onclick:()=>play(k)},el('span',{textContent:t.name}))));
  P.w=win('Lecteur de musique',[P.now,pr,el('div',{className:'row'},tm,el('button',{textContent:'⏮','aria-label':'Précédent',onclick:()=>nextTrack(-1)}),el('button',{textContent:'⏯','aria-label':'Lecture/pause',onclick:()=>P.a.paused?P.a.play():P.a.pause()}),el('button',{textContent:'⏭','aria-label':'Suivant',onclick:()=>nextTrack(1)}),loopB,shB,'🔊',vol),
    el('div',{className:'row'},sel,el('button',{textContent:'Charger',onclick:()=>{const l=cur();if(l&&l.length){P.q=l.map(t=>({...t,c:S.conns.find(c=>c.id===t.cid)})).filter(t=>t.c);play(0)}}}),
      el('button',{textContent:'Nouvelle',onclick:()=>{const n=(prompt('Nom de la playlist ?')||'').trim().slice(0,40);if(n&&!(n in S.pl)){S.pl[n]=[];save();ps();sel.value=n}}}),
      el('button',{textContent:'+ piste',onclick:()=>{const t=P.q[P.i];if(!cur()||!t||!t.c)return alert('Choisissez une playlist et une piste d’un stockage connecté.');cur().push({name:t.name,cid:t.c.id,path:t.path});save()}}),
      el('button',{textContent:'Suppr.',onclick:()=>{if(cur()&&confirm('Supprimer la playlist ?')){delete S.pl[sel.value];save();ps()}}})),ql],{w:500,h:460,onclose:()=>{P.a.pause();if(P.url)URL.revokeObjectURL(P.url)}});ps();P.draw()}

/* ---------- Éditeur de texte enrichi ---------- */
function editor(name,src,dest){const ed=el('div',{className:'ed',contentEditable:'true',role:'textbox','aria-multiline':'true'}),nm=el('input',{value:name,maxLength:80}),docs=el('select');
  if('html'in src)ed.innerHTML=clean(src.html);else ed.append(...String(src.text).split('\n').map(l=>el('div',{textContent:l||'\u200b'})));
  const cmd=(c,v)=>{ed.focus();document.execCommand(c,false,v)},B=(t,l,c,v)=>el('button',{textContent:t,title:l,'aria-label':l,onmousedown:e=>{e.preventDefault();cmd(c,v)}}),
    fill=()=>opts(docs,[['','Espace de travail…'],...Object.keys(S.docs).map(k=>[k,k])]),
    dl=(n,t,m)=>{const u=URL.createObjectURL(new Blob([t],{type:m})),a=el('a',{href:u,download:n});a.click();setTimeout(()=>URL.revokeObjectURL(u),1e3)},
    stem=()=>nm.value.replace(/\.\w+$/,'')||'document';
  docs.onchange=()=>{if(docs.value in S.docs){nm.value=docs.value;ed.innerHTML=clean(S.docs[docs.value])}};fill();
  win('Éditeur',[el('div',{className:'row'},nm,docs),el('div',{className:'row'},B('G','Gras','bold'),B('I','Italique','italic'),B('S','Souligné','underline'),B('B','Barré','strikeThrough'),B('H','Titre','formatBlock','h2'),B('¶','Paragraphe','formatBlock','p'),B('•','Liste à puces','insertUnorderedList'),B('1.','Liste numérotée','insertOrderedList'),B('⬅','Aligner à gauche','justifyLeft'),B('↔','Centrer','justifyCenter'),B('➡','Aligner à droite','justifyRight'),
    (()=>{const s=el('select',{title:'Taille de police',onchange:()=>cmd('fontSize',s.value)});opts(s,[1,2,3,4,5,6,7].map(n=>[n,'Taille '+n]));s.value=3;return s})(),
    el('input',{type:'color',title:'Couleur du texte',value:'#000000',oninput:e=>cmd('foreColor',e.target.value)}),el('input',{type:'color',title:'Surlignage',value:'#ffff00',oninput:e=>cmd('hiliteColor',e.target.value)}),
    el('button',{textContent:'🔗',title:'Insérer un lien','aria-label':'Insérer un lien',onmousedown:e=>{e.preventDefault();const h=httpUrl(prompt('URL du lien (http/https) ?','https://'));h?cmd('createLink',h):alert('URL invalide.')}})),ed,
    el('div',{className:'row'},el('button',{textContent:'Enregistrer (local)',onclick:()=>{S.docs[nm.value||'sans-titre']=clean(ed.innerHTML);if(save())fill()}}),
      el('button',{textContent:'Enregistrer sur le stockage',onclick:async()=>{if(!dest)return alert('Ouvrez l’éditeur depuis un explorateur connecté.');
        try{await FS.write(dest.c,dest.path,new Blob([/\.html?$/.test(dest.path)?clean(ed.innerHTML):ed.innerText]));alert('Écrit : '+dest.path)}catch(e){alert(e.message)}}}),
      el('button',{textContent:'Export TXT',onclick:()=>dl(stem()+'.txt',ed.innerText,'text/plain')}),el('button',{textContent:'Export HTML',onclick:()=>dl(stem()+'.html','<meta charset="utf-8">'+clean(ed.innerHTML),'text/html')}))],{w:660,h:470})}

/* ---------- Réglages & barre des tâches ---------- */
function settings(){const i=el('input',{value:S.proxy,placeholder:'https://proxy.exemple.org (vide = mode démo client)'}),t=el('input',{type:'password',placeholder:'Jeton du proxy (session uniquement)',autocomplete:'off'});
  win('Réglages',[el('div',{className:'row'},i),el('div',{className:'row'},t,el('button',{textContent:'Enregistrer',onclick:()=>{const v=i.value.trim();
      if(v&&!httpUrl(v))return alert('URL invalide.');if(v&&!/^https:/.test(v)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(v))return alert('HTTPS obligatoire (http autorisé seulement en localhost).');
      S.proxy=v.replace(/\/$/,'');save();if(t.value)sessionStorage.vdt=t.value;t.value=''}})),
    el('small',{textContent:'Sans proxy : iframes directes avec repli onglet, WebDAV si CORS autorisé. Avec proxy : contournement X-Frame-Options, WebDAV sans CORS, SFTP.'})],{w:540,h:220})}
[['🛍 App Store',storeWin],['📱 Mes apps',myApps],['☁ Stockage',connWin],['🎵 Musique',()=>P.w&&P.w.isConnected?(P.w.hidden=false):buildPlayer()],['📝 Éditeur',()=>editor('sans-titre.txt',{text:''},null)],['🖼 Fond',wpWin],['⚙ Réglages',settings]]
  .forEach(([t,f])=>bar.append(el('button',{textContent:t,onclick:f})));bar.append(el('span',{className:'sep'}));
applyWp();renderDesk();
