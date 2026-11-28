'use strict';
/* cast.js — bouton « Caster » : envoie ce qui joue sur une télévision, un Chromecast ou AirPlay (lecteur Vidéo, Musique, Sormick TV, Sormick Radio).
   Principe : l'API « Remote Playback » du navigateur (Chrome, Edge, Safari ; pas Firefox). La télévision va chercher elle-même le flux, puis les commandes du lecteur
   (lecture, pause, position, volume) la pilotent. Trois cas :
   - chaîne TV, radio : adresse internet directe, envoyée telle quelle (certains flux protégés ou sans autorisation CORS peuvent être refusés par la télévision) ;
   - fichier de votre CLOUD : la télévision ne peut pas envoyer de mot de passe. Le relais Cloudflare fabrique un LIEN TEMPORAIRE chiffré pour CE fichier
     (voir worker.js : « DIFFUSION »). Il faut un relais à jour avec son secret RELAY_TOKEN. Le lecteur utilise ce lien le temps de la diffusion, puis reprend sa source d'origine ;
   - fichier de CET APPAREIL : impossible (la télévision ne peut pas lire votre disque). On propose de diffuser l'onglet, ou de mettre le fichier dans le cloud.
   Sans API de diffusion (Firefox, navigateur de TV), on affiche l'aide « diffuser l'onglet ». */
const CAST = { link: new Map(), sup: { at: 0, ok: false, old: false } };
const castApi = m => !!m && ((m.remote && typeof m.remote.prompt === 'function') || typeof m.webkitShowPlaybackTargetPicker === 'function');
const castErr = code => Object.assign(new Error(code), { cast: code });
const CAST_MSG = {
  norelay: 'Pour diffuser un fichier du cloud sur une télévision, le relais Cloudflare est nécessaire (Stockages → Relais).',
  notoken: 'Pour diffuser un fichier du cloud, le relais doit avoir un jeton : définissez le secret RELAY_TOKEN dans Cloudflare puis saisissez-le dans Stockages → Relais.',
  castkey: 'Pour diffuser un fichier du cloud, le relais doit avoir un jeton : définissez le secret RELAY_TOKEN dans Cloudflare.',
  oldworker: 'Votre relais Cloudflare n’est pas à jour : collez la dernière version de worker.js dans Cloudflare puis « Deploy » (README, section Relais).',
  net: 'Le relais Cloudflare ne répond pas : impossible de préparer la diffusion.',
  local: 'Ce fichier est sur cet appareil : une télévision ne peut pas le lire. Mettez-le dans votre cloud, ou diffusez l’onglet entier.',
  direct: 'Cette adresse ne peut pas être diffusée sur une télévision.'
};
async function castSupport(rc) {   // le relais déployé sait-il fabriquer des liens ? (un ancien relais renverrait le fichier entier : on vérifie d'abord)
  if (Date.now() - CAST.sup.at < 300000) return CAST.sup;
  let r; try { r = await fetch(rc.url + '/?ping=1', { headers: { 'X-Relay-Token': rc.tok }, credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000) }); } catch { throw castErr('net'); }
  CAST.sup = { at: Date.now(), ok: !!r.headers.get('X-Relay-Cast'), old: !!r.headers.get('X-Relay-Ok') && !r.headers.get('X-Relay-Cast') };
  return CAST.sup;
}
async function castLink(t) {   // lien temporaire (chiffré) pour un fichier du cloud
  const key = t.c.id + '|' + t.path, hit = CAST.link.get(key);
  if (hit && hit.exp > Date.now() + 600000) return hit.url;
  const rc = relayCfg(); if (!relayOn()) throw castErr('norelay'); if (!rc.tok) throw castErr('notoken');
  const sp = await castSupport(rc); if (!sp.ok) throw castErr(sp.old ? 'castkey' : 'oldworker');
  let r; try { r = await fetch(rc.url + '/?cast=1&n=' + encodeURIComponent(t.name || 'media') + '&u=' + encodeURIComponent(davUrl(t.c, t.path)), { headers: { Authorization: authHeader(t.c), 'X-Relay-Token': rc.tok }, credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000) }); } catch { throw castErr('net'); }
  if (r.status === 501) throw castErr('castkey');
  if (!r.ok) throw castErr('net');
  let j; try { j = await r.json(); } catch { throw castErr('net'); }
  const u = String(j && j.url || ''); if (!u.startsWith(rc.url + '/cast/')) throw castErr('net');
  CAST.link.set(key, { url: u, exp: Date.now() + (+j.ttl || 21600) * 1000 });
  return u;
}
/* ---- Kit officiel Google Cast (Chrome / Edge sur ordinateur) ----
   L'API « Remote Playback » du navigateur ne voit pas toujours les Chromecast que le menu « Caster… » de Chrome affiche. Le kit officiel les trouve comme ce menu.
   Il est chargé SEULEMENT au premier clic sur « Caster » (script de www.gstatic.com, autorisé dans la CSP d'index.html) ; en cas d'échec, on retombe sur l'API du navigateur.
   Récepteur : application standard de Google (Default Media Receiver) : rien à installer sur la télévision. */
