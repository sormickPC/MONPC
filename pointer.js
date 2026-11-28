'use strict';
/* pointer.js — curseur de télécommande, UNIQUEMENT sur les écrans de TV (html[data-dev="tv"]).
   - Activer / quitter, avec N'IMPORTE QUELLE télécommande : maintenir OK 1 seconde (toutes les télécommandes ont OK), ou le gros bouton « Souris » affiché sur l'écran de connexion, ou le bouton « Curseur »
     de la barre des tâches, ou les touches des télécommandes qui en ont : couleurs (rouge, vert, jaune, bleu), Info, Menu, Réglages, * et #. Retour ou Échap quitte aussi.
   - Flèches : déplacent le rond (de plus en plus vite si on garde le doigt appuyé). Poussé contre le bord de l'écran, il fait défiler la zone sous lui.
   - OK : clic. Maintenir OK et bouger : glisser (déplacer une fenêtre par sa barre de titre). Deux OK rapides : double-clic.
   - Un champ de saisie ou une liste déroulante cliquée reçoit le focus et le curseur se range (les flèches et le clavier reprennent leur rôle habituel).
   - Limite du navigateur : on ne peut pas cliquer À L'INTÉRIEUR d'un site externe affiché dans un cadre ; OK sur le cadre lui donne le focus (ses propres touches fléchées prennent le relais).
   - Hors TV (PC, tablette, smartphone) : rien n'est actif et le bouton est caché. En mode normal la navigation par focus (flèches) de responsive.js reste inchangée ; un appui court sur OK clique comme avant. */
