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
  return el('div', { className: 'row dest' }, ico('cloud', 16), el('span', { className: 'mut', textContent: 'Enregistrer dans :' }), lbl, btn('Choisir…', 'folder', choose, '', 'Choisir le stockage WebDAV et le dossier'), extra);
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