const CASTSDK = { st: 0, p: null, ctx: null, mirror: null };
const castSdkOk = () => /Chrome\/|Edg\//.test(navigator.userAgent) && !/Android|OPR\/|SamsungBrowser|Tizen|Web0S|SMART-TV|CrKey/i.test(navigator.userAgent) && typeof document !== 'undefined';
function castSdkLoad() {
  if (CASTSDK.st === 1) return Promise.resolve(true);
  if (CASTSDK.p) return CASTSDK.p;
  CASTSDK.p = new Promise(res => {
    let done = false, sc = null;
    const fin = ok => { if (done) return; done = true; CASTSDK.st = ok ? 1 : 0; if (!ok) { CASTSDK.p = null; try { sc && sc.remove(); } catch { /* rien */ } } res(ok); };
    window.__onGCastApiAvailable = ok => {
      if (!ok) return fin(false);
      try {
        const c = cast.framework.CastContext.getInstance();
        c.setOptions({ receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID, autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED, resumeSavedSession: false });
        CASTSDK.ctx = c; fin(true);
      } catch { fin(false); }
    };
    sc = document.createElement('script'); sc.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'; sc.async = true; sc.onerror = () => fin(false);
    document.head.appendChild(sc); setTimeout(() => fin(false), 9000);
  });
  return CASTSDK.p;
}
const castMime = (url, m, live) => {
  const e = (String(url).split(/[?#]/)[0].match(/\.([A-Za-z0-9]{2,5})$/) || [])[1];
  const T = { m3u8: 'application/x-mpegURL', m3u: 'application/x-mpegURL', mp3: 'audio/mpeg', aac: 'audio/aac', m4a: 'audio/mp4', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', ts: 'video/mp2t' };
  return (e && T[e.toLowerCase()]) || (m && m.tagName === 'AUDIO' ? 'audio/mpeg' : live ? 'application/x-mpegURL' : 'video/mp4');
};
function castSdkEnd() { const x = CASTSDK.mirror; CASTSDK.mirror = null; if (x) x.off(); }
/* Le lecteur local continue (SANS SON) pendant la diffusion : ses boutons, sa barre de position et son volume restent exacts et pilotent la télévision ;
   la télévision (ou le téléphone qui la commande) remet aussi le lecteur à jour. Fin de session : le son revient sur l'ordinateur à l'endroit où la télévision en était. */
function castSdkMirror(m, src, live) {
  const player = new cast.framework.RemotePlayer(), ctl = new cast.framework.RemotePlayerController(player), T = cast.framework.RemotePlayerEventType;
  const local = m.currentSrc, prevMuted = m.muted;
  let g = 0; const guard = f => { g++; try { f(); } catch { /* rien */ } setTimeout(() => { g--; }, 450); };   // nos propres gestes ne repartent pas vers la télévision
  guard(() => { m.muted = true; });
  const L = {
    play: () => { if (!g && player.isPaused) ctl.playOrPause(); },
    pause: () => { if (!g && !m.ended && !player.isPaused) ctl.playOrPause(); },
    volumechange: () => { if (g) return; if (!m.muted) { player.volumeLevel = m.volume; ctl.setVolumeLevel(); guard(() => { m.muted = true; }); } else if (m.volume !== player.volumeLevel && m.volume > 0) { player.volumeLevel = m.volume; ctl.setVolumeLevel(); } },
    seeked: () => { if (g || live || !isFinite(m.duration)) return; player.currentTime = m.currentTime; ctl.seek(); },
    loadstart: () => { if (m.currentSrc !== local && !CASTSDK.ending) { try { CASTSDK.ctx.endCurrentSession(true); } catch { /* rien */ } } }
  };
  const onTime = () => { if (!live && isFinite(m.duration) && Math.abs(m.currentTime - player.currentTime) > 2) guard(() => { m.currentTime = player.currentTime; }); };
  const onPause = () => { if (m.paused !== player.isPaused && player.mediaInfo) guard(() => { if (player.isPaused) m.pause(); else m.play().catch(() => {}); }); };
  const onConn = () => { if (!player.isConnected) { castSdkEnd(); toast('Diffusion terminée.'); } };
  for (const k in L) m.addEventListener(k, L[k]);
  ctl.addEventListener(T.CURRENT_TIME_CHANGED, onTime); ctl.addEventListener(T.IS_PAUSED_CHANGED, onPause); ctl.addEventListener(T.IS_CONNECTED_CHANGED, onConn);
  CASTSDK.mirror = { m, src, off() {
    for (const k in L) m.removeEventListener(k, L[k]);
    try { ctl.removeEventListener(T.CURRENT_TIME_CHANGED, onTime); ctl.removeEventListener(T.IS_PAUSED_CHANGED, onPause); ctl.removeEventListener(T.IS_CONNECTED_CHANGED, onConn); } catch { /* rien */ }
    try { m.muted = prevMuted; } catch { /* rien */ }
  } };
}
/* Retourne true si le kit a pris la demande en charge (réussite ou message affiché), false s'il est indisponible : on essaie alors l'API du navigateur. */
async function castSdkStart(m, src, t) {
  const cur = CASTSDK.mirror;
  if (cur && cur.m === m && cur.src === src && CASTSDK.ctx && CASTSDK.ctx.getCurrentSession()) {   // 2e clic sur la même diffusion : on l'arrête
    CASTSDK.ending = true; try { CASTSDK.ctx.endCurrentSession(true); } catch { /* rien */ } CASTSDK.ending = false; castSdkEnd(); toast('Diffusion terminée.'); return true;
  }
  if (!(await castSdkLoad())) return false;
  const ctx = CASTSDK.ctx, bad = () => toastAct('Ce média ne peut pas être diffusé de cette façon (format, flux protégé ou adresse refusée).', 'Caster l’onglet', castHelp, 10000);
  let sess = ctx.getCurrentSession();
  if (!sess) {
    try { const r = await ctx.requestSession(); if (typeof r === 'string' && r) throw r; }
    catch (e) {
      const c = String(e && e.message || e || '');
      if (c === 'cancel' || c === 'receiver_unavailable' || c === 'timeout') {
        const st = ctx.getCastState && ctx.getCastState();
        if (c !== 'cancel' || /NO_DEVICES/i.test(String(st))) toastAct('Aucune télévision trouvée sur votre réseau Wi-Fi : vérifiez qu’elle est allumée et sur le même réseau que cet appareil.', 'Caster l’onglet', castHelp, 12000);
        return true;
      }
      if (/NotAllowed|user.?gesture|activation/i.test(c)) { toast('Le lien est prêt : cliquez une seconde fois sur Caster.', 6000); return true; }
      return false;
    }
    sess = ctx.getCurrentSession();
  }
  if (!sess) return true;
  const live = !(isFinite(m.duration) && m.duration > 0) || /\.m3u8?(\?|#|$)/i.test(src) || !!(t && t.url), was = m.currentTime || 0;
  const mi = new chrome.cast.media.MediaInfo(src, castMime(src, m, live));
  mi.streamType = live ? chrome.cast.media.StreamType.LIVE : chrome.cast.media.StreamType.BUFFERED;
  if (live) mi.duration = -1;   // flux continu (comme dans l'exemple officiel Google CastVideos)
  mi.metadata = new chrome.cast.media.GenericMediaMetadata(); mi.metadata.title = String((t && t.name) || document.title || 'sormick Cloud').slice(0, 120);
  const rq = new chrome.cast.media.LoadRequest(mi); rq.autoplay = true; if (!live && was > 1) rq.currentTime = was;
  let err = ''; try { const r = await sess.loadMedia(rq); if (typeof r === 'string' && r) err = r; } catch (e) { err = String(e && e.message || e || 'erreur'); }
  if (err) { bad(); return true; }
  castSdkEnd(); castSdkMirror(m, src, live);
  try { if (m.paused) m.play().catch(() => {}); } catch { /* rien */ }   // le lecteur continue sans son (voir castSdkMirror) : le son sort de la télévision
  toast('Diffusion sur la télévision : les commandes du lecteur la pilotent.', 5000);
  return true;
}
async function castStart(m, t) {
  if (!m || !t) return toast('Lancez d’abord la lecture, puis cliquez sur Caster.');
  if (!castApi(m)) return castHelp();
  let src = '', swap = false;
  if (t.url) { src = String(t.url); if (!/^https?:\/\//i.test(src) || /^https?:\/\/(localhost|127\.|\[)/i.test(src)) return toast(CAST_MSG.direct, 6000); }
  else if (t.c && t.path) { try { src = await castLink(t); swap = true; } catch (e) { return toast(CAST_MSG[e.cast] || tr('Diffusion impossible :') + ' ' + (e.message || e), 9000); } }
  else return toastAct(CAST_MSG.local, 'Caster l’onglet', castHelp, 12000);
  if (castSdkOk()) { let h = false; try { h = await castSdkStart(m, src, t); } catch (e) { console.error(e); } if (h) return; }   // kit Google Cast (Chrome / Edge) ; sinon API du navigateur ci-dessous
  if (!m.isConnected) { m.style.display = 'none'; document.body.appendChild(m); }   // la lecture audio seule (Musique) doit être dans la page pour être diffusée
  const was = { src: m.currentSrc || m.src || '', t: m.currentTime || 0, play: !m.paused };
  const back = () => {   // reprend la source d'origine à l'endroit où la télévision en était
    if (!swap || !was.src) return; const pos = m.currentTime || was.t, go = !m.paused; m.pause(); m.src = was.src;
    m.addEventListener('loadedmetadata', () => { try { m.currentTime = pos; } catch { /* flux sans position */ } if (go) m.play().catch(() => {}); }, { once: true }); m.load();
  };
  if (swap) { m.pause(); m.src = src; m.addEventListener('loadedmetadata', () => { try { m.currentTime = was.t; } catch { /* flux sans position */ } }, { once: true }); m.load(); }
  m.disableRemotePlayback = false;
  let tp = 0, avail = null, wid;   // avail : le navigateur voit-il au moins un appareil de diffusion ? (true / false ; null = inconnu)
  try {
    if (m.remote && typeof m.remote.prompt === 'function') {
      const rp = m.remote;
      rp.addEventListener('disconnect', () => { toast('Diffusion terminée.'); back(); }, { once: true });
      try { rp.watchAvailability(a => { avail = a; }).then(i => { wid = i; }, () => {}); } catch { /* surveillance indisponible : on se contentera de la fenêtre du navigateur */ }
      tp = performance.now(); await rp.prompt();
      toast('Diffusion sur la télévision : les commandes du lecteur la pilotent.', 5000);
      if (swap && was.play) m.play().catch(() => {});
    } else { m.webkitShowPlaybackTargetPicker(); if (swap && was.play) m.play().catch(() => {}); }
  } catch (e) {
    back();
    try { if (wid != null) m.remote.cancelWatchAvailability(wid); } catch { /* rien */ }
    const n = e && e.name;
    if (n === 'NotFoundError') return toast('Aucune télévision trouvée sur votre réseau Wi-Fi : vérifiez qu’elle est allumée et sur le même réseau que cet appareil.', 8000);
    if (n === 'NotSupportedError' || n === 'InvalidStateError') return toastAct('Ce média ne peut pas être diffusé de cette façon (format, flux protégé ou adresse refusée).', 'Caster l’onglet', castHelp, 10000);
    if (n === 'NotAllowedError' && avail !== true && !(swap && tp && performance.now() - tp < 300))   // fenêtre fermée alors que le navigateur ne voyait aucun appareil : on l'explique au lieu de rester muet
      return toastAct('Aucune télévision trouvée sur votre réseau Wi-Fi : vérifiez qu’elle est allumée et sur le même réseau que cet appareil.', 'Caster l’onglet', castHelp, 12000);
    if (n === 'NotAllowedError' && swap && tp && performance.now() - tp < 300) toast('Le lien est prêt : cliquez une seconde fois sur Caster.', 6000);   // le navigateur exige un clic récent ; sinon : fenêtre de choix simplement fermée
  }
}
const castBtn = (getEl, getTrack) => btn('Caster', 'cast', () => castStart(getEl && getEl(), getTrack && getTrack()), '', 'Caster : envoyer la lecture sur une télévision, un Chromecast ou AirPlay');
