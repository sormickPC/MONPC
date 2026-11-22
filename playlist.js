'use strict';
/* playlist.js — application intégrée « Playlist vidéos ».
   Vous enregistrez le lien direct d'une vidéo (n'importe quel fournisseur), sa miniature et une catégorie ; un clic sur la
   miniature ouvre le lien dans un nouvel onglet. Recherche par mot, filtre par catégorie, sélection multiple, export / import.

   Stockage (aucun serveur) :
   - liens, titres, catégories : dans le profil chiffré de l'utilisateur (D.vp, 5 000 vidéos au maximum) ;
   - miniatures : dans IndexedDB (plus de place que localStorage), par utilisateur, NON chiffrées. « Exporter mon profil » les
     contient (en clair) ; « Exporter » dans la playlist les exporte aussi. (Anciennes versions : miniatures chiffrées avec D.vk,
     déchiffrées et réécrites en clair à la première lecture.) */

const VP_MAX = 5000, VP_PAGE = 48;
const VP = { w: null, urls: [] };

/* ---------- miniatures (IndexedDB) ---------- */
let VP_DB = null, VP_K = null, VP_KV = '';
const vpDb = () => VP_DB || (VP_DB = new Promise((res, rej) => {
  let r; try { r = indexedDB.open('sormick-media', 1); } catch (e) { VP_DB = null; return rej(e); }
  r.onupgradeneeded = () => r.result.createObjectStore('thumbs');
  r.onsuccess = () => res(r.result); r.onerror = () => { VP_DB = null; rej(r.error || new Error('Stockage du navigateur indisponible.')); };
}));
const vpTx = async (mode, fn) => {
  const db = await vpDb();
  return new Promise((res, rej) => { const tx = db.transaction('thumbs', mode); let rq; try { rq = fn(tx.objectStore('thumbs')); } catch (e) { return rej(e); } tx.oncomplete = () => res(rq ? rq.result : undefined); tx.onerror = tx.onabort = () => rej(tx.error); });
};
const vpKey = async () => {   // clé de l'ancien format chiffré (lecture seule, pour migrer les miniatures déjà enregistrées)
  if (!D.vk) { D.vk = b64e(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); save(); }
  if (VP_K && VP_KV === D.vk) return VP_K;
  VP_KV = D.vk; VP_K = await crypto.subtle.importKey('raw', b64d(D.vk.replace(/-/g, '+').replace(/_/g, '/') + '='), 'AES-GCM', false, ['encrypt', 'decrypt']); return VP_K;
};
const vpId = (id, uid) => (uid || SESSION.user.id) + '/' + id;
/* Miniatures et PDF : enregistrés NON chiffrés, par utilisateur (clé « idUtilisateur/idImage »). */
async function thumbPut(id, blob, uid) {
  const d = await blob.arrayBuffer();
  await vpTx('readwrite', s => s.put({ t: blob.type || '', d }, vpId(id, uid))); if (typeof BK !== 'undefined') BK.media = true;
}
async function thumbGet(id, mime = 'image/jpeg') {
  const v = await vpTx('readonly', s => s.get(vpId(id))); if (!v) return null;
  if (v instanceof ArrayBuffer) {   // ancien format (chiffré) : on déchiffre une fois, puis on réécrit en clair
    const u = new Uint8Array(v); let plain;
    try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12), additionalData: TE.encode(id) }, await vpKey(), u.slice(12)); } catch { return null; }
    const b = new Blob([plain], { type: mime }); thumbPut(id, b).catch(() => {}); return b;
  }
  return v.d ? new Blob([v.d], { type: v.t || mime }) : null;
}
const thumbDel = ids => (typeof BK !== 'undefined' && (BK.media = true), vpTx('readwrite', s => { for (const id of ids) s.delete(vpId(id)); }));
const thumbPurge = userId => vpTx('readwrite', s => s.delete(IDBKeyRange.bound(userId + '/', userId + '/￿')));   // appelée à la suppression d'un compte

