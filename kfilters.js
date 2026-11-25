'use strict';
/* kfilters.js — retouche photo de Kaléido : réglages et filtres, écrits à la main (aucune bibliothèque externe).
   Chaque fonction lit des pixels RGBA (Uint8ClampedArray) dans « s » et écrit le résultat dans « d » (au départ une copie de « s »).
   p = valeurs des curseurs ; W, H = taille de l'image. L'opacité (alpha) des pixels n'est jamais modifiée, sauf par les déformations. */
const kc = v => (v < 0 ? 0 : v > 255 ? 255 : v);
const klut = f => { const t = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) t[i] = f(i); return t; };
const klum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/* flou par moyenne glissante (sur les couleurs pré-multipliées par l'opacité : pas de bords noirs autour des zones transparentes) */
function kBox(src, dst, W, H, r) {
  r = Math.max(0, Math.round(r)); if (!r) { dst.set(src); return; }
  const u = new Float32Array(W * H * 4), w = 2 * r + 1, row = new Float32Array(W * 4);   // une seule grande mémoire intermédiaire
  for (let y = 0; y < H; y++) {   // horizontal, directement depuis l'image (couleurs × opacité)
    const o = y * W * 4;
    for (let x = 0; x < W; x++) { const a = src[o + x * 4 + 3] / 255; row[x * 4] = src[o + x * 4] * a; row[x * 4 + 1] = src[o + x * 4 + 1] * a; row[x * 4 + 2] = src[o + x * 4 + 2] * a; row[x * 4 + 3] = src[o + x * 4 + 3]; }
    for (let c = 0; c < 4; c++) {
      let sum = 0; for (let x = -r; x <= r; x++) sum += row[Math.min(W - 1, Math.max(0, x)) * 4 + c];
      for (let x = 0; x < W; x++) { u[o + x * 4 + c] = sum / w; sum += row[Math.min(W - 1, x + r + 1) * 4 + c] - row[Math.max(0, x - r) * 4 + c]; }
    }
  }
  const col = new Float32Array(H * 4);
  for (let x = 0; x < W; x++) {   // vertical, puis retour aux couleurs normales
    for (let c = 0; c < 4; c++) {
      let sum = 0; for (let y = -r; y <= r; y++) sum += u[Math.min(H - 1, Math.max(0, y)) * W * 4 + x * 4 + c];
      for (let y = 0; y < H; y++) { col[y * 4 + c] = sum / w; sum += u[Math.min(H - 1, y + r + 1) * W * 4 + x * 4 + c] - u[Math.max(0, y - r) * W * 4 + x * 4 + c]; }
    }
    for (let y = 0; y < H; y++) { const a = col[y * 4 + 3], k = a > 0 ? 255 / a : 0, o = y * W * 4 + x * 4; dst[o] = col[y * 4] * k; dst[o + 1] = col[y * 4 + 1] * k; dst[o + 2] = col[y * 4 + 2] * k; dst[o + 3] = a; }
  }
}
function kBlur(src, dst, W, H, radius) {   // approximation d'un flou gaussien : 3 passes de moyenne
  const sg = Math.max(0, radius); if (sg < 0.5) { dst.set(src); return; }
  const wi = Math.sqrt(12 * sg * sg / 3 + 1), wl = Math.floor(wi) % 2 ? Math.floor(wi) : Math.floor(wi) - 1, wu = wl + 2;
  const m = Math.round((12 * sg * sg - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4)), rs = [0, 1, 2].map(i => ((i < m ? wl : wu) - 1) / 2);
  const a = new Uint8ClampedArray(src.length), b = new Uint8ClampedArray(src.length);
  kBox(src, a, W, H, rs[0]); kBox(a, b, W, H, rs[1]); kBox(b, dst, W, H, rs[2]);
}
function kSample(s, W, H, x, y, d, i) {   // lecture bilinéaire d'un pixel à la position (x, y)
  if (x < 0) x = 0; else if (x > W - 1) x = W - 1; if (y < 0) y = 0; else if (y > H - 1) y = H - 1;
  const x0 = x | 0, y0 = y | 0, x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), fx = x - x0, fy = y - y0;
  const a = (y0 * W + x0) * 4, b = (y0 * W + x1) * 4, c = (y1 * W + x0) * 4, e = (y1 * W + x1) * 4;
  for (let k = 0; k < 4; k++) d[i + k] = (s[a + k] * (1 - fx) + s[b + k] * fx) * (1 - fy) + (s[c + k] * (1 - fx) + s[e + k] * fx) * fy;
}
const kGray = (s, W, H) => { const g = new Float32Array(W * H); for (let i = 0; i < W * H; i++) g[i] = klum(s[i * 4], s[i * 4 + 1], s[i * 4 + 2]); return g; };

