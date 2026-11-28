'use strict';
/* sormick Cloud — lecteurs intégrés : sélecteur de fichiers cloud, lecture en continu, visionneuse d'images, lecteur vidéo + sous-titres.
   Chargé avant app.js ; n'utilise ses fonctions (el, win, btn, FS, getBlob…) qu'au moment de l'appel. Aucune donnée distante n'entre
   dans la page via innerHTML. */

/* ===================== Choisir un fichier sur un stockage WebDAV ===================== */
/* pickCloud(types, 'open') → { files, i, siblings } ; pickCloud(types, 'add') → { files } ; null si annulé. */
function pickCloud(kinds, mode = 'open') {
  return new Promise(res => {
    if (!D.conns.length) { toast('Aucun stockage connecté : ouvrez « Stockage cloud » pour en ajouter un.', 5000); return res(null); }
    let c = D.conns[0], p = '/', all = [], fin = false, tok = 0; const sel = new Set();
    const finish = v => { if (fin) return; fin = true; w.close(); res(v); };
    const entry = n => ({ name: n, c, path: joinP(p, n) });
    const crumb = el('b', { className: 'crumb' }), list = el('div', { className: 'flist' }), foot = el('div', { className: 'row end' });
    const cs = el('select', { 'aria-label': 'Stockage' }); opts(cs, D.conns.map(x => [x.id, x.name])); cs.hidden = D.conns.length < 2;
    cs.onchange = () => { c = D.conns.find(x => x.id === cs.value); load('/'); };
    const files = () => all.filter(f => !f.dir && kinds.includes(kindOf(f.name)));
    const sibs = () => all.filter(f => !f.dir).map(f => entry(f.name));
    const drawFoot = () => {
      const fl = files();
      foot.replaceChildren(...(mode === 'add'
        ? [btn('Ajouter la sélection (' + sel.size + ')', 'plus', () => sel.size && finish({ files: fl.filter(f => sel.has(f.name)).map(f => entry(f.name)) }), 'pri'), btn('Tout le dossier (' + fl.length + ')', 'plus', () => fl.length && finish({ files: fl.map(f => entry(f.name)) }))]
        : [btn('Tout le dossier (' + fl.length + ')', 'play', () => fl.length && finish({ files: fl.map(f => entry(f.name)), i: 0, siblings: sibs() }))]));
    };
    const draw = () => {
      const fl = files(), dirs = all.filter(f => f.dir), icon = { audio: 'music', video: 'video', image: 'image' };
      const rows = [...dirs.map(d => el('div', { className: 'li', tabIndex: 0, role: 'button', onclick: () => load(joinP(p, d.name)), onkeydown: e => { if (e.key === 'Enter') load(joinP(p, d.name)); } }, ico('folder', 18), el('span', { textContent: d.name }))),
        ...fl.map(f => {
          const go = () => { if (mode === 'add') { sel.has(f.name) ? sel.delete(f.name) : sel.add(f.name); draw(); } else finish({ files: fl.map(x => entry(x.name)), i: fl.indexOf(f), siblings: sibs() }); };
          return el('div', { className: 'li' + (sel.has(f.name) ? ' on' : ''), tabIndex: 0, role: 'button', onclick: go, onkeydown: e => { if (e.key === 'Enter') go(); } }, ico(icon[kindOf(f.name)] || 'file', 18), el('span', { textContent: f.name }), el('small', { className: 'mut', textContent: fmtSize(f.size) }), el('small', { className: 'mut fdt', title: dateTitle(f), textContent: fmtDate(f.mod || f.cre) }));
        })];
      list.replaceChildren(...(rows.length ? rows : [el('p', { className: 'mut', textContent: 'Aucun dossier ni fichier de ce type ici.' })])); drawFoot();
    };
    const load = async q => {
      const my = ++tok; list.replaceChildren(el('p', { className: 'mut', textContent: 'Chargement…' }));
      try {
        const items = sortFiles((await FS.list(c, q)).filter(x => x.name).map(x => ({ ...x, name: String(x.name) })));
        if (my !== tok) return; p = q; all = items; sel.clear(); crumb.textContent = c.name + ' · ' + p; draw();
      } catch (e) { const m = e.code === 'net' ? (await testConn(c)).msg : e.message; if (my === tok) list.replaceChildren(el('div', { className: 'warn', textContent: m }), btn('Réessayer', 'refresh', () => load(q))); }
    };
    const srt = el('select', { 'aria-label': 'Trier par', title: 'Trier par : nom, date de modification ou taille' }); opts(srt, FSORTS); srt.value = FSORTS.some(s => s[0] === D.fsort) ? D.fsort : 'n'; srt.onchange = () => { D.fsort = srt.value; save(); all = sortFiles(all); draw(); };
    const w = win('Choisir dans le cloud', 'cloud', [el('div', { className: 'row' }, cs, btn('', 'up', () => load(parentP(p)), '', 'Dossier parent'), crumb, provBtn(() => c), srt), list, foot],
      { w: 540, h: 500, onclose: () => { if (!fin) { fin = true; res(null); } } });
    load('/');
  });
}
function chooseLocal(accept, cb) {   // fichiers de cet appareil
  const i = el('input', { type: 'file', accept, multiple: true, hidden: true });
  i.onchange = () => { const l = [...i.files].map(f => ({ name: f.name, blob: f })); i.remove(); if (l.length) cb(l); };
  document.body.append(i); i.click();
}
const cleanName = n => String(n).replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').replace(/\b(1080p|720p|2160p|4k|x26[45]|h26[45]|bluray|brrip|web-?dl|webrip|hdtv|dvdrip|aac|ac3|dts|hevc|10bit|multi|vostfr|french|truefrench)\b.*$/i, '').replace(/\s+/g, ' ').trim();
const typed = (b, name) => { const m = mimeOf(name); return m !== 'application/octet-stream' && b.type !== m ? new Blob([b], { type: m }) : b; };

/* ===================== Lecture en continu (Service Worker), sans proxy ===================== */
/* Un fichier WebDAV est servi au lecteur par sw.js (de ce site), qui ajoute Authorization et Range : pas de téléchargement complet,
   déplacement dans la vidéo possible, gros fichiers acceptés. Les identifiants ne quittent jamais le navigateur. */
const STREAM = { p: null, map: new Map() };
function streamInit() {
  if (STREAM.p) return STREAM.p;
  return STREAM.p = (async () => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return false;
    try {
      STREAM.reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(r => { navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }); setTimeout(r, 2000); });
      navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'need' && e.ports[0]) e.ports[0].postMessage(STREAM.map.get(e.data.id) || null); });
      return !!navigator.serviceWorker.controller;
    } catch { return false; }
  })();
}
async function streamUrl(t) {   // → { url, release } ou null (alors : téléchargement complet)
  if (t.blob || !t.c || !(await streamInit())) return null;
  const rel = relayOn() && t.c.relay === true, id = uid(), d = { url: rel ? viaRelay(davUrl(t.c, t.path)) : davUrl(t.c, t.path), auth: authHeader(t.c), mime: mimeOf(t.name), ...(rel && relayCfg().tok ? { tok: relayCfg().tok } : {}) };
  STREAM.map.set(id, d); navigator.serviceWorker.controller.postMessage({ type: 'reg', id, ...d });
  return { url: new URL('_dav/' + id + '/' + encodeURIComponent(t.name), STREAM.reg.scope).href, release: () => { STREAM.map.delete(id); const c = navigator.serviceWorker.controller; c && c.postMessage({ type: 'del', id }); } };
}
function streamClear() { STREAM.map.clear(); const c = 'serviceWorker' in navigator && navigator.serviceWorker.controller; c && c.postMessage({ type: 'clear' }); }

