'use strict';
/* pdf-tools.js : impression et PDF, sans aucune bibliothèque ni serveur.
   - ptPrint(nodes, css)         : imprime (impression native du navigateur : texte net ; « Enregistrer au format PDF » possible dans la boîte d'impression).
   - ptHtmlPdf(html, css)        : PDF A4 d'un contenu HTML déjà assaini (le navigateur dessine les pages ; chaque page est une image JPEG dans le PDF).
   - ptImagePdf(canvas)          : PDF d'une image (A4, orientation automatique, marges).
   - ptSaveDialog(name, make)    : « Enregistrer en PDF » : sur l'appareil (téléchargement) ou dans le cloud WebDAV choisi.
   Limite honnête : dans un PDF produit ici le texte est une image (non sélectionnable ni recherchable) ;
   pour du texte vectoriel, utilisez « Imprimer » puis « Enregistrer au format PDF ». */

const PT_A4 = { w: 595.28, h: 841.89 };   // points PDF (1/72 pouce)

/* ---------- écriture d'un PDF composé d'images JPEG (une par page) ---------- */
function ptBuildPdf(pages) {   // pages : [{ jpg: Uint8Array, pxW, pxH, pw, ph, x, y, w, h }]  (pw/ph = taille de page en pt ; x,y,w,h = image en pt, origine en bas à gauche)
  const enc = new TextEncoder(), chunks = [], offs = []; let len = 0;
  const put = d => { const u = typeof d === 'string' ? enc.encode(d) : d; chunks.push(u); len += u.length; };
  const obj = (n, body) => { offs[n] = len; put(n + ' 0 obj\n'); body(); put('\nendobj\n'); };
  const nPages = pages.length, kids = pages.map((_, i) => (3 + i * 3) + ' 0 R').join(' ');
  put('%PDF-1.4\n%âãÏÓ\n');
  obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => put('<< /Type /Pages /Kids [' + kids + '] /Count ' + nPages + ' >>'));
  pages.forEach((p, i) => {
    const pg = 3 + i * 3, ct = pg + 1, im = pg + 2, f = v => v.toFixed(2);
    obj(pg, () => put('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + f(p.pw) + ' ' + f(p.ph) + '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>'));
    const cs = 'q ' + f(p.w) + ' 0 0 ' + f(p.h) + ' ' + f(p.x) + ' ' + f(p.y) + ' cm /Im0 Do Q';
    obj(ct, () => put('<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream'));
    obj(im, () => { put('<< /Type /XObject /Subtype /Image /Width ' + p.pxW + ' /Height ' + p.pxH + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpg.length + ' >>\nstream\n'); put(p.jpg); put('\nendstream'); });
  });
  const total = 3 + nPages * 3, xr = len;
  put('xref\n0 ' + total + '\n0000000000 65535 f \n');
  for (let n = 1; n < total; n++) put(String(offs[n]).padStart(10, '0') + ' 00000 n \n');
  put('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xr + '\n%%EOF\n');
  return new Blob(chunks, { type: 'application/pdf' });
}
async function ptJpeg(canvas, q = 0.88) {
  const b = await new Promise(r => canvas.toBlob(r, 'image/jpeg', q)); if (!b) throw new Error('Encodage JPEG impossible.');
  return new Uint8Array(await b.arrayBuffer());
}

/* ---------- image → PDF ---------- */
async function ptImagePdf(src) {   // src : canvas (fond transparent → blanc)
  const MAXS = 4000, k = Math.min(1, MAXS / Math.max(src.width, src.height)), w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h);
  const land = w > h, pw = land ? PT_A4.h : PT_A4.w, ph = land ? PT_A4.w : PT_A4.h, m = 28, s = Math.min((pw - 2 * m) / w, (ph - 2 * m) / h), iw = w * s, ih = h * s;
  return ptBuildPdf([{ jpg: await ptJpeg(c, 0.92), pxW: w, pxH: h, pw, ph, x: (pw - iw) / 2, y: (ph - ih) / 2, w: iw, h: ih }]);
}

/* ---------- HTML → PDF (pagination au plus près des lignes de texte) ---------- */
const PT_CSS = `
.pt-doc{font:15px/1.5 Arial,Helvetica,"Liberation Sans",sans-serif;color:#111;background:#fff;word-wrap:break-word;overflow-wrap:anywhere}
.pt-doc h1{font-size:1.8em;margin:.6em 0 .3em}.pt-doc h2{font-size:1.45em;margin:.6em 0 .3em}.pt-doc h3{font-size:1.2em;margin:.6em 0 .3em}.pt-doc p{margin:.4em 0}
.pt-doc ul,.pt-doc ol{padding-left:1.6em;margin:.4em 0}.pt-doc blockquote{margin:.5em 0;padding-left:12px;border-left:3px solid #bbb;color:#444}.pt-doc a{color:#0645ad}
.pt-doc table{border-collapse:collapse;max-width:100%}.pt-doc td,.pt-doc th{border:1px solid #bbb;padding:3px 6px;vertical-align:top}.pt-doc img{max-width:100%;height:auto}.pt-doc pre{white-space:pre-wrap;font:13px/1.45 "Courier New",monospace}
.pt-doc ol.ml{list-style:none;counter-reset:ml;padding-left:0}.pt-doc ol.ml>li{counter-increment:ml;position:relative;padding-left:2.6em}.pt-doc ol.ml>li::before{content:counters(ml,'.') '.';position:absolute;left:0}.pt-doc ol.ml>li.nw{counter-increment:none}.pt-doc ol.ml>li.nw::before{content:none}.pt-doc li.nw{list-style:none}
.pt-doc ul.chk{list-style:none;padding-left:4px}.pt-doc ul.chk>li{position:relative;padding-left:30px;margin:4px 0}
.pt-doc ul.chk>li::before{content:'';position:absolute;left:3px;top:.2em;width:17px;height:17px;border:2px solid #4a5a78;border-radius:5px;box-sizing:border-box;text-align:center;font-size:13px;line-height:13px;color:#fff;font-weight:700}
.pt-doc ul.chk>li.on::before{content:'\\2713';background:#1f9d6a;border-color:#1f9d6a}.pt-doc ul.chk>li.on{color:#777;text-decoration:line-through}
`;
const ptLoadImg = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Rendu des pages impossible dans ce navigateur.')); i.src = src; });
async function ptInlineImages(root) {   // les images d'un SVG rendu comme image ne peuvent pas être externes : on les intègre en data:
  for (const im of root.querySelectorAll('img')) {
    try {
      if (!im.complete) await new Promise(r => { im.onload = im.onerror = r; });
      if (!im.naturalWidth || /^data:/.test(im.src)) continue;
      const c = document.createElement('canvas'), k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)); c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); im.src = c.toDataURL('image/png'); im.removeAttribute('srcset');
    } catch { im.remove(); }
  }
}
function ptBreaks(host, total, pageH) {   // ordonnées (px du contenu) où commencent les pages : jamais au milieu d'une ligne de texte
  const top = host.getBoundingClientRect().top, fr = [], tw = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) { const n = tw.currentNode; if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); for (const q of r.getClientRects()) if (q.height) fr.push([q.top - top, q.bottom - top]); }
  host.querySelectorAll('img,hr,tr,svg,canvas').forEach(e => { const q = e.getBoundingClientRect(); if (q.height && q.height < pageH * 0.9) fr.push([q.top - top, q.bottom - top]); });
  const br = [0]; let y = 0;
  while (y + pageH < total - 1 && br.length < 80) {
    let b = y + pageH;
    for (let k = 0; k < 4; k++) { let moved = false; for (const [a, z] of fr) if (a < b - 1 && z > b + 1 && a > y + pageH * 0.25) { b = a; moved = true; } if (!moved) break; }
    br.push(b); y = b;
  }
  br.push(total); return br;
}
async function ptHtmlPdf(html, css = '', note) {   // html : contenu DÉJÀ assaini (clean()) ou construit par l'application
  const PW = 794, PH = 1123, M = 48, SC = 1.6;   // page A4 à 96 ppp, marges, échelle de rendu (≈ 150 ppp)
  const host = document.createElement('div'); host.className = 'pt-doc'; host.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + (PW - 2 * M) + 'px;visibility:hidden';
  const st = document.createElement('style'); st.textContent = PT_CSS + css; host.append(st); const body = document.createElement('div'); body.innerHTML = html; host.append(body); document.body.append(host);
  try {
    await ptInlineImages(body); if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const cw = Math.min(2400, Math.max(PW - 2 * M, Math.ceil(host.scrollWidth))); host.style.width = cw + 'px'; await new Promise(r => requestAnimationFrame(r));
    const k = (PW - 2 * M) / cw, pageH = Math.floor((PH - 2 * M) / k), total = Math.max(1, Math.ceil(host.scrollHeight)), br = ptBreaks(host, total, pageH);
    if (br.length - 1 > 60) throw new Error('Document trop long pour l’export PDF (60 pages maximum) : utilisez « Imprimer » puis « Enregistrer au format PDF ».');
    const clone = host.cloneNode(true); clone.removeAttribute('style'); clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml'); clone.style.cssText = 'width:' + cw + 'px';
    const xhtml = new XMLSerializer().serializeToString(clone), out = [];
    for (let i = 0; i < br.length - 1; i++) {
      const y0 = br[i], hh = br[i + 1] - y0, svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(cw * k * SC) + '" height="' + Math.max(1, Math.round(hh * k * SC)) + '" viewBox="0 ' + y0 + ' ' + cw + ' ' + hh + '"><foreignObject x="0" y="0" width="' + cw + '" height="' + total + '">' + xhtml + '</foreignObject></svg>';
      const u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      try {
        const img = await ptLoadImg(u), c = document.createElement('canvas'); c.width = Math.round(PW * SC); c.height = Math.round(PH * SC); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, Math.round(M * SC), Math.round(M * SC)); if (note) note(i + 1, br.length - 1);
        out.push({ jpg: await ptJpeg(c, 0.85), pxW: c.width, pxH: c.height, pw: PT_A4.w, ph: PT_A4.h, x: 0, y: 0, w: PT_A4.w, h: PT_A4.h });
      } finally { /* data: URL, rien à libérer */ }
      await new Promise(r => setTimeout(r));
    }
    return ptBuildPdf(out);
  } finally { host.remove(); }
}

