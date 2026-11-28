'use strict';
/* fx.js — effets vidéo communs à Sormick Tchat (enregistreur) et Konekt (enregistreur + appels vidéo).
   Tout se fait dans le navigateur : aucun modèle, aucun service externe, aucune image téléchargée.
   • FONDS : une vingtaine de décors dessinés par le code (dégradés, aurore, ciel étoilé, montagnes, plage, forêt, ville, bureau, bibliothèque, studio…),
     deux niveaux de flou de votre vrai décor, ou « Mon image » (une photo de votre appareil).
   • DÉTECTION DE LA PERSONNE sans intelligence artificielle : le mur derrière vous est reconnu automatiquement (couleurs des bords de l'image),
     ou « fond uni » (vous cliquez sur le mur), ou « fond capturé » (vous sortez 5 s du cadre). Nettoyage des îlots, comblement des trous, bords adoucis.
   • CADRES PHOTO : une douzaine de cadres dessinés (blanc, polaroïd, doré, bois, néon, pellicule, cœurs, fleurs, fête, étoiles, vintage…) ou « Mon cadre » (PNG transparent).
   • GIF GIPHY (ou de l'appareil) posés sur la vidéo, déplaçables, redimensionnables.
   L'image finale est dessinée dans un canvas : on l'enregistre (captureStream) ou on l'envoie dans un appel (replaceTrack). L'onglet doit rester visible. */

const FX_RNG = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const fxClamp = (v, a, b) => v < a ? a : v > b ? b : v;
const fxLin = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
const fxBlur = (c, W, H, px, fn) => {   // dessine fn() puis le recopie flou (profondeur de champ) ; sans filtre canvas : net
  const o = document.createElement('canvas'); o.width = W; o.height = H; fn(o.getContext('2d'), W, H);
  if ('filter' in c) { c.filter = 'blur(' + px + 'px)'; c.drawImage(o, -px * 2, -px * 2, W + px * 4, H + px * 4); c.filter = 'none'; } else c.drawImage(o, 0, 0);
};
const fxStars = (c, W, H, n, seed, maxY) => { const r = FX_RNG(seed); for (let i = 0; i < n; i++) { const x = r() * W, y = r() * H * (maxY || 1), s = (0.4 + r() * 1.4) * W / 640; c.globalAlpha = 0.35 + r() * 0.65; c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, s, 0, 7); c.fill(); } c.globalAlpha = 1; };
const fxRidge = (c, W, H, base, amp, seed, col, rough) => { const r = FX_RNG(seed); const pts = [[0, base]]; const n = 9; for (let i = 1; i < n; i++) pts.push([W * i / n, base - r() * amp]); pts.push([W, base - r() * amp * 0.5]); c.fillStyle = col; c.beginPath(); c.moveTo(0, H); c.lineTo(0, pts[0][1]); for (let i = 1; i < pts.length; i++) { const p = pts[i - 1], q = pts[i]; c.quadraticCurveTo(p[0] + (q[0] - p[0]) * 0.5, Math.min(p[1], q[1]) - (rough || 0.1) * amp * r(), q[0], q[1]); } c.lineTo(W, H); c.closePath(); c.fill(); };
const fxGlow = (c, x, y, rad, col) => { const g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2); };

