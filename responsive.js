'use strict';
/* Adaptation du bureau à tous les écrans : smartphone, tablette, PC, grands écrans, TV et Smart TV.
   - html[data-dev] = phone | tablet | desktop | tv ; html[data-orient] = portrait | landscape ; html[data-input] = touch | mouse
   - --ui : facteur d'échelle de l'interface (1 sur PC ; plus grand sur TV et très grands écrans, vue de loin) ; le CSS (style.css, fin du fichier) l'utilise
   - les fenêtres ouvertes restent dans l'écran quand on le tourne ou le redimensionne ; les nouvelles fenêtres s'ouvrent à la taille de l'écran
   - TV : navigation à la télécommande (flèches + OK, touche Retour pour fermer la fenêtre au premier plan)
   Aucun réglage nécessaire. Type d'écran forcé possible (une TV non reconnue) : Réglages ou écran de connexion, ou localStorage « vd2.dev » = tv | desktop | tablet | phone. Taille forcée possible : localStorage « vd2.ui » = nombre entre 0.8 et 2.5 (vider pour revenir en automatique). */
(() => {
  const root = document.documentElement;
  const UA = navigator.userAgent;
  const TV_UA = /smart-?tv|smarttv|hbbtv|tizen|web0s|webos|netcast|googletv|google tv|android tv|bravia|viera|aft[a-z]{1,3}\b|crkey|appletv|roku|vidaa|philipstv|opera tv|large screen|tv safari|sonydtv|ce-html/i.test(UA);
  const TV_UA2 = !/\bmobile\b/i.test(UA) && /mibox|mi box|mitv|amlogic|rockchip|tvbox|tv box|freebox|netgem|dune hd|maple|hisense|aquos|toshiba|vestel|\bstb\b|set-?top|\btv\b/i.test(UA);   // boîtiers et TV moins courants (jamais un téléphone : « Mobile »)
  let forced = 0; try { forced = parseFloat(localStorage.getItem('vd2.ui')) || 0; } catch { /* facultatif */ }
  const DEVS = ['tv', 'desktop', 'tablet', 'phone'];
  let forcedDev = ''; try { const f = localStorage.getItem('vd2.dev'); if (DEVS.includes(f)) forcedDev = f; } catch { /* facultatif */ }
  let auto = { dev: 'desktop', why: '' };

  /* Type d'écran trouvé automatiquement + la raison (affichée dans Réglages → « Informations sur cet écran ») */
  function detect(w, h, coarse) {
    const small = Math.min(w, h), hoverNone = matchMedia('(hover:none)').matches;
    if (TV_UA) return { dev: 'tv', why: 'le navigateur se déclare TV (user-agent)' };
    if (TV_UA2) return { dev: 'tv', why: 'user-agent de boîtier ou TV' };
    if (/android/i.test(UA) && !/mobile/i.test(UA) && navigator.maxTouchPoints === 0 && w >= 900) return { dev: 'tv', why: 'Android sans écran tactile (boîtier / Android TV)' };
    if (matchMedia('(pointer:none)').matches && w >= 900) return { dev: 'tv', why: 'aucun pointeur (souris, doigt) détecté' };
    if (!coarse && w >= 3000) return { dev: 'tv', why: 'très grand écran sans tactile' };
    if (coarse && w >= 1700 && hoverNone && !/mobile|android|iphone|ipad/i.test(UA)) return { dev: 'tv', why: 'grand écran sans survol' };
    if (small < 600 && coarse) return { dev: 'phone', why: 'petit écran tactile' };
    if (w < 700) return { dev: 'phone', why: 'écran étroit' };
    if (coarse && w < 1200) return { dev: 'tablet', why: 'écran tactile moyen' };
    return { dev: 'desktop', why: 'écran d’ordinateur' };
  }
  function measure() {
    const w = innerWidth, h = innerHeight, coarse = matchMedia('(pointer:coarse)').matches || matchMedia('(hover:none)').matches;
    auto = detect(w, h, coarse);
    const dev = forcedDev || auto.dev;
    let ui = 1;
    if (dev === 'tv') { ui = Math.min(2.6, Math.max(1.5, w / 1280)); ui = Math.max(0.7, Math.min(ui, w / 820, h / 460)); }   // TV : grand, mais jamais au point que la barre des tâches ou les fenêtres ne tiennent plus (petite TV, fenêtre étroite, TV forcée sur un PC)
    else if (w >= 3000) ui = Math.min(2, w / 2000);
    else if (w >= 2400) ui = 1.2;
    if (forced >= 0.8 && forced <= 2.5) ui = forced;
    ui = Math.round(ui * 100) / 100;
    root.dataset.dev = dev; root.dataset.orient = h >= w ? 'portrait' : 'landscape'; root.dataset.input = coarse ? 'touch' : 'mouse';
    root.style.setProperty('--ui', String(ui)); root.style.setProperty('--vh', h + 'px');
    root.style.setProperty('--ua', String(Math.round(appUi(ui) * 100) / 100));   // zoom des applications et du menu Démarrer (un peu moins que --ui)
    if (ui > 1.05) root.dataset.scale = '1'; else delete root.dataset.scale;
    schedBar(true);
    return ui;
  }
  /* Pour les Réglages et l'écran de connexion : informations sur l'écran, et choix manuel du type d'écran (TV, ordinateur, tablette, smartphone ; '' = automatique) */
  /* Barre des tâches : si ses boutons ne tiennent pas dans la largeur (petite TV, fenêtre étroite, nom d'utilisateur long, langue aux mots longs…),
     on la compacte par paliers (data-bar 1 à 4 : sans nom d'utilisateur, sans libellés, sans texte « Démarrer », sans horloge) au lieu de la faire défiler. */
  let barObs = null, barT = 0;
  function fitBar(reset) {
    const bar = document.getElementById('bar'); if (!bar || bar.hidden) return;
    if (!barObs) { barObs = new MutationObserver(() => schedBar(true)); barObs.observe(bar, { childList: true, subtree: true }); }
    const over = () => bar.scrollWidth > bar.clientWidth + 1;
    if (!reset && !over()) return;
    let l = reset ? 0 : +(root.dataset.bar || 0);
    for (; l <= 4; l++) { if (l) root.dataset.bar = String(l); else delete root.dataset.bar; if (!over()) break; }
  }
  const schedBar = reset => { clearTimeout(barT); barT = setTimeout(() => fitBar(reset), 60); };
  setInterval(() => fitBar(false), 1500);
  window.devInfo = () => ({ dev: root.dataset.dev, auto: auto.dev, why: auto.why, forced: forcedDev, w: innerWidth, h: innerHeight, dpr: Math.round(devicePixelRatio * 100) / 100, touch: navigator.maxTouchPoints, ptr: matchMedia('(pointer:fine)').matches ? 'fine' : matchMedia('(pointer:coarse)').matches ? 'coarse' : matchMedia('(pointer:none)').matches ? 'none' : '?', hover: matchMedia('(hover:hover)').matches, ua: UA });
  window.devForce = v => { forcedDev = DEVS.includes(v) ? v : ''; try { if (forcedDev) localStorage.setItem('vd2.dev', forcedDev); else localStorage.removeItem('vd2.dev'); } catch { /* facultatif */ } measure(); fitAll(); };

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
  /* Zoom propre à chaque fenêtre : l'application garde au moins ~700 × 400 px « logiques » (sinon, sur une TV dont l'écran logique est petit, tout paraît énorme) */
  const MINW = 740, MINH = 430;
  const appUi = ui => ui > 1.3 ? 1 + (ui - 1) * 0.5 : ui;   // les applications grossissent un peu moins que la barre et les icônes : plus de place utile dans la fenêtre
  function setWz(w) {
    if (!w || !w.classList || !w.classList.contains('win')) return;
    const bd = [...w.children].find(c => c.classList && c.classList.contains('bd')); if (!bd) return;
    let z = 1;
    if (!root.dataset.scale) { w.style.removeProperty('--wz'); w.style.removeProperty('--wh'); }
    else {
      const ui = parseFloat(root.style.getPropertyValue('--ui')) || 1, r = bd.getBoundingClientRect(), bar = document.getElementById('bar');
      if (!r.width || !r.height) return;
      const hpx = r.height - (w.classList.contains('max') ? (bar ? bar.offsetHeight : 0) + 12 : 0);
      z = Math.round(Math.max(0.8, Math.min(appUi(ui), r.width / MINW, hpx / MINH)) * 100) / 100;
      if (String(z) !== w.style.getPropertyValue('--wz')) w.style.setProperty('--wz', String(z));
      if (w.classList.contains('kbw')) {   // clavier virtuel : toutes les touches doivent rester visibles, sans défilement
        for (let i = 0; i < 2; i++) {
          const ch = bd.clientHeight, sh = bd.scrollHeight; if (!(sh > ch + 2)) break;
          z = Math.max(0.55, Math.floor(z * ch / sh * 100) / 100 - 0.01); w.style.setProperty('--wz', String(z));
        }
      }
      w.style.setProperty('--wh', Math.max(120, Math.round(hpx / z)) + 'px');
    }
    if (w.classList.contains('split')) w.classList.toggle('narrow', w.clientWidth / z < 820);
  }
  const fitAll = () => document.querySelectorAll('#desk .win').forEach(w => { fit(w); setWz(w); });

  /* Nouvelle fenêtre : taille adaptée à l'échelle de l'écran (TV, grand écran), puis recentrée */
  const seen = new WeakSet();
  function adopt(w) {
    if (seen.has(w) || !w.classList || !w.classList.contains('win')) return; seen.add(w);
    if (window.ResizeObserver) new ResizeObserver(() => setWz(w)).observe(w);
    const ui = parseFloat(root.style.getPropertyValue('--ui')) || 1;
    if (ui > 1.05 && !w.classList.contains('max')) {
      const dk = document.getElementById('desk'), dw = dk.clientWidth, dh = dk.clientHeight;
      const ap = appUi(ui), W = Math.min(Math.round(w.offsetWidth * ap), dw - 16), H = Math.min(Math.round(w.offsetHeight * ap), dh - 16);
      w.style.width = W + 'px'; w.style.height = H + 'px'; w.style.left = Math.max(0, Math.round((dw - W) / 2)) + 'px'; w.style.top = Math.max(0, Math.round((dh - H) / 2)) + 'px';
    }
    setWz(w);
  }
  function watchDesk() {
    const dk = document.getElementById('desk'); if (!dk) return false;
    new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(n => { if (n.nodeType === 1) adopt(n); }); }).observe(dk, { childList: true });
    return true;
  }

  /* Écran de connexion (mot de passe, code PIN) : la carte tient TOUJOURS en entier dans l'écran, sans avoir à faire défiler (TV à petit écran logique, fenêtre basse) */
  function fitLogin() {
    const L = document.getElementById('login'), c = L && !L.hidden && L.querySelector('.lg'); if (!c) return;
    c.classList.toggle('haspin', !!c.querySelector('.pinbox'));   // avec le pavé PIN et un écran bas : deux colonnes (voir style.css)
    c.style.zoom = '';
    const h = c.offsetHeight, avail = innerHeight - 20;
    if (h > avail && h > 0) c.style.zoom = String(Math.max(0.4, Math.floor(avail / h * 100) / 100));
  }
  let ft = 0; const schedLogin = () => { cancelAnimationFrame(ft); ft = requestAnimationFrame(fitLogin); };
  function watchLogin() {
    const L = document.getElementById('login'); if (!L) return false;
    new MutationObserver(schedLogin).observe(L, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    addEventListener('resize', schedLogin); setTimeout(schedLogin, 400); return true;
  }
  if (!watchLogin()) document.addEventListener('DOMContentLoaded', watchLogin);

  let t = 0;
  const onSize = () => { clearTimeout(t); t = setTimeout(() => { measure(); fitAll(); }, 120); };
  measure();
  addEventListener('resize', onSize); addEventListener('orientationchange', onSize);
  if (window.visualViewport) visualViewport.addEventListener('resize', onSize);
  if (!watchDesk()) document.addEventListener('DOMContentLoaded', watchDesk);

  /* ---------- Télécommande de TV : navigation spatiale aux flèches ---------- */
  const FOCUSABLE = 'button:not([disabled]),a[href],input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
  const scroller = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 2) return p; } return null; };
  const usable = e => {
    if (e.closest('[hidden]')) return false;
    const sc = scroller(e);
    if (sc) {   // élément d'une liste qui défile (menu Démarrer…) : atteignable même hors de la partie visible, tant que la liste elle-même est visible au premier plan
      const sr = sc.getBoundingClientRect(), r0 = e.getBoundingClientRect();
      if (r0.width >= 6 && r0.height >= 6 && (r0.bottom < sr.top || r0.top > sr.bottom)) {
        if (sr.width < 6 || sr.height < 6 || sr.bottom < 0 || sr.top > innerHeight) return false;
        const t2 = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, sr.left + sr.width / 2)), Math.min(innerHeight - 1, Math.max(0, sr.top + sr.height / 2)));
        return !!t2 && (sc.contains(t2) || t2.contains(sc));
      }
      if (r0.width >= 6 && r0.height >= 6 && (r0.bottom > sr.bottom || r0.top < sr.top)) {   // à moitié masqué par le bord de la liste : on teste la partie visible
        const top0 = Math.max(r0.top, sr.top, 0), bot0 = Math.min(r0.bottom, sr.bottom, innerHeight);
        if (bot0 - top0 >= 4) {
          const t3 = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r0.left + r0.width / 2)), (top0 + bot0) / 2);
          return !!t3 && (t3 === e || e.contains(t3) || t3.contains(e));
        }
      }
    }
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
    const sc0 = a && scroller(a), same = sc0 ? list.filter(e => sc0.contains(e)) : [];   // dans une liste qui défile, on parcourt d'abord toute la liste avant d'en sortir
    const pick = L => { best = null; bs = Infinity; for (const e of L) {
      const r = e.getBoundingClientRect(), dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
      const along = dir === 'ArrowRight' ? dx : dir === 'ArrowLeft' ? -dx : dir === 'ArrowDown' ? dy : -dy, across = dir === 'ArrowRight' || dir === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 2) continue;
      const sco = along + across * 2.2; if (sco < bs) { bs = sco; best = e; }
    } return best; };
    if (same.length && pick(same)) { best.focus({ preventScroll: false }); try { best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* ancien navigateur */ } return true; }
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
      const inField = tag === 'INPUT' && !/^(button|checkbox|radio|submit|reset|file|image)$/.test(a.type), oneLine = inField && /^(text|search|password|email|url|tel)$/.test(a.type);
      if (/^(TEXTAREA|SELECT|VIDEO|AUDIO)$/.test(tag) || (inField && !(oneLine && /^Arrow(Up|Down)$/.test(e.key))) || (a && a.isContentEditable)) return;   // champ d'une ligne : haut / bas servent à en sortir (gauche / droite déplacent le curseur)
      if (nav(e.key)) e.preventDefault();
    } else if (e.key === 'GoBack' || e.key === 'BrowserBack' || e.keyCode === 10009 || e.keyCode === 461) {   // touche Retour des télécommandes (Tizen, webOS, Android TV)
      if (typeof WINS === 'undefined') return;
      const open = [...WINS].filter(r => r.w && !r.w.hidden); if (!open.length) return;
      open.sort((x, y) => (parseInt(y.w.style.zIndex, 10) || 0) - (parseInt(x.w.style.zIndex, 10) || 0));
      e.preventDefault(); open[0].close();
    }
  });
})();