/* Image → miniature 320×180 (JPEG), recadrée au centre ; fond noir (transparence). */
const vpMakeThumb = file => new Promise((ok, ko) => {
  if (!file || !/^image\//.test(file.type)) return ko(new Error('Ce fichier n’est pas une image.'));
  if (file.size > 20e6) return ko(new Error('Image trop volumineuse (20 Mo maximum).'));
  const u = URL.createObjectURL(file), i = new Image();
  i.onload = () => {
    try {
      const W = 320, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const k = Math.max(W / i.naturalWidth, H / i.naturalHeight), w = i.naturalWidth * k, h = i.naturalHeight * k; g.drawImage(i, (W - w) / 2, (H - h) / 2, w, h);
      URL.revokeObjectURL(u); c.toBlob(b => b ? ok(b) : ko(new Error('Image illisible.')), 'image/jpeg', 0.78);
    } catch (e) { URL.revokeObjectURL(u); ko(e); }
  };
  i.onerror = () => { URL.revokeObjectURL(u); ko(new Error('Image illisible.')); }; i.src = u;
});
const vpFetchImg = async url => { const h = httpUrl(url); if (!h) throw new Error('Adresse invalide.'); const r = await fetch(h, { credentials: 'omit', referrerPolicy: 'no-referrer' }); if (!r.ok) throw new Error('Image introuvable.'); const b = await r.blob(); if (!/^image\//.test(b.type)) throw new Error('Ce n’est pas une image.'); return vpMakeThumb(b); };
const ytId = u => {
  try {
    const x = new URL(u), h = x.hostname.replace(/^(www|m)\./, ''); let id = null;
    if (h === 'youtu.be') id = x.pathname.slice(1).split('/')[0];
    else if (h === 'youtube.com') { if (x.pathname === '/watch') id = x.searchParams.get('v'); else { const m = x.pathname.match(/^\/(embed|shorts|live)\/([\w-]+)/); if (m) id = m[2]; } }
    return id && /^[\w-]{6,20}$/.test(id) ? id : null;
  } catch { return null; }
};
const blobDataUrl = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.readAsDataURL(b); });
const vpNorm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- formulaire d'ajout / modification ---------- */
function vpForm(item, cats) {
  return new Promise(res => {
    const prev = document.activeElement; let blob = null, removed = false, shownUrl = null, tk = 0;
    const t = el('input', { placeholder: 'Titre de la vidéo', maxLength: 200, value: item ? item.title : '' });
    const u = el('input', { placeholder: 'Lien direct de la vidéo (https://…)', maxLength: 2000, inputMode: 'url', autocapitalize: 'off', spellcheck: false, value: item ? item.url : '' });
    const lid = 'vpc' + uid().slice(0, 6), cat = el('input', { placeholder: 'Catégorie (ex. Documentaires)', maxLength: 40, list: lid, value: item ? item.cat : '' });
    const dl = el('datalist', { id: lid }, ...cats.map(c => el('option', { value: c })));
    const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif', hidden: true });
    const pv = el('div', { className: 'vpimg vpprev' }), hint = el('small', { className: 'mut', textContent: 'Astuce : glissez une image ici ou collez-la (Ctrl+V).' });
    const done = v => { if (shownUrl) URL.revokeObjectURL(shownUrl); ov.remove(); if (prev && prev.focus) prev.focus(); res(v); };
    const showPrev = async () => {
      const my = ++tk; if (shownUrl) { URL.revokeObjectURL(shownUrl); shownUrl = null; }
      let b = blob; if (!b && item && item.p && !removed) b = await thumbGet(item.id).catch(() => null);
      if (my !== tk) return;
      if (!b) return pv.replaceChildren(el('span', { className: 'mut', textContent: 'Aucune image' }));
      shownUrl = URL.createObjectURL(b); pv.replaceChildren(el('img', { src: shownUrl, alt: 'Miniature' }));
    };
    const setImg = async f => { try { blob = await vpMakeThumb(f); removed = false; hint.textContent = 'Image prête.'; showPrev(); } catch (e) { toast(e.message, 5000); } };
    const fromUrl = async (addr, quiet) => { try { blob = await vpFetchImg(addr); removed = false; hint.textContent = 'Image récupérée.'; showPrev(); return true; } catch { if (!quiet) toast('Le site refuse le téléchargement de cette image : enregistrez-la sur votre appareil puis choisissez-la ici.', 7000); return false; } };
    file.onchange = () => { const f = file.files[0]; file.value = ''; if (f) setImg(f); };
    u.onchange = async () => {   // YouTube : miniature automatique si possible (silencieux en cas d'échec)
      const id = ytId(u.value.trim()); if (!id || blob || (item && item.p && !removed)) return;
      if (await fromUrl('https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', true)) hint.textContent = 'Miniature YouTube ajoutée automatiquement.';
    };
    const submit = () => {
      let raw = u.value.trim(); if (raw && !/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'https://' + raw;
      const url = httpUrl(raw); if (!url) { toast('Lien invalide : une adresse http(s):// est requise.'); return u.focus(); }
      done({ title: (t.value.trim() || new URL(url).hostname).slice(0, 200), url, cat: cat.value.trim().slice(0, 40), blob, removed });
    };
    const ov = el('div', { className: 'ov', onkeydown: e => { if (e.key === 'Escape') done(null); if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'file') submit(); },
      ondragover: e => e.preventDefault(), ondrop: e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) setImg(f); },
      onpaste: e => { const it = [...((e.clipboardData && e.clipboardData.items) || [])].find(x => x.type.startsWith('image/')); if (it) { e.preventDefault(); setImg(it.getAsFile()); } } },
      el('div', { className: 'dlg vpform', role: 'dialog', 'aria-modal': 'true', 'aria-label': item ? 'Modifier la vidéo' : 'Ajouter une vidéo', style: 'width:min(520px,94vw)' },
        el('h3', { textContent: item ? 'Modifier la vidéo' : 'Ajouter une vidéo' }),
        el('label', { className: 'fld' }, el('span', { textContent: 'Lien direct de la vidéo' }), u), el('label', { className: 'fld' }, el('span', { textContent: 'Titre' }), t),
        el('label', { className: 'fld' }, el('span', { textContent: 'Catégorie' }), cat), dl,
        el('div', { className: 'row' }, pv, el('div', { className: 'col' },
          btn('Choisir une image…', 'image', () => file.click()),
          btn('Image depuis une adresse…', 'link', async () => { const r = await dialog('Image depuis une adresse', [{ k: 'a', label: 'Adresse de l’image (https://…)', req: true, max: 2000 }], 'Récupérer'); if (r) fromUrl(r.a.trim()); }),
          btn('Retirer l’image', 'trash', () => { blob = null; removed = true; hint.textContent = 'Image retirée.'; showPrev(); }), file)),
        hint,
        el('div', { className: 'row end' }, btn('Annuler', '', () => done(null)), btn(item ? 'Enregistrer' : 'Ajouter', 'save', submit, 'pri'))));
    document.body.append(ov); showPrev(); u.focus();
  });
}