/* ---------- impression ---------- */
function ptPrint(nodes, css = '') {   // nodes : nœuds DOM ou chaîne HTML assainie ; la mise en page d'impression est dans style.css (#printroot)
  const old = document.getElementById('printroot'); if (old) old.remove();
  const root = document.createElement('div'); root.id = 'printroot'; root.className = 'pt-doc';
  const st = document.createElement('style'); st.textContent = PT_CSS + css; root.append(st);
  const box = document.createElement('div'); if (typeof nodes === 'string') box.innerHTML = nodes; else box.append(...[].concat(nodes)); root.append(box); document.body.append(root);
  const end = () => { window.removeEventListener('afterprint', end); root.remove(); };
  window.addEventListener('afterprint', end);
  const imgs = [...root.querySelectorAll('img')].filter(i => !i.complete);
  Promise.all(imgs.map(i => new Promise(r => { i.onload = i.onerror = r; }))).then(() => setTimeout(() => { try { window.print(); } catch { /* impression indisponible */ } setTimeout(() => { if (root.isConnected && !window.__ptKeep) end(); }, 1500); }, 60));
}

/* ---------- « Enregistrer en PDF » : appareil ou cloud WebDAV ---------- */
let PT_LAST = '';   // dernière destination choisie (id du cloud, ou '' = cet appareil)
async function ptSaveDialog(name, make) {   // make() → Blob PDF (appelée après le choix, avec message d'attente)
  const base = String(name || 'document').replace(/\.\w{1,5}$/, '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 70) || 'document';
  const r = await dialog('Enregistrer en PDF', [
    { k: 'd', type: 'select', label: 'Où enregistrer le PDF ?', options: [['', 'Sur cet appareil (téléchargement)'], ...D.conns.map(c => [c.id, 'Cloud : ' + c.name])], value: D.conns.some(c => c.id === PT_LAST) ? PT_LAST : '' },
    { k: 'p', label: 'Nom du fichier (cloud : chemin complet, ex. /documents/' + base + '.pdf)', value: '/' + base + '.pdf', max: 300 }], 'Enregistrer');
  if (!r) return false;
  PT_LAST = r.d; const c = D.conns.find(x => x.id === r.d);
  let path = r.p.trim() || base + '.pdf'; if (!/\.pdf$/i.test(path)) path += '.pdf';
  if (c) { if (!path.startsWith('/')) path = '/' + path; if (path.split('/').includes('..') || path.endsWith('/')) { toast('Chemin invalide.'); return false; } }
  const t = toast('Création du PDF…', 0);
  try {
    const b = await make((p, n) => t.set && t.set(tr('Création du PDF : page {0} / {1}…').replace('{0}', p).replace('{1}', n)));
    if (!b) return false;
    if (c) { t.set && t.set('Envoi vers ' + c.name + '…'); await FS.write(c, path, b); toast('PDF enregistré : ' + c.name + ' ' + path, 5000); }
    else { download(b, path.split('/').pop()); toast('PDF téléchargé.', 3500); }
    return true;
  } catch (e) { toast((e && e.message) || 'Création du PDF impossible.', 7000); return false; }
  finally { t.close(); }
}
