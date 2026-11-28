'use strict';
/* konekt.js — application intégrée « Konekt » : un petit réseau social entre utilisateurs (publications, photos, vidéos, GIF, commentaires, j'aime) + appels vidéo/vocaux (konekt-call.js).
   Comme « Sormick Tchat » (chat.js), tout est stocké dans le cloud WebDAV de votre choix, chiffré de bout en bout (AES-GCM, une clé par communauté contenue dans le code d'invitation) :
   dossier « sormick-konekt/<identifiant de la communauté>/ » avec, par fichier :
     p-<publication>.p   publication      (<publication> = <horodatage 13 chiffres>-<6 car. de l'expéditeur>-<4 hasard>)
     c-<publication>-<commentaire>.c      commentaire  (<commentaire> = même forme)
     l-<publication>-<12 car. de l'identifiant>.l   un « j'aime » (le retirer = supprimer le fichier)
     m-<12 hasard>.b   photo / vidéo / fichier (IV + AES-GCM)
     k-<12 car.>-<horodatage>.k  présence dans un appel ; s-<de>-<à>-<horodatage>-<4>.s  signal d'appel (voir konekt-call.js)
   Les réutilisations : chatSeal / chatOpen / chatConn / chatPath / chatCloudPicker / chatInvite / chatParse / chatInviteBody (chat.js). */

const KO_DIR = 'sormick-konekt', KO_PRE = 'KON1-', KO_MAXM = 60 * 1048576, KO_PAGE = 8, KO_MEDIA = 6, KO_ROOMS = 30;
const KO_VID = /^video\/(mp4|webm|quicktime)$/;
const KO_ID = '\\d{13}-[a-f0-9]{6}-[a-f0-9]{4}';
const KO_POST = new RegExp('^p-(' + KO_ID + ')\\.p$'), KO_COM = new RegExp('^c-(' + KO_ID + ')-(' + KO_ID + ')\\.c$'), KO_LIKE = new RegExp('^l-(' + KO_ID + ')-([a-f0-9]{12})\\.l$');
const KO_MED = /^m-[a-f0-9]{12}\.b$/, KO_PRES = /^k-([a-f0-9]{12})-(\d{13})\.k$/, KO_SIG = /^s-([a-f0-9]{12})-([a-f0-9]{12})-(\d{13})-[a-f0-9]{4}\.s$/;
const koMe12 = () => chatMe().id.slice(0, 12);
const koNewId = () => String(Date.now()).padStart(13, '0') + '-' + chatMe().id.slice(0, 6) + '-' + chex(2);
const koRooms = () => D.soc.rooms;
/* présence : participants (autres que moi) vus il y a moins de 30 s dans un appel de cette communauté */
function koPresent(names) {
  const now = Date.now(), best = new Map();
  for (const n of names) { const m = KO_PRES.exec(n); if (m && +m[2] > now - 30000 && m[1] !== koMe12() && (best.get(m[1]) || 0) < +m[2]) best.set(m[1], +m[2]); }
  return best;
}

