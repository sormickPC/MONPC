'use strict';
/* chat-rec.js — « Enregistrer » dans Sormick Tchat : webcam + micro, ou micro seul, en MP4, envoyé dans le cloud WebDAV choisi (ou téléchargé).
   - Le navigateur enregistre lui-même (MediaRecorder) : MP4 (H.264 + AAC) sur Chrome / Edge récents, Safari ; sinon WebM (Firefox) avec un avertissement clair.
   - Aucune donnée ne passe par un autre serveur : le fichier part directement vers le stockage WebDAV choisi (même file d'envoi que l'enregistreur d'écran : D.rec.chat).
   - Détection des caméras / micros branchés (kocDetect, konekt-call.js), choix du périphérique, jauge du micro, pause, découpage en plusieurs fichiers.
   - Effets vidéo (option « Effets », tout se fait dans le navigateur, sans modèle ni service externe) :
       • FOND REMPLACÉ sans intelligence artificielle : « fond uni » (on clique sur le mur / le rideau derrière soi, tout ce qui en diffère est la personne) ou « fond capturé »
         (on sort du cadre 5 s, la caméra mémorise le décor, puis tout ce qui change est la personne). Remplacé par un dégradé ou une image de l'appareil.
       • GIF GIPHY (ou GIF de l'appareil) posés sur la vidéo, déplaçables et redimensionnables, enregistrés avec la vidéo (mêmes GIF que la fenêtre de recherche de Tchat).
     L'image avec effets est dessinée dans un canvas (captureStream) puis enregistrée ; l'onglet doit rester visible pendant l'enregistrement avec effets. */

const CREC_MIMES = {
  v: [['video/mp4;codecs=avc1.640028,mp4a.40.2', 1], ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 1], ['video/mp4;codecs=avc1,opus', 1], ['video/mp4;codecs=avc1', 1], ['video/mp4', 1], ['video/webm;codecs=vp9,opus', 0], ['video/webm;codecs=vp8,opus', 0], ['video/webm', 0]],
  a: [['audio/mp4;codecs=mp4a.40.2', 1], ['audio/mp4;codecs=opus', 1], ['audio/mp4', 1], ['audio/webm;codecs=opus', 0], ['audio/webm', 0]]
};
const crecPick = audioOnly => { const ok = typeof MediaRecorder === 'function' ? CREC_MIMES[audioOnly ? 'a' : 'v'].find(([m]) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) : null; return ok ? { mime: ok[0], mp4: !!ok[1] } : { mime: '', mp4: false }; };
let CRECWIN = null;