/* ===================== Visionneuse d'images ===================== */
const SUBRE = /\.(srt|vtt|ass|ssa)$/i;
const IV = { w: null };
function imageWin(files, i = 0) {
  if (IV.w && IV.w.isConnected) { IV.w.hidden = false; IV.w.style.zIndex = ++Z; if (files) IV.set(files, i); return; }
  let q = [], idx = 0, z = 1, px = 0, py = 0, rot = 0, fit = 1, url = null, tok = 0, slide = null;
  const img = el('img', { className: 'iv-img', alt: '', draggable: false, hidden: true }), msg = el('div', { className: 'iv-msg' }), info = el('small', { className: 'mut grow' });
  const stage = el('div', { className: 'iv-stage', tabIndex: 0, 'aria-label': 'Image' }, img, msg), zl = el('small', { className: 'mut', textContent: '100 %' });
  const apply = () => { img.style.transform = `translate(${px}px,${py}px) rotate(${rot}deg) scale(${z * fit})`; zl.textContent = Math.round(z * fit * 100) + ' %'; };
  const calcFit = () => { const nw = img.naturalWidth, nh = img.naturalHeight; if (!nw) return; const [a, b] = rot % 180 ? [nh, nw] : [nw, nh]; fit = Math.min(stage.clientWidth / a, stage.clientHeight / b) || 1; };
  const reset = (cap) => { calcFit(); z = cap ? Math.min(1, 1 / fit) : 1; px = py = 0; apply(); };
  const zoom = f => { z = Math.min(60, Math.max(0.05, z * f)); apply(); };
  const empty = () => { img.hidden = true; msg.hidden = false; msg.replaceChildren(el('p', { textContent: 'Ouvrez des images depuis votre stockage cloud ou cet appareil (ou glissez-les ici).' })); info.textContent = ''; };
  const showIdx = async n => {
    if (!q.length) return empty();
    idx = (n + q.length) % q.length; const t = q[idx], my = ++tok;
    info.textContent = t.name + ' · ' + (idx + 1) + ' / ' + q.length; msg.hidden = false; msg.textContent = 'Chargement…'; img.hidden = true;
    try {
      const b = typed(await getBlob(t), t.name); if (my !== tok) return;
      const old = url; url = URL.createObjectURL(b);
      img.onload = () => { if (my !== tok) return; msg.hidden = true; img.hidden = false; rot = 0; reset(true); if (old) URL.revokeObjectURL(old); };
      img.onerror = () => { if (my !== tok) return; msg.replaceChildren(el('p', { textContent: 'Ce format d’image n’est pas pris en charge par le navigateur.' }), btn('Télécharger', 'download', () => download(b, t.name))); if (old) URL.revokeObjectURL(old); };
      img.src = url;
    } catch (e) { if (my === tok) msg.textContent = e.message || 'Lecture impossible.'; }
  };
  const go = d => { if (q.length > 1) showIdx(idx + d); };
  const stop = () => { clearInterval(slide); slide = null; slideB.classList.remove('on'); };
  const slideB = btn('', 'play', () => { if (slide) return stop(); if (q.length > 1) { slide = setInterval(() => go(1), 4000); slideB.classList.add('on'); } }, '', 'Diaporama (4 s)');
  const open = r => { if (r) { q = r.files; stop(); showIdx(r.i || 0); } };
  stage.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  stage.onpointerdown = e => { if (img.hidden) return; stage.setPointerCapture(e.pointerId); const x0 = e.clientX - px, y0 = e.clientY - py; stage.onpointermove = m => { px = m.clientX - x0; py = m.clientY - y0; apply(); }; stage.onpointerup = () => { stage.onpointermove = stage.onpointerup = null; }; };
  stage.ondblclick = () => { Math.abs(z * fit - 1) < 0.01 ? reset(false) : (z = 1 / fit, px = py = 0, apply()); };
  stage.onkeydown = e => {
    const k = { ArrowLeft: () => go(-1), ArrowRight: () => go(1), '+': () => zoom(1.25), '=': () => zoom(1.25), '-': () => zoom(0.8), 0: () => reset(false), r: () => { rot = (rot + 90) % 360; reset(false); }, ' ': () => slideB.click(), f: () => stage.requestFullscreen && stage.requestFullscreen() }[e.key];
    if (k) { e.preventDefault(); k(); }
  };
  stage.ondragover = e => e.preventDefault();
  stage.ondrop = e => { e.preventDefault(); const l = [...e.dataTransfer.files].filter(f => kindOf(f.name) === 'image').map(f => ({ name: f.name, blob: f })); if (l.length) open({ files: l, i: 0 }); };
  const ro = new ResizeObserver(() => { if (!img.hidden) { calcFit(); apply(); } }); ro.observe(stage);
  const bar = el('div', { className: 'row tight vwbar' },
    btn('', 'prev', () => go(-1), '', 'Image précédente'), btn('', 'next', () => go(1), '', 'Image suivante'), btn('', 'minus', () => zoom(0.8), '', 'Zoom arrière'), zl, btn('', 'plus', () => zoom(1.25), '', 'Zoom avant'),
    btn('Ajuster', '', () => reset(false)), btn('1:1', '', () => { z = 1 / fit; px = py = 0; apply(); }, '', 'Taille réelle'),
    btn('', 'rotl', () => { rot = (rot + 270) % 360; reset(false); }, '', 'Pivoter à gauche'), btn('', 'rotr', () => { rot = (rot + 90) % 360; reset(false); }, '', 'Pivoter à droite'),
    slideB, btn('', 'full', () => stage.requestFullscreen && stage.requestFullscreen(), '', 'Plein écran'), btn('', 'download', () => q[idx] && getBlob(q[idx]).then(b => download(b, q[idx].name)), '', 'Télécharger'));
  const bar2 = el('div', { className: 'row tight vwbar' }, btn('Depuis le cloud…', 'cloud', async () => open(await pickCloud(['image'])), 'pri'), btn('Depuis cet appareil…', 'upload', () => chooseLocal('image/*', l => open({ files: l, i: 0 }))), provBtn(() => (q[idx] || {}).c), info);
  IV.set = (f, n) => open({ files: f, i: n });
  IV.w = win('Visionneuse d’images', 'image', [bar2, bar, stage], { w: 820, h: 600, cls: 'vw', onclose: () => { stop(); ro.disconnect(); tok++; if (url) URL.revokeObjectURL(url); } });
  if (files) open({ files, i }); else empty();
}

/* ===================== Sous-titres : lecture des fichiers SRT / VTT / ASS ===================== */
/* Anciens fichiers non UTF-8 : l’encodage dépend de la langue (russe, arabe, japonais, chinois…), sinon les lettres s’affichent de travers */
const SUBENC = { ru: 'windows-1251', uk: 'windows-1251', bg: 'windows-1251', sr: 'windows-1251', mk: 'windows-1251', be: 'windows-1251', pl: 'windows-1250', cs: 'windows-1250', sk: 'windows-1250', hu: 'windows-1250', ro: 'windows-1250', hr: 'windows-1250', sl: 'windows-1250', sq: 'windows-1250', el: 'windows-1253', tr: 'windows-1254', he: 'windows-1255', ar: 'windows-1256', fa: 'windows-1256', ur: 'windows-1256', vi: 'windows-1258', th: 'windows-874', ja: 'shift_jis', ko: 'euc-kr', zh: 'gbk', 'zh-tw': 'big5', 'zh-hk': 'big5' };
function subLang(name) { const m = String(name || '').toLowerCase().match(/[._-](zh-tw|zh-hk|zh-cn|pt-br|pt-pt|[a-z]{2,3})\.(?:srt|vtt|ass|ssa)$/); return m ? m[1] : ''; }
function decodeText(buf, lang) {
  const b = new Uint8Array(buf), t = (enc, o = 0) => new TextDecoder(enc).decode(o ? b.subarray(o) : b);
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return t('utf-8', 3);
  if (b[0] === 0xFF && b[1] === 0xFE) return t('utf-16le', 2);
  if (b[0] === 0xFE && b[1] === 0xFF) return t('utf-16be', 2);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { /* pas de l’UTF-8 : encodage ancien */ }
  const l = String(lang || '').toLowerCase(); let enc = SUBENC[l] || SUBENC[l.split('-')[0]] || 'windows-1252';
  try { return t(enc); } catch { return t('windows-1252'); }
}
function parseSubs(txt) {
  txt = txt.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const tm = s => { const m = String(s).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/); return m ? (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + parseInt((m[4] + '00').slice(0, 3), 10) / 1000 : null; };
  const out = [];
  if (/^\[Script Info\]/im.test(txt) || /^Dialogue:/m.test(txt)) {   // ASS / SSA : texte seul, sans mise en forme
    let cols = ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'];
    for (const l of txt.split('\n')) {
      if (/^Format:/i.test(l) && /Text/.test(l)) cols = l.replace(/^Format:\s*/i, '').split(',').map(x => x.trim());
      if (!/^Dialogue:/i.test(l)) continue;
      const f = l.replace(/^Dialogue:\s*/i, '').split(','), si = cols.indexOf('Start'), ei = cols.indexOf('End'), ti = cols.indexOf('Text');
      const a = tm(f[si] + '0'), b = tm(f[ei] + '0'), t = f.slice(ti).join(',').replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n').replace(/\\h/g, ' ').trim();
      if (a != null && b != null && t) out.push({ s: a, e: b, t });
    }
  } else for (const blk of txt.split(/\n{2,}/)) {
    const lines = blk.split('\n'), k = lines.findIndex(l => l.includes('-->')); if (k < 0) continue;
    const [x, y] = lines[k].split('-->'), a = tm(x), b = tm(y); if (a == null || b == null) continue;
    const t = lines.slice(k + 1).join('\n').replace(/\{\\[^}]*\}/g, '').trim(); if (t) out.push({ s: a, e: b, t });
  }
  return out.slice(0, 30000);
}

/* ===================== Cover du film (IMDb) =====================
   Aucun réglage : à l'ouverture d'une vidéo, le titre déduit du nom de fichier est cherché sur IMDb (service de suggestions public, sans clé) et le
   premier résultat avec affiche est retenu pour CE fichier (D.covers, dans le profil chiffré : seule l'adresse de l'image est gardée).
   Si l'affiche ne correspond pas : « Changer le cover… » → saisissez le titre (en français) → choisissez le bon film.
   L'affiche FRANÇAISE (Apple TV / iTunes Store France) est préférée quand elle existe, sinon celle d'IMDb. Seul le titre cherché est envoyé à ces services ;
   les affiches sont affichées depuis leurs serveurs. */
