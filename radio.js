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
async function rbGet(path) {
  let last;
  for (let i = 0; i < RB_BASES.length; i++) {
    const j = (RB_I + i) % RB_BASES.length;
    try {
      const r = await fetchAny(RB_BASES[j] + path, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const v = await r.json(); RB_I = j; return v;
    } catch (e) { last = e; }
  }
  throw new Error('Annuaire des radios injoignable (' + ((last && last.message) || 'réseau') + ').');
}
const dn = (type, code) => { try { const v = new Intl.DisplayNames([uiLang()], { type }).of(code); return v && v !== code ? v : ''; } catch { return ''; } };
const rbLangLabel = (name, iso) => capFirst((iso && dn('language', iso)) || name);
const rbGenreLabel = t => (uiLang() === 'fr' && RADIO_GENRE_FR[t]) || capFirst(t);
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
const rbStation = x => ({ id: 'rb:' + x.stationuuid, name: String(x.name || '').trim().slice(0, 120) || 'Sans nom', url: String(x.url_resolved || x.url || ''), lang: String(x.language || '').split(',')[0].trim().slice(0, 40), genre: String(x.tags || '').split(',')[0].trim().slice(0, 40), cc: String(x.countrycode || '').toUpperCase(), logo: /^https:\/\//i.test(x.favicon || '') ? x.favicon : '', tags: String(x.tags || '').split(',').filter(Boolean).slice(0, 4), codec: x.codec || '', bitrate: x.bitrate || 0 });

function stLogo(st) {
  const box = el('span', { className: 'rd-lg' });
  const letter = () => { box.replaceChildren(el('b', { textContent: (st.name || '?').trim().charAt(0).toUpperCase() })); box.style.background = `hsl(${hue(st.name)} 55% 32%)`; };
  if (st.logo && httpUrl(st.logo)) { const i = el('img', { alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', src: st.logo }); i.onerror = letter; box.append(i); } else letter();
  return box;
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
    au.src = st.url; if (P.icy) P.icy.stop(); P.icy = icyWatch(st.url, onSong); au.play().catch(() => setS('Lecture refusée ou flux indisponible.', false)); paintPlay(); draw();
  };
  const stop = () => { if (P.icy) P.icy.stop(); P.icy = null; au.pause(); au.removeAttribute('src'); au.load(); setS('Arrêtée', false); paintPlay(); };
  const paintPlay = () => { const on = P.st && !au.paused; playB.lastChild.textContent = tr(on ? 'Arrêter' : 'Écouter'); playB.firstChild.replaceWith(ico(on ? 'stop' : 'play', 16)); };
  au.addEventListener('play', paintPlay); au.addEventListener('pause', paintPlay);
  /* ----- paroles de la chanson (LRCLIB) ----- */
  const lyIn = el('input', { type: 'search', placeholder: 'Artiste – Titre', maxLength: 160, className: 'grow', 'aria-label': 'Artiste – Titre', onkeydown: e => { if (e.key === 'Enter') lySearch(); } });
  const lySt = el('small', { className: 'mut' }), lyOut = el('pre', { className: 'rd-lyrics' }), lyPick = el('select', { 'aria-label': 'Résultat', hidden: true }), nowL = el('small', { className: 'rd-now' });
  const lyr = el('details', { className: 'rd-ly' }, el('summary', {}, el('span', { textContent: 'Paroles de la chanson' }), nowL),
    el('div', { className: 'row' }, lyIn, btn('Chercher les paroles', 'search', () => lySearch(), 'pri')), lyPick, lySt, lyOut);
  let lyRes = [], lyTk = 0;
  const lyShow = i => { const x = lyRes[i]; lyOut.textContent = x ? (x.instrumental ? tr('Morceau instrumental : pas de paroles.') : x.text) : ''; lyOut.scrollTop = 0; };
  lyPick.onchange = () => lyShow(+lyPick.value);
  function lyReset() { lyTk++; lyRes = []; lyOut.textContent = ''; lyPick.hidden = true; lySt.textContent = ''; lyIn.value = ''; nowL.textContent = ''; }
  async function lySearch(auto) {
    const s = splitSong(lyIn.value); if (!s.title) return lyIn.focus();
    const t = ++lyTk; lySt.textContent = tr('Recherche des paroles…'); lyOut.textContent = ''; lyPick.hidden = true;
    try {
      const a = await lyricsFind(s.artist, s.title); if (t !== lyTk) return; lyRes = a;
      if (!a.length) { lySt.textContent = tr('Aucune parole trouvée : corrigez « Artiste – Titre » puis relancez la recherche.'); return; }
      lySt.textContent = ''; opts(lyPick, a.map((x, i) => [String(i), x.label])); lyPick.hidden = a.length < 2; lyPick.value = '0'; lyShow(0);
      if (auto) lyr.open = true;   // titre détecté et paroles trouvées : le panneau s'ouvre tout seul
    } catch (e) { if (t === lyTk) lySt.textContent = e.message; }
  }
  function onSong(t) { if (!P.st) return; nowL.textContent = ' ♪ ' + t; lyIn.value = t; lySearch(true); }
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
    fill(fLang, 'Toutes les langues', m.langs.map(x => [x.v, rbLangLabel(x.v, x.iso) + (x.n ? ' (' + x.n + ')' : '')]).sort((a, b) => a[1].localeCompare(b[1], uiLang())), L.lang);
    fill(fGenre, 'Tous les genres', m.tags.map(x => [x.v, rbGenreLabel(x.v) + (x.n ? ' (' + x.n + ')' : '')]).sort((a, b) => a[1].localeCompare(b[1], uiLang())), L.genre);
    fill(fCc, 'Tous les pays', m.ccs.map(x => [x.v, rbCcLabel(x.v)]).sort((a, b) => a[1].localeCompare(b[1], uiLang())), L.cc);
    fCc.hidden = !m.ccs.length; if (!m.live) note.textContent = 'Annuaire en ligne injoignable : listes de secours. Vous pouvez toujours ouvrir « Mes radios ».';
  };
  const remember = () => { D.radio.last = { lang: fLang.value, genre: fGenre.value, cc: fCc.value }; save(); };
  for (const s of [fLang, fGenre, fCc]) s.onchange = () => { remember(); search(true); };
  const note = el('small', { className: 'mut' });
  const findList = el('div', { className: 'rd-list' }), moreB = btn('Plus de résultats', 'down', () => search(false)); moreB.hidden = true;
  const inMine = st => D.radio.mine.some(m => m.url === st.url || m.orig === st.url);
  const star = st => {
    const on = inMine(st);
    return btn('', on ? 'check' : 'star', e => { e.stopPropagation(); if (on) D.radio.mine = D.radio.mine.filter(m => m.url !== st.url && m.orig !== st.url); else if (D.radio.mine.length < 3000) D.radio.mine.push({ id: uid(), name: st.name, url: st.url, lang: st.lang, genre: st.genre, cc: st.cc, logo: st.logo, group: '' }); save(); draw(); drawMine(); toast(on ? 'Retirée de « Mes radios ».' : 'Ajoutée à « Mes radios » : modifiable à volonté.', 3000); },
      on ? 'rd-on' : '', on ? 'Retirer de Mes radios' : 'Ajouter à Mes radios');
  };
  const rowOf = (st, mine) => {
    if (!mine) { const o = D.radio.mine.find(m => m.orig === st.url); if (o) st = o; }   // radio de l'annuaire déjà modifiée : on affiche votre version
    const cur = P.st && P.st.url === st.url;
    const sub = [st.lang && capFirst(st.lang), st.genre && capFirst(st.genre), st.cc && rbCcLabel(st.cc), st.codec && st.codec + (st.bitrate ? ' ' + st.bitrate + ' k' : '')].filter(Boolean).join(' · ');
    return el('div', { className: 'rd-row' + (cur ? ' cur' : ''), tabIndex: 0, role: 'button', 'aria-label': 'Écouter ' + st.name, onclick: () => play(st), onkeydown: e => { if (e.key === 'Enter') play(st); } },
      stLogo(st), el('div', { className: 'grow' }, el('b', { textContent: st.name }), el('div', { className: 'mut rd-sub', textContent: sub })),
      ...(mine ? [btn('', 'edit', e => { e.stopPropagation(); editSt(st); }, '', 'Modifier cette radio'), btn('', 'trash', e => { e.stopPropagation(); delSt(st); }, 'dng', 'Supprimer cette radio')] : [btn('', 'edit', e => { e.stopPropagation(); editBase(st); }, '', 'Modifier cette radio (nom, adresse, langue, genre…)'), star(st)]));
  };
  const draw = () => { findList.querySelectorAll('.rd-row').forEach((r, i) => { const st = shown[i]; if (st) r.replaceWith(rowOf(st, false)); }); drawMine(); };
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
  const uniq = k => [...new Set(D.radio.mine.map(x => x[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, uiLang()));
  function drawMine() {
    const cl = mLang.value, cg = mGenre.value;
    fill(mLang, 'Toutes les langues', uniq('lang').map(v => [v, capFirst(v)]), cl); fill(mGenre, 'Tous les genres', uniq('genre').map(v => [v, rbGenreLabel(v)]), cg);
    const s = mq.value.trim().toLowerCase();
    const items = D.radio.mine.filter(x => (!mLang.value || x.lang === mLang.value) && (!mGenre.value || x.genre === mGenre.value) && (!s || (x.name + ' ' + x.genre + ' ' + x.lang).toLowerCase().includes(s))).sort(byName);
    mineList.replaceChildren(...(items.length ? items.map(x => rowOf(x, true)) : [el('p', { className: 'mut', textContent: D.radio.mine.length ? 'Aucune radio pour ce filtre.' : 'Aucune radio personnelle. Ajoutez une adresse de flux, étoilez une radio de « Découvrir », ou chargez quelques exemples.' })]));
  }
  mLang.onchange = mGenre.onchange = drawMine;
  const stFields = st => [{ k: 'name', label: 'Nom de la radio', req: true, max: 120, value: st.name || '' }, { k: 'url', label: 'Adresse du flux (https://…)', req: true, max: 500, value: st.url || '' },
    { k: 'lang', label: 'Langue (ex. french, english…)', max: 40, value: st.lang || '' }, { k: 'genre', label: 'Genre (ex. jazz, news…)', max: 40, value: st.genre || '' }, { k: 'cc', label: 'Pays (code à 2 lettres, facultatif)', max: 2, value: st.cc || '' }];
  const chkSt = v => !/^https:\/\//i.test(v.url.trim()) || !httpUrl(v.url.trim()) ? 'L’adresse doit commencer par https:// (les flux http sont bloqués par le navigateur).' : v.cc.trim() && !/^[A-Za-z]{2}$/.test(v.cc.trim()) ? 'Le pays doit être un code à 2 lettres (FR, US…).' : '';
  const editSt = async st => {
    const r = await dialog(st ? 'Modifier la radio' : 'Ajouter une radio', stFields(st || {}), 'Enregistrer', { check: chkSt, note: 'Langue et genre servent à classer et filtrer vos radios : écrivez-les comme vous voulez.' }); if (!r) return;
    const d = { name: r.name.trim(), url: httpUrl(r.url.trim()), lang: r.lang.trim().toLowerCase(), genre: r.genre.trim().toLowerCase(), cc: r.cc.trim().toUpperCase() };
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
    D.radio.mine.push({ id: uid(), logo: st.logo || '', group: '', orig: st.url, name: r.name.trim(), url: httpUrl(r.url.trim()), lang: r.lang.trim().toLowerCase(), genre: r.genre.trim().toLowerCase(), cc: r.cc.trim().toUpperCase() });
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
  const addSeed = () => { let n = 0; for (const [name, url, lang, genre, cc] of RADIO_SEED) if (!D.radio.mine.some(x => x.url === url)) { D.radio.mine.push({ id: uid(), name, url, lang, genre, cc, logo: '', group: '' }); n++; } save(); drawMine(); toast(n + ' radio(s) d’exemple ajoutée(s) (adresses à vérifier).'); };
  const expo = () => download(new Blob([JSON.stringify({ sormickRadio: 1, radios: D.radio.mine.map(({ name, url, lang, genre, cc, logo }) => ({ name, url, lang, genre, cc, logo })) }, null, 1)], { type: 'application/json' }), 'mes-radios.json');
  const impIn = el('input', { type: 'file', accept: '.json,.m3u,.m3u8,.pls,text/plain,application/json', hidden: true });
  impIn.onchange = async () => {
    const f = impIn.files[0]; impIn.value = ''; if (!f) return;
    if (f.size > 5e6) return toast('Fichier trop volumineux (5 Mo maximum).');
    try {
      const txt = await f.text(); let list = [];
      if (/^\s*[{[]/.test(txt)) { const j = JSON.parse(txt); list = Array.isArray(j) ? j : j.radios || []; }
      else if (/^\s*\[playlist\]/i.test(txt)) { const m = [...txt.matchAll(/^File(\d+)=(.+)$/gim)], t = k => (txt.match(new RegExp('^Title' + k + '=(.+)$', 'im')) || [])[1]; list = m.map(x => ({ name: t(x[1]) || x[2], url: x[2].trim() })); }
      else list = parseM3U(txt).map(c => ({ name: c.name, url: c.url, lang: c.lang, genre: c.group, logo: c.logo }));
      let n = 0;
      for (const x of list) { const url = httpUrl(String((x && x.url) || '').trim()); if (!url || !/^https:/i.test(url) || D.radio.mine.length >= 3000 || D.radio.mine.some(m => m.url === url)) continue;
        D.radio.mine.push({ id: uid(), name: String(x.name || '').slice(0, 120) || 'Sans nom', url, lang: String(x.lang || '').slice(0, 40).toLowerCase(), genre: String(x.genre || '').slice(0, 40).toLowerCase(), cc: /^[A-Za-z]{2}$/.test(x.cc || '') ? x.cc.toUpperCase() : '', logo: /^https:\/\//i.test(x.logo || '') ? x.logo : '', group: '' }); n++; }
      save(); drawMine(); toast(n + ' radio(s) importée(s) (seules les adresses https sont conservées).', 5000);
    } catch { toast('Fichier illisible (JSON, M3U ou PLS attendu).'); }
  };
  /* ----- onglets ----- */
  const paneFind = el('div', { className: 'col' }, el('div', { className: 'rd-filters' }, fLang, fGenre, fCc), el('div', { className: 'row' }, fq, btn('Rechercher', 'search', () => search(true), 'pri')), note, findList, el('div', { className: 'row center' }, moreB));
  const paneMine = el('div', { className: 'col' }, el('div', { className: 'rd-filters' }, mLang, mGenre), el('div', { className: 'row' }, mq),
    el('div', { className: 'row' }, btn('Ajouter une radio', 'plus', () => editSt(null), 'pri'), btn('Renommer langue / genre', 'edit', regroup), btn('Exemples', 'radio', addSeed, '', 'Ajouter quelques radios d’exemple'), btn('Importer…', 'upload', () => impIn.click(), '', 'Importer un fichier JSON, M3U ou PLS'), btn('Exporter', 'download', expo), impIn), mineList);
  const tFind = btn('Découvrir', 'globe', () => setTab('find'), 'rd-tab'), tMine = btn('Mes radios', 'star', () => setTab('mine'), 'rd-tab');
  const setTab = t => { tab = t; paneFind.hidden = t !== 'find'; paneMine.hidden = t !== 'mine'; tFind.classList.toggle('on', t === 'find'); tMine.classList.toggle('on', t === 'mine'); if (t === 'mine') drawMine(); };
  const ctl = el('div', { className: 'rd-ctl' }, playB, el('span', { className: 'rd-vl' }, ico('vol', 16), vol), recB, recInfo, segSelect('radio'));
  const w = win('Sormick Radio', 'radio', [head, ctl, lyr, destBar('radio'), el('div', { className: 'row tight' }, tFind, tMine), paneFind, paneMine, au],
    { w: 860, h: 680, cls: 'radio', onclose: () => { if (P.icy) P.icy.stop(); au.pause(); au.removeAttribute('src'); if (P.rec) P.rec.stop(); VIEWS.delete(drawMine); } });
  au.hidden = true; VIEWS.add(drawMine); setTab('find'); paintPlay();
  meta().then(() => search(true));
  return w;
}
