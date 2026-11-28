'use strict';
/* konekt-call.js — appels vidéo et vocaux de « Konekt » (konekt.js).
   • Détection : navigator.mediaDevices.enumerateDevices() + getUserMedia() → caméras et micros branchés, état (autorisé / refusé / absent), choix du périphérique, jauge du micro.
   • Appel : WebRTC directement entre navigateurs (maillage : chacun envoie son flux à chaque autre, 6 personnes au maximum).
   • Signalisation : sans serveur, par petits fichiers chiffrés déposés dans le dossier WebDAV de la communauté (s-*.s) ; présence dans l'appel : k-*.k (renouvelée toutes les 8 s).
   • Effets (fx.js) : fonds, cadres photo et GIF sur votre image, avant l'envoi aux autres (le canvas remplace la piste vidéo : replaceTrack).
   • Limites honnêtes : pas de serveur relais (TURN) → un appel peut échouer derrière certains réseaux stricts (4G d'opérateur, pare-feu d'entreprise) ; le serveur STUN public de Google voit l'adresse IP (comme pour tout appel WebRTC). */

const KOC_STUN = [{ urls: 'stun:stun.l.google.com:19302' }], KOC_MAX = 6, KOC_BEAT = 8000, KOC_POLL = 2500;
let KOCALL = null, KOC_ICE = null;

/* Serveurs d'appel (ICE) : STUN public + TURN. Le TURN est indispensable en 4G/5G (réseaux mobiles filtrés) : il vient (1) du relais Cloudflare de l'utilisateur (route /turn, secrets TURN_KEY_ID et TURN_KEY_API_TOKEN) et/ou (2) d'un réglage manuel du profil (D.chat.turn). Résultat gardé 10 min. */
async function kocIce(force) {
  if (!force && KOC_ICE && Date.now() - KOC_ICE.t < 600000) return KOC_ICE;
  const list = [...KOC_STUN], via = { relay: 'none', manual: false, turn: false }, m = (D && D.chat && D.chat.turn) || {};
  const urls = String(m.u || '').split(/[\s,]+/).filter(u => /^turns?:/i.test(u)).slice(0, 4);
  if (urls.length) { const o = { urls }; if (m.n) o.username = m.n; if (m.c) o.credential = m.c; list.push(o); via.manual = via.turn = true; }
  if (typeof relayOn === 'function' && relayOn()) {
    try {
      const c = relayCfg(), r = await fetch(c.url + '/turn', { headers: c.tok ? { 'X-Relay-Token': c.tok } : {}, credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(7000) });
      if (r.ok) {
        const j = await r.json(), arr = Array.isArray(j.iceServers) ? j.iceServers : [];
        for (const s of arr.slice(0, 4)) { const u = [].concat(s.urls || []).filter(x => /^(turns?|stuns?):/i.test(x)); if (u.length) list.push({ urls: u, username: s.username, credential: s.credential }); }
        via.relay = arr.length ? 'ok' : 'err'; if (arr.length) via.turn = true;
      } else via.relay = r.headers.get('X-Relay-Error') === 'turnkey' ? 'nokey' : 'err';
    } catch { via.relay = 'err'; }
  }
  KOC_ICE = { t: Date.now(), list, via }; return KOC_ICE;
}

async function kocDetect() {
  const md = navigator.mediaDevices, r = { ok: !!(md && md.getUserMedia && md.enumerateDevices), secure: window.isSecureContext !== false, rtc: typeof RTCPeerConnection === 'function', cams: [], mics: [], labels: false };
  if (!r.ok) return r;
  try { const l = await md.enumerateDevices(); r.cams = l.filter(d => d.kind === 'videoinput'); r.mics = l.filter(d => d.kind === 'audioinput'); r.labels = l.some(d => d.label); } catch { /* liste indisponible */ }
  return r;
}
const kocErr = (e, what) => {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return tr('Accès refusé : autorisez {0} dans la barre d’adresse du navigateur (icône de cadenas), puis réessayez.').replace('{0}', what);
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return tr('Aucun appareil trouvé pour {0}.').replace('{0}', what);
  if (n === 'NotReadableError' || n === 'AbortError') return tr('{0} est utilisé par une autre application : fermez-la puis réessayez.').replace('{0}', what);
  return tr('Impossible d’utiliser {0} : {1}').replace('{0}', what).replace('{1}', (e && e.message) || n || '?');
};

