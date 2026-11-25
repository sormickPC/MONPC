'use strict';
/* tv.js — application intégrée « Sormick TV » (lecteur IPTV / M3U).
   - « Catalogue » : les listes M3U publiques du projet iptv-org (https://github.com/iptv-org/iptv), classées par LANGUE, CATÉGORIE ou PAYS ; chargées à la demande.
   - « Mes listes » : vos propres adresses M3U (ajout, modification, suppression, langue au choix) + ouverture d'un fichier .m3u de l'appareil.
   - « Mes chaînes » : vos favoris, modifiables.
   - Lecture dans le navigateur (HLS natif : Chrome, Edge, Safari ; seules les adresses https sont lisibles sur un site https).
   - Bouton d'enregistrement : flux HLS (ou flux direct) copié par morceaux vers le stockage WebDAV de votre choix. Les fichiers .ts / .mp4 se lisent avec VLC. */

function parseM3U(txt) {
  const out = []; let cur = null; out.epg = [];
  for (const raw of String(txt).split(/\r?\n/)) {
    const l = raw.trim(); if (!l) continue;
    if (l.startsWith('#EXTM3U')) { const g = {}; for (const m of l.matchAll(/([\w-]+)="([^"]*)"/g)) g[m[1].toLowerCase()] = m[2]; out.epg = String(g['url-tvg'] || g['x-tvg-url'] || g['tvg-url'] || '').split(',').map(s => s.trim()).filter(s => /^https:\/\//i.test(s)).slice(0, 3); }
    else if (l.startsWith('#EXTINF')) {
      const a = {}; for (const m of l.matchAll(/([\w-]+)="([^"]*)"/g)) a[m[1].toLowerCase()] = m[2];
      const nm = l.match(/^#EXTINF:[^,"]*(?:\s+[\w.-]+="[^"]*")*\s*,(.*)$/) || l.match(/,([^,"]*)$/);
      cur = { name: ((nm && nm[1].trim()) || a['tvg-name'] || '').slice(0, 120) || 'Sans nom', logo: a['tvg-logo'] || '', group: (a['group-title'] || '').split(';')[0].slice(0, 60), lang: (a['tvg-language'] || '').slice(0, 40), tvg: (a['tvg-id'] || '').slice(0, 80) };
    } else if (l.startsWith('#')) continue;
    else if (/^https?:\/\//i.test(l)) { out.push({ ...(cur || { name: l.slice(0, 120), logo: '', group: '', lang: '', tvg: '' }), url: l }); cur = null; }
  }
  return out;
}
const tvCode = (k, c) => k === 'languages' ? IPTV_LANGS[c] : k === 'categories' ? IPTV_CATS[c] : '';
function tvLabel(k, c) {
  if (k === 'categories') return IPTV_CATS[c] || c;
  if (k === 'countries') return c === 'int' ? 'International' : c === 'undefined' ? 'Non classé' : (() => { try { return new Intl.DisplayNames([uiLang()], { type: 'region' }).of(c === 'uk' ? 'GB' : c.toUpperCase()) || c; } catch { return c; } })();
  if (c === 'undefined') return 'Non classé';
  try { const v = new Intl.DisplayNames([uiLang()], { type: 'language' }).of(c); if (v && v !== c) return capFirst(v); } catch { /* nom anglais ci-dessous */ }
  return IPTV_LANGS[c] || c;
}

/* ---------- enregistrement HLS ---------- */
function m3u8Parse(text, base) {
  const abs = u => new URL(u, base).href; let seq = 0, td = 6, dur = 0, map = '', enc = false, ended = false; const segs = [];
  for (let l of text.split(/\r?\n/)) {
    l = l.trim();
    if (l.startsWith('#EXT-X-MEDIA-SEQUENCE:')) seq = parseInt(l.split(':')[1], 10) || 0;
    else if (l.startsWith('#EXT-X-TARGETDURATION:')) td = parseInt(l.split(':')[1], 10) || 6;
    else if (l.startsWith('#EXTINF:')) dur = parseFloat(l.slice(8)) || 0;
    else if (l.startsWith('#EXT-X-KEY:')) { if (!/METHOD=NONE/.test(l)) enc = true; }
    else if (l.startsWith('#EXT-X-MAP:')) { const m = l.match(/URI="([^"]+)"/); if (m) map = abs(m[1]); }
    else if (l.startsWith('#EXT-X-ENDLIST')) ended = true;
    else if (l && !l.startsWith('#')) { segs.push({ uri: abs(l), dur, seq: seq + segs.length }); dur = 0; }
  }
  return { segs, td, map, enc, ended };
}
function m3u8Variant(text, base, q) {
  const v = []; const ls = text.split(/\r?\n/).map(s => s.trim());
  for (let i = 0; i < ls.length; i++) if (ls[i].startsWith('#EXT-X-STREAM-INF:')) { const bw = +(ls[i].match(/BANDWIDTH=(\d+)/) || [])[1] || 0, res = /RESOLUTION=/.test(ls[i]); const u = ls.slice(i + 1).find(x => x && !x.startsWith('#')); if (u) v.push({ bw, res, u: new URL(u, base).href }); }
  let c = v.filter(x => x.res); if (!c.length) c = v; if (!c.length) throw new Error('Liste de qualités vide.');
  c.sort((a, b) => a.bw - b.bw);
  return (q === 'low' ? c[0] : q === 'high' ? c[c.length - 1] : c.reduce((b, x) => Math.abs(x.bw - 2e6) < Math.abs(b.bw - 2e6) ? x : b)).u;
}
async function hlsText(url, signal) {
  const r = await fetchAny(url, { signal }); if (!r.ok) throw new Error('La chaîne répond « ' + r.status + ' ».');
  const text = await r.text(); if (!/#EXTM3U/.test(text)) throw new Error('Ce flux n’est pas une liste HLS (.m3u8).');
  return { text, base: r.url && !(relayOn() && r.url.startsWith(relayCfg().url)) ? r.url : url };
}
/* → { stop(), done: Promise<{parts, bytes, error}> } */
function recordHls(o) {
  const ctl = new AbortController(); let stopped = false, bytes = 0, parts = 0;
  let chunks = [], size = 0, partStart = Date.now(), partSecs = 0, ext = 'ts', initBuf = null, mediaSecs = 0;
  const sleep = ms => new Promise(r => { const t = setTimeout(r, ms); ctl.signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });
  const getBuf = async u => { const r = await fetchAny(u, { signal: ctl.signal }); if (!r.ok) throw new Error('Segment : « ' + r.status + ' ».'); return new Uint8Array(await r.arrayBuffer()); };
  const flush = async final => {
    if (!size) return;
    const multi = o.seg > 0 || parts > 0 || !final; parts++;
    const name = o.prefix + '_' + safeName(o.label) + '_' + stamp(new Date(partStart)) + (multi ? '_p' + parts : '') + '.' + ext;
    const b = new Blob(chunks, { type: ext === 'mp4' ? 'video/mp4' : ext === 'aac' ? 'audio/aac' : 'video/mp2t' });
    chunks = initBuf ? [initBuf] : []; size = 0; partSecs = 0; partStart = Date.now(); o.queue.push(b, name);
  };
  const done = (async () => {
    let err = '';
    try {
      let { text, base } = await hlsText(o.url, ctl.signal), plUrl = o.url;
      if (/#EXT-X-STREAM-INF/.test(text)) { plUrl = m3u8Variant(text, base, o.q); ({ text, base } = await hlsText(plUrl, ctl.signal)); }
      let lastSeq = -1, first = true, fails = 0, plFail = 0;
      for (;;) {
        const m = m3u8Parse(text, base);
        if (m.enc) throw new Error('Cette chaîne est chiffrée (AES-128) : enregistrement impossible.');
        if (first) {
          const s0 = (m.segs[0] || {}).uri || '';
          ext = m.map || /\.(m4s|mp4|cmfv|cmfa)(\?|#|$)/i.test(s0) ? 'mp4' : /\.aac(\?|#|$)/i.test(s0) ? 'aac' : 'ts';
          if (m.map) { initBuf = await getBuf(m.map); chunks = [initBuf]; }
        }
        let list = m.segs.filter(s => s.seq > lastSeq); if (first && !m.ended) list = list.slice(-2);   // direct : on commence maintenant
        first = false;
        for (const s of list) {
          if (stopped) break;
          let buf; try { buf = await getBuf(s.uri); } catch (e) { if (stopped) break; if (++fails > 8) throw e; continue; }
          fails = 0; lastSeq = s.seq; chunks.push(buf); size += buf.byteLength; bytes += buf.byteLength; partSecs += s.dur; mediaSecs += s.dur;
          o.onstat && o.onstat({ bytes, secs: mediaSecs, parts });
          if (size > REC_MAXMEM || (o.seg > 0 && partSecs >= o.seg * 60)) await flush(false);
        }
        if (stopped || m.ended) break;
        await sleep(Math.max(1000, Math.min(m.td, 10) * 500)); if (stopped) break;
        try { ({ text, base } = await hlsText(plUrl, ctl.signal)); plFail = 0; } catch (e) { if (stopped) break; if (++plFail > 6) throw e; }
      }
    } catch (e) { if (!stopped && !(e && e.name === 'AbortError')) err = e.message || 'Erreur.'; }
    await flush(true);
    return { parts, bytes, error: stopped ? '' : err };
  })();
  return { stop: () => { stopped = true; ctl.abort(); return done; }, done };
}

/* ---------- fenêtre ---------- */
function tvWin() {
  const v = el('video', { controls: true, playsInline: true, preload: 'none', className: 'tv-video', 'aria-label': 'Lecteur TV' });
  const P = { ch: null, rec: null, q: null };
  let chans = [], hidden = 0, page = 1, tab = 'cat', srcTitle = '';
  const PAGE = 80;
  const msg = el('div', { className: 'tv-msg', textContent: 'Choisissez une chaîne dans la liste' });
  const screen = el('div', { className: 'tv-screen' }, v, msg);
  const head = el('div', { className: 'tv-head' }, el('span', { className: 'tv-logo', role: 'img', 'aria-label': 'Sormick TV' }, ico('tv', 28)), el('span', { className: 'tv-brand' }, el('b', { textContent: 'Sormick TV' }), el('span', { textContent: 'IPTV · listes M3U' })));
  const setMsg = m => { msg.textContent = tr(m) || ''; msg.hidden = !m; };
  v.onplaying = () => setMsg(''); v.onwaiting = () => setMsg('Mise en mémoire…');
  v.onerror = () => setMsg(/\.m3u8?(\?|#|$)/i.test(v.currentSrc || '') && !v.canPlayType('application/vnd.apple.mpegurl') ? 'Ce navigateur ne lit pas le HLS (utilisez Chrome, Edge ou Safari).' : 'Chaîne indisponible (flux arrêté, protégé ou non compatible). Essayez-en une autre.');
  const play = ch => { P.ch = ch; setMsg('Connexion à « ' + ch.name + ' »…'); v.src = ch.url; v.play().catch(() => {}); recB.disabled = false; title.textContent = ch.name; subDetect(ch); drawEpg(); drawList(); epgResolve(ch); };
  const title = el('b', { className: 'tv-title grow', textContent: '—' });
  /* ----- enregistrement ----- */
  const recLbl = el('span', { textContent: 'Enregistrer le flux' });
  const recB = el('button', { type: 'button', className: 'tv-rec', title: 'Enregistrer cette chaîne sur le stockage WebDAV choisi', onclick: () => toggleRec() }, ico('recdot', 16), recLbl); recB.disabled = true;
  const recInfo = el('small', { className: 'mut' });
  const qSel = el('select', { 'aria-label': 'Qualité enregistrée', title: 'Qualité enregistrée (chaînes à plusieurs qualités)' }); opts(qSel, [['low', 'Qualité basse'], ['mid', 'Qualité moyenne'], ['high', 'Qualité haute']]); qSel.value = D.rec.tv.q; qSel.onchange = () => { D.rec.tv.q = qSel.value; save(); };
  const toggleRec = async () => {
    if (P.rec) { P.rec.stop(); return; }
    if (!P.ch) return toast('Choisissez d’abord une chaîne.');
    const ch = P.ch; let last = { bytes: 0, secs: 0 };
    P.q = recQueue('tv', s => { recInfo.textContent = s.pending ? 'Envoi en cours (' + s.pending + ')…' : s.failed ? 'Envoi impossible pour ' + s.failed + ' fichier(s).' : s.sent ? s.sent + ' fichier(s) enregistré(s).' : ''; });
    const o = { url: ch.url, k: 'tv', prefix: 'tv', label: ch.name, seg: D.rec.tv.seg, q: D.rec.tv.q, queue: P.q, onstat: s => { last = s; }, defExt: 'ts' };
    P.rec = /\.m3u8?(\?|#|$)/i.test(ch.url) ? recordHls(o) : recordStream(o);
    recB.classList.add('on'); toast('Enregistrement de « ' + ch.name + ' » vers ' + recWhere('tv') + '.', 4500);
    const tick = setInterval(() => { recLbl.textContent = tr('Arrêter') + ' · ' + fmtDur(last.secs) + ' · ' + fmtSize(last.bytes); }, 500); recLbl.textContent = tr('Arrêter') + ' · 0:00';
    const res = await P.rec.done; clearInterval(tick); P.rec = null; recB.classList.remove('on'); recLbl.textContent = tr('Enregistrer le flux');
    if (res.error) toast('Enregistrement arrêté : ' + res.error, 10000); else if (!res.bytes) toast('Rien n’a été enregistré.', 5000);
    await P.q.idle();
  };
  /* ----- sous-titres de la chaîne (HLS / WebVTT), si elle en propose ----- */
  let subs = [], subTk = 0, subOff = 0; P.sub = null;
  const subSel = el('select', { 'aria-label': 'Sous-titres', title: 'Sous-titres de la chaîne (s’ils existent)' }), offL = el('small', { className: 'mut', textContent: '0,0 s' });
  const subStop = () => { subTk++; if (P.sub) P.sub.stop(); P.sub = null; subs = []; subRow.hidden = true; };
  const subPick = i => { if (P.sub) P.sub.stop(); P.sub = null; subOff = 0; offL.textContent = '0,0 s'; if (i >= 0 && subs[i]) P.sub = subFollow(v, subs[i]); };
  const subShift = d => { subOff = Math.round((subOff + d) * 10) / 10; offL.textContent = subOff.toFixed(1).replace('.', ',') + ' s'; if (P.sub) P.sub.setOffset(subOff); };
  const subRow = el('div', { className: 'row tight', hidden: true }, ico('text', 16), subSel, btn('', 'minus', () => subShift(-0.5), '', 'Avancer les sous-titres de 0,5 s'), offL, btn('', 'plus', () => subShift(0.5), '', 'Retarder les sous-titres de 0,5 s'));
  subSel.onchange = () => subPick(+subSel.value);
  async function subDetect(ch) {
    subStop(); const tk = subTk;
    if (!/\.m3u8?(\?|#|$)/i.test(ch.url)) return;
    let l = []; try { const { text, base } = await hlsText(ch.url); l = hlsSubList(text, base); } catch { return; }
    if (tk !== subTk || !l.length) return;
    subs = l; opts(subSel, [['-1', 'Sous-titres : aucun'], ...l.map((s, i) => [String(i), s.name + (s.lang ? ' (' + s.lang + ')' : '')])]);
    const ui = uiLang().slice(0, 2); let i = l.findIndex(s => s.lang.slice(0, 2) === ui); if (i < 0) i = l.findIndex(s => s.def); if (i < 0) i = 0;
    subSel.value = String(i); subRow.hidden = false; subPick(i);   // sous-titres détectés : lecture automatique (« aucun » dans la liste pour les couper)
  }
  v.textTracks.addEventListener('addtrack', e => { const t = e.track; if (t && (t.kind === 'subtitles' || t.kind === 'captions') && !P.sub && t.mode === 'disabled' && !t.label.startsWith('​')) t.mode = 'showing'; });   // navigateurs qui exposent eux-mêmes les pistes (Safari)
  /* ----- guide des programmes (EPG, XMLTV) -----
     Pour une chaîne, on cherche son programme dans : 1) le guide « manuel » ci-dessous, 2) le guide annoncé par la liste (url-tvg), 3) les guides du catalogue pour le pays de la chaîne
     (fenêtre « Guides par pays », modifiable). Les guides chargés restent en mémoire quelques heures ; plusieurs chaînes de la liste affichent donc « ▶ programme en cours ». */
  let listEpg = [], epgAbort = new AbortController(), ctxCC = '', epgTk = 0;
  const hhmm = ms => new Date(ms).toLocaleTimeString(uiLang(), { hour: '2-digit', minute: '2-digit' });
  const nowOn = ch => { const f = epgFind(epgLoaded(), ch), g = f && epgNow(f.l); return g && g.now ? '▶ ' + g.now.t : ''; };
  const epgIn = el('input', { type: 'url', placeholder: 'Guide « manuel » (https://….xml ou .xml.gz) — facultatif', value: D.tv.epg || '', maxLength: 500, className: 'grow', 'aria-label': 'Guide des programmes (EPG)', inputMode: 'url', autocapitalize: 'off', spellcheck: false, onkeydown: e => { if (e.key === 'Enter') epgGo(); } });
  const epgSt = el('small', { className: 'mut' }), epgBox = el('div', { className: 'tv-epg' }), epgNowL = el('small', { className: 'rd-now' });
  const epgPane = el('details', { className: 'rd-ly tv-ly' }, el('summary', {}, el('span', { textContent: 'Guide des programmes (EPG)' }), epgNowL),
    el('div', { className: 'row' }, epgIn, btn('Charger', 'download', () => epgGo(), 'pri'), btn('Guides par pays…', 'globe', () => epgWin(() => { if (P.ch) epgResolve(P.ch); }), '', 'Catalogue des guides par pays : modifier, ajouter, retirer, mettre à jour')), epgSt, epgBox);
  function drawEpg() {
    const ch = P.ch, f = ch && epgFind(epgLoaded(), ch), g = f && epgNow(f.l); epgNowL.textContent = g && g.now ? ' ▶ ' + g.now.t : '';
    if (!ch) { epgBox.replaceChildren(); return; }
    if (!g || (!g.now && !g.next.length)) { if (epgLoaded().length) epgBox.replaceChildren(el('small', { className: 'mut', textContent: 'Aucun programme connu pour cette chaîne dans les guides chargés.' })); else epgBox.replaceChildren(); return; }
    const row = (p, cur) => el('div', { className: 'tv-prog' + (cur ? ' cur' : '') }, el('b', { textContent: hhmm(p.s) + ' – ' + hhmm(p.e) }), el('span', { textContent: p.t }));
    epgBox.replaceChildren(...(g.now ? [row(g.now, true), el('progress', { max: g.now.e - g.now.s, value: Math.max(0, Math.min(Date.now() - g.now.s, g.now.e - g.now.s)), 'aria-label': 'Avancement du programme' }), g.now.d ? el('small', { className: 'mut tv-desc', textContent: g.now.d }) : null] : []).filter(Boolean), ...g.next.map(p => row(p, false)));
  }
  async function epgGo(url) {   // guide « manuel » : adresse saisie
    url = (url || epgIn.value).trim(); if (!url) { D.tv.epg = ''; save(); epgSt.textContent = ''; return epgIn.focus(); }
    if (!/^https:\/\//i.test(url) || !httpUrl(url)) { epgSt.textContent = tr('L’adresse du guide doit commencer par https://.'); return; }
    epgAbort.abort(); epgAbort = new AbortController(); const ac = epgAbort; epgSt.textContent = tr('Chargement du guide…');
    try {
      const g = await epgGet(httpUrl(url), ac.signal); if (ac.signal.aborted) return;
      epgSt.textContent = g.prog.size + ' ' + tr('chaînes dans le guide');
      if (url !== D.tv.epg) { D.tv.epg = httpUrl(url).slice(0, 500); save(); }
      drawEpg(); drawList(); drawFav();
    } catch (e) { if (!ac.signal.aborted) epgSt.textContent = e.message; }
  }
  const epgCands = ch => {   // adresses à essayer, dans l'ordre
    const c = []; if (D.tv.epg) c.push({ url: D.tv.epg, from: 'manuel' });
    for (const u of listEpg.slice(0, 2)) c.push({ url: u, from: 'liste' });
    const cc = epgCC(ch, ctxCC); for (const s of epgForCC(cc).slice(0, 3)) c.push({ url: s.url, from: s.name });
    return c.filter((x, i) => c.findIndex(y => y.url === x.url) === i);
  };
  async function epgResolve(ch) {   // charge, si besoin, le guide qui connaît cette chaîne
    const tk = ++epgTk; if (epgFind(epgLoaded(), ch)) { drawEpg(); return; }
    const cs = epgCands(ch); if (!cs.length) { epgSt.textContent = tr('Aucun guide connu pour le pays de cette chaîne : ajoutez-en un avec « Guides par pays… ».'); return; }
    for (const c of cs) {
      if (tk !== epgTk) return; epgSt.textContent = tr('Chargement du guide…') + ' ' + c.from;
      try {
        const g = await epgGet(c.url); if (tk !== epgTk) return;
        if (epgFor(g, ch)) { epgSt.textContent = c.from + ' · ' + g.prog.size + ' ' + tr('chaînes'); drawEpg(); drawList(); drawFav(); return; }
      } catch (e) { if (tk === epgTk) epgSt.textContent = c.from + ' : ' + e.message; }
    }
    if (tk === epgTk) { epgSt.textContent = tr('Cette chaîne n’est dans aucun des guides essayés.'); drawEpg(); }
  }
  async function epgAuto() {   // à l'ouverture d'une liste : charge le guide du pays pour afficher « ▶ en cours » sur les chaînes
    if (D.tv.epgAuto === false || D.tv.epg) return; const t = ++epgTk, cs = [...listEpg.slice(0, 1).map(u => ({ url: u, from: 'liste' })), ...epgForCC(ctxCC).slice(0, 1).map(s => ({ url: s.url, from: s.name }))];
    for (const c of cs) { try { epgSt.textContent = tr('Chargement du guide…') + ' ' + c.from; const g = await epgGet(c.url); if (t !== epgTk) return; epgSt.textContent = c.from + ' · ' + g.prog.size + ' ' + tr('chaînes'); drawEpg(); drawList(); drawFav(); return; } catch (e) { if (t === epgTk) epgSt.textContent = c.from + ' : ' + e.message; } }
  }
  const epgTm = setInterval(() => { if (!document.body.contains(screen)) return clearInterval(epgTm); drawEpg(); }, 30000);
  if (D.tv.epg) setTimeout(() => epgGo(D.tv.epg), 300);
  /* ----- liste de chaînes ----- */
  const fq = el('input', { type: 'search', placeholder: 'Rechercher une chaîne…', maxLength: 80, className: 'grow', 'aria-label': 'Rechercher une chaîne', oninput: () => { page = 1; drawList(); } });
  const info = el('small', { className: 'mut' }), list = el('div', { className: 'tv-list' }), moreB = btn('Plus de chaînes', 'down', () => { page++; drawList(); }); moreB.hidden = true;
  const isFav = ch => D.tv.fav.some(f => f.url === ch.url || f.orig === ch.url);
  const favB = ch => { const on = isFav(ch); return btn('', on ? 'check' : 'star', e => { e.stopPropagation(); if (on) D.tv.fav = D.tv.fav.filter(f => f.url !== ch.url && f.orig !== ch.url); else if (D.tv.fav.length < 3000) D.tv.fav.push({ id: uid(), name: ch.name, url: ch.url, lang: ch.lang || '', genre: '', cc: '', logo: /^https:\/\//i.test(ch.logo || '') ? ch.logo : '', group: ch.group || srcTitle.slice(0, 60), tvg: ch.tvg || '' }); save(); drawList(); drawFav(); toast(on ? 'Retirée de « Mes chaînes ».' : 'Ajoutée à « Mes chaînes ».', 2500); }, on ? 'rd-on' : '', on ? 'Retirer de Mes chaînes' : 'Ajouter à Mes chaînes'); };
  const chRow = (ch, mine) => {
    if (!mine) { const o = D.tv.fav.find(f => f.orig === ch.url); if (o) ch = { ...ch, ...o, tvg: o.tvg || ch.tvg }; }   // chaîne de la liste déjà modifiée : on affiche votre version
    const cur = P.ch && P.ch.url === ch.url;
    return el('div', { className: 'tv-row' + (cur ? ' cur' : ''), tabIndex: 0, role: 'button', 'aria-label': 'Regarder ' + ch.name, onclick: () => play(ch), onkeydown: e => { if (e.key === 'Enter') play(ch); } },
      stLogo(ch), el('div', { className: 'grow' }, el('b', { textContent: ch.name }), el('div', { className: 'mut rd-sub', textContent: [ch.group, ch.lang, nowOn(ch)].filter(Boolean).join(' · ') })),
      ...(mine ? [btn('', 'edit', e => { e.stopPropagation(); editFav(ch); }, '', 'Modifier cette chaîne'), btn('', 'trash', e => { e.stopPropagation(); delFav(ch); }, 'dng', 'Supprimer cette chaîne')] : [btn('', 'edit', e => { e.stopPropagation(); editBase(ch); }, '', 'Modifier cette chaîne (nom, adresse, groupe, langue…)'), favB(ch)]));
  };
  /* Genre (= « group » de la chaîne) : filtre dans le catalogue et dans « Mes chaînes » ; modifiable à tout moment depuis le crayon de la chaîne */
  const gKey = g => String(g || '').trim().toLowerCase();
  const fillGenre = (sel, arr) => { const cur = sel.value, m = new Map(); for (const g of arr) { const k = gKey(g); if (k && !m.has(k)) m.set(k, String(g).trim()); } opts(sel, [['', 'Tous les genres'], ...[...m].sort((a, b) => a[1].localeCompare(b[1], uiLang()))]); sel.value = m.has(cur) ? cur : ''; };
  const gSelC = el('select', { 'aria-label': 'Filtrer par genre', onchange: () => { page = 1; drawList(); } });
  const effGroup = () => { const ov = new Map(D.tv.fav.filter(f => f.orig).map(f => [f.orig, f.group])); return c => ov.has(c.url) ? ov.get(c.url) : c.group; };
  function drawList() {
    const eg = effGroup(); fillGenre(gSelC, chans.map(eg));
    const s = fq.value.trim().toLowerCase(), gk = gSelC.value, base = gk ? chans.filter(c => gKey(eg(c)) === gk) : chans, all = s ? base.filter(c => (c.name + ' ' + eg(c)).toLowerCase().includes(s)) : base, vis = all.slice(0, page * PAGE);
    list.replaceChildren(...(vis.length ? vis.map(c => chRow(c, false)) : [el('p', { className: 'mut', textContent: chans.length ? 'Aucune chaîne pour cette recherche.' : 'Choisissez une langue, une catégorie ou un pays, puis « Charger ».' })]));
    moreB.hidden = vis.length >= all.length;
    info.textContent = chans.length ? (srcTitle ? srcTitle + ' : ' : '') + all.length + ' chaîne(s)' + (hidden ? ' · ' + hidden + ' en http masquée(s) (bloquées par le navigateur)' : '') : '';
  }
  async function loadList(url, title) {
    srcTitle = title; chans = []; page = 1; list.replaceChildren(el('p', { className: 'mut', textContent: 'Chargement de la liste…' })); moreB.hidden = true; info.textContent = '';
    try {
      const r = await fetchAny(url); if (!r.ok) throw new Error('La liste répond « ' + r.status + ' ».');
      const all = parseM3U(await r.text()), seen = new Set(); listEpg = all.epg || []; ctxCC = ((m => m ? (m[1] === 'countries' ? m[2] : EPG_LANG_CC[m[2]] || '') : '')(/\/(countries|languages)\/([a-z]+)\.m3u(?:$|\?)/.exec(url)));
      chans = all.filter(c => /^https:\/\//i.test(c.url) && !seen.has(c.url) && seen.add(c.url)); hidden = all.filter(c => !/^https:\/\//i.test(c.url)).length;
      if (!all.length) throw new Error('Aucune chaîne trouvée dans cette liste (fichier M3U attendu).');
      drawList(); epgAuto();
    } catch (e) { list.replaceChildren(el('div', { className: 'warn', textContent: e.message })); }
  }
  /* ----- Catalogue iptv-org ----- */
  const kSel = el('select', { 'aria-label': 'Classer par' }), vSel = el('select', { 'aria-label': 'Choix' });
  opts(kSel, [['languages', 'Classer par langue'], ['categories', 'Classer par catégorie'], ['countries', 'Classer par pays']]); kSel.value = D.tv.last.k;
  const fillV = () => {
    const codes = kSel.value === 'languages' ? Object.keys(IPTV_LANGS) : kSel.value === 'categories' ? Object.keys(IPTV_CATS) : IPTV_COUNTRIES;
    opts(vSel, codes.map(c => [c, tvLabel(kSel.value, c)]).sort((a, b) => a[0] === 'undefined' || a[0] === 'int' ? 1 : b[0] === 'undefined' || b[0] === 'int' ? -1 : a[1].localeCompare(b[1], uiLang())));
    if ([...vSel.options].some(o => o.value === D.tv.last.v) && kSel.value === D.tv.last.k) vSel.value = D.tv.last.v;
  };
  const loadCat = () => { D.tv.last = { k: kSel.value, v: vSel.value }; save(); loadList(IPTV_BASE + kSel.value + '/' + vSel.value + '.m3u', tvLabel(kSel.value, vSel.value)); };
  kSel.onchange = () => { fillV(); loadCat(); }; vSel.onchange = loadCat; fillV();
  const addListFromCat = () => { const url = IPTV_BASE + kSel.value + '/' + vSel.value + '.m3u'; if (D.tv.lists.some(l => l.url === url)) return toast('Cette liste est déjà dans « Mes listes ».'); D.tv.lists.push({ id: uid(), name: 'iptv-org · ' + tvLabel(kSel.value, vSel.value), url, lang: kSel.value === 'languages' ? tvLabel('languages', vSel.value) : '' }); save(); drawLists(); toast('Liste ajoutée à « Mes listes » : modifiable à volonté.', 4000); };
  /* ----- Mes listes ----- */
  const lLang = el('select', { 'aria-label': 'Langue' }), lBox = el('div', { className: 'tv-lists' });
  const fillL = () => { const cur = lLang.value, l = [...new Set(D.tv.lists.map(x => x.lang).filter(Boolean))].sort((a, b) => a.localeCompare(b, uiLang())); opts(lLang, [['', 'Toutes les langues'], ...l.map(x => [x, x])]); lLang.value = l.includes(cur) ? cur : ''; };
  function drawLists() {
    fillL();
    const items = D.tv.lists.filter(x => !lLang.value || x.lang === lLang.value).sort(byName);
    lBox.replaceChildren(...(items.length ? items.map(x => el('div', { className: 'tv-row', tabIndex: 0, role: 'button', 'aria-label': 'Charger ' + x.name, onclick: () => { setTab('cat', true); loadList(x.url, x.name); }, onkeydown: e => { if (e.key === 'Enter') { setTab('cat', true); loadList(x.url, x.name); } } },
      el('span', { className: 'rd-lg' }, ico('list', 18)), el('div', { className: 'grow' }, el('b', { textContent: x.name }), el('div', { className: 'mut rd-sub', textContent: (x.lang ? x.lang + ' · ' : '') + hostOf(x.url) })),
      btn('', 'edit', e => { e.stopPropagation(); editList(x); }, '', 'Modifier cette liste'), btn('', 'trash', e => { e.stopPropagation(); delList(x); }, 'dng', 'Supprimer cette liste'))) : [el('p', { className: 'mut', textContent: 'Aucune liste personnelle. Ajoutez l’adresse d’une liste M3U (ou « Ajouter à mes listes » depuis le catalogue).' })]));
  }
  lLang.onchange = drawLists;
  const chkL = v => !/^https:\/\//i.test(v.url.trim()) || !httpUrl(v.url.trim()) ? 'L’adresse de la liste doit commencer par https://.' : '';
  const editList = async x => {
    const r = await dialog(x ? 'Modifier la liste M3U' : 'Ajouter une liste M3U', [{ k: 'name', label: 'Nom de la liste', req: true, max: 120, value: x ? x.name : '' }, { k: 'url', label: 'Adresse de la liste (https://….m3u)', req: true, max: 600, value: x ? x.url : '' }, { k: 'lang', label: 'Langue (pour la classer)', max: 40, value: x ? x.lang : '' }], 'Enregistrer', { check: chkL }); if (!r) return;
    const d = { name: r.name.trim(), url: httpUrl(r.url.trim()), lang: r.lang.trim() };
    if (x) Object.assign(x, d); else { if (D.tv.lists.length >= 500) return toast('500 listes au maximum.'); D.tv.lists.push({ id: uid(), ...d }); }
    save(); drawLists();
  };
  const delList = async x => { if (!(await confirmBox('Supprimer la liste « ' + x.name + ' » ?', 'Supprimer', true))) return; D.tv.lists = D.tv.lists.filter(y => y !== x); save(); drawLists(); };
  const fileIn = el('input', { type: 'file', accept: '.m3u,.m3u8,text/plain,audio/x-mpegurl,application/vnd.apple.mpegurl', hidden: true });
  fileIn.onchange = async () => {
    const f = fileIn.files[0]; fileIn.value = ''; if (!f) return; if (f.size > 20e6) return toast('Fichier trop volumineux (20 Mo maximum).');
    const all = parseM3U(await f.text()), seen = new Set(); setTab('cat', true); srcTitle = f.name; chans = all.filter(c => /^https:\/\//i.test(c.url) && !seen.has(c.url) && seen.add(c.url)); hidden = all.filter(c => !/^https:\/\//i.test(c.url)).length; page = 1; drawList();
    if (!all.length) toast('Aucune chaîne trouvée dans ce fichier.');
  };
  /* ----- Mes chaînes (favoris) ----- */
  const favBox = el('div', { className: 'tv-list' });
  const gSelF = el('select', { 'aria-label': 'Filtrer mes chaînes par genre', onchange: () => drawFav() });
  function drawFav() {
    fillGenre(gSelF, D.tv.fav.map(c => c.group)); const gk = gSelF.value;
    const items = D.tv.fav.filter(c => !gk || gKey(c.group) === gk).sort(byName);
    favBox.replaceChildren(...(items.length ? items.map(c => chRow(c, true)) : [el('p', { className: 'mut', textContent: D.tv.fav.length ? 'Aucune chaîne de ce genre.' : 'Aucune chaîne favorite. Étoilez une chaîne d’une liste ou ajoutez une adresse de flux.' })]));
  }
  const renameGenre = async () => {
    const gs = [...new Set(D.tv.fav.map(c => String(c.group || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, uiLang()));
    if (!gs.length) return toast('Aucun genre à renommer pour l’instant : donnez un genre à vos chaînes avec le crayon.');
    const r = await dialog('Renommer un genre', [{ k: 'a', label: 'Genre à renommer', type: 'select', options: gs.map(g => [g, g]) }, { k: 'b', label: 'Nouveau nom (vide = retirer le genre)', max: 60 }], 'Renommer', { note: 'Le changement s’applique à toutes vos chaînes de ce genre.' });
    if (!r) return; const nb = r.b.trim(); let n = 0;
    for (const c of D.tv.fav) if (gKey(c.group) === gKey(r.a)) { c.group = nb; n++; }
    save(); drawFav(); drawList(); toast(n + ' chaîne(s) modifiée(s).');
  };
  const chkC = v => !/^https:\/\//i.test(v.url.trim()) || !httpUrl(v.url.trim()) ? 'L’adresse du flux doit commencer par https://.' : '';
  const editFav = async c => {
    const r = await dialog(c ? 'Modifier la chaîne' : 'Ajouter une chaîne', [{ k: 'name', label: 'Nom de la chaîne', req: true, max: 120, value: c ? c.name : '' }, { k: 'url', label: 'Adresse du flux (https://….m3u8)', req: true, max: 600, value: c ? c.url : '' }, { k: 'group', label: 'Genre (ex. Sport, Info, Cinéma, Enfants…)', max: 60, value: c ? c.group : '' }, { k: 'lang', label: 'Langue', max: 40, value: c ? c.lang : '' }], 'Enregistrer', { check: chkC }); if (!r) return;
    const d = { name: r.name.trim(), url: httpUrl(r.url.trim()), group: r.group.trim(), lang: r.lang.trim() };
    if (c) Object.assign(c, d); else { if (D.tv.fav.length >= 3000) return toast('3 000 chaînes au maximum.'); D.tv.fav.push({ id: uid(), genre: '', cc: '', logo: '', ...d }); }
    save(); drawFav(); drawList();
  };
  /* Chaîne d'une liste : la modifier en crée une copie dans « Mes chaînes » (liée à l'originale par `orig`), affichée à la place de l'originale.
     Pour retrouver l'originale, supprimez la copie dans « Mes chaînes ». */
  const editBase = async ch => {
    const o = D.tv.fav.find(f => f.orig === ch.url || f.url === ch.url);
    if (o) { if (!o.orig && o.url === ch.url) o.orig = ch.url; return editFav(o); }
    const r = await dialog('Modifier la chaîne', [{ k: 'name', label: 'Nom de la chaîne', req: true, max: 120, value: ch.name || '' }, { k: 'url', label: 'Adresse du flux (https://….m3u8)', req: true, max: 600, value: ch.url || '' }, { k: 'group', label: 'Genre (ex. Sport, Info, Cinéma, Enfants…)', max: 60, value: ch.group || '' }, { k: 'lang', label: 'Langue', max: 40, value: ch.lang || '' }], 'Enregistrer', { check: chkC, note: 'La chaîne modifiée est enregistrée dans « Mes chaînes » et remplace l’originale dans la liste. Pour retrouver l’originale, supprimez-la de « Mes chaînes ».' }); if (!r) return;
    if (D.tv.fav.length >= 3000) return toast('3 000 chaînes au maximum.');
    D.tv.fav.push({ id: uid(), genre: '', cc: '', logo: /^https:\/\//i.test(ch.logo || '') ? ch.logo : '', orig: ch.url, tvg: ch.tvg || '', name: r.name.trim(), url: httpUrl(r.url.trim()), group: r.group.trim(), lang: r.lang.trim() });
    save(); drawFav(); drawList(); toast('Chaîne modifiée : elle est dans « Mes chaînes ».', 3500);
  };
  const delFav = async c => { if (!(await confirmBox('Supprimer « ' + c.name + ' » de vos chaînes ?', 'Supprimer', true))) return; D.tv.fav = D.tv.fav.filter(x => x !== c); save(); drawFav(); drawList(); };
  /* ----- onglets ----- */
  const paneCat = el('div', { className: 'col' }, pin(el('div', { className: 'col pinblk' }, el('div', { className: 'rd-filters' }, kSel, vSel, gSelC), el('div', { className: 'row' }, btn('Charger', 'download', loadCat, 'pri'), btn('Ajouter à mes listes', 'plus', addListFromCat), fq), info)), list, el('div', { className: 'row center' }, moreB));
  const paneLists = el('div', { className: 'col' }, el('div', { className: 'rd-filters' }, lLang), el('div', { className: 'row' }, btn('Ajouter une liste M3U', 'plus', () => editList(null), 'pri'), btn('Ouvrir un fichier .m3u…', 'upload', () => fileIn.click()), fileIn), lBox);
  const paneFav = el('div', { className: 'col' }, pin(el('div', { className: 'col pinblk' }, el('div', { className: 'rd-filters' }, gSelF), el('div', { className: 'row' }, btn('Ajouter une chaîne', 'plus', () => editFav(null), 'pri'), btn('Renommer un genre', 'edit', renameGenre, '', 'Renommer un genre pour toutes vos chaînes')))), favBox);
  const tCat = btn('Catalogue', 'globe', () => setTab('cat'), 'rd-tab'), tLists = btn('Mes listes', 'list', () => setTab('lists'), 'rd-tab'), tFav = btn('Mes chaînes', 'star', () => setTab('fav'), 'rd-tab');
  const setTab = (t, quiet) => { tab = t; paneCat.hidden = t !== 'cat'; paneLists.hidden = t !== 'lists'; paneFav.hidden = t !== 'fav'; tCat.classList.toggle('on', t === 'cat'); tLists.classList.toggle('on', t === 'lists'); tFav.classList.toggle('on', t === 'fav'); if (t === 'lists') drawLists(); if (t === 'fav') drawFav(); };
  const ctl = el('div', { className: 'rd-ctl' }, title, recB, recInfo, qSel, segSelect('tv'), btn('', 'full', () => { try { v.requestFullscreen(); } catch { /* refusé */ } }, '', 'Plein écran'), btn('', 'ext', () => P.ch ? openTab(P.ch.url) : toast('Choisissez d’abord une chaîne.'), '', 'Ouvrir le flux dans un onglet'));
  const w = win('Sormick TV', 'tv', [head, screen, subRow, ctl, epgPane, destBar('tv'), pin(el('div', { className: 'row tight' }, tCat, tLists, tFav)), paneCat, paneLists, paneFav],
    { w: 1100, h: 740, cls: 'tvw', split: 6, onclose: () => { subStop(); epgAbort.abort(); epgTk++; clearInterval(epgTm); v.pause(); v.removeAttribute('src'); v.load(); if (P.rec) P.rec.stop(); } });
  setTab('cat'); drawList(); setMsg('Choisissez une chaîne dans la liste');
  loadCat();
  return w;
}