/* ---- fonds : [id, libellé, dessin(c, W, H)] ---- */
const FX_BG = [
  ['night', 'Bleu nuit', (c, W, H) => { c.fillStyle = fxLin(c, 0, 0, W, H, [[0, '#0f2027'], [0.5, '#203a63'], [1, '#2c5364']]); c.fillRect(0, 0, W, H); }],
  ['sunset', 'Coucher de soleil', (c, W, H) => { c.fillStyle = fxLin(c, 0, 0, 0, H, [[0, '#2b1055'], [0.45, '#d4507a'], [0.8, '#ff9a5a'], [1, '#ffd48a']]); c.fillRect(0, 0, W, H); fxGlow(c, W * 0.5, H * 0.78, W * 0.4, 'rgba(255,230,160,.9)'); c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(W * 0.5, H * 0.78, H * 0.09, 0, 7); c.fill(); }],
  ['aurora', 'Aurore boréale', (c, W, H) => { c.fillStyle = fxLin(c, 0, 0, 0, H, [[0, '#030816'], [1, '#0b2a3a']]); c.fillRect(0, 0, W, H); fxStars(c, W, H, 90, 7, 0.7); c.globalCompositeOperation = 'lighter';
    [['#2dffb0', 0.34, 0.2], ['#6b6bff', 0.46, 0.16], ['#b25bff', 0.55, 0.12]].forEach(([col, y0, a], k) => { const g = fxLin(c, 0, H * (y0 - 0.25), 0, H * (y0 + 0.3), [[0, 'rgba(0,0,0,0)'], [0.5, col + 'bb'], [1, 'rgba(0,0,0,0)']]); c.fillStyle = g; c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= W; x += W / 40) c.lineTo(x, H * y0 + Math.sin(x / W * 6 + k * 1.7) * H * a * 0.5 + Math.sin(x / W * 13 + k) * H * 0.02); c.lineTo(W, H); c.closePath(); c.fill(); }); c.globalCompositeOperation = 'source-over'; }],
  ['ocean', 'Océan', (c, W, H) => { c.fillStyle = fxLin(c, 0, 0, 0, H, [[0, '#bfe9ff'], [0.45, '#3aa0d8'], [1, '#08305e']]); c.fillRect(0, 0, W, H); c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = Math.max(1, H / 140); for (let k = 0; k < 14; k++) { c.beginPath(); const y = H * (0.3 + k * 0.05); for (let x = 0; x <= W; x += W / 50) c.lineTo(x, y + Math.sin(x / W * 14 + k) * H * 0.012); c.stroke(); } fxGlow(c, W * 0.2, H * 0.12, W * 0.3, 'rgba(255,255,255,.55)'); }],
  ['lavender', 'Lavande', (c, W, H) => { c.fillStyle = fxLin(c, 0, 0, W, H, [[0, '#a18cd1'], [1, '#fbc2eb']]); c.fillRect(0, 0, W, H); const r = FX_RNG(11); for (let i = 0; i < 9; i++) fxGlow(c, r() * W, r() * H, W * (0.12 + r() * 0.18), 'rgba(255,255,255,.35)'); }],
  ['bokeh', 'Lumières floues', (c, W, H) => { c.fillStyle = fxLin(c, 0, 0, W, H, [[0, '#0d1224'], [1, '#2a1740']]); c.fillRect(0, 0, W, H); const r = FX_RNG(5); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 46; i++) { const x = r() * W, y = r() * H, rad = (0.025 + r() * 0.07) * W, h = Math.round(r() * 360); const g = c.createRadialGradient(x, y, rad * 0.55, x, y, rad); g.addColorStop(0, 'hsla(' + h + ',90%,65%,' + (0.18 + r() * 0.3) + ')'); g.addColorStop(0.9, 'hsla(' + h + ',90%,65%,' + (0.25 + r() * 0.3) + ')'); g.addColorStop(1, 'hsla(' + h + ',90%,65%,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill(); } c.globalCompositeOperation = 'source-over'; }],
  ['starry', 'Ciel étoilé', (c, W, H) => { c.fillStyle = fxLin(c, 0, 0, 0, H, [[0, '#020617'], [0.6, '#16164a'], [1, '#3b2a6b']]); c.fillRect(0, 0, W, H); fxStars(c, W, H, 220, 3); fxGlow(c, W * 0.8, H * 0.2, W * 0.16, 'rgba(255,248,200,.7)'); c.fillStyle = '#fff6cf'; c.beginPath(); c.arc(W * 0.8, H * 0.2, H * 0.07, 0, 7); c.fill(); c.fillStyle = '#16164a'; c.beginPath(); c.arc(W * 0.8 + H * 0.03, H * 0.2 - H * 0.015, H * 0.062, 0, 7); c.fill(); }],
  ['mountain', 'Montagnes', (c, W, H) => { c.fillStyle = fxLin(c, 0, 0, 0, H, [[0, '#3a4a8c'], [0.5, '#e98f8f'], [0.78, '#ffd3a3']]); c.fillRect(0, 0, W, H); fxGlow(c, W * 0.7, H * 0.55, W * 0.3, 'rgba(255,240,200,.8)'); c.fillStyle = '#fff1cf'; c.beginPath(); c.arc(W * 0.7, H * 0.55, H * 0.07, 0, 7); c.fill();
    [['#8d6a9f', 0.62, 0.3, 21], ['#6b4f86', 0.72, 0.3, 22], ['#4a3868', 0.82, 0.3, 23], ['#2a2243', 0.95, 0.3, 24]].forEach(([col, b, a, s]) => fxRidge(c, W, H, H * b, H * a, s, col, 0.25)); c.fillStyle = fxLin(c, 0, H * 0.55, 0, H, [[0, 'rgba(255,220,200,0)'], [1, 'rgba(255,220,200,.25)']]); c.fillRect(0, H * 0.55, W, H * 0.45); }],
  ['beach', 'Plage', (c, W, H) => { c.fillStyle = fxLin(c, 0, 0, 0, H * 0.55, [[0, '#4facfe'], [1, '#d6f1ff']]); c.fillRect(0, 0, W, H); fxGlow(c, W * 0.78, H * 0.18, W * 0.2, 'rgba(255,255,220,.9)'); c.fillStyle = '#fff7c2'; c.beginPath(); c.arc(W * 0.78, H * 0.18, H * 0.07, 0, 7); c.fill();
    c.fillStyle = fxLin(c, 0, H * 0.5, 0, H * 0.72, [[0, '#7fd8e6'], [1, '#1f8fb5']]); c.fillRect(0, H * 0.5, W, H * 0.25); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = Math.max(1, H / 120); for (let k = 0; k < 4; k++) { c.beginPath(); for (let x = 0; x <= W; x += W / 40) c.lineTo(x, H * (0.6 + k * 0.035) + Math.sin(x / W * 12 + k) * H * 0.008); c.stroke(); }
    c.fillStyle = fxLin(c, 0, H * 0.68, 0, H, [[0, '#f3dfa8'], [1, '#d9b877']]); c.beginPath(); c.moveTo(0, H); c.lineTo(0, H * 0.78); c.quadraticCurveTo(W * 0.5, H * 0.66, W, H * 0.8); c.lineTo(W, H); c.closePath(); c.fill(); }],
  ['forest', 'Forêt', (c, W, H) => { c.fillStyle = fxLin(c, 0, 0, 0, H, [[0, '#d9eedd'], [0.6, '#8fbf9d'], [1, '#2f5d46']]); c.fillRect(0, 0, W, H);
    [['#9cc9a8', 0.62, 0.07, 31], ['#6ea786', 0.74, 0.1, 32], ['#3f7a5c', 0.86, 0.13, 33], ['#1f4a38', 1.02, 0.17, 34]].forEach(([col, base, sz, seed]) => { const r = FX_RNG(seed); c.fillStyle = col; const step = W * sz * 0.55; for (let x = -step; x < W + step; x += step * (0.7 + r() * 0.6)) { const h = H * sz * (2.2 + r() * 1.6), w = H * sz * 1.1; const y = H * base; c.beginPath(); c.moveTo(x, y - h); c.lineTo(x + w / 2, y); c.lineTo(x - w / 2, y); c.fill(); c.fillRect(x - w * 0.06, y - 2, w * 0.12, H * 0.05); } c.fillRect(0, H * base, W, H); }); }],
  ['city', 'Ville de nuit', (c, W, H) => { c.fillStyle = fxLin(c, 0, 0, 0, H, [[0, '#0f0c29'], [0.6, '#302b63'], [1, '#6b3f7f']]); c.fillRect(0, 0, W, H); fxStars(c, W, H, 60, 9, 0.5);
    [['#1a1633', 0.55, 0.3, 41, 1], ['#120f26', 0.7, 0.42, 42, 1]].forEach(([col, top, hh, seed]) => { const r = FX_RNG(seed); let x = 0; while (x < W) { const w = W * (0.04 + r() * 0.06), h = H * (top === 0.55 ? 0.15 + r() * hh : 0.1 + r() * 0.3); const y = H - h - (top === 0.55 ? H * 0.12 : 0); c.fillStyle = col; c.fillRect(x, y, w, H); const cs = W * 0.008; for (let wy = y + cs * 2; wy < H - cs * 3; wy += cs * 2.6) for (let wx = x + cs; wx < x + w - cs * 1.5; wx += cs * 2.2) if (r() < 0.38) { c.fillStyle = r() < 0.8 ? '#ffd877' : '#8fd3ff'; c.globalAlpha = 0.55 + r() * 0.4; c.fillRect(wx, wy, cs, cs * 1.3); c.globalAlpha = 1; } x += w + W * 0.004; } }); }],
  ['office', 'Bureau lumineux', (c, W, H) => fxBlur(c, W, H, Math.max(2, W / 150), (g) => { g.fillStyle = fxLin(g, 0, 0, W, 0, [[0, '#efe5d6'], [1, '#d9ccb9']]); g.fillRect(0, 0, W, H); g.fillStyle = fxLin(g, 0, H * 0.82, 0, H, [[0, '#a98a62'], [1, '#7a5f3d']]); g.fillRect(0, H * 0.82, W, H * 0.18);
    const wx = W * 0.07, wy = H * 0.1, ww = W * 0.3, wh = H * 0.55; g.fillStyle = '#fff'; g.fillRect(wx - 8, wy - 8, ww + 16, wh + 16); g.fillStyle = fxLin(g, 0, wy, 0, wy + wh, [[0, '#9ad1ff'], [1, '#e8f6ff']]); g.fillRect(wx, wy, ww, wh); g.fillStyle = '#fff'; g.fillRect(wx + ww / 2 - 3, wy, 6, wh); g.fillRect(wx, wy + wh / 2 - 3, ww, 6); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(wx + ww * 0.3, wy + wh * 0.3, ww * 0.18, wh * 0.08, 0, 0, 7); g.fill();
    const sx = W * 0.62, sy = H * 0.3; g.fillStyle = '#8c6a46'; g.fillRect(sx, sy, W * 0.32, H * 0.025); g.fillRect(sx, sy + H * 0.2, W * 0.32, H * 0.025); const r = FX_RNG(51); let bx = sx + 4; while (bx < sx + W * 0.3) { const bw = W * (0.012 + r() * 0.012), bh = H * (0.09 + r() * 0.09); g.fillStyle = 'hsl(' + Math.round(r() * 360) + ',45%,' + (45 + Math.round(r() * 15)) + '%)'; g.fillRect(bx, sy - bh, bw, bh); bx += bw + 1; }
    g.fillStyle = '#6b8f5b'; for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(W * 0.55 + (i - 3) * W * 0.012, H * 0.66 - Math.abs(i - 3) * H * 0.01 - H * 0.08, W * 0.012, H * 0.09, (i - 3) * 0.35, 0, 7); g.fill(); } g.fillStyle = '#b86f50'; g.fillRect(W * 0.53, H * 0.68, W * 0.05, H * 0.14); })],
  ['library', 'Bibliothèque', (c, W, H) => fxBlur(c, W, H, Math.max(2, W / 170), (g) => { g.fillStyle = '#5a3d27'; g.fillRect(0, 0, W, H); const rows = 4, rh = H / rows; for (let k = 0; k < rows; k++) { const r = FX_RNG(60 + k); let x = W * 0.02; while (x < W * 0.98) { const bw = W * (0.014 + r() * 0.02), bh = rh * (0.55 + r() * 0.35); g.fillStyle = 'hsl(' + Math.round(r() * 360) + ',' + (35 + Math.round(r() * 30)) + '%,' + (28 + Math.round(r() * 24)) + '%)'; g.fillRect(x, (k + 1) * rh - bh - rh * 0.06, bw, bh); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + bw * 0.15, (k + 1) * rh - bh - rh * 0.06 + bh * 0.1, bw * 0.12, bh * 0.8); x += bw + 1; } g.fillStyle = fxLin(g, 0, (k + 1) * rh - rh * 0.07, 0, (k + 1) * rh, [[0, '#8b5e3c'], [1, '#3e2a1a']]); g.fillRect(0, (k + 1) * rh - rh * 0.07, W, rh * 0.07); } g.fillStyle = fxLin(g, 0, 0, W, 0, [[0, 'rgba(0,0,0,.35)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.35)']]); g.fillRect(0, 0, W, H); })],
  ['brick', 'Mur de briques', (c, W, H) => fxBlur(c, W, H, Math.max(1, W / 280), (g) => { g.fillStyle = '#8a5a4a'; g.fillRect(0, 0, W, H); const bh = H / 14, bw = bh * 2.6, r = FX_RNG(70); for (let y = 0, k = 0; y < H; y += bh, k++) for (let x = -(k % 2) * bw / 2; x < W; x += bw) { g.fillStyle = 'hsl(' + (8 + Math.round(r() * 14)) + ',' + (38 + Math.round(r() * 14)) + '%,' + (36 + Math.round(r() * 14)) + '%)'; g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3); } g.fillStyle = fxLin(g, 0, 0, 0, H, [[0, 'rgba(255,230,190,.2)'], [1, 'rgba(0,0,0,.35)']]); g.fillRect(0, 0, W, H); })],
  ['studio', 'Studio', (c, W, H) => { const g = c.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.7); g.addColorStop(0, '#9aa3b2'); g.addColorStop(1, '#10151f'); c.fillStyle = g; c.fillRect(0, 0, W, H); }],
  ['white', 'Blanc', (c, W, H) => { c.fillStyle = fxLin(c, 0, 0, 0, H, [[0, '#ffffff'], [1, '#e6eaf0']]); c.fillRect(0, 0, W, H); }],
  ['black', 'Noir', (c, W, H) => { c.fillStyle = '#05070b'; c.fillRect(0, 0, W, H); }],
  ['green', 'Vert uni', (c, W, H) => { c.fillStyle = '#16a34a'; c.fillRect(0, 0, W, H); }]
];

