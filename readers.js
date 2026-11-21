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
          return el('div', { className: 'li' + (sel.has(f.name) ? ' on' : ''), tabIndex: 0, role: 'button', onclick: go, onkeydown: e => { if (e.key === 'Enter') go(); } }, ico(icon[kindOf(f.name)] || 'file', 18), el('span', { textContent: f.name }), el('small', { className: 'mut', textContent: fmtSize(f.size) }));
        })];
      list.replaceChildren(...(rows.length ? rows : [el('p', { className: 'mut', textContent: 'Aucun dossier ni fichier de ce type ici.' })])); drawFoot();
    };
    const load = async q => {
      const my = ++tok; list.replaceChildren(el('p', { className: 'mut', textContent: 'Chargement…' }));
      try {
        const items = (await FS.list(c, q)).filter(x => x.name).sort((a, b) => b.dir - a.dir || String(a.name).localeCompare(String(b.name), 'fr', { numeric: true }));
        if (my !== tok) return; p = q; all = items; sel.clear(); crumb.textContent = c.name + ' · ' + p; draw();
      } catch (e) { const m = e.code === 'net' ? (await testConn(c)).msg : e.message; if (my === tok) list.replaceChildren(el('div', { className: 'warn', textContent: m }), btn('Réessayer', 'refresh', () => load(q))); }
    };
    const w = win('Choisir dans le cloud', 'cloud', [el('div', { className: 'row' }, cs, btn('', 'up', () => load(parentP(p)), '', 'Dossier parent'), crumb), list, foot],
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
  const id = uid(), d = { url: (relayOn() && t.c.relay === true) ? viaRelay(davUrl(t.c, t.path)) : davUrl(t.c, t.path), auth: authHeader(t.c), mime: mimeOf(t.name) };
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
  const bar2 = el('div', { className: 'row tight vwbar' }, btn('Depuis le cloud…', 'cloud', async () => open(await pickCloud(['image'])), 'pri'), btn('Depuis cet appareil…', 'upload', () => chooseLocal('image/*', l => open({ files: l, i: 0 }))), info);
  IV.set = (f, n) => open({ files: f, i: n });
  IV.w = win('Visionneuse d’images', 'image', [bar2, bar, stage], { w: 820, h: 600, cls: 'vw', onclose: () => { stop(); ro.disconnect(); tok++; if (url) URL.revokeObjectURL(url); } });
  if (files) open({ files, i }); else empty();
}

/* ===================== Sous-titres : lecture des fichiers SRT / VTT / ASS ===================== */
function decodeText(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }   // anciens .srt en ANSI
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

