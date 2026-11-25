'use strict';
/* recorder.js — application intégrée « Enregistreur d'écran ».
   Utilise l'API du navigateur getDisplayMedia (la fenêtre de partage du navigateur propose : onglet, fenêtre ou écran entier, avec le son de l'onglet / du système)
   et MediaRecorder. Rien ne passe par un serveur : la vidéo est envoyée directement vers le stockage WebDAV de votre choix (ou téléchargée).
   Option : microphone mélangé au son partagé, pause, découpage en plusieurs fichiers. Format : WebM (VP9/VP8 + Opus), lisible dans Chrome, Edge, Firefox, VLC. */

const SCR_MIMES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
function screenWin() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || typeof MediaRecorder === 'undefined')
    return dialog('Enregistreur d’écran', [], 'OK', { note: 'Ce navigateur ne permet pas la capture d’écran depuis un site web. Utilisez Chrome ou Edge (ordinateur).' });
  const S = { stream: null, rec: null, mix: null, state: 'idle', ending: false, secs: 0, t: 0, seg: 0, url: '', last: null, q: null, chunks: [], size: 0, parts: 0, partStart: 0, segT: 0 };
  const live = el('video', { muted: true, playsInline: true, controls: false, className: 'sc-video', 'aria-label': 'Aperçu' });
  const hint = el('div', { className: 'tv-msg', textContent: 'Cliquez sur « Démarrer », puis choisissez ce qu’il faut partager.' });
  const screen = el('div', { className: 'tv-screen sc-screen' }, live, hint);
  const src = el('select', { 'aria-label': 'Source proposée' }); opts(src, [['', 'Source : au choix dans la fenêtre du navigateur'], ['browser', 'Source proposée : un onglet'], ['window', 'Source proposée : une fenêtre'], ['monitor', 'Source proposée : l’écran entier']]);
  const sysA = el('input', { type: 'checkbox', checked: true, id: 'sa' + uid().slice(0, 6) }), micA = el('input', { type: 'checkbox', id: 'sm' + uid().slice(0, 6) });
  const qual = el('select', { 'aria-label': 'Qualité' }); opts(qual, [['2500000', 'Qualité normale (2,5 Mb/s)'], ['5000000', 'Qualité élevée (5 Mb/s)'], ['1200000', 'Fichier léger (1,2 Mb/s)']]);
  const fps = el('select', { 'aria-label': 'Images par seconde' }); opts(fps, [['30', '30 images/s'], ['15', '15 images/s'], ['60', '60 images/s']]);
  const clock = el('b', { className: 'sc-clock', textContent: '0:00' }), stat = el('small', { className: 'mut' });
  const startB = btn('Démarrer l’enregistrement', 'recdot', () => start(), 'pri sc-start'), pauseB = btn('Pause', 'pause', () => pause()), stopB = btn('Arrêter et enregistrer', 'stop', () => stop(), 'dng');
  pauseB.hidden = stopB.hidden = true;
  const lastBox = el('div', { className: 'row', hidden: true });
  const paint = () => { const on = S.state !== 'idle'; startB.hidden = on; pauseB.hidden = stopB.hidden = !on; { const t = S.state === 'paused' ? 'Reprendre' : 'Pause'; pauseB.lastChild.textContent = tr(t); pauseB.title = tr(t); pauseB.setAttribute('aria-label', tr(t)); } pauseB.firstChild.replaceWith(ico(S.state === 'paused' ? 'play' : 'pause', 16));
    for (const x of [src, sysA, micA, qual, fps]) x.disabled = on; };
  const tick = () => { if (S.state === 'rec') S.secs++; clock.textContent = fmtDur(S.secs); stat.textContent = S.state === 'idle' ? '' : (S.state === 'paused' ? 'En pause · ' : 'Enregistrement · ') + fmtSize(S.size) + ' en mémoire'; };
  const mime = SCR_MIMES.find(m => MediaRecorder.isTypeSupported(m)) || '';
  const extOf = () => /mp4/.test(mime) ? 'mp4' : 'webm';
  const newPart = () => {
    const r = new MediaRecorder(S.stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: +qual.value, audioBitsPerSecond: 128000 });
    S.rec = r; S.chunks = []; S.size = 0; S.partStart = Date.now(); S.segT = 0;
    r.ondataavailable = e => { if (e.data && e.data.size) { S.chunks.push(e.data); S.size += e.data.size; if (S.size > REC_MAXMEM * 2 && S.state === 'rec') rotate(); } };
    r.onstop = () => {
      const b = new Blob(S.chunks, { type: (mime || 'video/webm').split(';')[0] }); S.chunks = []; S.size = 0;
      if (b.size) { S.parts++; const multi = S.seg > 0 || S.parts > 1 || !S.ending; S.last = { blob: b, name: 'ecran_' + stamp(new Date(S.partStart)) + (multi ? '_p' + S.parts : '') + '.' + extOf() }; S.q.push(b, S.last.name); }
      if (!S.ending) newPart(); else finish();
    };
    r.start(1000);
  };
  const rotate = () => { if (S.rec && S.rec.state !== 'inactive') S.rec.stop(); };   // onstop envoie le fichier et en démarre un nouveau
  async function start() {
    let ds, mic = null;
    try {
      const v = { frameRate: +fps.value }; if (src.value) v.displaySurface = src.value;
      ds = await navigator.mediaDevices.getDisplayMedia({ video: v, audio: sysA.checked ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false, systemAudio: 'include', surfaceSwitching: 'include' });
    } catch (e) { return toast(e && e.name === 'NotAllowedError' ? 'Partage annulé ou refusé.' : 'Capture impossible : ' + (e && e.message || 'erreur'), 6000); }
    if (micA.checked) { try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { toast('Microphone refusé : l’enregistrement se fait sans micro.', 5000); } }
    if (sysA.checked && !ds.getAudioTracks().length) toast('Aucun son partagé : dans la fenêtre du navigateur, cochez « Partager aussi l’audio de l’onglet » (ou du système).', 8000);
    let tracks = [...ds.getVideoTracks()];
    const aud = [...ds.getAudioTracks(), ...(mic ? mic.getAudioTracks() : [])];
    if (aud.length > 1) {   // mélange son partagé + micro
      const ac = new AudioContext(), dest = ac.createMediaStreamDestination();
      for (const t of aud) ac.createMediaStreamSource(new MediaStream([t])).connect(dest);
      S.mix = { ac, mic }; tracks.push(...dest.stream.getAudioTracks());
    } else { tracks.push(...aud); if (mic) S.mix = { ac: null, mic }; }
    S.stream = new MediaStream(tracks); S.ds = ds;
    ds.getVideoTracks()[0].addEventListener('ended', () => { if (S.state !== 'idle') stop(); });
    live.srcObject = new MediaStream(ds.getVideoTracks()); live.play().catch(() => {}); hint.hidden = true;
    S.q = recQueue('screen', s => { stat.textContent = s.pending ? 'Envoi en cours (' + s.pending + ')…' : s.failed ? s.failed + ' fichier(s) non envoyé(s).' : s.sent ? s.sent + ' fichier(s) enregistré(s).' : ''; });
    S.state = 'rec'; S.ending = false; S.secs = 0; S.parts = 0; S.seg = D.rec.screen.seg; S.last = null; lastBox.hidden = true; lastBox.replaceChildren();
    newPart(); paint(); clearInterval(S.t); S.t = setInterval(() => { tick(); if (S.state === 'rec' && S.seg > 0 && ++S.segT >= S.seg * 60) { S.segT = 0; rotate(); } }, 1000); tick();
  }
  function pause() { if (!S.rec) return; if (S.state === 'rec') { S.rec.pause(); S.state = 'paused'; } else if (S.state === 'paused') { S.rec.resume(); S.state = 'rec'; } paint(); tick(); }
  function stop() { if (S.state === 'idle') return; S.ending = true; clearInterval(S.t); if (S.rec && S.rec.state !== 'inactive') S.rec.stop(); else finish(); }
  async function finish() {
    for (const t of S.stream ? S.stream.getTracks() : []) t.stop(); for (const t of S.ds ? S.ds.getTracks() : []) t.stop(); if (S.mix) { S.mix.mic && S.mix.mic.getTracks().forEach(t => t.stop()); S.mix.ac && S.mix.ac.close().catch(() => {}); S.mix = null; }
    live.srcObject = null; S.state = 'idle'; S.stream = S.ds = S.rec = null; paint(); tick(); clock.textContent = '0:00';
    if (!S.last) { hint.hidden = false; hint.textContent = 'Rien n’a été enregistré.'; return; }
    const l = S.last; if (S.url) URL.revokeObjectURL(S.url); S.url = URL.createObjectURL(l.blob);
    live.src = S.url; live.controls = true; live.muted = false; hint.hidden = true;
    lastBox.hidden = false; lastBox.replaceChildren(el('small', { className: 'mut', textContent: 'Dernier fichier : ' + l.name + ' (' + fmtSize(l.blob.size) + ')' }), btn('Télécharger sur l’appareil', 'download', () => download(l.blob, l.name)));
    await S.q.idle();
  }
  const w = win('Enregistreur d’écran', 'monitor', [
    el('div', { className: 'sc-head' }, el('span', { className: 'sc-logo', 'aria-hidden': 'true' }, ico('monitor', 26)), el('span', { className: 'tv-brand' }, el('b', { textContent: 'Enregistreur d’écran' }), el('span', { textContent: 'Écran, fenêtre ou onglet + son' }))),
    screen, el('div', { className: 'row' }, startB, pauseB, stopB, clock, stat), lastBox,
    el('div', { className: 'rd-filters' }, src, qual, fps), el('div', { className: 'row' }, el('label', { className: 'chk' }, sysA, el('span', { textContent: 'Son de l’onglet / du système' })), el('label', { className: 'chk' }, micA, el('span', { textContent: 'Microphone' }))),
    destBar('screen', segSelect('screen')),
    el('small', { className: 'mut', textContent: 'Pour enregistrer un onglet avec son : « Onglet Chrome » → choisissez l’onglet → cochez « Partager aussi l’audio de l’onglet ». Pour tout l’écran : « Écran entier » (le son du système n’est partagé que par Windows et ChromeOS). L’enregistrement reste en mémoire jusqu’à l’arrêt : pour les longues sessions, choisissez le découpage en plusieurs fichiers.' })],
    { w: 780, h: 700, cls: 'scw', onclose: () => { if (S.state !== 'idle') { S.ending = true; clearInterval(S.t); if (S.rec && S.rec.state !== 'inactive') S.rec.stop(); } if (S.url) URL.revokeObjectURL(S.url); } });
  return w;
}