/* ---- cadres : dessinés par-dessus l'image ---- */
const fxHeart = (c, x, y, s) => { c.beginPath(); c.moveTo(x, y + s * 0.3); c.bezierCurveTo(x, y - s * 0.2, x - s, y - s * 0.2, x - s, y + s * 0.35); c.bezierCurveTo(x - s, y + s * 0.8, x, y + s * 1.0, x, y + s * 1.2); c.bezierCurveTo(x, y + s * 1.0, x + s, y + s * 0.8, x + s, y + s * 0.35); c.bezierCurveTo(x + s, y - s * 0.2, x, y - s * 0.2, x, y + s * 0.3); c.fill(); };
const fxStar5 = (c, x, y, R) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.45 : R; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); c.fill(); };
const fxRing = (c, W, H, t, r) => { c.beginPath(); c.rect(0, 0, W, H); const x = t, y = t, w = W - 2 * t, h = H - 2 * t; if (r) { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); } else c.rect(x, y, w, h); };
const fxAlong = (W, H, t, step, fn) => { const per = 2 * (W + H - 4 * t); let i = 0; for (let d = 0; d < per; d += step, i++) { let x, y; const a = W - 2 * t, b = H - 2 * t; if (d < a) { x = t + d; y = t / 2; } else if (d < a + b) { x = W - t / 2; y = t + (d - a); } else if (d < 2 * a + b) { x = W - t - (d - a - b); y = H - t / 2; } else { x = t / 2; y = H - t - (d - 2 * a - b); } fn(x, y, i); } };
const FX_FRAMES = [
  ['white', 'Cadre blanc', (c, W, H) => { const t = Math.min(W, H) * 0.05; c.fillStyle = '#fff'; fxRing(c, W, H, t); c.fill('evenodd'); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; c.strokeRect(t, t, W - 2 * t, H - 2 * t); }],
  ['polaroid', 'Polaroïd', (c, W, H) => { const t = Math.min(W, H) * 0.045, b = H * 0.17; c.fillStyle = '#fbfaf5'; c.beginPath(); c.rect(0, 0, W, H); c.rect(t, t, W - 2 * t, H - t - b); c.fill('evenodd'); c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 2; c.strokeRect(t, t, W - 2 * t, H - t - b); c.strokeStyle = 'rgba(0,0,0,.18)'; c.strokeRect(1, 1, W - 2, H - 2); }],
  ['gold', 'Cadre doré', (c, W, H) => { const t = Math.min(W, H) * 0.07; c.fillStyle = fxLin(c, 0, 0, W, H, [[0, '#fff2a8'], [0.25, '#d4a017'], [0.5, '#fff0a0'], [0.75, '#b8860b'], [1, '#f6d365']]); fxRing(c, W, H, t); c.fill('evenodd'); c.strokeStyle = '#6b4a05'; c.lineWidth = 2; c.strokeRect(1, 1, W - 2, H - 2); c.strokeRect(t, t, W - 2 * t, H - 2 * t); c.strokeStyle = 'rgba(255,255,255,.65)'; c.lineWidth = 2; c.strokeRect(t * 0.5, t * 0.5, W - t, H - t); c.fillStyle = '#7a5206'; [[t / 2, t / 2], [W - t / 2, t / 2], [t / 2, H - t / 2], [W - t / 2, H - t / 2]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, t * 0.22, 0, 7); c.fill(); }); }],
  ['wood', 'Cadre en bois', (c, W, H) => { const t = Math.min(W, H) * 0.07; c.save(); c.fillStyle = fxLin(c, 0, 0, W, H, [[0, '#a8743f'], [0.5, '#7b4d24'], [1, '#9b6a3a']]); fxRing(c, W, H, t); c.fill('evenodd'); c.clip('evenodd'); const r = FX_RNG(8); c.strokeStyle = 'rgba(60,30,10,.35)'; c.lineWidth = 1.2; for (let i = 0; i < 90; i++) { const y = r() * H; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(W * 0.3, y + (r() - 0.5) * 10, W * 0.7, y + (r() - 0.5) * 10, W, y + (r() - 0.5) * 8); c.stroke(); } for (let i = 0; i < 60; i++) { const x = r() * W; c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + (r() - 0.5) * 8, H * 0.3, x + (r() - 0.5) * 8, H * 0.7, x, H); c.stroke(); } c.restore(); c.strokeStyle = 'rgba(255,230,190,.5)'; c.lineWidth = 2; c.strokeRect(2, 2, W - 4, H - 4); c.strokeStyle = 'rgba(0,0,0,.5)'; c.strokeRect(t, t, W - 2 * t, H - 2 * t); }],
  ['neonpink', 'Néon rose', (c, W, H) => { const t = Math.min(W, H) * 0.035; c.save(); c.shadowColor = '#ff2fa8'; c.shadowBlur = t * 2.2; c.strokeStyle = '#ffd6f0'; c.lineWidth = t * 0.45; c.beginPath(); c.roundRect ? c.roundRect(t, t, W - 2 * t, H - 2 * t, t * 2) : c.rect(t, t, W - 2 * t, H - 2 * t); c.stroke(); c.shadowBlur = t * 4; c.strokeStyle = '#ff2fa8'; c.lineWidth = t * 0.25; c.stroke(); c.restore(); }],
  ['neonblue', 'Néon bleu', (c, W, H) => { const t = Math.min(W, H) * 0.035; c.save(); c.shadowColor = '#22d3ee'; c.shadowBlur = t * 2.2; c.strokeStyle = '#d8fbff'; c.lineWidth = t * 0.45; c.beginPath(); c.roundRect ? c.roundRect(t, t, W - 2 * t, H - 2 * t, t * 2) : c.rect(t, t, W - 2 * t, H - 2 * t); c.stroke(); c.shadowBlur = t * 4; c.strokeStyle = '#22d3ee'; c.lineWidth = t * 0.25; c.stroke(); c.restore(); }],
  ['film', 'Pellicule', (c, W, H) => { const bh = H * 0.11; c.fillStyle = '#0b0b0b'; c.fillRect(0, 0, W, bh); c.fillRect(0, H - bh, W, bh); c.fillRect(0, 0, W * 0.018, H); c.fillRect(W - W * 0.018, 0, W * 0.018, H); c.fillStyle = '#f2f2f2'; const hw = bh * 0.38, hh = bh * 0.42, gap = hw * 1.9; for (let x = gap / 2; x < W; x += gap) for (const y of [bh * 0.29, H - bh * 0.71]) { c.beginPath(); c.roundRect ? c.roundRect(x, y, hw, hh, 3) : c.rect(x, y, hw, hh); c.fill(); } }],
  ['hearts', 'Cœurs', (c, W, H) => { const t = Math.min(W, H) * 0.075; c.fillStyle = 'rgba(255,170,200,.55)'; fxRing(c, W, H, t); c.fill('evenodd'); const r = FX_RNG(13); fxAlong(W, H, t, t * 0.95, (x, y, i) => { c.fillStyle = ['#ff3d7f', '#ff7aa8', '#e11d48', '#ffb3cd'][i % 4]; fxHeart(c, x, y - t * 0.3, t * (0.28 + r() * 0.18)); }); }],
  ['flowers', 'Fleurs', (c, W, H) => { const t = Math.min(W, H) * 0.085; c.fillStyle = 'rgba(120,190,120,.5)'; fxRing(c, W, H, t * 0.85); c.fill('evenodd'); const r = FX_RNG(17); const flower = (x, y, R, col) => { c.fillStyle = col; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; c.beginPath(); c.arc(x + Math.cos(a) * R * 0.62, y + Math.sin(a) * R * 0.62, R * 0.46, 0, 7); c.fill(); } c.fillStyle = '#ffd43b'; c.beginPath(); c.arc(x, y, R * 0.34, 0, 7); c.fill(); }; fxAlong(W, H, t, t * 0.9, (x, y, i) => flower(x, y, t * (0.26 + r() * 0.14), ['#ff8fab', '#fff', '#ffc2d1', '#ffe066', '#b79cff'][i % 5])); [[t, t], [W - t, t], [t, H - t], [W - t, H - t]].forEach(([x, y], k) => flower(x, y, t * 0.62, ['#ff6b9d', '#ffb703', '#ff6b9d', '#ffb703'][k])); }],
  ['party', 'Fête', (c, W, H) => { const t = Math.min(W, H) * 0.09, r = FX_RNG(21); const cols = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c']; for (let i = 0; i < 230; i++) { const side = r(); let x, y; if (side < 0.3) { x = r() * W; y = r() * t; } else if (side < 0.6) { x = r() * W; y = H - r() * t; } else if (side < 0.8) { x = r() * t; y = r() * H; } else { x = W - r() * t; y = r() * H; } c.save(); c.translate(x, y); c.rotate(r() * 7); c.fillStyle = cols[i % cols.length]; if (r() < 0.5) c.fillRect(-t * 0.08, -t * 0.04, t * 0.16, t * 0.08); else { c.beginPath(); c.arc(0, 0, t * 0.06, 0, 7); c.fill(); } c.restore(); } c.lineWidth = Math.max(2, t * 0.06); for (let k = 0; k < 6; k++) { c.strokeStyle = cols[k]; c.beginPath(); const x0 = r() * W; c.moveTo(x0, 0); c.bezierCurveTo(x0 + t, t * 0.6, x0 - t, t, x0 + t * 0.4, t * 1.3); c.stroke(); } }],
  ['stars', 'Étoiles', (c, W, H) => { const t = Math.min(W, H) * 0.08; c.fillStyle = 'rgba(20,24,64,.72)'; fxRing(c, W, H, t); c.fill('evenodd'); const r = FX_RNG(25); fxAlong(W, H, t, t * 0.8, (x, y, i) => { c.fillStyle = i % 3 ? '#ffd43b' : '#fff7c2'; fxStar5(c, x, y, t * (0.2 + r() * 0.16)); }); }],
  ['vintage', 'Vintage', (c, W, H) => { c.fillStyle = 'rgba(112,66,20,.2)'; c.fillRect(0, 0, W, H); const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(30,15,0,.6)'); c.fillStyle = g; c.fillRect(0, 0, W, H); const t = Math.min(W, H) * 0.045; c.fillStyle = '#f1e6cc'; fxRing(c, W, H, t); c.fill('evenodd'); c.strokeStyle = 'rgba(112,66,20,.7)'; c.setLineDash([6, 5]); c.lineWidth = 2; c.strokeRect(t * 0.45, t * 0.45, W - t * 0.9, H - t * 0.9); c.setLineDash([]); }],
  ['round', 'Coins arrondis', (c, W, H) => { const t = Math.min(W, H) * 0.03, rr = Math.min(W, H) * 0.09; c.fillStyle = '#0b1220'; fxRing(c, W, H, t, rr); c.fill('evenodd'); c.strokeStyle = '#fff'; c.lineWidth = Math.max(2, t * 0.18); c.beginPath(); c.roundRect ? c.roundRect(t, t, W - 2 * t, H - 2 * t, rr) : c.rect(t, t, W - 2 * t, H - 2 * t); c.stroke(); }]
];

function fxCreate(o = {}) {
  const E = { enabled: false, bg: 'none', frame: 'none', mode: 'auto', tol: 60, soft: 50, key: [], ref: null, refY: null, refB: null, refR: null, st: [], sel: null, src: o.video || null, running: false, raf: 0, tm: 0, last: 0, n: 0, sw: 0, sh: 0, pal: null, imgBmp: null, frameBmp: null, cap: 0, onchange: null, ready: false, hasMask: false };
  E.cv = el('canvas', { className: 'crec-cv', 'aria-label': 'Aperçu avec effets' }); E.ovl = el('div', { className: 'crec-ovl' }); E.stage = el('div', { className: 'crec-stage', hidden: true }, E.cv, E.ovl);
  const cx = E.cv.getContext('2d'), sm = document.createElement('canvas'), smx = sm.getContext('2d', { willReadFrequently: true }), mk = document.createElement('canvas'), mkx = mk.getContext('2d'), pc = document.createElement('canvas'), pcx = pc.getContext('2d');
  let mask = null, FY = null, FB = null, FR = null, bin = null, lab = null, stk = null, tmpA = null, tmpB = null, sd = null;
  const bgCache = new Map(), frCache = new Map();
  /* réglages mémorisés dans le profil chiffré (D.fx) : fond, cadre, détection, sensibilité ; jamais les images perso ni les GIF */
  const fxLoad = () => { const f = (typeof D !== 'undefined' && D && D.fx) || {}; if (FX_BG.some(b => b[0] === f.bg) || f.bg === 'blur1' || f.bg === 'blur2') E.bg = f.bg; if (FX_FRAMES.some(b => b[0] === f.frame)) E.frame = f.frame; if (['auto', 'key', 'cap'].includes(f.mode)) E.mode = f.mode; if (f.tol >= 10) E.tol = f.tol; if (f.soft >= 0) E.soft = f.soft; E._wantOn = f.on === true; };
  const fxSave = () => { if (typeof D === 'undefined' || !D || !D.fx || E._loading) return; const n = { on: E.enabled, bg: E.bg === 'img' ? D.fx.bg : E.bg, frame: E.frame === 'mine' ? D.fx.frame : E.frame, mode: E.mode, tol: Math.round(E.tol), soft: Math.round(E.soft) }; if (JSON.stringify(n) === JSON.stringify(D.fx)) return; D.fx = n; save(); };
  E.save = fxSave; fxLoad();
  E.active = () => E.enabled && (E.bg !== 'none' || E.frame !== 'none' || E.st.length > 0);
  const changed = () => { fxSave(); if (E.onchange) E.onchange(E); };

  /* ---------- dimensions ---------- */
  const sizeSmall = () => {
    const W = E.cv.width, H = E.cv.height; E.sw = 224; E.sh = Math.max(2, Math.round(224 * H / W)); sm.width = mk.width = E.sw; sm.height = mk.height = E.sh; const n = E.sw * E.sh;
    mask = new Float32Array(n); FY = new Float32Array(n); FB = new Float32Array(n); FR = new Float32Array(n); bin = new Uint8Array(n); lab = new Int32Array(n); stk = new Int32Array(n); tmpA = new Float32Array(n); tmpB = new Float32Array(n);
    pc.width = W; pc.height = H; E.pal = null; E.ref = null; E.hasMask = false; bgCache.clear(); frCache.clear();
  };
  E.fitTo = (box) => {
    const fit = () => { if (!E.cv.width || !E.cv.height) return; const bw = box.clientWidth, bh = box.clientHeight; if (!bw || !bh) return; const ar = E.cv.width / E.cv.height; let w = bw, h = bw / ar; if (h > bh) { h = bh; w = bh * ar; } E.stage.style.width = Math.floor(w) + 'px'; E.stage.style.height = Math.floor(h) + 'px'; };
    E.fit = fit; try { new ResizeObserver(fit).observe(box); } catch { /* ancien navigateur */ } fit();
  };

  /* ---------- détection de la personne ---------- */
  const autoPal = () => {
    const sw = E.sw, sh = E.sh, pts = [];
    for (let y = 0; y < sh * 0.16; y++) for (let x = 0; x < sw; x += 2) pts.push(y * sw + x);
    for (let y = Math.floor(sh * 0.16); y < sh; y++) { for (let x = 0; x < sw * 0.09; x += 2) pts.push(y * sw + x); for (let x = Math.floor(sw * 0.91); x < sw; x += 2) pts.push(y * sw + x); }
    const K = 3, dist = (i, c) => 0.5 * Math.abs(FY[i] - c[0]) + Math.abs(FB[i] - c[1]) + Math.abs(FR[i] - c[2]);
    const srt = pts.slice().sort((p, q) => FY[p] - FY[q]), m0 = srt[srt.length >> 1]; let cs = [[FY[m0], FB[m0], FR[m0]]];
    while (cs.length < K) { let bp = 0, bd = -1; for (const p of pts) { let md = 1e9; for (const c of cs) md = Math.min(md, dist(p, c)); if (md > bd) { bd = md; bp = p; } } cs.push([FY[bp], FB[bp], FR[bp]]); }   // centres éloignés les uns des autres
    let as = new Int8Array(pts.length), sp = [20, 20, 20];
    for (let it = 0; it < 6; it++) {
      const sum = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      pts.forEach((i, k) => { let b = 0, bd = 1e9; for (let c = 0; c < K; c++) { const d = dist(i, cs[c]); if (d < bd) { bd = d; b = c; } } as[k] = b; const s = sum[b]; s[0] += FY[i]; s[1] += FB[i]; s[2] += FR[i]; s[3]++; });
      cs = cs.map((c, k) => sum[k][3] ? [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]] : c);
      sp = [0, 1, 2].map(k => { let t = 0, m = 0; pts.forEach((i, q) => { if (as[q] === k) { t += dist(i, cs[k]); m++; } }); return m ? t / m : 20; });
    }
    const cnt = [0, 0, 0]; as.forEach(a => cnt[a]++);
    let pal = cs.map((c, k) => ({ y: c[0], b: c[1], r: c[2], s: Math.min(sp[k], 40), w: cnt[k] / pts.length })).filter(p => p.w >= 0.07);
    if (!pal.length) pal = [{ y: cs[1][0], b: cs[1][1], r: cs[1][2], s: 20, w: 1 }];
    if (E.pal && E.pal.length === pal.length) pal = pal.map((p, k) => { const q = E.pal[k]; return { y: q.y * 0.7 + p.y * 0.3, b: q.b * 0.7 + p.b * 0.3, r: q.r * 0.7 + p.r * 0.3, s: q.s * 0.7 + p.s * 0.3, w: p.w }; });
    return pal;
  };
  /* remplit les composantes connexes de cond(i) ; renvoie le nombre d'étiquettes (tailles dans sizes) */
  const label = (cond, sizes) => {
    const sw = E.sw, sh = E.sh, n = sw * sh; lab.fill(0); let L = 0; sizes.length = 1; sizes[0] = 0;
    for (let s = 0; s < n; s++) { if (lab[s] || !cond(s)) continue; L++; let sp = 0, cnt = 0; stk[sp++] = s; lab[s] = L;
      while (sp) { const i = stk[--sp]; cnt++; const x = i % sw, y = (i - x) / sw; if (x > 0 && !lab[i - 1] && cond(i - 1)) { lab[i - 1] = L; stk[sp++] = i - 1; } if (x < sw - 1 && !lab[i + 1] && cond(i + 1)) { lab[i + 1] = L; stk[sp++] = i + 1; } if (y > 0 && !lab[i - sw] && cond(i - sw)) { lab[i - sw] = L; stk[sp++] = i - sw; } if (y < sh - 1 && !lab[i + sw] && cond(i + sw)) { lab[i + sw] = L; stk[sp++] = i + sw; } }
      sizes[L] = cnt; }
    return L;
  };
  const box = (src, dst) => { const sw = E.sw, sh = E.sh; for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { let a = 0, c = 0; for (let yy = Math.max(0, y - 1); yy <= Math.min(sh - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(sw - 1, x + 1); xx++) { a += src[yy * sw + xx]; c++; } dst[y * sw + x] = a / c; } };
  const sizes = [];
  function segment(v) {
    const sw = E.sw, sh = E.sh, n = sw * sh; smx.drawImage(v, 0, 0, sw, sh); const id = smx.getImageData(0, 0, sw, sh), d = id.data; sd = id; E.sd = id;
    for (let i = 0, j = 0; i < n; i++, j += 4) { const r = d[j], g = d[j + 1], b = d[j + 2], y = 0.299 * r + 0.587 * g + 0.114 * b; FY[i] = y; FB[i] = b - y; FR[i] = r - y; }
    const tolE = E.tol * 0.7 + 4; let pal = null;
    if (E.mode === 'cap') { if (!E.refY) return false; }
    else if (E.mode === 'key') { if (!E.key.length) return false; pal = E.key.map(k => ({ y: k[0], b: k[1], r: k[2], s: 0 })); }
    else { if (!E.pal || E.n % 20 === 0) E.pal = autoPal(); pal = E.pal; }
    const auto = E.mode === 'auto';
    for (let i = 0; i < n; i++) {
      let ratio;
      if (pal) { ratio = 1e9; for (let k = 0; k < pal.length; k++) { const p = pal[k], dd = 0.5 * Math.abs(FY[i] - p.y) + Math.abs(FB[i] - p.b) + Math.abs(FR[i] - p.r), q = dd / (p.s * 2.2 + tolE); if (q < ratio) ratio = q; } }
      else ratio = (0.5 * Math.abs(FY[i] - E.refY[i]) + Math.abs(FB[i] - E.refB[i]) + Math.abs(FR[i] - E.refR[i])) / tolE;
      if (auto) { const x = (i % sw) / sw - 0.5, y = Math.floor(i / sw) / sh - 0.62, inside = (x * x) / 0.19 + (y * y) / 0.4 < 1; ratio *= inside ? 1.18 : 0.88; }   // la personne est le plus souvent au centre
      tmpA[i] = fxClamp((ratio - 1) / 0.6 + 0.5, 0, 1); bin[i] = tmpA[i] > 0.5 ? 1 : 0;
    }
    /* 1) on ne garde que la grande forme (+ les formes assez grandes) 2) on comble les petits trous */
    let L = label(i => bin[i] === 1, sizes), big = 0; for (let k = 1; k <= L; k++) if (sizes[k] > big) big = sizes[k];
    const keep = sizes.map(s => s >= Math.max(big * 0.18, n * 0.004));
    for (let i = 0; i < n; i++) bin[i] = bin[i] && keep[lab[i]] ? 1 : 0;
    L = label(i => bin[i] === 0, sizes); const sw1 = sw - 1, onEdge = new Uint8Array(L + 1);
    for (let x = 0; x < sw; x++) { onEdge[lab[x]] = 1; onEdge[lab[(sh - 1) * sw + x]] = 1; } for (let y = 0; y < sh; y++) { onEdge[lab[y * sw]] = 1; onEdge[lab[y * sw + sw1]] = 1; }
    for (let i = 0; i < n; i++) if (!bin[i] && !onEdge[lab[i]] && sizes[lab[i]] < n * 0.05) bin[i] = 1;
    for (let i = 0; i < n; i++) tmpA[i] = bin[i]; box(tmpA, tmpB); box(tmpB, tmpA);
    for (let i = 0; i < n; i++) mask[i] = mask[i] * 0.45 + fxClamp((tmpA[i] - 0.5) * 2.2 + 0.5, 0, 1) * 0.55;   // lissage dans le temps : pas de scintillement
    const out = mkx.createImageData(sw, sh), od = out.data; for (let i = 0, j = 0; i < n; i++, j += 4) { od[j] = od[j + 1] = od[j + 2] = 255; od[j + 3] = Math.round(mask[i] * 255); }
    mkx.putImageData(out, 0, 0); E.hasMask = true; return true;
  }

  /* ---------- fonds / cadres (mis en cache à la taille de l'image) ---------- */
  const cached = (map, key, W, H, draw) => { const k = key + '|' + W + 'x' + H; let c = map.get(k); if (!c) { c = document.createElement('canvas'); c.width = W; c.height = H; draw(c.getContext('2d'), W, H); map.set(k, c); if (map.size > 12) map.delete(map.keys().next().value); } return c; };
  const drawImgCover = (c, b, W, H) => { const sc = Math.max(W / b.width, H / b.height), bw = b.width * sc, bh = b.height * sc; c.drawImage(b, (W - bw) / 2, (H - bh) / 2, bw, bh); };
  function drawBg(v, W, H) {
    if (E.bg === 'blur1' || E.bg === 'blur2') { const px = Math.round(W / (E.bg === 'blur1' ? 70 : 26)); if ('filter' in cx) { cx.filter = 'blur(' + px + 'px)'; cx.drawImage(v, -px * 2, -px * 2, W + px * 4, H + px * 4); cx.filter = 'none'; } else { cx.drawImage(v, 0, 0, W, H); cx.fillStyle = 'rgba(0,0,0,.35)'; cx.fillRect(0, 0, W, H); } return; }
    if (E.bg === 'img' && E.imgBmp) { cx.drawImage(cached(bgCache, 'img' + (E.imgId || 0), W, H, (c) => drawImgCover(c, E.imgBmp, W, H)), 0, 0); return; }
    const def = FX_BG.find(b => b[0] === E.bg) || FX_BG[0]; cx.drawImage(cached(bgCache, def[0], W, H, def[2]), 0, 0);
  }
  function drawFrame(W, H) {
    if (E.frame === 'none') return;
    if (E.frame === 'mine') { if (E.frameBmp) cx.drawImage(E.frameBmp, 0, 0, W, H); return; }
    const def = FX_FRAMES.find(f => f[0] === E.frame); if (def) cx.drawImage(cached(frCache, def[0], W, H, def[2]), 0, 0);
  }
  function drawStickers(W, H, now) {
    for (const k of E.st) {
      const tot = k.frames.reduce((a, f) => a + f.d, 0); let t = tot > 0 ? (now - k.t0) % tot : 0, fr = k.frames[0];
      for (const f of k.frames) { if (t < f.d) { fr = f; break; } t -= f.d; }
      const w = k.s * W, h = w * fr.bmp.height / fr.bmp.width; cx.drawImage(fr.bmp, k.x * W - w / 2, k.y * H - h / 2, w, h);
    }
  }

  /* ---------- boucle ---------- */
  function frame(now) {
    const v = E.src; if (!v || v.readyState < 2 || !v.videoWidth) return false;
    if (E.cv.width !== v.videoWidth || E.cv.height !== v.videoHeight || !mask) { E.cv.width = v.videoWidth; E.cv.height = v.videoHeight; sizeSmall(); if (E.fit) E.fit(); }
    const W = E.cv.width, H = E.cv.height; E.n++;
    if (E.bg !== 'none' && segment(v)) {
      const bl = Math.max(1, Math.round(W / 260 * (0.4 + E.soft / 50)));
      pcx.globalCompositeOperation = 'copy'; if ('filter' in pcx) pcx.filter = 'blur(' + bl + 'px)'; pcx.drawImage(mk, 0, 0, W, H); if ('filter' in pcx) pcx.filter = 'none';
      pcx.globalCompositeOperation = 'source-in'; pcx.drawImage(v, 0, 0, W, H); pcx.globalCompositeOperation = 'source-over';
      drawBg(v, W, H); cx.drawImage(pc, 0, 0);
    } else cx.drawImage(v, 0, 0, W, H);
    drawFrame(W, H); drawStickers(W, H, now); E.ready = true; return true;
  }
  E.render = () => frame(performance.now());
  E.run = () => {
    if (E.running) return; E.running = true;
    const loop = now => { if (!E.running) return; E.raf = requestAnimationFrame(loop); if (now - E.last < 14) return; E.last = now; frame(now); };
    E.raf = requestAnimationFrame(loop);
    E.tm = setInterval(() => { if (document.hidden && E.running) { const now = performance.now(); if (now - E.last > 30) { E.last = now; frame(now); } } }, 60);   // onglet masqué : le canvas continue (image ralentie par le navigateur)
  };
  E.halt = () => { E.running = false; cancelAnimationFrame(E.raf); clearInterval(E.tm); };
  E.setSrc = v => { E.src = v; E.ready = false; E.pal = null; E.ref = null; };
  E.track = (fps) => { if (!E._tr || E._tr.readyState === 'ended') E._tr = E.cv.captureStream(fps || 24).getVideoTracks()[0]; return E._tr; };
  E.snap = (type, q) => new Promise(res => { frame(performance.now()); E.cv.toBlob(b => res(b), type || 'image/jpeg', q || 0.92); });
  E.dispose = () => { E.halt(); E.st.forEach(k => URL.revokeObjectURL(k.url)); E.st.length = 0; if (E._tr) { try { E._tr.stop(); } catch { /* déjà arrêté */ } } bgCache.clear(); frCache.clear(); };

  /* ---------- sélection de la couleur du fond / capture ---------- */
  E.cv.onclick = e => {
    if (E.mode !== 'key' || !sd) return; const r = E.cv.getBoundingClientRect(), x = Math.round((e.clientX - r.left) / r.width * (E.sw - 1)), y = Math.round((e.clientY - r.top) / r.height * (E.sh - 1)); let a = [0, 0, 0], c = 0;
    for (let yy = Math.max(0, y - 2); yy <= Math.min(E.sh - 1, y + 2); yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(E.sw - 1, x + 2); xx++) { const i = yy * E.sw + xx; a[0] += FY[i]; a[1] += FB[i]; a[2] += FR[i]; c++; }
    if (E.key.length >= 4) E.key.shift(); E.key.push(a.map(v => v / c)); mask.fill(0); E.msg(tr('Couleur du fond choisie.') + ' (' + E.key.length + ')');
  };
  E.msg = t => { if (E._msg) E._msg.textContent = t; };
  E.capture = async (btnEl) => {
    if (E.cap || !E.sw) return; const n = E.sw * E.sh, aY = new Float32Array(n), aB = new Float32Array(n), aR = new Float32Array(n); let cnt = 0; const lab0 = btnEl.lastChild.textContent;
    for (let c = 5; c > 0; c--) { E.cap = c; btnEl.lastChild.textContent = tr('Sortez de l’image…') + ' ' + c; await new Promise(r => setTimeout(r, 1000)); if (!E.running) { E.cap = 0; btnEl.lastChild.textContent = lab0; return; } }
    btnEl.lastChild.textContent = tr('Mémorisation…');
    for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 60)); if (!sd || !E.src) continue; smx.drawImage(E.src, 0, 0, E.sw, E.sh); const d = smx.getImageData(0, 0, E.sw, E.sh).data; for (let p = 0, q = 0; q < n; p += 4, q++) { const y = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]; aY[q] += y; aB[q] += d[p + 2] - y; aR[q] += d[p] - y; } cnt++; }
    if (cnt) { for (let i = 0; i < n; i++) { aY[i] /= cnt; aB[i] /= cnt; aR[i] /= cnt; } E.refY = aY; E.refB = aB; E.refR = aR; mask.fill(0); E.msg(tr('Fond mémorisé.')); }
    E.cap = 0; btnEl.lastChild.textContent = lab0;
  };

  /* ---------- GIF posés sur la vidéo ---------- */
  async function decodeGif(blob) {
    const frames = [];
    if (window.ImageDecoder) {
      try {
        const dec = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type && /^image\//.test(blob.type) ? blob.type : 'image/gif' }); await dec.tracks.ready;
        const n = Math.min(dec.tracks.selectedTrack.frameCount, 150);
        for (let i = 0; i < n; i++) { const r = await dec.decode({ frameIndex: i }); const bmp = await createImageBitmap(r.image, { resizeWidth: Math.min(360, r.image.displayWidth) }); frames.push({ bmp, d: Math.max(20, (r.image.duration || 100000) / 1000) }); r.image.close(); }
        dec.close();
      } catch { frames.length = 0; }
    }
    if (!frames.length) frames.push({ bmp: await createImageBitmap(blob), d: 1000 });
    return frames;
  }
  E.addSticker = async blob => {
    if (E.st.length >= 6) return toast('6 GIF au maximum sur la vidéo : retirez-en un.', 5000);
    let frames; try { frames = await decodeGif(blob); } catch { return toast('Ce GIF n’a pas pu être lu.', 5000); }
    const k = { id: uid(), frames, t0: performance.now(), x: 0.5, y: 0.5, s: 0.25, url: URL.createObjectURL(blob) };
    k.el = el('div', { className: 'crec-st', tabindex: 0, role: 'img', 'aria-label': tr('GIF sur la vidéo') }, el('img', { src: k.url, alt: '', draggable: false }),
      btn('', 'x', e => { e.stopPropagation(); E.removeSticker(k); }, 'crec-stx', 'Retirer ce GIF'));
    const place = () => { k.el.style.left = k.x * 100 + '%'; k.el.style.top = k.y * 100 + '%'; k.el.style.width = k.s * 100 + '%'; };
    k.place = place; place();
    k.el.onpointerdown = e => { if (e.target.closest('.crec-stx')) return; e.preventDefault(); E.select(k); k.el.setPointerCapture(e.pointerId); const r = E.stage.getBoundingClientRect(); let lx = e.clientX, ly = e.clientY;
      k.el.onpointermove = ev => { k.x = fxClamp(k.x + (ev.clientX - lx) / r.width, 0, 1); k.y = fxClamp(k.y + (ev.clientY - ly) / r.height, 0, 1); lx = ev.clientX; ly = ev.clientY; place(); };
      k.el.onpointerup = k.el.onpointercancel = () => { k.el.onpointermove = null; }; };
    k.el.onfocus = () => E.select(k);
    E.st.push(k); E.ovl.append(k.el); E.select(k); if (E.redraw && !E.panel.hidden) E.redraw(); changed();
  };
  E.select = k => { E.sel = k; for (const z of E.st) z.el.classList.toggle('on', z === k); if (E.onsel) E.onsel(k); };
  E.removeSticker = k => { E.st = E.st.filter(z => z !== k); k.el.remove(); URL.revokeObjectURL(k.url); if (E.sel === k) E.select(E.st[E.st.length - 1] || null); changed(); };
  E.gifDialog = () => {
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const close = () => { document.removeEventListener('keydown', onKey, true); ov.remove(); };
    document.addEventListener('keydown', onKey, true);
    const bx = chatGifBox({ pick: async u => { close(); try { const r = await fetch(u, { credentials: 'omit', referrerPolicy: 'no-referrer' }); if (!r.ok) throw new Error(); await E.addSticker(await r.blob()); } catch { toast('Ce GIF n’a pas pu être téléchargé.', 5000); } },
      device: () => { const i = el('input', { type: 'file', accept: 'image/gif,image/*', hidden: true }); i.onchange = () => { const f = i.files[0]; i.remove(); close(); if (f) E.addSticker(f); }; document.body.append(i); i.click(); } });
    const ov = el('div', { className: 'ov', onkeydown: e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } } }, el('div', { className: 'dlg crec-gd', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'GIF' }, chatPopHead('GIF', close), bx));
    document.body.append(ov); const f0 = ov.querySelector('input'); if (f0) f0.focus();
  };

  /* ---------- images de l'utilisateur (fond, cadre) ---------- */
  const loadImg = async (f, max) => {
    const bmp = await createImageBitmap(f), sc = Math.min(1, max / Math.max(bmp.width, bmp.height)); if (sc >= 1) return bmp;
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close(); return createImageBitmap(c);
  };

  /* ---------- interface : bouton « Effets » + galerie (grands boutons, faite pour les petits écrans) ---------- */
  const thumbCv = (draw) => { const c = document.createElement('canvas'); c.width = 128; c.height = 72; draw(c.getContext('2d'), 128, 72); return c; };
  const person = (c, W, H) => { c.fillStyle = fxLin(c, 0, 0, 0, H, [[0, '#7c8798'], [1, '#4b5565']]); c.fillRect(0, 0, W, H); c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(W / 2, H * 0.4, H * 0.2, 0, 7); c.fill(); c.beginPath(); c.ellipse(W / 2, H * 1.0, W * 0.24, H * 0.36, 0, 0, 7); c.fill(); };
  const tileBtn = (label, cvEl, on, click, extra) => el('button', { type: 'button', className: 'fx-tile' + (on ? ' on' : ''), 'aria-pressed': String(!!on), onclick: click, ...(extra || {}) }, cvEl, el('span', { textContent: label }));
  const iconTile = (label, icon, on, click) => { const d = el('div', { className: 'fx-ti' }, ico(icon, 28)); return tileBtn(label, d, on, click); };
  E.panel = (() => {
    const wrap = el('div', { className: 'fx-panel', hidden: true }), tabs = el('div', { className: 'fx-tabs', role: 'tablist' }), body = el('div', { className: 'fx-body' });
    let cur = 'bg'; const thumbs = new Map();
    const T = (id, label, draw) => { let c = thumbs.get(id); if (!c) { c = thumbCv(draw); thumbs.set(id, c); } const n = document.createElement('canvas'); n.width = 128; n.height = 72; n.getContext('2d').drawImage(c, 0, 0); return n; };
    const msg = el('small', { className: 'mut fx-msg' }); E._msg = msg;
    const fileLbl = (label, icon, accept, onFile, on, thumb) => { const inp = el('input', { type: 'file', accept, className: 'fx-file', 'aria-label': tr(label) }); inp.onchange = async () => { const f = inp.files[0]; inp.value = ''; if (f) { try { await onFile(f); } catch { toast('Image illisible.', 4000); } draw(); } }; return el('label', { className: 'fx-tile' + (on ? ' on' : '') }, thumb || el('div', { className: 'fx-ti' }, ico(icon, 28)), el('span', { textContent: label }), inp); };
    const setBg = id => { E.bg = id; if (id !== 'none' && E.mode === 'key' && !E.key.length) E.msg(tr('Cliquez sur le fond derrière vous pour choisir la couleur à remplacer.')); else if (id !== 'none' && E.mode === 'cap' && !E.refY) E.msg(tr('Sortez de l’image puis cliquez sur « Capturer le fond ».')); else E.msg(''); draw(); changed(); };
    const drawBgTab = () => {
      const t = [iconTile('Aucun', 'x', E.bg === 'none', () => setBg('none')),
        tileBtn('Flou léger', T('b1', '', (c, W, H) => { person(c, W, H); }), E.bg === 'blur1', () => setBg('blur1')), tileBtn('Flou fort', T('b2', '', (c, W, H) => { person(c, W, H); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, 0, W, H); }), E.bg === 'blur2', () => setBg('blur2'))];
      for (const [id, label, fn] of FX_BG) t.push(tileBtn(label, T('bg' + id, label, (c, W, H) => { fn(c, W, H); c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.arc(W / 2, H * 0.52, H * 0.2, 0, 7); c.fill(); c.beginPath(); c.ellipse(W / 2, H * 1.05, W * 0.22, H * 0.36, 0, 0, 7); c.fill(); }), E.bg === id, () => setBg(id)));
      t.push(fileLbl('Mon image…', 'image', 'image/png,image/jpeg,image/webp,image/gif,image/*', async f => { E.imgBmp = await loadImg(f, 1280); E.imgId = (E.imgId || 0) + 1; E.imgThumb = thumbCv((c, W, H) => drawImgCover(c, E.imgBmp, W, H)); E.bg = 'img'; changed(); }, E.bg === 'img', E.imgThumb ? E.imgThumb : null));
      return [el('div', { className: 'fx-grid' }, ...t), el('small', { className: 'mut', textContent: 'Un appui suffit : le mur derrière vous est reconnu automatiquement. En cas de défaut, ouvrez « Réglages ».' }), msg];
    };
    const setFr = id => { E.frame = id; draw(); changed(); };
    const drawFrTab = () => {
      const t = [iconTile('Aucun', 'x', E.frame === 'none', () => setFr('none'))];
      for (const [id, label, fn] of FX_FRAMES) t.push(tileBtn(label, T('fr' + id, label, (c, W, H) => { person(c, W, H); fn(c, W, H); }), E.frame === id, () => setFr(id)));
      t.push(fileLbl('Mon cadre (PNG)…', 'image', 'image/png,image/webp,image/*', async f => { E.frameBmp = await loadImg(f, 1600); E.frame = 'mine'; changed(); }, E.frame === 'mine', E.frameBmp ? thumbCv((c, W, H) => { person(c, W, H); c.drawImage(E.frameBmp, 0, 0, W, H); }) : null));
      return [el('div', { className: 'fx-grid' }, ...t)];
    };
    const drawGifTab = () => {
      const sz = el('input', { type: 'range', min: 5, max: 80, value: E.sel ? Math.round(E.sel.s * 100) : 25, 'aria-label': tr('Taille du GIF'), disabled: !E.sel, oninput: () => { if (E.sel) { E.sel.s = +sz.value / 100; E.sel.place(); } } });
      E.onsel = k => { sz.disabled = !k; if (k) sz.value = Math.round(k.s * 100); };
      return [el('div', { className: 'row' }, btn('Ajouter un GIF (GIPHY)…', 'plus', () => E.gifDialog(), 'pri fx-big')),
        el('small', { className: 'mut', textContent: D.chat.gk ? 'Clé GIPHY enregistrée dans votre profil chiffré (sauvegardée avec votre cloud).' : 'Aucune clé GIPHY : elle sera demandée au premier GIF, puis enregistrée dans votre profil.' }),
        el('label', { className: 'col' }, el('small', { className: 'mut', textContent: 'Taille du GIF choisi' }), sz),
        el('div', { className: 'fx-chips' }, ...E.st.map((k, i) => el('span', { className: 'fx-chip' + (E.sel === k ? ' on' : '') }, el('button', { type: 'button', className: 'fx-chip-i', 'aria-label': tr('GIF sur la vidéo') + ' ' + (i + 1), onclick: () => { E.select(k); draw(); } }, el('img', { src: k.url, alt: '' })), btn('', 'x', () => { E.removeSticker(k); draw(); }, 'fx-chip-x', 'Retirer ce GIF')))),
        el('small', { className: 'mut', textContent: 'Glissez un GIF sur la vidéo pour le placer ; × pour le retirer. Jusqu’à 6 GIF.' })];
    };
    const drawSetTab = () => {
      const mode = el('select', { 'aria-label': tr('Détection du fond'), onchange: () => { E.mode = mode.value; if (mask) mask.fill(0); E.pal = null; draw(); changed(); } });
      opts(mode, [['auto', 'Automatique (recommandé)'], ['key', 'Fond uni : cliquez sur le fond dans l’aperçu'], ['cap', 'Fond capturé : sortez de l’image']]); mode.value = E.mode;
      const tol = el('input', { type: 'range', min: 10, max: 150, value: E.tol, 'aria-label': tr('Sensibilité'), oninput: () => { E.tol = +tol.value; }, onchange: () => fxSave() });
      const sf = el('input', { type: 'range', min: 0, max: 100, value: E.soft, 'aria-label': tr('Bords adoucis'), oninput: () => { E.soft = +sf.value; }, onchange: () => fxSave() });
      const capB = btn('Capturer le fond (5 s)', 'video', () => E.capture(capB), 'fx-big'); capB.hidden = E.mode !== 'cap';
      return [el('label', { className: 'col' }, el('small', { className: 'mut', textContent: 'Détection du fond' }), mode), capB,
        el('label', { className: 'col' }, el('small', { className: 'mut', textContent: 'Sensibilité' }), tol), el('label', { className: 'col' }, el('small', { className: 'mut', textContent: 'Bords adoucis' }), sf),
        btn('Tout remettre à zéro', 'refresh', () => { E.bg = 'none'; E.frame = 'none'; E.mode = 'auto'; E.tol = 60; E.soft = 50; E.key = []; E.refY = null; E.pal = null; [...E.st].forEach(k => E.removeSticker(k)); draw(); changed(); }, 'fx-big'),
        el('small', { className: 'mut', textContent: 'Astuce : un mur uni, bien éclairé, et une personne vêtue d’une autre couleur que le mur donnent le meilleur résultat. Gardez cet onglet visible : le navigateur ralentit l’image d’un onglet masqué.' }), msg];
    };
    function draw() {
      tabs.replaceChildren(...[['bg', 'Fonds', 'image'], ['fr', 'Cadres', 'frame'], ['gif', 'GIF', 'smile'], ['set', 'Réglages', 'sliders']].map(([id, label, ic]) => el('button', { type: 'button', role: 'tab', className: 'fx-tab' + (cur === id ? ' on' : ''), 'aria-selected': String(cur === id), onclick: () => { cur = id; draw(); } }, ico(ic, 20), el('span', { textContent: label }))));
      body.replaceChildren(...(cur === 'bg' ? drawBgTab() : cur === 'fr' ? drawFrTab() : cur === 'gif' ? drawGifTab() : drawSetTab()));
    }
    E.redraw = draw; wrap.append(tabs, body); draw(); return wrap;
  })();
  E.toggle = (() => {
    const b = el('button', { type: 'button', className: 'fx-toggle', role: 'switch', 'aria-checked': 'false' }, ico('sparkle', 24), el('span', { className: 'grow', textContent: 'Effets : fonds, cadres, GIF' }), el('i', { className: 'fx-sw' }));
    b.onclick = () => E.set(!E.enabled); return b;
  })();
  E.set = on => { E.enabled = !!on; E.toggle.setAttribute('aria-checked', String(E.enabled)); E.toggle.classList.toggle('on', E.enabled); E.panel.hidden = !E.enabled; if (E.enabled) E.redraw(); changed(); };
  E.lock = on => { E.toggle.disabled = !!on; };
  if (E._wantOn) queueMicrotask(() => { E._loading = true; try { E.set(true); } finally { E._loading = false; } });   // réactive les effets après que l’hôte a branché onchange
  return E;
}