/* ===================== Lecteur vidéo ===================== */
const VV = { w: null };
function videoWin(files, i = 0, siblings) {
  if (VV.w && VV.w.isConnected) { VV.w.hidden = false; VV.w.style.zIndex = ++Z; if (files) VV.set(files, i, siblings); return; }
  let q = [], idx = 0, sibs = [], rel = null, tok = 0, v = null, tracks = [], cur = -1, off = 0;
  const stage = el('div', { className: 'vv-stage' }), info = el('small', { className: 'mut grow' }), stat = el('small', { className: 'mut' });
  const subSel = el('select', { 'aria-label': 'Sous-titres' }), offL = el('small', { className: 'mut', textContent: '0,0 s' });
  const drawSel = () => { opts(subSel, [['-1', 'Sous-titres : aucun'], ...tracks.map((t, k) => [String(k), t.label])]); subSel.value = String(cur); };
  const render = () => {   // (re)crée les cues de la piste active avec le décalage
    tracks.forEach((t, k) => { for (const c of [...(t.tr.cues || [])]) t.tr.removeCue(c); t.tr.mode = 'disabled'; if (k === cur) { for (const c of t.cues) { const cue = new VTTCue(Math.max(0, c.s + off), Math.max(0.01, c.e + off), c.t); t.tr.addCue(cue); } t.tr.mode = 'showing'; } });
    offL.textContent = (off >= 0 ? '+' : '') + off.toFixed(1).replace('.', ',') + ' s';
  };
  const addSubs = (label, cues, show = true) => {
    if (!cues.length) return toast('Aucun sous-titre lisible dans ce fichier.');
    tracks.push({ label, cues, tr: v.addTextTrack('subtitles', label, '') }); if (show) cur = tracks.length - 1; drawSel(); render(); toast('Sous-titres chargés : ' + label + ' (' + cues.length + ' lignes).');
  };
  subSel.onchange = () => { cur = +subSel.value; render(); };
  const shift = d => { off = Math.round((off + d) * 10) / 10; render(); };
  const subFromEntry = async t => { try { const b = await getBlob(t); addSubs(t.name, parseSubs(decodeText(await b.arrayBuffer()))); } catch (e) { toast(e.message || 'Sous-titres illisibles.'); } };
  const autoSubs = t => {   // sous-titres du même nom dans le même dossier
    const stem = t.name.replace(/\.[^.]+$/, '').toLowerCase();
    const m = sibs.filter(s => SUBRE.test(s.name) && s.name.toLowerCase().startsWith(stem)).slice(0, 4);
    m.forEach((s, k) => getBlob(s).then(async b => { if (t === q[idx] && v) addSubs(s.name, parseSubs(decodeText(await b.arrayBuffer())), k === 0); }).catch(() => {}));
  };
  const fresh = () => { if (v) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } v = el('video', { controls: true, playsInline: true, preload: 'metadata' }); stage.replaceChildren(v); tracks = []; cur = -1; off = 0; drawSel(); offL.textContent = '0,0 s'; };
  const release = () => { if (rel) { rel(); rel = null; } };
  const playIdx = async n => {
    if (!q.length) return;
    idx = (n + q.length) % q.length; const t = q[idx], my = ++tok; release(); fresh(); stat.textContent = ''; info.textContent = t.name + (q.length > 1 ? ' · ' + (idx + 1) + ' / ' + q.length : '');
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
    vid.play().catch(() => {}); autoSubs(t);
  };
  const open = r => { if (r) { q = r.files; sibs = r.siblings || r.files; playIdx(r.i || 0); } };
  VV.set = (f, n, s) => open({ files: f, i: n, siblings: s });
  const subFile = () => chooseLocal('.srt,.vtt,.ass,.ssa,text/*', async l => { if (!v) return toast('Ouvrez d’abord une vidéo.'); for (const f of l) addSubs(f.name, parseSubs(decodeText(await f.blob.arrayBuffer()))); });
  const bar = el('div', { className: 'row tight vwbar' }, btn('Vidéo (cloud)…', 'cloud', async () => open(await pickCloud(['video'])), 'pri'), btn('Vidéo (appareil)…', 'upload', () => chooseLocal('video/*', l => open({ files: l, i: 0, siblings: l }))),
    btn('', 'prev', () => q.length > 1 && playIdx(idx - 1), '', 'Vidéo précédente'), btn('', 'next', () => q.length > 1 && playIdx(idx + 1), '', 'Vidéo suivante'), info, stat);
  const bar2 = el('div', { className: 'row tight vwbar' }, subSel, btn('Mes sous-titres…', 'upload', subFile, '', 'Charger un fichier .srt, .vtt ou .ass depuis cet appareil'),
    btn('Sous-titres du cloud…', 'cloud', async () => { if (!v) return toast('Ouvrez d’abord une vidéo.'); const r = await pickCloud(['text', 'sub'], 'add'); if (r) for (const t of r.files) await subFromEntry(t); }),
    btn('OpenSubtitles…', 'search', () => { if (!v) return toast('Ouvrez d’abord une vidéo.'); osWin(cleanName(q[idx].name), (label, cues) => addSubs(label, cues)); }, '', 'Chercher des sous-titres sur opensubtitles.com (service externe)'),
    btn('', 'minus', () => shift(-0.5), '', 'Sous-titres plus tôt (−0,5 s)'), offL, btn('', 'plus', () => shift(0.5), '', 'Sous-titres plus tard (+0,5 s)'));
  VV.w = win('Lecteur vidéo', 'video', [bar, bar2, stage, el('small', { className: 'mut', textContent: 'Fichiers vidéo : formats lus par votre navigateur (MP4/H.264, WebM…). Sous-titres : .srt, .vtt, .ass, ou OpenSubtitles (service externe, compte gratuit).' })],
    { w: 820, h: 620, cls: 'vw', onclose: () => { tok++; release(); if (v) { v.pause(); v.removeAttribute('src'); v.load(); } } });
  drawSel(); if (files) open({ files, i, siblings }); else stage.replaceChildren(el('p', { className: 'iv-msg', textContent: 'Ouvrez une vidéo depuis votre stockage cloud ou cet appareil.' }));
}

