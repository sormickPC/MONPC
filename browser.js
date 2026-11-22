'use strict';
/* sormick Cloud — mini navigateur.
   Affiche un site dans une fenêtre (iframe) UNIQUEMENT si le site l'autorise ; sinon un message propose de l'ouvrir dans un onglet.
   Limites des navigateurs (non contournables, et volontairement non contournées) :
   - de nombreux sites interdisent l'affichage intégré (Google, YouTube, GitHub, Wikipédia…) : ils sont détectés par une liste et par vos choix « toujours dans un onglet » ;
   - la page affichée est celle d'un autre site : on ne peut ni lire son titre ni suivre ses liens. « Précédent / Suivant » parcourent donc les adresses ouvertes ICI
     (barre d'adresse, raccourcis, accueil), pas les liens cliqués dans la page. */
const WEB = { w: null, open: null };
const WEB_ZOOM = [50, 67, 80, 90, 100, 110, 125, 150, 175, 200];
const WEB_SBX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-downloads';
const WEB_SEARCH = 'https://duckduckgo.com/?q=';

/* Saisie → { url } | { search } | { error } | null */
function webParse(input) {
  const s = String(input || '').trim().slice(0, 2000); if (!s) return null;
  if (/^(javascript|data|file|blob|vbscript|about|chrome|view-source):/i.test(s)) return { error: 'Adresse non prise en charge : seules http:// et https:// sont autorisées.' };
  let u = s;
  if (!/^https?:\/\//i.test(s)) {
    if (/\s/.test(s) || !/^[^\s/?#]+\.[a-z]{2,}(:\d+)?([/?#]|$)/i.test(s)) return { search: s };
    u = 'https://' + s;
  }
  const h = httpUrl(u); if (!h) return { error: 'Adresse invalide.' };
  if (new URL(h).origin === location.origin) return { error: 'C’est l’adresse de cette application : elle ne peut pas s’afficher dans son propre navigateur.' };
  return { url: h };
}
/* Raison pour laquelle l'affichage intégré est évité ('' = on tente l'affichage) */
function webWhyBlocked(url) {
  if (new URL(url).protocol === 'http:') return 'Ce site utilise http:// (non sécurisé) : il ne peut pas être affiché ici.';
  if (blocksFraming(url)) return hostOf(url) + ' n’autorise pas l’affichage intégré.';
  if (D.tabHosts.includes(hostOf(url))) return 'Vous avez choisi d’ouvrir ' + hostOf(url) + ' dans un onglet.';
  return '';
}

function browserWin(start) {
  if (WEB.w && WEB.w.isConnected) { WEB.w.hidden = false; WEB.w.style.zIndex = ++Z; if (start) WEB.open(start); return; }
  const tabs = []; let cur = null, seq = 0;
  const tabsBar = el('div', { className: 'wtabs', role: 'tablist' }), stage = el('div', { className: 'wstage' });
  const addr = el('input', { type: 'text', className: 'waddr', placeholder: 'Adresse d’un site (https://…) ou mots à rechercher', maxLength: 2000, autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': 'Adresse' });
  const note = el('div', { className: 'row tight whint' });
  const ib = (icon, title, fn) => btn('', icon, fn, 'wb', title);
  const bBack = ib('back', 'Page précédente', () => step(-1)), bFwd = ib('fwd', 'Page suivante', () => step(1)), bReload = ib('refresh', 'Actualiser', () => cur && show(cur)),
    bHome = ib('home', 'Accueil', () => cur && go(cur, null)), bOut = ib('ext', 'Ouvrir dans un nouvel onglet du navigateur', () => { const u = url(cur); if (u) openTab(u); }),
    bCopy = ib('copy', 'Copier l’adresse', () => { const u = url(cur); if (u) navigator.clipboard.writeText(u).then(() => toast('Adresse copiée.'), () => toast('Copie impossible : sélectionnez l’adresse dans la barre.')); }),
    bZout = ib('zout', 'Zoom arrière', () => zoom(-1)), bZin = ib('zin', 'Zoom avant', () => zoom(1)), zl = btn('100 %', '', () => { if (cur) { cur.zoom = 100; applyZoom(cur); sync(); } }, 'wb wzoom', 'Zoom : revenir à 100 %');
  const url = t => (t ? t.hist[t.i] : null);

  const placeholder = (t, u, why) => {
    const host = hostOf(u);
    return el('div', { className: 'whome' }, ico('globe', 40), el('h3', { textContent: host }), el('p', { className: 'mut', textContent: why + ' Vous pouvez l’ouvrir dans un nouvel onglet du navigateur.' }),
      el('div', { className: 'row center' }, btn('Ouvrir dans un onglet', 'ext', () => openTab(u), 'pri'),
        ...(new URL(u).protocol === 'https:' ? [btn('Essayer quand même', 'play', () => { t.force = u; show(t); }, '', 'Tenter l’affichage intégré malgré tout')] : [])));
  };
  const home = t => {
    const apps = G.apps.filter(a => !a.ai && !a.run);
    return el('div', { className: 'whome' }, ico('globe', 44), el('h3', { textContent: 'Navigateur' }),
      el('p', { className: 'mut', textContent: 'Saisissez une adresse dans la barre, ou ouvrez un de vos raccourcis. Les sites qui interdisent l’affichage intégré s’ouvrent dans un nouvel onglet.' }),
      apps.length ? el('div', { className: 'wgrid' }, ...apps.map(a => el('button', { type: 'button', className: 'wtile', title: a.name, onclick: () => go(t, a.url) }, appIcon(a, 40), el('span', { textContent: a.name })))) : el('small', { className: 'mut', textContent: 'Aucun raccourci web pour le moment (App Store).' }));
  };
  const applyZoom = t => {
    if (!t.frame) return; const s = t.zoom / 100;
    Object.assign(t.frame.style, { width: (100 / s) + '%', height: (100 / s) + '%', transform: 'scale(' + s + ')', transformOrigin: '0 0' });
  };
  function show(t) {   // (ré)affiche le contenu de l'onglet selon l'adresse courante (sert aussi d'« actualiser »)
    t.pane.replaceChildren(); t.frame = null; t.loads = 0;
    const u = url(t);
    if (!u) t.pane.append(home(t));
    else {
      const why = t.force === u ? '' : webWhyBlocked(u);
      if (why) t.pane.append(placeholder(t, u, why));
      else {
        const f = el('iframe', { sandbox: WEB_SBX, referrerPolicy: 'no-referrer', title: hostOf(u) });
        f.onload = () => { t.loads++; if (t === cur) sync(); };
        t.frame = f; t.pane.append(f); applyZoom(t); f.src = u;
      }
    }
    sync();
  }
  function go(t, input, push = true) {
    let u = null;
    if (input !== null) {
      const p = webParse(input); if (!p) return;
      if (p.error) return toast(p.error, 5000);
      if (p.search) { openTab(WEB_SEARCH + encodeURIComponent(p.search)); return toast('Recherche ouverte dans un onglet : les moteurs de recherche refusent l’affichage intégré.', 6000); }
      u = p.url;
    }
    if (push && url(t) !== u) { t.hist = t.hist.slice(0, t.i + 1); t.hist.push(u); t.i++; }
    t.force = null; show(t);
  }
  function step(d) { const t = cur; if (!t) return; const n = t.i + d; if (n < 0 || n >= t.hist.length) return; t.i = n; t.force = null; show(t); }
  function zoom(d) { const t = cur; if (!t) return; const k = Math.max(0, Math.min(WEB_ZOOM.length - 1, WEB_ZOOM.indexOf(t.zoom) + d)); t.zoom = WEB_ZOOM[k]; applyZoom(t); sync(); }
  function sync() {
    tabsBar.replaceChildren(...tabs.map(t => el('div', { className: 'wtab' + (t === cur ? ' on' : ''), role: 'tab', 'aria-selected': t === cur ? 'true' : 'false' },
      el('button', { type: 'button', className: 't', title: url(t) || 'Accueil', textContent: url(t) ? hostOf(url(t)) : 'Accueil', onclick: () => select(t) }),
      el('button', { type: 'button', className: 'x', title: 'Fermer l’onglet', 'aria-label': 'Fermer l’onglet ' + (url(t) ? hostOf(url(t)) : 'Accueil'), onclick: () => closeTab(t) }, ico('x', 12)))),
      btn('', 'plus', () => newTab(), 'wb', 'Nouvel onglet'));
    const t = cur, u = url(t);
    if (document.activeElement !== addr) addr.value = u || '';
    bBack.disabled = !t || t.i <= 0; bFwd.disabled = !t || t.i >= t.hist.length - 1; bReload.disabled = !t; bHome.disabled = !t || !u; bOut.disabled = bCopy.disabled = !u;
    bZout.disabled = !t || t.zoom <= WEB_ZOOM[0]; bZin.disabled = !t || t.zoom >= WEB_ZOOM[WEB_ZOOM.length - 1]; zl.querySelector('span').textContent = (t ? t.zoom : 100) + ' %';
    const showing = t && t.frame;
    note.hidden = !showing;
    if (showing) note.replaceChildren(el('small', { className: 'mut', textContent: t.loads > 1 ? 'Vous avez navigué dans le site : l’adresse affichée est celle d’origine.' : 'Page vide ou refusée ? Ce site interdit peut-être l’affichage intégré.' }),
      btn('Ouvrir dans un onglet', 'ext', () => openTab(u)), btn('Toujours dans un onglet', 'pin', () => { const h = hostOf(u); if (!D.tabHosts.includes(h)) { D.tabHosts.push(h); save(); } show(t); toast(h + ' s’ouvrira désormais dans un onglet.', 5000); }, '', 'Ne plus essayer l’affichage intégré pour ce site'));
  }
  function select(t) { cur = t; tabs.forEach(x => { x.pane.hidden = x !== t; }); sync(); }
  function newTab(u) {
    const t = { id: ++seq, hist: [null], i: 0, zoom: 100, pane: el('div', { className: 'wpane' }), frame: null, loads: 0, force: null };
    tabs.push(t); stage.append(t.pane); select(t); show(t); if (u) go(t, u); else addr.focus(); return t;
  }
  function closeTab(t) {
    if (tabs.length === 1) { t.hist = [null]; t.i = 0; t.zoom = 100; show(t); return; }
    const k = tabs.indexOf(t); tabs.splice(k, 1); t.pane.remove(); if (cur === t) select(tabs[Math.min(k, tabs.length - 1)]); else sync();
  }
  addr.onkeydown = e => { if (e.key === 'Enter' && cur) { const v = addr.value; addr.blur(); go(cur, v); } else if (e.key === 'Escape') { addr.value = url(cur) || ''; addr.blur(); } };
  addr.onfocus = () => addr.select();

  const root = el('div', { className: 'web' }, tabsBar, el('div', { className: 'wbar' }, bBack, bFwd, bReload, bHome, addr, bZout, zl, bZin, bOut, bCopy), note, stage);
  WEB.w = win('Navigateur', 'globe', [root], { w: 980, h: 660, cls: 'web', onclose: () => { WEB.w = null; WEB.open = null; tabs.forEach(t => { if (t.frame) t.frame.remove(); }); } });
  WEB.open = u => { const t = newTab(); go(t, u); };
  newTab(start);
}