/* ---------- fenêtre « Playlist vidéos » ---------- */
function videoPlaylistWin() {
  if (VP.w && VP.w.isConnected) { VP.w.hidden = false; VP.w.style.zIndex = ++Z; return; }
  let shown = VP_PAGE, view = [], selMode = false, rtok = 0; const sel = new Set(), kc = new WeakMap();
  const key = it => { let k = kc.get(it); if (!k) { k = vpNorm(it.title + ' ' + it.cat + ' ' + hostOf(it.url) + ' ' + it.url); kc.set(it, k); } return k; };
  const cats = () => [...new Set(D.vp.map(x => x.cat).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const q = el('input', { type: 'search', placeholder: 'Rechercher une vidéo (titre, catégorie, site)…', maxLength: 100, className: 'grow', 'aria-label': 'Rechercher une vidéo' });
  const catSel = el('select', { 'aria-label': 'Catégorie' }), sortSel = el('select', { 'aria-label': 'Tri' }); opts(sortSel, [['new', 'Plus récentes'], ['old', 'Plus anciennes'], ['az', 'Titre A → Z']]);
  const stat = el('small', { className: 'mut' }), grid = el('div', { className: 'vpgrid' }), moreB = btn('Afficher plus', 'down', () => more(), ''); moreB.hidden = true;
  const selB = btn('Sélectionner', 'check', () => { selMode = !selMode; if (!selMode) sel.clear(); render(); }, '', 'Cocher plusieurs vidéos pour les supprimer ou les classer');
  const delB = btn('Supprimer', 'trash', () => del(D.vp.filter(x => sel.has(x.id))), 'dng'), catB = btn('Catégorie…', 'edit', () => bulkCat()); delB.hidden = catB.hidden = true;
  const fillCats = () => { const cur = catSel.value; opts(catSel, [['', 'Toutes les catégories'], ...cats().map(c => ['c:' + c, c + ' (' + D.vp.filter(x => x.cat === c).length + ')']), ['none', 'Sans catégorie']]); catSel.value = [...catSel.options].some(o => o.value === cur) ? cur : ''; };
  const compute = () => {
    const w = vpNorm(q.value).split(/\s+/).filter(Boolean), c = catSel.value;
    view = D.vp.filter(x => (!c || (c === 'none' ? !x.cat : x.cat === c.slice(2))) && w.every(s => key(x).includes(s)));
    const s = sortSel.value; view.sort(s === 'az' ? (a, b) => a.title.localeCompare(b.title, 'fr', { numeric: true }) : s === 'old' ? (a, b) => a.t - b.t : (a, b) => b.t - a.t);
  };
  const revoke = () => { VP.urls.forEach(u => URL.revokeObjectURL(u)); VP.urls = []; };
  const card = it => {
    const box = el('div', { className: 'vpimg' }), my = rtok;
    const ph = () => box.replaceChildren(el('span', { className: 'vpph', style: 'background:linear-gradient(145deg,hsl(' + hue(it.title) + ' 55% 38%),hsl(' + ((hue(it.title) + 50) % 360) + ' 55% 24%))' }, ico('play', 34)));
    if (it.p) thumbGet(it.id).then(b => { if (my !== rtok) return; if (!b) return ph(); const u = URL.createObjectURL(b); VP.urls.push(u); box.replaceChildren(el('img', { src: u, alt: '', loading: 'lazy' })); }).catch(ph); else ph();
    const cb = selMode ? el('input', { type: 'checkbox', 'aria-label': 'Sélectionner ' + it.title, checked: sel.has(it.id), onclick: e => e.stopPropagation(), onchange: () => toggle(it, cb.checked) }) : null;
    const open = () => { if (selMode) { cb.checked = !cb.checked; toggle(it, cb.checked); } else openTab(it.url); };
    const c = el('div', { className: 'vpcard' + (sel.has(it.id) ? ' on' : ''), 'data-id': it.id },
      el('button', { type: 'button', className: 'vpopen', title: selMode ? 'Sélectionner' : 'Ouvrir la vidéo dans un nouvel onglet', 'aria-label': (selMode ? 'Sélectionner « ' : 'Ouvrir « ') + it.title + (selMode ? ' »' : ' » dans un nouvel onglet'), onclick: open }, box),
      cb && el('label', { className: 'vpsel' }, cb),
      el('div', { className: 'vpbody' }, el('b', { className: 'vpt', title: it.title, textContent: it.title }),
        el('div', { className: 'row tight' }, it.cat ? el('span', { className: 'chip', textContent: it.cat }) : null, el('small', { className: 'mut', textContent: hostOf(it.url) })),
        el('div', { className: 'row tight' }, btn('', 'edit', () => edit(it), '', 'Modifier'), btn('', 'trash', () => del([it]), 'dng', 'Supprimer'))));
    return c;
  };
  const toggle = (it, on) => { on ? sel.add(it.id) : sel.delete(it.id); const c = grid.querySelector('[data-id="' + CSS.escape(it.id) + '"]'); if (c) c.classList.toggle('on', on); upd(); };
  const upd = () => { delB.hidden = catB.hidden = !selMode; delB.lastChild.textContent = sel.size ? 'Supprimer (' + sel.size + ')' : 'Supprimer'; delB.disabled = catB.disabled = !sel.size; selB.lastChild.textContent = selMode ? 'Terminer' : 'Sélectionner'; };
  const more = () => { const a = Math.min(shown, view.length), b = Math.min(shown + VP_PAGE, view.length); shown = b; grid.append(...view.slice(a, b).map(card)); moreB.hidden = shown >= view.length; moreB.lastChild.textContent = 'Afficher plus (' + (view.length - shown) + ' restantes)'; };
  const render = () => {
    rtok++; revoke(); fillCats(); compute(); shown = Math.min(VP_PAGE, view.length); upd();
    stat.textContent = D.vp.length + ' vidéo(s)' + (view.length !== D.vp.length ? ' · ' + view.length + ' trouvée(s)' : '') + (D.vp.length >= VP_MAX ? ' · limite de ' + VP_MAX + ' atteinte' : '');
    grid.replaceChildren(...(view.length ? view.slice(0, shown).map(card) : [el('p', { className: 'mut vpempty', textContent: D.vp.length ? 'Aucune vidéo ne correspond à cette recherche.' : 'Aucune vidéo pour le moment. Cliquez sur « Ajouter » : collez le lien direct d’une vidéo, ajoutez sa miniature et une catégorie.' })]));
    moreB.hidden = shown >= view.length; moreB.lastChild.textContent = 'Afficher plus (' + (view.length - shown) + ' restantes)';
  };
  const saveImg = async (it, r) => {
    try { if (r.blob) { await thumbPut(it.id, r.blob); it.p = true; } else if (r.removed && it.p) { await thumbDel([it.id]); it.p = false; } }
    catch { toast('Image non enregistrée : le stockage du navigateur est indisponible.', 6000); }
  };
  const add = async () => {
    if (D.vp.length >= VP_MAX) return toast('Limite de ' + VP_MAX + ' vidéos atteinte : supprimez-en avant d’en ajouter.', 6000);
    const r = await vpForm(null, cats()); if (!r) return;
    const dup = D.vp.find(x => x.url === r.url);
    if (dup && !(await confirmBox('Ce lien est déjà dans la playlist (« ' + dup.title + ' »). L’ajouter quand même ?', 'Ajouter'))) return;
    const it = { id: uid(), title: r.title, url: r.url, cat: r.cat, t: Date.now(), p: false }; await saveImg(it, r);
    D.vp.push(it); save(); render(); toast('Vidéo ajoutée.');
  };
  const edit = async it => {
    const r = await vpForm(it, cats()); if (!r) return;
    it.title = r.title; it.url = r.url; it.cat = r.cat; kc.delete(it); await saveImg(it, r); save(); render();
  };
  const del = async items => {
    if (!items.length) return;
    if (!(await confirmBox(items.length === 1 ? 'Supprimer « ' + items[0].title + ' » (le lien et la miniature) ?' : 'Supprimer ces ' + items.length + ' vidéos (liens et miniatures) ?', 'Supprimer', true))) return;
    const ids = new Set(items.map(x => x.id)); D.vp = D.vp.filter(x => !ids.has(x.id)); ids.forEach(i => sel.delete(i));
    thumbDel([...ids]).catch(() => {}); save(); render(); toast(items.length + ' vidéo(s) supprimée(s).');
  };
  const bulkCat = async () => {
    const r = await dialog('Changer de catégorie', [{ k: 'c', label: 'Nouvelle catégorie (vide = aucune)', max: 40 }], 'Appliquer', { note: sel.size + ' vidéo(s) sélectionnée(s).' }); if (!r) return;
    for (const x of D.vp) if (sel.has(x.id)) { x.cat = r.c.trim().slice(0, 40); kc.delete(x); } save(); render();
  };
  let qt = 0; q.oninput = () => { clearTimeout(qt); qt = setTimeout(render, 120); }; catSel.onchange = sortSel.onchange = render;
  VP.w = win('Playlist vidéos', 'list', [
    el('div', { className: 'row' }, q, btn('Ajouter', 'plus', add, 'pri', 'Ajouter une vidéo (lien, miniature, catégorie)')),
    el('div', { className: 'row tight' }, catSel, sortSel, selB, catB, delB, el('span', { className: 'grow' })),
    stat, grid, el('div', { className: 'row center' }, moreB)
  ], { w: 880, h: 640, onclose: () => { rtok++; revoke(); VP.w = null; VP.render = null; } });
  VP.render = render; render();
}

/* ===================== Tutoriel PDF (fichier choisi par l'utilisateur, enregistré non chiffré dans ce navigateur, par utilisateur) ===================== */
const TUTO_ID = 'tuto-pdf', TUTO_MAX = 80 * 1024 * 1024;
async function tutoChoose(thenOpen = true) {
  return new Promise(done => {
    chooseLocal('.pdf,application/pdf', async l => {
      const f = l[0].blob, name = l[0].name;
      try {
        if (!/\.pdf$/i.test(name) && f.type !== 'application/pdf') throw new Error('Choisissez un fichier PDF.');
        if (f.size > TUTO_MAX) throw new Error('PDF trop volumineux (80 Mo maximum).');
        if (new TextDecoder().decode(new Uint8Array(await f.slice(0, 1024).arrayBuffer())).indexOf('%PDF-') < 0) throw new Error('Ce fichier n’est pas un PDF valide.');
        await thumbPut(TUTO_ID, f); D.tuto = { name: name.slice(0, 200) }; save();
        toast('Tutoriel enregistré : ' + D.tuto.name); if (thenOpen) await tutoOpen(true); done(true);
      } catch (e) { toast(e.message || 'Impossible d’enregistrer ce PDF.'); done(false); }
    });
  });
}
async function tutoOpen(skipChoose) {
  let b = null; if (D.tuto) b = await thumbGet(TUTO_ID, 'application/pdf').catch(() => null);
  if (!b) { if (D.tuto) { D.tuto = null; save(); } if (skipChoose) return; toast('Aucun tutoriel : choisissez votre fichier PDF.'); return tutoChoose(true); }
  docWin([{ name: D.tuto.name, blob: b }], 0);
}
async function tutoRemove() {
  if (!D.tuto || !(await confirmBox('Retirer le PDF « ' + D.tuto.name + ' » de cet appareil ? Votre fichier d’origine n’est pas touché.', 'Retirer', true))) return;
  await thumbDel([TUTO_ID]).catch(() => {}); D.tuto = null; save(); toast('Tutoriel retiré.');
}

/* ---------- Sauvegarde : miniatures + PDF du tutoriel (ajoutés, non chiffrés, à l'export du profil ; restaurés à l'import) ---------- */
async function exportMedia() {
  const th = {};
  for (const x of D.vp) if (x.p) { const b = await thumbGet(x.id).catch(() => null); if (b) th[x.id] = await blobDataUrl(b); }
  let tuto = null;
  if (D.tuto) { const b = await thumbGet(TUTO_ID, 'application/pdf').catch(() => null); if (b) tuto = { name: D.tuto.name, data: await blobDataUrl(new Blob([b], { type: 'application/pdf' })) }; }
  return { th, tuto };
}
async function importMedia(uid, m) {
  if (!m || typeof m !== 'object') return;
  const th = m.th && typeof m.th === 'object' ? m.th : {};
  for (const [id, url] of Object.entries(th)) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || id === TUTO_ID || typeof url !== 'string' || url.length > 400000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(url)) continue;
    try { await thumbPut(id, new Blob([b64d(url.slice(23))], { type: 'image/jpeg' }), uid); } catch { /* ignorée */ }
  }
  const t = m.tuto;
  if (t && typeof t.data === 'string' && t.data.length < 110e6 && /^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(t.data)) {
    const bytes = b64d(t.data.slice(28));
    if (bytes.length <= TUTO_MAX && new TextDecoder().decode(bytes.slice(0, 1024)).indexOf('%PDF-') >= 0) await thumbPut(TUTO_ID, new Blob([bytes], { type: 'application/pdf' }), uid);
  }
}

/* Import de vidéos (liens + miniatures) : sans doublon (même adresse), nouveaux identifiants. Utilisé par « Importer mes données ». */
async function importPlaylistItems(items) {
  const have = new Set(D.vp.map(x => x.url)); let n = 0, skip = 0;
  for (const x of Array.isArray(items) ? items : []) {
    if (D.vp.length >= VP_MAX) { skip++; continue; }
    const url = x && httpUrl(x.url); if (!url || have.has(url)) { skip++; continue; }
    const it = { id: uid(), title: str(x.title, 200) || new URL(url).hostname, url, cat: str(x.cat, 40), t: Number.isFinite(x.t) ? x.t : Date.now(), p: false };
    if (typeof x.img === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(x.img) && x.img.length < 400000) { try { await thumbPut(it.id, new Blob([b64d(x.img.slice(23))], { type: 'image/jpeg' })); it.p = true; } catch { /* sans image */ } }
    D.vp.push(it); have.add(url); n++;
  }
  if (n) save();
  if (VP.w && VP.render) VP.render();
  return { n, skip };
}
