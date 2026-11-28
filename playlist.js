'use strict';
/* playlist.js — application intégrée « Playlist Medias » (vidéos et musiques).
   Vous enregistrez le lien direct d'une vidéo (n'importe quel fournisseur), sa miniature et une catégorie ; un clic sur la
   miniature ouvre le lien dans un nouvel onglet. Recherche par mot, filtre par catégorie, sélection multiple, export / import.

   Stockage (aucun serveur) :
   - liens, titres, catégories : dans le profil chiffré de l'utilisateur (D.vp, 5 000 vidéos au maximum) ;
   - miniatures : dans IndexedDB (plus de place que localStorage), par utilisateur, NON chiffrées. la sauvegarde dans votre cloud (« sormick-<id>.media.json »)
     les contient (en clair). (Anciennes versions : miniatures chiffrées avec D.vk,
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
const vpFetchImg = async url => { const h = httpUrl(url); if (!h) throw new Error('Adresse invalide.'); const r = await fetchAny(h); if (!r.ok) throw new Error('Image introuvable.'); const b = await r.blob(); if (!/^image\//.test(b.type)) throw new Error('Ce n’est pas une image.'); return vpMakeThumb(b); };
const ytId = u => {
  try {
    const x = new URL(u), h = x.hostname.replace(/^(www|m)\./, ''); let id = null;
    if (h === 'youtu.be') id = x.pathname.slice(1).split('/')[0];
    else if (h === 'youtube.com') { if (x.pathname === '/watch') id = x.searchParams.get('v'); else { const m = x.pathname.match(/^\/(embed|shorts|live)\/([\w-]+)/); if (m) id = m[2]; } }
    return id && /^[\w-]{6,20}$/.test(id) ? id : null;
  } catch { return null; }
};
/* ---------- image du lien : détection automatique ----------
   1) YouTube / Dailymotion : adresse d'image connue ; 2) Vimeo, SoundCloud, Spotify, Rutube : « oEmbed » (vignette donnée par le fournisseur) ;
   3) toute autre page : balise og:image / twitter:image de la page. Lecture directe, puis par le relais du site s'il est configuré (CORS). */
