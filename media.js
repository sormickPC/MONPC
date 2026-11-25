'use strict';
/* media.js — outils communs à Sormick Radio, Sormick TV, l'enregistreur d'écran et l'application de dessin.
   - destination d'enregistrement : un stockage WebDAV (ou « cet appareil ») + un dossier, retenus par application (D.rec[...]) ;
   - envoi des fichiers (file d'attente, un fichier à la fois) ; si l'envoi échoue, le fichier reste téléchargeable ;
   - lecture d'adresses externes avec bascule automatique par le relais du site quand le serveur n'autorise pas l'accès direct (CORS) ;
   - enregistrement d'un flux audio/vidéo continu (radio, flux direct) par lecture du flux, découpé en fichiers.
   Les fonctions sont appelées après le chargement de app.js (el, btn, FS, pickFolder… y sont définis). */

const REC_MAXMEM = 160 * 1048576;   // au-delà, le fichier en cours est envoyé et un nouveau commence (le navigateur garde tout en mémoire)
const pad2 = n => String(n).padStart(2, '0');
const stamp = (d = new Date()) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + '_' + pad2(d.getHours()) + 'h' + pad2(d.getMinutes()) + 'm' + pad2(d.getSeconds());
const safeName = (s, n = 40) => (String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, n)) || 'sans-nom';
const fmtDur = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + pad2(m) : m) + ':' + pad2(s % 60); };
const SEG_LABELS = [[0, 'Un seul fichier'], [5, 'Un fichier toutes les 5 min'], [10, 'Un fichier toutes les 10 min'], [15, 'Un fichier toutes les 15 min'], [30, 'Un fichier toutes les 30 min'], [60, 'Un fichier toutes les 60 min']];

/* ---------- destination ---------- */
const recConn = k => D.conns.find(c => c.id === D.rec[k].cid) || null;
const recWhere = k => { const c = recConn(k); return c ? c.name + ' · ' + D.rec[k].path : 'Cet appareil (téléchargement)'; };
function destBar(k, extra) {   // « Enregistrer dans : … [Choisir…] » (+ réglages propres à l'application dans extra)
  const lbl = el('b', { className: 'dest-w', textContent: recWhere(k) });
  const choose = async () => {
    const r = await dialog('Où enregistrer ?', [{ k: 'c', label: 'Stockage', type: 'select', options: [['', 'Cet appareil (téléchargement)'], ...D.conns.map(c => [c.id, c.name])], value: D.rec[k].cid }], 'Suivant',
      { note: D.conns.length ? 'Choisissez l’un de vos stockages WebDAV, puis le dossier de destination.' : 'Aucun stockage WebDAV n’est encore connecté (application « Stockage cloud ») : les fichiers seront téléchargés sur cet appareil.' });
    if (!r) return;
    const c = D.conns.find(x => x.id === r.c);
    if (!c) { D.rec[k].cid = ''; D.rec[k].path = '/'; save(); lbl.textContent = recWhere(k); return; }
    const p = await pickFolder(c, D.rec[k].cid === c.id ? D.rec[k].path : '/', 'Dossier d’enregistrement');
    if (p == null) return;
    D.rec[k].cid = c.id; D.rec[k].path = p; save(); lbl.textContent = recWhere(k);
  };
  const bar = el('div', { className: 'row dest' }, ico('cloud', 16), el('span', { className: 'mut', textContent: 'Enregistrer dans :' }), lbl, btn('Choisir…', 'folder', choose, '', 'Choisir le stockage WebDAV et le dossier'), extra);
  bar.choose = async () => { await choose(); return recConn(k); };   // permet à un bouton « Enregistrer » de proposer le choix quand aucun cloud n'est retenu
  return bar;
}
function segSelect(k) {
  const s = el('select', { 'aria-label': 'Découpage des fichiers', title: 'Découpage des fichiers' }); opts(s, SEG_LABELS); s.value = String(D.rec[k].seg);
  s.onchange = () => { D.rec[k].seg = +s.value; save(); }; return s;
}

