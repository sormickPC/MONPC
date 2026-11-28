'use strict';
/* radio.js — application intégrée « Sormick Radio ».
   - « Découvrir » : annuaire communautaire Radio Browser (https://www.radio-browser.info, interrogé en direct depuis votre navigateur) :
     filtres LANGUE / GENRE / PAYS modifiables à volonté + recherche par nom ; seules les radios en https sont affichées (un site https ne peut pas lire de flux http).
   - « Mes radios » : vos propres adresses de flux (ajout, modification, suppression), classées par langue et par genre que vous choisissez
     (renommage groupé possible), import / export. Enregistrées dans votre profil chiffré.
   - Bouton d'enregistrement : le flux est copié par morceaux (découpage au choix) vers le stockage WebDAV de votre choix. */

const RB_BASES = ['https://all.api.radio-browser.info', 'https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://fi1.api.radio-browser.info'];
let RB_I = 0, RB_META = null;
const uiLang = () => (typeof LANG !== 'undefined' && LANG) || 'fr';
const capFirst = s => String(s || '').replace(/^./u, c => c.toLocaleUpperCase());
const rbBases = () => (typeof D !== 'undefined' && D && D.radio && Array.isArray(D.radio.api) && D.radio.api.length ? D.radio.api : RB_BASES);   // serveurs de l’annuaire : ceux de l’utilisateur, sinon ceux d’origine
const rbH32 = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
/* lit une liste de radios : JSON, PLS ou M3U */
function parseRadioList(txt) {
  if (/^\s*[{[]/.test(txt)) { const j = JSON.parse(txt); return Array.isArray(j) ? j : j.radios || []; }
  if (/^\s*\[playlist\]/i.test(txt)) { const m = [...txt.matchAll(/^File(\d+)=(.+)$/gim)], t = k => (txt.match(new RegExp('^Title' + k + '=(.+)$', 'im')) || [])[1]; return m.map(x => ({ name: t(x[1]) || x[2], url: x[2].trim() })); }
  return parseM3U(txt).map(c => ({ name: c.name, url: c.url, lang: c.lang, genre: c.group, logo: c.logo }));
}
async function rbGet(path) {
  let last; const bases = rbBases();
  for (let i = 0; i < bases.length; i++) {
    const j = (RB_I + i) % bases.length;
    try {
      const r = await fetchAny(bases[j] + path, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const v = await r.json(); RB_I = j; return v;
    } catch (e) { last = e; }
  }
  throw new Error('Annuaire des radios injoignable (' + ((last && last.message) || 'réseau') + ').');
}
const dn = (type, code) => { try { const v = new Intl.DisplayNames([uiLang()], { type }).of(code); return v && v !== code ? v : ''; } catch { return ''; } };
const rbLangLabel = (name, iso) => capFirst((iso && dn('language', iso)) || name);
const rbGenreLabel = t => (uiLang() === 'fr' && RADIO_GENRE_FR[t]) || tr(capFirst(t));
const rbCcLabel = cc => dn('region', cc) || cc;
async function rbMeta() {   // listes de langues, genres, pays (une seule fois par session) ; secours : listes intégrées
  if (RB_META) return RB_META;
  try {
    const [l, g, c] = await Promise.all([rbGet('/json/languages?hidebroken=true&order=stationcount&reverse=true&limit=300'), rbGet('/json/tags?hidebroken=true&order=stationcount&reverse=true&limit=500'), rbGet('/json/countrycodes?hidebroken=true')]);
    RB_META = {
      langs: l.filter(x => x && x.name && x.stationcount >= 3).map(x => ({ v: String(x.name), iso: x.iso_639 || '', n: x.stationcount })),
      tags: g.filter(x => x && x.name && x.stationcount >= 60 && x.name.length <= 30 && !/^[\d.\s-]+$/.test(x.name)).slice(0, 220).map(x => ({ v: String(x.name), n: x.stationcount })),
      ccs: c.filter(x => x && /^[A-Za-z]{2}$/.test(x.name) && x.stationcount >= 1).map(x => ({ v: x.name.toUpperCase(), n: x.stationcount })), live: true
    };
  } catch {
    RB_META = { langs: RADIO_LANGS.map(([v, iso]) => ({ v, iso, n: 0 })), tags: RADIO_GENRES.map(v => ({ v, n: 0 })), ccs: [], live: false };
  }
  return RB_META;
}
const rbStation = x => ({ id: 'rb:' + x.stationuuid, name: String(x.name || '').trim().slice(0, 120) || 'Sans nom', url: String(x.url_resolved || x.url || ''), lang: String(x.language || '').split(',')[0].trim().slice(0, 40), genre: String(x.tags || '').split(',')[0].trim().slice(0, 40), cc: String(x.countrycode || '').toUpperCase(), logo: /^https:\/\//i.test(x.favicon || '') ? x.favicon : '', rb: String(x.stationuuid || ''), tags: String(x.tags || '').split(',').filter(Boolean).slice(0, 4), codec: x.codec || '', bitrate: x.bitrate || 0 });

function stLogo(st) {
  const box = el('span', { className: 'rd-lg' });
  const letter = () => { box.replaceChildren(el('b', { textContent: (st.name || '?').trim().charAt(0).toUpperCase() })); box.style.background = `hsl(${hue(st.name)} 55% 32%)`; };
  if (st.logo && httpUrl(st.logo)) { const i = el('img', { alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', src: st.logo }); i.onerror = letter; box.append(i); } else letter();
  return box;
}

/* Fenêtre de revue d'une mise à jour (radios, chaînes TV) : groupes de lignes à cocher ; rien n'est modifié avant « Appliquer ».
   groups : [{ k, title, hint, items: [{ id, label, sub, on }] }] → résout { [k]: Set(ids cochés) } ou null si annulé. */
function updReview({ title, intro, groups }) {
  return new Promise(ok => {
    let done = false; const boxes = {}, body = [el('p', { className: 'mut', textContent: intro })];
    for (const g of groups) {
      const rows = g.items.map(it => { const c = el('input', { type: 'checkbox', checked: it.on !== false }); (boxes[g.k] = boxes[g.k] || []).push([it.id, c]); return el('label', { className: 'chk upd-row' }, c, el('span', { className: 'grow' }, el('b', { nt: 1, textContent: it.label }), el('small', { className: 'mut', nt: 1, textContent: it.sub || '' }))); });
      const all = on => (boxes[g.k] || []).forEach(([, c]) => { c.checked = on; });
      body.push(el('h3', { textContent: tr(g.title) + ' (' + g.items.length + ')', nt: 1 }), ...(g.hint ? [el('small', { className: 'mut', textContent: g.hint })] : []),
        ...(rows.length ? [el('div', { className: 'row tight' }, btn('Tout cocher', 'check', () => all(true)), btn('Tout décocher', 'x', () => all(false)))] : []),
        el('div', { className: 'upd-list' }, ...(rows.length ? rows : [el('p', { className: 'mut', textContent: 'Rien à signaler.' })])));
    }
    const fin = r => { if (done) return; done = true; ok(r); };
    const w = win(title, 'refresh', [...body, pin(el('div', { className: 'row' }, btn('Appliquer', 'check', () => { const r = {}; for (const g of groups) r[g.k] = new Set((boxes[g.k] || []).filter(([, c]) => c.checked).map(([id]) => id)); fin(r); w.close(); }, 'pri'), btn('Annuler', 'x', () => { fin(null); w.close(); })))], { w: 640, h: 660, cls: 'updw', onclose: () => fin(null) });
  });
}

function radioWin() {
  const au = new Audio(); au.preload = 'none'; au.volume = 0.8;
  const P = { st: null, rec: null, q: null, tk: 0 };
  let tab = 'find', offset = 0, stk = 0, timer = 0, shown = [];
  const PAGE = 60;
  /* ----- en-tête : logo, afficheur, égaliseur ----- */
  const lcd1 = el('div', { className: 'rd-l1', textContent: 'Choisissez une radio' }), lcd2 = el('div', { className: 'rd-l2', textContent: 'Prête' });
  const eq = el('span', { className: 'rd-eq', 'aria-hidden': 'true' }, el('i'), el('i'), el('i'), el('i'), el('i'));
  const head = el('div', { className: 'rd-head' },
    el('span', { className: 'rd-logo', role: 'img', 'aria-label': 'Sormick Radio' }, ico('radio', 32)),
    el('span', { className: 'rd-brand' }, el('b', { textContent: 'Sormick Radio' }), el('span', { textContent: 'Les radios du monde' })),
    el('div', { className: 'rd-lcd' }, el('div', { className: 'grow' }, lcd1, lcd2), eq));
  const setS = (m, on) => { lcd2.textContent = tr(m); eq.classList.toggle('on', !!on); };
  /* ----- lecture ----- */
  au.onplaying = () => setS('En direct', true); au.onwaiting = () => setS('Mise en mémoire…', false); au.onpause = () => { if (P.st) setS('Pause', false); };
  au.onerror = () => { if (P.st) setS('Flux indisponible : essayez une autre radio ou vérifiez l’adresse.', false); };
  const playB = btn('Écouter', 'play', () => { if (!P.st) return toast('Choisissez d’abord une radio dans la liste.'); au.paused ? play(P.st) : stop(); }, 'pri');
  const play = st => {
    P.st = st; lcd1.textContent = st.name; setS('Connexion…', false); recB.disabled = false; lyReset();
    au.src = st.url; if (P.icy) P.icy.stop(); P.songSeen = false; P.lastIcy = 0; P.lastTitle = ''; { const a = icyWatch(st.url, t => { P.lastIcy = Date.now(); onSong(t); }), b = statusWatch(st.url, t => { if (Date.now() - P.lastIcy > 60000) onSong(t); }); P.icy = { stop: () => { a.stop(); b.stop(); } }; } au.play().catch(() => setS('Lecture refusée ou flux indisponible.', false)); paintPlay(); draw();
  };
  const stop = () => { if (P.icy) P.icy.stop(); P.icy = null; au.pause(); au.removeAttribute('src'); au.load(); setS('Arrêtée', false); paintPlay(); };
  const paintPlay = () => { const on = P.st && !au.paused; playB.lastChild.textContent = tr(on ? 'Arrêter' : 'Écouter'); playB.firstChild.replaceWith(ico(on ? 'stop' : 'play', 16)); };
  au.addEventListener('play', paintPlay); au.addEventListener('pause', paintPlay);
  /* ----- paroles de la chanson (LRCLIB), pochette / photo de l'artiste, suivi ligne par ligne ----- */
  const lyIn = el('input', { type: 'search', placeholder: 'Artiste – Titre', maxLength: 160, className: 'grow', 'aria-label': 'Artiste – Titre', onkeydown: e => { if (e.key === 'Enter') lySearch(); } });
  const lySt = el('small', { className: 'mut' }), lyOut = el('pre', { className: 'rd-lyrics' }), lyPick = el('select', { 'aria-label': 'Résultat', hidden: true }), nowL = el('small', { className: 'rd-now' });
  const cvImg = el('img', { alt: '', referrerPolicy: 'no-referrer' }), cvCap = el('figcaption', { className: 'mut' }), cover = el('figure', { className: 'rd-cover', hidden: true }, cvImg, cvCap);
  const mini = el('img', { className: 'rd-mini', alt: '', hidden: true, referrerPolicy: 'no-referrer' });
  const sy = { t0: null, off: -3, lines: [], cur: -1 }, offL = el('b', { textContent: '−3 s' });
  const offTxt = () => { offL.textContent = (sy.off > 0 ? '+' : sy.off < 0 ? '−' : '') + Math.abs(sy.off) + ' s'; };
  const nudge = d => { sy.off += d; offTxt(); if (sy.t0 != null) sy.cur = -1; };
  const syncRow = el('div', { className: 'row tight rd-sync', hidden: true }, btn('', 'minus', () => nudge(-1), '', 'Paroles plus tôt (−1 s)'), offL, btn('', 'plus', () => nudge(1), '', 'Paroles plus tard (+1 s)'), el('small', { className: 'mut', textContent: 'Suivi : cliquez sur la ligne qui est chantée pour caler les paroles.' }));
  const lyr = el('details', { className: 'rd-ly' }, el('summary', {}, mini, el('span', { textContent: 'Paroles de la chanson' }), nowL),
    el('div', { className: 'row' }, lyIn, btn('Chercher les paroles', 'search', () => lySearch(), 'pri')), lyPick, lySt, el('div', { className: 'rd-lywrap' }, el('div', { className: 'rd-lycol' }, lyOut, syncRow), cover));
  let lyRes = [], lyTk = 0, cvTk = 0;
  const syncTo = t => { sy.t0 = Date.now() - (t - sy.off) * 1000; sy.cur = -1; };
  const lyShow = i => {
    const x = lyRes[i]; lyOut.replaceChildren(); sy.lines = []; sy.cur = -1; syncRow.hidden = true; lyOut.scrollTop = 0; if (!x) return;
    if (x.instrumental) { lyOut.textContent = tr('Morceau instrumental : pas de paroles.'); return; }
    if (x.synced.length >= 4) { for (const l of x.synced) { const sp = el('span', { className: 'rd-lyl', onclick: () => syncTo(l.t) }); sp.textContent = l.s || ' '; lyOut.append(sp, '\n'); sy.lines.push({ t: l.t, e: sp }); } syncRow.hidden = false; }
    else lyOut.textContent = x.text;
  };
  lyPick.onchange = () => lyShow(+lyPick.value);
  const syTm = setInterval(() => {   // met en valeur la ligne chantée (paroles synchronisées)
    if (!document.body.contains(lyOut)) return clearInterval(syTm); if (sy.t0 == null || !sy.lines.length || !lyr.open || au.paused) return;
    const pos = (Date.now() - sy.t0) / 1000 + sy.off; let k = -1; for (let n = 0; n < sy.lines.length && sy.lines[n].t <= pos; n++) k = n;
    if (k === sy.cur) return; if (sy.cur >= 0 && sy.lines[sy.cur]) sy.lines[sy.cur].e.classList.remove('cur'); sy.cur = k; if (k < 0) return;
    const e = sy.lines[k].e; e.classList.add('cur'); lyOut.scrollTo({ top: Math.max(0, e.offsetTop - lyOut.clientHeight / 2 + e.offsetHeight / 2), behavior: 'smooth' });
  }, 250);
  function coverHide() { cvTk++; cover.hidden = true; mini.hidden = true; cvImg.removeAttribute('src'); mini.removeAttribute('src'); cvCap.textContent = ''; }
  function lyReset() { lyTk++; lyRes = []; lyOut.replaceChildren(); sy.lines = []; sy.t0 = null; syncRow.hidden = true; lyPick.hidden = true; lySt.textContent = ''; lyIn.value = ''; nowL.textContent = ''; coverHide(); }
  async function coverSearch(raw, auto) {
    const t = ++cvTk; cover.hidden = true; mini.hidden = true;
    let l = []; try { l = await coverFind(raw); } catch { return; } if (t !== cvTk) return;
    const tryAt = i => {
      if (i >= l.length || t !== cvTk) return; const c = l[i];
      cvImg.onload = () => { if (t !== cvTk) return; cover.hidden = false; mini.src = c.url; mini.hidden = false; cvCap.textContent = [c.kind === 'album' ? c.album : '', c.artist].filter(Boolean).join(' — '); cvImg.alt = tr(c.kind === 'album' ? 'Pochette de l’album' : 'Photo de l’artiste') + ' ' + cvCap.textContent; if (auto) lyr.open = true; };
      cvImg.onerror = () => tryAt(i + 1); cvImg.src = c.url;
    };
    tryAt(0);
  }
  async function lySearch(auto) {
    const s = splitSong(lyIn.value); if (!s.title) return lyIn.focus();
    const t = ++lyTk; lySt.textContent = tr('Recherche des paroles…'); lyOut.replaceChildren(); sy.lines = []; syncRow.hidden = true; lyPick.hidden = true; if (!auto) sy.t0 = null;
    coverSearch(lyIn.value, auto);
    try {
      const a = await lyricsFind(s.artist, s.title, lyIn.value); if (t !== lyTk) return; lyRes = a;
      if (!a.length) { lySt.textContent = tr('Aucune parole trouvée : corrigez « Artiste – Titre » puis relancez la recherche.'); return; }
      lySt.textContent = ''; opts(lyPick, a.map((x, i) => [String(i), x.label + (x.synced.length >= 4 ? ' ♫' : '')])); lyPick.hidden = a.length < 2; lyPick.value = '0'; lyShow(0);
      if (auto) lyr.open = true;   // titre détecté et paroles trouvées : le panneau s'ouvre tout seul
    } catch (e) { if (t === lyTk) lySt.textContent = e.message; }
  }
  function onSong(t) {
    if (!P.st) return;
    // certaines radios envoient un numéro interne (« 288836 - 406713 »), le nom de la radio ou une annonce au lieu du morceau : on les ignore
    if (!/\p{L}/u.test(t) || t.trim().toLowerCase() === String(P.st.name || '').trim().toLowerCase()) return;
    if (t === P.lastTitle) return; P.lastTitle = t;
    const first = !P.songSeen; P.songSeen = true; sy.t0 = first ? null : Date.now();   // premier titre reçu : le morceau est déjà commencé (le suivi attend un clic sur une ligne)
    nowL.textContent = ' ♪ ' + t; lyIn.value = t; lySearch(true); }
  const vol = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0.8, 'aria-label': 'Volume', className: 'rd-vol', oninput: () => { au.volume = +vol.value; } });
  /* ----- enregistrement ----- */
  const recLbl = el('span', { textContent: 'Enregistrer le flux' });
  const recB = el('button', { type: 'button', className: 'rd-rec', title: 'Enregistrer cette radio sur le stockage WebDAV choisi', onclick: () => toggleRec() }, ico('recdot', 16), recLbl); recB.disabled = true;
  const recInfo = el('small', { className: 'mut rd-recinfo' });
  const toggleRec = async () => {
    if (P.rec) { const r = P.rec; r.stop(); return; }
    if (!P.st) return toast('Choisissez d’abord une radio.');
    const st = P.st; let last = { bytes: 0, secs: 0, parts: 0 };
    P.q = recQueue('radio', s => { recInfo.textContent = s.pending ? 'Envoi en cours (' + s.pending + ')…' : s.failed ? 'Envoi impossible pour ' + s.failed + ' fichier(s).' : s.sent ? s.sent + ' fichier(s) enregistré(s).' : ''; });
    P.rec = recordStream({ url: st.url, k: 'radio', prefix: 'radio', label: st.name, seg: D.rec.radio.seg, queue: P.q, onstat: s => { last = s; } });
    recB.classList.add('on'); recB.title = 'Arrêter l’enregistrement'; toast('Enregistrement de « ' + st.name + ' » vers ' + recWhere('radio') + '.', 4500);
    const tick = setInterval(() => { recLbl.textContent = tr('Arrêter') + ' · ' + fmtDur(last.secs) + ' · ' + fmtSize(last.bytes); }, 500); recLbl.textContent = tr('Arrêter') + ' · 0:00';
    const res = await P.rec.done; clearInterval(tick); P.rec = null; recB.classList.remove('on'); recLbl.textContent = tr('Enregistrer le flux'); recB.title = tr('Enregistrer cette radio sur le stockage WebDAV choisi');
    if (res.error) toast('Enregistrement arrêté : ' + res.error, 9000);
    else if (!res.bytes) toast('Rien n’a été enregistré.', 5000);
    await P.q.idle();
  };
  /* ----- filtres « Découvrir » ----- */
  const fLang = el('select', { 'aria-label': 'Langue' }), fGenre = el('select', { 'aria-label': 'Genre' }), fCc = el('select', { 'aria-label': 'Pays' });
  const fq = el('input', { type: 'search', placeholder: 'Nom de la radio…', maxLength: 80, className: 'grow', 'aria-label': 'Rechercher une radio', onkeydown: e => { if (e.key === 'Enter') search(true); } });
  const fill = (sel, first, items, cur) => { opts(sel, [['', first], ...items]); sel.value = items.some(x => x[0] === cur) ? cur : ''; };
  const meta = async () => {
    const m = await rbMeta(), L = D.radio.last;
    const cnt = (arr, f) => dedupLabels(arr.map(x => [x.v, f(x)])).map((it, i) => [it[0], it[1] + (arr[i].n ? ' (' + arr[i].n + ')' : '')]).sort((a, b) => cmpT(a[1], b[1]));
    fill(fLang, 'Toutes les langues', cnt(m.langs, x => rbLangLabel(x.v, x.iso)), L.lang);
    fill(fGenre, 'Tous les genres', cnt(m.tags, x => rbGenreLabel(x.v)), L.genre);
    fill(fCc, 'Tous les pays', dedupLabels(m.ccs.map(x => [x.v, rbCcLabel(x.v)])).sort((a, b) => cmpT(a[1], b[1])), L.cc);
    fCc.hidden = !m.ccs.length; if (!m.live) note.textContent = 'Annuaire en ligne injoignable : listes de secours. Vous pouvez toujours ouvrir « Mes radios ».';
  };
  const remember = () => { D.radio.last = { lang: fLang.value, genre: fGenre.value, cc: fCc.value }; save(); };
  for (const s of [fLang, fGenre, fCc]) s.onchange = () => { remember(); search(true); };
  const note = el('small', { className: 'mut' });
  const findList = el('div', { className: 'rd-list' }), moreB = btn('Plus de résultats', 'down', () => search(false)); moreB.hidden = true;
  const inMine = st => D.radio.mine.some(m => m.url === st.url || m.orig === st.url);
  const star = st => {
    const on = inMine(st);
    return btn('', on ? 'check' : 'star', e => { e.stopPropagation(); if (on) D.radio.mine = D.radio.mine.filter(m => m.url !== st.url && m.orig !== st.url); else if (D.radio.mine.length < 3000) D.radio.mine.push({ id: uid(), rb: st.rb || '', name: st.name, url: st.url, lang: st.lang, genre: st.genre, cc: st.cc, logo: st.logo, group: '' }); save(); draw(); drawMine(); toast(on ? 'Retirée de « Mes radios ».' : 'Ajoutée à « Mes radios » : modifiable à volonté.', 3000); },
      on ? 'rd-on' : '', on ? 'Retirer de Mes radios' : 'Ajouter à Mes radios');
  };
  /* Favoris : liste à part (cœur sur chaque radio), avec son propre onglet, sa recherche et ses filtres */
  const isFavR = st => D.radio.fav.some(f => f.url === st.url);
  const heart = st => {
    const on = isFavR(st);
    return btn('', on ? 'hearton' : 'heart', e => {
      e.stopPropagation();
      if (on) D.radio.fav = D.radio.fav.filter(f => f.url !== st.url);
      else if (D.radio.fav.length < 3000) D.radio.fav.push({ id: uid(), rb: st.rb || '', name: st.name, url: st.url, lang: st.lang || '', genre: st.genre || '', cc: st.cc || '', logo: st.logo || '' });
      else return toast('3 000 favoris au maximum.');
      save(); draw(); toast(on ? 'Retirée des favoris.' : 'Ajoutée aux favoris.', 2000);
    }, on ? 'rd-on' : '', on ? 'Retirer des favoris' : 'Ajouter aux favoris');
  };
  const rowOf = (st, mine, fv) => {
    if (!mine) { const o = D.radio.mine.find(m => m.orig === st.url); if (o) st = o; }   // radio de l'annuaire déjà modifiée : on affiche votre version
    const cur = P.st && P.st.url === st.url;
    const sub = [st.lang && capFirst(st.lang), st.genre && capFirst(st.genre), st.cc && rbCcLabel(st.cc), st.codec && st.codec + (st.bitrate ? ' ' + st.bitrate + ' k' : '')].filter(Boolean).join(' · ');
    return el('div', { className: 'rd-row' + (cur ? ' cur' : ''), tabIndex: 0, role: 'button', 'aria-label': 'Écouter ' + st.name, onclick: () => play(st), onkeydown: e => { if (e.key === 'Enter') play(st); } },
      stLogo(st), el('div', { className: 'grow' }, el('b', { textContent: st.name }), el('div', { className: 'mut rd-sub', textContent: sub })),
      ...(fv ? [heart(st)] : mine ? [btn('', 'edit', e => { e.stopPropagation(); editSt(st); }, '', 'Modifier cette radio'), btn('', 'trash', e => { e.stopPropagation(); delSt(st); }, 'dng', 'Supprimer cette radio'), heart(st)] : [btn('', 'edit', e => { e.stopPropagation(); editBase(st); }, '', 'Modifier cette radio (nom, adresse, langue, genre…)'), star(st), heart(st)]));
  };
  const draw = () => { findList.querySelectorAll('.rd-row').forEach((r, i) => { const st = shown[i]; if (st) r.replaceWith(rowOf(st, false)); }); drawMine(); drawFav(); };
  async function search(reset) {
    const t = ++stk; if (reset) { offset = 0; shown = []; findList.replaceChildren(el('p', { className: 'mut', textContent: 'Recherche…' })); moreB.hidden = true; }
    const p = new URLSearchParams({ hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: String(PAGE), offset: String(offset), is_https: 'true' });
    if (fLang.value) { p.set('language', fLang.value); p.set('languageExact', 'true'); }
    if (fGenre.value) { p.set('tag', fGenre.value); p.set('tagExact', 'true'); }
    if (fCc.value) p.set('countrycode', fCc.value);
    if (fq.value.trim()) p.set('name', fq.value.trim());
    try {
      const data = (await rbGet('/json/stations/search?' + p)); if (t !== stk) return;
      const items = data.map(rbStation).filter(s => /^https:\/\//i.test(s.url) && !shown.some(x => x.url === s.url));
      if (reset) findList.replaceChildren();
      if (reset && !items.length) findList.replaceChildren(el('p', { className: 'mut', textContent: 'Aucune radio pour ce choix : essayez une autre langue ou un autre genre.' }));
      shown.push(...items); findList.append(...items.map(s => rowOf(s, false))); offset += PAGE; moreB.hidden = data.length < PAGE;
    } catch (e) {
      if (t !== stk) return; findList.replaceChildren(el('div', { className: 'warn', textContent: e.message }), btn('Réessayer', 'refresh', () => search(true)));
    }
  }
  /* ----- « Mes radios » ----- */
  const mLang = el('select', { 'aria-label': 'Langue' }), mGenre = el('select', { 'aria-label': 'Genre' });
  const mq = el('input', { type: 'search', placeholder: 'Rechercher dans mes radios…', maxLength: 80, className: 'grow', 'aria-label': 'Rechercher dans mes radios', oninput: () => drawMine() });
  const mineList = el('div', { className: 'rd-list' });
  const uniq = k => [...new Set(D.radio.mine.map(x => x[k]).filter(Boolean))].sort((a, b) => k === 'genre' ? cmpT(rbGenreLabel(a), rbGenreLabel(b)) : cmpT(capFirst(a), capFirst(b)));
  function drawMine() {
    const cl = mLang.value, cg = mGenre.value;
    fill(mLang, 'Toutes les langues', uniq('lang').map(v => [v, capFirst(v)]), cl); fill(mGenre, 'Tous les genres', uniq('genre').map(v => [v, rbGenreLabel(v)]), cg);
    const s = mq.value.trim().toLowerCase();
    const items = D.radio.mine.filter(x => (!mLang.value || x.lang === mLang.value) && (!mGenre.value || x.genre === mGenre.value) && (!s || (x.name + ' ' + x.genre + ' ' + x.lang).toLowerCase().includes(s))).sort(byName);
    mineList.replaceChildren(...(items.length ? items.map(x => rowOf(x, true)) : [el('p', { className: 'mut', textContent: D.radio.mine.length ? 'Aucune radio pour ce filtre.' : 'Aucune radio personnelle. Ajoutez une adresse de flux, étoilez une radio de « Découvrir », ou chargez quelques exemples.' })]));
  }
  mLang.onchange = mGenre.onchange = drawMine;
  /* ----- « Favoris » ----- */
  const fold = x => String(x || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const vLang = el('select', { 'aria-label': 'Langue' }), vGenre = el('select', { 'aria-label': 'Genre' });
  const vq = el('input', { type: 'search', placeholder: 'Rechercher dans mes favoris…', maxLength: 80, className: 'grow', 'aria-label': 'Rechercher dans mes favoris', oninput: () => drawFav() });
  const favList = el('div', { className: 'rd-list' }), favInfo = el('small', { className: 'mut' });
  const uniqF = k => [...new Set(D.radio.fav.map(x => x[k]).filter(Boolean))].sort((a, b) => k === 'genre' ? cmpT(rbGenreLabel(a), rbGenreLabel(b)) : cmpT(capFirst(a), capFirst(b)));
  function drawFav() {
    const cl = vLang.value, cg = vGenre.value;
    fill(vLang, 'Toutes les langues', uniqF('lang').map(v => [v, capFirst(v)]), cl); fill(vGenre, 'Tous les genres', uniqF('genre').map(v => [v, rbGenreLabel(v)]), cg);
    const s = fold(vq.value.trim());
    const items = D.radio.fav.filter(x => (!vLang.value || x.lang === vLang.value) && (!vGenre.value || x.genre === vGenre.value) && (!s || fold(x.name + ' ' + x.genre + ' ' + x.lang + ' ' + (x.cc ? rbCcLabel(x.cc) : '')).includes(s))).sort(byName);
    favList.replaceChildren(...(items.length ? items.map(x => rowOf(x, true, true)) : [el('p', { className: 'mut', textContent: D.radio.fav.length ? 'Aucun favori pour cette recherche.' : 'Aucun favori. Touchez le cœur d’une radio (dans « Découvrir » ou « Mes radios ») pour la retrouver ici.' })]));
    favInfo.textContent = D.radio.fav.length ? (items.length === D.radio.fav.length ? tr('{0} favori(s)').replace('{0}', items.length) : tr('{0} sur {1} favori(s)').replace('{0}', items.length).replace('{1}', D.radio.fav.length)) : '';
  }
  vLang.onchange = vGenre.onchange = drawFav;
  const stFields = st => [{ k: 'name', label: 'Nom de la radio', req: true, max: 120, value: st.name || '' }, { k: 'url', label: 'Adresse du flux (https://…)', req: true, max: 500, value: st.url || '' },
    { k: 'lang', label: 'Langue (ex. french, english…)', max: 40, value: st.lang || '' }, { k: 'genre', label: 'Genre (ex. jazz, news…)', max: 40, value: st.genre || '' }, { k: 'cc', label: 'Pays (code à 2 lettres, facultatif)', max: 2, value: st.cc || '' }];
  const chkSt = v => !/^https:\/\//i.test(v.url.trim()) || !httpUrl(v.url.trim()) ? 'L’adresse doit commencer par https:// (les flux http sont bloqués par le navigateur).' : v.cc.trim() && !/^[A-Za-z]{2}$/.test(v.cc.trim()) ? 'Le pays doit être un code à 2 lettres (FR, US…).' : '';
  const editSt = async st => {
    const r = await dialog(st ? 'Modifier la radio' : 'Ajouter une radio', stFields(st || {}), 'Enregistrer', { check: chkSt, note: 'Langue et genre servent à classer et filtrer vos radios : écrivez-les comme vous voulez.' }); if (!r) return;
    const d = { name: r.name.trim(), url: httpUrl(r.url.trim()), lang: r.lang.trim().toLowerCase(), genre: r.genre.trim().toLowerCase(), cc: r.cc.trim().toUpperCase() };
    if (!st && dupIndex([...D.radio.mine], true).has({ url: d.url, name: '' })) return toast('Cette adresse est déjà dans vos radios.');
    if (st) Object.assign(st, d); else { if (D.radio.mine.length >= 3000) return toast('3 000 radios au maximum.'); D.radio.mine.push({ id: uid(), logo: '', group: '', ...d }); }
    save(); drawMine(); draw();
  };
  /* Radio de l'annuaire : la modifier en crée une copie personnelle dans « Mes radios » (liée à l'originale par `orig`), affichée à la place de l'originale.
     Pour retrouver l'originale, supprimez la copie dans « Mes radios ». */
  const editBase = async st => {
    const o = D.radio.mine.find(m => m.orig === st.url || m.url === st.url);
    if (o) { if (!o.orig && o.url === st.url) o.orig = st.url; return editSt(o); }
    const r = await dialog('Modifier la radio', stFields(st), 'Enregistrer', { check: chkSt, note: 'La radio modifiée est enregistrée dans « Mes radios » et remplace l’originale dans la liste. Pour retrouver l’originale, supprimez-la de « Mes radios ».' }); if (!r) return;
    if (D.radio.mine.length >= 3000) return toast('3 000 radios au maximum.');
    D.radio.mine.push({ id: uid(), rb: st.rb || '', logo: st.logo || '', group: '', orig: st.url, name: r.name.trim(), url: httpUrl(r.url.trim()), lang: r.lang.trim().toLowerCase(), genre: r.genre.trim().toLowerCase(), cc: r.cc.trim().toUpperCase() });
    save(); drawMine(); draw(); toast('Radio modifiée : elle est dans « Mes radios ».', 3500);
  };
  const delSt = async st => { if (!(await confirmBox('Supprimer « ' + st.name + ' » de vos radios ?', 'Supprimer', true))) return; D.radio.mine = D.radio.mine.filter(x => x !== st); save(); drawMine(); draw(); };
  const regroup = async () => {
    const all = [...uniq('lang').map(v => ['lang|' + v, 'Langue : ' + v]), ...uniq('genre').map(v => ['genre|' + v, 'Genre : ' + v])];
    if (!all.length) return toast('Aucune langue ni aucun genre à renommer pour l’instant.');
    const r = await dialog('Renommer une langue ou un genre', [{ k: 'a', label: 'Catégorie', type: 'select', options: all }, { k: 'b', label: 'Nouveau nom (vide = retirer)', max: 40 }], 'Renommer', { note: 'Le changement s’applique à toutes les radios concernées.' }); if (!r) return;
    const [k, v] = r.a.split('|'); let n = 0; for (const x of D.radio.mine) if (x[k] === v) { x[k] = r.b.trim().toLowerCase(); n++; }
    save(); drawMine(); toast(n + ' radio(s) modifiée(s).');
  };
  const addSeed = () => { let n = 0; const ix = dupIndex(D.radio.mine, true); for (const [name, url, lang, genre, cc] of RADIO_SEED) if (!ix.has({ name, url, cc }) && (ix.add({ name, url, cc }), true)) { D.radio.mine.push({ id: uid(), name, url, lang, genre, cc, logo: '', group: '' }); n++; } save(); drawMine(); toast(n + ' radio(s) d’exemple ajoutée(s) (adresses à vérifier).'); };
  const expo = () => download(new Blob([JSON.stringify({ sormickRadio: 1, radios: D.radio.mine.map(({ name, url, lang, genre, cc, logo }) => ({ name, url, lang, genre, cc, logo })) }, null, 1)], { type: 'application/json' }), 'mes-radios.json');
  const impIn = el('input', { type: 'file', accept: '.json,.m3u,.m3u8,.pls,text/plain,application/json', hidden: true });
  impIn.onchange = async () => {
    const f = impIn.files[0]; impIn.value = ''; if (!f) return;
    if (f.size > 5e6) return toast('Fichier trop volumineux (5 Mo maximum).');
    try {
      const txt = await f.text(); let list = [];
      list = parseRadioList(txt);
      let n = 0, dup = 0; const ix = dupIndex([...D.radio.mine], true);
      for (const x of list) { const url = httpUrl(String((x && x.url) || '').trim()); if (!url || !/^https:/i.test(url) || D.radio.mine.length >= 3000) continue; const cand = { name: String(x.name || '').slice(0, 120), url, cc: /^[A-Za-z]{2}$/.test(x.cc || '') ? x.cc.toUpperCase() : '' }; if (ix.has(cand)) { dup++; continue; } ix.add(cand);
        D.radio.mine.push({ id: uid(), name: String(x.name || '').slice(0, 120) || 'Sans nom', url, lang: String(x.lang || '').slice(0, 40).toLowerCase(), genre: String(x.genre || '').slice(0, 40).toLowerCase(), cc: /^[A-Za-z]{2}$/.test(x.cc || '') ? x.cc.toUpperCase() : '', logo: /^https:\/\//i.test(x.logo || '') ? x.logo : '', group: '' }); n++; }
      save(); drawMine(); toast(n + ' radio(s) importée(s) (seules les adresses https sont conservées).' + (dup ? ' ' + tr('{0} doublon(s) ignoré(s).').replace('{0}', dup) : ''), 6000);
    } catch { toast('Fichier illisible (JSON, M3U ou PLS attendu).'); }
  };
  /* ----- Débit / qualité : autres flux de la même radio (annuaire) ou adresse saisie à la main ----- */
  const rateWin = async () => {
    const st = P.st; if (!st) return toast('Choisissez d’abord une radio.');
    const base = st.orig || st.url, list = el('div', { className: 'rd-list' }), msg = el('small', { className: 'mut' });
    const kb = v => v.bitrate ? v.bitrate + ' kbit/s' : tr('débit inconnu');
    const keep = v => {
      const o = D.radio.mine.find(m => m.url === st.url || m.orig === base);
      if (o) { if (!o.orig && o.url !== v.url) o.orig = base; o.url = v.url; }
      else if (D.radio.mine.length < 3000) D.radio.mine.push({ id: uid(), rb: v.rb || '', name: st.name, url: v.url, lang: st.lang || '', genre: st.genre || '', cc: st.cc || '', logo: st.logo || '', group: '', orig: base });
      else return toast('3 000 radios au maximum.');
      save(); draw(); toast('Débit mémorisé dans « Mes radios ».', 3000);
    };
    const row = (v, now) => el('div', { className: 'rd-row' + (now ? ' cur' : ''), role: 'group' },
      el('div', { className: 'grow' }, el('b', { textContent: kb(v) + (v.codec ? ' · ' + String(v.codec).toUpperCase() : '') }), el('div', { className: 'mut rd-sub', nt: 1, textContent: [v.name, v.cc && rbCcLabel(v.cc)].filter(Boolean).join(' · ') + (now ? ' · ' + tr('flux actuel') : '') })),
      ...(now ? [] : [btn('Écouter', 'play', () => { play({ ...st, url: v.url, bitrate: v.bitrate, codec: v.codec, orig: st.orig }); w2.close && w2.close(); }, 'pri', 'Écouter avec ce débit'), btn('Garder', 'star', () => keep(v), '', 'Mémoriser ce débit pour cette radio (dans « Mes radios »)')]));
    const manual = el('input', { type: 'url', placeholder: 'https://…', maxLength: 500, className: 'grow', 'aria-label': 'Adresse d’un autre flux de cette radio' });
    const tryManual = () => { const u = httpUrl(manual.value.trim()); if (!u || !/^https:\/\//i.test(u)) return toast('L’adresse doit commencer par https:// (les flux http sont bloqués par le navigateur).'); play({ ...st, url: u, bitrate: 0, codec: '', orig: st.orig }); };
    const w2 = win('Débit / qualité', 'sliders', [
      el('p', { className: 'mut', textContent: 'Un flux radio en direct ne peut pas être ré-encodé dans le navigateur : on change de débit en choisissant un autre flux réel proposé par la radio (souvent 32, 64, 128 ou 320 kbit/s).' }),
      el('h3', { nt: 1, textContent: st.name }), msg, list,
      el('div', { className: 'card' }, el('b', { textContent: 'Autre adresse de flux' }), el('div', { className: 'row' }, manual, btn('Essayer', 'play', tryManual, 'pri')))], { w: 560, h: 560, cls: 'ratew' });
    list.append(row({ ...st }, true)); msg.textContent = tr('Recherche des autres débits…');
    const q = String(st.name).replace(/\b\d{2,3}\s?(k|kbps|kb\/s|kbit\/s)\b/gi, ' ').replace(/\b(mp3|aac\+?|ogg|hq|lq|hd|low|high)\b/gi, ' ').replace(/[()[\]|_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    try {
      const p = new URLSearchParams({ name: q || st.name, hidebroken: 'true', order: 'bitrate', reverse: 'true', limit: '80', is_https: 'true' });
      if (st.cc) p.set('countrycode', st.cc);
      const seen = new Set([st.url]), items = (await rbGet('/json/stations/search?' + p)).map(rbStation).filter(v => /^https:\/\//i.test(v.url) && !seen.has(v.url) && seen.add(v.url));
      list.append(...items.map(v => row(v, false))); msg.textContent = items.length ? tr('{0} autre(s) flux trouvé(s) pour ce nom.').replace('{0}', items.length) : tr('Aucun autre flux trouvé : saisissez une adresse ci-dessous.');
    } catch (e) { msg.textContent = e.message; }
  };
  const rateB = btn('Débit', 'sliders', rateWin, '', 'Choisir un autre débit (qualité) pour la radio en cours');
  /* ----- Mise à jour : retire les radios disparues / hors service (contrôle de l'annuaire), ajoute les nouveautés ----- */
  const updRadio = async arg => { const only = typeof arg === 'string' ? arg : '';   // only = adresse d’une source qu’on vient d’ajouter : seule celle-ci est lue et proposée
    const known = [...new Map([...D.radio.mine, ...D.radio.fav].map(x => [x.url, x])).values()];
    const pr = toast('Vérification de vos radios…', 0); let skipped = 0;
    try {
      /* sources ajoutées par vous (listes M3U / PLS / JSON) : lues en plus de l'annuaire */
      const got = new Map(), failed = [];
      for (const u of D.radio.usrc.slice(0, 40).filter(u => !only || u.url === only)) { try { const r = await fetchAny(u.url, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('HTTP'); const seenU = new Set(), all = parseRadioList(await r.text()).map(x => ({ ...x, url: httpUrl(String((x && x.url) || '').trim()) })).filter(x => /^https:\/\//i.test(x.url) && !seenU.has(x.url) && seenU.add(x.url)); got.set(u.url, { u, all }); } catch { failed.push(u.name); } }
      const srcSets = new Map([...got].map(([k, g]) => [k, new Set(g.all.map(x => x.url))]));
      for (const x of known) if (!x.src) { const f = [...srcSets].find(([, v]) => v.has(x.orig || x.url)); if (f) x.src = f[0]; }
      const chk = new Map();   // url → { st: fiche de l'annuaire | null, s: 'ok' | 'bad' | 'gone' | 'unknown' }
      const todo = only ? [] : known.slice(0, 400); skipped = only ? 0 : known.length - todo.length;
      const withId = todo.filter(x => x.rb), noId = todo.filter(x => !x.rb); let n = 0;
      for (let i = 0; i < withId.length; i += 40) {
        const part = withId.slice(i, i + 40), res = await rbGet('/json/stations/byuuid?uuids=' + part.map(x => x.rb).join(',')), by = new Map(res.map(r => [r.stationuuid, r]));
        for (const x of part) { const r = by.get(x.rb); chk.set(x.url, r ? { st: rbStation(r), s: r.lastcheckok === 0 ? 'bad' : 'ok' } : { st: null, s: 'gone' }); }
        n += part.length; pr.set(tr('Vérification de vos radios…') + ' ' + n + ' / ' + todo.length);
      }
      const q = noId.slice(); const work = async () => { while (q.length) { const x = q.shift();
        try {
          const res = await rbGet('/json/stations/search?' + new URLSearchParams({ name: x.name, nameExact: 'true', limit: '30' })), r = res.find(r => r.url_resolved === x.url || r.url === x.url || (x.orig && (r.url_resolved === x.orig || r.url === x.orig)));
          if (r) { x.rb = r.stationuuid; chk.set(x.url, { st: rbStation(r), s: r.lastcheckok === 0 ? 'bad' : 'ok' }); } else chk.set(x.url, { st: null, s: 'unknown' });
        } catch { chk.set(x.url, { st: null, s: 'unknown' }); }
        n++; pr.set(tr('Vérification de vos radios…') + ' ' + n + ' / ' + todo.length); } };
      await Promise.all([work(), work(), work(), work(), work()]);
      /* nouveautés : filtres de « Découvrir », sinon les langues de vos radios */
      pr.set(tr('Recherche des nouveautés…'));
      const langs = only ? [] : fLang.value || fGenre.value || fCc.value ? [fLang.value] : (() => { const c = {}; for (const x of known) if (x.lang) c[x.lang] = (c[x.lang] || 0) + 1; return Object.keys(c).sort((a, b) => c[b] - c[a]).slice(0, 3); })();
      const have = new Set(known.map(x => x.url)), haveId = new Set(known.map(x => x.rb).filter(Boolean)), fresh = new Map(), idx = dupIndex(known, true), firstSrc = new Set(D.radio.usrc.map(x => x.url)); let dup = 0;
      for (const lg of (only ? [] : langs.length ? langs : [''])) {
        const p = new URLSearchParams({ hidebroken: 'true', order: 'changetimestamp', reverse: 'true', limit: (fLang.value || fGenre.value || fCc.value) ? '200' : '60', is_https: 'true' });
        if (lg) { p.set('language', lg); p.set('languageExact', 'true'); } if (fGenre.value) { p.set('tag', fGenre.value); p.set('tagExact', 'true'); } if (fCc.value) p.set('countrycode', fCc.value);
        try { for (const r of (await rbGet('/json/stations/search?' + p)).map(rbStation)) if (/^https:\/\//i.test(r.url) && !have.has(r.url) && !haveId.has(r.rb) && !fresh.has(r.url)) { if (idx.has(r)) dup++; else { idx.add(r); fresh.set(r.url, r); } } } catch { /* annuaire : on garde ce qui a été trouvé */ }
      }
      pr.close();
      const why = { bad: 'Ne répond plus (contrôle de l’annuaire)', gone: 'Supprimée de l’annuaire' };
      const srcGone = x => x.src && srcSets.has(x.src) && !srcSets.get(x.src).has(x.orig || x.url);
      const bad = only ? [] : known.filter(x => (chk.get(x.url) && (chk.get(x.url).s === 'bad' || chk.get(x.url).s === 'gone')) || srcGone(x));
      const reason = x => { const c = chk.get(x.url); return c && why[c.s] ? tr(why[c.s]) : tr('Retirée de sa liste'); };
      const freshS = new Map(), baseS = [], firstS = [];
      /* source ajoutée par vous et jamais lue : toutes ses radios sont proposées ; sinon seules les radios nouvelles depuis la dernière lecture */
      for (const [k, g] of got) { let old = D.radio.seen[k]; if (!old) { if (firstSrc.has(k)) { old = []; firstS.push(g.u.name); } else { baseS.push(g.u.name); continue; } } const o = new Set(old); for (const x of g.all) if (!o.has(rbH32(x.url))) { if (idx.has(x)) { dup++; continue; } idx.add(x); freshS.set(x.url, { x, k, name: g.u.name }); } }
      const CAP = 500, restH = new Set([...freshS.values()].slice(CAP).map(v => rbH32(v.x.url)));   // au-delà : reproposées à la mise à jour suivante
      const finish = () => { for (const [k, g] of got) D.radio.seen[k] = g.all.map(x => rbH32(x.url)).filter(h => !restH.has(h)).slice(0, 6000); };
      if (baseS.length) { for (const [k, g] of got) if (!D.radio.seen[k] && !firstSrc.has(k) && Object.keys(D.radio.seen).length < 40) D.radio.seen[k] = g.all.map(x => rbH32(x.url)).slice(0, 6000); save(); }   // référence enregistrée même si vous annulez
      let moved = 0; for (const x of only ? [] : known) { const c = chk.get(x.url); if (c && c.s === 'ok' && c.st && /^https:\/\//i.test(c.st.url) && c.st.url !== x.url && !x.orig && !have.has(c.st.url)) { for (const l of [D.radio.mine, D.radio.fav]) for (const y of l) if (y.url === x.url) y.url = c.st.url; moved++; } }
      const r = await updReview({ title: 'Mettre à jour mes radios', intro: tr('Rien n’est modifié avant « Appliquer ». Les radios que vous avez ajoutées vous-même et qui sont inconnues de l’annuaire ne sont jamais retirées.') + (skipped ? ' ' + tr('{0} radio(s) non vérifiée(s) (400 par mise à jour).').replace('{0}', skipped) : '') + (firstS.length ? ' ' + tr('Source lue pour la première fois : ses radios sont proposées ci-dessous :') + ' ' + firstS.join(', ') : '') + (dup ? ' ' + tr('{0} radio(s) ignorée(s) car déjà présente(s) (même adresse ou même nom).').replace('{0}', dup) : '') + (baseS.length ? ' ' + tr('Listes lues pour la première fois (elles servent de référence, leurs nouveautés seront proposées aux prochaines mises à jour) :') + ' ' + baseS.join(', ') : '') + (failed.length ? ' ' + tr('Sources injoignables (non modifiées) :') + ' ' + failed.join(', ') : ''), groups: [
        { k: 'rm', title: 'Radios disparues ou hors service', items: bad.map(x => ({ id: x.url, label: x.name, sub: reason(x) })) },
        { k: 'add', title: 'Nouveautés de l’annuaire', hint: tr('Radios récemment ajoutées ou modifiées dans l’annuaire (https, en service).'), items: [...fresh.values()].map(x => ({ id: x.url, label: x.name, sub: [x.lang && capFirst(x.lang), x.genre && capFirst(x.genre), x.cc && rbCcLabel(x.cc), x.bitrate && x.bitrate + ' k'].filter(Boolean).join(' · ') })) },
        { k: 'adds', title: 'Nouveautés de vos sources', hint: freshS.size > CAP ? tr('{0} nouvelles radios : les {1} premières sont proposées, les autres le seront à la mise à jour suivante.').replace('{0}', freshS.size).replace('{1}', CAP) : '', items: [...freshS.values()].slice(0, CAP).map(v => ({ id: v.x.url, label: String(v.x.name || '').slice(0, 120) || 'Sans nom', sub: [v.x.genre && capFirst(v.x.genre), v.name].filter(Boolean).join(' · ') })) }] });
      if (!r) { if (moved) { save(); drawMine(); drawFav(); } return; }
      const nrm = D.radio.mine.length + D.radio.fav.length; D.radio.mine = D.radio.mine.filter(x => !r.rm.has(x.url)); D.radio.fav = D.radio.fav.filter(x => !r.rm.has(x.url)); const removed = nrm - D.radio.mine.length - D.radio.fav.length;
      let added = 0, dup2 = 0; const idx2 = dupIndex([...D.radio.mine, ...D.radio.fav], true);
      for (const u of r.add) { const x = fresh.get(u); if (x && idx2.has(x)) { dup2++; continue; } if (x) idx2.add(x); if (x && D.radio.mine.length < 3000) { D.radio.mine.push({ id: uid(), rb: x.rb, name: x.name, url: x.url, lang: x.lang, genre: x.genre, cc: x.cc, logo: x.logo, group: '' }); added++; } }
      for (const u of r.adds) { const v = freshS.get(u); if (v && idx2.has(v.x)) { dup2++; continue; } if (v) idx2.add(v.x); if (v && D.radio.mine.length < 3000) { const x = v.x; D.radio.mine.push({ id: uid(), name: String(x.name || '').slice(0, 120) || 'Sans nom', url: x.url, lang: String(x.lang || '').slice(0, 40).toLowerCase(), genre: String(x.genre || '').slice(0, 40).toLowerCase(), cc: /^[A-Za-z]{2}$/.test(x.cc || '') ? x.cc.toUpperCase() : '', logo: /^https:\/\//i.test(x.logo || '') ? x.logo : '', group: '', src: v.k }); added++; } }
      finish(); save(); drawMine(); drawFav(); draw();
      toast(tr('Mise à jour terminée : {0} retirée(s), {1} ajoutée(s), {2} adresse(s) rafraîchie(s).').replace('{0}', removed).replace('{1}', added).replace('{2}', moved) + (dup + dup2 ? ' ' + tr('{0} doublon(s) ignoré(s).').replace('{0}', dup + dup2) : ''), 7000);
    } catch (e) { pr.close(); toast(e.message || 'Mise à jour impossible.', 7000); }
  };
  /* ----- Sources de mise à jour : serveurs de l'annuaire (modifiables) + listes supplémentaires ----- */
  const apiNorm = u => { const v = httpUrl(String(u || '').trim()); return /^https:\/\//i.test(v || '') ? v.replace(/\/+$/, '') : ''; };
  const setApi = a => { D.radio.api = a.length === RB_BASES.length && a.every((u, i) => u === RB_BASES[i]) ? [] : a; RB_META = null; RB_I = 0; save(); };
  const srcWin = () => {
    const box = el('div', { className: 'col' }), sw = win('Sources de mise à jour', 'sliders', [box], { w: 600, h: 660 });
    const draw = () => {
      const bases = rbBases().slice();
      const rowsB = bases.map((u, i) => el('div', { className: 'rd-row' }, el('div', { className: 'grow' }, el('b', { nt: 1, textContent: u })), btn('', 'edit', () => editSrv(i), '', 'Modifier le serveur'), ...(bases.length > 1 ? [btn('', 'trash', () => { setApi(bases.filter((_, k) => k !== i)); draw(); }, 'dng', 'Supprimer le serveur')] : [])));
      const rowsU = [...D.radio.usrc].sort(byName).map(x => el('div', { className: 'rd-row' }, el('div', { className: 'grow' }, el('b', { nt: 1, textContent: x.name }), el('div', { className: 'mut rd-sub', nt: 1, textContent: x.url })), btn('', 'edit', () => editU(x), '', 'Modifier la source'), btn('', 'trash', () => delU(x), 'dng', 'Supprimer la source')));
      box.replaceChildren(
        el('h3', { textContent: 'Annuaire des radios (serveurs)' }),
        el('p', { className: 'mut', textContent: 'Ces serveurs Radio Browser sont interrogés dans l’ordre (le suivant prend le relais si l’un ne répond pas). Si l’annuaire change d’adresse un jour, modifiez-les ici.' }),
        ...rowsB,
        el('div', { className: 'row' }, btn('Ajouter un serveur', 'plus', () => editSrv(-1), 'pri'), btn('Tester', 'play', testSrv), btn('Adresses d’origine', 'refresh', () => { setApi(RB_BASES.slice()); draw(); toast('Adresse enregistrée.', 2500); })),
        el('h3', { textContent: 'Autres sources de radios lues à chaque mise à jour' }),
        el('p', { className: 'mut', textContent: 'Listes M3U, PLS ou JSON : elles sont lues en plus de l’annuaire. Les radios retirées de leur liste sont proposées à la suppression, les nouvelles à l’ajout.' }),
        el('div', { className: 'row' }, btn('Ajouter une source', 'plus', () => editU(null), 'pri')),
        ...(rowsU.length ? rowsU : [el('p', { className: 'mut', textContent: 'Aucune source ajoutée.' })]));
    };
    const editSrv = async i => {
      const bases = rbBases().slice();
      const r = await dialog(i >= 0 ? 'Modifier le serveur' : 'Ajouter un serveur', [{ k: 'url', label: 'Adresse du serveur (https://…)', req: true, max: 300, value: i >= 0 ? bases[i] : '' }], 'Enregistrer', { check: v => apiNorm(v.url) ? '' : 'L’adresse doit commencer par https://.' }); if (!r) return;
      const u = apiNorm(r.url); if (bases.some((b, k) => k !== i && b === u)) return toast('Ce serveur est déjà dans la liste.');
      if (i >= 0) bases[i] = u; else { if (bases.length >= 8) return toast('8 serveurs au maximum.'); bases.push(u); }
      setApi(bases); draw(); toast('Adresse enregistrée.', 2500);
    };
    const testSrv = async () => {
      const bases = rbBases().slice(), pr = toast('Lecture de la liste…', 0); let ok = 0;
      await Promise.all(bases.map(async u => { try { const r = await fetchAny(u + '/json/stats', { signal: AbortSignal.timeout(10000) }); if (r.ok && (await r.json())) ok++; } catch { /* ne répond pas */ } }));
      pr.close(); toast(ok ? tr('{0} serveur(s) sur {1} répondent.').replace('{0}', ok).replace('{1}', bases.length) : tr('Aucun serveur ne répond.'), 6000);
    };
    const editU = async x => {
      const r = await dialog(x ? 'Modifier la source' : 'Ajouter une source', [{ k: 'name', label: 'Nom de la source', req: true, max: 120, value: x ? x.name : '' }, { k: 'url', label: 'Adresse de la liste (https://….m3u, .pls ou .json)', req: true, max: 600, value: x ? x.url : '' }], 'Enregistrer', { check: v => apiNorm(v.url) ? '' : 'L’adresse doit commencer par https://.' }); if (!r) return;
      const d = { name: r.name.trim(), url: httpUrl(r.url.trim()) };
      if (D.radio.usrc.some(y => y !== x && y.url === d.url)) return toast('Cette source est déjà dans la liste.');
      const urlChanged = !x || x.url !== d.url;
      if (x) Object.assign(x, d); else { if (D.radio.usrc.length >= 40) return toast('40 sources au maximum.'); D.radio.usrc.push({ id: uid(), ...d }); }
      if (urlChanged) delete D.radio.seen[d.url];   // nouvelle adresse = ses radios seront (re)proposées
      save(); draw();
      if (urlChanged && (await confirmBox(tr('Importer maintenant les radios de « {0} » ? Les doublons (même adresse ou même nom) seront ignorés.').replace('{0}', d.name), 'Importer'))) updRadio(d.url);
    };
    const delU = async x => { if (!(await confirmBox(tr('Supprimer la source « {0} » ?').replace('{0}', x.name), 'Supprimer', true))) return; D.radio.usrc = D.radio.usrc.filter(y => y !== x); save(); draw(); };
    draw();
  };
  const updBtns = () => [btn('Mettre à jour', 'refresh', updRadio, '', 'Retirer les radios disparues ou hors service et ajouter les nouveautés de l’annuaire'), btn('Sources…', 'sliders', srcWin, '', 'Sources de mise à jour')];
  /* ----- onglets ----- */
  const paneFind = el('div', { className: 'col' }, pin(el('div', { className: 'col pinblk' }, el('div', { className: 'rd-filters' }, fLang, fGenre, fCc), el('div', { className: 'row' }, fq, btn('Rechercher', 'search', () => search(true), 'pri')), el('div', { className: 'row' }, ...updBtns()), note)), findList, el('div', { className: 'row center' }, moreB));
  const paneMine = el('div', { className: 'col' }, pin(el('div', { className: 'col pinblk' }, el('div', { className: 'rd-filters' }, mLang, mGenre), el('div', { className: 'row' }, mq))),
    el('div', { className: 'row' }, btn('Ajouter une radio', 'plus', () => editSt(null), 'pri'), btn('Renommer langue / genre', 'edit', regroup), btn('Exemples', 'radio', addSeed, '', 'Ajouter quelques radios d’exemple'), btn('Importer…', 'upload', () => impIn.click(), '', 'Importer un fichier JSON, M3U ou PLS'), btn('Exporter', 'download', expo), ...updBtns(), impIn), mineList);
  const paneFav = el('div', { className: 'col' }, pin(el('div', { className: 'col pinblk' }, el('div', { className: 'rd-filters' }, vLang, vGenre), el('div', { className: 'row' }, vq), el('div', { className: 'row' }, ...updBtns()), favInfo)), favList);
  const tFind = btn('Découvrir', 'globe', () => setTab('find'), 'rd-tab'), tFav = btn('Favoris', 'heart', () => setTab('fav'), 'rd-tab'), tMine = btn('Mes radios', 'star', () => setTab('mine'), 'rd-tab');
  const setTab = t => { tab = t; paneFind.hidden = t !== 'find'; paneFav.hidden = t !== 'fav'; paneMine.hidden = t !== 'mine'; tFind.classList.toggle('on', t === 'find'); tFav.classList.toggle('on', t === 'fav'); tMine.classList.toggle('on', t === 'mine'); if (t === 'mine') drawMine(); if (t === 'fav') drawFav(); };
  const ctl = el('div', { className: 'rd-ctl' }, playB, el('span', { className: 'rd-vl' }, ico('vol', 16), vol), rateB, recB, castBtn(() => au, () => P.st && { url: P.st.url, name: P.st.name }), recInfo, segSelect('radio'));
  const w = win('Sormick Radio', 'radio', [head, ctl, lyr, destBar('radio'), pin(el('div', { className: 'row tight' }, tFind, tFav, tMine)), paneFind, paneFav, paneMine, au],
    { w: 1000, h: 720, cls: 'radio', split: 4, onclose: () => { if (P.icy) P.icy.stop(); au.pause(); au.removeAttribute('src'); if (P.rec) P.rec.stop(); VIEWS.delete(drawMine); VIEWS.delete(drawFav); } });
  au.hidden = true; VIEWS.add(drawMine); VIEWS.add(drawFav); setTab('find'); paintPlay();
  meta().then(() => search(true));
  return w;
}