function koCall(r, mode) {
  if (KOCALL) { if (KOCALL.room === r.id) { KOCALL.w.hidden = false; KOCALL.w.style.zIndex = ++Z; } else toast('Un appel est déjà en cours : raccrochez d’abord.', 5000); return; }
  const me = chatMe(), me12 = me.id.slice(0, 12), C = { room: r.id, w: null, pcs: new Map(), pres: new Map(), names: new Map(), stream: null, joined: false, mic: true, cam: true, audioOnly: mode === 'audio', dead: false, timers: [], myPres: '', ac: null, devs: { a: '', v: '' }, sigHandled: new Set(), peerMeta: new Map() };
  KOCALL = C;
  const conn = () => chatConn(r), base = () => chatPath(r);
  const put = async (name, obj) => FS.write(conn(), base() + name, await chatSeal(r, TE.encode(JSON.stringify(obj))));
  const get = async name => JSON.parse(TD.decode(await chatOpen(r, await (await FS.read(conn(), base() + name, 'application/octet-stream')).arrayBuffer())));

  const root = el('div', { className: 'koc' }), body = el('div', { className: 'koc-b' });
  C.fxv = el('video', { muted: true, playsInline: true, autoplay: true, hidden: true }); root.append(body, C.fxv);
  const rawV = () => C.stream && C.stream.getVideoTracks()[0];
  const sendV = () => (C.fx && C.fx.enabled && !C.audioOnly && rawV()) ? C.fx.track(24) : rawV();   // piste envoyée aux autres : canvas avec effets, ou caméra brute
  const FXE = () => { if (!C.fx) { C.fx = fxCreate({ video: C.fxv }); C.fx.onchange = () => applyFx(); } return C.fx; };
  function feedFx() { const v = rawV(); if (v) { C.fxv.srcObject = new MediaStream([v]); C.fxv.play().catch(() => {}); } else C.fxv.srcObject = null; if (C.fx) { C.fx.setSrc(C.fxv); applyFx(); } }
  function applyFx() {
    const fx = C.fx; if (!fx) return; const raw = rawV(), on = fx.enabled && !!raw && !C.audioOnly;
    if (on) { fx.run(); fx.track(24).enabled = C.cam; } else fx.halt();
    fx.stage.hidden = !on; if (C.rawPrev) C.rawPrev.hidden = on; if (lobbyVid) lobbyVid.hidden = on || !raw; if (C.fxWrapL) C.fxWrapL.hidden = !raw || C.audioOnly;
    const nt = sendV();
    if (C.joined && nt) { for (const P of C.pcs.values()) { const sd = P.pc.getSenders().find(x => x.track && x.track.kind === 'video'); if (sd && sd.track !== nt) sd.replaceTrack(nt).catch(() => {}); } updLocal(); }
  }
  const w = win(tr('Appel – {0}').replace('{0}', r.n), 'video', [root], { w: 860, h: 600, cls: 'chatw', onclose: () => leave(true) });
  C.w = w; w.classList.add('kocW'); new ResizeObserver(() => root.classList.toggle('narrow', w.clientWidth < 620)).observe(w);

  /* ---------- flux local ---------- */
  let lobbyVid = null;
  const stopStream = () => { if (C.fx) C.fx.halt(); C.fxv.srcObject = null; C.shown = null; if (C.stream) { C.stream.getTracks().forEach(t => t.stop()); C.stream = null; } if (C.ac) { try { C.ac.close(); } catch { /* déjà fermé */ } C.ac = null; } };
  async function openStream(audio, video) {
    stopStream();
    const want = [];
    const mob = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches), au = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };   // téléphone : voix nette, image légère (données mobiles)
    if (audio) want.push(['micro', { audio: C.devs.a ? { ...au, deviceId: { exact: C.devs.a } } : au }]);
    if (video) want.push(['caméra', { video: C.devs.v ? { deviceId: { exact: C.devs.v }, width: { ideal: mob ? 640 : 1280 }, height: { ideal: mob ? 360 : 720 } } : { facingMode: 'user', width: { ideal: mob ? 640 : 1280 }, height: { ideal: mob ? 360 : 720 } } }]);
    const tracks = [], errs = [];
    for (const [what, c] of want) {   // un par un : si la caméra manque, le micro marche quand même
      try { const s = await navigator.mediaDevices.getUserMedia(c); tracks.push(...s.getTracks()); } catch (e) { errs.push(kocErr(e, what === 'micro' ? tr('le micro') : tr('la caméra'))); }
    }
    C.stream = tracks.length ? new MediaStream(tracks) : null;
    return errs;
  }

  /* ---------- salle d'attente : détection + essai ---------- */
  let meter = 0;
  const stopMeter = () => { cancelAnimationFrame(meter); meter = 0; };
  async function lobby() {
    stopMeter(); body.replaceChildren(el('p', { className: 'mut', textContent: 'Recherche de la caméra et du micro…' }));
    const d = await kocDetect(); if (C.dead) return;
    const st = (ok, txt) => el('div', { className: 'chat-st ' + (ok ? 'ok' : 'bad'), textContent: txt });
    const lines = [];
    if (!d.ok || !d.rtc) lines.push(st(false, d.secure ? 'Ce navigateur ne permet pas les appels (caméra, micro ou WebRTC indisponibles).' : 'Les appels demandent une connexion sécurisée (https).'));
    else {
      lines.push(st(d.cams.length > 0, d.cams.length ? tr('Caméra : {0} détectée(s)').replace('{0}', d.cams.length) : 'Caméra : aucune détectée (vous pouvez rejoindre en voix seule).'));
      lines.push(st(d.mics.length > 0, d.mics.length ? tr('Micro : {0} détecté(s)').replace('{0}', d.mics.length) : 'Micro : aucun détecté (vous ne pourrez qu’écouter).'));
    }
    const vid = el('video', { className: 'koc-prev', muted: true, playsInline: true, autoplay: true }), lvl = el('div', { className: 'koc-lvl' }, el('i')), msg = el('div', { className: 'warn', hidden: true });
    lobbyVid = vid; const fx = FXE(); const pv = el('div', { className: 'koc-pv' }, vid, fx.stage, el('div', { className: 'koc-nov', hidden: true })); fx.fitTo(pv); const fxWrapL = el('div', { className: 'crec-fxw' }, fx.toggle, fx.panel); C.fxWrapL = fxWrapL;
    const selA = el('select', { 'aria-label': tr('Micro') }), selV = el('select', { 'aria-label': tr('Caméra') });
    const fillSel = (sel, list, cur, what) => { sel.replaceChildren(...list.map((x, i) => el('option', { value: x.deviceId, nt: 1, textContent: x.label || (what + ' ' + (i + 1)), selected: x.deviceId === cur }))); sel.disabled = !list.length; };
    const modeV = el('input', { type: 'radio', name: 'kocm', checked: !C.audioOnly }), modeA = el('input', { type: 'radio', name: 'kocm', checked: C.audioOnly });
    const net = el('div', { className: 'chat-st', textContent: 'Réseau mobile : vérification…' });
    const paintNet = ice => { const v = ice.via, ok = v.turn; net.className = 'chat-st ' + (ok ? 'ok' : 'bad'); net.textContent = v.manual && v.relay !== 'ok' ? 'Appels en 4G/5G : serveur TURN réglé à la main.' : v.relay === 'ok' ? 'Appels en 4G/5G : serveur relais actif.' : v.relay === 'nokey' ? 'Appels en 4G/5G : votre relais Cloudflare n’a pas encore de clé TURN (voir le README).' : v.relay === 'err' ? 'Appels en 4G/5G : le relais ne répond pas à la demande TURN.' : 'Appels en 4G/5G : non configuré (relais Cloudflare ou réglage TURN).'; };
    kocIce().then(ice => { if (!C.dead && net.isConnected) paintNet(ice); });
    const join = btn('Rejoindre l’appel', 'video', () => start(), 'pri'); join.disabled = !d.ok || !d.rtc;
    async function test() {
      msg.hidden = true; stopMeter(); vid.srcObject = null;
      const errs = await openStream(d.mics.length > 0, !C.audioOnly && d.cams.length > 0); if (C.dead) return;
      const nd = await kocDetect(); d.cams = nd.cams; d.mics = nd.mics;
      const as = C.stream && C.stream.getAudioTracks()[0], vs = C.stream && C.stream.getVideoTracks()[0];
      fillSel(selA, d.mics, as && as.getSettings().deviceId, tr('Micro')); fillSel(selV, d.cams, vs && vs.getSettings().deviceId, tr('Caméra'));
      if (errs.length) { msg.hidden = false; msg.replaceChildren(...errs.flatMap(e => [e, el('br')])); }
      if (vs) { vid.srcObject = new MediaStream([vs]); vid.hidden = false; vid.play().catch(() => {}); } else vid.hidden = true;
      feedFx();
      if (as) {   // jauge : parlez, la barre bouge
        try {
          C.ac = new (window.AudioContext || window.webkitAudioContext)(); const an = C.ac.createAnalyser(); an.fftSize = 512; C.ac.createMediaStreamSource(new MediaStream([as])).connect(an); const buf = new Uint8Array(an.fftSize);
          const tick = () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); lvl.firstChild.style.width = Math.min(100, m * 1.6) + '%'; meter = requestAnimationFrame(tick); }; tick();
        } catch { /* jauge indisponible */ }
      } else lvl.firstChild.style.width = '0';
      lvl.hidden = !as;
    }
    selA.onchange = () => { C.devs.a = selA.value; test(); }; selV.onchange = () => { C.devs.v = selV.value; test(); };
    modeV.onchange = modeA.onchange = () => { C.audioOnly = modeA.checked; test(); };
    fxWrapL.hidden = C.audioOnly;
    body.replaceChildren(el('h3', { textContent: tr('Appel – {0}').replace('{0}', r.n) }), ...lines,
      d.ok && d.rtc ? el('div', { className: 'koc-lob' }, pv,
        el('div', { className: 'col' },
          el('div', { className: 'row' }, el('label', { className: 'row tight' }, modeV, el('span', { textContent: 'Vidéo et voix' })), el('label', { className: 'row tight' }, modeA, el('span', { textContent: 'Voix seulement (micro)' }))),
          el('label', { className: 'col' }, el('small', { className: 'mut', textContent: 'Micro' }), selA), el('small', { className: 'mut', textContent: 'Parlez pour tester le micro :' }), lvl,
          el('label', { className: 'col' }, el('small', { className: 'mut', textContent: 'Caméra' }), selV),
          fxWrapL, msg,
          el('div', { className: 'row' }, btn('Autoriser et tester', 'refresh', test), join))) : null,
      d.ok && d.rtc ? net : null,
      el('small', { className: 'mut', textContent: 'Sans serveur TURN, l’appel est direct entre navigateurs et peut échouer sur certains réseaux (4G/5G, pare-feu d’entreprise). Votre adresse IP est visible par les participants et par les serveurs STUN/TURN. 6 personnes au maximum.' }),
      el('div', { className: 'row' }, btn('Réglage TURN (réseau mobile)…', 'settings', () => turnDlg().then(() => kocIce(true).then(paintNet)), 'sm'), btn('Fermer', 'x', () => leave(true), 'sm')));
    if (d.ok && d.rtc && (d.cams.length || d.mics.length)) test();
  }

  async function turnDlg() {
    const m = (D.chat && D.chat.turn) || {};
    const v = await dialog('Serveur TURN (appels en 4G/5G)', [
      { k: 'u', label: 'Adresse(s) TURN (turn:… ou turns:…, séparées par un espace)', value: m.u || '', ph: 'turns:turn.exemple.com:443?transport=tcp', max: 400 },
      { k: 'n', label: 'Nom d’utilisateur', value: m.n || '', max: 200 },
      { k: 'c', label: 'Mot de passe du serveur TURN', value: m.c || '', type: 'password', max: 200 }
    ], 'Enregistrer', { note: 'Facultatif : si votre relais Cloudflare fournit déjà le TURN (README), laissez vide. Ces données restent dans votre profil chiffré.', check: x => (x.u.trim() && !x.u.trim().split(/[\s,]+/).every(u => /^turns?:[\w.\-\[\]:]+(\?transport=(udp|tcp))?$/i.test(u))) ? 'Adresse TURN invalide.' : '' });
    if (!v) return;
    D.chat.turn = { u: v.u.trim().split(/[\s,]+/).filter(Boolean).join(' ').slice(0, 400), n: v.n.trim().slice(0, 200), c: v.c.slice(0, 200) }; save(); toast('Réglage enregistré.');
  }

  /* ---------- appel ---------- */
  const grid = el('div', { className: 'koc-grid' }), bar = el('div', { className: 'koc-bar' }), info = el('div', { className: 'koc-info mut' });
  const tiles = new Map();
  const tile = (id, name, local) => {
    let t = tiles.get(id); if (t) return t;
    const v = el('video', { playsInline: true, autoplay: true, muted: !!local }), ic = el('div', { className: 'koc-ic' }), av = el('div', { className: 'koc-av', nt: 1, textContent: (name || '?').trim().slice(0, 1).toUpperCase(), style: `background:hsl(${hue(id)} 55% 45%)` }), lab = el('div', { className: 'koc-nm', nt: 1, textContent: name || tr('Participant') });
    const e = el('div', { className: 'koc-t' + (local ? ' me' : '') }, v, av, lab, ic); t = { id, e, v, av, ic, lab, local }; tiles.set(id, t); grid.append(e); relayout(); return t;
  };
  const relayout = () => { grid.dataset.n = Math.min(6, tiles.size); };
  const dropTile = id => { const t = tiles.get(id); if (t) { t.e.remove(); tiles.delete(id); relayout(); } };
  const showState = (t, hasVid, mic) => { t.e.classList.toggle('novid', !hasVid); t.ic.replaceChildren(...(mic === false ? [ico('micoff', 14)] : [])); };
  function updLocal() {
    const t = tile('me', chatName(), true); t.lab.textContent = chatName() + ' ' + tr('(vous)');
    const vt = sendV(); if (vt && C.shown !== vt) { C.shown = vt; t.v.srcObject = new MediaStream([vt]); t.v.play().catch(() => {}); }
    showState(t, !!rawV() && C.cam, C.stream && C.stream.getAudioTracks()[0] ? C.mic : false);
  }
  async function beat() {
    if (!C.joined || C.dead) return;
    const old = C.myPres, nm = 'k-' + me12 + '-' + String(Date.now()).padStart(13, '0') + '.k';
    try { await put(nm, { n: chatName(), a: !!(C.stream && C.stream.getAudioTracks()[0]) && C.mic, v: !!(C.stream && C.stream.getVideoTracks()[0]) && C.cam }); C.myPres = nm; if (old) await FS.remove(conn(), base() + old).catch(() => {}); } catch (e) { console.warn('Konekt appel : présence', e && e.message); }
  }
  async function start() {
    stopMeter(); if (lobbyVid) lobbyVid.srcObject = null;
    const nowPeers = koPresent((await FS.list(conn(), base()).catch(() => [])).map(e => e.name));
    if (nowPeers.size >= KOC_MAX - 1) return toast('Appel complet : 6 personnes au maximum.', 6000);
    if (!C.stream) { const errs = await openStream(true, !C.audioOnly); if (!C.stream) toast(errs[0] || 'Ni micro ni caméra : vous pourrez seulement écouter et regarder.', 7000); }
    if (C.audioOnly && C.stream) C.stream.getVideoTracks().forEach(t => { t.stop(); C.stream.removeTrack(t); });
    feedFx(); C.ice = (await kocIce()).list; if (C.dead) return;
    C.joined = true; root.classList.add('live');
    const mic = el('button', { type: 'button', className: 'koc-bt', title: tr('Couper / activer le micro'), 'aria-label': tr('Couper / activer le micro') }, ico('mic', 22)), cam = el('button', { type: 'button', className: 'koc-bt', title: tr('Couper / activer la caméra'), 'aria-label': tr('Couper / activer la caméra') }, ico('video', 22)), end = el('button', { type: 'button', className: 'koc-bt koc-end', title: tr('Raccrocher'), 'aria-label': tr('Raccrocher') }, ico('phoneoff', 22));
    const aT = () => C.stream && C.stream.getAudioTracks()[0], vT = () => C.stream && C.stream.getVideoTracks()[0];
    const paint = () => { mic.replaceChildren(ico(C.mic && aT() ? 'mic' : 'micoff', 22)); cam.replaceChildren(ico(C.cam && vT() ? 'video' : 'videooff', 22)); mic.disabled = !aT(); cam.disabled = !vT(); mic.classList.toggle('off', !(C.mic && aT())); cam.classList.toggle('off', !(C.cam && vT())); updLocal(); };
    mic.onclick = () => { C.mic = !C.mic; if (aT()) aT().enabled = C.mic; paint(); beat(); };
    cam.onclick = () => { C.cam = !C.cam; if (vT()) vT().enabled = C.cam; if (C.fx && C.fx._tr) C.fx._tr.enabled = C.cam; paint(); beat(); };
    end.onclick = () => leave(true);
    const fx = FXE(), fxB = el('button', { type: 'button', className: 'koc-bt', title: tr('Effets : fonds, cadres, GIF'), 'aria-label': tr('Effets : fonds, cadres, GIF'), 'aria-expanded': 'false' }, ico('sparkle', 22)); fxB.hidden = !vT() || C.audioOnly;
    C.rawPrev = el('video', { muted: true, playsInline: true, autoplay: true, className: 'crec-video' }); if (vT()) { C.rawPrev.srcObject = new MediaStream([vT()]); C.rawPrev.play().catch(() => {}); }
    const prevBox = el('div', { className: 'crec-screen' }, C.rawPrev, fx.stage), sheet = el('div', { className: 'koc-fx', hidden: true }, el('div', { className: 'koc-fxh' }, el('b', { textContent: 'Effets vidéo' }), btn('', 'x', () => setSheet(false), 'sm', 'Fermer')), prevBox, fx.toggle, fx.panel);
    const setSheet = on => { sheet.hidden = !on; fxB.classList.toggle('on', on); fxB.setAttribute('aria-expanded', String(on)); if (on) { prevBox.append(fx.stage); fx.fitTo(prevBox); applyFx(); } };
    fxB.onclick = () => setSheet(sheet.hidden); root.append(sheet);
    bar.replaceChildren(mic, cam, fxB, end); body.replaceChildren(info, grid, bar); paint(); applyFx();
    C.timers.push(setInterval(beat, KOC_BEAT), setInterval(poll, KOC_POLL)); await beat(); poll();
  }

  /* ---------- connexions entre participants ---------- */
  const waitIce = pc => new Promise(res => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, 5000); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
  function newPc(peer, sid) {
    const pc = new RTCPeerConnection({ iceServers: C.ice || KOC_STUN }), P = { pc, sid, born: Date.now(), stream: new MediaStream(), failedAt: 0 };
    for (const kind of ['audio', 'video']) {
      const tr0 = kind === 'video' ? sendV() : (C.stream && C.stream.getAudioTracks()[0]);
      if (tr0) pc.addTrack(tr0, C.stream); else pc.addTransceiver(kind, { direction: 'recvonly' });
    }
    pc.ontrack = ev => {
      const t = tile(peer, C.names.get(peer)); P.stream.addTrack(ev.track); t.v.srcObject = P.stream; t.v.play().catch(() => {});
      const upd = () => { const v = P.stream.getVideoTracks()[0], m = C.peerMeta.get(peer) || {}; showState(t, !!v && !v.muted && m.v !== false, m.a); };
      ev.track.onmute = upd; ev.track.onunmute = upd; upd();
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') P.failedAt = P.failedAt || Date.now(); else if (pc.connectionState === 'connected') P.failedAt = 0; };
    return P;
  }
  const closePeer = id => { const P = C.pcs.get(id); if (P) { try { P.pc.close(); } catch { /* déjà fermé */ } C.pcs.delete(id); } dropTile(id); };
  async function sendSig(to12, obj) { await put('s-' + me12 + '-' + to12 + '-' + String(Date.now()).padStart(13, '0') + '-' + chex(2) + '.s', obj); }
  async function offerTo(peer) {
    const sid = chex(4), P = newPc(peer, sid); C.pcs.set(peer, P);
    try { await P.pc.setLocalDescription(await P.pc.createOffer()); await waitIce(P.pc); if (C.dead || C.pcs.get(peer) !== P) return; await sendSig(peer, { t: 'offer', sid, n: chatName(), sdp: P.pc.localDescription.sdp }); }
    catch (e) { console.warn('Konekt appel : offre', e && e.message); closePeer(peer); }
  }
  async function onSig(from, msg) {
    if (msg.t === 'offer' && typeof msg.sdp === 'string' && /^[a-f0-9]{8}$/.test(msg.sid || '')) {
      if (C.pcs.has(from) && C.pcs.get(from).sid === msg.sid) return;
      closePeer(from); if (msg.n) C.names.set(from, String(msg.n).slice(0, 40));
      const P = newPc(from, msg.sid); C.pcs.set(from, P);
      try { await P.pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp }); await P.pc.setLocalDescription(await P.pc.createAnswer()); await waitIce(P.pc); if (C.dead || C.pcs.get(from) !== P) return; await sendSig(from, { t: 'answer', sid: msg.sid, n: chatName(), sdp: P.pc.localDescription.sdp }); }
      catch (e) { console.warn('Konekt appel : réponse', e && e.message); closePeer(from); }
    } else if (msg.t === 'answer' && typeof msg.sdp === 'string') {
      const P = C.pcs.get(from); if (!P || P.sid !== msg.sid || P.pc.signalingState !== 'have-local-offer') return;
      if (msg.n) { C.names.set(from, String(msg.n).slice(0, 40)); const t = tiles.get(from); if (t) { t.lab.textContent = C.names.get(from); t.av.textContent = C.names.get(from).trim().slice(0, 1).toUpperCase(); } }
      try { await P.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp }); } catch (e) { console.warn('Konekt appel : réponse reçue', e && e.message); closePeer(from); }
    }
  }
  let polling = false;
  async function poll() {
    if (polling || C.dead || !C.joined) return; polling = true;
    try {
      const names = (await FS.list(conn(), base())).map(e => e.name), now = Date.now(), fresh = koPresent(names), allP = new Map();
      for (const n of names) { const m = KO_PRES.exec(n); if (m && m[1] !== me12 && +m[2] > now - 25000 && (allP.get(m[1]) || { ts: 0 }).ts < +m[2]) allP.set(m[1], { ts: +m[2], n }); }
      // présences : nom + état micro/caméra
      for (const [id, p] of allP) { if (C.peerMeta.get(id) && C.peerMeta.get(id).f === p.n) continue; try { const j = await get(p.n); C.peerMeta.set(id, { f: p.n, a: j.a !== false, v: j.v !== false }); if (j.n) C.names.set(id, String(j.n).slice(0, 40)); const t = tiles.get(id); if (t) { t.lab.textContent = C.names.get(id) || t.lab.textContent; const v = C.pcs.get(id) && C.pcs.get(id).stream.getVideoTracks()[0]; showState(t, !!v && !v.muted && j.v !== false, j.a); } } catch { /* illisible */ } }
      // signaux qui me sont adressés
      for (const n of names.filter(n => { const m = KO_SIG.exec(n); return m && m[2] === me12; }).sort()) {
        const m = KO_SIG.exec(n); if (C.sigHandled.has(n)) continue; C.sigHandled.add(n);
        try { if (+m[3] > now - 90000) await onSig(m[1], await get(n)); } catch (e) { console.warn('Konekt appel : signal', e && e.message); }
        FS.remove(conn(), base() + n).catch(() => {});
      }
      // nouveaux venus : le plus petit identifiant envoie l'offre ; départs ; liaisons tombées
      for (const [id] of allP) {
        const P = C.pcs.get(id);
        if (!P && me12 < id && C.pcs.size < KOC_MAX - 1) offerTo(id);
        else if (P && (P.failedAt && now - P.failedAt > 3000 || (P.pc.connectionState !== 'connected' && now - P.born > 45000))) closePeer(id);
      }
      for (const id of [...C.pcs.keys()]) if (!allP.has(id)) closePeer(id);
      const n = allP.size + 1;
      const conn0 = [...C.pcs.values()].filter(P => P.pc.connectionState === 'connected').length, slow = [...C.pcs.values()].some(P => P.pc.connectionState !== 'connected' && now - P.born > 20000);
      info.textContent = allP.size ? (slow && !conn0 ? tr('Connexion difficile… sur réseau mobile ou pare-feu, un serveur TURN est nécessaire (réglage dans la salle d’attente ou README).') : tr('{0} participant(s) dans l’appel').replace('{0}', n)) : tr('En attente des autres participants… partagez le code d’invitation si besoin.');
      updLocal();
      for (const f of [...C.sigHandled]) if (!names.includes(f)) C.sigHandled.delete(f);
    } catch (e) { info.textContent = chatErr(e); }
    polling = false;
  }
  async function leave(close) {
    if (C.dead) return; C.dead = true; C.timers.forEach(clearInterval); stopMeter();
    for (const id of [...C.pcs.keys()]) closePeer(id);
    stopStream(); if (C.fx) C.fx.dispose();
    if (C.myPres) FS.remove(conn(), base() + C.myPres).catch(() => {});
    if (KOCALL === C) KOCALL = null;
    if (close && w.isConnected) w.close();
  }
  window.addEventListener('pagehide', () => { if (!C.dead && C.myPres) { try { FS.remove(conn(), base() + C.myPres); } catch { /* fermeture de la page */ } } });
  C.leave = leave; lobby();
}
