'use strict';
/* Adaptation du bureau à tous les écrans : smartphone, tablette, PC, grands écrans, TV et Smart TV.
   - html[data-dev] = phone | tablet | desktop | tv ; html[data-orient] = portrait | landscape ; html[data-input] = touch | mouse
   - --ui : facteur d'échelle de l'interface (1 sur PC ; plus grand sur TV et très grands écrans, vue de loin) ; le CSS (style.css, fin du fichier) l'utilise
   - les fenêtres ouvertes restent dans l'écran quand on le tourne ou le redimensionne ; les nouvelles fenêtres s'ouvrent à la taille de l'écran
   - TV : navigation à la télécommande (flèches + OK, touche Retour pour fermer la fenêtre au premier plan)
   Aucun réglage nécessaire. Taille forcée possible : localStorage « vd2.ui » = nombre entre 0.8 et 2.5 (vider pour revenir en automatique). */
(() => {
  const root = document.documentElement;
  const TV_UA = /smart-?tv|smarttv|hbbtv|tizen|web0s|webos|netcast|googletv|android tv|bravia|viera|aft[a-z]{1,3}\b|crkey|appletv|roku|vidaa|philipstv|opera tv|large screen/i.test(navigator.userAgent);
  let forced = 0; try { forced = parseFloat(localStorage.getItem('vd2.ui')) || 0; } catch { /* facultatif */ }

  function measure() {
    const w = innerWidth, h = innerHeight, coarse = matchMedia('(pointer:coarse)').matches || matchMedia('(hover:none)').matches;
    const small = Math.min(w, h);
    let dev = 'desktop';
    if (TV_UA || (!coarse && w >= 3000) || (coarse && w >= 1700 && matchMedia('(hover:none)').matches && !/mobile|android|iphone|ipad/i.test(navigator.userAgent))) dev = 'tv';
    else if (small < 600 && coarse) dev = 'phone';
    else if (w < 700) dev = 'phone';
    else if (coarse && w < 1200) dev = 'tablet';
    let ui = 1;
    if (dev === 'tv') ui = Math.min(2.6, Math.max(1.5, w / 1280));
    else if (w >= 3000) ui = Math.min(2, w / 2000);
    else if (w >= 2400) ui = 1.2;
    if (forced >= 0.8 && forced <= 2.5) ui = forced;
    ui = Math.round(ui * 100) / 100;
    root.dataset.dev = dev; root.dataset.orient = h >= w ? 'portrait' : 'landscape'; root.dataset.input = coarse ? 'touch' : 'mouse';
    root.style.setProperty('--ui', String(ui)); root.style.setProperty('--vh', h + 'px');
    if (ui > 1.05) root.dataset.scale = '1'; else delete root.dataset.scale;
    return ui;
  }

  /* Les fenêtres libres (non agrandies) restent entièrement atteignables : dans le bureau, jamais plus grandes que lui */
  function fit(w) {
    if (!w || w.classList.contains('max') || w.hidden || root.dataset.dev === 'phone') return;
    const dk = document.getElementById('desk'); if (!dk) return;
    const dw = dk.clientWidth, dh = dk.clientHeight; if (!dw || !dh) return;
    const W = Math.min(w.offsetWidth, dw - 8), H = Math.min(w.offsetHeight, dh - 8);
    const L = Math.max(0, Math.min(w.offsetLeft, dw - W)), T = Math.max(0, Math.min(w.offsetTop, dh - H));
    if (W !== w.offsetWidth) w.style.width = W + 'px';
    if (H !== w.offsetHeight) w.style.height = H + 'px';
    if (L !== w.offsetLeft) w.style.left = L + 'px';
    if (T !== w.offsetTop) w.style.top = T + 'px';
  }
  const fitAll = () => document.querySelectorAll('#desk .win').forEach(fit);

  /* Nouvelle fenêtre : taille adaptée à l'échelle de l'écran (TV, grand écran), puis recentrée */
  const seen = new WeakSet();
  function adopt(w) {
    if (seen.has(w) || !w.classList || !w.classList.contains('win')) return; seen.add(w);
    const ui = parseFloat(root.style.getPropertyValue('--ui')) || 1;
    if (ui > 1.05 && !w.classList.contains('max')) {
      const dk = document.getElementById('desk'), dw = dk.clientWidth, dh = dk.clientHeight;
      const W = Math.min(Math.round(w.offsetWidth * ui), dw - 16), H = Math.min(Math.round(w.offsetHeight * ui), dh - 16);
      w.style.width = W + 'px'; w.style.height = H + 'px'; w.style.left = Math.max(0, Math.round((dw - W) / 2)) + 'px'; w.style.top = Math.max(0, Math.round((dh - H) / 2)) + 'px';
    }
  }
  function watchDesk() {
    const dk = document.getElementById('desk'); if (!dk) return false;
    new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(n => { if (n.nodeType === 1) adopt(n); }); }).observe(dk, { childList: true });
    return true;
  }

  let t = 0;
  const onSize = () => { clearTimeout(t); t = setTimeout(() => { measure(); fitAll(); }, 120); };
  measure();
  addEventListener('resize', onSize); addEventListener('orientationchange', onSize);
  if (window.visualViewport) visualViewport.addEventListener('resize', onSize);
  if (!watchDesk()) document.addEventListener('DOMContentLoaded', watchDesk);

  /* ---------- Télécommande de TV : navigation spatiale aux flèches ---------- */
  const FOCUSABLE = 'button:not([disabled]),a[href],input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
  const usable = e => {
    const r = e.getBoundingClientRect(); if (r.width < 6 || r.height < 6 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    if (e.closest('[hidden]')) return false;
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)), top = document.elementFromPoint(cx, cy);
    return !!top && (top === e || e.contains(top) || top.contains(e));   // pas masqué par une autre fenêtre
  };
  function nav(dir) {
    const a = document.activeElement, from = a && a !== document.body ? a.getBoundingClientRect() : null;
    const ov = [...document.querySelectorAll('.ov')].pop(), scope = ov || document;
    const list = [...scope.querySelectorAll(FOCUSABLE)].filter(e => e !== a && usable(e));
    if (!list.length) return false;
    if (!from) { const s = document.getElementById('startb'); (s && usable(s) ? s : list[0]).focus(); return true; }
    const cx = from.left + from.width / 2, cy = from.top + from.height / 2; let best = null, bs = Infinity;
    for (const e of list) {
      const r = e.getBoundingClientRect(), dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
      const along = dir === 'ArrowRight' ? dx : dir === 'ArrowLeft' ? -dx : dir === 'ArrowDown' ? dy : -dy, across = dir === 'ArrowRight' || dir === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 2) continue;
      const s = along + across * 2.2; if (s < bs) { bs = s; best = e; }
    }
    if (!best) return false;
    best.focus({ preventScroll: false }); try { best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* ancien navigateur */ }
    return true;
  }
  addEventListener('keydown', e => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (root.dataset.dev === 'tv' && /^Arrow(Left|Right|Up|Down)$/.test(e.key)) {
      const a = document.activeElement, tag = a ? a.tagName : '';
      if (/^(TEXTAREA|SELECT|VIDEO|AUDIO)$/.test(tag) || (tag === 'INPUT' && !/^(button|checkbox|radio|submit|reset|file|image)$/.test(a.type)) || (a && a.isContentEditable)) return;
      if (nav(e.key)) e.preventDefault();
    } else if (e.key === 'GoBack' || e.key === 'BrowserBack' || e.keyCode === 10009 || e.keyCode === 461) {   // touche Retour des télécommandes (Tizen, webOS, Android TV)
      if (typeof WINS === 'undefined') return;
      const open = [...WINS].filter(r => r.w && !r.w.hidden); if (!open.length) return;
      open.sort((x, y) => (parseInt(y.w.style.zIndex, 10) || 0) - (parseInt(x.w.style.zIndex, 10) || 0));
      e.preventDefault(); open[0].close();
    }
  });
})();