let KOWIN = null;
function koWin(roomId) {
  if (KOWIN && WINS.has(KOWIN.rec)) { KOWIN.w.hidden = false; KOWIN.w.style.zIndex = ++Z; if (roomId) KOWIN.open(roomId); return; }
  chatMe(); D.soc = D.soc || { rooms: [], recent: [] };
  const S = { cur: null, view: '', listing: null, posts: new Map(), coms: new Map(), imgs: new Map(), ip: new Map(), nodes: new Map(), shown: KO_PAGE, loading: false, err: '', sig: '', dead: false, timer: 0, wiz: null, openC: new Set(), att: [], busy: false, busyT: 0, calls: new Map(), tops: new Map() };
  const root = el('div', { className: 'chat ko' }), side = el('div', { className: 'chat-side' }), main = el('div', { className: 'chat-main' });
  root.append(side, main);
  const w = win('Konekt', 'users', [root], { w: 980, h: 650, cls: 'chatw', onclose: () => { S.dead = true; clearInterval(S.timer); for (const u of S.imgs.values()) if (u) URL.revokeObjectURL(u); S.imgs.clear(); for (const a of S.att) URL.revokeObjectURL(a.url); VIEWS.delete(draw); KOWIN = null; } });
  const rec = [...WINS].find(r => r.w === w); w.classList.add('koW');
  new ResizeObserver(() => root.classList.toggle('narrow', w.clientWidth < 700)).observe(w);
  const room = () => koRooms().find(r => r.id === S.cur) || null;
  const errText = chatErr;
  const open = id => { S.cur = id; S.view = id ? 'feed' : 'welcome'; S.listing = null; S.posts = new Map(); S.coms = new Map(); S.nodes = new Map(); S.shown = KO_PAGE; S.err = ''; S.sig = ''; S.openC = new Set(); root.classList.remove('showside'); draw(); if (id) load(true); };

  /* ---------- communautés (liste) ---------- */
  const drawSide = () => {
    side.replaceChildren(
      el('div', { className: 'chat-sh' }, el('b', { textContent: 'Communautés' })),
      el('div', { className: 'chat-rooms' }, ...koRooms().map(r => el('button', { type: 'button', className: 'chat-r' + (r.id === S.cur && S.view === 'feed' ? ' on' : ''), onclick: () => open(r.id) },
        el('span', { className: 'chat-av', style: `background:hsl(${hue(r.n)} 55% 45%)`, nt: 1, textContent: (r.n || '?').trim().slice(0, 1).toUpperCase() }),
        el('span', { className: 'grow' }, el('b', { nt: 1, textContent: r.n || 'Communauté' }), el('small', { className: 'mut', nt: 1, textContent: (chatConn(r) || { name: '' }).name || (chatConn(r) ? chatConn(r).url : '') })),
        r.unread ? el('i', { className: 'chat-dot', title: tr('Nouveautés'), 'aria-label': tr('Nouveautés') }) : null))),
      el('div', { className: 'chat-sf' }, btn('Nouvelle communauté', 'plus', () => wizard('create'), 'pri'), btn('Rejoindre avec un code', 'link', () => wizard('join')), btn('Zone rouge', 'trash', () => { S.view = 'danger'; root.classList.remove('showside'); draw(); }, 'dng chat-redb')));
  };

  /* ---------- assistant : créer / rejoindre ---------- */
  function wizard(kind) { S.view = 'wiz'; S.wiz = { kind, step: 1, conn: null, name: '', me: chatName(), inv: null, picker: null, code: '', room: null }; root.classList.remove('showside'); wdraw(); draw(); }
  const wdraw = () => {
    const W = S.wiz; if (!W) return;
    if (W.picker) { W.picker.dispose(); W.picker = null; }
    const head = el('div', { className: 'chat-wh' }, el('b', { textContent: W.kind === 'create' ? 'Nouvelle communauté' : 'Rejoindre une communauté' }), el('small', { className: 'mut', textContent: tr('Étape {0} sur {1}').replace('{0}', W.step).replace('{1}', 3) }),
      btn('Annuler', 'x', () => { S.wiz = null; open(koRooms().length ? (room() ? S.cur : koRooms()[0].id) : null); }, 'sm'));
    const back = n => btn('Précédent', 'back', () => { W.step = n; wdraw(); draw(); });
    let body;
    if (W.kind === 'create') {
      if (W.step === 1) {
        W.picker = chatCloudPicker('', c => { W.conn = c; nx.disabled = !c; });
        const nx = btn('Suivant', 'fwd', () => { W.step = 2; wdraw(); draw(); }, 'pri'); nx.disabled = !W.picker.get() || !W.conn;
        body = [el('p', { textContent: 'Choisissez le cloud WebDAV où seront stockées les publications, photos et vidéos de la communauté. Les personnes à inviter devront avoir accès au même cloud (même compte, ou dossier partagé avec elles). Tout y est chiffré : le cloud ne voit que des fichiers illisibles.' }), W.picker.el, el('div', { className: 'row' }, nx)];
      } else if (W.step === 2) {
        const nm = el('input', { value: W.name, placeholder: 'Nom de la communauté (par exemple : Famille)', maxLength: 60, autocomplete: 'off' }), me = el('input', { value: W.me, placeholder: 'Votre nom affiché', maxLength: 40, autocomplete: 'off' });
        const go = async () => {
          if (W.busy) return; W.name = nm.value.trim() || tr('Communauté'); W.me = me.value.trim() || chatName(); W.busy = true; goB.disabled = true;
          try { W.room = await koCreate(W.conn, W.name, W.me); W.step = 3; W.busy = false; wdraw(); draw(); } catch (e) { W.busy = false; goB.disabled = false; toast(errText(e), 8000); }
        };
        nm.onkeydown = me.onkeydown = e => { if (e.key === 'Enter') go(); };
        const goB = btn('Créer la communauté', 'check', go, 'pri');
        body = [el('label', { className: 'col' }, el('small', { className: 'mut', textContent: 'Nom de la communauté' }), nm), el('label', { className: 'col' }, el('small', { className: 'mut', textContent: 'Votre nom affiché' }), me), el('div', { className: 'row' }, back(1), goB)];
      } else body = chatInviteBody(W.room, KO_PRE, 'Konekt', () => { const id = W.room.id; S.wiz = null; open(id); });
    } else if (W.step === 1) {
      const ta = el('textarea', { rows: 4, placeholder: 'Collez ici le code d’invitation (il commence par KON1-)', spellcheck: false, autocomplete: 'off', autocapitalize: 'off', value: W.code }), info = el('div', { className: 'chat-st' });
      const nx = btn('Suivant', 'fwd', () => { W.step = 2; wdraw(); draw(); }, 'pri');
      const chk = () => { W.code = ta.value; W.inv = chatParse(ta.value, KO_PRE); nx.disabled = !W.inv; info.className = 'chat-st' + (W.inv ? ' ok' : ''); info.textContent = W.inv ? tr('Invitation reconnue : « {0} »').replace('{0}', W.inv.n || tr('Communauté')) : (ta.value.trim() ? tr('Ce code n’est pas valide : copiez-le en entier.') : ''); };
      ta.oninput = chk; chk();
      const paste = navigator.clipboard && navigator.clipboard.readText ? btn('Coller', 'copy', async () => { try { ta.value = await navigator.clipboard.readText(); chk(); } catch { toast('Collage impossible : appuyez longuement dans la zone puis choisissez « Coller ».'); } }) : null;
      body = [el('p', { textContent: 'La personne qui vous invite vous a envoyé un code. Collez-le ci-dessous.' }), ta, info, el('div', { className: 'row' }, paste, nx)];
    } else if (W.step === 2) {
      W.picker = chatCloudPicker(W.inv.h, c => { W.conn = c; nx.disabled = !c; });
      const nx = btn('Suivant', 'fwd', () => { W.step = 3; wdraw(); draw(); }, 'pri'); nx.disabled = !W.picker.get() || !W.conn;
      body = [el('p', { textContent: W.inv.h ? tr('Cette communauté est stockée sur le cloud « {0} ». Choisissez votre accès à ce même cloud (le vôtre, avec votre identifiant).').replace('{0}', W.inv.h) : 'Choisissez votre accès au cloud où la communauté est stockée.' }), W.picker.el, el('div', { className: 'row' }, back(1), nx)];
    } else {
      const me = el('input', { value: W.me, placeholder: 'Votre nom affiché', maxLength: 40, autocomplete: 'off' });
      const go = async () => {
        if (W.busy) return; W.me = me.value.trim() || chatName(); W.busy = true; goB.disabled = true;
        try { const r = await koJoin(W.conn, W.inv, W.me); S.wiz = null; toast('Communauté rejointe.'); open(r.id); } catch (e) { W.busy = false; goB.disabled = false; toast(errText(e), 10000); }
      };
      me.onkeydown = e => { if (e.key === 'Enter') go(); };
      const goB = btn('Rejoindre', 'check', go, 'pri');
      body = [el('p', { textContent: tr('Vous allez rejoindre « {0} ».').replace('{0}', W.inv.n || tr('Communauté')) }), el('label', { className: 'col' }, el('small', { className: 'mut', textContent: 'Votre nom affiché' }), me), el('div', { className: 'row' }, back(2), goB)];
    }
    main.replaceChildren(head, el('div', { className: 'chat-wb' }, ...body));
  };
  async function koCreate(c, name, me) {
    if (koRooms().length >= KO_ROOMS) throw new Error('30 communautés au maximum : quittez-en une avant d’en créer une.');
    const r = { id: chex(8), k: cbEnc(crypto.getRandomValues(new Uint8Array(32))), n: name.slice(0, 60), cid: c.id, p: KO_DIR, seen: 0 };
    try { await FS.mkdir(c, '/' + r.p + '/'); } catch { /* existe déjà */ }
    await FS.mkdir(c, chatPath(r)).catch(e => { throw new Error(tr('Impossible de créer le dossier de la communauté sur ce cloud : {0}').replace('{0}', e.message)); });
    D.chat.name = me.slice(0, 40); koRooms().push(r); save(); return r;
  }
  async function koJoin(c, inv, me) {
    const ex = koRooms().find(r => r.id === inv.id); if (ex) return ex;
    if (koRooms().length >= KO_ROOMS) throw new Error('30 communautés au maximum : quittez-en une avant d’en rejoindre une autre.');
    const r = { id: inv.id, k: inv.k, n: inv.n || tr('Communauté'), cid: c.id, p: inv.p, seen: 0 };
    try { await FS.list(c, chatPath(r)); }
    catch (e) { throw new Error(tr('Dossier de la communauté introuvable sur ce cloud. Vérifiez que vous avez choisi le même cloud et le même compte que la personne qui vous invite (ou que le dossier « {0} » est bien partagé avec vous).').replace('{0}', inv.p) + ' (' + errText(e) + ')'); }
    D.chat.name = me.slice(0, 40); koRooms().push(r); save(); return r;
  }

  /* ---------- lecture du fil ---------- */
  const put = async (r, name, obj) => FS.write(chatConn(r), chatPath(r) + name, await chatSeal(r, TE.encode(JSON.stringify(obj))));
  const getJ = async (r, name) => { const b = await FS.read(chatConn(r), chatPath(r) + name, 'application/octet-stream'); return JSON.parse(TD.decode(await chatOpen(r, await b.arrayBuffer()))); };
  const media = a => (Array.isArray(a) ? a : []).slice(0, KO_MEDIA).filter(f => f && typeof f === 'object' && KO_MED.test(f.r)).map(f => ({ n: chatFile(f.n), s: Math.max(0, +f.s || 0), m: String(f.m || '').slice(0, 80), r: f.r }));
  const decPost = async (r, id) => { try { const j = await getJ(r, 'p-' + id + '.p'); return { id, ts: +id.slice(0, 13), u: String(j.u || '').slice(0, 40), n: String(j.n || '?').slice(0, 40), x: typeof j.x === 'string' ? j.x.slice(0, 5000) : '', md: media(j.md), g: typeof j.g === 'string' ? httpUrl(j.g) : null }; } catch { return { id, ts: +id.slice(0, 13), bad: true, u: '', n: '?', x: '', md: [], g: null }; } };
  const decCom = async (r, name) => { const m = KO_COM.exec(name); try { const j = await getJ(r, name); return { name, pid: m[1], id: m[2], ts: +m[2].slice(0, 13), u: String(j.u || '').slice(0, 40), n: String(j.n || '?').slice(0, 40), x: typeof j.x === 'string' ? j.x.slice(0, 2000) : '' }; } catch { return { name, pid: m[1], id: m[2], ts: +m[2].slice(0, 13), bad: true, u: '', n: '?', x: '' }; } };
  async function load(first) {
    const r = room(); if (!r || S.loading) return; const c = chatConn(r);
    if (!c) { S.err = 'Le cloud de cette communauté n’est plus connecté sur ce profil. Ajoutez-le dans « Stockage cloud », puis revenez ici.'; return draw(); }
    S.loading = true; const my = S.cur;
    try {
      const names = (await FS.list(c, chatPath(r))).map(e => e.name);
      const posts = [], coms = new Map(), likes = new Map();
      for (const n of names) {
        let m;
        if ((m = KO_POST.exec(n))) posts.push(m[1]);
        else if ((m = KO_COM.exec(n))) { if (!coms.has(m[1])) coms.set(m[1], []); coms.get(m[1]).push(n); }
        else if ((m = KO_LIKE.exec(n))) { if (!likes.has(m[1])) likes.set(m[1], new Set()); likes.get(m[1]).add(m[2]); }
      }
      posts.sort().reverse(); for (const l of coms.values()) l.sort();
      S.listing = { posts, coms, likes, calls: koPresent(names), names }; S.err = '';
      const need = posts.slice(0, S.shown).filter(id => !S.posts.has(id));
      for (let i = 0; i < need.length; i += 6) { const got = await Promise.all(need.slice(i, i + 6).map(id => decPost(r, id))); if (S.cur !== my || S.dead) return; got.forEach(g => S.posts.set(g.id, g)); }
      for (const pid of S.openC) for (const n of (coms.get(pid) || []).filter(n => !S.coms.has(n))) S.coms.set(n, await decCom(r, n));
      for (const k of [...S.posts.keys()]) if (!posts.includes(k)) S.posts.delete(k);
      const top = posts.length ? +posts[0].slice(0, 13) : 0;
      if (top > (r.seen || 0)) { r.seen = top; save(); }
      r.unread = false;
    } catch (e) { S.err = errText(e); }
    S.loading = false;
    const L = S.listing, sig = L ? L.posts.slice(0, S.shown).join('|') + '#' + [...L.coms].map(([k, v]) => k + v.length).join(',') + '#' + [...L.likes].map(([k, v]) => k + [...v].sort().join('')).join(',') + '#' + S.err + '#' + [...L.calls.keys()].join('') : S.err;
    if (!S.dead && (first || sig !== S.sig)) { S.sig = sig; draw(); }
  }
  S.timer = setInterval(() => { if (!S.dead && !w.hidden && document.visibilityState === 'visible' && S.view === 'feed' && !S.busy) load(); }, 12000);

  /* ---------- médias ---------- */
  const readMedia = async (r, f, mime) => { const b = await FS.read(chatConn(r), chatPath(r) + f.r, 'application/octet-stream'); return new Blob([await chatOpen(r, await b.arrayBuffer())], { type: mime }); };
  const lightbox = chatLightbox;
  const imgBtn = (url, alt) => { const img = el('img', { className: 'ko-img', alt, loading: 'lazy', referrerPolicy: 'no-referrer' }); img.src = url; return el('button', { type: 'button', className: 'chat-imgb', title: tr('Agrandir'), 'aria-label': tr('Agrandir'), onclick: () => lightbox(url) }, img); };
  const mediaNode = (r, f) => {
    if (CHAT_IMG.test(f.m)) {
      const have = S.imgs.get(f.r);
      if (have) return imgBtn(have, f.n);
      if (have === '') return el('div', { className: 'chat-ph', textContent: 'Image illisible.' });
      if (!S.ip.has(f.r)) S.ip.set(f.r, readMedia(r, f, f.m).then(b => { S.imgs.set(f.r, URL.createObjectURL(b)); }).catch(() => { S.imgs.set(f.r, ''); }).then(() => { if (!S.dead) draw(); }));
      return el('div', { className: 'chat-ph', textContent: 'Chargement de l’image…' });
    }
    if (KO_VID.test(f.m)) {
      const have = S.imgs.get(f.r);
      if (have) { const v = el('video', { className: 'ko-vid', controls: true, playsInline: true, preload: 'metadata' }); v.src = have; return v; }
      const b = el('button', { type: 'button', className: 'ko-play', onclick: async () => {
        const t = toast('Chargement de la vidéo…', 0);
        try { const bl = await readMedia(r, f, f.m); S.imgs.set(f.r, URL.createObjectURL(bl)); t.close(); S.nodes.clear(); draw(); } catch (e) { t.close(); toast(errText(e), 8000); }
      } }, ico('video', 30), el('span', { nt: 1, textContent: f.n }), el('small', { className: 'mut', textContent: fmtSize(f.s) }), el('small', { textContent: 'Toucher pour lire la vidéo' }));
      return b;
    }
    return el('div', { className: 'chat-file' }, ico('file', 22), el('span', { className: 'grow' }, el('b', { nt: 1, textContent: f.n }), el('small', { className: 'mut', textContent: fmtSize(f.s) })),
      btn('Télécharger', 'download', async () => { const t = toast('Téléchargement…', 0); try { download(await readMedia(r, f, 'application/octet-stream'), f.n); t.close(); } catch (er) { t.close(); toast(errText(er), 8000); } }));
  };

  /* ---------- actions ---------- */
  const linkify = t => { const out = []; let i = 0; for (const m of t.matchAll(/https?:\/\/[^\s<>"']+/g)) { const raw = m[0].replace(/[).,;!?]+$/, ''), u = httpUrl(raw); if (!u) continue; if (m.index > i) out.push(document.createTextNode(t.slice(i, m.index))); out.push(el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', nt: 1, textContent: raw })); i = m.index + raw.length; } if (i < t.length) out.push(document.createTextNode(t.slice(i))); return out; };
  const publish = async (x, g) => {
    const r = room(), c = r && chatConn(r); if (!r || !c) return toast('Cloud de la communauté introuvable.');
    if (!x && !g && !S.att.length) return;
    S.busy = true; const t = toast('Publication en cours…', 0);
    try {
      const md = [];
      for (let i = 0; i < S.att.length; i++) {
        const a = S.att[i]; t.set(tr('Envoi du fichier {0} sur {1}…').replace('{0}', i + 1).replace('{1}', S.att.length));
        const ref = 'm-' + chex(6) + '.b'; await FS.write(c, chatPath(r) + ref, await chatSeal(r, new Uint8Array(await a.blob.arrayBuffer()))); md.push({ n: a.name, s: a.blob.size, m: a.mime, r: ref });
      }
      await put(r, 'p-' + koNewId() + '.p', { v: 1, u: chatMe().id, n: chatName(), t: Date.now(), x: x || '', md, ...(g ? { g } : {}) });
      for (const a of S.att) URL.revokeObjectURL(a.url); S.att = []; t.close(); S.busy = false; toast('Publié.'); S.shown = Math.max(S.shown, KO_PAGE); await load(true); return true;
    } catch (e) { t.close(); S.busy = false; toast(errText(e), 9000); return false; }
  };
  const addFiles = async files => {
    for (const f of [...files]) {
      if (S.att.length >= KO_MEDIA) { toast('6 fichiers au maximum par publication.'); break; }
      const pr = await chatPrepFile(f);
      if (pr.blob.size > KO_MAXM) { toast(tr('« {0} » est trop volumineux (60 Mo au maximum).').replace('{0}', pr.name), 6000); continue; }
      S.att.push({ blob: pr.blob, name: pr.name, mime: pr.mime, url: URL.createObjectURL(pr.blob) });
    }
    drawAtt();
  };
  const toggleLike = async p => {
    const r = room(), c = chatConn(r), me = koMe12(), nm = 'l-' + p.id + '-' + me + '.l', set = S.listing.likes.get(p.id) || new Set();
    try {
      if (set.has(me)) { await FS.remove(c, chatPath(r) + nm); set.delete(me); } else { await put(r, nm, { v: 1, u: chatMe().id, n: chatName(), t: Date.now() }); set.add(me); }
      S.listing.likes.set(p.id, set); S.nodes.delete(p.id); draw();
    } catch (e) { toast(errText(e), 8000); }
  };
  const sendCom = async (p, input) => {
    const x = input.value.trim(); if (!x) return; const r = room(); input.disabled = true;
    try { await put(r, 'c-' + p.id + '-' + koNewId() + '.c', { v: 1, u: chatMe().id, n: chatName(), t: Date.now(), x }); input.value = ''; S.openC.add(p.id); await load(true); S.nodes.delete(p.id); draw(); } catch (e) { toast(errText(e), 8000); }
    input.disabled = false; input.focus();
  };
  const delCom = async cm => { if (!await confirmBox('Supprimer ce commentaire ?', 'Supprimer', true)) return; try { await FS.remove(chatConn(room()), chatPath(room()) + cm.name); S.coms.delete(cm.name); await load(true); S.nodes.clear(); draw(); } catch (e) { toast(errText(e), 8000); } };
  const delPost = async p => {
    if (!await confirmBox('Supprimer cette publication, ses commentaires et ses « j’aime » pour tout le monde ?', 'Supprimer', true)) return;
    const r = room(), c = chatConn(r), t = toast('Suppression…', 0);
    try {
      for (const f of p.md) await FS.remove(c, chatPath(r) + f.r).catch(() => {});
      for (const n of S.listing.names) if ((KO_COM.exec(n) || KO_LIKE.exec(n) || [])[1] === p.id) await FS.remove(c, chatPath(r) + n).catch(() => {});
      await FS.remove(c, chatPath(r) + 'p-' + p.id + '.p'); S.posts.delete(p.id); S.nodes.clear(); t.close(); await load(true);
    } catch (e) { t.close(); toast(errText(e), 8000); }
  };

  /* ---------- affichage ---------- */
  const ago = t => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? tr('à l’instant') : s < 3600 ? tr('il y a {0} min').replace('{0}', Math.floor(s / 60)) : s < 86400 ? tr('il y a {0} h').replace('{0}', Math.floor(s / 3600)) : new Date(t).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }); };
  const avatar1 = (n, u) => el('span', { className: 'chat-av ko-av', style: `background:hsl(${hue(u || n)} 55% 45%)`, nt: 1, textContent: (n || '?').trim().slice(0, 1).toUpperCase() });
  const comNode = cm => el('div', { className: 'ko-c' }, avatar1(cm.n, cm.u), el('div', { className: 'ko-cb' }, el('b', { nt: 1, textContent: cm.n }), cm.bad ? el('i', { className: 'mut', textContent: '🔒 Message illisible (clé différente ?)' }) : el('div', { className: 'chat-tx', nt: 1 }, ...linkify(cm.x)),
    el('small', { className: 'mut' }, el('span', { nt: 1, textContent: ago(cm.ts) }), cm.u === chatMe().id ? btn('', 'trash', () => delCom(cm), 'chat-del', 'Supprimer ce commentaire') : null)));
  const postNode = p => {
    const r = room(), L = S.listing, likes = L.likes.get(p.id) || new Set(), liked = likes.has(koMe12()), cn = (L.coms.get(p.id) || []).length, mine = p.u === chatMe().id, openC = S.openC.has(p.id);
    const sig = JSON.stringify([p.ts, p.bad, likes.size, liked, cn, openC, openC ? (L.coms.get(p.id) || []).filter(n => S.coms.has(n)).length : 0, p.md.map(f => !!S.imgs.get(f.r) + '' + (S.imgs.get(f.r) === '')), p.g]);
    const old = S.nodes.get(p.id); if (old && old.sig === sig) return old.node;
    const kids = [el('div', { className: 'ko-ph' }, avatar1(p.n, p.u), el('div', { className: 'grow' }, el('b', { nt: 1, textContent: p.n }), el('small', { className: 'mut', nt: 1, textContent: ago(p.ts) })), mine ? btn('', 'trash', () => delPost(p), 'sm', 'Supprimer la publication') : null)];
    if (p.bad) kids.push(el('i', { className: 'mut', textContent: '🔒 Message illisible (clé différente ?)' }));
    if (p.x) { const big = p.x.length < 12 && /^(?:\p{Extended_Pictographic}|‍|️|\s){1,8}$/u.test(p.x); kids.push(el('div', { className: 'ko-tx chat-tx' + (big ? ' big' : ''), nt: 1 }, ...linkify(p.x))); kids.push(...chatMediaCards(p.x)); }
    if (p.md.length || p.g) kids.push(el('div', { className: 'ko-media n' + Math.min(4, p.md.length + (p.g ? 1 : 0)) }, ...p.md.map(f => mediaNode(r, f)), p.g ? imgBtn(p.g, 'GIF') : null));
    kids.push(el('div', { className: 'ko-bar' },
      el('button', { type: 'button', className: 'ko-act' + (liked ? ' on' : ''), 'aria-pressed': liked, title: tr('J’aime'), 'aria-label': tr('J’aime'), onclick: () => toggleLike(p) }, ico(liked ? 'hearton' : 'heart', 18), el('span', { nt: 1, textContent: String(likes.size) })),
      el('button', { type: 'button', className: 'ko-act' + (openC ? ' on' : ''), title: tr('Commentaires'), 'aria-label': tr('Commentaires'), onclick: async () => { if (S.openC.has(p.id)) S.openC.delete(p.id); else { S.openC.add(p.id); for (const n of (L.coms.get(p.id) || []).filter(n => !S.coms.has(n))) S.coms.set(n, await decCom(r, n)); } S.nodes.delete(p.id); draw(); } }, ico('chat', 18), el('span', { nt: 1, textContent: String(cn) }))));
    if (openC) {
      const inp = el('input', { className: 'ko-ci', placeholder: 'Écrire un commentaire…', 'aria-label': 'Écrire un commentaire', maxLength: 2000, onkeydown: e => { if (e.key === 'Enter' && !e.isComposing) sendCom(p, inp); } });
      kids.push(el('div', { className: 'ko-cs' }, ...(L.coms.get(p.id) || []).map(n => S.coms.get(n)).filter(Boolean).map(comNode), el('div', { className: 'row tight' }, inp, btn('', 'send', () => sendCom(p, inp), 'pri sm', 'Envoyer'))));
    }
    const node = el('article', { className: 'ko-post' }, ...kids); S.nodes.set(p.id, { sig, node }); return node;
  };
  const feed = el('div', { className: 'ko-feed', tabIndex: 0 }), kh = el('div', { className: 'chat-h' }), ke = el('div', { className: 'warn chat-err', hidden: true }), attBox = el('div', { className: 'ko-att' });
  const ta = el('textarea', { className: 'chat-in ko-in', rows: 2, maxLength: 5000, placeholder: 'Quoi de neuf ?', 'aria-label': 'Quoi de neuf ?' });
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'; };
  ta.oninput = grow; ta.onpaste = e => { const f = [...(e.clipboardData ? e.clipboardData.files : [])]; if (f.length) { e.preventDefault(); addFiles(f); } };
  function drawAtt() { attBox.replaceChildren(...S.att.map((a, i) => el('div', { className: 'ko-ai' }, /^image\//.test(a.mime) ? el('img', { src: a.url, alt: '' }) : el('div', { className: 'ko-av2' }, ico(/^video\//.test(a.mime) ? 'video' : 'file', 24), el('small', { nt: 1, textContent: a.name })), btn('', 'x', () => { URL.revokeObjectURL(a.url); S.att.splice(i, 1); drawAtt(); }, 'sm ko-ax', 'Retirer')))); attBox.hidden = !S.att.length; }
  const pickF = (accept, cb) => { const i = el('input', { type: 'file', accept, hidden: true, multiple: true }); i.onchange = () => { cb([...i.files]); i.remove(); }; document.body.append(i); i.click(); };
  let pop = null; const closePop = () => { if (pop) { pop.remove(); pop = null; } };
  const popup = (node, title) => { closePop(); pop = el('div', { className: 'chat-pop', onkeydown: e => { if (e.key === 'Escape') { e.stopPropagation(); closePop(); ta.focus(); } } }, chatPopHead(title, () => { closePop(); ta.focus(); }), node); comp.append(pop); };
  const emojiPop = () => {
    if (pop && pop.dataset.k === 'e') return closePop();
    let cat = 0; const grid = el('div', { className: 'chat-eg' }), tabs = el('div', { className: 'chat-et' });
    const dr = () => { tabs.replaceChildren(...CHAT_EMO.map((c, i) => el('button', { type: 'button', className: i === cat ? 'on' : '', title: tr(c[1]), 'aria-label': tr(c[1]), onclick: () => { cat = i; dr(); } }, c[0]))); grid.replaceChildren(...CHAT_EMO[cat][2].map(e => el('button', { type: 'button', textContent: e, 'aria-label': e, onclick: () => { ta.setRangeText(e, ta.selectionStart, ta.selectionEnd, 'end'); ta.focus(); grow(); } }))); };
    dr(); popup(el('div', {}, tabs, grid), 'Emojis'); pop.dataset.k = 'e';
  };
  const gifPop = () => {
    if (pop && pop.dataset.k === 'g') return closePop();
    popup(chatGifBox({ pick: async u => { closePop(); const ok = await publish(ta.value.trim(), u); if (ok) { ta.value = ''; grow(); } }, device: () => { closePop(); pickF('image/gif', addFiles); } }), 'GIF'); pop.dataset.k = 'g'; pop.classList.add('chat-popg');
  };
  const mediaPop = () => {
    if (pop && pop.dataset.k === 'm') return closePop();
    popup(chatMediaBox({ pick: items => { closePop(); chatInsertMedia(ta, items); }, close: closePop }), 'Vidéo ou musique en ligne'); pop.dataset.k = 'm'; pop.classList.add('chat-popm');
  };
  const submit = async () => { closePop(); if (S.busy) return; const ok = await publish(ta.value.trim()); if (ok) { ta.value = ''; grow(); drawAtt(); } };
  const comp = el('div', { className: 'ko-comp' }, ta, attBox,
    el('div', { className: 'chat-cb' }, btn('', 'smile', emojiPop, 'chat-ib', 'Emojis'), btn('GIF', '', gifPop, 'chat-ib chat-gif', 'GIF'), btn('Vidéo / musique', 'play', mediaPop, 'sm', 'Ajouter une vidéo ou une musique en ligne (YouTube, Dailymotion, SoundCloud…) ou depuis Playlist Medias'), btn('Photo ou vidéo', 'image', () => pickF('image/*,video/*', addFiles), 'sm', 'Ajouter des photos ou des vidéos'), btn('Caméra', 'camera', () => chatRecWin({ key: 'soc', title: 'Caméra : photo et vidéo avec effets', attach: f => addFiles([f]), attachLabel: 'Joindre à ma publication' }), 'sm', 'Photo ou vidéo avec la caméra : fonds, cadres, GIF'), btn('Fichier', 'paperclip', () => pickF('*/*', addFiles), 'sm', 'Ajouter un fichier'),
      el('span', { className: 'grow' }), btn('Publier', 'send', submit, 'pri', 'Publier')));
  chatTvEdge(ta, key => (key === 'ArrowUp' || key === 'ArrowLeft') ? (kh.querySelector('button:not(.chat-back)') || kh.querySelector('button')) : key === 'ArrowRight' ? comp.querySelector('.chat-cb button.pri') : comp.querySelector('.chat-cb button'));
  w.addEventListener('pointerdown', e => { if (pop && !pop.contains(e.target) && !e.target.closest('.chat-cb button')) closePop(); }, true);
  w.addEventListener('dragover', e => { if (S.view === 'feed') e.preventDefault(); });
  w.addEventListener('drop', e => { if (S.view !== 'feed') return; e.preventDefault(); addFiles(e.dataTransfer.files); });
  const feedV = el('div', { className: 'chat-v' }, kh, ke, el('div', { className: 'ko-scroll' }, comp, feed));
  const scroller = feedV.querySelector('.ko-scroll');

  /* ---------- zone rouge ---------- */
  const clearRoom = async (r, onlyMine) => {
    const c = chatConn(r); if (!c) throw new Error('Le cloud de cette communauté n’est plus connecté sur ce profil. Ajoutez-le dans « Stockage cloud ».');
    const all = await FS.list(c, chatPath(r)), me = chatMe().id.slice(0, 6), me12 = koMe12(); let n = 0;
    const meds = [];
    if (onlyMine) for (const e of all) { const m = KO_POST.exec(e.name); if (m && m[1].slice(14, 20) === me) { try { for (const f of media((await getJ(r, e.name)).md)) meds.push(f.r); } catch { /* illisible */ } } }
    for (const e of all) {
      if (e.dir) continue; const nm = e.name; let kill = false;
      if (!onlyMine) kill = KO_POST.test(nm) || KO_COM.test(nm) || KO_LIKE.test(nm) || KO_MED.test(nm) || KO_PRES.test(nm) || KO_SIG.test(nm);
      else { const m = KO_POST.exec(nm) || KO_COM.exec(nm); kill = (m && nm.slice(0, 2) === 'p-' && m[1].slice(14, 20) === me) || (nm.slice(0, 2) === 'c-' && m[2].slice(14, 20) === me) || (KO_LIKE.test(nm) && nm.endsWith('-' + me12 + '.l')) || meds.includes(nm); }
      if (kill) { await FS.remove(c, chatPath(r) + nm); n++; }
    }
    if (S.cur === r.id) { S.posts = new Map(); S.coms = new Map(); S.nodes = new Map(); S.sig = ''; S.imgs.forEach(u => u && URL.revokeObjectURL(u)); S.imgs.clear(); S.ip.clear(); }
    r.seen = 0; return n;
  };
  const dangerView = () => {
    const r = room(), act = (label, icon, note, fn) => el('div', { className: 'chat-red' }, el('div', { className: 'grow' }, el('b', { textContent: label }), el('small', { className: 'mut', textContent: note })), btn(label, icon, fn, 'dng pri'));
    const run = async (ask, okLabel, job, done) => { if (!await confirmBox(ask, okLabel, true)) return; const t = toast('Suppression…', 0); try { await job(); t.close(); toast(done, 5000); save(); if (S.cur && room()) await load(true); } catch (e) { t.close(); toast(errText(e), 9000); } draw(); };
    main.replaceChildren(el('div', { className: 'chat-wh' }, el('b', { textContent: 'Zone rouge' }), btn('Retour', 'back', () => { S.view = room() ? 'feed' : 'welcome'; draw(); }, 'sm')),
      el('div', { className: 'chat-wb' }, el('div', { className: 'warn', textContent: 'Actions définitives, sans retour possible. Ce qui est effacé disparaît du cloud pour tous les membres.' }),
        ...(r ? [
          act('Supprimer toutes mes publications', 'trash', tr('Supprime vos publications, commentaires, « j’aime » et fichiers dans « {0} ». Ceux des autres membres ne sont pas touchés.').replace('{0}', r.n), () => run('Supprimer toutes vos publications, commentaires et « j’aime » de cette communauté ?', 'Tout supprimer', () => clearRoom(r, true), 'Vos publications sont supprimées.')),
          act('Effacer tout l’historique de cette communauté', 'trash', tr('Supprime toutes les publications, photos, vidéos et commentaires de « {0} », pour tout le monde. La communauté reste ouverte et vide.').replace('{0}', r.n), () => run('Effacer TOUT l’historique de cette communauté, pour tout le monde ?', 'Tout effacer', () => clearRoom(r, false), 'Historique effacé.'))] : []),
        ...(koRooms().length ? [act('Effacer l’historique de toutes mes communautés', 'trash', 'Fait la même chose pour toutes les communautés de ce profil.', () => run('Effacer l’historique de TOUTES vos communautés, pour tout le monde ?', 'Tout effacer', async () => { for (const x of koRooms()) await clearRoom(x, false); }, 'Tous les historiques sont effacés.'))] : []),
        ...(r ? [act('Quitter cette communauté', 'x', 'La retire de cet appareil et de votre profil. Le contenu reste sur le cloud : vous pourrez la rejoindre de nouveau avec le code d’invitation.', async () => { if (!await confirmBox('Quitter cette communauté sur cet appareil ? Le contenu reste sur le cloud et vous pourrez la rejoindre de nouveau avec le code d’invitation.', 'Quitter', true)) return; D.soc.rooms = koRooms().filter(x => x !== r); save(); open(koRooms().length ? koRooms()[0].id : null); })] : []),
        ...(koRooms().length ? [act('Oublier toutes mes communautés', 'x', 'Retire toutes les communautés de cet appareil (clés comprises). Le cloud n’est pas modifié.', async () => { if (!await confirmBox('Retirer toutes les communautés de ce profil ? Le contenu reste sur le cloud.', 'Tout retirer', true)) return; D.soc.rooms = []; save(); open(null); })] : []),
        ...(!koRooms().length ? [el('p', { className: 'mut', textContent: 'Aucune communauté pour l’instant : rien à effacer.' })] : [])));
  };
  const menu = () => {
    const r = room(); if (!r) return;
    const act = async k => {
      if (k === 'name') { const v = await dialog('Mon nom affiché', [{ k: 'n', label: 'Votre nom affiché', value: chatName(), max: 40, req: true }], 'Enregistrer'); if (v) { D.chat.name = v.n.trim().slice(0, 40); save(); toast('Nom enregistré.'); } }
      else if (k === 'ren') { const v = await dialog('Renommer la communauté', [{ k: 'n', label: 'Nom de la communauté', value: r.n, max: 60, req: true }], 'Enregistrer'); if (v) { r.n = v.n.trim().slice(0, 60); save(); draw(); } }
      else if (k === 'inv') { S.view = 'invite'; draw(); } else if (k === 'red') { S.view = 'danger'; draw(); }
    };
    const m = el('div', { className: 'chat-menu' }, chatPopHead('Options', () => m.remove()), ...[['Inviter quelqu’un', 'link', 'inv'], ['Mon nom affiché', 'user', 'name'], ['Renommer la communauté', 'edit', 'ren'], ['Zone rouge', 'trash', 'red']].map(([l, i, k]) => el('button', { type: 'button', onclick: () => { m.remove(); act(k); } }, ico(i, 15), el('span', { textContent: l }))));
    kh.append(m); setTimeout(() => addEventListener('pointerdown', function f(e) { if (!m.contains(e.target)) { m.remove(); removeEventListener('pointerdown', f, true); } }, true), 0);
  };

  function draw() {
    if (S.dead) return;
    drawSide();
    if (S.view === 'wiz') { root.classList.add('wiz'); return; }
    root.classList.remove('wiz');
    if (S.view === 'danger') { dangerView(); return; }
    const r = room();
    if (!r || S.view === 'welcome') {
      main.replaceChildren(el('div', { className: 'chat-wel' }, ico('users', 54), el('h3', { textContent: 'Konekt' }),
        el('p', { textContent: 'Votre petit réseau social privé : publiez textes, photos et vidéos, commentez, aimez, et passez des appels vidéo ou vocaux avec votre communauté. Tout est chiffré et stocké dans le cloud WebDAV de votre choix, sans autre serveur.' }),
        el('div', { className: 'col chat-bigb' }, btn('Créer une communauté', 'plus', () => wizard('create'), 'pri'), btn('Rejoindre avec un code d’invitation', 'link', () => wizard('join')))));
      return;
    }
    if (S.view === 'invite') { main.replaceChildren(el('div', { className: 'chat-wh' }, el('b', { textContent: 'Inviter quelqu’un' }), btn('Retour', 'back', () => { S.view = 'feed'; draw(); }, 'sm')), el('div', { className: 'chat-wb' }, ...chatInviteBody(r, KO_PRE, 'Konekt', () => { S.view = 'feed'; draw(); }))); return; }
    const c = chatConn(r), L = S.listing, keep = scroller.scrollTop;
    const call = L && L.calls.size;
    kh.replaceChildren(btn('', 'menu', () => root.classList.toggle('showside'), 'chat-back sm', 'Communautés'),
      el('div', { className: 'grow' }, el('b', { nt: 1, textContent: r.n }), el('small', { className: 'mut', nt: 1, textContent: c ? (c.name || c.url) : tr('Cloud non connecté') })),
      btn('Appel vidéo', 'video', () => koCall(r, 'video'), 'sm', 'Lancer ou rejoindre un appel vidéo'), btn('Appel vocal', 'mic', () => koCall(r, 'audio'), 'sm', 'Lancer ou rejoindre un appel vocal (micro seulement)'),
      btn('Inviter', 'link', () => { S.view = 'invite'; draw(); }, 'sm'), btn('', 'more', menu, 'sm', 'Options de la communauté'));
    ke.replaceChildren(...(S.err ? [S.err, ' ', btn('Réessayer', 'refresh', () => load(true), 'sm')] : [])); ke.hidden = !S.err;
    const rows = [];
    if (call) rows.push(el('div', { className: 'ko-live' }, ico('video', 18), el('span', { className: 'grow', textContent: tr('{0} personne(s) dans un appel en ce moment.').replace('{0}', L.calls.size) }), btn('Rejoindre l’appel', 'video', () => koCall(r, 'video'), 'pri sm')));
    if (L) {
      const shown = L.posts.slice(0, S.shown);
      for (const id of shown) { const p = S.posts.get(id); if (p) rows.push(postNode(p)); }
      if (!L.posts.length) rows.push(el('div', { className: 'chat-sys', textContent: 'Aucune publication pour l’instant : soyez le premier à publier !' }));
      if (L.posts.length > S.shown) rows.push(btn('Afficher plus de publications', 'back', async () => { S.shown += KO_PAGE; await load(true); }, 'chat-more'));
    } else if (!S.err) rows.push(el('div', { className: 'chat-sys', textContent: 'Chargement…' }));
    feed.replaceChildren(...rows);
    if (main.firstChild !== feedV) main.replaceChildren(feedV);
    scroller.scrollTop = keep;
  }
  VIEWS.add(draw);
  KOWIN = { w, rec, open, cur: () => (!w.hidden && S.view === 'feed') ? S.cur : null };
  if (roomId && koRooms().some(r => r.id === roomId)) open(roomId); else if (koRooms().length) open(koRooms()[0].id); else { S.view = 'welcome'; draw(); }
}

/* ---- notifications : nouvelles publications et appels en cours (communautés non affichées), toutes les 60 s ---- */
const koNotified = new Map();
async function koBg() {
  try {
    if (typeof SESSION === 'undefined' || !SESSION || !D || !D.soc || !D.soc.rooms || !D.soc.rooms.length || document.visibilityState !== 'visible') return;
    const me = chatMe().id.slice(0, 6), curId = KOWIN ? KOWIN.cur() : null;
    for (const r of D.soc.rooms) {
      const c = chatConn(r); if (!c) continue;
      const names = (await FS.list(c, chatPath(r))).map(e => e.name);
      const calls = koPresent(names);
      if (calls.size && !(typeof KOCALL !== 'undefined' && KOCALL && KOCALL.room === r.id) && (koNotified.get('c' + r.id) || 0) < Math.max(...calls.values()) - 120000) {
        koNotified.set('c' + r.id, Date.now()); toastAct(tr('📞 Appel en cours dans « {0} »').replace('{0}', r.n), tr('Rejoindre'), () => koCall(r, 'video'), 15000);
      }
      const fresh = names.filter(n => { const m = KO_POST.exec(n); return m && +m[1].slice(0, 13) > (r.seen || 0) && m[1].slice(14, 20) !== me; });
      if (!fresh.length) { r.unread = false; continue; }
      if (curId === r.id) continue;
      r.unread = true; const top = Math.max(...fresh.map(n => +KO_POST.exec(n)[1].slice(0, 13)));
      if ((koNotified.get(r.id) || 0) < top) { koNotified.set(r.id, top); toastAct(tr('🌐 {0} nouvelle(s) publication(s) dans « {1} »').replace('{0}', fresh.length).replace('{1}', r.n), tr('Ouvrir'), () => koWin(r.id), 12000); if (typeof refresh === 'function') refresh(); }
    }
  } catch (e) { console.warn('Konekt : relecture en arrière-plan impossible', e && e.message); }
}
setInterval(koBg, 60000);