/* ===================== OpenSubtitles (service externe, facultatif) ===================== */
/* API REST v1 de opensubtitles.com : clé API gratuite + compte (le téléchargement exige une connexion). Les identifiants sont gardés
   dans votre profil chiffré. Seul le nom du fichier recherché et vos identifiants OpenSubtitles sont envoyés à ce service. */
const OSAPI = 'https://api.opensubtitles.com/api/v1', OSLANG = [['fr', 'Français'], ['en', 'Anglais'], ['es', 'Espagnol'], ['de', 'Allemand'], ['it', 'Italien'], ['pt-pt', 'Portugais'], ['pt-br', 'Portugais (Brésil)'], ['nl', 'Néerlandais'], ['pl', 'Polonais'], ['ru', 'Russe'], ['tr', 'Turc'], ['ar', 'Arabe'], ['ja', 'Japonais'], ['ko', 'Coréen'], ['zh-cn', 'Chinois']];
let OSTOK = '';
async function osCall(path, o = {}) {
  const h = { 'Api-Key': D.os.key, Accept: 'application/json' }; if (o.body) h['Content-Type'] = 'application/json'; if (o.auth) h.Authorization = 'Bearer ' + o.auth;
  let r; try { r = await fetch(OSAPI + path, { method: o.body ? 'POST' : 'GET', headers: h, body: o.body && JSON.stringify(o.body), credentials: 'omit', referrerPolicy: 'no-referrer' }); }
  catch { throw Object.assign(new Error('OpenSubtitles n’a pas répondu au navigateur (réseau ou autorisation CORS). Utilisez « Mes sous-titres » avec un fichier téléchargé sur opensubtitles.com.'), { net: true }); }
  if (r.status === 401 || r.status === 403) throw new Error('OpenSubtitles a refusé la clé API ou la connexion (' + r.status + ') : vérifiez la clé, l’utilisateur et le mot de passe.');
  if (r.status === 406) throw new Error('Quota de téléchargements OpenSubtitles atteint pour aujourd’hui.');
  if (r.status === 429) throw new Error('Trop de requêtes vers OpenSubtitles : patientez un instant.');
  if (!r.ok) throw new Error('OpenSubtitles : erreur ' + r.status + '.');
  return r.json();
}
function osWin(query, onSub) {
  const key = el('input', { placeholder: 'Clé API (gratuite)', value: D.os.key, maxLength: 100, autocomplete: 'off', spellcheck: false });
  const usr = el('input', { placeholder: 'Utilisateur OpenSubtitles', value: D.os.user, maxLength: 100, autocomplete: 'off' });
  const pw = el('input', { type: 'password', placeholder: 'Mot de passe OpenSubtitles', value: D.os.pass, maxLength: 200, autocomplete: 'new-password' });
  const q = el('input', { value: query, maxLength: 200, placeholder: 'Titre du film ou de la série', onkeydown: e => { if (e.key === 'Enter') search(); } });
  const lang = el('select', { 'aria-label': 'Langue' }); opts(lang, OSLANG); lang.value = OSLANG.some(l => l[0] === D.os.lang) ? D.os.lang : 'fr';
  const st = el('div', { className: 'mut' }), res = el('div', { className: 'col' });
  const saveAcc = () => { D.os = { key: key.value.trim(), user: usr.value.trim(), pass: pw.value, lang: lang.value }; save(); };
  const fail = e => { st.textContent = e.message; res.replaceChildren(...(e.net ? [btn('Ouvrir opensubtitles.com (onglet)', 'ext', () => openTab('https://www.opensubtitles.com/'))] : [])); };
  async function search() {
    saveAcc(); if (!D.os.key) { st.textContent = 'Saisissez d’abord votre clé API (voir ci-dessous).'; return key.focus(); }
    if (!q.value.trim()) return q.focus(); st.textContent = 'Recherche…'; res.replaceChildren();
    try {
      const j = await osCall('/subtitles?languages=' + encodeURIComponent(lang.value) + '&order_by=download_count&query=' + encodeURIComponent(q.value.trim().toLowerCase()));
      const d = (j.data || []).filter(x => x && x.attributes && x.attributes.files && x.attributes.files[0]).slice(0, 25);
      st.textContent = d.length ? d.length + ' résultat(s).' : 'Aucun sous-titre trouvé : essayez un titre plus court ou une autre langue.';
      res.replaceChildren(...d.map(x => {
        const a = x.attributes, f = a.files[0], fd = a.feature_details || {};
        return el('div', { className: 'card' }, el('div', { className: 'grow' }, el('b', { textContent: String(fd.title || fd.movie_name || a.release || f.file_name || '?').slice(0, 120) + (fd.year ? ' (' + fd.year + ')' : '') }),
          el('small', { className: 'mut', textContent: String(a.release || f.file_name || '').slice(0, 140) }),
          el('div', { className: 'row tight' }, el('span', { className: 'chip', textContent: String(a.language || '').toUpperCase() }), el('span', { className: 'chip', textContent: (a.download_count || 0) + ' téléch.' }), a.hearing_impaired ? el('span', { className: 'chip', textContent: 'Malentendants' }) : null)),
          btn('Utiliser', 'download', () => use(f, a), 'pri'));
      }));
    } catch (e) { fail(e); }
  }
  async function use(f, a) {
    saveAcc(); if (!D.os.user || !D.os.pass) { st.textContent = 'Le téléchargement exige votre utilisateur et mot de passe OpenSubtitles (compte gratuit).'; return usr.focus(); }
    st.textContent = 'Téléchargement…';
    try {
      if (!OSTOK) OSTOK = (await osCall('/login', { body: { username: D.os.user, password: D.os.pass } })).token || '';
      if (!OSTOK) throw new Error('Connexion à OpenSubtitles refusée.');
      const j = await osCall('/download', { body: { file_id: f.file_id, sub_format: 'srt' }, auth: OSTOK });
      let r; try { r = await fetch(j.link, { credentials: 'omit', referrerPolicy: 'no-referrer' }); } catch { throw Object.assign(new Error('Le fichier de sous-titres n’a pas pu être récupéré par le navigateur (autorisation CORS).'), { net: true }); }
      if (!r.ok) throw new Error('Téléchargement refusé (' + r.status + ').');
      onSub((a.language || '').toUpperCase() + ' · ' + String(f.file_name || a.release || 'OpenSubtitles').slice(0, 60), parseSubs(decodeText(await r.arrayBuffer())));
      st.textContent = 'Sous-titres ajoutés à la vidéo.' + (j.remaining != null ? ' Téléchargements restants aujourd’hui : ' + j.remaining + '.' : '');
    } catch (e) { OSTOK = ''; fail(e); }
  }
  win('Sous-titres OpenSubtitles', 'search', [
    el('p', { className: 'mut', textContent: 'Service externe (opensubtitles.com) : votre recherche et vos identifiants OpenSubtitles lui sont envoyés. Facultatif : vous pouvez toujours charger vos propres fichiers .srt/.vtt.' }),
    el('div', { className: 'row' }, q, lang, btn('Rechercher', 'search', search, 'pri')), st, res,
    el('details', { className: 'frm', open: !D.os.key }, el('summary', { textContent: 'Mon compte OpenSubtitles (chiffré dans votre profil)' }), el('div', { className: 'col' },
      el('small', { className: 'mut', textContent: 'Créez un compte gratuit sur opensubtitles.com, puis une clé API (rubrique « API consumers »).' }), btn('Obtenir une clé API (onglet)', 'ext', () => openTab('https://www.opensubtitles.com/consumers')), key, el('div', { className: 'fgrid' }, usr, pw), btn('Enregistrer', 'save', () => { saveAcc(); OSTOK = ''; toast('Compte enregistré (chiffré).'); })))], { w: 600, h: 600 });
}