(() => {
  const root = document.documentElement, VPID = 7777;
  const S = { on: false, x: 0, y: 0, dot: null, held: new Set(), heldAt: 0, raf: 0, last: 0, down: null, over: null, cap: null, okTimer: 0, swallow: false, lastClick: { t: 0, x: -99, y: -99 }, hint: false, patched: false };
  const isTV = () => root.dataset.dev === 'tv';
  const isOk = e => e.key === 'Enter' || e.key === 'Select' || e.keyCode === 13;
  const isBack = e => e.key === 'GoBack' || e.key === 'BrowserBack' || e.key === 'Escape' || e.keyCode === 10009 || e.keyCode === 461;
  function isPtrKey(e) { return /^Color(F[0-3]|Red|Green|Yellow|Blue)/i.test(e.key || '') || e.keyCode === 403 || e.keyCode === 404 || e.keyCode === 405 || e.keyCode === 406 || e.key === 'Info' || e.keyCode === 457 || e.key === 'ContextMenu' || e.key === 'Menu' || e.key === 'Settings' || ((e.key === '*' || e.key === '#') && !EDIT(document.activeElement)); }
  const ui = () => parseFloat(getComputedStyle(root).getPropertyValue('--ui')) || 1;
  const T = m => (typeof tr === 'function' ? tr(m) : m);
  const FOCUSABLE = 'button,a[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
  const EDIT = el => !!el && el.nodeType === 1 && ((el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|file|range|color|image|hidden)$/i.test(el.type)) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  const block = e => { e.preventDefault(); e.stopImmediatePropagation(); };

  function patch() {   // le navigateur refuse setPointerCapture pour un doigt « virtuel » : on gère la capture nous-mêmes (déplacement des fenêtres)
    if (S.patched) return; S.patched = true;
    const spc = Element.prototype.setPointerCapture, rpc = Element.prototype.releasePointerCapture, hpc = Element.prototype.hasPointerCapture;
    Element.prototype.setPointerCapture = function (id) { if (id === VPID) { S.cap = this; return; } return spc.call(this, id); };
    Element.prototype.releasePointerCapture = function (id) { if (id === VPID) { if (S.cap === this) S.cap = null; return; } return rpc.call(this, id); };
    Element.prototype.hasPointerCapture = function (id) { return id === VPID ? S.cap === this : hpc.call(this, id); };
  }
  const at = () => { const c = S.cap && S.cap.isConnected ? S.cap : null; return c || document.elementFromPoint(S.x, S.y); };
  function fire(t, type, extra = {}) {
    if (!t) return null;
    const down = !!S.down, base = { bubbles: true, cancelable: true, composed: true, view: window, clientX: S.x, clientY: S.y, screenX: S.x, screenY: S.y, button: 0, buttons: down && !/up$|click$/.test(type) ? 1 : 0, ...extra };
    const e = /^pointer/.test(type) ? new PointerEvent(type, { ...base, pointerId: VPID, pointerType: 'mouse', isPrimary: true, pressure: down ? 0.5 : 0 }) : new MouseEvent(type, base);
    t.dispatchEvent(e); return e;
  }
  const place = () => { if (S.dot) S.dot.style.transform = `translate(${S.x}px,${S.y}px)`; };
  function hover() {
    const t = at(); if (t !== S.over) { if (S.over && S.over.isConnected) { fire(S.over, 'pointerout'); fire(S.over, 'mouseout'); } S.over = t; if (t) { fire(t, 'pointerover'); fire(t, 'mouseover'); } }
    if (t) { fire(t, 'pointermove', { button: -1 }); fire(t, 'mousemove', { button: -1 }); }
  }
  function scrollAt(dx, dy) {   // zone défilante la plus proche sous le rond
    let e = document.elementFromPoint(S.x, S.y);
    while (e && e !== document.body && e !== document.documentElement) {
      const c = getComputedStyle(e);
      if ((dy && /(auto|scroll|overlay)/.test(c.overflowY) && e.scrollHeight > e.clientHeight + 2) || (dx && /(auto|scroll|overlay)/.test(c.overflowX) && e.scrollWidth > e.clientWidth + 2)) { e.scrollBy(dx, dy); return; }
      e = e.parentElement;
    }
  }
  function move(dx, dy) {
    const nx = Math.min(innerWidth - 1, Math.max(0, S.x + dx)), ny = Math.min(innerHeight - 1, Math.max(0, S.y + dy));
    const ox = S.x + dx - nx, oy = S.y + dy - ny;   // ce qui dépasse du bord : défilement
    S.x = nx; S.y = ny; place();
    if (S.down) S.down.moved += Math.abs(dx) + Math.abs(dy);
    if (ox || oy) scrollAt(ox, oy);
    hover();
  }
  function loop(ts) {
    if (!S.on || !S.held.size) { S.raf = 0; return; }
    const dt = Math.min(48, ts - (S.last || ts)); S.last = ts;
    const sec = (ts - S.heldAt) / 1000, v = (300 + Math.min(1, sec / 1.1) * 950) * ui();   // pixels par seconde : démarre doucement, accélère
    let dx = (S.held.has('ArrowRight') ? 1 : 0) - (S.held.has('ArrowLeft') ? 1 : 0), dy = (S.held.has('ArrowDown') ? 1 : 0) - (S.held.has('ArrowUp') ? 1 : 0);
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
    if (dx || dy) move(dx * v * dt / 1000, dy * v * dt / 1000);
    S.raf = requestAnimationFrame(loop);
  }
  function setOn(on, quiet) {
    if (on === S.on) return;
    if (on && !isTV()) return;
    S.on = on;
    if (on) {
      patch();
      if (!S.dot) { S.dot = document.createElement('div'); S.dot.className = 'ptr-dot'; S.dot.setAttribute('aria-hidden', 'true'); }
      document.body.appendChild(S.dot);
      const a = document.activeElement, r = a && a !== document.body ? a.getBoundingClientRect() : null;
      S.x = Math.round(r ? r.left + r.width / 2 : innerWidth / 2); S.y = Math.round(r ? r.top + r.height / 2 : innerHeight / 2);
      S.x = Math.min(innerWidth - 1, Math.max(0, S.x)); S.y = Math.min(innerHeight - 1, Math.max(0, S.y)); place();
      root.classList.add('ptr-on');
      if (!quiet && typeof toast === 'function') toast(T('Curseur activé : flèches = déplacer · OK = cliquer (maintenir = glisser) · Retour = quitter.'), 7000);
    } else {
      S.held.clear(); cancelAnimationFrame(S.raf); S.raf = 0; S.down = null; S.cap = null;
      if (S.dot) S.dot.remove(); root.classList.remove('ptr-on');
      if (!quiet && typeof toast === 'function') toast(T('Curseur désactivé.'), 2500);
    }
    const b = document.getElementById('bk-ptr'); if (b) b.classList.toggle('on', on);
  }
  function okDown() {
    const t = at(); S.down = { x: S.x, y: S.y, moved: 0, t: performance.now() }; if (S.dot) S.dot.classList.add('down');
    if (!t) return;
    fire(t, 'pointerdown'); const md = fire(t, 'mousedown');
    if (md && !md.defaultPrevented) { const f = t.closest && t.closest(FOCUSABLE); if (f && f.tagName !== 'IFRAME') { try { f.focus({ preventScroll: true }); } catch { /* non focalisable */ } } else if (document.activeElement && document.activeElement !== document.body && !(t.tagName === 'IFRAME')) { try { document.activeElement.blur(); } catch { /* rien */ } } }
  }
  function okUp() {
    const d = S.down; if (!d) return; const t = at(); S.down = null; if (S.dot) S.dot.classList.remove('down');
    if (t) { fire(t, 'pointerup'); fire(t, 'mouseup'); }
    const wasCap = S.cap; S.cap = null;
    if (!t || d.moved > 14 * ui() || wasCap) return;   // glissement : pas de clic
    if (t.tagName === 'IFRAME') { try { t.focus(); } catch { /* refusé */ } if (!S.hint && typeof toast === 'function') { S.hint = true; toast(T('Site affiché dans la fenêtre : le curseur ne peut pas cliquer dedans. Utilisez les touches fléchées et OK pour ce site, ou ouvrez-le dans un onglet.'), 9000); } return; }
    fire(t, 'click', { detail: 1 });
    const now = performance.now(), lc = S.lastClick;
    if (now - lc.t < 450 && Math.abs(lc.x - S.x) < 16 * ui() && Math.abs(lc.y - S.y) < 16 * ui()) { fire(t, 'click', { detail: 2 }); fire(t, 'dblclick', { detail: 2 }); S.lastClick = { t: 0, x: -99, y: -99 }; } else S.lastClick = { t: now, x: S.x, y: S.y };
    const f = t.closest && t.closest(FOCUSABLE);
    if (EDIT(f)) { try { f.focus(); } catch { /* refusé */ } setOn(false, true); if (typeof toast === 'function') toast(T('Champ sélectionné : tapez avec le clavier virtuel (barre des tâches) ; le curseur est rangé.'), 6000); }
  }
  const okTarget = a => !a || a === document.body || /^(BUTTON|A|SUMMARY)$/.test(a.tagName) || a.getAttribute('role') === 'button';

  addEventListener('keydown', e => {
    if (!isTV()) { if (S.on) setOn(false, true); return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (isPtrKey(e)) { block(e); if (!e.repeat) setOn(!S.on); return; }   // touches de couleur, Info, Menu… : activer / quitter
    if (S.on) {
      if (/^Arrow(Left|Right|Up|Down)$/.test(e.key)) { block(e); if (!S.held.size) { S.heldAt = performance.now(); S.last = 0; } S.held.add(e.key); if (!S.raf) S.raf = requestAnimationFrame(loop); return; }
      if (isOk(e)) { block(e); if (!e.repeat && !S.down && !S.swallow) okDown(); return; }
      if (isBack(e)) { block(e); setOn(false); return; }
      return;
    }
    if (isOk(e) && okTarget(document.activeElement)) {   // mode normal : appui court = clic ; appui long (1 s) = curseur
      e.preventDefault();
      if (!e.repeat && !S.okTimer) S.okTimer = setTimeout(() => { S.okTimer = 0; S.swallow = true; setOn(true); }, 1000);
    }
  }, true);
  addEventListener('keyup', e => {
    if (/^Arrow/.test(e.key)) S.held.delete(e.key);
    if (!isOk(e)) return;
    if (S.swallow) { S.swallow = false; if (S.on) block(e); return; }
    if (S.on) { block(e); okUp(); return; }
    if (S.okTimer) { clearTimeout(S.okTimer); S.okTimer = 0; const a = document.activeElement; if (a && a !== document.body && isTV()) { e.preventDefault(); a.click(); } }
  }, true);
  addEventListener('blur', () => { S.held.clear(); if (S.okTimer) { clearTimeout(S.okTimer); S.okTimer = 0; } });
  addEventListener('resize', () => { if (!isTV()) { if (S.on) setOn(false, true); return; } if (S.on) { S.x = Math.min(innerWidth - 1, S.x); S.y = Math.min(innerHeight - 1, S.y); place(); } });
  /* Gros bouton « Souris » : visible sur l'écran de connexion et de veille (là où il n'y a pas de barre des tâches), pour une télécommande sans aucune touche spéciale */
  const fab = document.createElement('button'); fab.type = 'button'; fab.id = 'ptr-fab'; fab.hidden = true; fab.className = 'ptr-fab';
  const fabDraw = () => { fab.replaceChildren(typeof ico === 'function' ? ico('pointer', 26) : '', Object.assign(document.createElement('span'), { textContent: T('Souris') })); fab.title = T('Souris : activer le curseur de télécommande'); fab.setAttribute('aria-label', fab.title); };
  fab.onclick = () => { fab.blur(); setOn(true); };
  const fabSync = () => {
    const bar = document.getElementById('bar'), want = isTV() && !S.on && (!bar || bar.hidden) && !!document.getElementById('login');
    if (want && !fab.isConnected) { fabDraw(); document.body.appendChild(fab); }
    if (fab.isConnected && (fab.hidden === want)) { fab.hidden = !want; if (want) fabDraw(); }
  };
  setInterval(fabSync, 700);
  /* Rappel unique par séance : comment activer la souris (TV seulement, 3 fois au plus au total) */
  setTimeout(() => {
    if (!isTV() || typeof toast !== 'function') return;
    let n = 0; try { n = +localStorage.getItem('vd2.ptrhint') || 0; if (n >= 3) return; localStorage.setItem('vd2.ptrhint', String(n + 1)); } catch { /* facultatif */ }
    toast(T('Astuce télécommande : pour activer la souris, maintenez OK 1 seconde, ou appuyez sur la touche rouge, Info, Menu ou *.'), 12000);
  }, 3000);
  window.ptrToggle = () => setOn(!S.on);
  window.ptrState = () => ({ on: S.on, x: S.x, y: S.y });
})();