/* ---------- envoi : file d'attente, un fichier à la fois ---------- */
function recQueue(k, onstat) {
  let chain = Promise.resolve(), pending = 0, sent = 0, failed = 0;
  const stat = () => onstat && onstat({ pending, sent, failed });
  return {
    get state() { return { pending, sent, failed }; },
    push(blob, name) {
      pending++; stat();
      chain = chain.then(async () => {
        const c = recConn(k);
        try {
          if (c) { await FS.write(c, joinP(D.rec[k].path, name), blob); toast('Enregistré sur « ' + c.name + ' » : ' + name + ' (' + fmtSize(blob.size) + ')', 5000); }
          else { download(blob, name); toast('Fichier téléchargé : ' + name, 4000); }
          sent++;
        } catch (e) { failed++; toastAct('Envoi impossible (' + name + ') : ' + e.message, 'Télécharger sur l’appareil', () => download(blob, name), 20000); }
        pending--; stat();
      });
      return chain;
    },
    idle: () => chain
  };
}

/* ---------- lecture d'adresses externes (direct, puis relais) ---------- */
const NEEDS_RELAY = new Set();   // hôtes qui ont refusé l'accès direct pendant cette session
async function fetchAny(url, init = {}) {
  if (!/^https:\/\//i.test(url)) throw new Error('Adresse non sécurisée (http) : le navigateur bloque ces flux sur un site https. Utilisez une adresse https://.');
  const host = new URL(url).host, base = { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow', ...init };
  const viaRel = async () => {
    const cfg = relayCfg(); let r;
    try { r = await fetch(viaRelay(url), { ...base, headers: { ...(init.headers || {}), ...(cfg.tok ? { 'X-Relay-Token': cfg.tok } : {}) } }); }
    catch (e) { if (e && e.name === 'AbortError') throw e; throw new Error('Ce serveur refuse l’accès direct depuis un site web (CORS) et le relais du site est injoignable.'); }
    if (r.headers.get('X-Relay-Error')) throw relayErr(r);
    return r;
  };
  if (NEEDS_RELAY.has(host) && relayOn()) return viaRel();
  try { return await fetch(url, base); }
  catch (e) {
    if (e && e.name === 'AbortError') throw e;
    if (!relayOn()) throw new Error('Ce serveur n’autorise pas la lecture depuis un site web (CORS). Configurez le relais du site (Stockage cloud → Relais) pour pouvoir l’utiliser.');
    NEEDS_RELAY.add(host); return viaRel();
  }
}

/* ---------- enregistrement d'un flux continu (radio, flux vidéo direct) ---------- */
const EXT_BY_TYPE = [[/mpeg|mp3/, 'mp3'], [/aac|aacp/, 'aac'], [/ogg|opus/, 'ogg'], [/mp4|m4a/, 'm4a'], [/mp2t|mpegts/, 'ts'], [/webm/, 'webm'], [/flac/, 'flac']];
const extOfType = (t, def) => { t = String(t || '').toLowerCase(); const m = EXT_BY_TYPE.find(([r]) => r.test(t)); return m ? m[1] : def; };
/* → { stop(), done: Promise<{parts, bytes, error}> } ; o = { url, k, prefix, label, seg (minutes), queue, onstat, first (Response déjà ouverte), defExt } */
function recordStream(o) {
  const ctl = new AbortController(); let stopped = false, bytes = 0, parts = 0;
  const t0 = Date.now();
  const run = async () => {
    let tries = 0, err = '', first = o.first || null;
    while (!stopped) {
      let r = first; first = null;
      try {
        r = r || await fetchAny(o.url, { signal: ctl.signal });
        if (!r.ok || !r.body) throw new Error('Le flux répond « ' + r.status + ' ».');
        const ext = extOfType(r.headers.get('content-type'), o.defExt || 'mp3'), rd = r.body.getReader();
        let chunks = [], size = 0, partStart = Date.now(); tries = 0;
        const flush = async final => {
          if (!size) return;
          const multi = o.seg > 0 || parts > 0 || !final; parts++;
          const name = o.prefix + '_' + safeName(o.label) + '_' + stamp(new Date(partStart)) + (multi ? '_p' + parts : '') + '.' + ext;
          const b = new Blob(chunks, { type: String(r.headers.get('content-type') || 'application/octet-stream').split(';')[0] }); chunks = []; size = 0; partStart = Date.now();
          o.queue.push(b, name);
        };
        try {
          for (;;) {
            const { done, value } = await rd.read(); if (done) break;
            chunks.push(value); size += value.length; bytes += value.length;
            o.onstat && o.onstat({ bytes, secs: (Date.now() - t0) / 1000, parts });
            const segMs = o.seg > 0 && ext !== 'ogg' ? o.seg * 60000 : 0;
            if (size > REC_MAXMEM || (segMs && Date.now() - partStart >= segMs)) await flush(false);
          }
        } catch (e) { if (!stopped) err = e.message || 'Flux interrompu.'; }
        await flush(stopped);   // le dernier morceau (ou ce qui a été reçu avant une coupure) est toujours envoyé
        if (stopped) break;
        if (++tries > 5) throw new Error(err || 'Le flux s’est arrêté.');
        await new Promise(res => setTimeout(res, 2500));   // coupure : on se reconnecte (nouveau fichier)
      } catch (e) {
        if (stopped || (e && e.name === 'AbortError')) break;
        if (++tries > 5 || !bytes) { err = e.message; break; }
        err = e.message; await new Promise(res => setTimeout(res, 2500));
      }
    }
    return { parts, bytes, error: stopped ? '' : err };
  };
  const done = run();
  return { stop: () => { stopped = true; ctl.abort(); return done; }, done };
}

/* ---------- titre en cours (métadonnées ICY) et paroles (LRCLIB) ---------- */
/* Lecture du titre en cours d'une radio : le flux est relu avec l'en-tête « Icy-MetaData: 1 » ; le serveur insère alors le titre toutes les « icy-metaint » octets.
   Meilleure tentative : ne fonctionne que si le serveur autorise cet en-tête depuis un site web (CORS, cas d'Icecast) ; sinon rien ne se passe (la recherche manuelle reste possible). */
function icyWatch(url, onTitle) {
  const ctl = new AbortController();
  (async () => {
    try {
      const r = await fetch(url, { headers: { 'Icy-MetaData': '1' }, signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      const mi = +r.headers.get('icy-metaint');
      if (!r.ok || !(mi > 0 && mi <= 65536) || !r.body) { ctl.abort(); return; }
      const rd = r.body.getReader(); let st = 0, left = mi, parts = [], last = '';   // st : 0 audio, 1 octet de longueur, 2 métadonnées
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        for (let i = 0; i < value.length;) {
          if (st === 0) { const k = Math.min(left, value.length - i); i += k; left -= k; if (!left) st = 1; }
          else if (st === 1) { left = value[i++] * 16; if (left) { st = 2; parts = []; } else { st = 0; left = mi; } }
          else {
            const k = Math.min(left, value.length - i); parts.push(value.subarray(i, i + k)); i += k; left -= k;
            if (!left) {
              const b = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { b.set(p, o); o += p.length; }
              let s = new TextDecoder('utf-8').decode(b); if (s.includes('�')) s = new TextDecoder('latin1').decode(b);
              const t = (/StreamTitle='([^]*?)';/.exec(s) || [])[1];
              if (t && t.trim() && t.trim() !== last) { last = t.trim(); onTitle(last.slice(0, 200)); }
              st = 0; left = mi;
            }
          }
        }
      }
    } catch { /* serveur sans CORS pour cet en-tête, flux arrêté ou radio changée : silence */ }
  })();
  return { stop: () => ctl.abort() };
}
/* « Artiste - Titre » (parenthèses et crochets de version retirés) → { artist, title } */
function splitSong(s) {
  s = String(s || '').replace(/\s*[\[(][^\])]*(?:radio|edit|remaster|live|version|mix|feat)[^\])]*[\])]/gi, '').replace(/\s+/g, ' ').trim();
  const i = s.search(/\s[-–—]\s/);
  return i > 0 ? { artist: s.slice(0, i).trim(), title: s.slice(i).replace(/^\s[-–—]\s/, '').trim() } : { artist: '', title: s };
}
/* Paroles : LRCLIB (lrclib.net), base libre et gratuite, sans clé ; seule la recherche « artiste / titre » est envoyée. */
async function lyricsFind(artist, title) {
  const get = async q => {
    const r = await fetch('https://lrclib.net/api/search?' + new URLSearchParams(q), { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000) });
    if (r.status === 429) throw new Error('Trop de recherches : patientez une minute.');
    if (!r.ok) throw new Error('LRCLIB a répondu « ' + r.status + ' ».');
    const a = await r.json(); return Array.isArray(a) ? a : [];
  };
  let a = await get(artist ? { track_name: title, artist_name: artist } : { q: title });
  if (!a.length && artist) a = await get({ q: artist + ' ' + title });
  return a.filter(x => x && (x.instrumental || x.plainLyrics || x.syncedLyrics)).slice(0, 8).map(x => ({
    label: String(x.artistName || '?').slice(0, 80) + ' — ' + String(x.trackName || '?').slice(0, 100), instrumental: !!x.instrumental,
    text: String(x.plainLyrics || String(x.syncedLyrics || '').replace(/^\[[^\]]*\]\s?/gm, '')).slice(0, 20000) }));
}