const VP_OEMBED = [[/(^|\.)vimeo\.com$/, 'https://vimeo.com/api/oembed.json?url='], [/(^|\.)soundcloud\.com$/, 'https://soundcloud.com/oembed?format=json&url='], [/^open\.spotify\.com$/, 'https://open.spotify.com/oembed?url='], [/(^|\.)rutube\.ru$/, 'https://rutube.ru/api/oembed/?format=json&url=']];
const VP_FILE = /\.(mp4|m4v|webm|mkv|mov|avi|ogv|m3u8?|mpd|ts|mp3|m4a|aac|ogg|oga|opus|wav|flac|pls|pdf|zip)$/i;
const vpHead = async (r, max) => {   // début d'une réponse (le reste n'est pas téléchargé)
  if (!r.body || !r.body.getReader) return (await r.text()).slice(0, max);
  const rd = r.body.getReader(), dec = new TextDecoder(); let out = '';
  while (out.length < max) { const { done, value } = await rd.read(); if (done) break; out += dec.decode(value, { stream: true }); }
  try { await rd.cancel(); } catch { /* terminé */ } return out.slice(0, max);
};
const vpMetaImg = (html, base) => {
  for (const re of [/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/i, /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["']/i, /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i]) {
    const m = re.exec(html); if (!m) continue;
    try { const u = new URL(m[1].replace(/&amp;/g, '&').trim(), base); if (u.protocol === 'https:') return u.href; } catch { /* adresse illisible */ }
  }
  return '';
};
async function vpAutoThumb(raw, inf) {
  const img = async a => { try { return a ? await vpFetchImg(a) : null; } catch { return null; } };
  const id = ytId(raw); let b = null;
  if (id) return img('https://i.ytimg.com/vi/' + id + '/hqdefault.jpg');
  if (inf && inf.thumb && (b = await img(inf.thumb))) return b;
  let host = ''; try { host = new URL(raw).hostname.toLowerCase(); } catch { return null; }
  const oe = VP_OEMBED.find(([re]) => re.test(host));
  if (oe) { try { const r = await fetchAny(oe[1] + encodeURIComponent(raw), { signal: AbortSignal.timeout(10000) }); if (r.ok) { const j = await r.json(); if (j && typeof j.thumbnail_url === 'string' && (b = await img(j.thumbnail_url))) return b; } } catch { /* page ci-dessous */ } }
  if (!/^https:\/\//i.test(raw) || VP_FILE.test(new URL(raw).pathname)) return null;   // fichier direct : rien à lire (et on ne le télécharge pas)
  try {
    const r = await fetchAny(raw, { signal: AbortSignal.timeout(12000) }); if (!r.ok || !/html/i.test(r.headers.get('content-type') || '')) return null;
    return img(vpMetaImg(await vpHead(r, 400000), r.url || raw));
  } catch { return null; }
}

/* ---------- capture d'une zone d'un onglet ----------
   Le navigateur demande quel onglet partager ; une image fixe en est tirée puis affichée ici : vous tracez le cadre à garder.
   Rien n'est enregistré ni envoyé : seul le cadre devient la miniature. (Contenus protégés DRM : image noire, c'est voulu par le navigateur.) */
const vpCanCapture = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
async function vpGrabScreen() {
  const ds = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'exclude' });
  try {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = ds; await v.play();
    if (!v.videoWidth) await new Promise(r => { v.onloadedmetadata = r; setTimeout(r, 3000); });
    await new Promise(r => setTimeout(r, 700));   // le temps que la fenêtre de choix disparaisse de l'image
    const c = document.createElement('canvas'); c.width = v.videoWidth || 1280; c.height = v.videoHeight || 720; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); return c;
  } finally { ds.getTracks().forEach(t => t.stop()); }
}
function vpCropper(src, ratio = 16 / 9) {   // → Blob (image du cadre) ou null ; ratio : 16/9 (miniature) ou 1 (icône carrée)
  return new Promise(res => {
    const prev = document.activeElement, cv = el('canvas', { width: src.width, height: src.height, 'aria-label': tr('Capture de l’onglet') }); cv.getContext('2d').drawImage(src, 0, 0);
    const box = el('div', { className: 'vpcrop-sel' }), wrap = el('div', { className: 'vpcrop-w', tabIndex: 0, role: 'application', 'aria-label': tr('Cadre à garder : flèches pour le déplacer, + et − pour le changer de taille, Entrée pour valider') }, cv, box), lock = el('input', { type: 'checkbox', checked: true });
    let r = { x: src.width * .2, y: src.height * .2, w: src.width * .6, h: src.height * .6 }, drag = null;   // en pixels de la capture
    const fit = () => { if (lock.checked) r.h = r.w / ratio; if (r.h > src.height) { r.h = src.height; if (lock.checked) r.w = r.h * ratio; } if (r.w > src.width) { r.w = src.width; if (lock.checked) r.h = r.w / ratio; } r.x = Math.max(0, Math.min(r.x, src.width - r.w)); r.y = Math.max(0, Math.min(r.y, src.height - r.h)); };
    const draw = () => { const k = cv.clientWidth / src.width || 1; Object.assign(box.style, { left: r.x * k + 'px', top: r.y * k + 'px', width: r.w * k + 'px', height: r.h * k + 'px' }); };
    const pt = e => { const b = cv.getBoundingClientRect(), k = src.width / b.width; return { x: Math.max(0, Math.min(src.width, (e.clientX - b.left) * k)), y: Math.max(0, Math.min(src.height, (e.clientY - b.top) * k)) }; };
    wrap.onpointerdown = e => { e.preventDefault(); wrap.setPointerCapture(e.pointerId); drag = pt(e); };
    wrap.onpointermove = e => { if (!drag) return; const p = pt(e); let w = Math.abs(p.x - drag.x), h = Math.abs(p.y - drag.y); if (lock.checked) h = w / ratio;
      const x = p.x >= drag.x ? drag.x : drag.x - w, y = p.y >= drag.y ? drag.y : drag.y - h; r = { x, y, w, h }; if (lock.checked && (y < 0 || y + h > src.height)) { r.h = Math.min(h, p.y >= drag.y ? src.height - drag.y : drag.y); r.w = r.h * ratio; r.x = p.x >= drag.x ? drag.x : drag.x - r.w; r.y = p.y >= drag.y ? drag.y : drag.y - r.h; } draw(); };
    wrap.onpointerup = wrap.onpointercancel = () => { drag = null; };
    lock.onchange = () => { fit(); draw(); };
    /* télécommande / clavier : flèches = déplacer (Maj = plus loin), + / − = taille, Entrée = valider */
    const move = (dx, dy) => { r.x += dx * src.width; r.y += dy * src.height; fit(); draw(); };
    const grow = k => { const cx = r.x + r.w / 2, cy = r.y + r.h / 2, w = Math.max(src.width * .08, r.w * k); r.h = lock.checked ? w / ratio : Math.max(src.height * .08, r.h * k); r.w = w; r.x = cx - r.w / 2; r.y = cy - r.h / 2; fit(); draw(); };
    wrap.onkeydown = e => { const st = e.shiftKey ? .1 : .02, m = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
      if (m) { e.preventDefault(); move(m[0], m[1]); } else if (e.key === '+' || e.key === '=') { e.preventDefault(); grow(1.1); } else if (e.key === '-' || e.key === '_') { e.preventDefault(); grow(1 / 1.1); } else if (e.key === 'Enter') { e.preventDefault(); crop(false); } };
    const done = v => { ov.remove(); window.removeEventListener('resize', draw); if (prev && prev.focus) prev.focus(); res(v); };
    const crop = whole => {
      const q = whole || r.w < 16 || r.h < 16 ? { x: 0, y: 0, w: src.width, h: src.height } : r, c = document.createElement('canvas'); c.width = Math.round(q.w); c.height = Math.round(q.h);
      c.getContext('2d').drawImage(src, q.x, q.y, q.w, q.h, 0, 0, c.width, c.height); c.toBlob(b => b ? done(b) : done(null), 'image/png');
    };
    const ov = el('div', { className: 'ov', style: 'z-index:200100', onkeydown: e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } } },
      el('div', { className: 'dlg vpcrop', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('Capturer une zone d’un onglet'), style: 'width:min(820px,96vw)' },
        el('h3', { textContent: 'Tracez le cadre à garder' }), el('p', { className: 'mut', textContent: ratio === 1 ? 'Faites glisser sur l’image (doigt ou souris) pour dessiner le cadre. L’icône sera ce cadre.' : 'Faites glisser sur l’image (doigt ou souris) pour dessiner le cadre. La miniature sera ce cadre.' }),
        wrap, el('label', { className: 'row tight' }, lock, el('span', { textContent: ratio === 1 ? 'Garder un cadre carré (conseillé pour une icône)' : 'Garder le format 16:9 de la miniature (conseillé)' })),
        el('div', { className: 'row end' }, btn('Annuler', '', () => done(null)), btn('Cadre plus petit', 'minus', () => grow(1 / 1.15)), btn('Cadre plus grand', 'plus', () => grow(1.15)), btn('Image entière', 'image', () => crop(true)), btn('Utiliser ce cadre', 'check', () => crop(false), 'pri'))));
    document.body.append(ov); fit(); requestAnimationFrame(draw); window.addEventListener('resize', draw); setTimeout(() => wrap.focus(), 0);
  });
}
const blobDataUrl = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.readAsDataURL(b); });
const vpNorm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- formulaire d'ajout / modification ---------- */
const vpInfo = u => { try { return typeof chatMediaInfo === 'function' ? chatMediaInfo(u) : null; } catch { return null; } };   // fournisseur reconnu (YouTube, Dailymotion, Rutube, Youku, Spotify, SoundCloud…) : voir chat.js
function vpForm(item, cats, kind0) {
  return new Promise(res => {
    const prev = document.activeElement; let blob = null, removed = false, shownUrl = null, tk = 0;
    const kind1 = item ? (item.k === 'm' ? 'm' : 'v') : (kind0 === 'm' ? 'm' : 'v'), kindSel = el('select', { 'aria-label': tr('Type') }); opts(kindSel, [['v', 'Vidéo'], ['m', 'Musique']]); kindSel.value = kind1;
    const t = el('input', { placeholder: 'Titre', maxLength: 200, value: item ? item.title : '' });
    const u = el('input', { placeholder: 'Lien (vidéo ou musique) : https://…', maxLength: 2000, inputMode: 'url', autocapitalize: 'off', spellcheck: false, value: item ? item.url : '' });
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
    const setImg = async f => { try { blob = await vpMakeThumb(f); removed = false; hint.textContent = tr('Image prête.'); showPrev(); } catch (e) { toast(e.message, 5000); } };
    const fromUrl = async (addr, quiet) => { try { blob = await vpFetchImg(addr); removed = false; hint.textContent = tr('Image récupérée.'); showPrev(); return true; } catch { if (!quiet) toast('Le site refuse le téléchargement de cette image : enregistrez-la sur votre appareil puis choisissez-la ici.', 7000); return false; } };
    file.onchange = () => { const f = file.files[0]; file.value = ''; if (f) setImg(f); };
    /* image automatique : à la saisie / au collage du lien (sans écraser une image déjà choisie) ; le bouton « Détecter l'image du lien » force la recherche */
    let last = item ? item.url : '', pend = null, dk = 0;
    const detect = async manual => {
      let raw = u.value.trim(); if (!raw) { if (manual) toast('Collez d’abord le lien de la vidéo ou de la musique.'); return false; }
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'https://' + raw;
      if (!manual && raw === last) return false; last = raw;
      const inf = vpInfo(raw), pre = inf ? tr('Fournisseur reconnu : {0}.').replace('{0}', inf.name) + ' ' : '';
      if (inf) kindSel.value = inf.kind === 'm' ? 'm' : 'v';
      if (!httpUrl(raw)) return false;
      if (!manual && (blob || (item && item.p && !removed))) { hint.textContent = pre.trim() || hint.textContent; return false; }
      const my = ++dk; hint.textContent = pre + tr('Recherche de l’image…');
      const b = await vpAutoThumb(raw, inf); if (my !== dk) return false;
      if (b && (manual || !blob)) { blob = b; removed = false; hint.textContent = pre + tr('Miniature ajoutée automatiquement.'); showPrev(); return true; }
      hint.textContent = pre + (b ? '' : tr('Aucune image trouvée automatiquement : utilisez « Capturer une zone d’un onglet… » ou « Choisir une image… ».')); if (manual && !b) toast('Aucune image trouvée automatiquement pour ce lien.', 6000); return false;
    };
    u.onchange = () => { pend = detect(false); return pend; };
    u.onpaste = () => setTimeout(() => { if (u.value.trim()) u.onchange(); }, 30);
    const capture = async () => {
      let c; try { c = await vpGrabScreen(); } catch (e) { if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast(tr('Capture impossible : {0}').replace('{0}', e.message || e.name), 6000); return; }
      const b = await vpCropper(c); if (!b) return;
      try { blob = await vpMakeThumb(b); removed = false; hint.textContent = tr('Image prête.'); showPrev(); } catch (e) { toast(e.message, 5000); }
    };
    const submit = async () => {
      { const p = pend || detect(false); try { await p; } catch { /* sans image */ } }   // la miniature automatique en cours de recherche est attendue
      let raw = u.value.trim(); if (raw && !/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'https://' + raw;
      const url = httpUrl(raw); if (!url) { toast('Lien invalide : une adresse http(s):// est requise.'); return u.focus(); }
      done({ title: (t.value.trim() || (vpInfo(url) || {}).name || new URL(url).hostname).slice(0, 200), url, cat: cat.value.trim().slice(0, 40), k: kindSel.value === 'm' ? 'm' : 'v', blob, removed });
    };
    const ov = el('div', { className: 'ov', onkeydown: e => { if (e.key === 'Escape') done(null); if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'file') submit(); },
      ondragover: e => e.preventDefault(), ondrop: e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) setImg(f); },
      onpaste: e => { const it = [...((e.clipboardData && e.clipboardData.items) || [])].find(x => x.type.startsWith('image/')); if (it) { e.preventDefault(); setImg(it.getAsFile()); } } },
      el('div', { className: 'dlg vpform', role: 'dialog', 'aria-modal': 'true', 'aria-label': item ? 'Modifier' : 'Ajouter', style: 'width:min(520px,94vw)' },
        el('h3', { textContent: item ? 'Modifier' : 'Ajouter une vidéo ou une musique' }),
        el('label', { className: 'fld' }, el('span', { textContent: 'Lien (vidéo ou musique)' }), u), el('label', { className: 'fld' }, el('span', { textContent: 'Type' }), kindSel), el('label', { className: 'fld' }, el('span', { textContent: 'Titre' }), t),
        el('label', { className: 'fld' }, el('span', { textContent: 'Catégorie' }), cat), dl,
        el('div', { className: 'row' }, pv, el('div', { className: 'col' },
          btn('Choisir une image…', 'image', () => file.click()),
          btn('Image depuis une adresse…', 'link', async () => { const r = await dialog('Image depuis une adresse', [{ k: 'a', label: 'Adresse de l’image (https://…)', req: true, max: 2000 }], 'Récupérer'); if (r) fromUrl(r.a.trim()); }),
          btn('Détecter l’image du lien', 'search', () => detect(true)),
          ...(vpCanCapture() ? [btn('Capturer une zone d’un onglet…', 'camera', capture)] : []),
          btn('Retirer l’image', 'trash', () => { blob = null; removed = true; hint.textContent = tr('Image retirée.'); showPrev(); }), file)),
        hint,
        el('div', { className: 'row end' }, btn('Annuler', '', () => done(null)), btn(item ? 'Enregistrer' : 'Ajouter', 'save', submit, 'pri'))));
    document.body.append(ov); showPrev(); u.focus();
  });
}

