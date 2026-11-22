'use strict';
/* sormick Cloud — interface du bureau virtuel (dépend de vault.js : comptes, chiffrement, sauvegarde).
   Règle d'or : aucune donnée utilisateur ou distante n'entre dans la page via innerHTML,
   sauf du HTML passé par clean() (liste blanche, voir l'éditeur). */

/* ===================== Utilitaires DOM ===================== */
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style') e.style.cssText = v;
    else if (k === 'list' || k.includes('-') || !(k in e)) e.setAttribute(k, v);
    else e[k] = v;
  }
  e.append(...kids.flat().filter(x => x != null && x !== false && x !== ''));
  return e;
};
const opts = (sel, items) => sel.replaceChildren(...items.map(([v, t]) => el('option', { value: v, textContent: t })));
const byName = (a, b) => a.name.localeCompare(b.name, 'fr');
const hue = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
const openTab = u => { const h = httpUrl(u); if (h) window.open(h, '_blank', 'noopener,noreferrer'); };
const fmtSize = s => (s < 1024 ? s + ' o' : s < 1048576 ? Math.round(s / 1024) + ' Ko' : (s / 1048576).toFixed(1) + ' Mo');
const ext = n => String(n).split('.').pop().toLowerCase();

/* ===================== Icônes SVG (tracés Feather, licence MIT) ===================== */
const NS = 'http://www.w3.org/2000/svg';
const IC = {
  store: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  cloud: 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z',
  music: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  image: 'M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  video: 'M23 7l-7 5 7 5zM1 5h15v14H1z',
  play: 'M6 3l14 9-14 9z', pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  prev: 'M19 20 9 12l10-8zM5 19V5', next: 'M5 4l10 8-10 8zM19 5v14',
  repeat: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  vol: 'M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  x: 'M18 6 6 18M6 6l12 12', min: 'M5 12h14', max: 'M4 4h16v16H4z', plus: 'M12 5v14M5 12h14',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  edit: 'M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  ext: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  up: 'M12 19V5M5 12l7-7 7 7',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.8-3.4L23 10M1 14l4.7 4.4A9 9 0 0 0 20.5 15',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  check: 'M20 6 9 17l-5-5',
  pin: 'M12 17v5M9 3h6l-1 7 3 3v2H7v-2l3-3z',
  note: 'M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9zM15 3v6h6M8 13h8M8 17h5',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  minus: 'M5 12h14',
  rotl: 'M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10',
  rotr: 'M23 4v6h-6M20.49 15a9 9 0 1 1-2.12-9.36L23 10',
  full: 'M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3',
  apps: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14v6M14 17h6',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  key: 'M21 2l-2 2M11.4 11.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zM11.4 11.6 15.5 7.5M15.5 7.5l3 3L22 7l-3-3',
  move: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
  cast: 'M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6M2 12a9 9 0 0 1 8 8M2 16a5 5 0 0 1 4 4M2 20h.01',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  down: 'M6 9l6 6 6-6',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'
};
const FILLED = new Set(['play', 'pause', 'prev', 'next']);
const ico = (name, size = 20) => {
  const v = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
  const at = { viewBox: '0 0 24 24', width: size, height: size, fill: FILLED.has(name) ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' };
  for (const k in at) v.setAttribute(k, at[k]);
  p.setAttribute('d', IC[name] || ''); v.append(p);
  return v;
};
const btn = (label, icon, onclick, cls = '', title) =>
  el('button', { type: 'button', className: cls, onclick, title: title || label, 'aria-label': title || label }, icon && ico(icon, 16), label && el('span', { textContent: label }));

/* ===================== Messages, dialogues ===================== */
function toast(msg, ms = 3500) {
  const t = el('div', { className: 'ts', textContent: msg }); $('#toast').append(t);
  const h = ms && setTimeout(() => t.remove(), ms);
  return { e: t, set: m => { t.textContent = m; }, close: () => { clearTimeout(h); t.remove(); } };
}
/* dialog(titre, champs, libellé OK, options) → Promise<valeurs | null> */
function dialog(title, fields = [], ok = 'OK', o = {}) {
  return new Promise(res => {
    const prev = document.activeElement, inputs = {};
    const done = v => { ov.remove(); if (prev && prev.focus) prev.focus(); res(v); };
    const submit = () => {
      const v = {};
      for (const f of fields) {
        v[f.k] = inputs[f.k].value;
        if (f.req && !String(v[f.k]).trim()) { toast(f.label + ' requis.'); inputs[f.k].focus(); return; }
      }
      const m = o.check && o.check(v); if (m) return toast(m);
      done(v);
    };
    const rows = fields.map(f => {
      const i = f.type === 'select' ? el('select') : f.type === 'textarea' ? el('textarea', { rows: 6, maxLength: f.max || 2000, placeholder: f.ph || '' }) : el('input', { type: f.type || 'text', placeholder: f.ph || '', maxLength: f.max || 200, autocomplete: f.type === 'password' ? 'new-password' : 'off' });
      if (f.type === 'select') opts(i, f.options);
      if (f.value != null) i.value = f.value;
      i.onkeydown = e => { if (e.key === 'Enter' && f.type !== 'textarea') submit(); };
      inputs[f.k] = i;
      return el('label', { className: 'fld' }, el('span', { textContent: f.label }), i);
    });
    const ov = el('div', { className: 'ov', onkeydown: e => { if (e.key === 'Escape') done(null); } },
      el('div', { className: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        el('h3', { textContent: title }), o.note && el('p', { className: 'mut', textContent: o.note }), ...rows,
        el('div', { className: 'row end' }, btn('Annuler', '', () => done(null)), btn(ok, '', submit, o.danger ? 'dng pri' : 'pri'))));
    document.body.append(ov);
    (Object.values(inputs)[0] || ov.querySelector('.pri')).focus();
  });
}
function toastAct(msg, label, fn, ms = 9000) {   // message avec un bouton d'action
  const t = toast(msg, ms); t.e.append(' ', el('button', { type: 'button', className: 'ta', textContent: label, onclick: () => { t.close(); fn(); } })); return t;
}
const confirmBox = async (note, ok = 'Confirmer', danger = false) => !!(await dialog('Confirmation', [], ok, { note, danger }));
function download(blob, name) {
  const u = URL.createObjectURL(blob), a = el('a', { href: u, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
}

/* ===================== Fenêtres ===================== */
let Z = 10; const WINS = new Set(), VIEWS = new Set();
const refresh = () => VIEWS.forEach(f => f());
const closeAll = () => [...WINS].forEach(r => r.close());
function win(title, icon, body, o = {}) {
  const w = el('div', { className: 'win', role: 'dialog', 'aria-label': title });
  const front = () => { w.style.zIndex = ++Z; };
  const task = el('button', { type: 'button', className: 'tk', onclick: () => { w.hidden = false; front(); } }, ico(icon, 16), el('span', { textContent: title }));
  const rec = { w, close() {
    if (!WINS.has(rec)) return;
    WINS.delete(rec);
    try { o.onclose && o.onclose(); } catch (e) { console.error(e); }
    w.remove(); task.remove();
  } };
  const tb = el('div', { className: 'tb' }, ico(icon, 16), el('span', { className: 'tt', textContent: title }));
  const wc = (name, label, f, cls = '') => tb.append(el('button', { type: 'button', className: 'wc ' + cls, title: label, 'aria-label': label, onclick: e => { e.stopPropagation(); f(); } }, ico(name, 16)));
  wc('min', 'Réduire', () => { w.hidden = true; }); wc('max', 'Agrandir', () => w.classList.toggle('max')); wc('x', 'Fermer', rec.close, 'cl');
  tb.onpointerdown = e => {
    if (e.target.closest('button') || w.classList.contains('max')) return;
    front(); tb.setPointerCapture(e.pointerId);
    const dx = e.clientX - w.offsetLeft, dy = e.clientY - w.offsetTop;
    tb.onpointermove = m => { w.style.left = Math.max(-200, m.clientX - dx) + 'px'; w.style.top = Math.max(0, m.clientY - dy) + 'px'; };
    tb.onpointerup = () => { tb.onpointermove = null; };
  };
  // Toujours centrée dans le bureau ; décalée en cascade seulement si une autre fenêtre occupe exactement la même place.
  const dk = $('#desk'), dw = dk.clientWidth || innerWidth, dh = dk.clientHeight || innerHeight - 70;
  const W = Math.min(o.w || 560, dw - 12), H = Math.min(o.h || 420, dh - 12);
  let L = Math.round((dw - W) / 2), T = Math.round((dh - H) / 2);
  for (let k = 0; k < 8 && [...WINS].some(r => !r.w.hidden && Math.abs(r.w.offsetLeft - L) < 6 && Math.abs(r.w.offsetTop - T) < 6); k++) { L += 30; T += 30; }
  L = Math.max(0, Math.min(L, dw - W)); T = Math.max(0, Math.min(T, dh - H));
  w.style.cssText = `left:${L}px;top:${T}px;width:${W}px;height:${H}px`;
  w.onpointerdown = front;
  if (o.cls) w.classList.add(o.cls);
  w.append(tb, el('div', { className: 'bd' }, ...body));
  if (o.max || innerWidth < 700) w.classList.add('max');
  front(); $('#desk').append(w); $('#tasks').append(task); WINS.add(rec);
  w.close = rec.close;
  return w;
}

/* ===================== Fond d'écran (par utilisateur) ===================== */
const FALLBACK = 'linear-gradient(135deg,#0f1b2d,#2b3a67 60%,#f2b134 160%)';
const PRESETS = [FALLBACK, 'linear-gradient(160deg,#1d3b2f,#0b1d2a)', 'linear-gradient(200deg,#4a1d3d,#14213d)', 'linear-gradient(#101418,#101418)'];
const safeImg = v => {
  if (typeof v !== 'string') return '';
  if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)) return v;
  return (/^https:\/\//i.test(v) && httpUrl(v)) || '';
};
function wpLayers(wp) {
  if (wp.t === 'p') return { img: PRESETS[wp.v] || FALLBACK, size: 'cover' };
  if (wp.t === 'u') {
    const s = safeImg(wp.v);
    if (s) return { img: `url("${s.replace(/["\\\n\r]/g, c => encodeURIComponent(c))}"), ${FALLBACK}`, size: `${wp.fit}, cover` };
  }
  // Fond par défaut : le fichier wallpaper.jpg à la racine du dépôt (dégradé si le fichier est absent)
  return { img: `url("wallpaper.jpg"), ${FALLBACK}`, size: 'cover, cover' };
}
function applyWp() {
  const l = wpLayers(D ? D.wp : { t: 'd' });
  for (const e of [$('#desk'), $('#login')]) {
    e.style.backgroundImage = l.img; e.style.backgroundSize = l.size;
    e.style.backgroundPosition = 'center'; e.style.backgroundRepeat = 'no-repeat';
  }
}
function wpWin() {
  const fit = el('select'); opts(fit, [['cover', 'Remplir'], ['contain', 'Contenir'], ['100% 100%', 'Étirer']]); fit.value = D.wp.fit;
  const set = (t, v) => { D.wp = { t, v, fit: fit.value }; save(); applyWp(); };
  fit.onchange = () => { D.wp.fit = fit.value; save(); applyWp(); };
  const url = el('input', { placeholder: 'https://… adresse d’une image' });
  const pick = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', hidden: true });
  pick.onchange = () => {
    const f = pick.files[0]; pick.value = '';
    if (!f) return;
    if (f.size > 1.5e6) return toast('Image de 1,5 Mo maximum (sinon, utilisez une adresse https).', 5000);
    const r = new FileReader(); r.onload = () => set('u', r.result); r.readAsDataURL(f);
  };
  win('Fond d’écran', 'image', [
    el('div', { className: 'row' }, btn('Par défaut', 'image', () => set('d', 0), 'pri'), ...PRESETS.map((_, i) => btn('Thème ' + (i + 1), '', () => set('p', i)))),
    el('div', { className: 'row' }, url, btn('Appliquer', 'check', () => { const h = /^https:\/\//i.test(url.value.trim()) && httpUrl(url.value.trim()); h ? set('u', h) : toast('Adresse https invalide.'); })),
    el('div', { className: 'row' }, btn('Importer une image…', 'upload', () => pick.click()), pick), el('div', { className: 'row' }, el('span', { className: 'mut', textContent: 'Ajustement :' }), fit),
    el('small', { className: 'mut', textContent: 'Le fond est enregistré dans votre profil chiffré.' })], { w: 440, h: 280 });
}

/* ===================== Applications (catalogue de l'App Store : propre à chaque utilisateur, non chiffré) ===================== */
/* Applications intégrées : toujours présentes dans « Mes apps » (pas dans l'App Store), impossibles à supprimer ou à modifier (elles ne sont pas dans le catalogue). */
const BUILTIN_CAT = 'Applications intégrées';
const BUILTIN = [
  { id: 'b:music', name: 'Lecteur de musique', icon: 'music', c: ['#ff77a4', '#c13fd8'], cat: BUILTIN_CAT, desc: 'Écoutez vos musiques depuis cet appareil ou votre WebDAV : playlists, boucle, aléatoire, liste modifiable.', run: () => openPlayer() },
  { id: 'b:video', name: 'Lecteur vidéo', icon: 'video', c: ['#ff9966', '#e8452c'], cat: BUILTIN_CAT, desc: 'Regardez vos vidéos (appareil ou WebDAV, lecture en continu) avec sous-titres : vos fichiers .srt/.vtt ou recherche OpenSubtitles.', run: () => videoWin() },
  { id: 'b:docs', name: 'Lecteur de documents', icon: 'file', c: ['#4cd08a', '#1f9d6a'], cat: BUILTIN_CAT, desc: 'Lisez PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), OpenDocument et fichiers texte, depuis cet appareil ou votre WebDAV.', run: () => docWin() },
  { id: 'b:images', name: 'Visionneuse d’images', icon: 'image', c: ['#35c8ea', '#3a7bd5'], cat: BUILTIN_CAT, desc: 'Parcourez vos images (appareil ou WebDAV) : zoom, rotation, diaporama, plein écran.', run: () => imageWin() },
  { id: 'b:cloud', name: 'Stockage cloud', icon: 'cloud', c: ['#35c8ea', '#3a7bd5'], cat: BUILTIN_CAT, desc: 'Connectez vos stockages WebDAV (adresse, utilisateur, mot de passe), parcourez-les, créez des dossiers, supprimez des fichiers.', run: () => connWin() },
  { id: 'b:editor', name: 'Éditeur de texte', icon: 'file', c: ['#4cd08a', '#1f9d6a'], cat: BUILTIN_CAT, desc: 'Écrivez et modifiez des textes enrichis, enregistrés dans votre profil ou sur votre WebDAV.', run: () => editor('sans-titre.txt', { text: '' }, null) },
  { id: 'b:vplay', name: 'Playlist vidéos', icon: 'list', c: ['#ff6b6b', '#c0392b'], cat: BUILTIN_CAT, desc: 'Gardez les liens directs de vos vidéos (n’importe quel site) avec leur miniature et une catégorie. Un clic sur la miniature ouvre la vidéo dans un nouvel onglet. Recherche rapide.', run: () => videoPlaylistWin() },
  { id: 'b:notes', name: 'Post-it', icon: 'note', c: ['#ffd84d', '#f0a21a'], cat: BUILTIN_CAT, desc: 'Notes rapides, redimensionnables, épinglables sur le bureau (5 au maximum).', run: () => notesWin() }
];
const connApp = id => {   // raccourci de bureau vers un stockage WebDAV (identifiant « c:<id de la connexion> »)
  if (!D || !id.startsWith('c:')) return null; const c = D.conns.find(x => 'c:' + x.id === id);
  return c ? { id, name: c.name, ...(c.img ? { img: c.img } : { icon: 'cloud', c: ['#35c8ea', '#3a7bd5'] }), cat: 'Stockage', desc: 'Ouvre le stockage WebDAV « ' + c.name + ' ».', run: () => explorer(c) } : null;
};
const connIcon = (c, s) => appIcon(c.img ? { name: c.name, img: c.img } : { name: c.name, icon: 'cloud', c: ['#35c8ea', '#3a7bd5'] }, s);
const appById = id => BUILTIN.find(a => a.id === id) || G.apps.find(a => a.id === id) || connApp(id);
const BLOCKERS = ['google.com', 'google.fr', 'youtube.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'github.com', 'linkedin.com', 'netflix.com', 'amazon.com', 'amazon.fr', 'microsoft.com', 'live.com', 'office.com', 'outlook.com', 'reddit.com', 'wikipedia.org', 'whatsapp.com', 'spotify.com', 'paypal.com', 'apple.com', 'dropbox.com'];
const MODE_LBL = { auto: 'Auto', win: 'Fenêtre', tab: 'Onglet' };
const blocksFraming = u => { try { const h = new URL(u).hostname; return BLOCKERS.some(d => h === d || h.endsWith('.' + d)); } catch { return false; } };

function appIcon(a, size = 48) {
  if (a.icon) return el('span', { className: 'aic', style: `width:${size}px;height:${size}px;background:linear-gradient(145deg,${a.c[0]},${a.c[1]});color:#fff` }, ico(a.icon, Math.round(size * 0.52)));
  const box = el('span', { className: 'aic', style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px` });
  const letter = () => { box.replaceChildren((a.name || '?').trim().charAt(0).toUpperCase()); box.style.background = `hsl(${hue(a.name || '')} 55% 42%)`; };
  const src = safeImg(a.img);
  if (src) { const im = el('img', { alt: '', referrerPolicy: 'no-referrer', loading: 'lazy', onerror: letter }); im.src = src; box.append(im); } else letter();
  return box;
}
const avatar = (u, s) => {
  const av = u.av || '', base = `width:${s}px;height:${s}px;font-size:${Math.round(s * 0.42)}px;`;
  if (av.startsWith('data:image/')) return el('span', { className: 'av', style: base }, el('img', { src: av, alt: '' }));
  if (av.startsWith('e:')) return el('span', { className: 'av', style: base + `font-size:${Math.round(s * 0.55)}px;background:hsl(${hue(av)} 60% 38%)`, textContent: av.slice(2) });
  return el('span', { className: 'av', style: base + `background:hsl(${hue(u.name)} 55% 42%)`, textContent: u.name.charAt(0).toUpperCase() });
};
/* Choix d'avatar : emojis proposés, initiale, ou photo importée (recadrée au centre, réduite à 96×96 en JPEG). */
function avatarPicker(cur, getName) {
  let val = normAv(cur); const prev = el('div', { className: 'row center' }), grid = el('div', { className: 'grid', role: 'radiogroup', 'aria-label': 'Avatar' });
  const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
  const draw = () => {
    prev.replaceChildren(avatar({ name: getName() || '?', av: val }, 72));
    [...grid.children].forEach(b => b.classList.toggle('on', b.dataset.v === val)); grid.setAttribute('data-v', val ? '1' : '');
  };
  const set = v => { val = v; draw(); };
  grid.append(el('button', { type: 'button', 'data-v': '', title: 'Initiale du nom', 'aria-label': 'Initiale du nom', onclick: () => set('') }, avatar({ name: getName() || '?', av: '' }, 40)),
    ...AV_PRESETS.map(e => el('button', { type: 'button', 'data-v': 'e:' + e, title: e, 'aria-label': 'Avatar ' + e, onclick: () => set('e:' + e) }, avatar({ name: '', av: 'e:' + e }, 40))));
  file.onchange = async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    try {
      if (!/^image\//.test(f.type) || f.size > 12e6) throw new Error('Choisissez une image (12 Mo maximum).');
      const bm = await createImageBitmap(f), c = el('canvas', { width: 96, height: 96 }), g = c.getContext('2d'), s = Math.min(bm.width, bm.height);
      g.fillStyle = '#fff'; g.fillRect(0, 0, 96, 96); g.drawImage(bm, (bm.width - s) / 2, (bm.height - s) / 2, s, s, 0, 0, 96, 96); bm.close && bm.close();
      let q = 0.85, url = c.toDataURL('image/jpeg', q); while (url.length > 30000 && q > 0.3) { q -= 0.15; url = c.toDataURL('image/jpeg', q); }
      if (!normAv(url)) throw new Error('Image non utilisable.'); set(url);
    } catch (e) { toast(e.message || 'Image non utilisable.', 4000); }
  };
  const node = el('div', { className: 'avp' }, prev, grid, el('div', { className: 'row center' }, btn('Importer une photo…', 'image', () => file.click()), file));
  draw(); return { node, get: () => val, refresh: draw };
}

/* Détection de l'icône du site : /favicon.ico du site, puis (si autorisé) le service d'icônes DuckDuckGo. */
const probe = src => new Promise(res => {
  const i = new Image(), t = setTimeout(() => res(false), 5000);
  i.referrerPolicy = 'no-referrer';
  i.onload = () => { clearTimeout(t); res(i.naturalWidth > 1); };
  i.onerror = () => { clearTimeout(t); res(false); };
  i.src = src;
});
async function detectIcon(url) {
  const x = new URL(url), c = [];
  if (x.protocol === 'https:') c.push(x.origin + '/favicon.ico');
  if (D.ddg) c.push('https://icons.duckduckgo.com/ip3/' + x.hostname + '.ico');
  for (const s of c) if (await probe(s)) return s;
  return '';
}
const shrink = (f, s) => new Promise((ok, ko) => {   // image importée → PNG carré réduit
  const u = URL.createObjectURL(f), i = new Image();
  i.onload = () => {
    const c = el('canvas', { width: s, height: s }), k = Math.min(s / i.width, s / i.height), w = i.width * k, h = i.height * k;
    c.getContext('2d').drawImage(i, (s - w) / 2, (s - h) / 2, w, h); URL.revokeObjectURL(u); ok(c.toDataURL('image/png'));
  };
  i.onerror = () => { URL.revokeObjectURL(u); ko(new Error('illisible')); };
  i.src = u;
});

function renderDesk() {
  const box = $('#icons'); box.replaceChildren();
  for (const id of D.desk) {
    const a = appById(id); if (!a) continue;
    box.append(el('div', { className: 'ic', title: a.name + (a.desc ? ' — ' + a.desc : '') },
      el('button', { type: 'button', className: 'o', 'aria-label': 'Ouvrir ' + a.name, onclick: e => { if (e.detail === 0 || matchMedia('(pointer:coarse)').matches) launch(a); }, ondblclick: () => launch(a) }, appIcon(a, 56), el('span', { textContent: a.name })),
      el('button', { type: 'button', className: 'x', title: 'Retirer du bureau (reste dans l’App Store)', 'aria-label': 'Retirer ' + a.name + ' du bureau', onclick: () => toggleDesk(a) }, ico('x', 12))));
  }
}
function toggleDesk(a) {
  D.desk = D.desk.includes(a.id) ? D.desk.filter(x => x !== a.id) : [...D.desk, a.id];
  save(); renderDesk(); refresh();
}
/* Ouverture d'une app. Mode « auto » : un navigateur ne peut pas lire les en-têtes X-Frame-Options / CSP d'un autre site,
   donc la détection repose sur (1) une liste de sites connus pour refuser l'intégration, (2) les sites que vous avez
   déjà basculés en onglet, (3) le protocole http. Dans tous les cas, les deux choix restent proposés. */
const hostOf = u => { try { return new URL(u).hostname; } catch { return ''; } };
function launch(a) {
  if (a.run) return a.run();
  if (a.mode === 'tab') return openTab(a.url);
  if (new URL(a.url).protocol === 'http:' && location.protocol === 'https:') { toastAct('Site en http : ouvert dans un nouvel onglet (non intégrable).', 'Essayer dans le bureau', () => openInWindow(a)); return openTab(a.url); }
  if (a.mode !== 'win' && !D.proxy && (blocksFraming(a.url) || D.tabHosts.includes(hostOf(a.url)))) {
    toastAct(a.name + ' n’autorise pas l’affichage intégré : ouvert dans un nouvel onglet.', 'Essayer dans le bureau', () => openInWindow(a)); return openTab(a.url);
  }
  return openInWindow(a);
}
async function openInWindow(a) {
  let src = a.url, sandbox = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-downloads', proxied = false;
  if (D.proxy) {   // passerelle facultative : détecte le blocage et relaie la page si besoin
    try {
      const r = await (await api('/api/open', { url: a.url })).json();
      if (!r.proxiable) return openTab(a.url);
      if (!r.embeddable) { src = D.proxy + r.path; sandbox = 'allow-scripts allow-forms allow-popups'; proxied = true; }
    } catch { /* passerelle injoignable : tentative directe */ }
  }
  const f = el('iframe', { sandbox, referrerPolicy: 'no-referrer', title: a.name }); f.src = src;
  const onMsg = async e => {
    if (!proxied || e.source !== f.contentWindow) return;
    const h = httpUrl(e.data && e.data.vdNav); if (!h) return;
    try { const r = await (await api('/api/open', { url: h })).json(); r.proxiable ? (f.src = r.embeddable ? h : D.proxy + r.path) : openTab(h); } catch { openTab(h); }
  };
  addEventListener('message', onMsg);
  const host = hostOf(a.url);
  const w = win(a.name, 'globe', [
    el('div', { className: 'row' }, btn('Ouvrir dans un onglet', 'ext', () => openTab(a.url)), btn('Recharger', 'refresh', () => { f.src = src; }),
      btn('Toujours dans un onglet', 'pin', () => { if (!D.tabHosts.includes(host)) D.tabHosts.push(host); save(); w.close(); openTab(a.url); toast(host + ' s’ouvrira désormais dans un nouvel onglet.', 5000); }, '', 'Ouvrir ce site dans un onglet à chaque fois'),
      el('small', { className: 'mut', textContent: 'Page vide ou refusée ? Ce site interdit l’affichage intégré : choisissez l’onglet.' })), f],
    { w: 760, h: 520, max: true, onclose: () => removeEventListener('message', onMsg) });
}

function storeWin() {
  let edit = null, ic = { img: '', custom: false };
  const n = el('input', { placeholder: 'Nom de l’application', maxLength: 40 });
  const u = el('input', { placeholder: 'https://exemple.com', maxLength: 500 });
  const lid = 'cats' + uid().slice(0, 6), cat = el('input', { placeholder: 'Catégorie (ex. Bureautique)', maxLength: 30, list: lid }), dl = el('datalist', { id: lid });
  const desc = el('textarea', { placeholder: 'Description (facultatif)', maxLength: 240, rows: 2 });
  const mode = el('select', { 'aria-label': 'Mode d’ouverture' }); opts(mode, [['auto', 'Ouverture : automatique (recommandé)'], ['win', 'Ouverture : toujours dans le bureau'], ['tab', 'Ouverture : toujours dans un onglet']]); mode.value = 'auto';
  const kind = el('select', { 'aria-label': 'Type d’application' }); opts(kind, [['app', 'Type : application (Mes apps)'], ['ai', 'Type : application IA (bouton IA)']]); kind.value = 'app';
  const prev = el('div', { className: 'pv' }), hint = el('small', { className: 'mut' }), fhint = el('small', { className: 'mut' });
  const pick = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
  const q = el('input', { type: 'search', placeholder: 'Rechercher une application…' }), list = el('div', { className: 'col' });
  const drawPrev = () => prev.replaceChildren(appIcon({ name: n.value || '?', img: ic.img }, 56), el('small', { className: 'mut', textContent: ic.img ? (ic.custom ? 'Icône personnalisée' : 'Icône du site') : 'Aucune icône : une lettre sera utilisée' }));
  const detect = async () => {
    const h = httpUrl(u.value.trim()); if (!h) return toast('Saisissez d’abord une adresse valide.');
    hint.textContent = 'Recherche de l’icône…'; ic = { img: await detectIcon(h), custom: false }; drawPrev();
    hint.textContent = ic.img ? '' : 'Aucune icône trouvée : importez la vôtre.';
  };
  u.onchange = async () => {
    const h = httpUrl(u.value.trim()); if (!h) return;
    fhint.textContent = blocksFraming(h) ? 'Ce site interdit en général l’affichage dans une fenêtre : en mode automatique, il s’ouvrira dans un nouvel onglet.' : '';
    if (!ic.custom) await detect();
  };
  n.oninput = drawPrev;
  pick.onchange = async () => {
    const f = pick.files[0]; pick.value = ''; if (!f) return;
    if (f.size > 3e6) return toast('Image trop lourde (3 Mo maximum).');
    try { ic = { img: await shrink(f, 80), custom: true }; drawPrev(); } catch { toast('Image illisible.'); }
  };
  const reset = () => { edit = null; ic = { img: '', custom: false }; n.value = u.value = cat.value = desc.value = ''; mode.value = 'auto'; kind.value = 'app'; hint.textContent = fhint.textContent = ''; drawPrev(); formBox.open = false; };
  const fill = a => {
    edit = a; n.value = a.name; u.value = a.url; cat.value = a.cat; desc.value = a.desc; mode.value = a.mode; kind.value = a.ai ? 'ai' : 'app';
    ic = { img: a.img, custom: a.img.startsWith('data:') }; drawPrev(); formBox.open = true; n.focus();
  };
  const saveApp = () => {
    const h = httpUrl(u.value.trim()), name = n.value.trim();
    if (!name || !h) return toast('Nom et adresse http(s) valides requis.');
    const d = { name, url: h, cat: cat.value.trim(), desc: desc.value.trim(), mode: ['win', 'tab'].includes(mode.value) ? mode.value : 'auto', img: ic.img, ai: kind.value === 'ai' };
    if (edit) Object.assign(edit, d); else G.apps.push({ id: uid(), ...d });
    if (!saveG()) return;
    reset(); renderDesk(); refresh(); toast('Application enregistrée.');
  };
  const delApp = async a => {
    if (!(await confirmBox('Supprimer « ' + a.name + ' » ? Elle disparaîtra de l’App Store, de « Mes apps » et du bureau de tous les utilisateurs.', 'Supprimer', true))) return;
    G.apps = G.apps.filter(x => x !== a); D.desk = D.desk.filter(x => x !== a.id); saveG(); save(); renderDesk(); refresh();
  };
  const card = a => {
    const on = D.desk.includes(a.id);
    return el('div', { className: 'card' }, appIcon(a, 48), el('div', { className: 'grow' },
      el('div', { className: 'row tight' }, el('b', { textContent: a.name }), el('span', { className: 'chip', textContent: a.cat || 'Sans catégorie' }), a.ai ? el('span', { className: 'chip', textContent: 'IA' }) : null, el('span', { className: 'chip', textContent: MODE_LBL[a.mode] || 'Auto' })),
      a.desc && el('div', { className: 'mut', textContent: a.desc }),
      el('div', { className: 'row tight' }, btn('Lancer', 'play', () => launch(a), 'pri'), btn(on ? 'Retirer du bureau' : 'Mettre sur le bureau', on ? 'x' : 'plus', () => toggleDesk(a)), btn('Modifier', 'edit', () => fill(a)), btn('Supprimer', 'trash', () => delApp(a), 'dng'))));
  };
  const draw = () => {
    dl.replaceChildren(...[...new Set(G.apps.map(a => a.cat).filter(Boolean))].map(c => el('option', { value: c })));
    const s = q.value.toLowerCase(), items = [...G.apps.filter(a => !s || (a.name + ' ' + a.cat + ' ' + a.desc).toLowerCase().includes(s)).sort(byName)];
    list.replaceChildren(...(items.length ? items.map(card) : [el('p', { className: 'mut', textContent: G.apps.length ? 'Aucun résultat.' : 'Aucune application. Ouvrez « Ajouter une application » ci-dessus pour créer le premier raccourci.' })]));
  };
  q.oninput = draw; VIEWS.add(draw);
  const formBox = el('details', { className: 'frm', open: true }, el('summary', { textContent: 'Ajouter ou modifier une application' }), el('div', { className: 'col' },
    el('div', { className: 'fgrid' }, n, u), el('div', { className: 'fgrid' }, cat, mode), kind, dl, desc,
    el('div', { className: 'row' }, prev, btn('Détecter l’icône', 'search', detect), btn('Mon icône…', 'upload', () => pick.click()), btn('Effacer', 'x', () => { ic = { img: '', custom: false }; drawPrev(); }), pick), hint, fhint,
    el('div', { className: 'row end' }, btn('Annuler', '', reset), btn('Enregistrer', 'save', saveApp, 'pri'))));
  drawPrev(); formBox.open = false;
  const logo = el('div', { className: 'slogo', role: 'img', 'aria-label': 'App Store Sormick' }, el('span', { className: 'sli' }, ico('store', 34)),
    el('span', { className: 'slt' }, el('b', { textContent: 'App Store' }), el('span', { textContent: 'Sormick' })), el('span', { className: 'sls', textContent: 'Ajoutez des applications à votre bureau' }));
  win('App Store', 'store', [logo, el('div', { className: 'row' }, btn('Ajouter une application', 'plus', () => { formBox.open = true; n.focus(); }, 'pri'), q), formBox, list], { w: 760, h: 600, max: true, cls: 'store', onclose: () => VIEWS.delete(draw) });
  draw();
}

/* Fenêtre de raccourcis web : « Mes apps » (hors IA) et « IA » (applications IA seulement) — mêmes modes d'ouverture (bureau / onglet). */
function listWin(title, icon, pred, empty, builtin) {
  const q = el('input', { type: 'search', placeholder: 'Rechercher…' }), box = el('div', { className: 'col' });
  const row = a => el('div', { className: 'card click', tabIndex: 0, role: 'button', onclick: () => launch(a), onkeydown: e => { if (e.key === 'Enter') launch(a); } },
    appIcon(a, 44), el('div', { className: 'grow' },
      el('div', { className: 'row tight' }, el('b', { textContent: a.name }), el('span', { className: 'chip', textContent: MODE_LBL[a.mode] || 'Auto' })),
      el('div', { className: 'mut', textContent: a.desc || 'Aucune description.' })),
    btn('Lancer', 'play', e => { e.stopPropagation(); launch(a); }, 'pri'));
  const draw = () => {
    const s = q.value.toLowerCase(), groups = new Map(), mine = G.apps.filter(pred);
    for (const a of mine) {
      if (s && !(a.name + ' ' + a.cat + ' ' + a.desc).toLowerCase().includes(s)) continue;
      const k = a.cat || 'Sans catégorie'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a);
    }
    const bi = builtin ? BUILTIN.filter(a => !s || (a.name + ' ' + a.desc).toLowerCase().includes(s)) : [];
    const rank = k => k === 'Sans catégorie' ? 1 : 0, keys = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'fr'));
    const brow = a => { const on = D.desk.includes(a.id); return el('div', { className: 'card click', tabIndex: 0, role: 'button', onclick: () => launch(a), onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) launch(a); } },
      appIcon(a, 44), el('div', { className: 'grow' }, el('div', { className: 'row tight' }, el('b', { textContent: a.name }), el('span', { className: 'chip', textContent: 'Non supprimable' })), el('div', { className: 'mut', textContent: a.desc }),
        el('div', { className: 'row tight' }, btn('Lancer', 'play', e => { e.stopPropagation(); launch(a); }, 'pri'), btn(on ? 'Retirer du bureau' : 'Raccourci sur le bureau', on ? 'x' : 'plus', e => { e.stopPropagation(); toggleDesk(a); })))); };
    box.replaceChildren(...(keys.length ? keys.map(k => el('details', { className: 'grp', open: true },
      el('summary', {}, el('span', { textContent: k }), el('span', { className: 'chip', textContent: groups.get(k).length })), ...groups.get(k).sort(byName).map(row)))
      : bi.length && !mine.length && !s ? [el('p', { className: 'mut', textContent: empty })] : bi.length ? [] : [el('p', { className: 'mut', textContent: mine.length ? 'Aucun résultat.' : empty })]),
      ...(bi.length ? [el('details', { className: 'grp', open: true }, el('summary', {}, el('span', { textContent: 'Applications intégrées' }), el('span', { className: 'chip', textContent: bi.length })), ...bi.map(brow))] : []));   // raccourcis web en haut, applications intégrées en bas
  };
  q.oninput = draw; VIEWS.add(draw);
  win(title, icon, [q, box], { w: 560, h: 520, max: true, onclose: () => VIEWS.delete(draw) });
  draw();
}
const myApps = () => listWin('Mes apps', 'grid', a => !a.ai, 'Aucun raccourci web : ajoutez-en dans l’App Store.', true);
const aiApps = () => listWin('Applications IA', 'spark', a => a.ai, 'Aucune application IA : ajoutez-en dans l’App Store (choisissez le type « application IA »).');

/* Lecteurs WebDAV : accès rapide à vos stockages connectés + ajout d'un nouveau lecteur. */
function drivesWin() {
  const box = el('div', { className: 'col' });
  const draw = () => box.replaceChildren(...(D.conns.length ? D.conns.map(c => { const a = connApp('c:' + c.id), on = D.desk.includes(a.id);
    return el('div', { className: 'card click', tabIndex: 0, role: 'button', onclick: () => explorer(c), onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) explorer(c); } }, connIcon(c, 44),
      el('div', { className: 'grow' }, el('b', { textContent: c.name }), el('div', { className: 'mut', textContent: c.url + ' · ' + c.user }),
        el('div', { className: 'row tight' }, btn('Ouvrir', 'folder', e => { e.stopPropagation(); explorer(c); }, 'pri'),
          btn(on ? 'Retirer du bureau' : 'Raccourci sur le bureau', on ? 'x' : 'plus', e => { e.stopPropagation(); toggleDesk(a); }),
          btn('Site du fournisseur', 'ext', e => { e.stopPropagation(); openProvider(c); }, '', 'Ouvrir le site officiel de ce fournisseur dans un nouvel onglet')))); })
    : [el('p', { className: 'mut', textContent: 'Aucun lecteur WebDAV connecté : ajoutez-en un avec le bouton ci-dessus.' })]));
  VIEWS.add(draw);
  win('Lecteurs WebDAV', 'cloud', [el('div', { className: 'row' }, btn('Ajouter un lecteur WebDAV', 'plus', () => connWin(true), 'pri', 'Connecter un nouveau lecteur WebDAV (adresse, utilisateur, mot de passe)'), btn('Gérer / Relais', 'sliders', () => connWin())), box], { w: 600, h: 500, onclose: () => VIEWS.delete(draw) });
  draw();
}

/* Menu contextuel du bureau (clic droit) */
function ctxMenu(x, y, items) {
  document.querySelectorAll('.ctx').forEach(m => m.remove());
  const m = el('div', { className: 'ctx', role: 'menu' }, ...items.map(it => it === '-' ? el('hr') : el('button', { type: 'button', role: 'menuitem', onclick: () => { close(); it[2](); } }, ico(it[1], 16), el('span', { textContent: it[0] }))));
  const away = e => { if (!m.contains(e.target)) close(); }, key = e => { if (e.key === 'Escape') close(); };
  const close = () => { m.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', key, true); };
  document.body.append(m);
  m.style.left = Math.max(4, Math.min(x, innerWidth - m.offsetWidth - 4)) + 'px'; m.style.top = Math.max(4, Math.min(y, innerHeight - m.offsetHeight - 70)) + 'px';
  addEventListener('pointerdown', away, true); addEventListener('keydown', key, true); m.querySelector('button').focus();
}
function deskMenu(e) {
  if (!D || e.target.closest('.win,.pn,.ic,.ctx')) return;
  e.preventDefault();
  ctxMenu(e.clientX, e.clientY, [['Mes apps', 'grid', myApps], ['Applications IA', 'spark', aiApps], ['Lecteurs WebDAV', 'cloud', drivesWin], ['Post-it', 'note', () => notesWin()], ['Tutoriel (PDF)', 'book', () => tutoOpen()], '-',
    ['Ajouter une application (App Store)…', 'store', storeWin], ['Ajouter un lecteur WebDAV…', 'plus', () => connWin(true)], ['Relais…', 'key', relayWin], '-', ['Fond d’écran…', 'image', wpWin], ['Réglages', 'sliders', settings]]);
}

/* ===================== Passerelle facultative (sites bloquant les iframes, WebDAV sans CORS) ===================== */
async function api(path, body) {
  if (!D.proxy) throw new Error('Passerelle non configurée (Réglages).');
  const r = await fetch(D.proxy + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': D.ptoken || '' }, body: JSON.stringify(body), credentials: 'omit', referrerPolicy: 'no-referrer' })
    .catch(() => { throw new Error('Passerelle injoignable.'); });
  if (!r.ok) throw new Error('Passerelle : erreur ' + r.status + '.');
  return r;
}

/* ===================== Stockage : WebDAV (direct depuis le navigateur, sans proxy) ===================== */
const KINDS = { audio: 'mp3 ogg oga wav flac m4a aac opus weba', video: 'mp4 webm ogv mov m4v', image: 'png jpg jpeg gif webp bmp avif svg', pdf: 'pdf', doc: 'docx xlsx pptx odt ods odp', legacy: 'doc xls ppt rtf', text: 'txt md csv tsv json log xml ini yml yaml html htm css js srt vtt ass ssa' };
const KMAP = {}; for (const [k, l] of Object.entries(KINDS)) for (const e of l.split(' ')) KMAP[e] = k;
const kindOf = n => KMAP[ext(n)] || 'other';
const MIME = { mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', weba: 'audio/webm', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', svg: 'image/svg+xml', pdf: 'application/pdf' };
const mimeOf = n => MIME[ext(n)] || 'application/octet-stream';
const netErr = () => Object.assign(new Error('Connexion impossible : serveur injoignable ou accès direct refusé par le serveur.'), { code: 'net' });

const blobB64 = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(b); });
const authHeader = c => 'Basic ' + btoa(String.fromCharCode(...new TextEncoder().encode(c.user + ':' + (c.pass || ''))));
const encPath = p => p.split('/').map(encodeURIComponent).join('/');
const basePath = c => ('/' + (c.base || '')).replace(/\/+/g, '/').replace(/\/$/, '');
const joinP = (a, b) => (a === '/' ? '' : a.replace(/\/$/, '')) + '/' + b;
const parentP = p => p.replace(/\/[^/]+\/?$/, '') || '/';
const trimSlash = s => s.replace(/\/+$/, '');
const decodeSafe = s => { try { return decodeURIComponent(s); } catch { return s; } };
const davUrl = (c, p) => { const base = httpUrl(c.url); if (!base) throw new Error('Adresse WebDAV invalide.'); return base.replace(/\/$/, '') + basePath(c) + encPath(p); };

async function readBlob(r, mime, onprog) {   // lecture avec progression
  if (!r.body || !onprog) return new Blob([await r.arrayBuffer()], { type: mime });
  const total = +r.headers.get('content-length') || 0, rd = r.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onprog(total ? got / total : null); }
  return new Blob(parts, { type: mime });
}
/* Requête WebDAV directe depuis le navigateur. En-têtes volontairement minimaux (Authorization, et Depth pour PROPFIND) :
   chaque en-tête supplémentaire doit être autorisé par le serveur lors du contrôle CORS (OPTIONS) et fait échouer la connexion.
   Pas de cache:'no-store' (il ajoute Cache-Control/Pragma), pas de Content-Type sur PUT (Blob sans type). */
const relayCfg = () => ({ url: String((D && D.relay && D.relay.url) || RELAY_URL || '').replace(/\/+$/, ''), tok: (D && D.relay && D.relay.tok) || '' });
const okRelayUrl = u => /^https:\/\/[^/]+/.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u);
const relayOn = () => okRelayUrl(relayCfg().url);
const viaRelay = u => relayCfg().url + '/?u=' + encodeURIComponent(u);
const relayErr = r => { const k = r.headers.get('X-Relay-Error');
  return Object.assign(new Error(k === 'unreachable' ? 'Le relais n’a pas pu joindre ce serveur : vérifiez l’adresse (https://, adresse publique) et que le serveur est en ligne.'
    : k === 'origin' ? 'Le relais refuse ce site : l’adresse du site doit être indiquée dans worker.js (voir README).'
    : k === 'token' ? 'Le relais refuse le jeton : vérifiez-le dans Stockages → Relais (il doit être identique au secret RELAY_TOKEN de Cloudflare).'
    : 'Le relais a refusé cette adresse (seules les adresses https:// publiques sont relayées).'), { code: 'relay' }); };
async function dav(c, method, p, body, headers = {}, tolerate = []) {
  const url = davUrl(c, p); let r;
  const go = (u, rel) => fetch(u, { method, headers: { ...headers, Authorization: authHeader(c), ...(rel && relayCfg().tok ? { 'X-Relay-Token': relayCfg().tok } : {}) }, body: body ? new Blob([body]) : undefined, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow' });
  const relayed = async () => { let x; try { x = await go(viaRelay(url), true); } catch { throw Object.assign(new Error('Connexion impossible : le serveur refuse l’accès direct et le relais du site est injoignable.'), { code: 'relay' }); } if (x.headers.get('X-Relay-Error')) throw relayErr(x); return x; };
  if (D.proxy) r = await api('/api/dav', { url, method, headers, auth: authHeader(c), b64: body && await blobB64(body) });
  else if (relayOn() && c.relay === true) r = await relayed();
  else {
    try { r = await go(url); }
    catch {   // accès direct refusé par le serveur : bascule automatique par le relais du site (retenue pour cette connexion)
      if (!relayOn()) throw netErr();
      r = await relayed(); c.relay = true; if (D.conns.includes(c)) save();
    }
  }
  if (tolerate.includes(r.status)) return r;
  const fail = (m, code) => Object.assign(new Error(m), { code });
  if (r.status === 401) throw fail('Identifiants refusés par le serveur (401) : vérifiez l’utilisateur et le mot de passe (avec Nextcloud, utilisez un « mot de passe d’application »).', 'auth');
  if (r.status === 403) throw fail('Accès refusé (403) : ce compte n’a pas le droit d’utiliser WebDAV ici.', 'auth');
  if (r.status === 404) throw fail('Dossier introuvable (404) : l’adresse WebDAV est incomplète ou incorrecte (Nextcloud : …/remote.php/dav/files/VOTRE-NOM/).', 'path');
  if (r.status === 405 || r.status === 501) throw fail('Ce serveur ne répond pas au protocole WebDAV à cette adresse (' + r.status + ').', 'path');
  if (!r.ok && r.status !== 207) throw fail('Erreur du serveur : ' + r.status + '.', 'http');
  return r;
}
/* Test + diagnostic. « injoignable » / « CORS » se distinguent avec une requête no-cors (réponse opaque, n'échoue que si le serveur est
   inatteignable). Une requête simple SANS en-tête personnalisé réussit seulement si le serveur envoie Access-Control-Allow-Origin :
   cela sépare « aucun CORS » de « CORS présent mais requête préliminaire OPTIONS refusée ». */
const isPrivateHost = h => /^(localhost|.*\.local|.*\.lan|.*\.home)$/i.test(h) || /^(10\.|192\.168\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(h);
async function testConn(c) {
  try { await dav(c, 'PROPFIND', '/', null, { Depth: '0' }); return { ok: true }; }
  catch (e) {
    if (e.code !== 'net') return { ok: false, code: e.code || 'http', msg: e.message };
    const url = davUrl(c, '/'), lan = isPrivateHost(new URL(url).hostname);
    let reach = true;
    try { await fetch(url, { mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer' }); } catch { reach = false; }
    const lanNote = lan ? ' Adresse du réseau local : Chrome peut demander d’autoriser l’accès au réseau local (acceptez), et la réponse OPTIONS doit contenir « Access-Control-Allow-Private-Network: true ».' : '';
    if (!reach) return { ok: false, code: 'unreach', msg: 'Serveur injoignable : vérifiez l’adresse, que le serveur est allumé et que son certificat HTTPS est valide (un certificat auto-signé est refusé par le navigateur).' + lanNote };
    let plain = true; try { await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' }); } catch { plain = false; }
    return plain
      ? { ok: false, code: 'cors', stage: 'preflight', msg: 'Le serveur refuse l’accès direct depuis un site web. Le relais n’est pas configuré : saisissez son adresse dans Stockages → Relais.' + lanNote }
      : { ok: false, code: 'cors', stage: 'none', msg: 'Le serveur répond mais n’envoie pas d’en-tête CORS autorisant ce site (' + location.origin + ') : configurez le relais dans Stockages → Relais.' + lanNote };
  }
}
const FS = {
  async list(c, p) {
    p = p.endsWith('/') ? p : p + '/';   // slash final : évite les redirections 301, interdites après un contrôle CORS
    const url = davUrl(c, p), x = new DOMParser().parseFromString(await (await dav(c, 'PROPFIND', p, null, { Depth: '1' })).text(), 'text/xml');
    const me = trimSlash(decodeSafe(new URL(url).pathname)), out = [];
    for (const r of x.getElementsByTagNameNS('*', 'response')) {
      const g = t => (r.getElementsByTagNameNS('*', t)[0] || {}).textContent || '';
      const hp = trimSlash(decodeSafe(new URL(g('href'), url).pathname)); if (hp === me) continue;
      out.push({ name: hp.split('/').pop(), dir: r.getElementsByTagNameNS('*', 'collection').length > 0, size: +g('getcontentlength') || 0 });
    }
    return out;
  },
  async read(c, p, mime, onprog) { return readBlob(await dav(c, 'GET', p), mime, onprog); },
  async write(c, p, blob) { return dav(c, 'PUT', p, blob); },
  async mkdir(c, p) {
    const r = await dav(c, 'MKCOL', p.endsWith('/') ? p : p + '/', null, {}, [405, 409]);
    if (r.status === 405) throw new Error('Ce dossier existe déjà.');
    if (r.status === 409) throw new Error('Impossible de créer le dossier ici (dossier parent introuvable).');
  },
  async remove(c, p, dir) { await dav(c, 'DELETE', dir && !p.endsWith('/') ? p + '/' : p); },
  async transfer(c, method, from, to, dir) {   // MOVE / COPY WebDAV ; Overwrite: F = ne jamais écraser un élément existant
    const sl = (x) => dir && !x.endsWith('/') ? x + '/' : x;
    const r = await dav(c, method, sl(from), null, { Destination: davUrl(c, sl(to)), Overwrite: 'F' }, [403, 405, 409, 412, 423, 501]);
    const why = { 412: 'un élément du même nom existe déjà à destination.', 409: 'dossier de destination introuvable.', 403: 'refusé par le serveur (droits insuffisants).', 423: 'élément verrouillé par le serveur.', 405: 'ce serveur ne gère pas cette opération.', 501: 'ce serveur ne gère pas cette opération.' }[r.status];
    if (why) throw new Error(why[0].toUpperCase() + why.slice(1));
  }
};
const getBlob = (t, onprog) => t.blob ? Promise.resolve(t.blob) : FS.read(t.c, t.path, mimeOf(t.name), onprog);

const copyText = async t => { try { await navigator.clipboard.writeText(t); toast('Copié.'); } catch (e) { toast('Copie impossible : sélectionnez le texte.'); } };
function connWin(addNew) {
  let edit = null, busy = false, ic = { img: '', custom: false };
  const F = {
    url: el('input', { placeholder: 'Adresse du serveur  (ex. cloud.exemple.com/dav)', maxLength: 500, inputMode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: false }),
    user: el('input', { placeholder: 'Nom d’utilisateur', maxLength: 200, autocomplete: 'off', autocapitalize: 'off', spellcheck: false }),
    pass: el('input', { type: 'password', placeholder: 'Mot de passe', maxLength: 500, autocomplete: 'new-password', onkeydown: e => { if (e.key === 'Enter') go(); } }),
    name: el('input', { placeholder: 'Nom affiché (facultatif)', maxLength: 60 }), site: el('input', { placeholder: 'Site du fournisseur (facultatif, ex. https://mon-cloud.exemple.com)', maxLength: 300, inputMode: 'url', autocapitalize: 'off', spellcheck: false }), base: el('input', { placeholder: 'Dossier de départ (facultatif, ex. /musique)', maxLength: 300 })
  };
  const msg = el('div', { className: 'warn', hidden: true }), msgAct = el('div', { className: 'row tight' }), list = el('div', { className: 'col' });
  const showMsg = (t, ...acts) => { msg.hidden = !t; msg.textContent = t || ''; msgAct.replaceChildren(...acts); };
  const pv = el('div', { className: 'pv' }), pick = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
  const drawPrev = () => pv.replaceChildren(appIcon(ic.img ? { name: F.name.value || '?', img: ic.img } : { name: F.name.value || '?', icon: 'cloud', c: ['#35c8ea', '#3a7bd5'] }, 44), el('small', { className: 'mut', textContent: ic.img ? (ic.custom ? 'Icône personnalisée' : 'Icône détectée') : 'Aucune icône : un nuage par défaut est utilisé' }));
  const iconSrc = () => { const s = F.site.value.trim() || F.url.value.trim(); if (!s) return ''; return httpUrl(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : 'https://' + s) || ''; };
  const detect = async quiet => { const h = iconSrc(); if (!h) return quiet || toast('Saisissez d’abord l’adresse du site du fournisseur (Options) ou du serveur.'); if (!quiet) toast('Recherche de l’icône…', 2000); const g = await detectIcon(h); if (g) { ic = { img: g, custom: false }; drawPrev(); } else if (!quiet) toast('Aucune icône trouvée : importez la vôtre.', 5000); return g; };
  pick.onchange = async () => { const f = pick.files[0]; pick.value = ''; if (!f) return; if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return toast('Format non pris en charge (PNG, JPEG, WebP, GIF).'); try { ic = { img: await shrink(f, 80), custom: true }; drawPrev(); } catch { toast('Image illisible.'); } };
  const reset = () => { edit = null; for (const k in F) F[k].value = ''; F.pass.placeholder = 'Mot de passe'; ic = { img: '', custom: false }; drawPrev(); showMsg(''); };
  const normUrl = v => { v = v.trim(); if (!v) return ''; if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = (/^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(v) ? 'http://' : 'https://') + v; return v; };
  const build = () => {
    const c = { id: edit ? edit.id : uid(), type: 'dav', name: F.name.value.trim(), url: '', user: F.user.value.trim(), pass: F.pass.value || (edit ? edit.pass : ''), base: F.base.value.trim(), site: '' };
    if (!c.user) { toast('Nom d’utilisateur requis.'); F.user.focus(); return null; }
    c.url = normUrl(F.url.value); const h = httpUrl(c.url);
    if (!h || !(/^https:\/\//i.test(h) || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(h))) { toast('Adresse invalide : une adresse https:// est requise.'); F.url.focus(); return null; }
    const sv = F.site.value.trim() && (/^https?:\/\//i.test(F.site.value.trim()) ? F.site.value.trim() : 'https://' + F.site.value.trim()), sh = sv && /^https:\/\//i.test(sv) && httpUrl(sv);
    if (sv && !sh) { toast('Site du fournisseur : adresse https:// invalide.'); F.site.focus(); return null; }
    c.site = sh || ''; c.img = ic.img || ''; c.url = h; c.name = c.name || new URL(h).hostname; if (edit && edit.url === h && edit.relay === true) c.relay = true;
    return c;
  };
  const store = c => { D.conns = edit ? D.conns.map(x => x.id === edit.id ? c : x) : [...D.conns, c]; save(); if (!c.img && !edit) detectIconFor(c); };
  const detectIconFor = async c => { const s = c.site || c.url, g = s && await detectIcon(s).catch(() => ''); if (g && !c.img && D.conns.includes(c)) { c.img = g; save(); renderDesk(); refresh(); } };
  async function go() {
    if (busy) return; const c = build(); if (!c) return;
    busy = true; showMsg('Test de la connexion…');
    const r = await testConn(c); busy = false;
    if (r.ok) { store(c); reset(); draw(); toast('Connecté. Identifiants enregistrés (chiffrés) : plus besoin de les ressaisir.', 4500); return explorer(c); }
    showMsg(r.msg,
      ...(r.code === 'cors' || r.code === 'relay' ? [btn('Configurer le relais', 'key', relayWin)] : []), btn('Enregistrer quand même', 'save', () => { store(c); reset(); draw(); toast('Connexion enregistrée sans test.'); }), btn('Réessayer', 'refresh', go));
  }
  const draw = () => list.replaceChildren(...(D.conns.length ? D.conns.map(c => el('div', { className: 'card' }, connIcon(c, 36),
    el('div', { className: 'grow' }, el('div', { className: 'row tight' }, el('b', { textContent: c.name }), el('span', { className: 'chip', textContent: 'WebDAV' })),
      el('small', { className: 'mut', textContent: c.url + ' · ' + c.user }),
      el('div', { className: 'row tight' }, btn('Ouvrir', 'folder', () => explorer(c), 'pri'),
        btn(D.desk.includes('c:' + c.id) ? 'Retirer du bureau' : 'Raccourci sur le bureau', D.desk.includes('c:' + c.id) ? 'x' : 'plus', () => toggleDesk(connApp('c:' + c.id))),
        btn('Site du fournisseur', 'ext', () => openProvider(c), '', 'Ouvrir le site officiel de ce fournisseur dans un nouvel onglet'),
        btn('Modifier', 'edit', () => { edit = c; for (const k in F) F[k].value = c[k] || ''; ic = { img: c.img || '', custom: /^data:/.test(c.img || '') }; drawPrev(); F.pass.value = ''; F.pass.placeholder = 'Mot de passe (vide = inchangé)'; showMsg(''); form.open = true; }),
        btn('Supprimer', 'trash', async () => { if (await confirmBox('Supprimer la connexion « ' + c.name + ' » et son mot de passe enregistré ?', 'Supprimer', true)) { D.conns = D.conns.filter(x => x !== c); D.desk = D.desk.filter(x => x !== 'c:' + c.id); save(); renderDesk(); draw(); } }, 'dng'))))) : [el('p', { className: 'mut', textContent: 'Aucun stockage connecté. Renseignez ci-dessous l’adresse de votre serveur WebDAV, votre nom d’utilisateur et votre mot de passe : la connexion restera enregistrée (chiffrée) dans votre session.' })]));
  const form = el('details', { className: 'frm', open: !D.conns.length || addNew === true }, el('summary', { textContent: 'Ajouter ou modifier une connexion WebDAV' }),
    el('div', { className: 'col' },
      F.url, el('div', { className: 'fgrid' }, F.user, F.pass), el('details', { className: 'opt' }, el('summary', { textContent: 'Options' }), el('div', { className: 'fgrid' }, F.name, F.base), F.site,
        el('div', { className: 'row tight' }, pv, btn('Détecter l’icône', 'search', () => detect(false), '', 'Chercher l’icône du site du fournisseur'), btn('Importer une icône…', 'upload', () => pick.click()), btn('Retirer', 'x', () => { ic = { img: '', custom: false }; drawPrev(); }), pick)),
      msg, msgAct, el('div', { className: 'row end' }, btn('Annuler', '', reset), btn('Se connecter', 'check', go, 'pri')),
      el('small', { className: 'mut', textContent: 'Le mot de passe est chiffré (AES-256) dans votre profil. Si le serveur n’accepte pas les connexions directes depuis un site web, le site passe automatiquement par son relais (vos identifiants y transitent sans être enregistrés).' })));
  drawPrev(); VIEWS.add(draw);
  win('Stockages cloud', 'cloud', [el('div', { className: 'row' }, btn('Relais…', 'key', relayWin, '', 'Adresse et jeton du relais Cloudflare'), btn('Lecteurs (accès rapide)', 'cloud', drivesWin, '', 'Fenêtre d’accès rapide à vos lecteurs WebDAV')), list, form], { w: 660, h: 540, onclose: () => VIEWS.delete(draw) });
  draw();
}

/* Relais Cloudflare : adresse + jeton secret, saisis une seule fois ici (jamais dans le dépôt), chiffrés dans le profil. */
async function probeRelay(url, tok) {
  const call = t => fetch(url + '/?ping=1', { headers: t ? { 'X-Relay-Token': t } : {}, credentials: 'omit', referrerPolicy: 'no-referrer' });
  let r; try { r = await call(tok); } catch { return { ok: false, msg: 'Relais injoignable : vérifiez l’adresse du Worker (https://…workers.dev) et qu’il est déployé.' }; }
  const k = r.headers.get('X-Relay-Error');
  if (k === 'origin') return { ok: false, msg: 'Le relais refuse ce site (' + location.origin + ') : corrigez « const SITE » dans le code du Worker.' };
  if (k === 'token') return { ok: false, msg: tok ? 'Jeton refusé : il doit être identique au secret RELAY_TOKEN défini dans Cloudflare.' : 'Ce relais exige un jeton : saisissez-le ci-dessous.' };
  if (!r.headers.get('X-Relay-Ok')) return { ok: false, msg: 'Ce Worker répond mais n’est pas à jour : collez la dernière version de worker.js dans Cloudflare puis « Deploy ».' };
  let open = false; if (tok) { try { open = !!(await call('')).headers.get('X-Relay-Ok'); } catch { /* ignoré */ } } else open = true;
  return { ok: true, open, msg: open ? 'Relais joignable, mais OUVERT : il n’exige pas de jeton. Ajoutez le secret RELAY_TOKEN dans Cloudflare (voir tutoriel) pour que personne d’autre ne puisse l’utiliser.' : 'Relais joignable et verrouillé : le jeton est accepté.' };
}
function relayWin() {
  const cur = relayCfg();
  const url = el('input', { placeholder: 'Adresse du relais (ex. https://sormick-relais.moncompte.workers.dev)', maxLength: 300, inputMode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, value: cur.url });
  const tok = el('input', { type: 'password', placeholder: cur.tok ? 'Jeton secret (déjà enregistré ; vide = inchangé)' : 'Jeton secret (facultatif mais recommandé)', maxLength: 200, autocomplete: 'new-password', autocapitalize: 'off', spellcheck: false });
  const msg = el('div', { className: 'warn', hidden: true });
  const show = (t, ok) => { msg.hidden = !t; msg.textContent = t || ''; msg.className = ok ? 'okmsg' : 'warn'; };
  const norm = () => {
    let v = url.value.trim(); if (v && !/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v; v = v.replace(/\/+$/, '');
    if (v && !(okRelayUrl(v) && httpUrl(v))) { toast('Adresse du relais invalide : https:// requis.'); url.focus(); return null; }
    const t = tok.value.trim() || cur.tok;
    if (t && !/^[\w.~+/=-]{8,200}$/.test(t)) { toast('Jeton : 8 à 200 caractères (lettres, chiffres, - _ . ~ + / =).'); tok.focus(); return null; }
    return { url: v, tok: v ? t : '' };
  };
  const gen = () => { const b = crypto.getRandomValues(new Uint8Array(24)); tok.value = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); tok.type = 'text'; tok.focus(); tok.select(); show('Jeton généré. Copiez-le (bouton ci-dessous), collez-le dans Cloudflare comme secret RELAY_TOKEN, puis cliquez « Enregistrer ».', true); };
  const test = async () => { const n = norm(); if (!n) return; if (!n.url) return show('Saisissez d’abord l’adresse du relais.'); show('Test en cours…', true); const r = await probeRelay(n.url, n.tok); show(r.msg, r.ok && !r.open); };
  const saveIt = () => { const n = norm(); if (!n) return; D.relay = n; for (const c of D.conns) if (!n.url) delete c.relay; save(); tok.value = ''; tok.type = 'password'; cur.tok = n.tok; tok.placeholder = n.tok ? 'Jeton secret (déjà enregistré ; vide = inchangé)' : 'Jeton secret'; show(n.url ? 'Relais enregistré (chiffré dans votre profil).' : 'Relais supprimé.', true); toast(n.url ? 'Relais enregistré.' : 'Relais supprimé.'); };
  win('Relais', 'key', [
    el('p', { className: 'mut', textContent: 'Le relais est un petit service à vous (Cloudflare) qui permet de joindre un WebDAV sans réglage sur son serveur. L’application l’utilise toute seule quand la connexion directe est refusée. Son adresse et son jeton ne sont jamais dans le dépôt public : ils sont enregistrés ici, chiffrés avec votre mot de passe.' }),
    url, tok,
    el('div', { className: 'row tight' }, btn('Générer un jeton', 'key', gen), btn('Copier le jeton', 'copy', () => tok.value ? copyText(tok.value) : toast('Générez ou saisissez d’abord un jeton.'))),
    msg,
    el('div', { className: 'row end' }, btn('Effacer', 'trash', () => { url.value = ''; tok.value = ''; cur.tok = ''; saveIt(); }, 'dng'), btn('Tester', 'refresh', test), btn('Enregistrer', 'save', saveIt, 'pri')),
    el('small', { className: 'mut', textContent: 'Le jeton fonctionne comme un mot de passe du relais : sans lui, même quelqu’un qui connaît l’adresse ne peut pas l’utiliser. Il est transmis au relais (en HTTPS) avec chaque requête.' })
  ], { w: 560, h: 470 });
}

/* Site officiel du fournisseur cloud (adresse enregistrée dans les réglages de la connexion), ouvert dans un nouvel onglet. */
function openProvider(pref) {
  const go = c => { const h = c.site && httpUrl(c.site); h ? openTab(h) : toast('Aucune adresse de site enregistrée pour « ' + c.name + ' » : ajoutez-la dans Stockage cloud (Modifier → Options).', 6500); };
  if (pref) return go(pref);
  const withSite = D.conns.filter(c => c.site);
  if (!withSite.length) return toast('Enregistrez l’adresse du site de votre fournisseur dans Stockage cloud (Modifier → Options).', 6500);
  if (withSite.length === 1) return go(withSite[0]);
  dialog('Ouvrir le site du fournisseur', [{ k: 'c', label: 'Stockage', type: 'select', options: withSite.map(c => [c.id, c.name + ' — ' + hostOf(c.site)]) }], 'Ouvrir').then(r => { const c = r && withSite.find(x => x.id === r.c); if (c) go(c); });
}
/* Rappel « Caster » : un site web ne peut pas ouvrir la fenêtre de diffusion du navigateur ; on affiche le chemin et un lien de recherche (au cas où le menu change). */
function castHelp() {
  const ua = navigator.userAgent, edge = /Edg\//.test(ua), chrome = /Chrome\//.test(ua) && !edge;
  const how = edge ? 'Menu « … » du navigateur → « Enregistrer et partager » → « Caster le média sur l’appareil » → choisissez votre appareil.'
    : chrome ? 'Menu ⋮ du navigateur → « Caster… » → choisissez votre Chromecast ou téléviseur → « Caster l’onglet ».'
    : 'La diffusion d’un onglet existe dans Chrome et Edge : ouvrez ce site dans l’un d’eux, puis menu du navigateur → « Caster… » → « Caster l’onglet ».';
  const query = edge ? 'Microsoft Edge caster un onglet sur Chromecast comment faire' : 'Chrome caster un onglet sur Chromecast comment faire';
  dialog('Caster sur une télévision', [], 'Chercher le tutoriel', { note: how + ' Les menus changent selon la version : si vous ne trouvez pas, cliquez sur « Chercher le tutoriel ». Astuce : le bouton « Plein écran » de la barre des tâches donne une image plus grande.' })
    .then(r => { if (r) openTab('https://www.google.com/search?q=' + encodeURIComponent(query)); });
}
const castBtn = () => btn('Caster', 'cast', castHelp, '', 'Comment envoyer l’onglet sur un Chromecast / une télévision');
const provBtn = getC => btn('Mon cloud (site officiel)', 'ext', () => openProvider(getC && getC()), '', 'Ouvrir le site officiel de mon fournisseur cloud dans un nouvel onglet');

/* Choix d'un dossier de destination (déplacer / copier) : navigation dans les sous-dossiers du même stockage. */
function pickFolder(c, start, title) {
  return new Promise(res => {
    let p = start, tk = 0; const prev = document.activeElement;
    const list = el('div', { className: 'flist pfl' }), crumb = el('b', { className: 'crumb' });
    const done = v => { ov.remove(); if (prev && prev.focus) prev.focus(); res(v); };
    const load = async q => {
      const t = ++tk; list.replaceChildren(el('p', { className: 'mut', textContent: 'Chargement…' }));
      try {
        const it = (await FS.list(c, q)).filter(x => x.dir && x.name).sort((x, y) => String(x.name).localeCompare(String(y.name), 'fr', { numeric: true })); if (t !== tk) return;
        p = q; crumb.textContent = c.name + ' · ' + p;
        list.replaceChildren(...(it.length ? it.map(x => el('div', { className: 'li', tabIndex: 0, role: 'button', onclick: () => load(joinP(p, String(x.name))), onkeydown: e => { if (e.key === 'Enter') load(joinP(p, String(x.name))); } }, ico('folder', 18), el('span', { textContent: String(x.name) }))) : [el('p', { className: 'mut', textContent: 'Aucun sous-dossier ici.' })]));
      } catch (e) { if (t === tk) list.replaceChildren(el('div', { className: 'warn', textContent: e.message })); }
    };
    const ov = el('div', { className: 'ov', onkeydown: e => { if (e.key === 'Escape') done(null); } }, el('div', { className: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: 'width:min(520px,94vw)' },
      el('h3', { textContent: title }), el('div', { className: 'row' }, btn('', 'up', () => load(parentP(p)), '', 'Dossier parent'), crumb), list,
      el('div', { className: 'row end' }, btn('Annuler', '', () => done(null)), btn('Choisir ce dossier', 'check', () => done(p), 'pri'))));
    document.body.append(ov); load(p); ov.querySelector('.pri').focus();
  });
}

function explorer(c) {
  let p = '/', items = [], files = []; const sel = new Set();
  const list = el('div', { className: 'flist' }), crumb = el('b', { className: 'crumb' });
  const up = el('input', { type: 'file', multiple: true, hidden: true });
  up.onchange = async () => {
    const fl = [...up.files]; up.value = '';
    for (const f of fl) { try { await FS.write(c, joinP(p, f.name), f); toast('Envoyé : ' + f.name); } catch (e) { toast(e.message, 6000); break; } }
    load(p);
  };
  const all = el('input', { type: 'checkbox', 'aria-label': 'Tout sélectionner', onchange: () => { sel.clear(); if (all.checked) [...list.querySelectorAll('.li[data-n]')].filter(r => !r.hidden).forEach(r => sel.add(r.dataset.n)); mark(); } });
  const delB = btn('Supprimer', 'trash', () => delSel(), 'dng', 'Supprimer les éléments cochés'); delB.disabled = true;
  const mvB = btn('Déplacer…', 'move', () => transferSel('MOVE'), '', 'Déplacer les éléments cochés vers un autre dossier'), cpB = btn('Copier…', 'copy', () => transferSel('COPY'), '', 'Copier les éléments cochés vers un autre dossier'); mvB.disabled = cpB.disabled = true;
  const mark = () => {
    for (const r of list.querySelectorAll('.li[data-n]')) { const on = sel.has(r.dataset.n); r.classList.toggle('on', on); r.querySelector('input').checked = on; }
    delB.disabled = mvB.disabled = cpB.disabled = !sel.size; delB.lastChild.textContent = sel.size ? 'Supprimer (' + sel.size + ')' : 'Supprimer'; { const vs = [...list.querySelectorAll('.li[data-n]')].filter(r => !r.hidden); all.checked = vs.length > 0 && vs.every(r => sel.has(r.dataset.n)); }
  };
  /* Recherche : « Dossier actuel » = filtre instantané ; « Tout le lecteur » = parcours des dossiers (PROPFIND, un dossier à la fois, 3 en parallèle). */
  const qIn = el('input', { type: 'search', placeholder: 'Rechercher un fichier ou un dossier…', maxLength: 100, 'aria-label': 'Rechercher', className: 'grow', onkeydown: e => { if (e.key === 'Enter') runSearch(); } });
  const scope = el('select', { 'aria-label': 'Où chercher' }); opts(scope, [['dir', 'Dossier actuel'], ['all', 'Tout le lecteur']]);
  const goB = btn('Rechercher', 'search', () => runSearch(), '', 'Lancer la recherche'), stopB = btn('Arrêter', 'x', () => cancelSearch(), 'dng', 'Arrêter la recherche'); stopB.hidden = true;
  const stat = el('small', { className: 'mut' }); let sTok = 0, resMode = false;
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), words = () => norm(qIn.value).split(/\s+/).filter(Boolean), hit = (name, w) => { const n = norm(name); return w.every(x => n.includes(x)); };
  const applyFilter = () => {
    if (resMode) return; const w = scope.value === 'dir' ? words() : []; let n = 0;
    for (const r of list.querySelectorAll('.li[data-n]')) { const v = hit(r.dataset.n, w); r.hidden = !v; if (v) n++; }
    stat.textContent = w.length ? n + ' résultat(s) dans ce dossier.' : '';
  };
  const cancelSearch = () => { sTok++; stopB.hidden = true; goB.disabled = false; };
  const goTo = path => { resMode = false; all.disabled = false; cancelSearch(); stat.textContent = ''; load(path); };
  qIn.oninput = () => { if (scope.value === 'dir') { if (resMode) goTo(p); else applyFilter(); } };
  scope.onchange = () => { if (resMode) goTo(p); else applyFilter(); };
  async function runSearch() {
    const w = words(); if (!w.length) return toast('Saisissez un nom (ou une partie de nom) à chercher.');
    if (scope.value === 'dir') { if (resMode) await goTo(p); return applyFilter(); }
    const t = ++sTok; resMode = true; all.disabled = true; sel.clear(); mark(); stopB.hidden = false; goB.disabled = true;
    const found = [], queue = ['/'], MAXM = 500, MAXD = 3000, nap = ms => new Promise(r => setTimeout(r, ms)); let dirs = 0, skipped = 0, active = 0, dirty = true, capped = false;
    const icon = { folder: 'folder', audio: 'music', video: 'video', image: 'image', pdf: 'file', text: 'file', other: 'file' };
    const render = () => {
      const fl = found.filter(f => !f.dir).map(f => ({ name: f.name, c, path: f.path }));
      list.replaceChildren(...(found.length ? found.map(x => {
        const open = () => x.dir ? goTo(x.path) : openFile(fl, fl.findIndex(f => f.path === x.path));
        const row = el('div', { className: 'li', tabIndex: 0, role: 'button', onclick: open, onkeydown: e => { if (e.key === 'Enter' && e.target === row) open(); } },
          ico(icon[x.dir ? 'folder' : kindOf(x.name)], 18), el('span', { textContent: x.name }), el('small', { className: 'mut', textContent: x.parent }), el('small', { className: 'mut', textContent: x.dir ? '' : fmtSize(x.size) }),
          btn('Dossier', 'folder', e => { e.stopPropagation(); goTo(x.dir ? x.path : x.parent); }, '', 'Ouvrir le dossier qui contient cet élément'));
        return row;
      }) : [el('p', { className: 'mut', textContent: 'Recherche en cours…' })]));
    };
    const timer = setInterval(() => { if (t !== sTok) return clearInterval(timer); stat.textContent = 'Recherche… ' + found.length + ' résultat(s), ' + dirs + ' dossier(s) parcouru(s).'; if (dirty) { dirty = false; render(); } }, 400);
    const work = async () => {
      while (t === sTok) {
        if (found.length >= MAXM || dirs >= MAXD) { capped = true; break; }
        const d = queue.shift(); if (d === undefined) { if (!active) break; await nap(60); continue; }
        active++;
        try { for (const x of await FS.list(c, d)) { if (!x.name) continue; const name = String(x.name), path = joinP(d, name); if (x.dir) queue.push(path); if (hit(name, w) && found.length < MAXM) { found.push({ name, dir: x.dir, size: x.size, path, parent: d }); dirty = true; } } dirs++; }
        catch { skipped++; }
        active--;
      }
    };
    await Promise.all([work(), work(), work()]); clearInterval(timer);
    if (t !== sTok) return;
    stopB.hidden = true; goB.disabled = false; render(); if (!found.length) list.replaceChildren(el('p', { className: 'mut', textContent: 'Aucun résultat pour « ' + qIn.value.trim() + ' ».' }));
    stat.textContent = found.length + ' résultat(s), ' + dirs + ' dossier(s) parcouru(s).' + (capped ? ' Limite atteinte : précisez votre recherche.' : '') + (skipped ? ' ' + skipped + ' dossier(s) illisible(s).' : '');
  }
  const load = async q => {
    resMode = false; all.disabled = false; cancelSearch();
    list.replaceChildren(el('p', { className: 'mut', textContent: 'Chargement…' })); sel.clear(); mark();
    try {
      items = (await FS.list(c, q)).filter(x => x.name).map(x => ({ ...x, name: String(x.name) })).sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name, 'fr', { numeric: true }));
      p = q; crumb.textContent = c.name + ' · ' + p;
      files = items.filter(x => !x.dir).map(x => ({ name: x.name, c, path: joinP(p, x.name) }));
      const icon = { folder: 'folder', audio: 'music', video: 'video', image: 'image', pdf: 'file', text: 'file', other: 'file' };
      list.replaceChildren(...(items.length ? items.map(x => {
        const open = () => x.dir ? load(joinP(p, x.name)) : openFile(files, files.findIndex(f => f.name === x.name));
        const cb = el('input', { type: 'checkbox', 'aria-label': 'Sélectionner ' + x.name, onclick: e => e.stopPropagation(), onchange: () => { cb.checked ? sel.add(x.name) : sel.delete(x.name); mark(); } });
        const row = el('div', { className: 'li', tabIndex: 0, role: 'button', onclick: open, onkeydown: e => { if (e.key === 'Enter' && e.target === row) open(); } },
          cb, ico(icon[x.dir ? 'folder' : kindOf(x.name)], 18), el('span', { textContent: x.name }), el('small', { className: 'mut', textContent: x.dir ? '' : fmtSize(x.size) }));
        row.dataset.n = x.name; return row;
      }) : [el('p', { className: 'mut', textContent: 'Dossier vide.' })]));
      applyFilter();
    } catch (e) { list.replaceChildren(el('div', { className: 'warn', textContent: e.code === 'net' ? (await testConn(c)).msg : e.message }), el('div', { className: 'row tight' }, btn('Réessayer', 'refresh', () => load(q)))); }
  };
  const delSel = async () => {
    const t = items.filter(x => sel.has(x.name)); if (!t.length) return;
    const nd = t.filter(x => x.dir).length;
    const txt = t.length === 1 ? 'Supprimer « ' + t[0].name + ' »' + (t[0].dir ? ' (dossier et tout son contenu)' : '') + ' du serveur ? Cette action est définitive.'
      : 'Supprimer ' + t.length + ' éléments du serveur' + (nd ? ' (dont ' + nd + ' dossier' + (nd > 1 ? 's' : '') + ' avec tout leur contenu)' : '') + ' ? Cette action est définitive.';
    if (!(await confirmBox(txt, 'Supprimer', true))) return;
    let ok = 0, bad = '';
    for (const x of t) { try { await FS.remove(c, joinP(p, x.name), x.dir); ok++; } catch (e) { bad = x.name + ' : ' + e.message; } }
    toast(ok + ' élément(s) supprimé(s).' + (bad ? ' Échec : ' + bad : ''), bad ? 7000 : 3500); load(p);
  };
  const transferSel = async kind => {
    const t = items.filter(x => sel.has(x.name)); if (!t.length) return;
    const mv = kind === 'MOVE', dest = await pickFolder(c, p, (mv ? 'Déplacer ' : 'Copier ') + (t.length === 1 ? '« ' + t[0].name + ' »' : t.length + ' éléments') + ' vers…');
    if (dest == null) return;
    if (dest === p) return toast('Choisissez un autre dossier que le dossier actuel.', 5000);
    let ok = 0; const bad = [];
    for (const x of t) {
      const from = joinP(p, x.name), to = joinP(dest, x.name);
      if (x.dir && (dest === from || dest.startsWith(from + '/'))) { bad.push(x.name + ' : un dossier ne peut pas être placé dans lui-même.'); continue; }
      try { await FS.transfer(c, kind, from, to, x.dir); ok++; } catch (e) { bad.push(x.name + ' : ' + e.message); }
    }
    toast((ok ? ok + (mv ? ' élément(s) déplacé(s)' : ' élément(s) copié(s)') + ' vers ' + dest + '.' : 'Rien n’a été ' + (mv ? 'déplacé.' : 'copié.')) + (bad.length ? ' Échec : ' + bad.join(' ') : ''), bad.length ? 9000 : 4000); load(p);
  };
  const newDir = async () => {
    const r = await dialog('Nouveau dossier', [{ k: 'n', label: 'Nom du dossier', req: true, max: 100 }], 'Créer', { check: v => /[\\/]/.test(v.n) || ['.', '..'].includes(v.n.trim()) ? 'Nom invalide (pas de / ni de \\).' : '' });
    if (!r) return;
    try { await FS.mkdir(c, joinP(p, r.n.trim())); toast('Dossier créé.'); load(p); } catch (e) { toast(e.message, 6000); }
  };
  const newText = async () => {
    const r = await dialog('Nouveau fichier texte', [{ k: 'n', label: 'Nom du fichier', value: 'sans-titre.txt', req: true, max: 100 }], 'Créer', { check: v => /[\\/]/.test(v.n) ? 'Le nom ne peut pas contenir / ou \\.' : '' });
    if (r) editor(r.n, { text: '' }, { cid: c.id, path: joinP(p, r.n.trim()) });
  };
  win('Explorateur — ' + c.name, 'folder', [
    el('div', { className: 'row' }, btn('', 'up', () => load(parentP(p)), '', 'Dossier parent'), btn('', 'refresh', () => load(p), '', 'Actualiser'), crumb),
    el('div', { className: 'row tight' }, el('label', { className: 'row tight' }, all, el('small', { className: 'mut', textContent: 'Tout' })),
      btn('Nouveau dossier', 'folder', newDir, 'pri'), btn('Nouveau texte', 'file', newText), btn('Téléverser ici', 'upload', () => up.click()), up, mvB, cpB, delB,
      provBtn(() => c), btn('Raccourci bureau', 'plus', () => { const a = connApp('c:' + c.id); toggleDesk(a); toast(D.desk.includes(a.id) ? 'Raccourci ajouté au bureau.' : 'Raccourci retiré du bureau.'); }, '', 'Ajouter ou retirer un raccourci de ce stockage sur le bureau')),
    el('div', { className: 'row tight' }, qIn, scope, goB, stopB), stat, list], { w: 680, h: 500, max: true, onclose: () => { cancelSearch(); } });
  load(p);
}

/* Ouvre un fichier avec l'application intégrée qui convient (les autres fichiers du dossier forment la liste de lecture / de navigation). */
function openFile(files, i) {
  const t = files[i], k = kindOf(t.name), same = kk => files.filter(f => kindOf(f.name) === kk);
  if (k === 'audio') { const a = same('audio'); return openPlayer(a, a.indexOf(t)); }
  if (k === 'video') { const v = same('video'); return videoWin(v, v.indexOf(t), files); }
  if (k === 'image') { const m = same('image'); return imageWin(m, m.indexOf(t)); }
  if (['pdf', 'doc', 'text', 'legacy'].includes(k)) { const d = files.filter(f => ['pdf', 'doc', 'text', 'legacy'].includes(kindOf(f.name))); return docWin(d, d.indexOf(t)); }
  return confirmBox('« ' + t.name + ' » n’est pas pris en charge par vos lecteurs (musique, vidéo, documents, images). Voulez-vous le télécharger ?', 'Télécharger').then(ok => ok && getBlob(t).then(b => { download(b, t.name); toast('Fichier téléchargé.'); })).catch(e => toast(e.message, 6000));
}

/* ===================== Lecteur de musique + playlists ===================== */
const P = { q: [], i: 0, a: new Audio(), loop: 0, shuf: false, w: null, url: null, rel: null, streamed: false, mode: 'folder', plName: '', tok: 0 };
function resetTags() { if (P.coverUrl) { URL.revokeObjectURL(P.coverUrl); P.coverUrl = null; } if (P.cover) { P.cover.hidden = true; P.cover.removeAttribute('src'); P.meta.textContent = ''; } P.tags = null; P.lyrFill && P.lyrFill(); }
async function loadTags(t, tok) {
  resetTags(); let g = null; try { g = await readTags(t); } catch { /* étiquettes illisibles : ignorées */ }
  if (tok !== P.tok || !P.cover) return; P.tags = g || { lyrics: '' }; P.tagsDone = true;
  if (g) {
    if (g.title) P.title.textContent = g.title;
    P.meta.textContent = [g.artist, g.album].filter(Boolean).join(' — ');
    if (g.pic) { P.coverUrl = URL.createObjectURL(new Blob([g.pic.data], { type: g.pic.type })); P.cover.src = P.coverUrl; P.cover.hidden = false; }
  }
  P.lyrFill && P.lyrFill();
}
function lyricsWin() {
  if (P.lw && P.lw.isConnected) { P.lw.hidden = false; P.lw.style.zIndex = ++Z; return; }
  const h = el('b', { className: 'grow' }), body = el('div', { className: 'lyr' });
  P.lyrFill = () => {
    const t = P.q[P.i]; h.textContent = (P.tags && P.tags.title) || (t ? t.name : 'Aucun titre');
    body.textContent = !t ? 'Aucun titre en lecture.' : !P.tagsDone && !P.tags ? 'Chargement…' : P.tags && P.tags.lyrics ? P.tags.lyrics : 'Aucune parole n’est intégrée à ce fichier (seuls les MP3 avec paroles ID3 sont lus).';
  };
  P.lw = win('Paroles', 'note', [h, body], { w: 420, h: 520, onclose: () => { P.lw = null; P.lyrFill = null; } });
  const m = P.w;   // à côté du lecteur (à droite, sinon à gauche) pour ne pas le recouvrir
  if (m && m.isConnected) { const dw = $('#desk').clientWidth || innerWidth, ww = P.lw.offsetWidth || 420; let L = m.offsetLeft + m.offsetWidth + 10; if (L + ww > dw) L = m.offsetLeft - ww - 10 >= 0 ? m.offsetLeft - ww - 10 : Math.max(0, dw - ww); P.lw.style.left = L + 'px'; P.lw.style.top = m.offsetTop + 'px'; }
  P.lyrFill();
}
const freeAudio = () => { if (P.url) { URL.revokeObjectURL(P.url); P.url = null; } if (P.rel) { P.rel(); P.rel = null; } P.streamed = false; };
function openPlayer(q, i = 0) {
  if (q) { P.q = q; P.mode = 'folder'; }
  if (!P.w || !P.w.isConnected) buildPlayer();
  P.w.hidden = false; P.draw();
  if (q) play(i);
}
async function play(i) {
  const t = P.q[i]; if (!t) return;
  P.i = i; const tok = ++P.tok; P.title.textContent = t.name; P.stat.textContent = 'Chargement…'; P.tagsDone = false; P.draw(); loadTags(t, tok);
  try {
    freeAudio();
    const s = t.blob ? null : await streamUrl(t);   // WebDAV : lecture en continu via sw.js (sans téléchargement complet) quand c'est possible
    if (tok !== P.tok) { if (s) s.release(); return; }
    if (s) { P.rel = s.release; P.streamed = true; P.a.src = s.url; }
    else {
      const b = await getBlob(t, f => { if (tok === P.tok && f != null) P.stat.textContent = 'Chargement ' + Math.round(f * 100) + ' %'; });
      if (tok !== P.tok) return;
      P.url = URL.createObjectURL(b.type ? b : new Blob([b], { type: mimeOf(t.name) })); P.a.src = P.url;
    }
    await P.a.play(); if (tok === P.tok) P.stat.textContent = '';
  } catch (e) { if (tok === P.tok) P.stat.textContent = e.name === 'NotAllowedError' ? 'Appuyez sur lecture.' : e.name === 'AbortError' ? '' : (e.message || 'Lecture impossible.'); }
}
async function audioFallback() {   // la lecture en continu a échoué (ex. le serveur n'expose pas Content-Range) : téléchargement complet
  const t = P.q[P.i], tok = P.tok; if (!t) return;
  P.streamed = false; P.stat.textContent = 'Chargement complet…';
  try {
    const b = await getBlob(t, f => { if (tok === P.tok && f != null) P.stat.textContent = 'Chargement ' + Math.round(f * 100) + ' %'; });
    if (tok !== P.tok) return; freeAudio(); P.url = URL.createObjectURL(b.type ? b : new Blob([b], { type: mimeOf(t.name) })); P.a.src = P.url; await P.a.play(); P.stat.textContent = '';
  } catch (e) { if (tok === P.tok) P.stat.textContent = e.message || 'Lecture impossible.'; }
}
function nextTrack(d) {
  if (!P.q.length) return;
  let n = P.shuf && P.q.length > 1 ? (P.i + 1 + Math.floor(Math.random() * (P.q.length - 1))) % P.q.length : P.i + d;
  if (n >= P.q.length) { if (!P.loop) return; n = 0; }
  if (n < 0) n = P.q.length - 1;
  play(n);
}
function buildPlayer() {
  P.title = el('div', { className: 'ptitle', textContent: 'Aucun titre' }); P.stat = el('small', { className: 'mut' });
  P.cover = el('img', { className: 'pcover', alt: 'Pochette', hidden: true }); P.meta = el('div', { className: 'pmeta' });
  const pr = el('input', { type: 'range', min: 0, max: 1000, value: 0, 'aria-label': 'Progression', oninput: () => { if (P.a.duration) P.a.currentTime = P.a.duration * pr.value / 1000; } });
  const tm = el('small', { className: 'mut', textContent: '0:00 / 0:00' });
  const vol = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: P.a.volume, 'aria-label': 'Volume', oninput: () => { P.a.volume = vol.value; } });
  const ql = el('div', { className: 'flist' }), sel = el('select'), pick = el('input', { type: 'file', accept: 'audio/*', multiple: true, hidden: true });
  const playB = btn('', 'play', () => { P.a.paused ? P.a.play() : P.a.pause(); }, 'big', 'Lecture / pause');
  const loopB = btn('', 'repeat', () => { P.loop = (P.loop + 1) % 3; loopB.classList.toggle('on', !!P.loop); loopB.title = ['Boucle désactivée', 'Boucle sur tout', 'Boucle sur le titre'][P.loop]; }, '', 'Boucle');
  const shB = btn('', 'shuffle', () => { P.shuf = !P.shuf; shB.classList.toggle('on', P.shuf); }, '', 'Lecture aléatoire');
  const fmt = s => isFinite(s) ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00';
  const pls = () => opts(sel, [['', 'Mes playlists…'], ...Object.keys(D.pl).map(k => [k, k])]);
  const setIcon = () => playB.replaceChildren(ico(P.a.paused ? 'play' : 'pause', 24));
  P.a.onplay = P.a.onpause = setIcon; setIcon();
  P.a.ontimeupdate = () => { pr.value = P.a.duration ? P.a.currentTime / P.a.duration * 1000 : 0; tm.textContent = fmt(P.a.currentTime) + ' / ' + fmt(P.a.duration); };
  P.a.onended = () => P.loop === 2 ? play(P.i) : nextTrack(1);
  P.a.onerror = () => { if (P.streamed) audioFallback(); else P.stat.textContent = 'Ce fichier audio ne peut pas être lu.'; };
  const addTo = (t, quiet) => {
    const k = sel.value; if (!k || !D.pl[k]) { if (!quiet) toast('Choisissez d’abord une playlist.'); return false; }
    if (!t.c) { if (!quiet) toast('Seuls les titres d’un stockage connecté peuvent être ajoutés.'); return false; }
    if (D.pl[k].some(x => x.cid === t.c.id && x.path === t.path)) return false;
    D.pl[k].push({ name: t.name, cid: t.c.id, path: t.path }); save(); return true;
  };
  const removeAt = k => {   // retire un titre de la liste en cours (sans toucher aux fichiers)
    if (k === P.i) { P.tok++; P.a.pause(); freeAudio(); P.a.removeAttribute('src'); P.title.textContent = 'Aucun titre'; P.stat.textContent = ''; resetTags(); }
    P.q.splice(k, 1); if (k < P.i) P.i--; if (P.i >= P.q.length) P.i = Math.max(0, P.q.length - 1); P.draw();
  };
  const clearQ = () => { P.tok++; P.a.pause(); freeAudio(); P.a.removeAttribute('src'); P.q = []; P.i = 0; P.mode = 'folder'; P.title.textContent = 'Aucun titre'; P.stat.textContent = ''; resetTags(); P.draw(); };
  P.draw = () => ql.replaceChildren(...(P.q.length ? P.q.map((t, k) => el('div', { className: 'li' + (k === P.i ? ' on' : ''), onclick: () => play(k) }, ico('music', 16), el('span', { textContent: t.name }),
    P.mode === 'pl'
      ? btn('', 'x', e => { e.stopPropagation(); const l = D.pl[P.plName]; if (l) { const j = l.findIndex(x => t.c && x.cid === t.c.id && x.path === t.path); if (j >= 0) l.splice(j, 1); save(); } removeAt(k); }, '', 'Retirer de la playlist')
      : el('span', { className: 'row tight' }, btn('', 'plus', e => { e.stopPropagation(); if (addTo(t)) toast('Ajouté à « ' + sel.value + ' ».'); }, '', 'Ajouter à la playlist'),
        btn('', 'x', e => { e.stopPropagation(); removeAt(k); }, '', 'Retirer de la liste')))) : [el('p', { className: 'mut', textContent: 'La liste est vide. Ajoutez des titres depuis le cloud ou cet appareil.' })]));
  pick.onchange = () => { const l = [...pick.files].map(f => ({ name: f.name, blob: f })); pick.value = ''; if (!l.length) return; P.q = P.q.concat(l); P.mode = 'folder'; P.draw(); if (P.a.paused && !P.a.src) play(P.q.length - l.length); };
  P.w = win('Lecteur de musique', 'music', [
    el('div', { className: 'pcard' }, P.cover, P.title, P.meta, pr, el('div', { className: 'row' }, tm, el('span', { style: 'flex:1' }), P.stat),
      el('div', { className: 'ctl' }, shB, btn('', 'prev', () => nextTrack(-1), '', 'Précédent'), playB, btn('', 'next', () => nextTrack(1), '', 'Suivant'), loopB),
      el('div', { className: 'row' }, btn('Paroles', 'note', lyricsWin, '', 'Afficher les paroles dans une nouvelle fenêtre'), castBtn(), provBtn(() => (P.q[P.i] || {}).c), el('span', { className: 'grow' }), el('div', { className: 'vol' }, ico('vol', 18), vol))),
    el('div', { className: 'row' }, sel, btn('Charger', 'play', () => {
      const l = D.pl[sel.value]; if (!l) return toast('Choisissez une playlist.');
      P.q = l.map(t => ({ name: t.name, path: t.path, c: D.conns.find(c => c.id === t.cid) })).filter(t => t.c); P.mode = 'pl'; P.plName = sel.value;
      if (!P.q.length) { P.draw(); return toast('Playlist vide (ou stockage supprimé).'); } play(0);
    }),
    btn('Nouvelle', 'plus', async () => {
      const r = await dialog('Nouvelle playlist', [{ k: 'n', label: 'Nom de la playlist', req: true, max: 40 }], 'Créer', { check: v => RESERVED.has(v.n.trim()) || v.n.trim() in D.pl ? 'Ce nom est déjà utilisé ou interdit.' : '' });
      if (r) { D.pl[r.n.trim()] = []; save(); pls(); sel.value = r.n.trim(); }
    }),
    btn('Tout ajouter', 'plus', () => { let n = 0; for (const t of P.q) if (addTo(t, true)) n++; toast(sel.value ? n + ' titre(s) ajouté(s).' : 'Choisissez d’abord une playlist.'); }),
    btn('', 'trash', async () => { if (sel.value && await confirmBox('Supprimer la playlist « ' + sel.value + ' » ?', 'Supprimer', true)) { delete D.pl[sel.value]; save(); pls(); } }, 'dng', 'Supprimer la playlist'),
    btn('Fichiers locaux…', 'upload', () => pick.click()), pick,
    btn('Depuis le cloud…', 'cloud', async () => { const r = await pickCloud(['audio'], 'add'); if (r && r.files.length) { const was = P.q.length; P.q = P.q.concat(r.files); P.mode = 'folder'; P.draw(); if (P.a.paused && !P.a.src) play(was); } }),
    btn('Vider la liste', 'trash', clearQ, 'dng', 'Vider la liste de lecture (les fichiers ne sont pas supprimés)')), ql], { w: 520, h: 700, onclose: () => { P.a.pause(); P.tok++; freeAudio(); P.a.removeAttribute('src'); } });
  pls(); P.draw();
}

/* ===================== Éditeur de texte enrichi ===================== */
const OK_TAGS = new Set('B I U S STRIKE STRONG EM P BR DIV SPAN H1 H2 H3 UL OL LI A FONT BLOCKQUOTE'.split(' '));
const DROP_TAGS = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|SVG|MATH|TEMPLATE|NOSCRIPT)$/;
const CSS_OK = /^(color|background-color|font-size|text-align|font-weight|font-style|text-decoration(-line)?)$/, VAL_OK = /^[#\w\s%.,()-]+$/;
function clean(html) {   // assainisseur à liste blanche : tout le HTML affiché dans l'éditeur passe ici
  const d = new DOMParser().parseFromString(String(html), 'text/html'), root = document.createElement('div');
  (function walk(n, to) {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) to.append(c.textContent);
      else if (c.nodeType === 1) {
        if (!OK_TAGS.has(c.tagName)) { if (!DROP_TAGS.test(c.tagName)) walk(c, to); continue; }
        const e = document.createElement(c.tagName);
        if (c.tagName === 'A') { const h = httpUrl(c.getAttribute('href')); if (h) { e.href = h; e.rel = 'noopener noreferrer'; e.target = '_blank'; } }
        if (c.tagName === 'FONT') { const col = c.getAttribute('color'), sz = c.getAttribute('size'); if (/^#[0-9a-f]{3,8}$/i.test(col)) e.setAttribute('color', col); if (/^[1-7]$/.test(sz)) e.setAttribute('size', sz); }
        for (const r of (c.getAttribute('style') || '').split(';')) { const [k, v] = r.split(':').map(x => x && x.trim()); if (k && v && CSS_OK.test(k) && VAL_OK.test(v)) e.style.setProperty(k, v); }
        walk(c, e); to.append(e);
      }
    }
  })(d.body, root);
  return root.innerHTML;
}
function editor(name, src, dest) {
  const ed = el('div', { className: 'ed', contentEditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Zone de texte' });
  if ('html' in src) ed.innerHTML = clean(src.html); else ed.append(...String(src.text).split('\n').map(l => el('div', {}, l || el('br'))));
  const nm = el('input', { value: name, maxLength: 80, 'aria-label': 'Nom du document' }), docs = el('select');
  let range = null;
  ed.onblur = () => { const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) range = s.getRangeAt(0).cloneRange(); };
  const cmd = (c, v) => {
    if (document.activeElement !== ed) { ed.focus(); if (range) { const s = getSelection(); s.removeAllRanges(); s.addRange(range); } }
    document.execCommand(c, false, v);
  };
  const tool = (t, title, c, v) => el('button', { type: 'button', title, 'aria-label': title, textContent: t, onmousedown: e => { e.preventDefault(); cmd(c, v); } });
  const size = el('select', { title: 'Taille de police', onchange: () => cmd('fontSize', size.value) }); opts(size, [1, 2, 3, 4, 5, 6, 7].map(n => [n, 'Taille ' + n])); size.value = 3;
  const fill = () => opts(docs, [['', 'Mes documents…'], ...Object.keys(D.docs).map(k => [k, k])]);
  docs.onchange = () => { if (docs.value in D.docs) { nm.value = docs.value; ed.innerHTML = clean(D.docs[docs.value]); } };
  const dst = el('select', { 'aria-label': 'Stockage' }), pth = el('input', { placeholder: '/dossier/fichier.txt', maxLength: 500, 'aria-label': 'Chemin' });
  opts(dst, [['', 'Enregistrer sur un stockage…'], ...D.conns.map(c => [c.id, c.name])]);
  if (dest) { dst.value = dest.cid; pth.value = dest.path; } else pth.value = '/' + name;
  const stem = () => nm.value.replace(/\.\w+$/, '') || 'document';
  const saveRemote = async () => {
    const c = D.conns.find(x => x.id === dst.value); if (!c) return toast('Choisissez un stockage.');
    let path = pth.value.trim(); if (!path.startsWith('/')) path = '/' + path;
    if (path.split('/').includes('..') || path.endsWith('/')) return toast('Chemin invalide.');
    const rich = /\.html?$/i.test(path), data = rich ? clean(ed.innerHTML) : ed.innerText;
    try { await FS.write(c, path, new Blob([data])); toast('Enregistré : ' + path); } catch (e) { toast(e.message, 6000); }
  };
  win('Éditeur — ' + name, 'file', [
    el('div', { className: 'row' }, nm, docs),
    el('div', { className: 'tools' }, tool('G', 'Gras', 'bold'), tool('I', 'Italique', 'italic'), tool('S', 'Souligné', 'underline'), tool('B', 'Barré', 'strikeThrough'),
      tool('T', 'Titre', 'formatBlock', 'h2'), tool('¶', 'Paragraphe', 'formatBlock', 'p'), tool('•', 'Liste à puces', 'insertUnorderedList'), tool('1.', 'Liste numérotée', 'insertOrderedList'),
      tool('⇤', 'Aligner à gauche', 'justifyLeft'), tool('↔', 'Centrer', 'justifyCenter'), tool('⇥', 'Aligner à droite', 'justifyRight'), size,
      el('input', { type: 'color', title: 'Couleur du texte', value: '#000000', oninput: e => cmd('foreColor', e.target.value) }),
      el('input', { type: 'color', title: 'Surlignage', value: '#ffff00', oninput: e => cmd('hiliteColor', e.target.value) }),
      el('button', { type: 'button', title: 'Insérer un lien', 'aria-label': 'Insérer un lien', onmousedown: async e => { e.preventDefault(); const r = await dialog('Insérer un lien', [{ k: 'u', label: 'Adresse du lien', value: 'https://', req: true, max: 500 }], 'Insérer', { check: v => httpUrl(v.u.trim()) ? '' : 'Adresse http(s) invalide.' }); if (r) cmd('createLink', httpUrl(r.u.trim())); } }, ico('link', 16))),
    ed,
    el('div', { className: 'row' }, dst, pth, btn('Enregistrer', 'save', saveRemote, 'pri')),
    el('small', { className: 'mut', textContent: 'Extension .html = texte enrichi (mise en forme conservée) ; autre extension = texte brut.' }),
    el('div', { className: 'row tight' }, btn('Garder dans mes documents', 'save', () => { D.docs[nm.value.trim() || 'sans-titre'] = clean(ed.innerHTML); save(); fill(); toast('Document gardé dans votre profil chiffré.'); }),
      btn('Exporter en TXT', 'download', () => download(new Blob([ed.innerText], { type: 'text/plain' }), stem() + '.txt')),
      btn('Exporter en HTML', 'download', () => download(new Blob(['<meta charset="utf-8">' + clean(ed.innerHTML)], { type: 'text/html' }), stem() + '.html')))], { w: 700, h: 560 });
  fill();
}

/* ===================== Post-it ===================== */
/* Tous les post-it vivent dans une fenêtre défilante ; jusqu'à 5 peuvent être épinglés sur le bureau (données chiffrées avec le profil). */
const MAX_PINS = 5, NOTE_COLORS = ['y', 'p', 'g', 'b', 'o'], NOTE_TA = new Map();
const pinned = () => D.notes.filter(n => n.pin);
function linkTA(n, ta) {   // garde les deux zones de saisie d'un même post-it (liste / bureau) synchronisées sans les re-créer
  ta.value = n.text; ta.maxLength = 2000;
  const set = NOTE_TA.get(n.id) || new Set(); NOTE_TA.set(n.id, set); set.add(ta);
  ta.oninput = () => { n.text = ta.value; n.t = Date.now(); for (const o of set) { if (!o.isConnected) set.delete(o); else if (o !== ta) o.value = ta.value; } save(); };
}
function noteFn(n, again) {
  const colors = el('div', { className: 'row tight sw' }, ...NOTE_COLORS.map(k => el('button', { type: 'button', className: 'swc n-' + k + (n.color === k ? ' on' : ''), title: 'Couleur', 'aria-label': 'Couleur ' + k, onclick: () => { n.color = k; save(); again(); } })));
  return colors;
}
function renderPinned() {
  const layer = $('#notes'); if (!layer) return; layer.replaceChildren();
  if (!D) return;
  for (const n of pinned()) {
    const maxX = Math.max(0, innerWidth - (n.w || 180) - 10), maxY = Math.max(0, innerHeight - (n.h || 190) - 50);
    n.x = Math.min(n.x, maxX); n.y = Math.min(n.y, maxY);
    const ta = el('textarea', { 'aria-label': 'Post-it épinglé', placeholder: 'Écrivez ici…' }); linkTA(n, ta);
    const hd = el('div', { className: 'ph', tabIndex: 0, title: 'Glisser pour déplacer (ou flèches du clavier)' }, ico('pin', 14), el('span', { className: 'grow' }),
      el('button', { type: 'button', title: 'Détacher du bureau (reste dans la liste)', 'aria-label': 'Détacher du bureau', onclick: () => { n.pin = false; save(); renderPinned(); NOTES_DRAW(); } }, ico('x', 13)));
    const grip = el('div', { className: 'pr', tabIndex: 0, role: 'separator', title: 'Glisser pour redimensionner (ou flèches du clavier)', 'aria-label': 'Redimensionner le post-it' });
    const box = el('div', { className: 'pn n-' + n.color, style: `left:${n.x}px;top:${n.y}px` }, hd, ta, grip);
    const sz = (w, h) => {   // taille limitée : 120–640 × 110–640, et jamais plus grande que l'écran restant
      n.w = Math.round(Math.min(640, innerWidth - n.x - 4, Math.max(120, w))); n.h = Math.round(Math.min(640, innerHeight - n.y - 50, Math.max(110, h)));
      box.style.width = n.w + 'px'; box.style.height = n.h + 'px';
    };
    if (n.w) sz(n.w, n.h || 160);
    grip.onpointerdown = e => {
      e.preventDefault(); e.stopPropagation(); grip.setPointerCapture(e.pointerId);
      const x0 = e.clientX, y0 = e.clientY, w0 = box.offsetWidth, h0 = box.offsetHeight;
      grip.onpointermove = m => sz(w0 + m.clientX - x0, h0 + m.clientY - y0);
      grip.onpointerup = () => { grip.onpointermove = grip.onpointerup = null; save(); };
    };
    grip.onkeydown = e => { const d = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[e.key]; if (d) { e.preventDefault(); sz(box.offsetWidth + d[0], box.offsetHeight + d[1]); save(); } };
    const move = (x, y) => { const mx = Math.max(0, innerWidth - box.offsetWidth - 10), my = Math.max(0, innerHeight - box.offsetHeight - 50); n.x = Math.min(mx, Math.max(0, x)); n.y = Math.min(my, Math.max(0, y)); box.style.left = n.x + 'px'; box.style.top = n.y + 'px'; };
    hd.onpointerdown = e => {
      if (e.target.closest('button')) return; e.preventDefault(); hd.setPointerCapture(e.pointerId);
      const dx = e.clientX - n.x, dy = e.clientY - n.y;
      hd.onpointermove = m => move(m.clientX - dx, m.clientY - dy);
      hd.onpointerup = () => { hd.onpointermove = hd.onpointerup = null; save(); };
    };
    hd.onkeydown = e => { const d = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[e.key]; if (d) { e.preventDefault(); move(n.x + d[0], n.y + d[1]); save(); } };
    layer.append(box);
  }
}
let NOTES_DRAW = () => {};
function notesWin() {
  if (UI.notes && UI.notes.isConnected) { UI.notes.hidden = false; UI.notes.style.zIndex = ++Z; return; }
  const list = el('div', { className: 'col notes' }), count = el('small', { className: 'mut' });
  const pinBtn = n => btn(n.pin ? 'Détacher' : 'Épingler', 'pin', () => {
    if (!n.pin && pinned().length >= MAX_PINS) return toast('Maximum ' + MAX_PINS + ' post-it épinglés : détachez-en un d’abord.', 4500);
    n.pin = !n.pin; if (n.pin) { const k = pinned().length - 1; n.x = 130 + k * 196; n.y = 30; } save(); renderPinned(); draw();
  }, n.pin ? 'on' : '', n.pin ? 'Retirer du bureau' : 'Épingler sur le bureau');
  const draw = () => {
    count.textContent = 'Épinglés sur le bureau : ' + pinned().length + ' / ' + MAX_PINS;
    list.replaceChildren(...(D.notes.length ? D.notes.map(n => {
      const ta = el('textarea', { 'aria-label': 'Post-it', placeholder: 'Écrivez ici…' }); linkTA(n, ta);
      return el('div', { className: 'note n-' + n.color }, ta,
        el('div', { className: 'row tight' }, noteFn(n, () => { renderPinned(); draw(); }), el('span', { className: 'grow' }), pinBtn(n),
          btn('', 'trash', async () => { if (!n.text.trim() || await confirmBox('Supprimer ce post-it ?', 'Supprimer', true)) { D.notes = D.notes.filter(x => x !== n); NOTE_TA.delete(n.id); save(); renderPinned(); draw(); } }, 'dng', 'Supprimer le post-it')));
    }) : [el('p', { className: 'mut', textContent: 'Aucun post-it. Cliquez sur « Nouveau post-it ».' })]));
  };
  NOTES_DRAW = draw;
  const add = () => {
    if (D.notes.length >= 300) return toast('Limite de 300 post-it atteinte.');
    const n = { id: uid(), text: '', color: NOTE_COLORS[D.notes.length % NOTE_COLORS.length], pin: false, x: 40, y: 40, t: Date.now() };
    D.notes.unshift(n); save(); draw(); const f = list.querySelector('textarea'); f && f.focus();
  };
  UI.notes = win('Post-it', 'note', [el('div', { className: 'row' }, btn('Nouveau post-it', 'plus', add, 'pri'), el('span', { className: 'grow' }), count), list], { w: 380, h: 520, onclose: () => { NOTES_DRAW = () => {}; UI.notes = null; } });
  draw();
}

/* ===================== Réglages, compte, à propos ===================== */
const ABOUT = 'Bienvenue dans mon PC virtuel sormick Cloud ! Il s’agit d’un mini Windows virtuel ! Vos apps (sur le cloud), vos lecteurs cloud WebDAV accessibles, votre App Store et votre bureau, et tout ceci sans mises à jour contraignantes ! Profitez !';
/* Contact : aucun service ni serveur. Le message est placé dans un nouvel e-mail ouvert par votre messagerie (lien mailto:) ;
   l'adresse du destinataire n'est jamais affichée dans l'interface (elle est seulement encodée dans config.js). */
async function contact() {
  const to = typeof CONTACT === 'object' && CONTACT && CONTACT.to ? CONTACT.to() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return toast('Contact non configuré (config.js).');
  const r = await dialog('Contactez-moi', [
    { k: 'n', label: 'Votre nom (facultatif)', max: 80 },
    { k: 'm', label: 'Votre message', type: 'textarea', req: true, max: 1500 }],
    'Ouvrir mon e-mail', { note: 'Un nouvel e-mail s’ouvrira dans votre messagerie, adressé à moi et déjà rempli : il vous restera à l’envoyer.' });
  if (!r) return;
  const body = (r.n.trim() ? 'De la part de ' + r.n.trim() + '\n\n' : '') + r.m.trim();
  const link = el('a', { href: 'mailto:' + to + '?subject=' + encodeURIComponent('Message depuis sormick Cloud') + '&body=' + encodeURIComponent(body) });
  document.body.append(link); link.click(); link.remove();
  toastAct('Votre messagerie devrait s’ouvrir. Rien ne s’est ouvert ?', 'Copier le message', () => copyText('À : ' + to + '\nObjet : Message depuis sormick Cloud\n\n' + body), 14000);
}
function aboutWin() {
  win('À propos', 'info', [el('div', { className: 'about' }, el('img', { className: 'alogo', src: 'logo.png', alt: 'sormick Cloud', draggable: false }),
    el('p', {}, ABOUT + ' ', el('button', { type: 'button', className: 'lnk', onclick: () => contact() }, 'Contactez-moi.')))], { w: 460, h: 480 });
}
function tutoBox() {
  const nm = el('b', { className: 'grow' });
  const upd = () => { nm.textContent = D.tuto ? D.tuto.name : 'Aucun PDF choisi'; op.disabled = rm.disabled = !D.tuto; };
  const op = btn('Ouvrir', 'book', () => tutoOpen()), rm = btn('Retirer', 'trash', async () => { await tutoRemove(); upd(); }, 'dng'),
    ch = btn('Choisir / remplacer le PDF…', 'upload', async () => { if (await tutoChoose(false)) { upd(); } });
  upd();
  return el('div', { className: 'fld' }, el('span', { textContent: 'Tutoriel (PDF) — bouton « Tutoriel » de la barre des tâches' }), el('div', { className: 'row tight' }, nm), el('div', { className: 'row tight' }, op, ch, rm),
    el('small', { className: 'mut', textContent: 'Le PDF est choisi sur cet appareil et enregistré dans ce navigateur pour votre compte (non chiffré, jamais envoyé en ligne). Il est inclus dans « Exporter mon profil ». Pour le mettre à jour, choisissez simplement le nouveau fichier.' }));
}
function settings() {
  const proxy = el('input', { placeholder: 'https://passerelle.exemple.org (facultatif)', value: D.proxy, maxLength: 500 });
  const tok = el('input', { type: 'password', placeholder: D.ptoken ? '•••••••• (inchangé)' : 'Jeton de la passerelle', autocomplete: 'new-password', maxLength: 300 });
  const lockM = el('input', { type: 'number', min: 0, max: 240, value: D.lock });
  const ddg = el('input', { type: 'checkbox', checked: D.ddg });
  const submit = () => {
    const v = proxy.value.trim().replace(/\/$/, '');
    if (v && !(/^https:\/\//i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(v)) || (v && !httpUrl(v))) return toast('Passerelle : adresse https:// requise (http seulement en localhost).', 5000);
    D.proxy = v; if (tok.value) D.ptoken = tok.value; if (!v) D.ptoken = '';
    D.lock = Math.min(240, Math.max(0, Math.round(+lockM.value || 0))); D.ddg = ddg.checked;
    save(); armIdle(); tok.value = ''; toast('Réglages enregistrés.');
  };
  win('Réglages', 'sliders', [
    el('label', { className: 'fld' }, el('span', { textContent: 'Verrouillage automatique après inactivité (minutes, 0 = jamais)' }), lockM),
    el('label', { className: 'row tight' }, ddg, el('span', { textContent: 'Chercher l’icône d’un site via DuckDuckGo si le site n’en fournit pas (révèle le nom du site à ce service)' })),
    tutoBox(),
    el('details', { className: 'frm' }, el('summary', { textContent: 'Passerelle auto-hébergée (facultatif)' }), el('div', { className: 'col' },
      el('small', { className: 'mut', textContent: 'Inutile pour WebDAV et pour la plupart des apps. Inutile pour WebDAV. Sert uniquement à afficher dans le bureau les sites qui interdisent l’intégration, ou à relayer un WebDAV sans CORS. Adresse et jeton sont chiffrés dans votre profil.' }), proxy, tok)),
    el('div', { className: 'row end' }, btn('Enregistrer', 'save', submit, 'pri'))], { w: 560, h: 440 });
}
function accountWin() {
  const u = SESSION.user;
  const chg = async () => {
    const r = await dialog('Changer le mot de passe', [
      { k: 'o', label: 'Mot de passe actuel', type: 'password', req: true, max: 200 }, { k: 'n', label: 'Nouveau mot de passe (8 caractères minimum)', type: 'password', req: true, max: 200 }, { k: 'c', label: 'Confirmer le nouveau mot de passe', type: 'password', req: true, max: 200 }],
      'Changer', { check: v => v.n !== v.c ? 'Les mots de passe diffèrent.' : v.n.length < 8 ? 'Mot de passe : 8 caractères minimum.' : '' });
    if (!r) return;
    const t = toast('Re-chiffrement du profil…', 0);
    try { await changePassword(r.o, r.n); t.close(); toast('Mot de passe modifié.'); } catch (e) { t.close(); toast(e.message, 5000); }
  };
  const exp = async () => {
    if (!(await confirmBox('Le fichier contient votre profil CHIFFRÉ (inutilisable sans votre mot de passe), mais aussi, EN CLAIR : votre catalogue de raccourcis (App Store), les miniatures de la playlist et le PDF du tutoriel. Il peut être volumineux. Gardez-le en lieu sûr. Continuer ?', 'Exporter'))) return;
    const t = toast('Préparation de l’export…', 0);
    try { download(new Blob([await exportProfile()], { type: 'application/json' }), 'sormick-' + u.name.replace(/[^\w-]+/g, '_') + '.profil.json'); t.close(); toast('Profil exporté (profil chiffré ; catalogue, miniatures et PDF en clair).', 6000); } catch (e) { t.close(); toast(e.message); }
  };
  const del = async () => {
    const r = await dialog('Supprimer mon compte', [{ k: 'p', label: 'Mot de passe', type: 'password', req: true, max: 200 }], 'Supprimer définitivement', { danger: true, note: 'Votre bureau, vos connexions, playlists et documents seront effacés de cet appareil. Votre catalogue de raccourcis (App Store), vos miniatures et votre PDF de tutoriel seront aussi effacés. Les autres utilisateurs ne sont pas touchés.' });
    if (!r) return;
    const t = toast('Suppression…', 0);
    try { await deleteUser(u.id, r.p); thumbPurge(u.id).catch(() => {}); t.close(); showLogin(); toast('Compte supprimé.'); } catch (e) { t.close(); toast(e.message, 5000); }
  };
  const apk = avatarPicker(u.av, () => u.name), head = el('div', { className: 'row' });
  const showHead = () => head.replaceChildren(avatar(u, 56), el('div', {}, el('b', { textContent: u.name }), el('div', { className: 'mut', textContent: 'Données chiffrées sur cet appareil' })));
  showHead();
  const avBox = el('details', { className: 'frm' }, el('summary', { textContent: 'Changer mon avatar' }), el('div', { className: 'col' }, apk.node,
    el('small', { className: 'mut', textContent: 'L’avatar est visible sur l’écran de connexion de cet appareil (il n’est donc pas chiffré).' }),
    btn('Enregistrer l’avatar', 'save', () => { if (setAvatar(apk.get())) { UI.me.replaceChildren(avatar(u, 34), el('span', { textContent: u.name })); showHead(); toast('Avatar enregistré.'); } else toast('Stockage local indisponible.'); }, 'pri')));
  win('Mon compte', 'user', [
    head, avBox, syncBox(),
    btn('Verrouiller / changer d’utilisateur', 'logout', () => lockNow(), 'pri'), btn('Changer le mot de passe', 'lock', chg),
    btn('Exporter mon profil (chiffré)', 'download', exp), btn('Supprimer mon compte', 'trash', del, 'dng')], { w: 460, h: 560 });
}

/* ===================== Session : connexion, verrouillage ===================== */
let D = null;                       // données déchiffrées de l'utilisateur connecté
const UI = { idle: null, me: null, notes: null, mailAt: 0 };
function armIdle() {
  clearTimeout(UI.idle);
  if (!D || !D.lock) return;
  UI.idle = setTimeout(() => { if (!P.a.paused) return armIdle(); lockNow(); }, D.lock * 60000);
}
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { if (D) armIdle(); }, true);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
async function lockNow() { if (BK.dirty && D && D.sync && D.sync.auto && bkConn()) await backupNow(true); await flush(); P.a.pause(); streamClear(); lock(); showLogin(); }

function legacySeed() {   // reprise des anciennes données en clair (version précédente), puis chiffrement
  let o; try { o = JSON.parse(localStorage.getItem('vd') || 'null'); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  if (Array.isArray(o.apps)) for (const a of o.apps) {
    const h = a && typeof a.name === 'string' && httpUrl(a.url);
    if (h && !G.apps.some(x => x.url === h && x.name === a.name)) G.apps.push({ id: str(a.id, 60) || uid(), name: str(a.name, 40), url: h, cat: str(a.cat, 30), desc: '', mode: a.mode === 'tab' ? 'tab' : 'auto', img: '' });
  }
  saveG();
  return { desk: o.desk, wp: o.wp && o.wp.t === 'u' ? o.wp : undefined, conns: Array.isArray(o.conns) ? o.conns.map(c => ({ ...c, pass: '' })) : [], pl: o.pl, docs: o.docs, proxy: o.proxy };
}
const head = () => [el('div', { className: 'brand' }, ico('cloud', 30), el('h1', { textContent: 'sormick Cloud' })), el('p', { className: 'mut', textContent: 'Votre PC virtuel dans le navigateur' })];
function createForm(card, first) {
  const nm = el('input', { placeholder: 'Nom d’utilisateur', maxLength: 24, autocomplete: 'username' });
  const p1 = el('input', { type: 'password', placeholder: 'Mot de passe (8 caractères minimum)', autocomplete: 'new-password' });
  const p2 = el('input', { type: 'password', placeholder: 'Confirmer le mot de passe', autocomplete: 'new-password', onkeydown: e => { if (e.key === 'Enter') go(); } });
  const ap = avatarPicker('', () => nm.value.trim().charAt(0).toUpperCase()); nm.addEventListener('input', () => ap.refresh());
  const go = async () => {
    if (p1.value !== p2.value) return toast('Les mots de passe diffèrent.');
    const t = toast('Création du profil chiffré…', 0);
    try {
      const seed = first ? legacySeed() : null, id = await createUser(nm.value, p1.value, seed, ap.get());
      if (seed) { localStorage.removeItem('vd'); toast('Anciennes données reprises et chiffrées.', 5000); }
      await login(id, p1.value); t.close(); enter();
    } catch (e) { t.close(); toast(e.message, 5000); }
  };
  card.replaceChildren(...head(), el('h2', { textContent: first ? 'Créez votre premier utilisateur' : 'Nouvel utilisateur' }), el('small', { className: 'mut', textContent: 'Choisissez votre avatar (visible sur l’écran de connexion) :' }), ap.node, nm, p1, p2,
    el('small', { className: 'mut', textContent: 'Votre mot de passe chiffre vos données sur cet appareil. Il ne peut pas être récupéré : conservez-le (12 caractères ou plus recommandés).' }),
    btn('Créer et se connecter', 'user', go, 'pri wide'), first ? btn('Restaurer depuis mon cloud', 'cloud', restoreDlg, '', 'Retrouver vos profils sauvegardés dans votre cloud WebDAV (autre ordinateur)') : btn('Retour', 'up', () => showLogin()));
  nm.focus();
}
function showLogin(sel) {
  closeAll(); D = null; NOTE_TA.clear(); clearTimeout(UI.idle); $('#icons').replaceChildren(); $('#notes').replaceChildren(); $('#bar').hidden = true; applyWp();
  const L = $('#login'), card = el('div', { className: 'lg' }); L.hidden = false; L.replaceChildren(card);
  if (!G.users.length) return createForm(card, true);
  const pick = G.users.find(u => u.id === sel) || G.users.find(u => u.id === G.last) || G.users[0];
  const pw = el('input', { type: 'password', placeholder: 'Mot de passe de ' + pick.name, autocomplete: 'current-password', onkeydown: e => { if (e.key === 'Enter') go(); } });
  const go = async () => {
    if (!pw.value) return pw.focus();
    const t = toast('Déverrouillage…', 0);
    try { await login(pick.id, pw.value); t.close(); enter(); } catch (e) { t.close(); toast(e.message, 5000); pw.value = ''; pw.focus(); }
  };
  const imp = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  imp.onchange = async () => {
    const f = imp.files[0]; imp.value = ''; if (!f) return;
    try { const id = await importProfile(await f.text()); toast('Profil importé : saisissez son mot de passe.', 5000); showLogin(id); } catch (e) { toast(e.message, 5000); }
  };
  card.append(...head(), el('div', { className: 'utiles' }, ...G.users.map(u => el('button', { type: 'button', className: 'ut' + (u.id === pick.id ? ' on' : ''), onclick: () => showLogin(u.id) }, avatar(u, 64), el('span', { textContent: u.name })))),
    pw, btn('Se connecter', 'lock', go, 'pri wide'),
    el('div', { className: 'row center' }, btn('Nouvel utilisateur', 'plus', () => createForm(card, false)), btn('Importer un profil', 'upload', () => imp.click()), imp),
    el('div', { className: 'row center' }, btn('Restaurer depuis mon cloud', 'cloud', restoreDlg, '', 'Retrouver vos profils sauvegardés dans votre cloud WebDAV (autre ordinateur)')));
  pw.focus();
}
function enter() {
  D = SESSION.data; $('#login').hidden = true; $('#bar').hidden = false;
  D.desk = D.desk.filter(id => appById(id));
  UI.me.replaceChildren(avatar(SESSION.user, 34), el('span', { textContent: SESSION.user.name }));
  applyWp(); renderDesk(); renderPinned(); armIdle();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* facultatif : demande au navigateur de ne pas effacer ces données */ }
  if (!D.welcomed) { D.welcomed = true; save(); aboutWin(); }
}

/* ===================== Barre des tâches et démarrage ===================== */
const toggleFull = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { toast('Le navigateur a refusé le plein écran.'); } };
const TILES = [
  ['App Store', 'store', ['#f6b73c', '#e8742c'], storeWin], ['Mes apps', 'grid', ['#5b9bff', '#6a5cff'], myApps], ['IA', 'spark', ['#c07bff', '#6a4cff'], aiApps], ['Lecteurs WebDAV', 'cloud', ['#35c8ea', '#3a7bd5'], drivesWin], ['Tutoriel', 'book', ['#ff8a65', '#e0523a'], () => tutoOpen()], ['Post-it', 'note', ['#ffd84d', '#f0a21a'], () => notesWin()],
  ['Fond d’écran', 'image', ['#b78bff', '#6c4cd1'], wpWin], ['Réglages', 'sliders', ['#8fa0b8', '#566277'], settings], ['À propos', 'info', ['#5ad1c4', '#2b9b94'], aboutWin], ['Plein écran', 'full', ['#7a8ba8', '#46546e'], toggleFull]
];
function buildBar() {
  UI.me = el('button', { type: 'button', id: 'me', title: 'Mon compte', onclick: accountWin });
  $('#bar').replaceChildren(UI.me, el('span', { className: 'sep' }),
    ...TILES.map(([label, icon, [c1, c2], f]) => el('button', { type: 'button', className: 'tile', title: label, 'aria-label': label, onclick: f },
      el('span', { className: 'ti', style: `--c1:${c1};--c2:${c2}` }, ico(icon, 22)), el('span', { className: 'tl', textContent: label }))),
    el('span', { className: 'sep' }), el('div', { id: 'tasks' }), el('div', { id: 'clock' }));
  [...$('#bar').querySelectorAll('.tile')].pop().dataset.fs = '1';
}
document.addEventListener('fullscreenchange', () => { const b = document.querySelector('#bar .tile[data-fs]'); if (!b) return; const t = document.fullscreenElement ? 'Quitter le plein écran (Échap)' : 'Plein écran'; b.title = t; b.setAttribute('aria-label', t); });
function tick() {
  const d = new Date();
  $('#clock').replaceChildren(el('b', { textContent: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }), d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }));
}
try {
  if (!window.isSecureContext || !crypto.subtle) throw new Error('Contexte non sécurisé : ouvrez le site en HTTPS (GitHub Pages) ou sur localhost.');
  onSaveError = () => toast('Enregistrement impossible : espace de stockage du navigateur plein. Supprimez des documents ou un fond d’écran volumineux.', 9000);
  buildBar(); tick(); setInterval(tick, 20000); $('#desk').addEventListener('contextmenu', deskMenu); showLogin();
  $('#boot').remove();
} catch (e) { $('#boot').textContent = 'Erreur de démarrage : ' + e.message; }
