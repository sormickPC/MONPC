'use strict';
/* kaleido.js — « Kaléido », l'atelier photo et dessin de sormick Cloud (remplace l'ancien « Dessin »).
   Tout est écrit à la main, sans bibliothèque externe, et tourne dans votre navigateur : aucune image n'est envoyée nulle part, sauf sur le stockage WebDAV que vous choisissez.
   - Calques (opacité, modes de fusion, ordre, fusion), sélections (rectangle, ellipse, lasso, baguette magique), annuler / rétablir.
   - Dessin : pinceau, crayon, marqueur, aérographe, gomme, formes, dégradés, texte, autocollants, pipette, symétrie / mandala.
   - Retouche : tampon de duplication, correcteur, doigt, flou, netteté, éclaircir / assombrir, éponge, mosaïque, yeux rouges, recadrage, réglages et filtres (kfilters.js).
   - Fichiers : ouverture (appareil, cloud, glisser-déposer, presse-papiers), export PNG / JPEG / WebP, projet à calques « .kaleido » (une archive ZIP de calques PNG). */
const KD_ICONS = {
  airbrush: 'M7 21h6a2 2 0 0 0 2-2v-6H5v6a2 2 0 0 0 2 2zM8 13V9h4v4M10 9V6M17 6h.01M20 4h.01M20 8h.01M17 10h.01M20 12h.01',
  marker: 'M3 21l2-5L16 5l3 3L8 19zM13 8l3 3M3 21h6',
  stamp: 'M12 3a3 3 0 0 0-3 3c0 2 1 3 1 5H7a2 2 0 0 0-2 2v2h14v-2a2 2 0 0 0-2-2h-3c0-2 1-3 1-5a3 3 0 0 0-3-3zM5 18h14v3H5z',
  smudge: 'M8 13V6a2 2 0 0 1 4 0v5M12 11V4.5a2 2 0 0 1 4 0V11M16 11V8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-1a8 8 0 0 1-7-4l-2-4a2 2 0 0 1 3-2l3 3',
  blur: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  sharpen: 'M12 3L3 20h18zM12 10v5',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  sponge: 'M4 10a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM8 12h.01M12 11h.01M16 13h.01M10 15h.01M14 16h.01',
  mosaic: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  heal: 'M4.5 14.5l10-10a3.5 3.5 0 0 1 5 5l-10 10a3.5 3.5 0 0 1-5-5zM10 8l6 6M9 12h.01M12 15h.01',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeoff: 'M17.9 17.9A10.1 10.1 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M1 1l22 22',
  grad: 'M3 3h18v18H3zM3 8h18M3 13h18M3 18h18',
  shapes: 'M8 3l5 8H3zM17 13a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  smile: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  pipette: 'M20.5 3.5a2.1 2.1 0 0 0-3 0L14 7l-1-1-2 2 1 1-8 8v3h3l8-8 1 1 2-2-1-1 3.5-3.5a2.1 2.1 0 0 0 0-3z',
  selrect: 'M4 4h2M9 4h2M14 4h2M19 4h1v2M20 9v2M20 14v2M20 19h-1M15 20h-2M10 20H8M5 20H4v-1M4 15v-2M4 10V8',
  selell: 'M12 3a9 9 0 0 1 3 .5M19 6.5a9 9 0 0 1 2 5M21 15a9 9 0 0 1-3 5M13 21a9 9 0 0 1-5 0M5 18a9 9 0 0 1-2-5M3 9a9 9 0 0 1 3-4',
  lasso: 'M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-5-1M5 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  wand: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h.01M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14',
  hand: 'M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L3.4 16a2 2 0 0 1 3.2-2.4L8 15',
  layers: 'M12 2l10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5',
  flip: 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
  redeye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'
};
const KD_BLEND = [['source-over', 'Normal'], ['multiply', 'Produit (assombrit)'], ['screen', 'Écran (éclaircit)'], ['overlay', 'Incrustation'], ['soft-light', 'Lumière douce'], ['hard-light', 'Lumière crue'], ['darken', 'Plus sombre'], ['lighten', 'Plus clair'], ['color-dodge', 'Densité couleur −'], ['color-burn', 'Densité couleur +'], ['difference', 'Différence'], ['exclusion', 'Exclusion'], ['hue', 'Teinte'], ['saturation', 'Saturation'], ['color', 'Couleur'], ['luminosity', 'Luminosité']];
const KD_BM = new Set(KD_BLEND.map(b => b[0]));
const KD_MAX = 3200, KD_DOC = 4096, KD_MAXL = 40;
const KD_PAL = ['#000000', '#404040', '#808080', '#bfbfbf', '#ffffff', '#7f1d1d', '#ef4444', '#f97316', '#facc15', '#a3e635', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#1e3a8a', '#8b5cf6', '#d946ef', '#ec4899', '#92400e', '#d6a77a', '#fde68a', '#fecaca', '#bbf7d0', '#bae6fd'];
const KD_EMO = ['⭐', '❤️', '😀', '😎', '🔥', '🌈', '🎈', '🎉', '👍', '✨', '🌸', '🦋', '🐱', '🐶', '☀️', '🌙', '⚡', '💎', '🍕', '🎵'];
const KD_FONTS = [['sans-serif', 'Sans empattement'], ['serif', 'Avec empattement'], ['monospace', 'Machine à écrire'], ['cursive', 'Manuscrite'], ['fantasy', 'Fantaisie'], ['Impact, "Arial Black", sans-serif', 'Affiche (gras)'], ['Georgia, serif', 'Georgia'], ['"Trebuchet MS", sans-serif', 'Trebuchet']];
const KD_SYM = [['none', 'Aucune'], ['mx', 'Miroir gauche / droite'], ['my', 'Miroir haut / bas'], ['mxy', 'Miroir 4 quadrants'], ['r3', 'Rotation × 3'], ['r4', 'Rotation × 4'], ['r6', 'Rotation × 6'], ['r8', 'Rotation × 8'], ['r12', 'Rotation × 12'], ['k4', 'Mandala × 4 (miroir)'], ['k6', 'Mandala × 6 (miroir)'], ['k8', 'Mandala × 8 (miroir)'], ['k12', 'Mandala × 12 (miroir)']];
/* outils : [id, icône, libellé, touche] */
const KD_TOOLS = [
  [['move', 'move', 'Déplacer le calque ou la sélection', 'V'], ['hand', 'hand', 'Main (déplacer la vue)', 'H'], ['selrect', 'selrect', 'Sélection rectangulaire', 'M'], ['selell', 'selell', 'Sélection elliptique', ''], ['lasso', 'lasso', 'Lasso (sélection à main levée)', 'L'], ['wand', 'wand', 'Baguette magique', 'W'], ['crop', 'crop', 'Recadrer', 'C'], ['pipette', 'pipette', 'Pipette (prélever une couleur)', 'I']],
  [['brush', 'brush', 'Pinceau', 'B'], ['pencil', 'edit', 'Crayon', 'N'], ['marker', 'marker', 'Marqueur (calligraphie)', ''], ['airbrush', 'airbrush', 'Aérographe', 'A'], ['eraser', 'eraser', 'Gomme', 'E'], ['fill', 'drop', 'Pot de peinture', 'G'], ['gradient', 'grad', 'Dégradé', 'D'], ['shape', 'shapes', 'Formes et lignes', 'U'], ['text', 'text', 'Texte', 'T'], ['sticker', 'smile', 'Autocollants', 'S']],
  [['clone', 'stamp', 'Tampon de duplication', 'K'], ['heal', 'heal', 'Correcteur (effacer une tache)', 'J'], ['smudge', 'smudge', 'Doigt (étaler)', 'R'], ['blur', 'blur', 'Flou local', 'O'], ['sharpen', 'sharpen', 'Netteté locale', ''], ['dodge', 'sun', 'Éclaircir', ''], ['burn', 'moon', 'Assombrir', ''], ['sponge', 'sponge', 'Éponge (saturation)', ''], ['mosaic', 'mosaic', 'Mosaïque locale', ''], ['redeye', 'redeye', 'Yeux rouges', '']]
];
const KD_PAINT = new Set(['brush', 'pencil', 'marker', 'airbrush', 'eraser']);
const KD_DIRECT = new Set(['smudge', 'blur', 'sharpen', 'dodge', 'burn', 'sponge', 'mosaic', 'heal']);
const kdHex = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const kdCol = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const kdFall = (d, h) => { if (d >= 1) return 0; const hd = h / 100; return d <= hd ? 1 : .5 + .5 * Math.cos((d - hd) / (1 - hd) * Math.PI); };

function kaleidoWin(openBlob, openName) {
  Object.assign(IC, KD_ICONS);   // les icônes propres à Kaléido (« IC » est défini dans app.js, chargé après ce fichier)
  /* ================= état ================= */
  let W = 1280, H = 800, cur = 0, tool = 'brush', fg = '#1f2937', bgc = '#ffffff', zoom = 1, dirty = false, showOrig = false, orig = null, clipC = null, cloneSrc = null, space = false;
  const L = [], hist = [], redoS = [], MAXH = 40, MAXB = 450e6;
  const TS = { brush: { size: 18, hard: 60, op: 100, flow: 100 }, pencil: { size: 3, hard: 100, op: 100, flow: 100 }, marker: { size: 26, hard: 100, op: 75, flow: 100 }, airbrush: { size: 46, hard: 0, op: 100, flow: 14 }, eraser: { size: 26, hard: 70, op: 100, flow: 100 },
    clone: { size: 44, hard: 60, op: 100 }, heal: { size: 32, hard: 40, op: 100 }, smudge: { size: 34, hard: 60, op: 55 }, blur: { size: 34, hard: 60, op: 55 }, sharpen: { size: 34, hard: 60, op: 55 }, dodge: { size: 46, hard: 0, op: 40 }, burn: { size: 46, hard: 0, op: 40 }, sponge: { size: 46, hard: 0, op: 50 }, mosaic: { size: 70, hard: 100, op: 100 }, redeye: { size: 36, hard: 60, op: 100 },
    fill: { size: 1, hard: 0, op: 100 }, gradient: { size: 1, hard: 0, op: 100 }, shape: { size: 5, hard: 0, op: 100 }, text: { size: 1, hard: 0, op: 100 }, sticker: { size: 56, hard: 0, op: 100 }, selrect: {}, selell: {}, lasso: {}, wand: {}, move: {}, hand: {}, crop: {}, pipette: {} };
  const opt = { smooth: 25, sym: 'none', tol: 32, contig: true, all: false, shape: 'rect', fm: 'stroke', grad: 'linear', transp: false, selMode: 'rep', font: 'sans-serif', fsize: 64, bold: true, italic: false, outline: 0, newL: true, sticker: '⭐', ratio: 'free', spongeMode: 'sat' };
  const S = () => TS[tool] || TS.brush;
  let sel = null;   // { a: Uint8ClampedArray(W*H), bb: {x,y,w,h}, path: Path2D }
  const recent = [];

  /* ================= calques ================= */
  const mkLayer = (name, w = W, h = H, id) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return { id: id || uid(), name, c, x: c.getContext('2d', { willReadFrequently: true }), vis: true, op: 100, bm: 'source-over' }; };
  const lay = () => L[cur];
  const cv = el('canvas', { className: 'kd-cv', width: W, height: H }), vx = cv.getContext('2d');
  const ov = el('canvas', { className: 'kd-ov', width: W, height: H, tabIndex: 0, 'aria-label': 'Zone de travail Kaléido' }), ox = ov.getContext('2d');
  const ring = el('div', { className: 'kd-ring', hidden: true });
  const page = el('div', { className: 'kd-page' }, cv, ov, ring), scroller = el('div', { className: 'kd-scroll' }, page);
  const clampR = (r, w = W, h = H) => { const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y)), x1 = Math.min(w, Math.ceil(r.x + r.w)), y1 = Math.min(h, Math.ceil(r.y + r.h)); return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null; };
  const unionR = (a, b) => { if (!a) return b; if (!b) return a; const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y); return { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0 }; };
  const FULL = () => ({ x: 0, y: 0, w: W, h: H });
  function render(r) {
    r = clampR(r || FULL()); if (!r) return;
    vx.save(); vx.beginPath(); vx.rect(r.x, r.y, r.w, r.h); vx.clip(); vx.clearRect(r.x, r.y, r.w, r.h);
    if (showOrig && orig) vx.drawImage(orig, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    else for (const l of L) if (l.vis) { vx.globalAlpha = l.op / 100; vx.globalCompositeOperation = l.bm; vx.drawImage(l.c, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h); }
    vx.restore(); dirty = true; histSoon();
  }
  const sizeDoc = (w, h) => { W = cv.width = ov.width = w; H = cv.height = ov.height = h; setZoom(zoom); };
  function setZoom(z, keep) {
    z = Math.max(.05, Math.min(16, z)); const sw = scroller.scrollWidth, sh = scroller.scrollHeight, cx = scroller.scrollLeft + scroller.clientWidth / 2, cy = scroller.scrollTop + scroller.clientHeight / 2;
    zoom = z; const cw = Math.round(W * z) + 'px', ch = Math.round(H * z) + 'px'; cv.style.width = ov.style.width = page.style.width = cw; cv.style.height = ov.style.height = page.style.height = ch;
    if (keep && sw) { scroller.scrollLeft = cx / sw * scroller.scrollWidth - scroller.clientWidth / 2; scroller.scrollTop = cy / sh * scroller.scrollHeight - scroller.clientHeight / 2; }
    zl.textContent = Math.round(z * 100) + ' %'; selPaths = null; drawOv();
  }
  const fit = () => setZoom(Math.max(.05, Math.min(2, (scroller.clientWidth - 28) / W, (scroller.clientHeight - 28) / H)) || 1);

  /* ================= historique (annuler / rétablir) ================= */
  const getImg = (l = lay()) => l.x.getImageData(0, 0, l.c.width, l.c.height);
  const snapDoc = () => ({ k: 'doc', W, H, cur, layers: L.map(l => ({ id: l.id, name: l.name, vis: l.vis, op: l.op, bm: l.bm, img: getImg(l) })) });
  const sizeOf = e => e.k === 'px' ? e.img.data.length : e.k === 'doc' ? e.layers.reduce((s, l) => s + l.img.data.length, 0) : (e.k === 'addL' || e.k === 'delL') ? e.layer.c.width * e.layer.c.height * 4 : 1000;
  function pushHist(e) { hist.push(e); redoS.length = 0; let b = hist.reduce((s, x) => s + sizeOf(x), 0); while (hist.length > MAXH || (b > MAXB && hist.length > 1)) b -= sizeOf(hist.shift()); syncU(); dirty = true; }
  const byId = id => L.findIndex(l => l.id === id);
  function restoreDoc(e) {
    L.length = 0; W = cv.width = ov.width = e.W; H = cv.height = ov.height = e.H;
    for (const s of e.layers) { const l = mkLayer(s.name, e.W, e.H, s.id); l.vis = s.vis; l.op = s.op; l.bm = s.bm; l.x.putImageData(s.img, 0, 0); L.push(l); }
    cur = Math.min(e.cur, L.length - 1); sel = null; setZoom(zoom);
  }
  function applyEntry(e) {   // applique l'entrée et renvoie l'entrée inverse
    if (e.k === 'px') { const i = byId(e.lid); if (i < 0) return null; const l = L[i], inv = { k: 'px', lid: e.lid, img: getImg(l) }; l.x.putImageData(e.img, 0, 0); return inv; }
    if (e.k === 'doc') { const inv = snapDoc(); restoreDoc(e); return inv; }
    if (e.k === 'addL') { const i = byId(e.layer.id); if (i < 0) return null; L.splice(i, 1); cur = Math.min(cur, L.length - 1); return { k: 'delL', idx: i, layer: e.layer }; }
    if (e.k === 'delL') { L.splice(e.idx, 0, e.layer); cur = e.idx; return { k: 'addL', layer: e.layer }; }
    if (e.k === 'order') { const l = L.splice(e.to, 1)[0]; L.splice(e.from, 0, l); cur = e.from; return { k: 'order', from: e.to, to: e.from }; }
    if (e.k === 'prop') { const i = byId(e.lid); if (i < 0) return null; const l = L[i], inv = { k: 'prop', lid: e.lid, v: { vis: l.vis, op: l.op, bm: l.bm, name: l.name } }; Object.assign(l, e.v); return inv; }
    return null;
  }
  function stepH(from, to) {
    const e = from.pop(); if (!e) return; const inv = applyEntry(e); if (inv) to.push(inv); selPaths = null; syncU(); render(); layersUI(); drawOv(); updInfo();
  }
  const doUndo = () => stepH(hist, redoS), doRedo = () => stepH(redoS, hist);
  const uB = btn('', 'undo', doUndo, '', 'Annuler (Ctrl+Z)'), rB = btn('', 'redo', doRedo, '', 'Rétablir (Ctrl+Y)');
  function syncU() { uB.disabled = !hist.length; rB.disabled = !redoS.length; }
  const pxHist = (l = lay()) => { const img = getImg(l); pushHist({ k: 'px', lid: l.id, img }); return img; };

  /* ================= sélection ================= */
  let selPaths = null, antsT = 0;
  const selBB = a => { let x0 = W, y0 = H, x1 = -1, y1 = -1; for (let y = 0; y < H; y++) { const o = y * W; for (let x = 0; x < W; x++) if (a[o + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; } } return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; };
  function selSet(a, mode = 'rep') {   // a : masque (0-255) ; mode : rep / add / sub / int
    if (!a) { sel = null; selPaths = null; drawOv(); updInfo(); return; }
    if (sel && mode !== 'rep') { const o = sel.a; for (let i = 0; i < a.length; i++) { const p = o[i], q = a[i]; a[i] = mode === 'add' ? Math.max(p, q) : mode === 'sub' ? Math.round(p * (255 - q) / 255) : Math.min(p, q); } }
    const bb = selBB(a); sel = bb ? { a, bb } : null; selPaths = null; drawOv(); updInfo();
  }
  const maskFrom = draw => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; draw(x); const d = x.getImageData(0, 0, W, H).data, a = new Uint8ClampedArray(W * H); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]; return a; };
  function featherMask(a, r) { r = Math.round(r); if (r < 1) return a; const t = new Float32Array(W * H), b = new Float32Array(W * H); for (let i = 0; i < a.length; i++) t[i] = a[i]; for (let pass = 0; pass < 2; pass++) { for (let y = 0; y < H; y++) { let s = 0; const o = y * W; for (let x = -r; x <= r; x++) s += t[o + Math.max(0, Math.min(W - 1, x))]; for (let x = 0; x < W; x++) { b[o + x] = s / (2 * r + 1); s += t[o + Math.min(W - 1, x + r + 1)] - t[o + Math.max(0, x - r)]; } } for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[Math.max(0, Math.min(H - 1, y)) * W + x]; for (let y = 0; y < H; y++) { t[y * W + x] = s / (2 * r + 1); s += b[Math.min(H - 1, y + r + 1) * W + x] - b[Math.max(0, y - r) * W + x]; } } } const o = new Uint8ClampedArray(W * H); for (let i = 0; i < o.length; i++) o[i] = t[i]; return o; }
  function maskBlend(base, R) {   // hors de la sélection, on remet les pixels d'avant
    if (!sel) return; R = clampR(R || FULL()); if (!R) return; const l = lay(), id = l.x.getImageData(R.x, R.y, R.w, R.h), d = id.data, b = base.data, a = sel.a;
    for (let j = 0; j < R.h; j++) for (let i = 0; i < R.w; i++) { const m = a[(R.y + j) * W + R.x + i]; if (m === 255) continue; const k = (j * R.w + i) * 4, q = ((R.y + j) * W + R.x + i) * 4, f = m / 255; d[k] = b[q] + (d[k] - b[q]) * f; d[k + 1] = b[q + 1] + (d[k + 1] - b[q + 1]) * f; d[k + 2] = b[q + 2] + (d[k + 2] - b[q + 2]) * f; d[k + 3] = b[q + 3] + (d[k + 3] - b[q + 3]) * f; }
    l.x.putImageData(id, R.x, R.y);
  }
  function buildEdges() {   // contour de la sélection (les « fourmis ») : deux jeux de points qui alternent
    selPaths = null; if (!sel) return; const a = sel.a, bb = sel.bb, ps = Math.max(1, Math.round(1.6 / zoom)), A = new Path2D(), B = new Path2D(); let n = 0;
    for (let y = bb.y; y < bb.y + bb.h; y++) for (let x = bb.x; x < bb.x + bb.w; x++) { if (a[y * W + x] < 128) continue; if ((x > 0 && a[y * W + x - 1] >= 128) && (x < W - 1 && a[y * W + x + 1] >= 128) && (y > 0 && a[(y - 1) * W + x] >= 128) && (y < H - 1 && a[(y + 1) * W + x] >= 128)) continue; (((x + y) >> 2) & 1 ? A : B).rect(x - (ps - 1) / 2, y - (ps - 1) / 2, ps, ps); if (++n > 300000) break; }
    selPaths = { A, B, n };
  }
  /* ================= incrustations (sélection, aperçu des formes, recadrage…) ================= */
  let prev = null, crop = null;   // prev : fonction qui dessine un aperçu sur ov
  function drawOv() {
    ox.clearRect(0, 0, W, H);
    if (sel) {
      if (!selPaths) buildEdges();
      if (selPaths) { ox.fillStyle = '#000'; ox.fill(antsT ? selPaths.A : selPaths.B); ox.fillStyle = '#fff'; ox.fill(antsT ? selPaths.B : selPaths.A); }
    }
    if (opt.sym !== 'none' && KD_PAINT.has(tool)) {   // repères de la symétrie
      ox.save(); ox.strokeStyle = 'rgba(217,70,239,.8)'; ox.lineWidth = 1 / zoom; ox.setLineDash([6 / zoom, 6 / zoom]); ox.beginPath();
      const m = opt.sym, n = m.length > 2 ? +m.slice(1) : 0;
      if (m === 'mx' || m === 'mxy') { ox.moveTo(W / 2, 0); ox.lineTo(W / 2, H); } if (m === 'my' || m === 'mxy') { ox.moveTo(0, H / 2); ox.lineTo(W, H / 2); }
      for (let k = 0; k < n * (m[0] === 'k' ? 1 : 1); k++) { const a = k * Math.PI / n * (m[0] === 'k' ? 1 : 2) ; ox.moveTo(W / 2, H / 2); ox.lineTo(W / 2 + Math.cos(a) * W, H / 2 + Math.sin(a) * W); }
      ox.stroke(); ox.restore();
    }
    if (prev) { ox.save(); prev(ox); ox.restore(); }
    if (crop) {
      ox.save(); ox.fillStyle = 'rgba(0,0,0,.55)'; ox.beginPath(); ox.rect(0, 0, W, H); ox.rect(crop.x, crop.y, crop.w, crop.h); ox.fill('evenodd');
      const lw = 1.5 / zoom, hs = 6 / zoom; ox.strokeStyle = '#fff'; ox.lineWidth = lw; ox.strokeRect(crop.x, crop.y, crop.w, crop.h); ox.lineWidth = lw / 2; ox.beginPath();
      for (let i = 1; i < 3; i++) { ox.moveTo(crop.x + crop.w * i / 3, crop.y); ox.lineTo(crop.x + crop.w * i / 3, crop.y + crop.h); ox.moveTo(crop.x, crop.y + crop.h * i / 3); ox.lineTo(crop.x + crop.w, crop.y + crop.h * i / 3); } ox.stroke();
      ox.fillStyle = '#fff'; for (const [hx, hy] of cropHandles()) ox.fillRect(hx - hs / 2, hy - hs / 2, hs, hs); ox.restore();
    }
  }
  const antsTm = setInterval(() => { if (!document.body.contains(cv)) return clearInterval(antsTm); if (sel) { antsT ^= 1; drawOv(); } }, 380);
  const cropHandles = () => crop ? [[crop.x, crop.y], [crop.x + crop.w / 2, crop.y], [crop.x + crop.w, crop.y], [crop.x + crop.w, crop.y + crop.h / 2], [crop.x + crop.w, crop.y + crop.h], [crop.x + crop.w / 2, crop.y + crop.h], [crop.x, crop.y + crop.h], [crop.x, crop.y + crop.h / 2]] : [];

  /* ================= éléments d'interface déclarés tôt ================= */
  const zl = el('span', { className: 'kd-zl', textContent: '100 %' }), infoEl = el('span', { className: 'kd-info mut' }), posEl = el('span', { className: 'kd-pos mut' });
  let busy = false, root = null;   // busy : un réglage (aperçu en direct) est ouvert
  function updInfo() { infoEl.textContent = W + ' × ' + H + ' px' + (sel ? ' · ' + tr('sélection') + ' ' + sel.bb.w + ' × ' + sel.bb.h : ''); }
  const alive = () => document.body.contains(cv);

  /* ================= outils communs ================= */
  const selCv = () => {   // la sélection sous forme d'image (l'opacité = le masque), pour limiter un dessin à la sélection
    if (!sel) return null;
    if (!sel.cv) { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), id = x.createImageData(W, H), a = sel.a; for (let i = 0; i < a.length; i++) id.data[i * 4 + 3] = a[i]; x.putImageData(id, 0, 0); sel.cv = c; }
    return sel.cv;
  };
  let tmpC = null;
  const tmp = () => { if (!tmpC || tmpC.width !== W || tmpC.height !== H) { tmpC = document.createElement('canvas'); tmpC.width = W; tmpC.height = H; } return tmpC; };
  function putMasked(drawFn, op, mode, R) {   // dessine sur un calque temporaire, limite à la sélection, puis dépose sur le calque actif
    R = clampR(R || FULL()); if (!R) return;
    const t = tmp(), tx = t.getContext('2d');
    tx.save(); tx.globalCompositeOperation = 'source-over'; tx.globalAlpha = 1; tx.clearRect(0, 0, W, H); drawFn(tx); tx.restore();
    if (sel) { tx.globalCompositeOperation = 'destination-in'; tx.drawImage(selCv(), 0, 0); tx.globalCompositeOperation = 'source-over'; }
    const l = lay(); l.x.save(); l.x.globalAlpha = op / 100; l.x.globalCompositeOperation = mode || 'source-over'; l.x.drawImage(t, 0, 0); l.x.restore(); render(R);
  }
  const canPaint = () => { if (!lay().vis) { toast('Ce calque est masqué : affichez-le (œil) pour y travailler.', 4000); return false; } return true; };
  const pt = e => { const r = ov.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height, p: e.pointerType === 'pen' && e.pressure ? e.pressure : 1 }; };
  const setFg = c => { fg = c; if (fgIn) fgIn.value = c; if (fgSw) fgSw.style.background = c; };
  const setBg = c => { bgc = c; if (bgIn) bgIn.value = c; if (bgSw) bgSw.style.background = c; };
  let fgIn = null, bgIn = null, fgSw = null, bgSw = null;
  const pushRecent = () => { const i = recent.indexOf(fg); if (i >= 0) recent.splice(i, 1); recent.unshift(fg); recent.length = Math.min(recent.length, 10); recentUI(); };

  /* ---------- symétrie / mandala ---------- */
  function symPts(x, y) {
    const m = opt.sym, cx = W / 2, cy = H / 2; if (m === 'none') return [[x, y]];
    if (m === 'mx') return [[x, y], [W - x, y]]; if (m === 'my') return [[x, y], [x, H - y]]; if (m === 'mxy') return [[x, y], [W - x, y], [x, H - y], [W - x, H - y]];
    const n = +m.slice(1), out = [], dx = x - cx, dy = y - cy;
    for (let k = 0; k < n; k++) { const a = k * 2 * Math.PI / n, c = Math.cos(a), s = Math.sin(a), rx = dx * c - dy * s, ry = dx * s + dy * c; out.push([cx + rx, cy + ry]); if (m[0] === 'k') out.push([cx - rx, cy + ry]); }
    return out;
  }

  /* ================= pinceaux : empreintes et tampon de trait ================= */
  const sbC = document.createElement('canvas'), bcC = document.createElement('canvas'), snapC = document.createElement('canvas'), dabC = {};
  let sbx = null, bcx = null, st = null, lastEnd = null, cloneOff = null;
  function dabStamp(size, hard, color, kind) {
    size = Math.max(1, Math.round(size)); const key = kind + size + '|' + hard + '|' + color; if (dabC[key]) return dabC[key];
    const d = size + 2, c = document.createElement('canvas'); c.width = c.height = d; const x = c.getContext('2d'), m = d / 2, rr = size / 2;
    if (kind === 'm') { x.translate(m, m); x.rotate(-Math.PI / 4); x.scale(1, .32); x.fillStyle = color; x.beginPath(); x.arc(0, 0, rr, 0, 7); x.fill(); }
    else if (hard >= 99) { x.fillStyle = color; x.beginPath(); x.arc(m, m, rr, 0, 7); x.fill(); }
    else { const g = x.createRadialGradient(m, m, 0, m, m, rr), [r, gg, b] = kdHex(color); for (let i = 0; i <= 10; i++) { const t = i / 10; g.addColorStop(t, `rgba(${r},${gg},${b},${kdFall(t, hard).toFixed(3)})`); } x.fillStyle = g; x.fillRect(0, 0, d, d); }
    if (Object.keys(dabC).length > 80) for (const k in dabC) delete dabC[k];
    return dabC[key] = c;
  }
  const cloneT = document.createElement('canvas');
  function cloneDab(qx, qy, size) {
    const sp = dabStamp(size, S().hard, '#000', 'r'), d = sp.width, r = d / 2; if (cloneT.width !== d) { cloneT.width = cloneT.height = d; }
    const cx = cloneT.getContext('2d'); cx.globalCompositeOperation = 'source-over'; cx.clearRect(0, 0, d, d);
    cx.drawImage(snapC, qx + st.off.dx - r, qy + st.off.dy - r, d, d, 0, 0, d, d);
    cx.globalCompositeOperation = 'destination-in'; cx.drawImage(sp, 0, 0);
    sbx.globalAlpha = 1; sbx.drawImage(cloneT, qx - r, qy - r);
  }
  function dabAt(x, y, pr) {
    const s = S(), size = Math.max(1, s.size * (pr < 1 ? .3 + .7 * pr : 1)), erase = tool === 'eraser', col = erase ? '#000' : fg;
    for (const [qx, qy] of symPts(x, y)) {
      if (tool === 'clone') cloneDab(qx, qy, size);
      else { const sp = dabStamp(size, tool === 'pencil' ? 100 : s.hard, col, tool === 'marker' ? 'm' : 'r'), d = sp.width; sbx.globalAlpha = (tool === 'pencil' || tool === 'marker' ? 100 : s.flow) / 100; sbx.drawImage(sp, qx - d / 2, qy - d / 2); }
      st.R = unionR(st.R, { x: qx - size / 2 - 2, y: qy - size / 2 - 2, w: size + 4, h: size + 4 });
    }
  }
  function compose(R) {   // calque = état d'avant le trait + tampon de trait (limité à la sélection, avec l'opacité choisie)
    R = clampR(R); if (!R) return; const l = lay(), x = l.x, erase = tool === 'eraser', args = [R.x, R.y, R.w, R.h, R.x, R.y, R.w, R.h];
    x.save(); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.clearRect(R.x, R.y, R.w, R.h); x.drawImage(bcC, ...args);
    let src = sbC;
    if (sel) { const t = tmp(), tx = t.getContext('2d'); tx.save(); tx.globalAlpha = 1; tx.globalCompositeOperation = 'source-over'; tx.clearRect(R.x, R.y, R.w, R.h); tx.drawImage(sbC, ...args); tx.globalCompositeOperation = 'destination-in'; tx.drawImage(selCv(), ...args); tx.restore(); src = t; }
    x.globalAlpha = S().op / 100; x.globalCompositeOperation = erase ? 'destination-out' : 'source-over'; x.drawImage(src, ...args); x.restore(); render(R);
  }
  const stepOf = size => Math.max(1, size * (tool === 'airbrush' ? .08 : tool === 'pencil' ? .15 : tool === 'smudge' ? .1 : KD_PAINT.has(tool) || tool === 'clone' ? .12 : .16));
  function strokeTo(p, doDab) {
    const a = st.last, dx = p.x - a.x, dy = p.y - a.y, dist = Math.hypot(dx, dy), step = stepOf(S().size); let d = st.carry, walked = 0;
    while (d + (dist - walked) >= step) { walked += step - d; d = 0; const t = dist ? walked / dist : 0; doDab(a.x + dx * t, a.y + dy * t, a.p + (p.p - a.p) * t, a); }
    st.carry = d + (dist - walked); st.last = p;
  }

  /* ---------- outils à tampon : pinceau, crayon, marqueur, aérographe, gomme, tampon de duplication ---------- */
  function paintDown(p, e) {
    if (!canPaint()) return;
    if (tool === 'clone') {
      if (e.altKey || cloneSrc === 'pick') { cloneSrc = { x: p.x, y: p.y }; cloneOff = null; toast('Source choisie : peignez maintenant ailleurs.', 2500); cloneBtnUpd(); return; }
      if (!cloneSrc) return toast('Alt + clic (ou le bouton « Choisir la source ») pour désigner la zone à copier.', 5000);
    }
    const l = lay(); pxHist(l);
    for (const c of [sbC, bcC]) if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    sbx = sbC.getContext('2d'); bcx = bcC.getContext('2d'); sbx.globalCompositeOperation = 'source-over'; sbx.globalAlpha = 1; sbx.clearRect(0, 0, W, H); bcx.globalCompositeOperation = 'source-over'; bcx.globalAlpha = 1; bcx.clearRect(0, 0, W, H); bcx.drawImage(l.c, 0, 0);
    st = { kind: 'paint', last: p, carry: 0, sm: p, R: null };
    if (tool === 'clone') {
      if (snapC.width !== W || snapC.height !== H) { snapC.width = W; snapC.height = H; } const sx = snapC.getContext('2d'); sx.globalCompositeOperation = 'source-over'; sx.clearRect(0, 0, W, H); sx.drawImage(opt.all ? cv : l.c, 0, 0);
      if (!cloneOff) cloneOff = { dx: cloneSrc.x - p.x, dy: cloneSrc.y - p.y }; st.off = cloneOff;
    }
    if (e.shiftKey && lastEnd && tool !== 'clone') { st.last = lastEnd; strokeTo(p, dabAt); } else dabAt(p.x, p.y, p.p);
    compose(st.R);
  }
  function paintMove(p) {
    const k = 1 - Math.min(.92, opt.smooth / 100 * .92); st.sm = { x: st.sm.x + (p.x - st.sm.x) * k, y: st.sm.y + (p.y - st.sm.y) * k, p: p.p };
    strokeTo(st.sm, dabAt); compose(st.R);
  }
  function paintUp(p) { strokeTo(p, dabAt); compose(st.R); lastEnd = p; if (tool !== 'eraser' && tool !== 'clone') pushRecent(); }

  /* ---------- outils directs : doigt, flou, netteté, éclaircir, assombrir, éponge, mosaïque, yeux rouges ---------- */
  function directDab(x, y, prevPt) {
    const s = S(), size = Math.max(2, Math.round(s.size)), r = size / 2, str = s.op / 100, sa = sel ? sel.a : null;
    let R = clampR({ x: x - r, y: y - r, w: size, h: size }); if (!R) return;
    if (tool === 'mosaic') { const b = Math.max(3, Math.round(size / 7)), x0 = Math.floor(R.x / b) * b, y0 = Math.floor(R.y / b) * b; R = clampR({ x: x0, y: y0, w: Math.ceil((R.x + R.w - x0) / b) * b, h: Math.ceil((R.y + R.h - y0) / b) * b }); if (!R) return; }
    const l = lay(), id = l.x.getImageData(R.x, R.y, R.w, R.h), d = id.data, w = R.w, h = R.h;
    const wt = (i, j) => { const dd = Math.hypot(R.x + i + .5 - x, R.y + j + .5 - y) / r; let f = kdFall(dd, tool === 'mosaic' || tool === 'redeye' ? Math.max(s.hard, 70) : s.hard); if (f > 0 && sa) f *= sa[(R.y + j) * W + R.x + i] / 255; return f; };
    if (tool === 'blur' || tool === 'sharpen') {
      const bl = new Uint8ClampedArray(d.length); kBox(d, bl, w, h, Math.max(1, Math.round(size / (tool === 'blur' ? 16 : 40))));
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const f = wt(i, j) * str; if (f <= 0) continue; const k = (j * w + i) * 4; for (let c = 0; c < (tool === 'blur' ? 4 : 3); c++) d[k + c] = tool === 'blur' ? d[k + c] + (bl[k + c] - d[k + c]) * Math.min(1, f * .9) : kc(d[k + c] + (d[k + c] - bl[k + c]) * f * 2); }
    } else if (tool === 'dodge' || tool === 'burn') {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const f = wt(i, j) * str * .2; if (f <= 0) continue; const k = (j * w + i) * 4; for (let c = 0; c < 3; c++) d[k + c] = tool === 'dodge' ? d[k + c] + (255 - d[k + c]) * f : d[k + c] * (1 - f); }
    } else if (tool === 'sponge') {
      const sg = opt.spongeMode === 'sat' ? 1 : -1;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const f = wt(i, j) * str * .3; if (f <= 0) continue; const k = (j * w + i) * 4, g = klum(d[k], d[k + 1], d[k + 2]), q = 1 + sg * f; for (let c = 0; c < 3; c++) d[k + c] = kc(g + (d[k + c] - g) * q); }
    } else if (tool === 'mosaic') {
      const b = Math.max(3, Math.round(size / 7)), src = new Uint8ClampedArray(d);
      for (let by = 0; by < h; by += b) for (let bx = 0; bx < w; bx += b) {
        let rr = 0, gg = 0, bb = 0, aa = 0, n = 0; const ex = Math.min(w, bx + b), ey = Math.min(h, by + b);
        for (let j = by; j < ey; j++) for (let i = bx; i < ex; i++) { const k = (j * w + i) * 4; rr += src[k]; gg += src[k + 1]; bb += src[k + 2]; aa += src[k + 3]; n++; }
        rr /= n; gg /= n; bb /= n; aa /= n;
        for (let j = by; j < ey; j++) for (let i = bx; i < ex; i++) { const f = wt(i, j) >= .5 ? str : 0; if (!f) continue; const k = (j * w + i) * 4; d[k] += (rr - d[k]) * f; d[k + 1] += (gg - d[k + 1]) * f; d[k + 2] += (bb - d[k + 2]) * f; d[k + 3] += (aa - d[k + 3]) * f; }
      }
    } else if (tool === 'redeye') {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const f = wt(i, j); if (f <= 0) continue; const k = (j * w + i) * 4, rr = d[k], gg = d[k + 1], bb = d[k + 2]; if (rr > 60 && rr > gg * 1.5 && rr > bb * 1.5) d[k] += ((gg + bb) / 2 * .85 - rr) * Math.min(1, f * 1.3); }
    } else if (tool === 'smudge') {
      const mx = prevPt ? (x - prevPt.x) * 1.6 : 0, my = prevPt ? (y - prevPt.y) * 1.6 : 0, src = new Uint8ClampedArray(d), tmpP = new Uint8ClampedArray(4);
      if (mx || my) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const f = wt(i, j) * Math.min(1, str * 1.2); if (f <= 0) continue; const k = (j * w + i) * 4; kSample(src, w, h, i - mx, j - my, tmpP, 0); for (let c = 0; c < 4; c++) d[k + c] += (tmpP[c] - d[k + c]) * f; }
    }
    l.x.putImageData(id, R.x, R.y); st.R = unionR(st.R, R); render(R);
  }
  function directDown(p) {
    if (!canPaint()) return; pxHist(); st = { kind: 'direct', last: p, carry: 0, R: null, pp: p };
    directDab(p.x, p.y, null);
  }
  function directMove(p) {
    strokeTo(p, (x, y) => { directDab(x, y, st.pp); st.pp = { x, y }; });
  }

  /* ---------- correcteur : on peint sur la tache, elle est effacée au relâchement ---------- */
  function inpaint(id, mask, w, h) {
    const d = id.data, known = new Uint8Array(w * h), q = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) known[i] = mask[i] ? 0 : 1;
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, .7], [-1, 1, .7], [1, -1, .7], [-1, -1, .7]];
    let cur = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (known[i]) continue; for (const [dx, dy] of nb) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && known[yy * w + xx]) { cur.push(i); q[i] = 1; break; } } }
    const all = [];
    for (let guard = 0; cur.length && guard < 4000; guard++) {
      const vals = new Float32Array(cur.length * 4);
      cur.forEach((i, n) => { const x = i % w, y = (i / w) | 0; let r = 0, g = 0, b = 0, a = 0, t = 0; for (const [dx, dy, wg] of nb) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (!known[j]) continue; r += d[j * 4] * wg; g += d[j * 4 + 1] * wg; b += d[j * 4 + 2] * wg; a += d[j * 4 + 3] * wg; t += wg; } vals[n * 4] = r / t; vals[n * 4 + 1] = g / t; vals[n * 4 + 2] = b / t; vals[n * 4 + 3] = a / t; });
      const nxt = [];
      cur.forEach((i, n) => { d[i * 4] = vals[n * 4]; d[i * 4 + 1] = vals[n * 4 + 1]; d[i * 4 + 2] = vals[n * 4 + 2]; d[i * 4 + 3] = vals[n * 4 + 3]; known[i] = 1; all.push(i); });
      for (const i of cur) { const x = i % w, y = (i / w) | 0; for (const [dx, dy] of nb) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (!known[j] && !q[j]) { q[j] = 1; nxt.push(j); } } }
      cur = nxt;
    }
    for (let it = 0; it < 6; it++) {   // adoucit la zone remplie puis y remet un léger grain pour qu'elle ne paraisse pas lisse
      const cp = new Uint8ClampedArray(d);
      for (const i of all) { const x = i % w, y = (i / w) | 0; let r = 0, g = 0, b = 0, t = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = (yy * w + xx) * 4; r += cp[j]; g += cp[j + 1]; b += cp[j + 2]; t++; } d[i * 4] = r / t; d[i * 4 + 1] = g / t; d[i * 4 + 2] = b / t; }
    }
    for (const i of all) { const n = (Math.random() - .5) * 5; d[i * 4] = kc(d[i * 4] + n); d[i * 4 + 1] = kc(d[i * 4 + 1] + n); d[i * 4 + 2] = kc(d[i * 4 + 2] + n); }
  }
  function healDown(p) {
    if (!canPaint()) return; st = { kind: 'heal', pts: [p], size: Math.max(4, S().size) };
    prev = o => { o.lineCap = o.lineJoin = 'round'; o.lineWidth = st.size; o.strokeStyle = 'rgba(255,70,70,.5)'; o.beginPath(); o.moveTo(st.pts[0].x, st.pts[0].y); for (const q of st.pts) o.lineTo(q.x, q.y); o.lineTo(st.pts[st.pts.length - 1].x + .02, st.pts[st.pts.length - 1].y); o.stroke(); }; drawOv();
  }
  function healUp() {
    const pts = st.pts, sz = st.size; prev = null; drawOv();
    let x0 = W, y0 = H, x1 = 0, y1 = 0; for (const q of pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    const R = clampR({ x: x0 - sz / 2 - 3, y: y0 - sz / 2 - 3, w: x1 - x0 + sz + 6, h: y1 - y0 + sz + 6 }); if (!R) return;
    if (R.w * R.h > 1.5e6) return toast('Zone trop grande : corrigez par petites touches.', 4000);
    const mc = document.createElement('canvas'); mc.width = R.w; mc.height = R.h; const mx = mc.getContext('2d'); mx.lineCap = mx.lineJoin = 'round'; mx.lineWidth = sz; mx.strokeStyle = '#fff'; mx.beginPath(); mx.moveTo(pts[0].x - R.x, pts[0].y - R.y); for (const q of pts) mx.lineTo(q.x - R.x, q.y - R.y); mx.lineTo(pts[pts.length - 1].x - R.x + .02, pts[pts.length - 1].y - R.y); mx.stroke();
    const md = mx.getImageData(0, 0, R.w, R.h).data, mask = new Uint8Array(R.w * R.h); let n = 0; for (let i = 0; i < mask.length; i++) if (md[i * 4 + 3] > 110) { mask[i] = 1; n++; }
    if (!n || n === mask.length) return toast('Peignez sur la tache à effacer (avec un pinceau un peu plus grand qu’elle).', 3500);
    const l = lay(), base = pxHist(l), id = l.x.getImageData(R.x, R.y, R.w, R.h), orig2 = new Uint8ClampedArray(id.data);
    inpaint(id, mask, R.w, R.h);
    if (sel) for (let j = 0; j < R.h; j++) for (let i = 0; i < R.w; i++) { const m = sel.a[(R.y + j) * W + R.x + i] / 255; if (m < 1) { const k = (j * R.w + i) * 4; for (let c = 0; c < 4; c++) id.data[k + c] = orig2[k + c] + (id.data[k + c] - orig2[k + c]) * m; } }
    l.x.putImageData(id, R.x, R.y); render(R); void base;
  }

  /* ---------- pot de peinture / baguette magique ---------- */
  function floodMask(img, sx, sy, tol, contig) {
    const w = img.width, h = img.height, d = img.data, t = tol * 2.55, m = new Uint8ClampedArray(w * h), i0 = (sy * w + sx) * 4, r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3];
    const ok = i => { const k = i * 4; return Math.abs(d[k] - r0) <= t && Math.abs(d[k + 1] - g0) <= t && Math.abs(d[k + 2] - b0) <= t && Math.abs(d[k + 3] - a0) <= t; };
    if (!contig) { for (let i = 0; i < w * h; i++) if (ok(i)) m[i] = 255; return m; }
    const stack = [sx, sy];
    while (stack.length) {
      const y = stack.pop(), x = stack.pop(); if (m[y * w + x] || !ok(y * w + x)) continue;
      let x1 = x, x2 = x; while (x1 > 0 && !m[y * w + x1 - 1] && ok(y * w + x1 - 1)) x1--; while (x2 < w - 1 && !m[y * w + x2 + 1] && ok(y * w + x2 + 1)) x2++;
      for (let xx = x1; xx <= x2; xx++) m[y * w + xx] = 255;
      for (const yy of [y - 1, y + 1]) { if (yy < 0 || yy >= h) continue; let run = false; for (let xx = x1; xx <= x2; xx++) { const j = yy * w + xx; if (!m[j] && ok(j)) { if (!run) { stack.push(xx, yy); run = true; } } else run = false; } }
    }
    return m;
  }
  const dilate1 = (m, w, h) => { const o = new Uint8ClampedArray(m); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (m[i]) continue; if ((x > 0 && m[i - 1]) || (x < w - 1 && m[i + 1]) || (y > 0 && m[i - w]) || (y < h - 1 && m[i + w])) o[i] = 255; } return o; };
  const srcImg = () => opt.all ? vx.getImageData(0, 0, W, H) : getImg();
  function fillAt(p) {
    if (!canPaint()) return; const x = Math.floor(p.x), y = Math.floor(p.y); if (x < 0 || y < 0 || x >= W || y >= H) return;
    const l = lay(); let m = floodMask(srcImg(), x, y, opt.tol, opt.contig); if (opt.contig && opt.tol < 60) m = dilate1(m, W, H);
    pxHist(l); const id = l.x.getImageData(0, 0, W, H), d = id.data, [r, g, b] = kdHex(fg), op = S().op / 100, sa = sel ? sel.a : null;
    for (let i = 0; i < m.length; i++) { if (!m[i]) continue; const a = op * (sa ? sa[i] / 255 : 1), k = i * 4; if (a <= 0) continue; d[k] += (r - d[k]) * a; d[k + 1] += (g - d[k + 1]) * a; d[k + 2] += (b - d[k + 2]) * a; d[k + 3] += (255 - d[k + 3]) * a; }
    l.x.putImageData(id, 0, 0); render(); pushRecent();
  }
  function wandAt(p) {
    const x = Math.floor(p.x), y = Math.floor(p.y); if (x < 0 || y < 0 || x >= W || y >= H) return;
    let m = floodMask(srcImg(), x, y, opt.tol, opt.contig); if ((opt.feather | 0) > 0) m = featherMask(m, opt.feather); selSet(m, opt.selMode);
  }

  /* ---------- dégradé ---------- */
  const GRADS = { fb: null, ft: null, rain: ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6'], sunset: ['#1e1b4b', '#7c3aed', '#ec4899', '#f97316', '#fde047'], ocean: ['#0c4a6e', '#0ea5e9', '#67e8f9', '#ecfeff'], fire: ['#000000', '#7f1d1d', '#ef4444', '#f97316', '#fde047', '#ffffff'] };
  function gradFill(tx, a, b) {
    let g; const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    if (opt.grad === 'radial') g = tx.createRadialGradient(a.x, a.y, 0, a.x, a.y, len);
    else if (opt.grad === 'conic' && tx.createConicGradient) g = tx.createConicGradient(Math.atan2(dy, dx), a.x, a.y);
    else if (opt.grad === 'reflect') g = tx.createLinearGradient(a.x - dx, a.y - dy, b.x, b.y);
    else g = tx.createLinearGradient(a.x, a.y, b.x, b.y);
    const set = opt.gradC, list = GRADS[set];
    let stops; if (list) stops = list.map((c, i) => [i / (list.length - 1), c]); else if (set === 'ft') { const [r, gg, bb] = kdHex(fg); stops = [[0, fg], [1, `rgba(${r},${gg},${bb},0)`]]; } else stops = [[0, fg], [1, bgc]];
    if (opt.grad === 'reflect') stops = [...stops.map(([t, c]) => [t / 2, c]), ...stops.slice(0, -1).reverse().map(([t, c]) => [1 - t / 2, c])].sort((p, q) => p[0] - q[0]);
    for (const [t, c] of stops) g.addColorStop(Math.max(0, Math.min(1, t)), c);
    tx.fillStyle = g; tx.fillRect(0, 0, W, H);
  }

  /* ---------- formes et lignes ---------- */
  function shapePath(tx, a, b, shift) {
    let x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y; const sh = opt.shape;
    if (shift) { if (sh === 'line' || sh === 'arrow') { const ang = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 4)) * Math.PI / 4, ln = Math.hypot(x1 - x0, y1 - y0); x1 = x0 + Math.cos(ang) * ln; y1 = y0 + Math.sin(ang) * ln; } else { const s = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x1 = x0 + Math.sign(x1 - x0 || 1) * s; y1 = y0 + Math.sign(y1 - y0 || 1) * s; } }
    const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), cx = x + w / 2, cy = y + h / 2; tx.beginPath();
    if (sh === 'rect') tx.rect(x, y, w, h);
    else if (sh === 'round') { if (tx.roundRect) tx.roundRect(x, y, w, h, Math.min(w, h) * .22); else tx.rect(x, y, w, h); }
    else if (sh === 'ell') tx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    else if (sh === 'line') { tx.moveTo(x0, y0); tx.lineTo(x1, y1); }
    else if (sh === 'arrow') { const ang = Math.atan2(y1 - y0, x1 - x0), hl = Math.max(14, S().size * 4); tx.moveTo(x0, y0); tx.lineTo(x1, y1); tx.moveTo(x1 - hl * Math.cos(ang - .45), y1 - hl * Math.sin(ang - .45)); tx.lineTo(x1, y1); tx.lineTo(x1 - hl * Math.cos(ang + .45), y1 - hl * Math.sin(ang + .45)); }
    else if (sh === 'tri') { tx.moveTo(cx, y); tx.lineTo(x + w, y + h); tx.lineTo(x, y + h); tx.closePath(); }
    else if (sh === 'star') { for (let i = 0; i < 10; i++) { const r = i % 2 ? .45 : 1, an = -Math.PI / 2 + i * Math.PI / 5, px = cx + Math.cos(an) * r * w / 2, py = cy + Math.sin(an) * r * h / 2; i ? tx.lineTo(px, py) : tx.moveTo(px, py); } tx.closePath(); }
    else if (sh === 'hex') { for (let i = 0; i < 6; i++) { const an = i * Math.PI / 3, px = cx + Math.cos(an) * w / 2, py = cy + Math.sin(an) * h / 2; i ? tx.lineTo(px, py) : tx.moveTo(px, py); } tx.closePath(); }
    else if (sh === 'heart') { tx.moveTo(cx, y + h); tx.bezierCurveTo(x - w * .15, y + h * .62, x + w * .05, y - h * .12, cx, y + h * .28); tx.bezierCurveTo(x + w * .95, y - h * .12, x + w * 1.15, y + h * .62, cx, y + h); tx.closePath(); }
  }
  function shapeDraw(tx, a, b, shift) {
    shapePath(tx, a, b, shift); const line = opt.shape === 'line' || opt.shape === 'arrow';
    if (!line && opt.fm !== 'stroke') { tx.fillStyle = opt.fm === 'both' ? bgc : fg; tx.fill(); }
    if (line || opt.fm !== 'fill') { tx.lineWidth = Math.max(1, S().size); tx.lineJoin = tx.lineCap = 'round'; tx.strokeStyle = fg; tx.stroke(); }
  }

  /* ---------- texte et autocollants ---------- */
  function drawText(tx, str, x, y) {
    tx.font = `${opt.italic ? 'italic ' : ''}${opt.bold ? '700 ' : '400 '}${opt.fsize}px ${opt.font}`; tx.textBaseline = 'top'; tx.textAlign = 'left'; tx.fillStyle = fg; const lh = opt.fsize * 1.2;
    str.split('\n').forEach((ln, i) => { if (opt.outline) { tx.lineWidth = opt.outline * 2; tx.lineJoin = 'round'; tx.strokeStyle = bgc; tx.strokeText(ln, x, y + i * lh); } tx.fillText(ln, x, y + i * lh); });
  }
  async function textAt(p) {
    const r = await dialog('Texte', [{ k: 't', type: 'textarea', label: 'Texte à écrire (Entrée = nouvelle ligne)', req: true, max: 400 }], 'Écrire'); if (!r || !r.t.trim()) return;
    const lines = r.t.split('\n'), tx0 = document.createElement('canvas').getContext('2d'); tx0.font = `${opt.italic ? 'italic ' : ''}${opt.bold ? '700 ' : '400 '}${opt.fsize}px ${opt.font}`;
    const w = Math.max(...lines.map(s => tx0.measureText(s).width)) + opt.outline * 2 + 8, h = lines.length * opt.fsize * 1.2 + opt.outline * 2 + 8, R = { x: p.x - 4, y: p.y - 4, w, h };
    if (opt.newL) {
      if (L.length >= KD_MAXL) return toast(tr('Trop de calques ({0} maximum).').replace('{0}', KD_MAXL));
      const l = mkLayer(tr('Texte : {0}').replace('{0}', r.t.trim().slice(0, 14))); L.splice(cur + 1, 0, l); cur++; pushHist({ k: 'addL', layer: l }); drawText(l.x, r.t, p.x, p.y); layersUI(); render(R);
    } else { if (!canPaint()) return; pxHist(); putMasked(tx => drawText(tx, r.t, p.x, p.y), S().op, null, R); }
    pushRecent();
  }
  function stickerAt(p) {
    if (!canPaint()) return; const size = Math.max(10, S().size * 2), R = { x: p.x - size, y: p.y - size, w: size * 2, h: size * 2 }; pxHist();
    putMasked(tx => { tx.font = size + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; tx.textAlign = 'center'; tx.textBaseline = 'middle'; tx.fillText(opt.sticker, p.x, p.y); }, S().op, null, R);
  }
  function pipetteAt(p, toBg) {
    const x = Math.floor(p.x), y = Math.floor(p.y); if (x < 0 || y < 0 || x >= W || y >= H) return;
    const d = vx.getImageData(x, y, 1, 1).data; if (d[3] < 8) return toast('Zone transparente : rien à prélever.', 2000); (toBg ? setBg : setFg)(kdCol(d[0], d[1], d[2]));
  }

  /* ================= déplacement, recadrage, sélections ================= */
  const rectOf = (a, b, shift) => { let w = b.x - a.x, h = b.y - a.y; if (shift) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; } return { x: Math.min(a.x, a.x + w), y: Math.min(a.y, a.y + h), w: Math.abs(w), h: Math.abs(h) }; };
  function moveDown(p) {
    if (!canPaint()) return null; const l = lay(); pxHist(l);
    const bc = document.createElement('canvas'); bc.width = W; bc.height = H; bc.getContext('2d').drawImage(l.c, 0, 0); let fl = null;
    if (sel) { fl = document.createElement('canvas'); fl.width = W; fl.height = H; const fx = fl.getContext('2d'); fx.drawImage(l.c, 0, 0); fx.globalCompositeOperation = 'destination-in'; fx.drawImage(selCv(), 0, 0); const hx = bc.getContext('2d'); hx.globalCompositeOperation = 'destination-out'; hx.drawImage(selCv(), 0, 0); }
    return { k: 'move', a: p, bc, fl, ox: 0, oy: 0 };
  }
  function moveTo(g, p, shift) {
    let dx = Math.round(p.x - g.a.x), dy = Math.round(p.y - g.a.y); if (shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    g.ox = dx; g.oy = dy; const x = lay().x; x.save(); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, W, H);
    if (g.fl) { x.drawImage(g.bc, 0, 0); x.drawImage(g.fl, dx, dy); } else x.drawImage(g.bc, dx, dy); x.restore(); render();
  }
  function moveUp(g) {
    if (!g.ox && !g.oy) { hist.pop(); syncU(); return; }
    if (sel) { const n = new Uint8ClampedArray(W * H), a = sel.a; for (let y = 0; y < H; y++) { const ny = y + g.oy; if (ny < 0 || ny >= H) continue; for (let x = 0; x < W; x++) { const nx = x + g.ox; if (nx >= 0 && nx < W && a[y * W + x]) n[ny * W + nx] = a[y * W + x]; } } selSet(n); }
  }
  const ratioVal = () => ({ free: 0, '1:1': 1, '4:3': 4 / 3, '3:2': 3 / 2, '16:9': 16 / 9, '9:16': 9 / 16, '3:4': 3 / 4, '2:3': 2 / 3 }[opt.ratio] || 0);
  function cropDown(p) {
    const hs = 12 / zoom;
    if (crop) { const hh = cropHandles(); for (let i = 0; i < 8; i++) if (Math.abs(p.x - hh[i][0]) <= hs && Math.abs(p.y - hh[i][1]) <= hs) return { k: 'crop', h: i, a: p, r0: { ...crop } }; if (p.x > crop.x && p.x < crop.x + crop.w && p.y > crop.y && p.y < crop.y + crop.h) return { k: 'crop', h: 'move', a: p, r0: { ...crop } }; }
    crop = { x: p.x, y: p.y, w: 1, h: 1 }; return { k: 'crop', h: 'new', a: p, r0: { ...crop } };
  }
  function cropMove(g, p) {
    const r0 = g.r0, dx = p.x - g.a.x, dy = p.y - g.a.y, rt = ratioVal(); let x0 = r0.x, y0 = r0.y, x1 = r0.x + r0.w, y1 = r0.y + r0.h;
    if (g.h === 'move') { x0 += dx; x1 += dx; y0 += dy; y1 += dy; const sx = x0 < 0 ? -x0 : x1 > W ? W - x1 : 0, sy = y0 < 0 ? -y0 : y1 > H ? H - y1 : 0; x0 += sx; x1 += sx; y0 += sy; y1 += sy; }
    else if (g.h === 'new') { x0 = g.a.x; y0 = g.a.y; x1 = Math.max(0, Math.min(W, p.x)); y1 = Math.max(0, Math.min(H, p.y)); if (rt) y1 = y0 + Math.sign(y1 - y0 || 1) * Math.abs(x1 - x0) / rt; }
    else { const hi = g.h; if ([0, 6, 7].includes(hi)) x0 += dx; if ([2, 3, 4].includes(hi)) x1 += dx; if ([0, 1, 2].includes(hi)) y0 += dy; if ([4, 5, 6].includes(hi)) y1 += dy;
      if (rt) { if (hi === 1 || hi === 5) x1 = x0 + (y1 - y0) * rt; else { const h = Math.abs(x1 - x0) / rt; if ([0, 1, 2].includes(hi)) y0 = y1 - h; else y1 = y0 + h; } } }
    const nx0 = Math.max(0, Math.min(x0, x1)), ny0 = Math.max(0, Math.min(y0, y1)), nx1 = Math.min(W, Math.max(x0, x1)), ny1 = Math.min(H, Math.max(y0, y1));
    crop = { x: nx0, y: ny0, w: Math.max(1, nx1 - nx0), h: Math.max(1, ny1 - ny0) }; drawOv(); updInfo(); infoEl.textContent += ' · ' + tr('recadrage') + ' ' + Math.round(crop.w) + ' × ' + Math.round(crop.h);
  }
  function docOp(nw, nh, fn) {   // applique une transformation à tous les calques (rotation, redimensionnement, recadrage…) ; annulable
    pushHist(snapDoc()); const ow = W, oh = H;
    for (const l of L) { const c = document.createElement('canvas'); c.width = nw; c.height = nh; const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; fn(l.c, x, ow, oh); l.c = c; l.x = x; }
    sel = null; selPaths = null; crop = null; orig = null; sizeDoc(nw, nh); render(); layersUI(); updInfo();
  }
  function cropApply() { if (!crop) return; const r = clampR(crop); if (!r || r.w < 4 || r.h < 4) return toast('Zone de recadrage trop petite.'); crop = null; docOp(r.w, r.h, (oc, x) => x.drawImage(oc, -r.x, -r.y)); fit(); }
  function selCommit(g, p, shift) {
    let m = null;
    if (g.t === 'lasso') { if (g.pts.length < 3) { if (opt.selMode === 'rep') selSet(null); return; } m = maskFrom(x => { x.beginPath(); g.pts.forEach((q, i) => i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y)); x.closePath(); x.fill(); }); }
    else { const r = rectOf(g.a, p, shift); if (r.w < 2 || r.h < 2) { if (opt.selMode === 'rep') selSet(null); return; } m = maskFrom(x => { x.beginPath(); if (g.t === 'selell') x.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, 7); else x.rect(r.x, r.y, r.w, r.h); x.fill(); }); }
    if ((opt.feather | 0) > 0) m = featherMask(m, opt.feather); selSet(m, opt.selMode);
  }
  const selAll = () => selSet(new Uint8ClampedArray(W * H).fill(255));
  const selInv = () => { if (!sel) return selAll(); const a = new Uint8ClampedArray(W * H); for (let i = 0; i < a.length; i++) a[i] = 255 - sel.a[i]; selSet(a); };
  function morph(a, n, grow) {
    let cu = a; for (let k = 0; k < n; k++) {
      const t = new Uint8ClampedArray(W * H), o = new Uint8ClampedArray(W * H), f = grow ? Math.max : Math.min;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; t[i] = f(cu[i], x > 0 ? cu[i - 1] : cu[i], x < W - 1 ? cu[i + 1] : cu[i]); }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; o[i] = f(t[i], y > 0 ? t[i - W] : t[i], y < H - 1 ? t[i + W] : t[i]); }
      cu = o;
    }
    return cu;
  }
  async function selAdjust(kind) {
    if (!sel) return toast('Faites d’abord une sélection.');
    const r = await dialog(kind === 'grow' ? 'Agrandir la sélection' : kind === 'shrink' ? 'Réduire la sélection' : 'Adoucir les bords', [{ k: 'n', type: 'number', label: 'Taille (pixels, 1 à 40)', value: '4', max: 2 }], 'Appliquer', { check: v => (+v.n < 1 || +v.n > 40) ? 'De 1 à 40 pixels.' : '' }); if (!r) return;
    const n = Math.round(+r.n), t = toast('Calcul…', 0); setTimeout(() => { try { selSet(kind === 'feather' ? featherMask(sel.a, n) : morph(sel.a, n, kind === 'grow')); } finally { t.close(); } }, 20);
  }
  function selCanvas() { const bb = sel ? sel.bb : FULL(), c = document.createElement('canvas'); c.width = bb.w; c.height = bb.h; const x = c.getContext('2d'); x.drawImage(lay().c, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h); if (sel) { x.globalCompositeOperation = 'destination-in'; x.drawImage(selCv(), bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h); } return { c, bb }; }
  let clipPos = null;
  function eraseSel() { if (!canPaint()) return; pxHist(); const l = lay(); if (sel) { l.x.save(); l.x.globalCompositeOperation = 'destination-out'; l.x.drawImage(selCv(), 0, 0); l.x.restore(); } else l.x.clearRect(0, 0, W, H); render(); }
  async function copySel(cut) {
    const { c, bb } = selCanvas(); clipC = c; clipPos = { x: bb.x, y: bb.y };
    try { const b = await new Promise(r => c.toBlob(r, 'image/png')); if (b && navigator.clipboard && window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); } catch { /* le presse-papiers du navigateur est facultatif */ }
    if (cut) eraseSel(); else toast('Copié.', 1500);
  }
  function fillSel(color, clear) {
    if (!canPaint()) return; pxHist(); if (clear) return eraseSel();
    putMasked(tx => { tx.fillStyle = color; tx.fillRect(0, 0, W, H); }, 100, null, sel ? sel.bb : null);
  }

  /* ================= calques ================= */
  const layBox = el('div', { className: 'kd-lays', role: 'listbox', 'aria-label': 'Calques' });
  const opIn = el('input', { type: 'range', min: 0, max: 100, value: 100, 'aria-label': 'Opacité du calque' }), opOut = el('span', { className: 'kd-v', textContent: '100 %' }), bmSel = el('select', { 'aria-label': 'Mode de fusion' });
  opts(bmSel, KD_BLEND);
  let propOld = null;
  const propBegin = () => { if (!propOld) { const l = lay(); propOld = { lid: l.id, v: { vis: l.vis, op: l.op, bm: l.bm, name: l.name } }; } };
  const propEnd = () => { if (propOld) { pushHist({ k: 'prop', lid: propOld.lid, v: propOld.v }); propOld = null; } };
  opIn.oninput = () => { propBegin(); lay().op = +opIn.value; opOut.textContent = opIn.value + ' %'; render(); }; opIn.onchange = propEnd;
  bmSel.onchange = () => { propBegin(); lay().bm = bmSel.value; propEnd(); render(); };
  function thumbs() {
    for (const l of L) { const t = l.th; if (!t || !t.isConnected) continue; const x = t.getContext('2d'); x.clearRect(0, 0, 44, 33); x.fillStyle = '#d4d4d8'; x.fillRect(0, 0, 44, 33); x.fillStyle = '#fafafa'; for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) if ((i + j) % 2) x.fillRect(i * 8, j * 8, 8, 8); const k = Math.min(44 / l.c.width, 33 / l.c.height), w = l.c.width * k, h = l.c.height * k; x.drawImage(l.c, (44 - w) / 2, (33 - h) / 2, w, h); }
  }
  async function renameLayer(i) {
    const l = L[i], r = await dialog('Renommer le calque', [{ k: 'n', label: 'Nom', value: l.name, max: 40, req: true }], 'OK'); if (!r) return;
    pushHist({ k: 'prop', lid: l.id, v: { vis: l.vis, op: l.op, bm: l.bm, name: l.name } }); l.name = r.n.trim().slice(0, 40); layersUI();
  }
  function layersUI() {
    layBox.replaceChildren(...L.map((l, i) => i).reverse().map(i => {
      const l = L[i], th = el('canvas', { className: 'kd-th', width: 44, height: 33 }); l.th = th;
      return el('div', { className: 'kd-lay' + (i === cur ? ' on' : ''), role: 'option', 'aria-selected': String(i === cur), tabIndex: 0, onclick: () => { cur = i; layersUI(); }, ondblclick: () => renameLayer(i), onkeydown: e => { if (e.key === 'Enter') { cur = i; layersUI(); } } },
        el('button', { type: 'button', className: 'kd-eye', title: l.vis ? 'Masquer ce calque' : 'Afficher ce calque', 'aria-label': tr(l.vis ? 'Masquer le calque {0}' : 'Afficher le calque {0}').replace('{0}', l.name), onclick: e => { e.stopPropagation(); pushHist({ k: 'prop', lid: l.id, v: { vis: l.vis, op: l.op, bm: l.bm, name: l.name } }); l.vis = !l.vis; layersUI(); render(); } }, ico(l.vis ? 'eye' : 'eyeoff', 16)),
        th, el('span', { className: 'kd-ln', textContent: l.name }));
    }));
    const l = lay(); if (l) { opIn.value = l.op; opOut.textContent = l.op + ' %'; bmSel.value = l.bm; } thumbs();
  }
  const room = () => { if (L.length >= KD_MAXL) { toast(tr('Trop de calques ({0} maximum).').replace('{0}', KD_MAXL)); return false; } return true; };
  function newLayer(name, afterFn) { if (!room()) return null; const l = mkLayer(name || tr('Calque {0}').replace('{0}', L.length + 1)); L.splice(cur + 1, 0, l); cur++; pushHist({ k: 'addL', layer: l }); if (afterFn) afterFn(l); layersUI(); render(); return l; }
  function dupLayer() { if (!room()) return; const s = lay(), l = mkLayer(tr('{0} (copie)').replace('{0}', s.name)); l.x.drawImage(s.c, 0, 0); l.op = s.op; l.bm = s.bm; l.vis = s.vis; L.splice(cur + 1, 0, l); cur++; pushHist({ k: 'addL', layer: l }); layersUI(); render(); }
  function delLayer() { if (L.length < 2) return toast('Il faut garder au moins un calque (utilisez « Effacer » pour le vider).', 3500); const l = lay(), idx = cur; L.splice(idx, 1); cur = Math.min(idx, L.length - 1); pushHist({ k: 'delL', idx, layer: l }); layersUI(); render(); }
  function moveLayer(dir) { const j = cur + dir; if (j < 0 || j >= L.length) return; const l = L.splice(cur, 1)[0]; L.splice(j, 0, l); pushHist({ k: 'order', from: cur, to: j }); cur = j; layersUI(); render(); }
  const paintInto = (x, l) => { x.save(); x.globalAlpha = l.op / 100; x.globalCompositeOperation = l.bm; x.drawImage(l.c, 0, 0); x.restore(); };
  function mergeDown() { if (cur < 1) return toast('Pas de calque en dessous.'); pushHist(snapDoc()); const up = L[cur], lo = L[cur - 1]; paintInto(lo.x, up); L.splice(cur, 1); cur--; layersUI(); render(); }
  function flatten() { if (L.length < 2) return toast('Il n’y a qu’un seul calque.'); pushHist(snapDoc()); const l = mkLayer('Arrière-plan'); for (const s of L) if (s.vis) paintInto(l.x, s); L.length = 0; L.push(l); cur = 0; layersUI(); render(); }
  function flipLayer(h) { if (!canPaint()) return; pxHist(); const l = lay(), t = tmp(), tx = t.getContext('2d'); tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, W, H); tx.drawImage(l.c, 0, 0); l.x.save(); l.x.clearRect(0, 0, W, H); if (h) { l.x.translate(W, 0); l.x.scale(-1, 1); } else { l.x.translate(0, H); l.x.scale(1, -1); } l.x.drawImage(t, 0, 0); l.x.restore(); render(); }
  async function transformLayer() {
    if (!canPaint()) return; const r = await dialog('Transformer le calque', [{ k: 's', type: 'number', label: 'Taille (%)', value: '100', max: 4 }, { k: 'a', type: 'number', label: 'Rotation (degrés, de −180 à 180)', value: '0', max: 4 }], 'Appliquer', { check: v => (+v.s < 5 || +v.s > 800) ? 'Taille : de 5 à 800 %.' : (+v.a < -180 || +v.a > 180 || isNaN(+v.a)) ? 'Rotation : de −180 à 180.' : '' }); if (!r) return;
    pxHist(); const l = lay(), t = tmp(), tx = t.getContext('2d'); tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, W, H); tx.drawImage(l.c, 0, 0);
    l.x.save(); l.x.clearRect(0, 0, W, H); l.x.imageSmoothingQuality = 'high'; l.x.translate(W / 2, H / 2); l.x.rotate(+r.a * Math.PI / 180); l.x.scale(+r.s / 100, +r.s / 100); l.x.drawImage(t, -W / 2, -H / 2); l.x.restore(); render();
  }
  function layerFromSel(cut) {
    if (!canPaint() || !room()) return; const { c, bb } = selCanvas(); const l = mkLayer(cut ? 'Découpe' : 'Copie'); l.x.drawImage(c, bb.x, bb.y);
    if (cut) { pxHist(); const s = lay(); if (sel) { s.x.save(); s.x.globalCompositeOperation = 'destination-out'; s.x.drawImage(selCv(), 0, 0); s.x.restore(); } }
    L.splice(cur + 1, 0, l); cur++; pushHist({ k: 'addL', layer: l }); layersUI(); render();
  }
  function addImageLayer(src, name, at) {
    if (!room()) return; let w = src.width, h = src.height; const k = Math.min(1, W / w, H / h); w = Math.round(w * k); h = Math.round(h * k);
    const l = mkLayer(name); l.x.drawImage(src, at && k === 1 ? at.x : Math.round((W - w) / 2), at && k === 1 ? at.y : Math.round((H - h) / 2), w, h);
    L.splice(cur + 1, 0, l); cur++; pushHist({ k: 'addL', layer: l }); setTool('move'); layersUI(); render(); toast('Image collée dans un nouveau calque : déplacez-la avec l’outil Déplacer.', 4000);
  }
  async function doPaste() {
    try { const items = await navigator.clipboard.read(); for (const it of items) { const ty = it.types.find(t => t.startsWith('image/')); if (ty) { const bm = await createImageBitmap(await it.getType(ty)); addImageLayer(bm, 'Collage'); return; } } } catch { /* accès refusé : on essaie le presse-papiers interne */ }
    if (clipC) addImageLayer(clipC, 'Collage', clipPos); else toast('Rien à coller : copiez d’abord une image (ou utilisez Ctrl+V).', 4000);
  }

  /* ================= réglages et filtres avec aperçu en direct ================= */
  function liveEdit(title, controls, compute) {
    if (busy) return toast('Terminez d’abord le réglage en cours.'); const l = lay(); if (!canPaint()) return;
    busy = true; closeMenu(); const src = getImg(l), s = src.data, w0 = W, h0 = H, big = w0 * h0 > 2.5e6; let tm = 0, did = false, last = null;
    const run = () => { tm = 0; const d = new Uint8ClampedArray(s); try { compute(s, d, w0, h0); } catch (e) { console.error(e); return toast(tr('Erreur :') + ' ' + e.message); } last = new ImageData(d, w0, h0); l.x.putImageData(last, 0, 0); if (sel) maskBlend(src, FULL()); render(); did = true; };
    const redo = ev => { clearTimeout(tm); if (big && ev !== 'change') return; tm = setTimeout(run, ev === 'change' ? 0 : 50); };
    const done = ok => {
      busy = false; panel.remove(); ov.focus({ preventScroll: true });
      if (ok) { if (tm) { clearTimeout(tm); run(); } else if (!did) run(); pushHist({ k: 'px', lid: l.id, img: src }); render(); layersUI(); }
      else { clearTimeout(tm); l.x.putImageData(src, 0, 0); render(); }
    };
    const cmp = btn('Comparer (maintenir)', 'eye', () => {}, '', 'Maintenez appuyé pour voir l’image d’origine');
    cmp.onpointerdown = () => { l.x.putImageData(src, 0, 0); render(); }; cmp.onpointerup = cmp.onpointerleave = () => { if (last) { l.x.putImageData(last, 0, 0); if (sel) maskBlend(src, FULL()); render(); } };
    const panel = el('div', { className: 'kd-adj', role: 'dialog', 'aria-label': title }, el('b', { textContent: title }), ...controls(redo), el('div', { className: 'row end' }, cmp, btn('Annuler', 'x', () => done(false)), btn('Appliquer', 'check', () => done(true), 'pri')));
    root.append(panel); redo('change');
  }
  const sliderRow = (p, vals, redo) => {
    const fm = v => (p.step && p.step < 1 ? (+v).toFixed(p.step < .1 ? 2 : 1) : String(Math.round(v))), out = el('span', { className: 'kd-v', textContent: fm(vals[p.k]) });
    const r = el('input', { type: 'range', min: p.min, max: p.max, step: p.step || 1, value: vals[p.k], 'aria-label': p.label });
    r.oninput = () => { vals[p.k] = +r.value; out.textContent = fm(r.value); redo('input'); }; r.onchange = () => redo('change'); r.ondblclick = () => { r.value = p.value; vals[p.k] = p.value; out.textContent = fm(p.value); redo('change'); };
    return el('label', { className: 'kd-sl' }, el('span', { textContent: p.label }), r, out);
  };
  function adjustWin(id) {
    const A = KADJ[id], vals = {}; for (const p of A.params) vals[p.k] = p.value; const o = { c1: kdHex(fg), c2: kdHex(bgc) };
    liveEdit(A.name, redo => [...A.params.map(p => sliderRow(p, vals, redo)), A.colors ? el('div', { className: 'row' }, el('label', { className: 'chk' }, el('span', { textContent: 'Couleur claire' }), el('input', { type: 'color', value: fg, oninput: e => { o.c1 = kdHex(e.target.value); redo('change'); } })), el('label', { className: 'chk' }, el('span', { textContent: 'Couleur sombre' }), el('input', { type: 'color', value: bgc, oninput: e => { o.c2 = kdHex(e.target.value); redo('change'); } }))) : null, el('small', { className: 'mut', textContent: 'Double-clic sur un curseur : valeur d’origine.' })], (s, d, w, h) => A.fn(s, d, w, h, vals, o));
  }
  function presetWin() {
    let curP = null; const mixv = { m: 100 }, l = lay(), k = Math.min(1, 96 / l.c.width, 72 / l.c.height), tw = Math.max(8, Math.round(l.c.width * k)), th = Math.max(8, Math.round(l.c.height * k));
    const sc = document.createElement('canvas'); sc.width = tw; sc.height = th; const sx = sc.getContext('2d', { willReadFrequently: true }); sx.drawImage(l.c, 0, 0, tw, th); const sid = sx.getImageData(0, 0, tw, th);
    liveEdit('Filtres rapides', redo => {
      const tiles = el('div', { className: 'kd-tiles' }), mk = (p) => {
        const c = el('canvas', { width: tw, height: th }), x = c.getContext('2d'), d = new Uint8ClampedArray(sid.data); if (p) p.fn(sid.data, d, tw, th); x.putImageData(new ImageData(d, tw, th), 0, 0);
        const b = el('button', { type: 'button', className: 'kd-tile' + (p === curP ? ' on' : ''), 'aria-pressed': String(p === curP), title: p ? p.name : 'Original', onclick: () => { curP = p; [...tiles.children].forEach(t => { t.classList.toggle('on', t === b); t.setAttribute('aria-pressed', String(t === b)); }); redo('change'); } }, c, el('span', { textContent: p ? p.name : 'Original' })); return b;
      };
      tiles.append(mk(null), ...KPRE.map(mk)); tiles.firstChild.classList.add('on');
      return [tiles, sliderRow({ k: 'm', label: 'Intensité (%)', min: 0, max: 100, value: 100 }, mixv, redo)];
    }, (s, d, w, h) => { if (!curP) { d.set(s); return; } const t = new Uint8ClampedArray(s); curP.fn(s, t, w, h); const f = mixv.m / 100; for (let i = 0; i < d.length; i++) d[i] = s[i] + (t[i] - s[i]) * f; });
  }

  /* ================= fichiers ================= */
  const nameIn = el('input', { value: 'kaleido_' + stamp(), maxLength: 80, 'aria-label': 'Nom du fichier', className: 'grow' });
  const fmtSel = el('select', { 'aria-label': 'Format du fichier' }); const FMTS = [['png', 'PNG (sans perte, transparence)'], ['jpeg', 'JPEG (léger, photos)'], ['webp', 'WebP (léger, transparence)'], ['gif', 'GIF (256 couleurs, transparence)'], ['bmp', 'BMP (bitmap Windows)'], ['ico', 'ICO (icône : 16 à 256 px)'], ['pdf', 'PDF (une page A4)'], ['kaleido', 'Projet Kaléido (calques)']];
  opts(fmtSel, [...FMTS].sort((p, q) => cmpT(p[1], q[1]))); fmtSel.value = 'png';
  { const t = document.createElement('canvas'); t.width = t.height = 2; t.toBlob(b => { if (b && b.type === 'image/avif') { FMTS.splice(3, 0, ['avif', 'AVIF (très léger)']); const v = fmtSel.value; opts(fmtSel, [...FMTS].sort((p, q) => cmpT(p[1], q[1]))); fmtSel.value = v; } }, 'image/avif'); }
  const flatCanvas = (white) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); if (white) { x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); } for (const l of L) if (l.vis) paintInto(x, l); return c; };

  /* ---- encodeurs d'images (sans bibliothèque) : BMP, GIF, ICO ---- */
  function bmpBlob(c) {   // BMP 24 bits, bas en haut, lignes alignées sur 4 octets (le canvas est déjà sur fond blanc)
    const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data, row = (w * 3 + 3) & ~3, size = 54 + row * h, buf = new ArrayBuffer(size), v = new DataView(buf), u = new Uint8Array(buf);
    u[0] = 0x42; u[1] = 0x4d; v.setUint32(2, size, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, row * h, true); v.setUint32(38, 2835, true); v.setUint32(42, 2835, true);
    for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * row, i = y * w * 4; for (let x = 0; x < w; x++, i += 4) { u[o++] = d[i + 2]; u[o++] = d[i + 1]; u[o++] = d[i]; } }
    return new Blob([buf], { type: 'image/bmp' });
  }
  function gifPalette(px, n) {   // quantification « coupe médiane » sur un histogramme 5 bits par canal
    const hist = new Map(); for (let i = 0; i < px.length; i += 4) if (px[i + 3] >= 128) { const k = (px[i] >> 3) << 10 | (px[i + 1] >> 3) << 5 | px[i + 2] >> 3; hist.set(k, (hist.get(k) || 0) + 1); }
    let boxes = [[...hist].map(([k, c]) => ({ c: [(k >> 10) << 3 | 4, ((k >> 5) & 31) << 3 | 4, (k & 31) << 3 | 4], n: c }))]; if (!boxes[0].length) return [[0, 0, 0]];
    const rng = b => { let m = [255, 255, 255], M = [0, 0, 0]; for (const p of b) for (let j = 0; j < 3; j++) { if (p.c[j] < m[j]) m[j] = p.c[j]; if (p.c[j] > M[j]) M[j] = p.c[j]; } const r = [M[0] - m[0], M[1] - m[1], M[2] - m[2]], ch = r[0] >= r[1] && r[0] >= r[2] ? 0 : r[1] >= r[2] ? 1 : 2; return { ch, r: r[ch] }; };
    while (boxes.length < n) {
      let bi = -1, best = 0; boxes.forEach((b, i) => { if (b.length > 1) { const q = rng(b), sc = q.r * Math.sqrt(b.reduce((a, p) => a + p.n, 0)); if (sc > best) { best = sc; bi = i; } } }); if (bi < 0) break;
      const b = boxes[bi], { ch } = rng(b); b.sort((p, q) => p.c[ch] - q.c[ch]); const tot = b.reduce((a, p) => a + p.n, 0); let acc = 0, cut = 1; for (let i = 0; i < b.length - 1; i++) { acc += b[i].n; cut = i + 1; if (acc >= tot / 2) break; }
      boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut));
    }
    return boxes.map(b => { let t = 0, r = 0, g = 0, bl = 0; for (const p of b) { t += p.n; r += p.c[0] * p.n; g += p.c[1] * p.n; bl += p.c[2] * p.n; } return [Math.round(r / t), Math.round(g / t), Math.round(bl / t)]; });
  }
  function gifBlob(c) {   // GIF fixe, 256 couleurs (dont une transparente si l'image en a), tramage Floyd–Steinberg
    const w = Math.min(c.width, 65535), h = Math.min(c.height, 65535), src = c.getContext('2d').getImageData(0, 0, w, h).data;
    let hasT = false; for (let i = 3; i < src.length; i += 4) if (src[i] < 128) { hasT = true; break; }
    const pal = gifPalette(src, hasT ? 255 : 256), tIdx = hasT ? pal.length : -1, nCol = pal.length + (hasT ? 1 : 0); let bits = 1; while ((1 << bits) < nCol) bits++;
    const cache = new Map(), near = (r, g, b) => { const k = (r >> 3) << 10 | (g >> 3) << 5 | b >> 3; let v = cache.get(k); if (v === undefined) { let bd = 1e9; v = 0; for (let i = 0; i < pal.length; i++) { const p = pal[i], d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2; if (d < bd) { bd = d; v = i; } } cache.set(k, v); } return v; };
    const dith = w * h <= 4e6, idx = new Uint8Array(w * h), er = dith ? new Float32Array((w + 2) * 6) : null;   // erreurs de la ligne courante et de la suivante (3 canaux)
    const W3 = (w + 2) * 3; let cur = 0, nxt = (w + 2) * 3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4; if (src[i + 3] < 128) { idx[y * w + x] = tIdx; continue; }
        let r = src[i], g = src[i + 1], b = src[i + 2]; const e = (x + 1) * 3;
        if (dith) { r = Math.max(0, Math.min(255, r + er[cur + e])); g = Math.max(0, Math.min(255, g + er[cur + e + 1])); b = Math.max(0, Math.min(255, b + er[cur + e + 2])); }
        const k = near(r | 0, g | 0, b | 0); idx[y * w + x] = k;
        if (dith) { const p = pal[k], d = [r - p[0], g - p[1], b - p[2]]; for (let j = 0; j < 3; j++) { er[cur + e + 3 + j] += d[j] * 7 / 16; er[nxt + e - 3 + j] += d[j] * 3 / 16; er[nxt + e + j] += d[j] * 5 / 16; er[nxt + e + 3 + j] += d[j] / 16; } }
      }
      if (dith) { er.fill(0, cur, cur + W3); [cur, nxt] = [nxt, cur]; }
    }
    const out = [], u16 = n => out.push(n & 255, n >> 8 & 255);
    out.push(...[...'GIF89a'].map(ch => ch.charCodeAt(0))); u16(w); u16(h); out.push(0x80 | (bits - 1) << 4 | (bits - 1), 0, 0);
    for (let i = 0; i < (1 << bits); i++) { const p = pal[i] || [0, 0, 0]; out.push(p[0], p[1], p[2]); }
    if (hasT) out.push(0x21, 0xf9, 4, 1, 0, 0, tIdx, 0);
    out.push(0x2c); u16(0); u16(0); u16(w); u16(h); out.push(0); const mcs = Math.max(2, bits); out.push(mcs);
    const clear = 1 << mcs, eoi = clear + 1, bytes = []; let dict = new Map(), next = eoi + 1, size = mcs + 1, acc = 0, nb = 0;
    const emit = code => { acc |= code << nb; nb += size; while (nb >= 8) { bytes.push(acc & 255); acc >>= 8; nb -= 8; } };
    emit(clear); let pre = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const ch = idx[i], key = pre << 8 | ch, f = dict.get(key);
      if (f !== undefined) pre = f; else {
        emit(pre); if (next < 4096) { dict.set(key, next++); if (next - 1 === (1 << size) && size < 12) size++; } else { emit(clear); dict = new Map(); next = eoi + 1; size = mcs + 1; }
        pre = ch;
      }
    }
    emit(pre); emit(eoi); if (nb > 0) bytes.push(acc & 255);
    for (let i = 0; i < bytes.length; i += 255) { const n = Math.min(255, bytes.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(bytes[i + j]); }
    out.push(0, 0x3b); return new Blob([new Uint8Array(out)], { type: 'image/gif' });
  }
  async function icoBlob(c) {   // ICO : plusieurs tailles (PNG intégrés), image centrée dans un carré transparent
    const sizes = [256, 128, 64, 48, 32, 16], pngs = [];
    for (const n of sizes) { const q = document.createElement('canvas'); q.width = q.height = n; const x = q.getContext('2d'), k = Math.min(n / c.width, n / c.height), w = Math.max(1, Math.round(c.width * k)), h = Math.max(1, Math.round(c.height * k)); x.imageSmoothingQuality = 'high'; x.drawImage(c, (n - w) / 2, (n - h) / 2, w, h); const b = await new Promise(r => q.toBlob(r, 'image/png')); pngs.push(new Uint8Array(await b.arrayBuffer())); }
    const head = new Uint8Array(6 + 16 * sizes.length), v = new DataView(head.buffer); v.setUint16(2, 1, true); v.setUint16(4, sizes.length, true); let off = head.length;
    sizes.forEach((n, i) => { const o = 6 + i * 16; head[o] = n === 256 ? 0 : n; head[o + 1] = n === 256 ? 0 : n; v.setUint16(o + 4, 1, true); v.setUint16(o + 6, 32, true); v.setUint32(o + 8, pngs[i].length, true); v.setUint32(o + 12, off, true); off += pngs[i].length; });
    return new Blob([head, ...pngs], { type: 'image/x-icon' });
  }
  async function projectBlob() {
    const z = new JSZip(), meta = { v: 1, W, H, cur, layers: [] };
    for (let i = 0; i < L.length; i++) { const l = L[i], b = await new Promise(r => l.c.toBlob(r, 'image/png')); z.file('l' + i + '.png', b); meta.layers.push({ name: l.name, vis: l.vis, op: l.op, bm: l.bm }); }
    z.file('meta.json', JSON.stringify(meta)); return z.generateAsync({ type: 'blob', compression: 'STORE' });
  }
  async function outBlob() {
    const f = fmtSel.value; if (f === 'kaleido') return { b: await projectBlob(), ext: '.kaleido' };
    if (f === 'pdf') return { b: await ptImagePdf(flatCanvas(true)), ext: '.pdf' };
    if (f === 'bmp') return { b: bmpBlob(flatCanvas(true)), ext: '.bmp' };
    if (f === 'gif') return { b: gifBlob(flatCanvas(false)), ext: '.gif' };
    if (f === 'ico') return { b: await icoBlob(flatCanvas(false)), ext: '.ico' };
    const c = flatCanvas(f === 'jpeg'), mime = 'image/' + f, b = await new Promise(r => c.toBlob(r, mime, f === 'png' ? undefined : .92));
    return b && b.type === mime ? { b, ext: f === 'jpeg' ? '.jpg' : '.' + f } : null;
  }
  const baseName = () => safeName(nameIn.value.replace(/\.(png|jpe?g|webp|avif|gif|bmp|ico|pdf|kaleido)$/i, ''), 70) || 'kaleido';
  const dest = destBar('draw');
  async function saveCloud() {
    if (!recConn('draw') && D.conns.length) { if (!await dest.choose()) return; }
    const o = await outBlob(); if (!o) return toast('Export impossible.'); await recQueue('draw').push(o.b, baseName() + o.ext); dirty = false;
  }
  async function printImg() {
    const c = flatCanvas(true), b = await new Promise(r => c.toBlob(r, 'image/png')); if (!b) return toast('Impression impossible.');
    const u = URL.createObjectURL(b); setTimeout(() => URL.revokeObjectURL(u), 120000); ptPrint([el('div', { className: 'pt-img' }, el('img', { src: u, alt: '' }))]);
  }
  const savePdf = () => ptSaveDialog(baseName(), () => ptImagePdf(flatCanvas(true)));
  async function dl() { const o = await outBlob(); if (o) { download(o.b, baseName() + o.ext); dirty = false; } }
  function snapshotOrig() { orig = document.createElement('canvas'); orig.width = W; orig.height = H; orig.getContext('2d').drawImage(cv, 0, 0); }
  function newDoc(w, h, bg) {
    hist.length = 0; redoS.length = 0; L.length = 0; sel = null; selPaths = null; crop = null; prev = null; orig = null; cloneSrc = null; cloneOff = null; lastEnd = null; sizeDoc(w, h);
    const l = mkLayer('Arrière-plan'); if (bg === 'white' || bg === 'color') { l.x.fillStyle = bg === 'white' ? '#ffffff' : bgc; l.x.fillRect(0, 0, w, h); } L.push(l); cur = 0; syncU(); layersUI(); render(); updInfo(); fit(); dirty = false;
  }
  const FORMATS = [['c', 'Personnalisé (largeur × hauteur ci-dessous)'], ['1920x1080', 'Écran HD — 1920 × 1080'], ['1280x720', 'Écran — 1280 × 720'], ['1080x1080', 'Carré réseaux sociaux — 1080 × 1080'], ['1080x1350', 'Portrait réseaux sociaux — 1080 × 1350'], ['1080x1920', 'Story / vertical — 1080 × 1920'], ['1240x1754', 'Page A4 (150 dpi) — 1240 × 1754'], ['1500x500', 'Bannière — 1500 × 500'], ['800x600', 'Petit — 800 × 600']];
  async function guardDirty(msg) { return !dirty || await confirmBox(msg || 'Remplacer le travail en cours ? Les modifications non enregistrées seront perdues.', 'Remplacer', true); }
  async function newDialog() {
    const r = await dialog('Nouvelle image', [{ k: 'f', type: 'select', label: 'Format', options: FORMATS, value: 'c' }, { k: 'w', label: 'Largeur (px)', type: 'number', value: String(W), max: 4 }, { k: 'h', label: 'Hauteur (px)', type: 'number', value: String(H), max: 4 }, { k: 'bg', label: 'Fond', type: 'select', options: [['white', 'Blanc'], ['clear', 'Transparent'], ['color', 'Couleur d’arrière-plan actuelle']], value: 'white' }], 'Créer', { check: v => v.f === 'c' && (!(+v.w >= 16) || +v.w > KD_DOC || !(+v.h >= 16) || +v.h > KD_DOC) ? tr('Taille : de 16 à {0} pixels.').replace('{0}', KD_DOC) : '' });
    if (!r || !await guardDirty()) return; let w = Math.round(+r.w), h = Math.round(+r.h); if (r.f !== 'c') [w, h] = r.f.split('x').map(Number);
    newDoc(w, h, r.bg); nameIn.value = 'kaleido_' + stamp();
  }
  const loadBitmap = async blob => { try { return await createImageBitmap(blob); } catch { toast('Image illisible ou format non pris en charge.', 4000); return null; } };
  async function openImageBlob(blob, name, asLayer) {
    const bm = await loadBitmap(blob); if (!bm) return;
    if (asLayer) { addImageLayer(bm, (name || 'Image').replace(/\.\w+$/, '').slice(0, 30)); bm.close && bm.close(); return; }
    const k = Math.min(1, KD_MAX / Math.max(bm.width, bm.height)), w = Math.max(1, Math.round(bm.width * k)), h = Math.max(1, Math.round(bm.height * k));
    newDoc(w, h, 'clear'); const l = lay(); l.x.imageSmoothingQuality = 'high'; l.x.drawImage(bm, 0, 0, w, h); bm.close && bm.close(); render(); snapshotOrig(); layersUI(); dirty = false;
    if (name) nameIn.value = name.replace(/\.\w+$/, '').slice(0, 70); if (k < 1) toast(tr('Image réduite à {0} × {1} px pour rester fluide.').replace('{0}', w).replace('{1}', h), 4500);
  }
  async function openProject(blob) {
    let z; try { z = await JSZip.loadAsync(blob); } catch { return toast('Projet illisible.'); }
    const mf = z.file('meta.json'); if (!mf) return toast('Ce n’est pas un projet Kaléido.'); let m; try { m = JSON.parse(await mf.async('string')); } catch { return toast('Projet illisible.'); }
    const w = Math.round(+m.W), h = Math.round(+m.H); if (!(w >= 1 && h >= 1 && w <= KD_DOC && h <= KD_DOC) || !Array.isArray(m.layers) || !m.layers.length || m.layers.length > KD_MAXL) return toast('Projet non valide.');
    const imgs = []; for (let i = 0; i < m.layers.length; i++) { const f = z.file('l' + i + '.png'); if (!f) return toast('Projet incomplet.'); const b = await f.async('blob'); if (b.size > 80e6) return toast('Calque trop lourd.'); const bm = await loadBitmap(new Blob([b], { type: 'image/png' })); if (!bm) return; if (bm.width > KD_DOC * 2 || bm.height > KD_DOC * 2) return toast('Calque trop grand.'); imgs.push(bm); }
    newDoc(w, h, 'blank'); L.length = 0;
    imgs.forEach((bm, i) => { const s = m.layers[i] || {}, l = mkLayer(String(s.name || 'Calque').slice(0, 40)); l.x.drawImage(bm, 0, 0, w, h); l.vis = s.vis !== false; l.op = Math.max(0, Math.min(100, +s.op || 100)); l.bm = KD_BM.has(s.bm) ? s.bm : 'source-over'; L.push(l); });
    cur = Math.max(0, Math.min(L.length - 1, m.cur | 0)); layersUI(); render(); snapshotOrig(); dirty = false;
  }
  async function openFile(f, asLayer) {
    if (!f) return; if (/\.kaleido$/i.test(f.name)) { if (await guardDirty()) { await openProject(f); nameIn.value = f.name.replace(/\.kaleido$/i, '').slice(0, 70); } return; }
    if (!asLayer && !await guardDirty()) return; await openImageBlob(f, f.name, asLayer);
  }
  const fileIn = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/bmp,.kaleido', hidden: true });
  let openAsLayer = false; fileIn.onchange = () => { const f = fileIn.files[0]; fileIn.value = ''; openFile(f, openAsLayer); };
  const pickFile = asLayer => { openAsLayer = asLayer; fileIn.click(); };
  async function openCloud() {
    const c = recConn('draw'); if (!c) return toast('Choisissez d’abord un stockage WebDAV comme destination (« Choisir… » en bas).', 5000);
    try {
      const it = (await FS.list(c, D.rec.draw.path)).filter(x => !x.dir && /\.(png|jpe?g|webp|gif|bmp|kaleido)$/i.test(x.name)).sort((a, b) => String(b.name).localeCompare(String(a.name)));
      if (!it.length) return toast('Aucune image ni projet dans ce dossier.');
      const r = await dialog('Ouvrir depuis le cloud', [{ k: 'f', label: 'Fichier', type: 'select', options: it.map(x => [x.name, x.name + ' (' + fmtSize(x.size) + ')']) }], 'Ouvrir'); if (!r || !await guardDirty()) return;
      const t = toast('Chargement…', 0); try { const b = await FS.read(c, joinP(D.rec.draw.path, r.f), /\.kaleido$/i.test(r.f) ? 'application/zip' : 'image/png'); if (/\.kaleido$/i.test(r.f)) await openProject(b); else await openImageBlob(b, r.f); nameIn.value = r.f.replace(/\.\w+$/, '').slice(0, 70); } finally { t.close(); }
    } catch (e) { toast(e.message, 6000); }
  }
  async function resizeDialog() {
    const r = await dialog('Taille de l’image', [{ k: 'w', label: 'Largeur (px)', type: 'number', value: String(W), max: 4 }, { k: 'h', label: 'Hauteur (px)', type: 'number', value: String(H), max: 4 }, { k: 'r', type: 'select', label: 'Proportions', options: [['y', 'Garder les proportions (la hauteur est calculée)'], ['n', 'Libres']], value: 'y' }], 'Redimensionner', { check: v => (!(+v.w >= 16) || +v.w > KD_DOC || (v.r === 'n' && (!(+v.h >= 16) || +v.h > KD_DOC))) ? tr('Taille : de 16 à {0} pixels.').replace('{0}', KD_DOC) : (v.r === 'y' && Math.round(+v.w * H / W) > KD_DOC) ? 'Trop grand.' : '' }); if (!r) return;
    const nw = Math.round(+r.w), nh = r.r === 'y' ? Math.max(1, Math.round(nw * H / W)) : Math.round(+r.h); docOp(nw, nh, (oc, x) => { x.drawImage(oc, 0, 0, nw, nh); }); fit();
  }
  async function canvasDialog() {
    const r = await dialog('Taille de la zone de travail', [{ k: 'w', label: 'Largeur (px)', type: 'number', value: String(W), max: 4 }, { k: 'h', label: 'Hauteur (px)', type: 'number', value: String(H), max: 4 }, { k: 'a', type: 'select', label: 'Placer l’image', options: [['c', 'Au centre'], ['tl', 'En haut à gauche']], value: 'c' }], 'Appliquer', { note: 'Agrandit ou réduit la zone sans étirer l’image. Les nouvelles zones sont transparentes.', check: v => (!(+v.w >= 16) || +v.w > KD_DOC || !(+v.h >= 16) || +v.h > KD_DOC) ? tr('Taille : de 16 à {0} pixels.').replace('{0}', KD_DOC) : '' }); if (!r) return;
    const nw = Math.round(+r.w), nh = Math.round(+r.h); docOp(nw, nh, (oc, x, ow, oh) => x.drawImage(oc, r.a === 'c' ? Math.round((nw - ow) / 2) : 0, r.a === 'c' ? Math.round((nh - oh) / 2) : 0)); fit();
  }
  const rot = d => { if (d === 180) docOp(W, H, (oc, x, ow, oh) => { x.translate(ow, oh); x.rotate(Math.PI); x.drawImage(oc, 0, 0); }); else if (d > 0) docOp(H, W, (oc, x, ow, oh) => { x.translate(oh, 0); x.rotate(Math.PI / 2); x.drawImage(oc, 0, 0); }); else docOp(H, W, (oc, x, ow, oh) => { x.translate(0, ow); x.rotate(-Math.PI / 2); x.drawImage(oc, 0, 0); }); fit(); };
  const flipDoc = h => docOp(W, H, (oc, x, ow, oh) => { if (h) { x.translate(ow, 0); x.scale(-1, 1); } else { x.translate(0, oh); x.scale(1, -1); } x.drawImage(oc, 0, 0); });
  async function clearAll() { if (!await confirmBox('Vider le calque actif ?', 'Vider', true)) return; if (!canPaint()) return; pxHist(); lay().x.clearRect(0, 0, W, H); render(); }

  /* ================= barre d'options (change selon l'outil) ================= */
  opt.feather = 0; opt.gradC = 'fb';
  const sl = (label, get, set, min, max, step = 1) => {
    const out = el('span', { className: 'kd-v', textContent: String(get()) });
    const r = el('input', { type: 'range', min, max, step, value: get(), 'aria-label': label, title: label, oninput: () => { set(+r.value); out.textContent = r.value; } });
    return el('label', { className: 'kd-sl h' }, el('span', { textContent: label }), r, out);
  };
  const dd = (label, items, get, set) => { const s = el('select', { 'aria-label': label, title: label }); opts(s, items); s.value = get(); s.onchange = () => set(s.value); return s; };
  const ck = (label, get, set) => el('label', { className: 'chk' }, el('input', { type: 'checkbox', checked: get(), onchange: e => set(e.target.checked) }), el('span', { textContent: label }));
  const optBar = el('div', { className: 'kd-opts' }), toolBtns = {};
  let cloneBtn = null;
  function cloneBtnUpd() { if (cloneBtn && cloneBtn.isConnected) cloneBtn.lastChild.textContent = tr(cloneSrc === 'pick' ? 'Cliquez sur la zone à copier…' : cloneSrc ? 'Source choisie ✓ (changer)' : 'Choisir la source'); }
  const SIZE_T = new Set([...KD_PAINT, 'clone', 'heal', 'smudge', 'blur', 'sharpen', 'dodge', 'burn', 'sponge', 'mosaic', 'redeye', 'shape', 'sticker']);
  const HARD_T = new Set(['brush', 'airbrush', 'eraser', 'clone', 'heal', 'smudge', 'blur', 'sharpen', 'dodge', 'burn', 'sponge']);
  const OP_T = new Set([...KD_PAINT, 'clone', 'smudge', 'blur', 'sharpen', 'dodge', 'burn', 'sponge', 'mosaic', 'fill', 'gradient', 'shape', 'text', 'sticker']);
  const OPLBL = { smudge: 'Force', blur: 'Force', sharpen: 'Force', dodge: 'Force', burn: 'Force', sponge: 'Force', mosaic: 'Force' };
  const HINTS = { move: 'Glissez pour déplacer le calque (ou le contenu de la sélection). Maj = en ligne droite.', hand: 'Glissez pour déplacer la vue. (Astuce : maintenez la barre d’espace avec n’importe quel outil.)', pipette: 'Cliquez pour prélever une couleur (Maj + clic : couleur d’arrière-plan).', redeye: 'Passez sur l’œil rouge : le rouge est remplacé par un ton sombre naturel.', heal: 'Peignez sur la tache ou le défaut : il est effacé quand vous relâchez.', text: 'Cliquez sur l’image à l’endroit du texte.', fill: 'Cliquez dans une zone pour la remplir.', gradient: 'Glissez du point de départ au point d’arrivée.', mosaic: 'Passez sur la zone à pixelliser (flouter un visage, un texte…).' };
  function optsUI() {
    const s = S(), it = [];
    if (SIZE_T.has(tool)) it.push(sl(tool === 'shape' ? 'Épaisseur' : 'Taille', () => s.size, v => { s.size = v; }, 1, tool === 'shape' ? 60 : tool === 'sticker' ? 150 : 300));
    if (HARD_T.has(tool)) it.push(sl('Dureté', () => s.hard, v => { s.hard = v; }, 0, 100));
    if (OP_T.has(tool)) it.push(sl(OPLBL[tool] || 'Opacité', () => s.op, v => { s.op = v; }, 1, 100));
    if (tool === 'brush' || tool === 'airbrush' || tool === 'eraser') it.push(sl('Flux', () => s.flow, v => { s.flow = v; }, 1, 100));
    if (KD_PAINT.has(tool)) it.push(sl('Lissage', () => opt.smooth, v => { opt.smooth = v; }, 0, 100), dd('Symétrie / mandala', KD_SYM, () => opt.sym, v => { opt.sym = v; drawOv(); }));
    if (tool === 'clone') { cloneBtn = el('button', { type: 'button', onclick: () => { cloneSrc = 'pick'; cloneBtnUpd(); } }, ico('stamp', 16), el('span', { textContent: 'Choisir la source' })); cloneBtnUpd(); it.push(cloneBtn, ck('Tous les calques', () => opt.all, v => { opt.all = v; }), el('small', { className: 'mut', textContent: 'Alt + clic = choisir la source' })); }
    if (tool === 'sponge') it.push(dd('Mode', [['sat', 'Saturer (couleurs plus vives)'], ['desat', 'Désaturer (couleurs ternes)']], () => opt.spongeMode, v => { opt.spongeMode = v; }));
    if (['selrect', 'selell', 'lasso', 'wand'].includes(tool)) it.push(dd('Mode de sélection', [['rep', 'Nouvelle sélection'], ['add', 'Ajouter à la sélection'], ['sub', 'Retirer de la sélection'], ['int', 'Intersection']], () => opt.selMode, v => { opt.selMode = v; }), sl('Bords adoucis', () => opt.feather, v => { opt.feather = v; }, 0, 40));
    if (tool === 'wand' || tool === 'fill') it.push(sl('Tolérance', () => opt.tol, v => { opt.tol = v; }, 0, 100), ck('Zones voisines seulement', () => opt.contig, v => { opt.contig = v; }), ck('Tous les calques', () => opt.all, v => { opt.all = v; }));
    if (tool === 'gradient') it.push(dd('Type', [['linear', 'Linéaire'], ['radial', 'Radial'], ['conic', 'Angulaire'], ['reflect', 'Réfléchi']], () => opt.grad, v => { opt.grad = v; }), dd('Couleurs', [['fb', 'Premier plan → arrière-plan'], ['ft', 'Premier plan → transparent'], ['rain', 'Arc-en-ciel'], ['sunset', 'Coucher de soleil'], ['ocean', 'Océan'], ['fire', 'Feu']], () => opt.gradC, v => { opt.gradC = v; }));
    if (tool === 'shape') it.push(dd('Forme', [['rect', 'Rectangle'], ['round', 'Rectangle arrondi'], ['ell', 'Ellipse / cercle'], ['line', 'Ligne'], ['arrow', 'Flèche'], ['tri', 'Triangle'], ['star', 'Étoile'], ['hex', 'Hexagone'], ['heart', 'Cœur']], () => opt.shape, v => { opt.shape = v; }), dd('Remplissage', [['stroke', 'Contour seul'], ['fill', 'Plein'], ['both', 'Plein + contour']], () => opt.fm, v => { opt.fm = v; }), el('small', { className: 'mut', textContent: 'Maj = proportions / angles réguliers' }));
    if (tool === 'text') it.push(dd('Police', KD_FONTS, () => opt.font, v => { opt.font = v; }), sl('Taille', () => opt.fsize, v => { opt.fsize = v; }, 8, 300), ck('Gras', () => opt.bold, v => { opt.bold = v; }), ck('Italique', () => opt.italic, v => { opt.italic = v; }), sl('Contour', () => opt.outline, v => { opt.outline = v; }, 0, 12), ck('Nouveau calque', () => opt.newL, v => { opt.newL = v; }));
    if (tool === 'sticker') it.push(el('span', { className: 'kd-emo' }, ...KD_EMO.map(em => el('button', { type: 'button', className: 'kd-em' + (opt.sticker === em ? ' on' : ''), textContent: em, 'aria-label': tr('Autocollant {0}').replace('{0}', em), onclick: ev => { opt.sticker = em; [...ev.currentTarget.parentNode.children].forEach(b => b.classList.toggle('on', b === ev.currentTarget)); } }))));
    if (tool === 'crop') it.push(dd('Proportions', [['free', 'Libres'], ['1:1', '1:1 (carré)'], ['4:3', '4:3'], ['3:2', '3:2'], ['16:9', '16:9'], ['9:16', '9:16 (vertical)'], ['3:4', '3:4'], ['2:3', '2:3']], () => opt.ratio, v => { opt.ratio = v; }), btn('Appliquer le recadrage', 'check', cropApply, 'pri'), btn('Annuler', 'x', () => { crop = null; drawOv(); }));
    if (HINTS[tool]) it.push(el('small', { className: 'mut', textContent: HINTS[tool] }));
    optBar.replaceChildren(...it);
  }
  function setTool(t) {
    if (t !== 'crop') crop = null; tool = t; prev = null; gest = null; st = null;
    for (const k in toolBtns) { toolBtns[k].classList.toggle('on', k === t); toolBtns[k].setAttribute('aria-pressed', String(k === t)); }
    ov.dataset.tool = t; ring.hidden = true; optsUI(); drawOv();
  }

  /* ================= pointeur ================= */
  const DIRECT_T = ['smudge', 'blur', 'sharpen', 'dodge', 'burn', 'sponge', 'mosaic', 'redeye'], ALTPIP = ['brush', 'pencil', 'marker', 'airbrush', 'fill', 'gradient', 'shape', 'text', 'sticker'], RING_T = new Set([...KD_PAINT, 'clone', 'heal', ...DIRECT_T]);
  let gest = null;
  function ringAt(p) {
    if (!RING_T.has(tool) || busy || space) { ring.hidden = true; return; }
    const d = Math.max(4, S().size * zoom); ring.hidden = false; ring.style.cssText = `width:${d}px;height:${d}px;left:${p.x * zoom - d / 2}px;top:${p.y * zoom - d / 2}px`;
  }
  const dashPath = (o, fn) => { o.lineWidth = 1.5 / zoom; o.setLineDash([6 / zoom, 5 / zoom]); o.strokeStyle = '#fff'; o.lineDashOffset = 0; fn(); o.stroke(); o.strokeStyle = '#000'; o.lineDashOffset = 6 / zoom; fn(); o.stroke(); };
  function setPrev(g) {
    if (g.k === 'shp') prev = o => { if (tool === 'gradient') { dashPath(o, () => { o.beginPath(); o.moveTo(g.a.x, g.a.y); o.lineTo(g.b.x, g.b.y); }); o.fillStyle = '#fff'; o.beginPath(); o.arc(g.a.x, g.a.y, 4 / zoom, 0, 7); o.fill(); } else { o.globalAlpha = S().op / 100; shapeDraw(o, g.a, g.b, g.sh); } };
    else prev = o => { if (g.t === 'lasso') dashPath(o, () => { o.beginPath(); g.pts.forEach((q, i) => i ? o.lineTo(q.x, q.y) : o.moveTo(q.x, q.y)); }); else { const r = rectOf(g.a, g.b, g.sh); dashPath(o, () => { o.beginPath(); if (g.t === 'selell') o.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, 7); else o.rect(r.x, r.y, r.w, r.h); }); } };
  }
  ov.addEventListener('pointerdown', e => {
    if (busy || e.button === 2) return; e.preventDefault(); ov.focus({ preventScroll: true }); closeMenu(); try { ov.setPointerCapture(e.pointerId); } catch { /* sans importance */ }
    const p = pt(e); st = null; gest = null;
    if (tool === 'hand' || space || e.button === 1) { gest = { k: 'pan', sx: e.clientX, sy: e.clientY, l: scroller.scrollLeft, t: scroller.scrollTop }; return; }
    if (e.altKey && ALTPIP.includes(tool)) { pipetteAt(p, false); return; }
    if (KD_PAINT.has(tool) || tool === 'clone') { paintDown(p, e); gest = st ? { k: 'paint' } : null; }
    else if (tool === 'heal') { healDown(p); gest = st ? { k: 'heal' } : null; }
    else if (DIRECT_T.includes(tool)) { directDown(p); gest = st ? { k: 'direct' } : null; }
    else if (tool === 'fill') fillAt(p);
    else if (tool === 'wand') wandAt(p);
    else if (tool === 'pipette') { pipetteAt(p, e.shiftKey); gest = { k: 'pip' }; }
    else if (tool === 'gradient' || tool === 'shape') { if (!canPaint()) return; gest = { k: 'shp', a: p, b: p, sh: e.shiftKey }; setPrev(gest); }
    else if (tool === 'selrect' || tool === 'selell' || tool === 'lasso') { gest = { k: 'sel', t: tool, a: p, b: p, pts: [p], sh: e.shiftKey }; setPrev(gest); }
    else if (tool === 'move') gest = moveDown(p);
    else if (tool === 'crop') gest = cropDown(p);
    else if (tool === 'text') textAt(p);
    else if (tool === 'sticker') stickerAt(p);
  });
  ov.addEventListener('pointermove', e => {
    const p = pt(e); posEl.textContent = Math.round(p.x) + ', ' + Math.round(p.y); ringAt(p); if (!gest || busy) return;
    const co = e.getCoalescedEvents ? e.getCoalescedEvents() : [], evs = co.length ? co : [e];
    switch (gest.k) {
      case 'pan': scroller.scrollLeft = gest.l - (e.clientX - gest.sx); scroller.scrollTop = gest.t - (e.clientY - gest.sy); break;
      case 'paint': for (const ev of evs) paintMove(pt(ev)); break;
      case 'direct': for (const ev of evs) directMove(pt(ev)); break;
      case 'heal': st.pts.push(p); drawOv(); break;
      case 'pip': pipetteAt(p, e.shiftKey); break;
      case 'shp': case 'sel': gest.b = p; gest.sh = e.shiftKey; if (gest.t === 'lasso') gest.pts.push(p); drawOv(); break;
      case 'move': moveTo(gest, p, e.shiftKey); break;
      case 'crop': cropMove(gest, p); break;
    }
  });
  const finish = e => {
    if (!gest) return; const g = gest, p = pt(e); gest = null;
    try {
      switch (g.k) {
        case 'paint': paintUp(p); break;
        case 'heal': st.pts.push(p); healUp(); break;
        case 'shp': prev = null; if (Math.hypot(p.x - g.a.x, p.y - g.a.y) >= 2) { pxHist(); if (tool === 'gradient') putMasked(tx => gradFill(tx, g.a, p), S().op); else { putMasked(tx => shapeDraw(tx, g.a, p, e.shiftKey), S().op); pushRecent(); } } break;
        case 'sel': prev = null; selCommit(g, p, e.shiftKey); break;
        case 'move': moveUp(g); break;
        case 'crop': if (crop && (crop.w < 4 || crop.h < 4)) crop = null; break;
      }
    } catch (err) { console.error(err); toast(tr('Erreur :') + ' ' + err.message, 5000); }
    st = null; drawOv(); updInfo();
  };
  ov.addEventListener('pointerup', finish); ov.addEventListener('pointercancel', finish); ov.addEventListener('pointerleave', () => { ring.hidden = true; }); ov.addEventListener('contextmenu', e => e.preventDefault());
  /* zoom à la molette (Ctrl + molette), glisser-déposer d'un fichier */
  let userZoom = false;
  const zoomAt = (f, cx, cy) => { const r = ov.getBoundingClientRect(), dx = (cx - r.left) / zoom, dy = (cy - r.top) / zoom; userZoom = true; setZoom(zoom * f); const r2 = ov.getBoundingClientRect(); scroller.scrollLeft += r2.left + dx * zoom - cx; scroller.scrollTop += r2.top + dy * zoom - cy; };
  scroller.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
  scroller.addEventListener('dragover', e => { e.preventDefault(); });
  scroller.addEventListener('drop', e => { e.preventDefault(); const f = [...(e.dataTransfer.files || [])].find(f => /^image\//.test(f.type) || /\.kaleido$/i.test(f.name)); if (f) openFile(f, false); });

  /* ================= panneau latéral : couleurs, calques, histogramme ================= */
  fgIn = el('input', { type: 'color', value: fg, className: 'kd-col', 'aria-label': 'Couleur de premier plan', title: 'Couleur de premier plan', oninput: () => setFg(fgIn.value) });
  bgIn = el('input', { type: 'color', value: bgc, className: 'kd-col', 'aria-label': 'Couleur d’arrière-plan', title: 'Couleur d’arrière-plan', oninput: () => setBg(bgIn.value) });
  const swap = () => { const a = fg, b = bgc; setFg(b); setBg(a); };
  const recentBox = el('div', { className: 'kd-pal' });
  const swatch = c => el('button', { type: 'button', className: 'kd-sw', style: 'background:' + c, title: c + ' ' + tr('(Maj + clic : arrière-plan)'), 'aria-label': tr('Couleur {0}').replace('{0}', c), onclick: e => { (e.shiftKey ? setBg : setFg)(c); }, oncontextmenu: e => { e.preventDefault(); setBg(c); } });
  function recentUI() { recentBox.replaceChildren(...recent.map(swatch)); }
  const histCv = el('canvas', { className: 'kd-hist', width: 256, height: 70, 'aria-label': 'Histogramme de l’image' }), histBox = el('details', { className: 'kd-sec' }, el('summary', { textContent: 'Histogramme' }), histCv), hsC = document.createElement('canvas');
  function histDraw() {
    if (!histBox.open || !alive()) return; const w = Math.min(W, 200), h = Math.max(1, Math.round(H * w / W)); hsC.width = w; hsC.height = h; const sx = hsC.getContext('2d', { willReadFrequently: true }); sx.clearRect(0, 0, w, h); sx.drawImage(cv, 0, 0, w, h);
    const hh = kHist(sx.getImageData(0, 0, w, h).data), x = histCv.getContext('2d'); x.clearRect(0, 0, 256, 70); let mx = 1; for (const a of hh) for (let i = 2; i < 254; i++) mx = Math.max(mx, a[i]);
    [[3, 'rgba(160,160,160,.55)', 1], [0, 'rgba(239,68,68,.75)', 0], [1, 'rgba(34,197,94,.75)', 0], [2, 'rgba(59,130,246,.75)', 0]].forEach(([c, col, fill]) => { x.beginPath(); x.moveTo(0, 70); for (let i = 0; i < 256; i++) x.lineTo(i, 70 - Math.min(1, Math.sqrt(hh[c][i] / mx)) * 68); x.lineTo(255, 70); if (fill) { x.fillStyle = col; x.fill(); } else { x.strokeStyle = col; x.lineWidth = 1; x.stroke(); } });
  }
  let hTm = 0;
  function histSoon() { clearTimeout(hTm); hTm = setTimeout(() => { if (!alive()) return; thumbs(); histDraw(); }, 250); }
  histBox.ontoggle = histDraw;
  const side = el('div', { className: 'kd-side' },
    el('div', { className: 'kd-sec' }, el('div', { className: 'kd-sh', textContent: 'Couleurs' }), el('div', { className: 'row tight' }, fgIn, bgIn, btn('', 'flip', swap, '', 'Inverser les couleurs (X)'), el('small', { className: 'mut', textContent: 'premier plan · arrière-plan' })), el('div', { className: 'kd-pal' }, ...KD_PAL.map(swatch)), recentBox),
    el('div', { className: 'kd-sec grow' }, el('div', { className: 'kd-sh' }, el('span', { textContent: 'Calques' }), el('span', { className: 'row tight' }, btn('', 'plus', () => newLayer(), '', 'Nouveau calque'), btn('', 'copy', dupLayer, '', 'Dupliquer le calque'), btn('', 'up', () => moveLayer(1), '', 'Monter le calque'), btn('', 'down', () => moveLayer(-1), '', 'Descendre le calque'), btn('', 'trash', delLayer, 'dng', 'Supprimer le calque'))),
      layBox, el('label', { className: 'kd-sl' }, el('span', { textContent: 'Opacité' }), opIn, opOut), bmSel, el('div', { className: 'row tight' }, btn('Fusionner ↓', '', mergeDown, '', 'Fusionner avec le calque du dessous'), btn('Aplatir', '', flatten, '', 'Fusionner tous les calques'))),
    histBox);

  /* ================= menus ================= */
  let openM = null;
  function closeMenu(e) {
    if (!openM) return; if (e && e.target && (openM.contains(e.target) || (openM.anchor && openM.anchor.contains(e.target)))) return;
    openM.remove(); openM = null; document.removeEventListener('pointerdown', closeMenu, true);
  }
  function openMenu(anchor, items) {
    const had = openM && openM.anchor === anchor; closeMenu(); if (had) return;
    const m = el('div', { className: 'kd-menu', role: 'menu' }, ...items.map(it => it === '-' ? el('hr') : el('button', { type: 'button', role: 'menuitem', onclick: () => { closeMenu(); ov.focus({ preventScroll: true }); it[1](); } }, el('span', { textContent: it[0] }), it[2] ? el('kbd', { textContent: it[2] }) : null)));
    const r = anchor.getBoundingClientRect(), rr = root.getBoundingClientRect(); m.style.cssText = `left:${Math.max(0, Math.min(r.left - rr.left, rr.width - 250))}px;top:${r.bottom - rr.top}px`; m.anchor = anchor; root.append(m); openM = m;
    setTimeout(() => document.addEventListener('pointerdown', closeMenu, true));
  }
  const mA = id => [KADJ[id].name + '…', () => adjustWin(id)], mP = id => { const p = KPRE.find(x => x.id === id); return [p.name, () => liveEdit(p.name, () => [], (s, d, w, h) => p.fn(s, d, w, h))]; };
  const zoomBy = f => { userZoom = true; setZoom(zoom * f, true); };
  const MENUS = [
    ['Fichier', [['Nouvelle image…', newDialog], ['Ouvrir une image ou un projet…', () => pickFile(false)], ['Placer une image comme calque…', () => pickFile(true)], ['Ouvrir depuis le cloud…', openCloud], '-', ['Coller', doPaste, 'Ctrl+V'], '-', ['Télécharger (format choisi en bas)', dl, 'Ctrl+S'], ['Enregistrer sur le cloud', saveCloud], '-', ['Imprimer…', printImg, 'Ctrl+P'], ['Enregistrer en PDF (appareil ou cloud)…', savePdf]]],
    ['Édition', [['Annuler', doUndo, 'Ctrl+Z'], ['Rétablir', doRedo, 'Ctrl+Y'], '-', ['Couper', () => copySel(true), 'Ctrl+X'], ['Copier', () => copySel(false), 'Ctrl+C'], ['Coller', doPaste, 'Ctrl+V'], ['Effacer la sélection', eraseSel, 'Suppr'], '-', ['Remplir avec la couleur de premier plan', () => fillSel(fg)], ['Remplir avec la couleur d’arrière-plan', () => fillSel(bgc)], ['Vider le calque', clearAll]]],
    ['Image', [['Taille de l’image…', resizeDialog], ['Taille de la zone de travail…', canvasDialog], ['Recadrer sur la sélection', () => { if (!sel) return toast('Faites d’abord une sélection.'); const r = sel.bb; docOp(r.w, r.h, (oc, x) => x.drawImage(oc, -r.x, -r.y)); fit(); }], '-', ['Pivoter à droite (90°)', () => rot(90)], ['Pivoter à gauche (90°)', () => rot(-90)], ['Pivoter de 180°', () => rot(180)], ['Retourner horizontalement', () => flipDoc(true)], ['Retourner verticalement', () => flipDoc(false)], '-', ['Aplatir tous les calques', flatten]]],
    ['Calque', [['Nouveau calque', () => newLayer()], ['Dupliquer', dupLayer], ['Supprimer', delLayer], ['Fusionner avec le calque du dessous', mergeDown], '-', ['Nouveau calque par copie de la sélection', () => layerFromSel(false)], ['Nouveau calque par découpe de la sélection', () => layerFromSel(true)], '-', ['Transformer (taille, rotation)…', transformLayer], ['Retourner le calque horizontalement', () => flipLayer(true)], ['Retourner le calque verticalement', () => flipLayer(false)]]],
    ['Sélection', [['Tout sélectionner', selAll, 'Ctrl+A'], ['Désélectionner', () => selSet(null), 'Ctrl+D'], ['Inverser la sélection', selInv, 'Ctrl+Maj+I'], '-', ['Agrandir…', () => selAdjust('grow')], ['Réduire…', () => selAdjust('shrink')], ['Adoucir les bords…', () => selAdjust('feather')]]],
    ['Réglages', [['Filtres rapides (aperçus)…', presetWin], '-', ...['bc', 'exp', 'sh', 'sat', 'hue', 'temp', 'lev'].map(mA), '-', ...['post', 'thr', 'duo'].map(mA), '-', mP('autolev'), mP('autocon'), mP('autowb')]],
    ['Filtres', [...['blur', 'sharp', 'den', 'grain', 'vig', 'pix'].map(mA), '-', ...['emb', 'edge', 'sketch', 'toon'].map(mA), '-', ...['wave', 'swirl', 'bulge', 'kal'].map(mA)]],
    ['Affichage', [['Zoom avant', () => zoomBy(1.25)], ['Zoom arrière', () => zoomBy(1 / 1.25)], ['Ajuster à la fenêtre', () => { userZoom = false; fit(); }], ['Taille réelle (100 %)', () => { userZoom = true; setZoom(1, true); }]]]
  ];
  const menuBar = el('div', { className: 'kd-menus', role: 'menubar' }, ...MENUS.map(([name, items]) => { const b = el('button', { type: 'button', className: 'kd-mb', textContent: name, 'aria-haspopup': 'menu', onclick: e => { e.stopPropagation(); openMenu(b, items); } }); return b; }));
  const cmpBtn = btn('Avant / après', 'eye', () => {}, '', 'Maintenez appuyé pour voir l’image telle qu’à l’ouverture');
  cmpBtn.onpointerdown = () => { if (orig && orig.width === W && orig.height === H) { showOrig = true; render(); } else toast('Pas d’original à comparer (image créée vierge ou recadrée).', 2500); };
  cmpBtn.onpointerup = cmpBtn.onpointerleave = () => { if (showOrig) { showOrig = false; render(); } };
  const top = el('div', { className: 'kd-top' }, menuBar, el('span', { className: 'kd-sep' }), uB, rB, el('span', { className: 'kd-sep' }), btn('', 'zout', () => zoomBy(1 / 1.25), '', 'Zoom arrière'), zl, btn('', 'zin', () => zoomBy(1.25), '', 'Zoom avant'), btn('Ajuster', '', () => { userZoom = false; fit(); }, '', 'Ajuster à la fenêtre'), cmpBtn);
  const toolbox = el('div', { className: 'kd-tools', role: 'toolbar', 'aria-label': 'Outils', 'aria-orientation': 'vertical' }, ...KD_TOOLS.map(g => el('div', { className: 'kd-tg' }, ...g.map(([id, ic, label, key]) => (toolBtns[id] = el('button', { type: 'button', className: 'kd-t', title: tr(label) + (key ? ' (' + key + ')' : ''), 'aria-label': label, 'aria-pressed': 'false', onclick: () => setTool(id) }, ico(ic, 18)))))));
  const foot = el('div', { className: 'kd-foot' }, el('div', { className: 'row tight kd-stat' }, infoEl, posEl), dest, el('div', { className: 'row' }, nameIn, fmtSel, btn('Enregistrer sur le cloud', 'save', saveCloud, 'pri'), btn('Télécharger', 'download', dl), btn('Imprimer', 'print', printImg), btn('PDF…', 'download', savePdf, '', 'Enregistrer en PDF : sur cet appareil ou dans votre cloud WebDAV')));
  root = el('div', { className: 'kd', tabIndex: -1 }, top, optBar, el('div', { className: 'kd-main' }, toolbox, scroller, side), foot, fileIn);

  /* ================= clavier, collage ================= */
  root.addEventListener('keydown', e => {
    const t = e.target; if (t && t.matches && t.matches('input:not([type=range]):not([type=checkbox]):not([type=color]),textarea,select')) return;
    if (busy) return; const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl) {
      const kl = k.toLowerCase();
      if (kl === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); } else if (kl === 'y') { e.preventDefault(); doRedo(); } else if (kl === 'a') { e.preventDefault(); selAll(); } else if (kl === 'd') { e.preventDefault(); selSet(null); }
      else if (kl === 'i' && e.shiftKey) { e.preventDefault(); selInv(); } else if (kl === 'c') { e.preventDefault(); copySel(false); } else if (kl === 'x') { e.preventDefault(); copySel(true); } else if (kl === 'j') { e.preventDefault(); dupLayer(); } else if (kl === 's') { e.preventDefault(); dl(); } else if (kl === 'p') { e.preventDefault(); printImg(); }
      return;
    }
    if (k === ' ' && (t === ov || t === root)) { space = true; ring.hidden = true; e.preventDefault(); return; }
    if (k === 'Enter' && tool === 'crop') { cropApply(); return; }
    if (k === 'Escape') { if (crop) { crop = null; drawOv(); } else if (sel) selSet(null); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); eraseSel(); return; }
    if (k === '[' || k === ']') { const s = S(); if (s.size) { s.size = Math.max(1, Math.min(300, Math.round(s.size * (k === ']' ? 1.15 : 1 / 1.15) + (k === ']' ? 1 : -1)))); optsUI(); } return; }
    if (k.length === 1) { const kk = k.toUpperCase(); if (kk === 'X') { swap(); return; } for (const g of KD_TOOLS) for (const x of g) if (x[3] === kk) { setTool(x[0]); return; } }
  });
  root.addEventListener('keyup', e => { if (e.key === ' ') space = false; });
  root.addEventListener('paste', e => {
    const f = [...((e.clipboardData && e.clipboardData.files) || [])].find(f => /^image\//.test(f.type));
    if (f) { e.preventDefault(); openImageBlob(f, 'Collage', true); } else if (clipC) { e.preventDefault(); addImageLayer(clipC, 'Collage', clipPos); }
  });

  /* ================= la fenêtre ================= */
  let ro = null;
  const w = win('Kaléido', 'kaleido', [root], { w: 1120, h: 780, max: true, cls: 'kdw', ask: () => dirty, onclose: () => { clearInterval(antsTm); clearTimeout(hTm); closeMenu(); if (ro) ro.disconnect(); } });
  setTool('brush'); recentUI(); newDoc(1280, 800, 'white');
  if (window.ResizeObserver) { let lastCw = 0; ro = new ResizeObserver(() => { const cw = scroller.clientWidth; if (!userZoom && cw && cw !== lastCw) fit(); lastCw = cw; }); ro.observe(scroller); }
  fit(); dirty = false;
  if (openBlob) openFile(openBlob, false);
  return w;
}