/* ---------- réglages (chacun : liste de curseurs + fonction) ---------- */
const KADJ = {
  bc: { name: 'Luminosité / contraste', params: [{ k: 'b', label: 'Luminosité', min: -100, max: 100, value: 0 }, { k: 'c', label: 'Contraste', min: -100, max: 100, value: 0 }],
    fn(s, d, W, H, p) { const C = p.c * 2.55, f = 259 * (C + 255) / (255 * (259 - C)), t = klut(v => f * (v - 128) + 128 + p.b * 2.55); for (let i = 0; i < d.length; i += 4) { d[i] = t[s[i]]; d[i + 1] = t[s[i + 1]]; d[i + 2] = t[s[i + 2]]; } } },
  exp: { name: 'Exposition / gamma', params: [{ k: 'e', label: 'Exposition (IL)', min: -3, max: 3, step: .1, value: 0 }, { k: 'g', label: 'Gamma', min: .3, max: 3, step: .05, value: 1 }],
    fn(s, d, W, H, p) { const t = klut(v => 255 * Math.pow(Math.min(1, v / 255 * Math.pow(2, p.e)), 1 / p.g)); for (let i = 0; i < d.length; i += 4) { d[i] = t[s[i]]; d[i + 1] = t[s[i + 1]]; d[i + 2] = t[s[i + 2]]; } } },
  sh: { name: 'Ombres / hautes lumières', params: [{ k: 's', label: 'Ombres (éclaircir)', min: -100, max: 100, value: 0 }, { k: 'h', label: 'Hautes lumières (assombrir ← → éclaircir)', min: -100, max: 100, value: 0 }],
    fn(s, d, W, H, p) { for (let i = 0; i < d.length; i += 4) { const L = klum(s[i], s[i + 1], s[i + 2]) / 255, a = p.s / 100 * 90 * (1 - L) * (1 - L) + p.h / 100 * 90 * L * L; d[i] = kc(s[i] + a); d[i + 1] = kc(s[i + 1] + a); d[i + 2] = kc(s[i + 2] + a); } } },
  sat: { name: 'Saturation / éclat', params: [{ k: 's', label: 'Saturation', min: -100, max: 100, value: 0 }, { k: 'v', label: 'Éclat (couleurs ternes surtout)', min: -100, max: 100, value: 0 }],
    fn(s, d, W, H, p) { for (let i = 0; i < d.length; i += 4) { const r = s[i], g = s[i + 1], b = s[i + 2], l = klum(r, g, b), sa = (Math.max(r, g, b) - Math.min(r, g, b)) / 255, f = Math.max(0, 1 + p.s / 100) * Math.max(0, 1 + p.v / 100 * (1 - sa)); d[i] = kc(l + (r - l) * f); d[i + 1] = kc(l + (g - l) * f); d[i + 2] = kc(l + (b - l) * f); } } },
  hue: { name: 'Teinte', params: [{ k: 'a', label: 'Décalage de teinte (°)', min: -180, max: 180, value: 0 }],
    fn(s, d, W, H, p) { const a = p.a * Math.PI / 180, c = Math.cos(a), n = Math.sin(a), m = [.213 + c * .787 - n * .213, .715 - c * .715 - n * .715, .072 - c * .072 + n * .928, .213 - c * .213 + n * .143, .715 + c * .285 + n * .140, .072 - c * .072 - n * .283, .213 - c * .213 - n * .787, .715 - c * .715 + n * .715, .072 + c * .928 + n * .072];
      for (let i = 0; i < d.length; i += 4) { const r = s[i], g = s[i + 1], b = s[i + 2]; d[i] = kc(m[0] * r + m[1] * g + m[2] * b); d[i + 1] = kc(m[3] * r + m[4] * g + m[5] * b); d[i + 2] = kc(m[6] * r + m[7] * g + m[8] * b); } } },
  temp: { name: 'Température / teinte', params: [{ k: 't', label: 'Température (froid ← → chaud)', min: -100, max: 100, value: 0 }, { k: 'n', label: 'Teinte (vert ← → magenta)', min: -100, max: 100, value: 0 }],
    fn(s, d, W, H, p) { const t = p.t * .5, n = p.n * .4; for (let i = 0; i < d.length; i += 4) { d[i] = kc(s[i] + t + n * .5); d[i + 1] = kc(s[i + 1] - n); d[i + 2] = kc(s[i + 2] - t + n * .5); } } },
  lev: { name: 'Niveaux', params: [{ k: 'b', label: 'Point noir', min: 0, max: 250, value: 0 }, { k: 'w', label: 'Point blanc', min: 5, max: 255, value: 255 }, { k: 'g', label: 'Tons moyens (gamma)', min: .3, max: 3, step: .05, value: 1 }],
    fn(s, d, W, H, p) { const lo = p.b, hi = Math.max(lo + 1, p.w), t = klut(v => 255 * Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo))), 1 / p.g)); for (let i = 0; i < d.length; i += 4) { d[i] = t[s[i]]; d[i + 1] = t[s[i + 1]]; d[i + 2] = t[s[i + 2]]; } } },
  blur: { name: 'Flou gaussien', params: [{ k: 'r', label: 'Rayon (px)', min: 0, max: 40, step: .5, value: 4 }], fn(s, d, W, H, p) { kBlur(s, d, W, H, p.r); } },
  sharp: { name: 'Netteté', params: [{ k: 'a', label: 'Intensité (%)', min: 0, max: 300, value: 100 }, { k: 'r', label: 'Rayon (px)', min: .5, max: 6, step: .1, value: 1.5 }],
    fn(s, d, W, H, p) { const b = new Uint8ClampedArray(s.length); kBlur(s, b, W, H, p.r); const a = p.a / 100; for (let i = 0; i < d.length; i += 4) { d[i] = kc(s[i] + a * (s[i] - b[i])); d[i + 1] = kc(s[i + 1] + a * (s[i + 1] - b[i + 1])); d[i + 2] = kc(s[i + 2] + a * (s[i + 2] - b[i + 2])); } } },
  den: { name: 'Réduction du bruit', params: [{ k: 'r', label: 'Rayon (px)', min: 1, max: 6, value: 2 }, { k: 't', label: 'Seuil (garde les contours)', min: 5, max: 100, value: 35 }],
    fn(s, d, W, H, p) { const b = new Uint8ClampedArray(s.length); kBlur(s, b, W, H, p.r); for (let i = 0; i < d.length; i += 4) { const df = Math.abs(s[i] - b[i]) + Math.abs(s[i + 1] - b[i + 1]) + Math.abs(s[i + 2] - b[i + 2]), w = df < p.t ? 1 : df < p.t * 2 ? 1 - (df - p.t) / p.t : 0; d[i] = s[i] + (b[i] - s[i]) * w; d[i + 1] = s[i + 1] + (b[i + 1] - s[i + 1]) * w; d[i + 2] = s[i + 2] + (b[i + 2] - s[i + 2]) * w; } } },
  grain: { name: 'Grain de film', params: [{ k: 'a', label: 'Quantité', min: 0, max: 100, value: 25 }, { k: 'z', label: 'Taille (px)', min: 1, max: 6, value: 1 }],
    fn(s, d, W, H, p) { const z = Math.round(p.z), gw = Math.ceil(W / z), gh = Math.ceil(H / z), nz = new Float32Array(gw * gh); for (let i = 0; i < nz.length; i++) nz[i] = (Math.random() + Math.random() + Math.random() - 1.5) * p.a * 1.2;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, n = nz[((y / z) | 0) * gw + ((x / z) | 0)]; d[i] = kc(s[i] + n); d[i + 1] = kc(s[i + 1] + n); d[i + 2] = kc(s[i + 2] + n); } } },
  vig: { name: 'Vignette', params: [{ k: 'a', label: 'Intensité (négatif = éclaircit)', min: -100, max: 100, value: 50 }, { k: 's', label: 'Taille du centre clair (%)', min: 10, max: 100, value: 55 }],
    fn(s, d, W, H, p) { const cx = W / 2, cy = H / 2, mr = Math.hypot(cx, cy), s0 = p.s / 100; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, q = Math.max(0, (Math.hypot(x - cx, y - cy) / mr - s0 * .8) / (1.0001 - s0 * .8)), f = 1 - p.a / 100 * q * q * (3 - 2 * Math.min(1, q)); if (p.a >= 0) { d[i] = s[i] * f; d[i + 1] = s[i + 1] * f; d[i + 2] = s[i + 2] * f; } else { const k = 1 - f; d[i] = kc(s[i] + (255 - s[i]) * k); d[i + 1] = kc(s[i + 1] + (255 - s[i + 1]) * k); d[i + 2] = kc(s[i + 2] + (255 - s[i + 2]) * k); } } } },
  pix: { name: 'Pixelliser (mosaïque)', params: [{ k: 'z', label: 'Taille des blocs (px)', min: 2, max: 80, value: 12 }],
    fn(s, d, W, H, p) { const z = Math.round(p.z); for (let by = 0; by < H; by += z) for (let bx = 0; bx < W; bx += z) { let r = 0, g = 0, b = 0, a = 0, n = 0; const ex = Math.min(W, bx + z), ey = Math.min(H, by + z); for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const i = (y * W + x) * 4; r += s[i]; g += s[i + 1]; b += s[i + 2]; a += s[i + 3]; n++; } r /= n; g /= n; b /= n; a /= n; for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const i = (y * W + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; } } } },
  post: { name: 'Postériser', params: [{ k: 'n', label: 'Niveaux par couleur', min: 2, max: 16, value: 4 }],
    fn(s, d, W, H, p) { const n = p.n - 1, t = klut(v => Math.round(v / 255 * n) / n * 255); for (let i = 0; i < d.length; i += 4) { d[i] = t[s[i]]; d[i + 1] = t[s[i + 1]]; d[i + 2] = t[s[i + 2]]; } } },
  thr: { name: 'Seuil (noir et blanc pur)', params: [{ k: 't', label: 'Seuil', min: 1, max: 254, value: 128 }],
    fn(s, d, W, H, p) { for (let i = 0; i < d.length; i += 4) { const v = klum(s[i], s[i + 1], s[i + 2]) >= p.t ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; } } },
  duo: { name: 'Bichromie (couleur 2 → couleur 1)', params: [{ k: 'm', label: 'Force', min: 0, max: 100, value: 100 }], colors: true,
    fn(s, d, W, H, p, o) { const c1 = o.c1, c2 = o.c2, m = p.m / 100; for (let i = 0; i < d.length; i += 4) { const l = klum(s[i], s[i + 1], s[i + 2]) / 255; d[i] = s[i] + (c2[0] + (c1[0] - c2[0]) * l - s[i]) * m; d[i + 1] = s[i + 1] + (c2[1] + (c1[1] - c2[1]) * l - s[i + 1]) * m; d[i + 2] = s[i + 2] + (c2[2] + (c1[2] - c2[2]) * l - s[i + 2]) * m; } } },
  emb: { name: 'Relief', params: [{ k: 'a', label: 'Angle de la lumière (°)', min: 0, max: 359, value: 135 }, { k: 'f', label: 'Force', min: 1, max: 10, step: .5, value: 3 }, { k: 'c', label: 'Garder les couleurs (%)', min: 0, max: 100, value: 0 }],
    fn(s, d, W, H, p) { const g = kGray(s, W, H), ca = Math.cos(p.a * Math.PI / 180), sa = Math.sin(p.a * Math.PI / 180), k = p.c / 100;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const xm = Math.max(0, x - 1), xp = Math.min(W - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(H - 1, y + 1), gx = g[y * W + xp] - g[y * W + xm], gy = g[yp * W + x] - g[ym * W + x], v = 128 + p.f * (gx * ca + gy * sa), i = (y * W + x) * 4; d[i] = kc(v + (s[i] - 128) * k); d[i + 1] = kc(v + (s[i + 1] - 128) * k); d[i + 2] = kc(v + (s[i + 2] - 128) * k); } } },
  edge: { name: 'Contours', params: [{ k: 'f', label: 'Force', min: 1, max: 10, step: .5, value: 3 }, { k: 'i', label: 'Traits sombres sur fond blanc (1 = oui)', min: 0, max: 1, value: 1 }],
    fn(s, d, W, H, p) { const g = kGray(s, W, H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const xm = Math.max(0, x - 1), xp = Math.min(W - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(H - 1, y + 1), gx = g[ym * W + xp] + 2 * g[y * W + xp] + g[yp * W + xp] - g[ym * W + xm] - 2 * g[y * W + xm] - g[yp * W + xm], gy = g[yp * W + xm] + 2 * g[yp * W + x] + g[yp * W + xp] - g[ym * W + xm] - 2 * g[ym * W + x] - g[ym * W + xp], m = Math.min(255, Math.hypot(gx, gy) * p.f / 4), v = p.i ? 255 - m : m, i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; } } },
  sketch: { name: 'Croquis au crayon', params: [{ k: 'r', label: 'Finesse du trait', min: 1, max: 30, value: 8 }],
    fn(s, d, W, H, p) { const n = W * H, inv = new Uint8ClampedArray(n * 4), bl = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) { const l = 255 - klum(s[i * 4], s[i * 4 + 1], s[i * 4 + 2]); inv[i * 4] = inv[i * 4 + 1] = inv[i * 4 + 2] = l; inv[i * 4 + 3] = 255; } kBlur(inv, bl, W, H, p.r);
      for (let i = 0; i < n; i++) { const g = klum(s[i * 4], s[i * 4 + 1], s[i * 4 + 2]), v = Math.min(255, g * 255 / (256 - bl[i * 4])); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; } } },
  toon: { name: 'Dessin animé', params: [{ k: 'n', label: 'Aplats (niveaux)', min: 3, max: 12, value: 6 }, { k: 'e', label: 'Épaisseur des contours', min: 0, max: 10, step: .5, value: 4 }],
    fn(s, d, W, H, p) { const sm = new Uint8ClampedArray(s.length); kBlur(s, sm, W, H, 2); const g = kGray(sm, W, H), n = p.n - 1, t = klut(v => Math.round(v / 255 * n) / n * 255);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const xm = Math.max(0, x - 1), xp = Math.min(W - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(H - 1, y + 1), gx = g[y * W + xp] - g[y * W + xm], gy = g[yp * W + x] - g[ym * W + x], e = Math.hypot(gx, gy) * p.e / 6, f = Math.max(0, 1 - e / 60), i = (y * W + x) * 4; d[i] = t[sm[i]] * f; d[i + 1] = t[sm[i + 1]] * f; d[i + 2] = t[sm[i + 2]] * f; } } },
  wave: { name: 'Vagues', params: [{ k: 'a', label: 'Hauteur des vagues (px)', min: 0, max: 80, value: 12 }, { k: 'l', label: 'Longueur d’onde (px)', min: 10, max: 400, value: 80 }, { k: 'h', label: 'Sens (0 = horizontal, 1 = vertical)', min: 0, max: 1, value: 0 }], warp: true,
    fn(s, d, W, H, p) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = Math.sin((p.h ? x : y) / p.l * Math.PI * 2) * p.a; kSample(s, W, H, p.h ? x : x + o, p.h ? y + o : y, d, (y * W + x) * 4); } } },
  swirl: { name: 'Tourbillon', params: [{ k: 'a', label: 'Angle (°)', min: -720, max: 720, value: 180 }, { k: 'r', label: 'Rayon (% de l’image)', min: 10, max: 100, value: 60 }], warp: true,
    fn(s, d, W, H, p) { const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 * p.r / 100 * 1.4, A = p.a * Math.PI / 180; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), i = (y * W + x) * 4; if (r >= R) { d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = s[i + 3]; continue; } const q = 1 - r / R, a = Math.atan2(dy, dx) + A * q * q; kSample(s, W, H, cx + r * Math.cos(a), cy + r * Math.sin(a), d, i); } } },
  bulge: { name: 'Loupe / pincement', params: [{ k: 's', label: 'Force (négatif = pincement)', min: -90, max: 90, value: 50 }, { k: 'r', label: 'Rayon (% de l’image)', min: 10, max: 100, value: 70 }], warp: true,
    fn(s, d, W, H, p) { const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 * p.r / 100 * 1.4, k = p.s / 100; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), i = (y * W + x) * 4; if (r >= R || r === 0) { d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = s[i + 3]; continue; } const n = r / R, sr = r * (1 - k * (1 - n * n)); kSample(s, W, H, cx + dx / r * sr, cy + dy / r * sr, d, i); } } },
  kal: { name: 'Kaléidoscope', params: [{ k: 'n', label: 'Segments', min: 2, max: 16, value: 6 }, { k: 'a', label: 'Rotation (°)', min: 0, max: 359, value: 0 }, { k: 'z', label: 'Zoom (%)', min: 30, max: 300, value: 100 }], warp: true,
    fn(s, d, W, H, p) { const cx = W / 2, cy = H / 2, sec = Math.PI * 2 / Math.round(p.n), rot = p.a * Math.PI / 180, zf = 100 / p.z; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy) * zf; let a = (Math.atan2(dy, dx) - rot) % sec; if (a < 0) a += sec; if (a > sec / 2) a = sec - a; a += rot; kSample(s, W, H, cx + r * Math.cos(a), cy + r * Math.sin(a), d, (y * W + x) * 4); } } }
};
/* ---------- filtres rapides (un clic) ; chacun = suite de réglages ---------- */
const kmat = (s, d, m) => { for (let i = 0; i < d.length; i += 4) { const r = s[i], g = s[i + 1], b = s[i + 2]; d[i] = kc(m[0] * r + m[1] * g + m[2] * b + m[3]); d[i + 1] = kc(m[4] * r + m[5] * g + m[6] * b + m[7]); d[i + 2] = kc(m[8] * r + m[9] * g + m[10] * b + m[11]); } };
const kchain = (s, d, W, H, steps) => { let cur = s; for (const [id, p, o] of steps) { const nx = new Uint8ClampedArray(cur); KADJ[id].fn(cur, nx, W, H, p, o || {}); cur = nx; } d.set(cur); };
function kAuto(s, d, kind) {   // auto-niveaux / auto-contraste / balance des blancs
  const n = s.length / 4;
  if (kind === 'wb') { let r = 0, g = 0, b = 0; for (let i = 0; i < s.length; i += 4) { r += s[i]; g += s[i + 1]; b += s[i + 2]; } r /= n; g /= n; b /= n; const m = (r + g + b) / 3 || 1, kr = m / (r || 1), kg = m / (g || 1), kb = m / (b || 1); for (let i = 0; i < s.length; i += 4) { d[i] = kc(s[i] * kr); d[i + 1] = kc(s[i + 1] * kg); d[i + 2] = kc(s[i + 2] * kb); } return; }
  const h = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let i = 0; i < s.length; i += 4) { h[0][s[i]]++; h[1][s[i + 1]]++; h[2][s[i + 2]]++; }
  const lim = n * .005, rng = c => { let a = 0, lo = 0, hi = 255; for (let v = 0; v < 256; v++) { a += h[c][v]; if (a > lim) { lo = v; break; } } a = 0; for (let v = 255; v >= 0; v--) { a += h[c][v]; if (a > lim) { hi = v; break; } } return [lo, Math.max(lo + 1, hi)]; };
  let R = [rng(0), rng(1), rng(2)]; if (kind === 'contrast') { const lo = Math.min(R[0][0], R[1][0], R[2][0]), hi = Math.max(R[0][1], R[1][1], R[2][1]); R = [[lo, hi], [lo, hi], [lo, hi]]; }
  const t = R.map(([lo, hi]) => klut(v => (v - lo) / (hi - lo) * 255)); for (let i = 0; i < s.length; i += 4) { d[i] = t[0][s[i]]; d[i + 1] = t[1][s[i + 1]]; d[i + 2] = t[2][s[i + 2]]; }
}
const KPRE = [
  { id: 'bw', name: 'Noir et blanc', fn: (s, d) => kmat(s, d, [.299, .587, .114, 0, .299, .587, .114, 0, .299, .587, .114, 0]) },
  { id: 'bwc', name: 'N&B contrasté', fn: (s, d, W, H) => kchain(s, d, W, H, [['sat', { s: -100, v: 0 }], ['bc', { b: 0, c: 45 }]]) },
  { id: 'sepia', name: 'Sépia', fn: (s, d) => kmat(s, d, [.393, .769, .189, 0, .349, .686, .168, 0, .272, .534, .131, 0]) },
  { id: 'vintage', name: 'Vintage', fn: (s, d, W, H) => kchain(s, d, W, H, [['sat', { s: -30, v: 0 }], ['temp', { t: 30, n: 8 }], ['sh', { s: 35, h: -10 }], ['bc', { b: 0, c: -10 }], ['vig', { a: 45, s: 50 }], ['grain', { a: 10, z: 1 }]]) },
  { id: 'cold', name: 'Froid', fn: (s, d, W, H) => kchain(s, d, W, H, [['temp', { t: -40, n: 0 }], ['sat', { s: 8, v: 0 }]]) },
  { id: 'warm', name: 'Chaud', fn: (s, d, W, H) => kchain(s, d, W, H, [['temp', { t: 40, n: 5 }], ['sat', { s: 8, v: 0 }]]) },
  { id: 'drama', name: 'Dramatique', fn: (s, d, W, H) => kchain(s, d, W, H, [['bc', { b: -5, c: 40 }], ['sat', { s: -25, v: 0 }], ['sh', { s: 20, h: -25 }], ['vig', { a: 40, s: 45 }]]) },
  { id: 'fade', name: 'Fané', fn: (s, d, W, H) => kchain(s, d, W, H, [['sat', { s: -25, v: 0 }], ['sh', { s: 60, h: 0 }], ['bc', { b: 6, c: -15 }]]) },
  { id: 'vivid', name: 'Éclatant', fn: (s, d, W, H) => kchain(s, d, W, H, [['sat', { s: 20, v: 35 }], ['bc', { b: 0, c: 12 }], ['sharp', { a: 60, r: 1.2 }]]) },
  { id: 'cyan', name: 'Cyanotype', fn: (s, d, W, H) => KADJ.duo.fn(s, d, W, H, { m: 100 }, { c1: [200, 235, 255], c2: [8, 30, 80] }) },
  { id: 'neg', name: 'Négatif', fn: (s, d) => kmat(s, d, [-1, 0, 0, 255, 0, -1, 0, 255, 0, 0, -1, 255]) },
  { id: 'sketch', name: 'Croquis', fn: (s, d, W, H) => KADJ.sketch.fn(s, d, W, H, { r: 8 }) },
  { id: 'toon', name: 'Dessin animé', fn: (s, d, W, H) => KADJ.toon.fn(s, d, W, H, { n: 6, e: 4 }) },
  { id: 'pop', name: 'Pop-art', fn: (s, d, W, H) => kchain(s, d, W, H, [['sat', { s: 70, v: 0 }], ['post', { n: 4 }], ['bc', { b: 0, c: 20 }]]) },
  { id: 'autolev', name: 'Auto-niveaux', fn: (s, d) => kAuto(s, d, 'levels') },
  { id: 'autocon', name: 'Auto-contraste', fn: (s, d) => kAuto(s, d, 'contrast') },
  { id: 'autowb', name: 'Balance des blancs auto', fn: (s, d) => kAuto(s, d, 'wb') }
];
/* histogramme (luminosité + 3 couleurs) pour le panneau « Histogramme » */
function kHist(data) {
  const h = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let i = 0; i < data.length; i += 4) { if (data[i + 3] < 8) continue; h[0][data[i]]++; h[1][data[i + 1]]++; h[2][data[i + 2]]++; h[3][Math.round(klum(data[i], data[i + 1], data[i + 2]))]++; }
  return h;
}