const imdbThumb = u => /^https:\/\/[^/]*media-amazon\.com\/.+\._V1_\.jpg$/.test(u) ? u.replace(/\._V1_\.jpg$/, '._V1_UX400_.jpg') : u;
const bigCover = u => String(u || '').replace(/\._V1_UX\d+_\.jpg$/, '._V1_UX400_.jpg');   // affiches déjà enregistrées en petit format : réaffichées en grand
async function imdbSearch(title) {
  const t = String(title).replace(/[\[(]?\b(19|20)\d{2}\b[\])]?/g, ' ').replace(/[\[\]()]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 100);
  if (!t) return [];
  const first = /^[a-z]/.test(t) ? t[0] : 'x';
  const r = await fetchAny('https://v2.sg.media-imdb.com/suggestion/' + first + '/' + encodeURIComponent(t) + '.json', { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('IMDb a répondu « ' + r.status + ' ».');
  const j = await r.json();
  return (j.d || []).filter(x => x && /^tt\d+$/.test(x.id || '') && x.l).slice(0, 12).map(x => ({ id: x.id, label: String(x.l).slice(0, 120) + (x.y ? ' (' + x.y + ')' : ''), sub: String(x.s || '').slice(0, 100), img: x.i && /^https:\/\//.test(x.i.imageUrl || '') ? imdbThumb(x.i.imageUrl) : '' }));
}
/* Affiches FRANÇAISES : catalogue Apple TV / iTunes Store France (recherche publique, sans clé). IMDb ne donne que l'affiche d'origine (souvent anglaise). */
const nrm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const simName = (a, b) => { a = nrm(a); b = nrm(b); if (!a || !b) return false; if (a.includes(b) || b.includes(a)) return true; const A = a.split(' '), B = b.split(' '), s = A.length < B.length ? A : B, l = A.length < B.length ? B : A; return s.filter(w => w.length > 2 && l.includes(w)).length >= Math.max(1, Math.ceil(s.length * 0.6)); };
async function frPosters(term) {
  const t = String(term).replace(/[\[\]()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100); if (!t) return [];
  const r = await fetchAny('https://itunes.apple.com/search?media=movie&entity=movie&country=fr&lang=fr_fr&limit=15&term=' + encodeURIComponent(t), { signal: AbortSignal.timeout(9000) });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.results || []).filter(x => x && x.trackName && /^https:\/\/[^/]*mzstatic\.com\//.test(x.artworkUrl100 || '')).slice(0, 10).map(x => {
    const y = /^\d{4}/.test(x.releaseDate || '') ? x.releaseDate.slice(0, 4) : '';
    return { id: 'fr' + x.trackId, name: String(x.trackName).slice(0, 120), year: y, label: String(x.trackName).slice(0, 120) + (y ? ' (' + y + ')' : ''), sub: 'Affiche française (Apple TV)', img: x.artworkUrl100.replace(/\/\d+x\d+bb\.(jpg|png)$/i, '/400x600bb.$1') };
  });
}
async function coverSearch(title) {   // [affiches françaises…, résultats IMDb…]
  const [im, fr] = await Promise.allSettled([imdbSearch(title), frPosters(title)]);
  if (im.status === 'rejected' && fr.status === 'rejected') throw im.reason;
  return [...(fr.value || []), ...(im.value || [])];
}
async function bestCover(title) {   // choix automatique : le film est identifié par IMDb, puis son affiche française est cherchée (même année, titre proche)
  const [im, fr] = await Promise.allSettled([imdbSearch(title), frPosters(title)]);
  const d = im.status === 'fulfilled' ? im.value : [], f = fr.status === 'fulfilled' ? fr.value : [];
  if (im.status === 'rejected' && fr.status === 'rejected') throw im.reason;
  const top = d.find(x => x.img);
  if (!top) { const m = f.find(x => simName(x.name, title)); return m ? { u: m.img, t: m.label } : { u: '', t: '' }; }
  const y = (top.label.match(/\((\d{4})\)\s*$/) || [])[1], oname = top.label.replace(/\s*\(\d{4}\)\s*$/, '');
  const ok = (list, ref) => list.find(x => x.year && x.year === y && (simName(x.name, title) || simName(x.name, oname) || (ref && simName(x.name, ref))));
  let m = ok(f);
  if (!m && oname && nrm(oname) !== nrm(title)) { try { m = ok(await frPosters(oname)); } catch { /* secours : affiche IMDb */ } }
  return m ? { u: m.img, t: m.label, i: top.id } : { u: top.img, t: top.label, i: top.id };
}
function imdbWin(query, onPick) {
  const q = el('input', { value: cleanName(query), maxLength: 120, placeholder: 'Titre du film (en français)', className: 'grow', onkeydown: e => { if (e.key === 'Enter') go(); } });
  const st = el('div', { className: 'mut' }), res = el('div', { className: 'col' });
  const go = async () => {
    if (!q.value.trim()) return q.focus(); st.textContent = 'Recherche des affiches…'; res.replaceChildren();
    try {
      const d = await coverSearch(q.value); st.textContent = d.length ? '' : 'Aucun résultat : essayez un autre titre (français ou original).';
      res.replaceChildren(...d.map(x => el('div', { className: 'card' }, x.img ? el('img', { src: x.img, alt: '', className: 'vv-poster', referrerPolicy: 'no-referrer' }) : el('span', { className: 'vv-poster none', textContent: '—' }),
        el('div', { className: 'grow' }, el('b', { textContent: x.label }), el('small', { className: 'mut', textContent: x.sub })),
        btn('Choisir', 'check', () => { w.close(); onPick(x); }, 'pri'))));
    } catch (e) { st.textContent = 'Recherche impossible (' + e.message + ').'; }
  };
  const w = win('Cover du film', 'image', [el('div', { className: 'row' }, q, btn('Rechercher', 'search', go, 'pri')), st, res], { w: 520, h: 520 });
  q.focus(); go(); return w;
}

/* ===================== Lecteur vidéo ===================== */
const VV = { w: null };
function videoWin(files, i = 0, siblings) {
  if (VV.w && VV.w.isConnected) { VV.w.hidden = false; VV.w.style.zIndex = ++Z; if (files) VV.set(files, i, siblings); return; }
  let q = [], idx = 0, sibs = [], rel = null, tok = 0, v = null, tracks = [], cur = -1, off = 0;
  const stage = el('div', { className: 'vv-stage' }), info = el('small', { className: 'mut grow' }), stat = el('small', { className: 'mut' });
  const subSel = el('select', { 'aria-label': 'Sous-titres' }), offL = el('small', { className: 'mut', textContent: '0,0 s' });
  const cov = el('div', { className: 'vv-cov', hidden: true }), main = el('div', { className: 'vv-main' }, stage, cov);   // lecteur à gauche, cover du film à droite
  const covKey = t => (t.c ? t.c.id : 'local') + '|' + (t.path || t.name);
  const drawCov = t => {
    if (t !== q[idx]) return; const c = D.covers[covKey(t)] || null; cov.hidden = false;
    cov.replaceChildren(...[c && c.u ? el('img', { src: bigCover(c.u), alt: '', className: 'vv-poster', referrerPolicy: 'no-referrer' }) : el('span', { className: 'vv-poster none', textContent: '🎬' }),
      el('b', { textContent: c && c.t ? c.t : 'Pas de cover pour ce film' }),
      el('div', { className: 'vv-btns' }, btn('Changer le cover…', 'search', () => imdbWin(t.name, x => { setCover(t, { u: x.img, t: x.label, i: /^tt\d+$/.test(x.id || '') ? x.id : '' }); }), '', 'Chercher le film (affiche française en premier) et choisir son affiche'),
        ...(c && c.u ? [btn('', 'x', () => { setCover(t, { u: '', t: '' }); }, '', 'Retirer le cover')] : []))].filter(Boolean));
  };
  const setCover = (t, c) => { if (Object.keys(D.covers).length >= 3000) delete D.covers[Object.keys(D.covers)[0]]; D.covers[covKey(t)] = c; save(); drawCov(t); };
  const autoCover = async t => {
    drawCov(t); if (covKey(t) in D.covers) return;
    try { setCover(t, await bestCover(cleanName(t.name))); } catch { /* réseau : on réessaiera à la prochaine ouverture */ }
  };
  const drawSel = () => { opts(subSel, [['-1', 'Sous-titres : aucun'], ...tracks.map((t, k) => [String(k), t.label])]); subSel.value = String(cur); };
  const render = () => {   // (re)crée les cues de la piste active avec le décalage
    tracks.forEach((t, k) => { for (const c of [...(t.tr.cues || [])]) t.tr.removeCue(c); t.tr.mode = 'disabled'; if (k === cur) { for (const c of t.cues) { const kk = t.k || 1, cue = new VTTCue(Math.max(0, c.s * kk + off), Math.max(0.01, c.e * kk + off), c.t); t.tr.addCue(cue); } t.tr.mode = 'showing'; } });
    const k0 = (tracks[cur] || {}).k || 1; offL.textContent = (off >= 0 ? '+' : '') + off.toFixed(1).replace('.', ',') + ' s' + (k0 !== 1 ? ' ×' + k0.toFixed(4).replace('.', ',') : '');
  };
  const addSubs = (label, cues, show = true) => {
    if (!cues.length) return toast('Aucun sous-titre lisible dans ce fichier.');
    tracks.push({ label, cues, tr: v.addTextTrack('subtitles', label, '') }); if (show) cur = tracks.length - 1; drawSel(); render(); toast('Sous-titres chargés : ' + label + ' (' + cues.length + ' lignes).');
  };
  const syncCheck = async cues => {   // après OpenSubtitles : compare la durée des sous-titres à celle de la vidéo
    if (!v || !cues.length) return;
    if (!(v.duration > 0 && isFinite(v.duration))) await new Promise(ok => { v.addEventListener('loadedmetadata', ok, { once: true }); setTimeout(ok, 4000); });
    const dur = v.duration; if (!(dur > 600) || !isFinite(dur)) return;
    const last = Math.max(...cues.map(c => c.e)), ratio = last / dur, tk = tracks[tracks.length - 1];
    if (ratio > 1.02 && last - dur > 20) {
      const k = [[25 / 23.976, 23.976 / 25, '25 → 23,976'], [25 / 24, 24 / 25, '25 → 24']].find(([a]) => Math.abs(ratio / a - 1) < 0.012);
      if (k && tk && await confirmBox('Ce sous-titre se termine après la fin de la vidéo, avec un écart qui correspond à une différence de cadence d’images (' + k[2] + ' i/s). Corriger automatiquement la vitesse du sous-titre ?', 'Corriger', false)) { tk.k = k[1]; render(); toast('Vitesse corrigée (×' + k[1].toFixed(4).replace('.', ',') + '). Vérifiez avec « Caler… » si besoin.', 6000); }
      else if (!k) toast('Attention : ce sous-titre se termine après la fin de la vidéo : c’est sans doute une autre version du film. Essayez-en un autre, ou utilisez « Caler… ».', 10000);
    } else if (ratio < 0.55) toast('Ce sous-titre est beaucoup plus court que la vidéo : il s’agit peut-être d’une autre version (ou d’une partie seulement). Essayez-en un autre.', 10000);
  };
  const calWin = () => {   // réglage précis en deux repères : décalage + vitesse
    const t = tracks[cur]; if (!t || !v) return toast('Choisissez d’abord des sous-titres.');
    const fc = t.cues[0], lc = t.cues[t.cues.length - 1], at = c => c.s * (t.k || 1) + off, mm = s => Math.floor(s / 60) + ' min ' + String(Math.round(s % 60)).padStart(2, '0') + ' s';
    const seek = c => { v.currentTime = Math.max(0, at(c) - 1); v.pause(); };
    const w = win('Caler les sous-titres', 'sliders', [
      el('p', { className: 'mut', textContent: 'Mettez la vidéo en pause à l’instant précis où la phrase est PRONONCÉE, puis cliquez. Faites-le pour la première phrase (corrige le décalage), puis pour la dernière (corrige aussi la vitesse).' }),
      el('div', { className: 'card' }, el('div', { className: 'grow' }, el('b', { textContent: '1. Première phrase (vers ' + mm(at(fc)) + ')' }), el('small', { className: 'mut', textContent: '« ' + String(fc.t).replace(/\s+/g, ' ').slice(0, 100) + ' »' })),
        btn('Y aller', 'play', () => seek(fc), '', 'Aller près de l’endroit prévu pour cette phrase'),
        btn('Elle est dite ici', 'check', () => { const k = t.k || 1; off = Math.round((v.currentTime - fc.s * k) * 100) / 100; t.p1 = { c: fc.s, t: v.currentTime }; render(); toast('Première phrase calée.', 2500); }, 'pri', 'Caler la première phrase sur l’instant actuel')),
      el('div', { className: 'card' }, el('div', { className: 'grow' }, el('b', { textContent: '2. Dernière phrase (vers ' + mm(at(lc)) + ')' }), el('small', { className: 'mut', textContent: '« ' + String(lc.t).replace(/\s+/g, ' ').slice(0, 100) + ' »' })),
        btn('Y aller', 'play', () => seek(lc), '', 'Aller près de l’endroit prévu pour cette phrase'),
        btn('Elle est dite ici', 'check', () => {
          const t1 = t.p1 ? t.p1.t : at(fc), c1 = t.p1 ? t.p1.c : fc.s, t2 = v.currentTime, c2 = lc.s;
          if (!(t2 - t1 > 60 && c2 - c1 > 60)) return toast('Les deux repères sont trop proches : choisissez bien la dernière phrase du film.', 5000);
          const k = (t2 - t1) / (c2 - c1); if (!(k > 0.8 && k < 1.25)) return toast('Écart trop grand : vérifiez que ce sous-titre est bien celui de ce film.', 6000);
          t.k = Math.round(k * 1e5) / 1e5; off = Math.round((t1 - c1 * t.k) * 100) / 100; render(); toast('Vitesse et décalage calés.', 3000);
        }, 'pri', 'Caler la dernière phrase sur l’instant actuel')),
      btn('Remettre à zéro', 'x', () => { t.k = 1; delete t.p1; off = 0; render(); toast('Réglages remis à zéro.', 2500); }, '', 'Supprimer décalage et correction de vitesse')], { w: 560, h: 460 });
    return w;
  };
  subSel.onchange = () => { cur = +subSel.value; render(); };
  const shift = d => { off = Math.round((off + d) * 10) / 10; render(); };
  const subFromEntry = async t => { try { const b = await getBlob(t); addSubs(t.name, parseSubs(decodeText(await b.arrayBuffer(), subLang(t.name)))); } catch (e) { toast(e.message || 'Sous-titres illisibles.'); } };
  const autoSubs = t => {   // sous-titres du même nom dans le même dossier
    const stem = t.name.replace(/\.[^.]+$/, '').toLowerCase();
    const m = sibs.filter(s => SUBRE.test(s.name) && s.name.toLowerCase().startsWith(stem)).slice(0, 4);
    m.forEach((s, k) => getBlob(s).then(async b => { if (t === q[idx] && v) addSubs(s.name, parseSubs(decodeText(await b.arrayBuffer(), subLang(s.name))), k === 0); }).catch(() => {}));
  };
  const fresh = () => { if (v) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } v = el('video', { controls: true, playsInline: true, preload: 'metadata' }); stage.replaceChildren(v); tracks = []; cur = -1; off = 0; drawSel(); offL.textContent = '0,0 s'; };
  const release = () => { if (rel) { rel(); rel = null; } };
  const playIdx = async n => {
    if (!q.length) return;
    idx = (n + q.length) % q.length; const t = q[idx], my = ++tok; paintFav(); release(); fresh(); stat.textContent = ''; info.textContent = t.name + (q.length > 1 ? ' · ' + (idx + 1) + ' / ' + q.length : '');
    const vid = v; let tried = false;
    const useBlob = async () => {
      if (tried) return; tried = true; const p = toast('Téléchargement de ' + t.name + '…', 0);
      try { const b = typed(await getBlob(t, f => { if (f != null) p.set('Téléchargement de ' + t.name + ' : ' + Math.round(f * 100) + ' %'); }), t.name); p.close(); if (my !== tok) return; const u = URL.createObjectURL(b); release(); rel = () => URL.revokeObjectURL(u); vid.src = u; vid.play().catch(() => {}); }
      catch (e) { p.close(); toast(e.message || 'Lecture impossible.', 6000); }
    };
    vid.onerror = () => { if (my !== tok) return; if (t.blob || tried) stat.textContent = 'Ce format vidéo n’est pas pris en charge par le navigateur.'; else { toast('Lecture en continu impossible (le serveur doit exposer Content-Range) : téléchargement complet.', 6000); useBlob(); } };
    vid.onended = () => { if (q.length > 1) playIdx(idx + 1); };
    if (t.blob) { const u = URL.createObjectURL(typed(t.blob, t.name)); rel = () => URL.revokeObjectURL(u); vid.src = u; }
    else { const s = await streamUrl(t); if (my !== tok) return; if (s) { rel = s.release; vid.src = s.url; stat.textContent = 'Lecture en continu'; } else return useBlob(); }
    vid.play().catch(() => {}); autoSubs(t); autoCover(t);
  };
  const open = r => { if (r) { q = r.files; sibs = r.siblings || r.files; setTab('play'); playIdx(r.i || 0); } };
  /* ----- Favoris : vidéos du cloud mises de côté (cœur), avec barre de recherche ----- */
  const favKey = t => t && t.c ? t.c.id + '|' + t.path : '';
  const isVFav = t => !!t && !!t.c && D.vfav.some(f => f.cid === t.c.id && f.path === t.path);
  const favB = btn('', 'heart', () => {
    const t = q[idx]; if (!t) return toast('Ouvrez d’abord une vidéo.');
    if (!t.c) return toast('Seules les vidéos du cloud peuvent être mises en favoris : un fichier de cet appareil n’a pas d’adresse durable.', 6000);
    const on = isVFav(t);
    if (on) D.vfav = D.vfav.filter(f => !(f.cid === t.c.id && f.path === t.path)); else if (D.vfav.length < 2000) D.vfav.push({ id: uid(), name: t.name, cid: t.c.id, path: t.path }); else return toast('2 000 favoris au maximum.');
    save(); paintFav(); drawVFav(); toast(on ? 'Retirée des favoris.' : 'Ajoutée aux favoris.', 2000);
  }, '', 'Ajouter cette vidéo aux favoris');
  function paintFav() { const on = isVFav(q[idx]); favB.firstChild.replaceWith(ico(on ? 'hearton' : 'heart', 16)); favB.classList.toggle('rd-on', on); favB.title = tr(on ? 'Retirer des favoris' : 'Ajouter cette vidéo aux favoris'); }
  const fold = x => String(x || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const vq = el('input', { type: 'search', placeholder: 'Rechercher dans mes favoris…', maxLength: 80, className: 'grow', 'aria-label': 'Rechercher dans mes vidéos favorites', oninput: () => drawVFav() });
  const vInfo = el('small', { className: 'mut' }), vList = el('div', { className: 'rd-list vfav' });
  const vTrack = f => { const c = D.conns.find(x => x.id === f.cid); return c ? { name: f.name, c, path: f.path } : null; };
  const vView = () => { const s = fold(vq.value.trim()); return D.vfav.filter(f => !s || fold(f.name + ' ' + f.path).includes(s)).sort(byName); };
  function drawVFav() {
    const items = vView();
    vList.replaceChildren(...(items.length ? items.map((f, k) => {
      const cv = D.covers[f.cid + '|' + f.path], c = D.conns.find(x => x.id === f.cid), dir = f.path.replace(/\/[^/]*$/, '') || '/';
      const go = () => { const ts = items.map(vTrack).filter(Boolean), t = vTrack(f); if (!t) return toast('Le lecteur WebDAV de cette vidéo n’est plus connecté.', 6000); open({ files: ts, i: ts.indexOf(ts.find(x => x.path === f.path && x.c.id === f.cid)), siblings: ts }); };
      return el('div', { className: 'rd-row', tabIndex: 0, role: 'button', 'aria-label': 'Lire ' + f.name, onclick: go, onkeydown: e => { if (e.key === 'Enter') go(); } },
        el('span', { className: 'rd-lg' }, cv && cv.u ? el('img', { alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', src: cv.u }) : ico('video', 20)),
        el('div', { className: 'grow' }, el('b', { nt: 1, textContent: cleanName(f.name) }), el('div', { className: 'mut rd-sub', nt: 1, textContent: (c ? c.name : tr('Lecteur introuvable')) + ' · ' + dir })),
        btn('', 'hearton', e => { e.stopPropagation(); D.vfav = D.vfav.filter(x => x !== f); save(); drawVFav(); paintFav(); }, 'rd-on', 'Retirer des favoris'));
    }) : [el('p', { className: 'mut', textContent: D.vfav.length ? 'Aucun favori pour cette recherche.' : 'Aucune vidéo favorite. Ouvrez une vidéo du cloud puis touchez le cœur pour la retrouver ici.' })]));
    vInfo.textContent = D.vfav.length ? (items.length === D.vfav.length ? tr('{0} favori(s)').replace('{0}', items.length) : tr('{0} sur {1} favori(s)').replace('{0}', items.length).replace('{1}', D.vfav.length)) : '';
  }
  const playAllFav = () => { const ts = vView().map(vTrack).filter(Boolean); if (!ts.length) return toast('Aucune vidéo favorite à lire.'); open({ files: ts, i: 0, siblings: ts }); };
  VV.set = (f, n, s) => open({ files: f, i: n, siblings: s });
  const subFile = () => chooseLocal('.srt,.vtt,.ass,.ssa,text/*', async l => { if (!v) return toast('Ouvrez d’abord une vidéo.'); for (const f of l) addSubs(f.name, parseSubs(decodeText(await f.blob.arrayBuffer(), subLang(f.name)))); });
  const bar = el('div', { className: 'row tight vwbar' }, btn('Vidéo (cloud)…', 'cloud', async () => open(await pickCloud(['video'])), 'pri'), btn('Vidéo (appareil)…', 'upload', () => chooseLocal('video/*', l => open({ files: l, i: 0, siblings: l }))),
    btn('', 'prev', () => q.length > 1 && playIdx(idx - 1), '', 'Vidéo précédente'), btn('', 'next', () => q.length > 1 && playIdx(idx + 1), '', 'Vidéo suivante'), castBtn(() => v, () => q[idx]), provBtn(() => (q[idx] || {}).c), favB, info, stat);
  const bar2 = el('div', { className: 'row tight vwbar' }, subSel, btn('Mes sous-titres…', 'upload', subFile, '', 'Charger un fichier .srt, .vtt ou .ass depuis cet appareil'),
    btn('Sous-titres du cloud…', 'cloud', async () => { if (!v) return toast('Ouvrez d’abord une vidéo.'); const r = await pickCloud(['text', 'sub'], 'add'); if (r) for (const t of r.files) await subFromEntry(t); }),
    btn('OpenSubtitles…', 'search', () => { if (!v) return toast('Ouvrez d’abord une vidéo.'); osWin(cleanName(q[idx].name), (label, cues) => { addSubs(label, cues); syncCheck(cues); }, q[idx], (D.covers[covKey(q[idx])] || {}).i); }, '', 'OpenSubtitles… : chercher des sous-titres sur opensubtitles.com (service externe)'),
    btn('', 'minus', () => shift(-0.5), '', 'Sous-titres plus tôt (−0,5 s)'), offL, btn('', 'plus', () => shift(0.5), '', 'Sous-titres plus tard (+0,5 s)'), btn('Caler…', 'sliders', calWin, '', 'Caler… : régler précisément le décalage et la vitesse des sous-titres en indiquant quand une phrase est prononcée'));
  const paneP = el('div', { className: 'col' }, bar, bar2, main, el('small', { className: 'mut', textContent: 'Fichiers vidéo : formats lus par votre navigateur (MP4/H.264, WebM…). Sous-titres : .srt, .vtt, .ass, ou OpenSubtitles (service externe, compte gratuit).' }));
  const paneF = el('div', { className: 'col' }, pin(el('div', { className: 'col pinblk' }, el('div', { className: 'row' }, vq, btn('Tout lire', 'play', playAllFav, 'pri', 'Lire toutes les vidéos affichées, à la suite')), vInfo)), vList);
  const tPlay = btn('Lecteur', 'video', () => setTab('play'), 'rd-tab'), tFav = btn('Favoris', 'heart', () => setTab('fav'), 'rd-tab');
  function setTab(t) { paneP.hidden = t !== 'play'; paneF.hidden = t !== 'fav'; tPlay.classList.toggle('on', t === 'play'); tFav.classList.toggle('on', t === 'fav'); if (t === 'fav') drawVFav(); }
  VV.w = win('Lecteur vidéo', 'video', [pin(el('div', { className: 'row tight' }, tPlay, tFav)), paneP, paneF],
    { w: 980, h: 700, cls: 'vw', onclose: () => { tok++; release(); if (v) { v.pause(); v.removeAttribute('src'); v.load(); } } });
  setTab('play'); paintFav(); drawSel(); if (files) open({ files, i, siblings }); else stage.replaceChildren(el('p', { className: 'iv-msg', textContent: 'Ouvrez une vidéo depuis votre stockage cloud ou cet appareil.' }));
}

/* ===================== OpenSubtitles (service externe, facultatif) ===================== */
/* API REST v1 de opensubtitles.com : clé API gratuite + compte (le téléchargement exige une connexion). Les identifiants sont gardés
   dans votre profil chiffré. Seul le nom du fichier recherché et vos identifiants OpenSubtitles sont envoyés à ce service. */
const OSAPI = 'https://api.opensubtitles.com/api/v1';
/* Langues proposées par OpenSubtitles (liste officielle de l'API, /infos/languages). Affichées par ordre alphabétique dans la langue de l'interface. */
const OSLANG = [['fr', 'Français'], ['en', 'Anglais'], ['es', 'Espagnol'], ['de', 'Allemand'], ['it', 'Italien'], ['pt-pt', 'Portugais (Portugal)'], ['pt-br', 'Portugais (Brésil)'], ['nl', 'Néerlandais'], ['pl', 'Polonais'], ['ru', 'Russe'], ['tr', 'Turc'], ['ar', 'Arabe'], ['ja', 'Japonais'], ['ko', 'Coréen'], ['zh-cn', 'Chinois (simplifié)'],
  ...[['zh-tw', 'Chinois (traditionnel)'], ['zh-ca', 'Chinois (cantonais)'], ['ze', 'Chinois (bilingue)'], ['ab', 'Abkhaze'], ['af', 'Afrikaans'], ['sq', 'Albanais'], ['am', 'Amharique'], ['an', 'Aragonais'], ['hy', 'Arménien'], ['as', 'Assamais'], ['at', 'Asturien'], ['az-az', 'Azéri'], ['az-zb', 'Azéri du Sud'],
    ['eu', 'Basque'], ['be', 'Biélorusse'], ['bn', 'Bengali'], ['bs', 'Bosniaque'], ['br', 'Breton'], ['bg', 'Bulgare'], ['my', 'Birman'], ['ca', 'Catalan'], ['hr', 'Croate'], ['cs', 'Tchèque'], ['da', 'Danois'], ['pr', 'Dari'], ['eo', 'Espéranto'], ['et', 'Estonien'], ['ex', 'Estrémègne'], ['sp', 'Espagnol (Europe)'], ['ea', 'Espagnol (Amérique latine)'],
    ['fi', 'Finnois'], ['gd', 'Gaélique écossais'], ['gl', 'Galicien'], ['ka', 'Géorgien'], ['el', 'Grec'], ['he', 'Hébreu'], ['hi', 'Hindi'], ['hu', 'Hongrois'], ['is', 'Islandais'], ['ig', 'Igbo'], ['id', 'Indonésien'], ['ia', 'Interlingua'], ['ga', 'Irlandais'],
    ['kn', 'Kannada'], ['kk', 'Kazakh'], ['km', 'Khmer'], ['ku', 'Kurde'], ['lv', 'Letton'], ['lt', 'Lituanien'], ['lb', 'Luxembourgeois'], ['mk', 'Macédonien'], ['ms', 'Malais'], ['ml', 'Malayalam'], ['ma', 'Manipuri'], ['mr', 'Marathi'], ['mn', 'Mongol'], ['me', 'Monténégrin'],
    ['nv', 'Navajo'], ['ne', 'Népalais'], ['se', 'Sami du Nord'], ['no', 'Norvégien'], ['oc', 'Occitan'], ['or', 'Odia'], ['fa', 'Persan'], ['pm', 'Portugais (Mozambique)'], ['ps', 'Pachto'], ['ro', 'Roumain'], ['sx', 'Santali'], ['sr', 'Serbe'], ['sd', 'Sindhi'], ['si', 'Cingalais'], ['sk', 'Slovaque'], ['sl', 'Slovène'], ['so', 'Somali'],
    ['sw', 'Swahili'], ['sv', 'Suédois'], ['sy', 'Syriaque'], ['tl', 'Tagalog'], ['ta', 'Tamoul'], ['tt', 'Tatar'], ['te', 'Télougou'], ['tm-td', 'Tétoum (tetun dili)'], ['th', 'Thaï'], ['tp', 'Toki Pona'], ['tk', 'Turkmène'], ['uk', 'Ukrainien'], ['ur', 'Ourdou'], ['uz', 'Ouzbek'], ['vi', 'Vietnamien'], ['cy', 'Gallois']]
    .sort((a, b) => a[1].localeCompare(b[1], 'fr'))];
let OSTOK = '', OSBASE = OSAPI;
async function osCall(path, o = {}) {
  const h = { 'Api-Key': String(D.os.key || '').trim(), Accept: 'application/json' }; if (o.body) h['Content-Type'] = 'application/json'; if (o.auth) h.Authorization = 'Bearer ' + o.auth;
  let r; try { r = await fetch((o.login ? OSAPI : OSBASE) + path, { method: o.body ? 'POST' : 'GET', headers: h, body: o.body && JSON.stringify(o.body), credentials: 'omit', referrerPolicy: 'no-referrer' }); }
  catch { throw Object.assign(new Error('OpenSubtitles n’a pas répondu au navigateur (réseau ou autorisation CORS). Utilisez « Mes sous-titres » avec un fichier téléchargé sur opensubtitles.com.'), { net: true }); }
  let j = null; try { j = await r.clone().json(); } catch { /* corps non JSON */ }
  const why = j && (j.message || j.error || (Array.isArray(j.errors) && j.errors.join(' '))); const det = why ? ' — « ' + String(why).replace(/\s+/g, ' ').slice(0, 160) + ' »' : '';
  const E = m => Object.assign(new Error(m), { status: r.status });
  if (r.status === 401 || r.status === 403) throw E('OpenSubtitles a refusé la demande (' + r.status + ')' + det + '.');
  if (r.status === 406) throw E('Quota de téléchargements OpenSubtitles atteint pour aujourd’hui' + det + '.');
  if (r.status === 429) throw E('Trop de requêtes vers OpenSubtitles : patientez un instant.');
  if (!r.ok) throw E('OpenSubtitles : erreur ' + r.status + det + '.');
  return j || r.json();
}
/* Connexion avec diagnostic : dit si c'est la CLÉ API ou l'IDENTIFIANT / MOT DE PASSE qui est refusé. Renvoie les infos du compte. */
async function osLogin() {
  const user = String(D.os.user || '').trim(), pass = String(D.os.pass || '');
  if (!String(D.os.key || '').trim()) throw new Error('Clé API manquante : saisissez-la dans « Mon compte OpenSubtitles ».');
  if (!user || !pass) throw new Error('Saisissez votre nom d’utilisateur et votre mot de passe OpenSubtitles (compte gratuit).');
  let l;
  try { l = await osCall('/login', { login: true, body: { username: user, password: pass } }); }
  catch (e) {
    if (e.net || ![400, 401, 403].includes(e.status)) throw e;
    let keyBad = false;   // la clé API est-elle acceptée seule ? (liste des langues : clé seulement, sans compte)
    try { await osCall('/infos/languages', { login: true }); } catch (k) { keyBad = [401, 403].includes(k.status); }
    if (keyBad) throw new Error('Clé API refusée par OpenSubtitles : elle est fausse, désactivée ou copiée avec un caractère en trop. Vérifiez-la sur opensubtitles.com (rubrique « API consumers »).');
    throw new Error('Identifiant ou mot de passe OpenSubtitles incorrect (' + e.status + ')' + (e.message.match(/ — « .* »/) || [''])[0] + '. La clé API est bonne.' + (user.includes('@') ? ' Vous avez saisi une adresse e-mail : utilisez le NOM D’UTILISATEUR du compte.' : ' Utilisez le nom d’utilisateur (pas l’e-mail) et le mot de passe de opensubtitles.com.'));
  }
  if (!l || !l.token) throw new Error('OpenSubtitles n’a pas fourni de jeton de connexion : réessayez.');
  OSTOK = l.token; OSBASE = OSAPI;
  const bu = String(l.base_url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');   // adresse indiquée par OpenSubtitles pour les requêtes suivantes (ex. comptes VIP)
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.opensubtitles\.com$/i.test(bu)) OSBASE = 'https://' + bu + '/api/v1';
  return l.user || {};
}
/* Empreinte OpenSubtitles du fichier vidéo (taille + 64 Ko du début + 64 Ko de la fin) : permet de trouver les sous-titres de VOTRE version du film (même montage,
   même cadence d'images), donc synchronisés. Seules ces 16 caractères sont envoyées, jamais le contenu de la vidéo. '' si impossible (serveur sans Range, fichier trop petit). */
async function osHash(t) {
  const CH = 65536; let size, head, tail;
  try {
    if (t.blob) { size = t.blob.size; if (size < CH) return ''; head = new Uint8Array(await t.blob.slice(0, CH).arrayBuffer()); tail = new Uint8Array(await t.blob.slice(size - CH).arrayBuffer()); }
    else if (t.c && t.path) {
      const rt = await dav(t.c, 'GET', t.path, null, { Range: 'bytes=-' + CH });
      if (rt.status !== 206) { try { rt.body && rt.body.cancel(); } catch { /* ignoré */ } return ''; }
      const m = /\/(\d+)\s*$/.exec(rt.headers.get('Content-Range') || ''); if (!m) return ''; size = Number(m[1]); if (!(size >= CH)) return '';
      tail = new Uint8Array(await rt.arrayBuffer()); head = await headBytes(t, CH); if (tail.length !== CH || head.length !== CH) return '';
    } else return '';
    let h = BigInt(size); const M = (1n << 64n) - 1n;
    for (const b of [head, tail]) { const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); for (let i = 0; i < CH; i += 8) h = (h + dv.getBigUint64(i, true)) & M; }
    return h.toString(16).padStart(16, '0');
  } catch { return ''; }
}
const relScore = (rel, file) => { const A = new Set(nrm(rel).split(' ').filter(w => w.length > 1)); return nrm(file).split(' ').filter(w => w.length > 1 && A.has(w)).length; };   // mots communs (source, résolution, groupe…)
/* Lecture du nom du fichier : année, saison/épisode, source, résolution, codec, groupe de diffusion → sert à choisir la version de sous-titres la mieux adaptée */
function parseRelease(name) {
  const base = String(name || '').replace(/\.[a-z0-9]{2,4}$/i, ''), low = base.toLowerCase();
  const se = base.match(/\bS(\d{1,2})[ ._-]?E(\d{1,3})\b/i) || base.match(/\b(\d{1,2})x(\d{2,3})\b/i);
  const yr = base.match(/(?:^|[ ._(\[-])((?:19|20)\d{2})(?=[ ._)\]-]|$)/);
  const src = [['remux', /remux/], ['bluray', /blu-?ray|bdrip|brrip|\bbd\b/], ['webdl', /web-?dl/], ['webrip', /web-?rip|\bweb\b/], ['hdtv', /hdtv|pdtv/], ['dvd', /dvd/]].find(([, re]) => re.test(low));
  const rs = low.match(/(2160|1080|720|576|480)p/), grp = base.match(/-([a-z0-9]{2,12})$/i) || base.match(/^\[([^\]]{2,20})\]/);
  return { se: se ? [+se[1], +se[2]] : null, year: yr ? +yr[1] : 0, src: src ? src[0] : '', res: rs ? rs[1] : '', codec: /x265|h\.?265|hevc/.test(low) ? 'hevc' : /x264|h\.?264|avc/.test(low) ? 'avc' : /xvid|divx/.test(low) ? 'xvid' : '', group: grp ? grp[1].toLowerCase() : '' };
}
function osScore(a, fi, fname) {   // note d'adéquation d'un résultat OpenSubtitles avec VOTRE fichier + raisons affichables
  const rel = a.release || (a.files && a.files[0] && a.files[0].file_name) || '', ri = parseRelease(rel); let s = 0; const why = [];
  if (a.moviehash_match === true) { s += 1000; why.push('✓ Synchro exacte'); }
  if (fi.group && ri.group === fi.group) { s += 60; why.push('Même groupe'); }
  if (fi.src && ri.src === fi.src) { s += 35; why.push('Même source'); } else if (fi.src && ri.src) s -= 15;
  if (fi.res && ri.res === fi.res) s += 15;
  if (fi.codec && ri.codec === fi.codec) s += 5;
  s += relScore(rel, fname) * 2;
  if (a.from_trusted) { s += 25; why.push('Source fiable'); }
  if (a.ai_translated || a.machine_translated) s -= 120;
  if (a.foreign_parts_only) s -= 60;
  if (a.hearing_impaired) s -= 12;
  s += Math.min(30, Math.log10(1 + (+a.download_count || 0)) * 8) + Math.min(10, +a.ratings || 0);
  return { s, why };
}
function osWin(query, onSub, target, imdb) {
  const key = el('input', { placeholder: 'Clé API (gratuite)', value: D.os.key, maxLength: 100, autocomplete: 'off', spellcheck: false });
  const usr = el('input', { placeholder: 'Utilisateur OpenSubtitles', value: D.os.user, maxLength: 100, autocomplete: 'off' });
  const pw = el('input', { type: 'password', placeholder: 'Mot de passe OpenSubtitles', value: D.os.pass, maxLength: 200, autocomplete: 'new-password' });
  const q = el('input', { value: query, maxLength: 200, placeholder: 'Titre du film ou de la série', onkeydown: e => { if (e.key === 'Enter') search(); } });
  const lang = el('select', { 'aria-label': 'Langue' }); opts(lang, [...OSLANG].sort((x, y) => tr(x[1]).localeCompare(tr(y[1]), (typeof LANG !== 'undefined' && LANG) || 'fr', { sensitivity: 'base' }))); lang.value = OSLANG.some(l => l[0] === D.os.lang) ? D.os.lang : 'fr';
  let hash;   // undefined = pas encore calculée
  const st = el('div', { className: 'mut' }), res = el('div', { className: 'col' });
  const saveAcc = () => { D.os = { key: key.value.trim(), user: usr.value.trim(), pass: pw.value, lang: lang.value }; save(); };
  const fail = e => { st.textContent = e.message; res.replaceChildren(...(e.net ? [btn('Ouvrir opensubtitles.com (onglet)', 'ext', () => openTab('https://www.opensubtitles.com/'))] : [])); };
  const hideMt = el('input', { type: 'checkbox', checked: true, id: 'os-mt' });
  async function search() {
    saveAcc(); if (!D.os.key) { st.textContent = 'Saisissez d’abord votre clé API (voir ci-dessous).'; return key.focus(); }
    if (!q.value.trim()) return q.focus(); st.textContent = 'Recherche…'; res.replaceChildren();
    try {
      if (target && hash === undefined) { st.textContent = 'Recherche… (empreinte de la vidéo)'; hash = await osHash(target); }
      const fname = target ? target.name : query, fi = parseRelease(fname), tq = q.value.replace(/\bS\d{1,2}[ ._-]?E\d{1,3}\b/i, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      const base = '/subtitles?languages=' + encodeURIComponent(lang.value) + '&order_by=download_count' + (hash ? '&moviehash=' + hash : '');
      const tries = [];   // du plus précis au plus large ; on s'arrête dès qu'on a assez de résultats
      if (/^tt\d{6,10}$/.test(imdb || '') && !fi.se) tries.push(base + '&imdb_id=' + String(imdb).slice(2).replace(/^0+/, ''));   // film identifié sans ambiguïté (IMDb)
      tries.push(base + '&query=' + encodeURIComponent(tq) + (fi.se ? '&season_number=' + fi.se[0] + '&episode_number=' + fi.se[1] : fi.year ? '&year=' + fi.year : ''));
      if (fi.year || fi.se) tries.push(base + '&query=' + encodeURIComponent(tq));
      const got = new Map();
      for (const u of tries) {
        const j = await osCall(u);
        for (const x of (j.data || [])) if (x && x.attributes && x.attributes.files && x.attributes.files[0]) got.set(x.attributes.files[0].file_id, x);
        if (got.size >= 8) break;
      }
      const raw = [...got.values()], want = lang.value.toLowerCase();
      const same = raw.filter(x => String(x.attributes.language || '').toLowerCase() === want);   // seulement la langue choisie (le titre du film et le nom de la version restent ceux d'origine)
      let pool = same.length ? same : raw;
      if (hideMt.checked) { const ok = pool.filter(x => !(x.attributes.ai_translated || x.attributes.machine_translated)); if (ok.length) pool = ok; }
      const scored = pool.map((x, i) => ({ x, i, ...osScore(x.attributes, fi, fname) })).sort((a, b) => (b.s - a.s) || (a.i - b.i)).slice(0, 25);
      const nEx = scored.filter(o => o.x.attributes.moviehash_match === true).length;
      st.textContent = scored.length ? scored.length + ' résultat(s), le plus adapté à votre fichier en premier.' + (nEx ? ' ' + nEx + ' synchronisé(s) exactement avec votre fichier.' : hash ? ' Aucune version identique à votre fichier : prenez celle de même source / même groupe ; sinon utilisez « Caler… » dans le lecteur.' : ' Version non vérifiable pour ce fichier : prenez celle de même source / même groupe ; sinon utilisez « Caler… » dans le lecteur.') : 'Aucun sous-titre trouvé : essayez un titre plus court ou une autre langue.';
      res.replaceChildren(...scored.map((o, n) => {
        const x = o.x, a = x.attributes, f = a.files[0], fd = a.feature_details || {};
        return el('div', { className: 'card' }, el('div', { className: 'grow' }, el('b', { textContent: String(fd.title || fd.movie_name || a.release || f.file_name || '?').slice(0, 120) + (fd.year ? ' (' + fd.year + ')' : '') }),
          el('small', { className: 'mut', textContent: String(a.release || f.file_name || '').slice(0, 140) }),
          el('div', { className: 'row tight' }, n === 0 ? el('span', { className: 'chip', textContent: '★ Recommandé' }) : null,
            el('span', { className: 'chip', textContent: (OSLANG.find(l => l[0].toLowerCase() === String(a.language || '').toLowerCase()) || [0, String(a.language || '?').toUpperCase()])[1] }),
            ...o.why.map(w => el('span', { className: 'chip', textContent: w })),
            el('span', { className: 'chip', textContent: (a.download_count || 0) + ' téléch.' }),
            a.ai_translated || a.machine_translated ? el('span', { className: 'chip', textContent: 'Traduction automatique' }) : null,
            a.hearing_impaired ? el('span', { className: 'chip', textContent: 'Malentendants' }) : null,
            a.fps ? el('span', { className: 'chip', textContent: Number(a.fps) + ' i/s' }) : null)),
          btn('Utiliser', 'download', () => use(f, a), 'pri'));
      }));
    } catch (e) { fail(e); }
  }
  async function use(f, a) {
    saveAcc(); if (!D.os.user || !D.os.pass) { st.textContent = 'Le téléchargement exige votre utilisateur et mot de passe OpenSubtitles (compte gratuit).'; return usr.focus(); }
    st.textContent = 'Téléchargement…';
    try {
      if (!OSTOK) await osLogin();
      const fid = Number(f.file_id); if (!Number.isInteger(fid) || fid <= 0) throw new Error('Ce sous-titre n’a pas de numéro de fichier valide : choisissez-en un autre.');
      let j; try { j = await osCall('/download', { body: { file_id: fid }, auth: OSTOK }); }
      catch (e) { if (/erreur 400/.test(e.message)) j = await osCall('/download', { body: { file_id: fid, sub_format: 'srt' }, auth: OSTOK }); else throw e; }   // 2e essai avec le format explicite si la 1re demande est refusée
      if (!j || !/^https:\/\//.test(String(j.link || ''))) throw new Error('OpenSubtitles n’a pas fourni de lien de téléchargement.');
      let r; try { r = await fetch(j.link, { credentials: 'omit', referrerPolicy: 'no-referrer' }); } catch { throw Object.assign(new Error('Le fichier de sous-titres n’a pas pu être récupéré par le navigateur (autorisation CORS).'), { net: true }); }
      if (!r.ok) throw new Error('Téléchargement refusé (' + r.status + ').');
      onSub((a.language || '').toUpperCase() + ' · ' + String(f.file_name || a.release || 'OpenSubtitles').slice(0, 60), parseSubs(decodeText(await r.arrayBuffer(), a.language)));
      st.textContent = 'Sous-titres ajoutés à la vidéo.' + (j.remaining != null ? ' Téléchargements restants aujourd’hui : ' + j.remaining + '.' : '');
    } catch (e) { OSTOK = ''; if (e.net) fail(e); else st.textContent = e.message; }   // la liste des résultats reste affichée : on peut corriger le compte puis recliquer sur « Utiliser »
  }
  win('Sous-titres OpenSubtitles', 'search', [
    el('p', { className: 'mut', textContent: 'Service externe (opensubtitles.com) : votre recherche et vos identifiants OpenSubtitles lui sont envoyés. Facultatif : vous pouvez toujours charger vos propres fichiers .srt/.vtt.' }),
    el('div', { className: 'row' }, q, lang, btn('Rechercher', 'search', search, 'pri')), el('label', { className: 'row tight' }, hideMt, el('span', { textContent: 'Masquer les traductions automatiques' })), st, res,
    el('details', { className: 'frm', open: !D.os.key }, el('summary', { textContent: 'Mon compte OpenSubtitles (chiffré dans votre profil)' }), el('div', { className: 'col' },
      el('small', { className: 'mut', textContent: 'Créez un compte gratuit sur opensubtitles.com, puis une clé API (rubrique « API consumers »).' }), btn('Obtenir une clé API (onglet)', 'ext', () => openTab('https://www.opensubtitles.com/consumers')), key, el('div', { className: 'fgrid' }, usr, pw), el('div', { className: 'row' }, btn('Tester la connexion', 'check', async () => {
        saveAcc(); OSTOK = ''; st.textContent = 'Test de la connexion…';
        try { const u = await osLogin(); st.textContent = '✓ Clé API, identifiant et mot de passe acceptés' + (u.level ? ' — compte « ' + String(u.level).slice(0, 40) + ' »' : '') + (u.allowed_downloads != null ? ', ' + Number(u.allowed_downloads) + ' téléchargements par jour' : '') + '.'; }
        catch (e) { OSTOK = ''; st.textContent = '✗ ' + e.message; }
      }, '', 'Tester la connexion : vérifie la clé API, l’identifiant et le mot de passe auprès d’OpenSubtitles'), btn('Enregistrer', 'save', () => { saveAcc(); OSTOK = ''; toast('Compte enregistré (chiffré).'); }))))], { w: 600, h: 600 });
}

/* ===================== Étiquettes ID3 des MP3 : pochette et paroles ===================== */
/* Lecture de l'en-tête du fichier seulement (Range pour un fichier WebDAV : pas de téléchargement complet). Aucune donnée n'est interprétée comme du code :
   texte via TextDecoder, image reconnue par ses premiers octets puis affichée en <img> blob. */
async function headBytes(t, n) {
  if (t.blob) return new Uint8Array(await t.blob.slice(0, n).arrayBuffer());
  const rs = await dav(t.c, 'GET', t.path, null, { Range: 'bytes=0-' + (n - 1) });
  if (rs.status === 206 || !rs.body) return new Uint8Array(await rs.arrayBuffer()).subarray(0, n);
  const rd = rs.body.getReader(), parts = []; let got = 0;   // le serveur ignore Range : on lit le début puis on coupe
  while (got < n) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; }
  rd.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(got, n)); let o = 0;
  for (const x of parts) { const k = Math.min(x.length, out.length - o); out.set(x.subarray(0, k), o); o += k; if (o >= out.length) break; }
  return out;
}
const syncsafe = (b, o) => (b[o] & 127) << 21 | (b[o + 1] & 127) << 14 | (b[o + 2] & 127) << 7 | (b[o + 3] & 127);
function id3Text(b, enc) {
  try {
    if (enc === 1) { const be = b[0] === 0xFE && b[1] === 0xFF, bom = be || (b[0] === 0xFF && b[1] === 0xFE); return new TextDecoder(be ? 'utf-16be' : 'utf-16le').decode(bom ? b.subarray(2) : b); }
    return new TextDecoder(enc === 2 ? 'utf-16be' : enc === 3 ? 'utf-8' : 'windows-1252').decode(b);
  } catch { return ''; }
}
const id3End = (b, o, enc) => { if (enc === 1 || enc === 2) { for (let i = o; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i; return b.length; } for (let i = o; i < b.length; i++) if (b[i] === 0) return i; return b.length; };
const id3Skip = enc => (enc === 1 || enc === 2) ? 2 : 1;
const picType = d => d.length > 4 && d[0] === 0xFF && d[1] === 0xD8 ? 'image/jpeg' : d.length > 8 && d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4E && d[3] === 0x47 ? 'image/png'
  : d.length > 4 && d[0] === 0x47 && d[1] === 0x49 && d[2] === 0x46 ? 'image/gif' : d.length > 12 && d[0] === 0x52 && d[8] === 0x57 && d[9] === 0x45 && d[10] === 0x42 && d[11] === 0x50 ? 'image/webp' : '';
function parseId3(b) {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33 || b[3] < 2 || b[3] > 4) return null;
  const ver = b[3], flags = b[5];
  let body = b.subarray(0, Math.min(b.length, 10 + syncsafe(b, 6))), o = 10;
  if ((flags & 0x80) && ver < 4) { const out = []; for (let i = 0; i < body.length; i++) { out.push(body[i]); if (body[i] === 0xFF && body[i + 1] === 0) i++; } body = Uint8Array.from(out); }
  if ((flags & 0x40) && ver >= 3) o += ver === 4 ? syncsafe(body, o) : 4 + ((body[o] << 24 | body[o + 1] << 16 | body[o + 2] << 8 | body[o + 3]) >>> 0);
  const out = { title: '', artist: '', album: '', lyrics: '', pic: null }, idL = ver === 2 ? 3 : 4, hL = ver === 2 ? 6 : 10, end = body.length;
  let picRank = -1;
  while (o + hL <= end && body[o] !== 0) {
    const id = String.fromCharCode(...body.subarray(o, o + idL));
    const sz = ver === 2 ? (body[o + 3] << 16 | body[o + 4] << 8 | body[o + 5]) : ver === 4 ? syncsafe(body, o + 4) : ((body[o + 4] << 24 | body[o + 5] << 16 | body[o + 6] << 8 | body[o + 7]) >>> 0);
    const fl = ver === 2 ? 0 : body[o + 9], s = o + hL, e = s + sz; o = e;
    if (sz <= 0 || e > end) break;
    if (ver === 4 ? (fl & 0x0C) : ver === 3 ? (fl & 0xC0) : 0) continue;   // compressé / chiffré : ignoré
    const d = body.subarray(ver === 4 && (fl & 1) ? s + 4 : s, e), enc = d[0], txt = x => id3Text(d.subarray(1), x).split('\0')[0].trim();
    if (id === 'TIT2' || id === 'TT2') out.title = out.title || txt(enc);
    else if (id === 'TPE1' || id === 'TP1') out.artist = out.artist || txt(enc);
    else if (id === 'TALB' || id === 'TAL') out.album = out.album || txt(enc);
    else if ((id === 'USLT' || id === 'ULT') && !out.lyrics) {
      const ds = id3End(d, 4, enc), tx = id3Text(d.subarray(ds + id3Skip(enc)), enc).replace(/\0+$/, '').replace(/\r\n?/g, '\n').trim();
      if (tx) out.lyrics = tx.slice(0, 60000);
    } else if (id === 'APIC' || id === 'PIC') {
      let pos, ptype;
      if (id === 'PIC') { pos = 5; ptype = d[4]; } else { const me = id3End(d, 1, 0); pos = me + 1; ptype = d[pos]; pos++; }
      const ds = id3End(d, pos, enc), data = d.subarray(ds + id3Skip(enc));
      const rank = ptype === 3 ? 2 : 1;
      if (data.length > 100 && data.length < 8e6 && picType(data) && rank > picRank) { picRank = rank; out.pic = { type: picType(data), data }; }
    }
  }
  return out;
}
async function readTags(t) {
  if (!/\.mp3$/i.test(t.name)) return null;
  const head = await headBytes(t, 10);
  if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return null;
  const size = syncsafe(head, 6) + 10; if (size > 12e6) return null;
  return parseId3(size > 10 ? await headBytes(t, size) : head);
}