/* chatRecWin({ key, title, attach, attachLabel }) : key = clé du dossier d'enregistrement (D.rec[key] : 'chat' ou 'soc') ; attach(File) = bouton « Joindre » (Konekt : ajoute à la publication) */
function chatRecWin(O = {}) {
  O = { key: 'chat', title: 'Enregistrer : webcam et micro', ...O }; const KEY = O.key;
  if (CRECWIN && CRECWIN.isConnected) {
    if (CRECWIN.recKey === KEY || CRECWIN.busy()) { CRECWIN.recOpts(O); CRECWIN.hidden = false; CRECWIN.style.zIndex = ++Z; return CRECWIN; }
    CRECWIN.close();
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined')
    return dialog('Enregistrer', [], 'OK', { note: window.isSecureContext === false ? 'L’enregistrement demande une connexion sécurisée (https).' : 'Ce navigateur ne permet pas d’enregistrer la caméra ou le micro depuis un site web.' });
  const S = { stream: null, rec: null, state: 'idle', secs: 0, t: 0, chunks: [], size: 0, parts: 0, partStart: 0, last: null, q: null, ending: false, audioOnly: false, ac: null, meter: 0, url: '', devs: { a: '', v: '' }, mime: '', mp4: false, segT: 0, dead: false };
  const mob = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
  const live = el('video', { muted: true, playsInline: true, autoplay: true, className: 'crec-video', 'aria-label': 'Aperçu' });
  const micBig = el('div', { className: 'crec-mic', hidden: true }, ico('mic', 56));
  const hint = el('div', { className: 'tv-msg', textContent: 'Autorisez la caméra et le micro quand le navigateur le demande.' });
  const E = fxCreate({ video: live }), stage = E.stage; let w = null;
  const screen = el('div', { className: 'crec-screen' }, live, stage, micBig, hint); E.fitTo(screen);
  const fxWrap = el('div', { className: 'crec-fxw', hidden: true }, E.toggle, E.panel), photoB = btn('Prendre une photo', 'camera', () => photo(), 'sm', 'Prendre une photo avec les effets'), photoBox = el('div', { className: 'col crec-pbox', hidden: true });
  const lvl = el('div', { className: 'koc-lvl' }, el('i')), msg = el('div', { className: 'warn', hidden: true }), fmt = el('div', { className: 'chat-st', hidden: true });
  const selA = el('select', { 'aria-label': tr('Micro') }), selV = el('select', { 'aria-label': tr('Caméra') });
  const modeV = el('input', { type: 'radio', name: 'crecm', checked: true }), modeA = el('input', { type: 'radio', name: 'crecm' });
  const clock = el('b', { className: 'sc-clock', textContent: '0:00' }), stat = el('small', { className: 'mut' });
  const startB = btn('Démarrer l’enregistrement', 'recdot', () => start(), 'pri sc-start'), pauseB = btn('Pause', 'pause', () => pause()), stopB = btn('Arrêter et enregistrer', 'stop', () => stop(), 'dng');
  pauseB.hidden = stopB.hidden = true;
  const lastBox = el('div', { className: 'col', hidden: true }), playA = el('audio', { controls: true, hidden: true, className: 'crec-audio', 'aria-label': 'Écouter' });
  const dest = destBar(KEY, segSelect(KEY));
  const fillSel = (sel, list, cur, what) => { sel.replaceChildren(...list.map((x, i) => el('option', { value: x.deviceId, nt: 1, textContent: x.label || (what + ' ' + (i + 1)), selected: x.deviceId === cur }))); sel.disabled = !list.length; };
  const stopMeter = () => { cancelAnimationFrame(S.meter); S.meter = 0; lvl.firstChild.style.width = '0'; };
  const releaseStream = () => { stopMeter(); if (S.stream) { S.stream.getTracks().forEach(t => t.stop()); S.stream = null; } if (S.ac) { try { S.ac.close(); } catch { /* déjà fermé */ } S.ac = null; } live.srcObject = null; };
  const paint = () => {
    const on = S.state !== 'idle';
    startB.hidden = on; pauseB.hidden = stopB.hidden = !on;
    const t = S.state === 'paused' ? 'Reprendre' : 'Pause'; pauseB.lastChild.textContent = tr(t); pauseB.title = tr(t);
    E.lock(on); for (const x of [selA, selV, modeV, modeA]) x.disabled = on || (x === selV && modeA.checked);
    selV.parentNode && (selV.parentNode.hidden = modeA.checked);
  };
  const tick = () => { if (S.state === 'rec') S.secs++; clock.textContent = fmtDur(S.secs); stat.textContent = S.state === 'idle' ? '' : tr(S.state === 'paused' ? 'En pause' : 'Enregistrement') + ' · ' + fmtSize(S.size); };
  const err = (e, what) => (typeof kocErr === 'function' ? kocErr(e, what) : (e && e.message) || 'Erreur');

  /* ---------- périphériques, aperçu, jauge ---------- */
  async function prep() {
    if (S.state !== 'idle' || S.dead) return;
    releaseStream(); stopFx(); msg.hidden = true; S.audioOnly = modeA.checked; micBig.hidden = !S.audioOnly; live.hidden = S.audioOnly; hint.hidden = true;
    const au = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, tracks = [], errs = [];
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: S.devs.a ? { ...au, deviceId: { exact: S.devs.a } } : au }); tracks.push(...s.getTracks()); } catch (e) { errs.push(err(e, tr('le micro'))); }
    if (!S.audioOnly) { try { const s = await navigator.mediaDevices.getUserMedia({ video: { ...(S.devs.v ? { deviceId: { exact: S.devs.v } } : { facingMode: 'user' }), width: { ideal: mob ? 640 : 1280 }, height: { ideal: mob ? 360 : 720 } } }); tracks.push(...s.getTracks()); } catch (e) { errs.push(err(e, tr('la caméra'))); } }
    if (S.dead) { tracks.forEach(t => t.stop()); return; }
    S.stream = tracks.length ? new MediaStream(tracks) : null;
    const d = typeof kocDetect === 'function' ? await kocDetect() : { mics: [], cams: [] };
    const as = S.stream && S.stream.getAudioTracks()[0], vs = S.stream && S.stream.getVideoTracks()[0];
    fillSel(selA, d.mics || [], as && as.getSettings().deviceId, tr('Micro')); fillSel(selV, d.cams || [], vs && vs.getSettings().deviceId, tr('Caméra'));
    if (errs.length) { msg.hidden = false; msg.replaceChildren(...errs.flatMap(e => [e, el('br')])); }
    if (vs) { live.srcObject = new MediaStream([vs]); live.play().catch(() => {}); } else if (!S.audioOnly) { hint.hidden = false; hint.textContent = tr('Aucune caméra utilisable : choisissez « Voix seulement » ou branchez une caméra.'); }
    if (as) {
      try { S.ac = new (window.AudioContext || window.webkitAudioContext)(); const an = S.ac.createAnalyser(); an.fftSize = 512; S.ac.createMediaStreamSource(new MediaStream([as])).connect(an); const buf = new Uint8Array(an.fftSize);
        const loop = () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); lvl.firstChild.style.width = Math.min(100, m * 1.6) + '%'; S.meter = requestAnimationFrame(loop); }; loop(); } catch { /* jauge indisponible */ }
    }
    fxApply();
    const p = crecPick(S.audioOnly); S.mime = p.mime; S.mp4 = p.mp4;
    fmt.hidden = !S.stream; fmt.className = 'chat-st ' + (p.mp4 ? 'ok' : 'bad');
    fmt.textContent = p.mp4 ? tr('Format : MP4') : tr('Ce navigateur ne sait pas enregistrer en MP4 : le fichier sera au format WebM (lisible par Chrome, Firefox, VLC).');
    paint();
  }


  /* ---------- effets : moteur commun fx.js (fonds, cadres, GIF) ---------- */
  function fxApply() {
    const vid = !S.audioOnly && !!S.stream && !!S.stream.getVideoTracks().length, on = E.enabled && vid;
    stage.hidden = !on; live.hidden = on || S.audioOnly; fxWrap.hidden = !vid; photoB.hidden = !vid;
    if (w) w.classList.toggle('fx-on', on);
    if (on) { E.run(); if (E.fit) E.fit(); } else E.halt();
  }
  E.onchange = () => fxApply();
  const stopFx = () => E.halt();
  async function photo() {
    if (!S.stream || S.audioOnly || !S.stream.getVideoTracks().length) return toast('Aucune caméra utilisable pour la photo.', 5000);
    let blob;
    if (E.enabled) { E.run(); await new Promise(r => setTimeout(r, 120)); blob = await E.snap('image/jpeg', 0.92); }
    else { const c = document.createElement('canvas'); c.width = live.videoWidth || 640; c.height = live.videoHeight || 360; c.getContext('2d').drawImage(live, 0, 0, c.width, c.height); blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92)); }
    if (!blob) return toast('La photo n’a pas pu être prise.', 5000);
    const name = 'photo_' + stamp(new Date()) + '.jpg', url = URL.createObjectURL(blob), close = () => { URL.revokeObjectURL(url); photoBox.hidden = true; photoBox.replaceChildren(); };
    photoBox.hidden = false; photoBox.replaceChildren(el('img', { src: url, alt: tr('Photo'), className: 'crec-photo' }), el('small', { className: 'mut', nt: 1, textContent: name + ' (' + fmtSize(blob.size) + ')' }),
      el('div', { className: 'row' }, btn(recConn(KEY) ? 'Envoyer dans le cloud' : 'Télécharger sur l’appareil', recConn(KEY) ? 'upload' : 'download', () => { recQueue(KEY, () => {}).push(blob, name); }),
        ...(O.attach ? [btn(O.attachLabel || 'Joindre', 'paperclip', () => { O.attach(new File([blob], name, { type: 'image/jpeg' })); close(); w.close(); }, 'pri')] : []), btn('Fermer', 'x', close)));
  }

  /* ---------- enregistrement ---------- */
  const ext = () => (S.mp4 ? 'mp4' : 'webm');
  const rotate = () => { if (S.rec && S.rec.state !== 'inactive') S.rec.stop(); };
  function newPart() {
    const vb = mob ? 1200000 : 2500000;
    const r = new MediaRecorder(S.rstream || S.stream, { ...(S.mime ? { mimeType: S.mime } : {}), ...(S.audioOnly ? {} : { videoBitsPerSecond: vb }), audioBitsPerSecond: 128000 });
    S.rec = r; S.chunks = []; S.size = 0; S.partStart = Date.now(); S.segT = 0;
    r.ondataavailable = e => { if (e.data && e.data.size) { S.chunks.push(e.data); S.size += e.data.size; if (S.size > REC_MAXMEM * 2 && S.state === 'rec') rotate(); } };
    r.onstop = () => {
      const b = new Blob(S.chunks, { type: (S.mime || (S.audioOnly ? 'audio/webm' : 'video/webm')).split(';')[0] }); S.chunks = []; S.size = 0;
      if (b.size) { S.parts++; const multi = D.rec.chat.seg > 0 || S.parts > 1 || !S.ending; S.last = { blob: b, name: (S.audioOnly ? 'voix_' : 'webcam_') + stamp(new Date(S.partStart)) + (multi ? '_p' + S.parts : '') + '.' + ext() }; S.q.push(b, S.last.name); }
      if (!S.ending) newPart(); else finish();
    };
    r.start(1000);
  }
  async function start() {
    if (!S.stream) { await prep(); if (!S.stream) return toast('Ni micro ni caméra utilisable : rien à enregistrer.', 6000); }
    if (!S.stream.getAudioTracks().length && !S.audioOnly) toast('Aucun micro détecté : la vidéo sera enregistrée sans son.', 6000);
    if (S.audioOnly && !S.stream.getAudioTracks().length) return toast('Aucun micro utilisable : branchez-en un puis réessayez.', 6000);
    if (D.conns.length && !recConn(KEY)) await dest.choose();
    if (!recConn(KEY)) toast(D.conns.length ? 'Aucun cloud choisi : le fichier sera téléchargé sur cet appareil.' : 'Aucun cloud WebDAV connecté : le fichier sera téléchargé sur cet appareil.', 6000);
    S.rstream = null;
    if (E.enabled && !S.audioOnly && stage.hidden === false) { try { E.run(); S.rstream = new MediaStream([E.track(30), ...S.stream.getAudioTracks()]); } catch { toast('Les effets ne peuvent pas être enregistrés ici : enregistrement sans effets.', 6000); } }
    S.q = recQueue(KEY, s => { stat.textContent = s.pending ? tr('Envoi en cours…') : s.failed ? tr('Envoi impossible : fichier à télécharger.') : s.sent ? tr('Enregistré.') : ''; });
    S.state = 'rec'; S.ending = false; S.secs = 0; S.parts = 0; S.last = null; lastBox.hidden = true; lastBox.replaceChildren();
    try { newPart(); } catch (e) { S.state = 'idle'; paint(); return toast(tr('Enregistrement impossible : {0}').replace('{0}', (e && e.message || 'erreur')), 7000); }
    paint(); clearInterval(S.t); S.t = setInterval(() => { tick(); const g = D.rec.chat.seg; if (S.state === 'rec' && g > 0 && ++S.segT >= g * 60) { S.segT = 0; rotate(); } }, 1000); tick();
  }
  function pause() { if (!S.rec) return; if (S.state === 'rec') { S.rec.pause(); S.state = 'paused'; } else if (S.state === 'paused') { S.rec.resume(); S.state = 'rec'; } paint(); tick(); }
  function stop() { if (S.state === 'idle') return; S.ending = true; clearInterval(S.t); if (S.rec && S.rec.state !== 'inactive') S.rec.stop(); else finish(); }
  async function finish() {
    S.rstream = null;
    releaseStream(); stopFx(); S.state = 'idle'; S.rec = null; clearInterval(S.t);
    if (!S.dead) {
      paint(); tick(); clock.textContent = '0:00';
      if (S.last) {
        const l = S.last; if (S.url) URL.revokeObjectURL(S.url); S.url = URL.createObjectURL(l.blob);
        hint.hidden = true;
        if (S.audioOnly) { live.hidden = true; micBig.hidden = false; playA.hidden = false; playA.src = S.url; }
        else { stage.hidden = true; live.hidden = false; micBig.hidden = true; playA.hidden = true; live.src = S.url; live.controls = true; live.muted = false; }
        lastBox.hidden = false; lastBox.replaceChildren(el('small', { className: 'mut', nt: 1, textContent: l.name + ' (' + fmtSize(l.blob.size) + ')' }),
          playA, el('div', { className: 'row' }, btn('Télécharger sur l’appareil', 'download', () => download(l.blob, l.name)), ...(O.attach ? [btn(O.attachLabel || 'Joindre', 'paperclip', () => { O.attach(new File([l.blob], l.name, { type: l.blob.type })); w.close(); }, 'pri')] : []), btn('Nouvel enregistrement', 'recdot', () => { live.controls = false; live.removeAttribute('src'); live.load(); S.last = null; playA.pause(); playA.removeAttribute('src'); playA.hidden = true; lastBox.hidden = true; prep(); })));
      } else { hint.hidden = false; hint.textContent = tr('Rien n’a été enregistré.'); }
    }
    await S.q.idle();
  }
  selA.onchange = () => { S.devs.a = selA.value; prep(); }; selV.onchange = () => { S.devs.v = selV.value; prep(); };
  modeV.onchange = modeA.onchange = () => { prep(); };

  w = win(O.title, 'video', [
    screen, fxWrap, lvl, msg, fmt,
    el('div', { className: 'row' }, el('label', { className: 'row tight' }, modeV, el('span', { textContent: 'Vidéo et voix (webcam + micro)' })), el('label', { className: 'row tight' }, modeA, el('span', { textContent: 'Voix seulement (micro)' }))),
    el('div', { className: 'row' }, startB, pauseB, stopB, photoB, clock, stat), lastBox,
    photoBox,
    el('label', { className: 'col' }, el('small', { className: 'mut', textContent: 'Micro' }), selA), el('label', { className: 'col' }, el('small', { className: 'mut', textContent: 'Caméra' }), selV),
    dest,
    el('small', { className: 'mut', textContent: 'Le fichier est enregistré par votre navigateur puis envoyé directement dans le cloud WebDAV choisi (rien ne passe par un autre serveur). Format MP4 quand le navigateur le permet. L’enregistrement reste en mémoire jusqu’à l’envoi.' })
  ], { w: 640, h: 640, cls: 'crecw', onclose: () => { S.dead = true; stopFx(); E.dispose(); if (S.state !== 'idle') { S.ending = true; clearInterval(S.t); if (S.rec && S.rec.state !== 'inactive') S.rec.stop(); else finish(); } else releaseStream(); if (S.url) URL.revokeObjectURL(S.url); CRECWIN = null; } });
  w.recKey = KEY; w.recOpts = o => { O = { ...O, ...o }; }; w.busy = () => S.state !== 'idle';
  CRECWIN = w; paint(); prep();
  return w;
}
