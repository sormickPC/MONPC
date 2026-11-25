'use strict';
/* draw.js — application intégrée « Dessin » : crayon, gomme, formes, pot de peinture, texte, annuler / rétablir,
   ouverture d'une image (appareil ou WebDAV) et enregistrement en PNG sur le stockage WebDAV de votre choix (ou téléchargement). */

function drawWin() {
  let W = 1000, H = 650, bg = 'white', tool = 'pen', color = '#1f2937', size = 6, fillShape = false, down = false, sx = 0, sy = 0, lx = 0, ly = 0, snap = null;
  const undo = [], redo = [], MAXU = 20;
  const cv = el('canvas', { width: W, height: H, className: 'dr-cv', tabIndex: 0, 'aria-label': 'Zone de dessin' });
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const paintBg = () => { ctx.globalCompositeOperation = 'source-over'; if (bg === 'white') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); } else ctx.clearRect(0, 0, W, H); };
  paintBg();
  const pushU = () => { try { undo.push(ctx.getImageData(0, 0, W, H)); if (undo.length > MAXU) undo.shift(); redo.length = 0; syncU(); } catch { /* mémoire */ } };
  const restore = d => { if (d.width !== W || d.height !== H) { W = cv.width = d.width; H = cv.height = d.height; } ctx.putImageData(d, 0, 0); };
  const doUndo = () => { if (!undo.length) return; redo.push(ctx.getImageData(0, 0, W, H)); restore(undo.pop()); syncU(); };
  const doRedo = () => { if (!redo.length) return; undo.push(ctx.getImageData(0, 0, W, H)); restore(redo.pop()); syncU(); };
  const uB = btn('', 'undo', doUndo, '', 'Annuler (Ctrl+Z)'), rB = btn('', 'redo', doRedo, '', 'Rétablir (Ctrl+Y)');
  const syncU = () => { uB.disabled = !undo.length; rB.disabled = !redo.length; }; syncU();
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  const style = () => { ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = size; ctx.strokeStyle = ctx.fillStyle = color; ctx.globalCompositeOperation = tool === 'eraser' && bg !== 'white' ? 'destination-out' : 'source-over'; if (tool === 'eraser' && bg === 'white') ctx.strokeStyle = '#fff'; };
  const shape = (x, y) => {
    ctx.putImageData(snap, 0, 0); style(); ctx.beginPath();
    if (tool === 'line') { ctx.moveTo(sx, sy); ctx.lineTo(x, y); ctx.stroke(); }
    else if (tool === 'rect') { fillShape ? ctx.fillRect(sx, sy, x - sx, y - sy) : ctx.strokeRect(sx, sy, x - sx, y - sy); }
    else { ctx.ellipse((sx + x) / 2, (sy + y) / 2, Math.abs(x - sx) / 2, Math.abs(y - sy) / 2, 0, 0, Math.PI * 2); fillShape ? ctx.fill() : ctx.stroke(); }
  };
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255];
  function flood(x, y) {   // pot de peinture : remplit la zone de même couleur (tolérance légère)
    x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= W || y >= H) return;
    const img = ctx.getImageData(0, 0, W, H), d = img.data, i0 = (y * W + x) * 4, t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]], n = hex(color), tol = 40;
    const same = i => Math.abs(d[i] - t[0]) + Math.abs(d[i + 1] - t[1]) + Math.abs(d[i + 2] - t[2]) + Math.abs(d[i + 3] - t[3]) <= tol;
    if (Math.abs(n[0] - t[0]) + Math.abs(n[1] - t[1]) + Math.abs(n[2] - t[2]) + Math.abs(n[3] - t[3]) <= 8) return;
    const st = [x, y]; const seen = new Uint8Array(W * H);
    while (st.length) {
      let cy = st.pop(), cx = st.pop(); let i = cy * W + cx;
      while (cx >= 0 && !seen[i] && same(i * 4)) { cx--; i--; } cx++; i++;
      let up = false, dn2 = false;
      while (cx < W && !seen[i] && same(i * 4)) {
        seen[i] = 1; const p = i * 4; d[p] = n[0]; d[p + 1] = n[1]; d[p + 2] = n[2]; d[p + 3] = 255;
        if (cy > 0) { const u = i - W; if (!seen[u] && same(u * 4)) { if (!up) { st.push(cx, cy - 1); up = true; } } else up = false; }
        if (cy < H - 1) { const dd = i + W; if (!seen[dd] && same(dd * 4)) { if (!dn2) { st.push(cx, cy + 1); dn2 = true; } } else dn2 = false; }
        cx++; i++;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  cv.onpointerdown = async e => {
    if (e.button > 0) return; e.preventDefault(); cv.focus();
    const [x, y] = pos(e);
    if (tool === 'fill') { pushU(); flood(x, y); return; }
    if (tool === 'text') {
      const r = await dialog('Texte', [{ k: 't', label: 'Texte à écrire', req: true, max: 200 }], 'Écrire'); if (!r) return;
      pushU(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = color; ctx.font = `600 ${Math.max(12, size * 4)}px system-ui, sans-serif`; ctx.textBaseline = 'top'; ctx.fillText(r.t, x, y); return;
    }
    pushU(); down = true; cv.setPointerCapture(e.pointerId); sx = lx = x; sy = ly = y;
    if (tool === 'pen' || tool === 'eraser') { style(); ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fillStyle = tool === 'eraser' && bg === 'white' ? '#fff' : color; ctx.fill(); }
    else snap = ctx.getImageData(0, 0, W, H);
  };
  cv.onpointermove = e => {
    if (!down) return; const [x, y] = pos(e);
    if (tool === 'pen' || tool === 'eraser') { style(); const p = e.pressure && e.pointerType === 'pen' ? Math.max(.25, e.pressure * 1.6) : 1; ctx.lineWidth = size * p; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(x, y); ctx.stroke(); lx = x; ly = y; }
    else shape(x, y);
  };
  cv.onpointerup = cv.onpointercancel = () => { down = false; snap = null; ctx.globalCompositeOperation = 'source-over'; };
  cv.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); } };
  /* ----- barre d'outils ----- */
  const TOOLS = [['pen', 'edit', 'Crayon'], ['eraser', 'eraser', 'Gomme'], ['line', 'minus', 'Ligne'], ['rect', 'square', 'Rectangle'], ['ellipse', 'circle', 'Ellipse'], ['fill', 'drop', 'Pot de peinture'], ['text', 'text', 'Texte']];
  const tb = TOOLS.map(([k, ic, t]) => { const b = btn('', ic, () => { tool = k; mark(); }, 'dr-tool', t); b.dataset.t = k; return b; });
  const mark = () => tb.forEach(b => b.classList.toggle('on', b.dataset.t === tool));
  const col = el('input', { type: 'color', value: '#1f2937', 'aria-label': 'Couleur', className: 'dr-col', oninput: () => { color = col.value; } });
  const PAL = ['#000000', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#92400e', '#6b7280'];
  const pal = el('span', { className: 'dr-pal' }, ...PAL.map(c => el('button', { type: 'button', className: 'dr-sw', style: 'background:' + c, title: c, 'aria-label': 'Couleur ' + c, onclick: () => { color = c; col.value = c; } })));
  const sz = el('input', { type: 'range', min: 1, max: 60, value: size, 'aria-label': 'Épaisseur', oninput: () => { size = +sz.value; } });
  const fl = el('input', { type: 'checkbox', onchange: () => { fillShape = fl.checked; } });
  const nameIn = el('input', { value: 'dessin_' + stamp(), maxLength: 80, 'aria-label': 'Nom du fichier', className: 'grow' });
  const newDraw = async () => {
    const r = await dialog('Nouveau dessin', [{ k: 'w', label: 'Largeur (px)', type: 'number', value: String(W), max: 4 }, { k: 'h', label: 'Hauteur (px)', type: 'number', value: String(H), max: 4 }, { k: 'bg', label: 'Fond', type: 'select', options: [['white', 'Blanc'], ['clear', 'Transparent']], value: bg }], 'Créer', { note: 'Le dessin actuel sera effacé (vous pouvez l’annuler avec Ctrl+Z).', check: v => (+v.w < 100 || +v.w > 3000 || +v.h < 100 || +v.h > 3000) ? 'Taille : de 100 à 3000 pixels.' : '' }); if (!r) return;
    pushU(); W = cv.width = Math.round(+r.w); H = cv.height = Math.round(+r.h); bg = r.bg; paintBg(); nameIn.value = 'dessin_' + stamp();
  };
  const loadImg = async blob => {
    let bm; try { bm = await createImageBitmap(blob); } catch { return toast('Image illisible.'); }
    pushU(); const k = Math.min(1, 3000 / Math.max(bm.width, bm.height)); W = cv.width = Math.round(bm.width * k); H = cv.height = Math.round(bm.height * k); bg = 'white'; paintBg(); ctx.drawImage(bm, 0, 0, W, H);
  };
  const fileIn = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, onchange: () => { const f = fileIn.files[0]; fileIn.value = ''; if (f) { loadImg(f); nameIn.value = 'dessin_' + stamp(); } } });
  const openCloud = async () => {
    const c = recConn('draw'); if (!c) return toast('Choisissez d’abord un stockage WebDAV comme destination (« Choisir… »).', 5000);
    try {
      const it = (await FS.list(c, D.rec.draw.path)).filter(x => !x.dir && /\.(png|jpe?g|webp|gif)$/i.test(x.name)).sort((a, b) => String(b.name).localeCompare(String(a.name)));
      if (!it.length) return toast('Aucune image dans ce dossier.');
      const r = await dialog('Ouvrir depuis le cloud', [{ k: 'f', label: 'Image', type: 'select', options: it.map(x => [x.name, x.name + ' (' + fmtSize(x.size) + ')']) }], 'Ouvrir'); if (!r) return;
      const t = toast('Chargement…', 0); try { await loadImg(await FS.read(c, joinP(D.rec.draw.path, r.f), 'image/png')); nameIn.value = r.f.replace(/\.\w+$/, ''); } finally { t.close(); }
    } catch (e) { toast(e.message, 6000); }
  };
  const toBlob = () => new Promise(res => cv.toBlob(res, 'image/png'));
  const dest = destBar('draw');
  const saveCloud = async () => {
    if (!recConn('draw') && D.conns.length) { if (!await dest.choose()) return; }   // aucun cloud retenu : on propose d'abord le choix du stockage et du dossier
    const b = await toBlob(); if (!b) return toast('Export impossible.');
    const name = safeName(nameIn.value.replace(/\.png$/i, ''), 70) + '.png';
    await recQueue('draw').push(b, name);
  };
  const dl = async () => { const b = await toBlob(); if (b) download(b, safeName(nameIn.value.replace(/\.png$/i, ''), 70) + '.png'); };
  const w = win('Dessin', 'brush', [
    el('div', { className: 'dr-bar' }, ...tb, el('span', { className: 'dr-sep' }), col, pal, el('label', { className: 'dr-sz' }, ico('minus', 14), sz), el('label', { className: 'chk' }, fl, el('span', { textContent: 'Formes pleines' })), el('span', { className: 'dr-sep' }), uB, rB),
    el('div', { className: 'row' }, btn('Nouveau', 'plus', newDraw), btn('Ouvrir (appareil)…', 'upload', () => fileIn.click()), btn('Ouvrir (cloud)…', 'cloud', openCloud), btn('Effacer', 'trash', () => { pushU(); paintBg(); }, 'dng'), fileIn),
    el('div', { className: 'dr-wrap' }, cv),
    dest,
    el('div', { className: 'row' }, nameIn, btn('Enregistrer sur le cloud', 'save', saveCloud, 'pri'), btn('Télécharger', 'download', dl))], { w: 900, h: 720, cls: 'drw' });
  mark(); return w;
}