/* ---------- fenêtre « Playlist Medias » ---------- */
function videoPlaylistWin() {
  if (VP.w && VP.w.isConnected) { VP.w.hidden = false; VP.w.style.zIndex = ++Z; return; }
  let shown = VP_PAGE, view = [], selMode = false, rtok = 0, tab = 'v'; const sel = new Set(), kc = new WeakMap();
  const kd = it => it.k === 'm' ? 'm' : 'v', T = (v, m) => tr(tab === 'm' ? m : v), mine = () => D.vp.filter(x => kd(x) === tab);
  const key = it => { let k = kc.get(it); if (!k) { k = vpNorm(it.title + ' ' + it.cat + ' ' + hostOf(it.url) + ' ' + ((vpInfo(it.url) || {}).name || '') + ' ' + it.url); kc.set(it, k); } return k; };
  const cats = () => [...new Set(mine().map(x => x.cat).filter(Boolean))].sort(cmpT);
  const q = el('input', { type: 'search', placeholder: 'Rechercher une vidéo (titre, catégorie, site)…', maxLength: 100, className: 'grow', 'aria-label': 'Rechercher une vidéo' }), tabV = el('button', { type: 'button', className: 'vptab on', role: 'tab', 'aria-selected': 'true', onclick: () => setTab('v') }), tabM = el('button', { type: 'button', className: 'vptab', role: 'tab', 'aria-selected': 'false', onclick: () => setTab('m') });
  const catSel = el('select', { 'aria-label': 'Catégorie' }), sortSel = el('select', { 'aria-label': 'Tri' }); opts(sortSel, [['new', 'Plus récentes'], ['old', 'Plus anciennes'], ['az', 'Titre A → Z']]);
  const stat = el('small', { className: 'mut' }), grid = el('div', { className: 'vpgrid' }), moreB = btn('Afficher plus', 'down', () => more(), ''); moreB.hidden = true;
  const selB = btn('Sélectionner', 'check', () => { selMode = !selMode; if (!selMode) sel.clear(); render(); }, '', 'Cocher plusieurs vidéos pour les supprimer ou les classer');
  const delB = btn('Supprimer', 'trash', () => del(D.vp.filter(x => sel.has(x.id))), 'dng'), catB = btn('Catégorie…', 'edit', () => bulkCat()); delB.hidden = catB.hidden = true;
  const fillCats = () => { const cur = catSel.value; opts(catSel, [['', 'Toutes les catégories'], ...cats().map(c => ['c:' + c, c + ' (' + mine().filter(x => x.cat === c).length + ')']), ['none', 'Sans catégorie']]); catSel.value = [...catSel.options].some(o => o.value === cur) ? cur : ''; };
  const compute = () => {
    const w = vpNorm(q.value).split(/\s+/).filter(Boolean), c = catSel.value;
    view = mine().filter(x => (!c || (c === 'none' ? !x.cat : x.cat === c.slice(2))) && w.every(s => key(x).includes(s)));
    const s = sortSel.value; view.sort(s === 'az' ? (a, b) => a.title.localeCompare(b.title, uiLang(), { numeric: true, sensitivity: 'base' }) : s === 'old' ? (a, b) => a.t - b.t : (a, b) => b.t - a.t);
  };
  const revoke = () => { VP.urls.forEach(u => URL.revokeObjectURL(u)); VP.urls = []; };
  const card = it => {
    const box = el('div', { className: 'vpimg' }), my = rtok;
    const ph = () => box.replaceChildren(el('span', { className: 'vpph', style: 'background:linear-gradient(145deg,hsl(' + hue(it.title) + ' 55% 38%),hsl(' + ((hue(it.title) + 50) % 360) + ' 55% 24%))' }, ico(kd(it) === 'm' ? 'music' : 'play', 34)));
    if (it.p) thumbGet(it.id).then(b => { if (my !== rtok) return; if (!b) return ph(); const u = URL.createObjectURL(b); VP.urls.push(u); box.replaceChildren(el('img', { src: u, alt: '', loading: 'lazy' })); }).catch(ph); else ph();
    const cb = selMode ? el('input', { type: 'checkbox', 'aria-label': 'Sélectionner ' + it.title, checked: sel.has(it.id), onclick: e => e.stopPropagation(), onchange: () => toggle(it, cb.checked) }) : null;
    const open = () => { if (selMode) { cb.checked = !cb.checked; toggle(it, cb.checked); } else openTab(it.url); };
    const c = el('div', { className: 'vpcard' + (sel.has(it.id) ? ' on' : ''), 'data-id': it.id },
      el('button', { type: 'button', className: 'vpopen', title: selMode ? 'Sélectionner' : (kd(it) === 'm' ? 'Ouvrir la musique dans un nouvel onglet' : 'Ouvrir la vidéo dans un nouvel onglet'), 'aria-label': (selMode ? 'Sélectionner « ' : 'Ouvrir « ') + it.title + (selMode ? ' »' : ' » dans un nouvel onglet'), onclick: open }, box),
      cb && el('label', { className: 'vpsel' }, cb),
      el('div', { className: 'vpbody' }, el('b', { className: 'vpt', title: it.title, textContent: it.title }),
        el('div', { className: 'row tight' }, it.cat ? el('span', { className: 'chip', textContent: it.cat }) : null, el('small', { className: 'mut', nt: 1, textContent: (vpInfo(it.url) || {}).name || hostOf(it.url) })),
        el('div', { className: 'row tight' }, btn('', 'edit', () => edit(it), '', 'Modifier'), btn('', 'trash', () => del([it]), 'dng', 'Supprimer'))));
    return c;
  };
  const toggle = (it, on) => { on ? sel.add(it.id) : sel.delete(it.id); const c = grid.querySelector('[data-id="' + CSS.escape(it.id) + '"]'); if (c) c.classList.toggle('on', on); upd(); };
  const upd = () => { delB.hidden = catB.hidden = !selMode; delB.lastChild.textContent = sel.size ? tr('Supprimer') + ' (' + sel.size + ')' : tr('Supprimer'); delB.disabled = catB.disabled = !sel.size; selB.lastChild.textContent = tr(selMode ? 'Terminer' : 'Sélectionner'); };
  const more = () => { const a = Math.min(shown, view.length), b = Math.min(shown + VP_PAGE, view.length); shown = b; grid.append(...view.slice(a, b).map(card)); moreB.hidden = shown >= view.length; moreB.lastChild.textContent = tr('Afficher plus') + ' (' + (view.length - shown) + ')'; };
  const render = () => {
    rtok++; revoke(); fillCats(); compute(); shown = Math.min(VP_PAGE, view.length); upd();
    const nm = mine().length;
    stat.textContent = tr(tab === 'm' ? '{0} musique(s)' : '{0} vidéo(s)').replace('{0}', nm) + (view.length !== nm ? ' · ' + tr('{0} trouvée(s)').replace('{0}', view.length) : '') + (D.vp.length >= VP_MAX ? ' · ' + tr('limite de {0} atteinte').replace('{0}', VP_MAX) : '');
    tabV.textContent = tr('Vidéos') + ' (' + D.vp.filter(x => kd(x) === 'v').length + ')'; tabM.textContent = tr('Musique') + ' (' + D.vp.filter(x => kd(x) === 'm').length + ')';
    q.placeholder = T('Rechercher une vidéo (titre, catégorie, site)…', 'Rechercher une musique (titre, catégorie, site)…'); q.setAttribute('aria-label', q.placeholder);
    grid.replaceChildren(...(view.length ? view.slice(0, shown).map(card) : [el('p', { className: 'mut vpempty', textContent: nm ? T('Aucune vidéo ne correspond à cette recherche.', 'Aucune musique ne correspond à cette recherche.') : T('Aucune vidéo pour le moment. Cliquez sur « Ajouter » : collez le lien d’une vidéo (YouTube, Dailymotion, Rutube, Youku, Vimeo…), ajoutez sa miniature et une catégorie.', 'Aucune musique pour le moment. Cliquez sur « Ajouter » : collez le lien d’un titre ou d’une playlist (Spotify, SoundCloud, Deezer, YouTube Music…), ajoutez une image et une catégorie.') })]));
    moreB.hidden = shown >= view.length; moreB.lastChild.textContent = tr('Afficher plus') + ' (' + (view.length - shown) + ')';
  };
  const setTab = t => { if (tab === t) return; tab = t; sel.clear(); selMode = false; catSel.value = ''; q.value = ''; for (const [b, k] of [[tabV, 'v'], [tabM, 'm']]) { b.classList.toggle('on', k === tab); b.setAttribute('aria-selected', String(k === tab)); } render(); };
  const saveImg = async (it, r) => {
    try { if (r.blob) { await thumbPut(it.id, r.blob); it.p = true; } else if (r.removed && it.p) { await thumbDel([it.id]); it.p = false; } }
    catch { toast('Image non enregistrée : le stockage du navigateur est indisponible.', 6000); }
  };
  const add = async () => {
    if (D.vp.length >= VP_MAX) return toast('Limite de ' + VP_MAX + ' vidéos atteinte : supprimez-en avant d’en ajouter.', 6000);
    const r = await vpForm(null, [...new Set(D.vp.map(x => x.cat).filter(Boolean))].sort(cmpT), tab); if (!r) return;
    const dup = D.vp.find(x => x.url === r.url);
    if (dup && !(await confirmBox('Ce lien est déjà dans la playlist (« ' + dup.title + ' »). L’ajouter quand même ?', 'Ajouter'))) return;
    const it = { id: uid(), title: r.title, url: r.url, cat: r.cat, t: Date.now(), p: false, k: r.k }; await saveImg(it, r);
    D.vp.push(it); save(); if (r.k !== tab) setTab(r.k); else render(); toast(r.k === 'm' ? 'Musique ajoutée.' : 'Vidéo ajoutée.');
  };
  const edit = async it => {
    const r = await vpForm(it, [...new Set(D.vp.map(x => x.cat).filter(Boolean))].sort(cmpT)); if (!r) return;
    it.title = r.title; it.url = r.url; it.cat = r.cat; it.k = r.k; kc.delete(it); await saveImg(it, r); save(); sel.delete(it.id); render();
  };
  const del = async items => {
    if (!items.length) return;
    if (!(await confirmBox(items.length === 1 ? 'Supprimer « ' + items[0].title + ' » (le lien et la miniature) ?' : (tab === 'm' ? 'Supprimer ces ' + items.length + ' musiques (liens et miniatures) ?' : 'Supprimer ces ' + items.length + ' vidéos (liens et miniatures) ?'), 'Supprimer', true))) return;
    const ids = new Set(items.map(x => x.id)); D.vp = D.vp.filter(x => !ids.has(x.id)); ids.forEach(i => sel.delete(i));
    thumbDel([...ids]).catch(() => {}); save(); render(); toast(items.length + (tab === 'm' ? ' musique(s) supprimée(s).' : ' vidéo(s) supprimée(s).'));
  };
  const bulkCat = async () => {
    const r = await dialog('Changer de catégorie', [{ k: 'c', label: 'Nouvelle catégorie (vide = aucune)', max: 40 }], 'Appliquer', { note: sel.size + (tab === 'm' ? ' musique(s) sélectionnée(s).' : ' vidéo(s) sélectionnée(s).') }); if (!r) return;
    for (const x of D.vp) if (sel.has(x.id)) { x.cat = r.c.trim().slice(0, 40); kc.delete(x); } save(); render();
  };
  let qt = 0; q.oninput = () => { clearTimeout(qt); qt = setTimeout(render, 120); }; catSel.onchange = sortSel.onchange = render;
  VP.w = win('Playlist Medias', 'list', [
    pin(el('div', { className: 'vptabs', role: 'tablist' }, tabV, tabM)),
    pin(el('div', { className: 'row' }, q, btn('Ajouter', 'plus', add, 'pri', 'Ajouter une vidéo ou une musique (lien, miniature, catégorie)'))),
    pin(el('div', { className: 'row tight' }, catSel, sortSel, selB, catB, delB, el('span', { className: 'grow' }))),
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

