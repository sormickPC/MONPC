'use strict';
/* sormick Cloud — sauvegarde et restauration du compte dans VOTRE cloud WebDAV (aucun serveur de ce site).
   Dossier « sormick-cloud » du lecteur choisi, deux fichiers par utilisateur :
   - sormick-<id>.profil.json : profil CHIFFRÉ (mot de passe de l'utilisateur) + catalogue de l'App Store (en clair) + avatar + nom ;
   - sormick-<id>.media.json  : miniatures de la playlist + PDF du tutoriel (en clair).
   Le fond d'écran personnalisé, la playlist (liens), les connexions, les Post-it… sont dans le profil chiffré.
   Dernière sauvegarde = la bonne : pas de fusion entre deux ordinateurs. */
const BK_DIR = '/sormick-cloud';
const BK = { running: false, since: 0, timer: 0, due: 0, skip: false, dirty: false, again: false, err: '', err2: '', shown: '', dismissed: '', media: true };
const BK_DIR2 = '/sormick-cloud-secours';   // copie de secours dans le même cloud, quand aucun autre cloud n'est connecté
const bkFile = (id, media, dir = BK_DIR) => dir + '/sormick-' + id + (media ? '.media.json' : '.profil.json');
/* Copie de secours : après chaque sauvegarde réussie, les mêmes fichiers sont aussi envoyés ailleurs.
   Réglage D.sync.cid2 : '' = automatique (un AUTRE cloud connecté s'il y en a un, sinon le dossier « sormick-cloud-secours » du même cloud), 'none' = aucune, ou l'identifiant d'un cloud. */
function bkCopyTarget(c) {
  const pick = D.sync.cid2 || '';
  if (!c || pick === 'none') return null;
  const other = pick ? D.conns.find(x => x.id === pick && x.id !== c.id) : D.conns.find(x => x.id !== c.id);
  return other ? { c: other, dir: BK_DIR, same: false } : { c, dir: BK_DIR2, same: true };
}
const bkWhere = tg => tg.same ? 'dossier « sormick-cloud-secours » du même cloud' : 'cloud « ' + (tg.c.name || hostOf(tg.c.url)) + ' »';
async function bkPut(tg, id, blob, media) {   // écrit un fichier de la copie de secours et vérifie qu'il est bien rangé
  const name = bkFile(id, media, tg.dir).split('/').pop();
  await FS.write(tg.c, bkFile(id, media, tg.dir), blob);
  let ls = null; try { ls = await FS.list(tg.c, tg.dir); } catch { /* pas de contrôle possible */ }
  if (ls && !ls.some(x => x.name === name && !x.dir)) throw new Error('« ' + name + ' » n’apparaît pas dans la copie de secours (' + bkWhere(tg) + ')');
}
async function bkCopy(c, id, profBlob, mediaBlob) {
  const tg = bkCopyTarget(c); if (!tg) return '';
  try {
    try { await FS.mkdir(tg.c, tg.dir); } catch (e) { if (!/existe déjà/.test(e.message)) throw e; }
    await bkPut(tg, id, profBlob, false); if (mediaBlob) await bkPut(tg, id, mediaBlob, true);
    return '';
  } catch (e) { return e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'le cloud de secours ne répond pas (délai dépassé)' : String(e && e.message || e).replace(/\.$/, ''); }
}
const bkConn = () => (D && D.sync && D.conns.find(c => c.id === D.sync.cid)) || null;
/* « Modifié depuis la dernière sauvegarde » est mémorisé sur cet appareil : une sauvegarde ratée, ou un onglet fermé avant la fin du délai, est rattrapée à la connexion suivante */
const bkKey = () => 'vd2.bkdirty.' + (SESSION ? SESSION.user.id : '');
const bkSetDirty = v => { BK.dirty = v; try { if (v) localStorage.setItem(bkKey(), '1'); else localStorage.removeItem(bkKey()); } catch { /* facultatif */ } };
/* Empreinte des données locales du profil (profil chiffré + raccourcis) au moment de la dernière sauvegarde réussie : à la connexion, si elle diffère
   (ou n'existe pas encore), des modifications n'ont pas été envoyées : sauvegarde de rattrapage quelques secondes plus tard. */
const bkSigKey = () => 'vd2.bksig.' + (SESSION ? SESSION.user.id : '');
const bkSig = () => { try { const id = SESSION.user.id; let h = 5381; for (const k of [UKEY(id), AKEY(id), SKEY(id)]) { const v = localStorage.getItem(k) || ''; for (let i = 0; i < v.length; i++) h = (h * 33 ^ v.charCodeAt(i)) | 0; h = (h * 33 ^ v.length) | 0; } return String(h); } catch { return ''; } };
const bkLoad = () => {
  BK.dismissed = ''; BK.err2 = ''; clearTimeout(BK.timer); BK.due = 0; BK.err = ''; BK.shown = ''; BK.again = false;
  try { BK.dirty = localStorage.getItem(bkKey()) === '1' || localStorage.getItem(bkSigKey()) !== bkSig(); if (BK.dirty) localStorage.setItem(bkKey(), '1'); } catch { BK.dirty = false; }
  if (BK.dirty && D && D.sync && D.sync.auto && bkConn() && !pendingPull(SESSION.user.id)) bkSchedule(20000);
};
const bkSchedule = ms => { clearTimeout(BK.timer); BK.due = Date.now() + ms; BK.timer = setTimeout(() => backupNow(true), ms); };
/* Alerte bien visible : bandeau rouge persistant en haut de l'écran (tant que le problème n'est pas réglé), bouton de la barre qui clignote, ⚠ dans l'onglet du navigateur */
const BK_TITLE = document.title;
function bkAlertText() {
  if (!SESSION || !D || !D.sync || !bkConn()) return null;
  if (BK.err) return { hard: true, title: 'Vos données ne sont PAS sauvegardées', msg: BK.err + (D.sync.auto && !/suspendues/.test(BK.err) ? ' — nouvel essai automatique dans 5 minutes.' : '') };
  if (BK.err2) return { hard: false, title: 'La copie de secours a échoué', msg: BK.err2 };
  const h = (Date.now() - (D.sync.last || 0)) / 36e5;   // sauvegarde automatique activée mais rien d'envoyé depuis longtemps (par exemple un minuteur bloqué)
  if (D.sync.auto && BK.dirty && D.sync.last && h > 6 && !BK.running) return { hard: true, title: 'Aucune sauvegarde depuis ' + Math.floor(h) + ' h', msg: 'La sauvegarde automatique est activée mais n’a rien envoyé : cliquez sur « Réessayer maintenant ».' };
  return null;
}
function bkBanner() {
  let b = document.getElementById('bk-alert'); const a = bkAlertText(), key = a ? a.title + a.msg : '';
  if (!a || BK.dismissed === key) { if (b) b.remove(); document.title = BK_TITLE; return; }
  document.title = '⚠ ' + BK_TITLE;
  if (b && b.dataset.key === key) return;
  if (!b) { b = el('div', { id: 'bk-alert', role: 'alert' }); document.body.append(b); }
  b.dataset.key = key; b.className = a.hard ? '' : 'soft';
  b.replaceChildren(
    el('span', { className: 'bk-ic', textContent: '⚠', 'aria-hidden': 'true' }),
    el('div', { className: 'bk-tx' }, el('b', { textContent: a.title }), el('small', { textContent: a.msg })),
    el('div', { className: 'bk-bt' },
      btn('Réessayer maintenant', 'upload', async () => { await backupNow(false); bkStatus(); }, 'pri', 'Réessayer la sauvegarde maintenant'),
      btn('Mon compte', 'cloud', () => { const m = document.getElementById('me'); if (m) m.click(); setTimeout(() => { if (BK.open) BK.open(); }, 500); }, '', 'Ouvrir Mon compte : réglages de la sauvegarde'),
      el('button', { type: 'button', className: 'bk-x', title: 'Masquer cette alerte (elle reviendra si le problème change)', 'aria-label': 'Masquer l’alerte de sauvegarde', textContent: '×', onclick: () => { BK.dismissed = key; bkBanner(); } })));
}
const bkStatus = () => { try { if (BK.info) BK.info(); const b = document.getElementById('bk-save'); if (b) b.classList.toggle('warn', !!BK.err || !!bkAlertText()); bkBanner(); } catch { /* fenêtre fermée */ } };
const bkStuck = () => BK.running && Date.now() - BK.since > 600000;   // une sauvegarde figée depuis plus de 10 minutes est abandonnée

onDirty = () => {
  if (BK.skip || !D || !D.sync || !SESSION) return;
  if (BK.running) { BK.again = true; return; }   // modification pendant une sauvegarde : une autre suivra
  bkSetDirty(true);
  if (!D.sync.auto || !bkConn()) return;
  bkSchedule(60000);   // 1 minute après la dernière modification
};

async function backupNow(quiet) {
  const c = bkConn();
  if (!c) { if (!quiet) toast('Choisissez d’abord le lecteur WebDAV de sauvegarde.'); return false; }
  if (pendingPull(SESSION.user.id)) { BK.err = 'sauvegardes suspendues : récupérez d’abord vos données depuis le cloud (Mon compte → Sauvegarde dans mon cloud)'; bkStatus(); if (!quiet) toast('Récupérez d’abord vos données depuis le cloud (ou choisissez de les ignorer) : une sauvegarde maintenant écraserait ceux du cloud.', 8000); return false; }   // protège la sauvegarde existante
  if (BK.running && !bkStuck()) return false;
  BK.running = true; BK.since = Date.now(); BK.again = false; clearTimeout(BK.timer); BK.due = 0;
  const t = quiet ? null : toast('Sauvegarde dans votre cloud…', 0);
  try {
    await flush();
    try { await FS.mkdir(c, BK_DIR); } catch (e) { if (!/existe déjà/.test(e.message)) throw e; }
    const id = SESSION.user.id;
    const profBlob = new Blob([await exportProfile(false)], { type: 'application/json' }); let mediaBlob = null;
    await FS.write(c, bkFile(id), profBlob);
    if (BK.media || !quiet) {
      mediaBlob = new Blob([JSON.stringify({ format: 'sormick-media', v: 1, id, media: await exportMedia() })], { type: 'application/json' });
      await FS.write(c, bkFile(id, true), mediaBlob); BK.media = false;
    }
    // contrôle : le serveur a pu répondre « OK » sans ranger le fichier (mauvais dossier de départ, droits…) ; on vérifie qu'il est bien dans le dossier
    let ls = null; try { ls = await FS.list(c, BK_DIR); } catch { /* serveur qui ne sait pas lister : pas de contrôle possible */ }
    if (ls) {
      const need = [bkFile(id).split('/').pop()], miss = need.filter(n => !ls.some(x => x.name === n && !x.dir));
      if (miss.length) throw new Error('le cloud a répondu « OK » mais le fichier « ' + miss[0] + ' » n’apparaît pas dans le dossier « sormick-cloud » du lecteur « ' + (c.name || hostOf(c.url)) + ' »' + (c.base ? ' (dossier de départ « ' + c.base + ' »)' : ''));
    }
    D.sync.last = Date.now(); BK.skip = true; save(); BK.skip = false; BK.err = ''; BK.shown = '';
    BK.err2 = await bkCopy(c, id, profBlob, mediaBlob);   // copie de secours : son échec n'annule pas la sauvegarde, mais il est signalé
    if (BK.err2 && !quiet) toast('Sauvegarde faite, mais la copie de secours a échoué : ' + BK.err2, 8000);
    await flush(); try { localStorage.setItem(bkSigKey(), bkSig()); } catch { /* facultatif */ }
    if (BK.again) { bkSetDirty(true); if (D.sync.auto) bkSchedule(60000); } else bkSetDirty(false);
    if (t) t.close(); if (!quiet) toast('Sauvegarde terminée.'); bkStatus();
    return true;
  } catch (e) {
    if (t) t.close(); bkSetDirty(true);
    BK.err = e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'le cloud ne répond pas (délai dépassé)' : String(e && e.message || e).replace(/\.$/, '');
    if (!quiet || BK.shown !== BK.err) toast('Sauvegarde impossible : ' + BK.err + (quiet && D.sync.auto ? '. Nouvel essai automatique dans 5 minutes.' : ''), 8000);
    BK.shown = BK.err; if (D.sync.auto && bkConn()) bkSchedule(300000);
    bkStatus(); return false;
  }
  finally { BK.running = false; BK.skip = false; }
}
/* Filet de sécurité : si le minuteur a été perdu (veille de l'ordinateur, onglet figé) ou si une sauvegarde est restée bloquée, on reprend ici */
setInterval(() => {
  if (SESSION && D && D.sync) bkStatus();
  if (!SESSION || !D || !D.sync || !D.sync.auto || !bkConn() || !BK.dirty || pendingPull(SESSION.user.id)) return;
  if (BK.running ? bkStuck() : Date.now() > BK.due + 30000) backupNow(true);
}, 60000);

/* Réglage dans « Mon compte » */
function syncBox() {
  const sel = el('select', { 'aria-label': 'Lecteur de sauvegarde' }), auto = el('input', { type: 'checkbox', checked: !!D.sync.auto }), st = el('small', { className: 'mut' });
  opts(sel, [['', 'Aucun (pas de sauvegarde)'], ...D.conns.map(c => [c.id, (c.name || hostOf(c.url)) + ' — ' + c.user])]); sel.value = D.sync.cid;
  const info = () => {
    st.textContent = (D.sync.last ? 'Dernière sauvegarde : ' + new Date(D.sync.last).toLocaleString('fr-FR') : 'Aucune sauvegarde pour le moment.') + (BK.err ? ' — dernier essai échoué : ' + BK.err + (D.sync.auto ? ' (nouvel essai automatique dans quelques minutes).' : '.') : D.sync.last ? (BK.dirty ? ' — des modifications ne sont pas encore sauvegardées.' : ' — tout est à jour.') : '') + (BK.err2 ? ' Copie de secours échouée : ' + BK.err2 + '.' : '') + (bkConn() && bkCopyTarget(bkConn()) && !BK.err2 && D.sync.last ? ' Copie de secours : ' + bkWhere(bkCopyTarget(bkConn())) + '.' : '') + (bkConn() ? ' Dossier : « sormick-cloud » ' + (bkConn().base ? 'dans « ' + bkConn().base + ' »' : 'à la racine du lecteur') + '.' : '') + ' (version ' + (((document.querySelector('script[src*="app.js"]') || {}).src || '?').replace(/^.*\?v=/, '')) + ')';
    st.style.color = BK.err ? '#fca5a5' : '';
  };
  const sel2 = el('select', { 'aria-label': 'Copie de secours' });
  const fill2 = () => { opts(sel2, [['', 'Automatique (un autre cloud connecté, sinon un autre dossier du même cloud)'], ['none', 'Aucune copie de secours'], ...D.conns.filter(c => c.id !== D.sync.cid).map(c => [c.id, (c.name || hostOf(c.url)) + ' — ' + c.user])]); sel2.value = [...sel2.options].some(o => o.value === (D.sync.cid2 || '')) ? (D.sync.cid2 || '') : ''; };
  fill2(); sel2.onchange = () => { D.sync.cid2 = sel2.value; save(); info(); };
  sel.onchange = async () => { D.sync.cid = sel.value; fill2(); save(); if (sel.value && pendingPull(SESSION.user.id)) { await startIfEmpty(); info(); } };
  auto.onchange = () => { D.sync.auto = auto.checked; save(); };
  info(); BK.info = info;
  const det = el('details', { className: 'frm' }, el('summary', { textContent: 'Sauvegarde dans mon cloud (autres ordinateurs)' }), el('div', { className: 'col' },
    el('small', { className: 'mut', textContent: 'Pour retrouver votre compte sur un autre ordinateur : choisissez un de vos lecteurs WebDAV, puis utilisez le bouton « Sauvegarder maintenant dans mon cloud » (ci-dessous). Un dossier « sormick-cloud » y est créé.' }),
    el('label', { className: 'fld' }, el('span', { textContent: 'Lecteur WebDAV de sauvegarde' }), sel),
    el('label', { className: 'fld' }, el('span', { textContent: 'Copie de secours (envoyée aussi après chaque sauvegarde, au cas où le dossier principal serait vide ou effacé)' }), sel2),
    el('label', { className: 'row tight' }, auto, el('span', { textContent: 'Sauvegarde automatique (1 minute après une modification, et au verrouillage)' })),
    st,
    btn('Récupérer mes données depuis le cloud', 'download', async () => { if (await pullFromCloud()) info(); }, '', 'Ajouter à ce profil les données sauvegardées dans le cloud choisi : post-it, playlist, raccourcis, miniatures, PDF du tutoriel, clouds'),
    ...(pendingPull(SESSION.user.id) ? [el('small', { className: 'mut', textContent: 'Profil importé : sauvegardes suspendues tant que vous n’avez pas récupéré vos données (raccourcis, miniatures, PDF, post-it et playlist plus récents…).' }), btn('Ignorer et reprendre les sauvegardes', 'x', async () => { if (await confirmBox('Les prochaines sauvegardes remplaceront les données du cloud (raccourcis, miniatures, et tout ce qui est plus récent) par celles de cet ordinateur (qui n’ont pas été récupérées). Continuer ?', 'Ignorer', true)) { setPending(SESSION.user.id, false); toast('Sauvegardes réactivées.'); } }, 'dng')] : []),
    el('small', { className: 'mut', textContent: 'Votre profil (bureau, connexions, playlist, fond d’écran personnalisé…) reste chiffré avec votre mot de passe. Sont enregistrés EN CLAIR : votre catalogue de raccourcis, votre nom et avatar, les miniatures de la playlist et le PDF du tutoriel. Une sauvegarde remplace la précédente dans le cloud ; « Récupérer mes données » fusionne le cloud dans ce profil sans rien supprimer (post-it, playlists, clouds et raccourcis manquants sont ajoutés).' })));
  BK.open = () => { det.open = true; sel.focus(); };
  return det;
}

/* Écran de connexion : restaurer depuis le cloud */
async function restoreDlg() {
  const r = await dialog('Restaurer depuis mon cloud', [
    { k: 'url', label: 'Adresse du serveur WebDAV', req: true, max: 500, ph: 'cloud.exemple.com/dav' },
    { k: 'user', label: 'Nom d’utilisateur', req: true, max: 200 }, { k: 'pass', label: 'Mot de passe du cloud', type: 'password', req: true, max: 500 },
    { k: 'base', label: 'Dossier de départ du lecteur (facultatif)', max: 300 },
    { k: 'ru', label: 'Adresse du relais (facultatif : seulement si le serveur refuse l’accès direct)', max: 300 }, { k: 'rt', label: 'Jeton du relais (facultatif)', type: 'password', max: 300 }],
    'Chercher mes profils', { note: 'Saisissez les accès du cloud où se trouve votre dossier « sormick-cloud » (créé par « Sauvegarder maintenant »). Ils ne sont utilisés que pour cette restauration.' });
  if (!r) return;
  let u = r.url.trim(); if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = (/^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(u) ? 'http://' : 'https://') + u;
  if (!httpUrl(u)) return toast('Adresse du serveur invalide.');
  return restoreFrom({ url: u, user: r.user.trim(), pass: r.pass, base: r.base.trim() }, r.ru.trim().replace(/\/+$/, ''), r.rt);
}

/* Cherche et restaure les profils sauvegardés (accès saisis à l’écran de connexion) */
async function restoreFrom(cd, ru, rt) {
  const prevD = D, t = toast('Recherche de vos sauvegardes…', 0);
  D = { proxy: '', ptoken: '', conns: [], lock: 0, relay: { url: ru, tok: rt } };   // contexte provisoire (aucun profil n'est ouvert)
  try {
    const c = { id: uid(), type: 'dav', name: '', url: cd.url, user: cd.user, pass: cd.pass, base: cd.base, site: '' };
    let files; try { files = await FS.list(c, BK_DIR); } catch (e) { if (e.code === 'path') files = []; else throw e; }
    files = files.filter(f => !f.dir && /^sormick-[A-Za-z0-9_-]{1,64}\.profil\.json$/.test(f.name));
    const found = [];
    for (const f of files) {
      try { const text = await (await FS.read(c, BK_DIR + '/' + f.name, 'application/json')).text(), o = JSON.parse(text); if (o && o.format === 'sormick-profile' && typeof o.name === 'string') found.push({ o, text }); } catch { /* fichier illisible : ignoré */ }
    }
    if (!found.length) throw new Error('Aucune sauvegarde trouvée dans le dossier « sormick-cloud » de ce cloud.');
    t.close();
    let pick = found[0];
    if (found.length > 1) {
      const s = await dialog('Quel profil restaurer ?', [{ k: 'p', label: 'Profil', type: 'select', options: found.map((x, i) => [String(i), str(x.o.name, 24)]) }], 'Restaurer');
      if (!s) return; pick = found[+s.p];
    }
    const t2 = toast('Restauration…', 0);
    try {
      const id = await importProfile(pick.text);
      try { const mo = JSON.parse(await (await FS.read(c, bkFile(id, true), 'application/json')).text()); if (mo && mo.format === 'sormick-media' && mo.id === id) await importMedia(id, mo.media); } catch { /* pas de miniatures sauvegardées */ }
      t2.close(); toast('Profil restauré : saisissez son mot de passe.', 6000); D = null; showLogin(id);
    } catch (e) { t2.close(); throw e; }
  } catch (e) { t.close(); toast(/existe déjà/.test(e.message) ? 'Ce profil existe déjà sur cet appareil : connectez-vous simplement avec son mot de passe.' : e.message, 7000); }
  finally { D = prevD; }
}

/* Récupérer, depuis le cloud déjà connecté, les raccourcis, miniatures et PDF d'un profil importé (le profil n'est pas touché) */
/* Données du profil sauvegardé dans le cloud (post-it, playlists, clouds, réglages…) : lisibles avec la clé du profil ouvert si le mot de passe n'a pas changé
   depuis la sauvegarde, sinon avec le mot de passe qu'on redemande. Renvoie null si on ne peut pas les lire (rien n'est alors modifié). */
async function cloudProfileData(po) {
  const u = SESSION.user;
  try {
    if (po.salt === u.salt && po.iter === u.iter) return normUser(await unseal(SESSION.key, po.blob, u.id));
    if (typeof po.salt !== 'string' || !Number.isInteger(po.iter) || po.iter < 1e5 || po.iter > 5e6) return null;
    const r = await dialog('Sauvegarde du cloud : mot de passe du profil', [{ k: 'pw', label: 'Mot de passe du profil au moment de la sauvegarde', type: 'password', req: true, max: 500 }], 'Continuer',
      { note: 'La sauvegarde du cloud a été faite avec un autre mot de passe de profil (il a été changé depuis). Saisissez celui-là pour récupérer aussi vos post-it, playlists et réglages ; sinon, annulez : seuls raccourcis, miniatures et PDF seront récupérés.' });
    if (!r) return null;
    return normUser(await unseal(await deriveKey(r.pw, b64d(po.salt), po.iter), po.blob, u.id));
  } catch { toast('Les données du profil sauvegardé dans le cloud n’ont pas pu être lues (mot de passe différent) : post-it et réglages non récupérés.', 8000); return null; }
}
/* Fusion SANS rien supprimer : on ajoute ce qui manque dans ce profil ; pour un post-it présent des deux côtés, le plus récent l'emporte. Renvoie le nombre d'éléments ajoutés ou mis à jour. */
function mergeCloudData(c) {
  let n = 0; const has = (list, f) => list.some(f);
  const byId = new Map(D.notes.map(x => [x.id, x]));
  for (const x of c.notes || []) { const l = byId.get(x.id); if (!l) { D.notes.push(x); n++; } else if ((x.t || 0) > (l.t || 0)) { Object.assign(l, x); n++; } }
  D.notes.sort((a, b) => (b.t || 0) - (a.t || 0)); D.notes = D.notes.slice(0, 300);
  let pins = 0; for (const x of D.notes) if (x.pin) { if (pins < 5) pins++; else x.pin = false; }
  for (const x of c.vp || []) if (D.vp.length < 5000 && !has(D.vp, y => y.id === x.id)) { D.vp.push(x); n++; }
  for (const k of Object.keys(c.pl || {})) {
    if (!(k in D.pl)) { D.pl[k] = c.pl[k]; n++; continue; }
    for (const t of c.pl[k]) if (D.pl[k].length < 2000 && !has(D.pl[k], y => y.cid === t.cid && y.path === t.path)) { D.pl[k].push(t); n++; }
  }
  for (const k of Object.keys(c.docs || {})) if (!(k in D.docs)) { D.docs[k] = c.docs[k]; n++; }
  for (const x of c.conns || []) if (D.conns.length < 50 && !has(D.conns, y => y.id === x.id)) { D.conns.push(x); n++; }
  if (!D.sync.cid && c.sync && c.sync.cid && D.conns.some(y => y.id === c.sync.cid)) { D.sync.cid = c.sync.cid; if (c.sync.auto) D.sync.auto = true; n++; }   // lecteur de sauvegarde choisi : retrouvé avec le profil
  for (const x of (c.radio && c.radio.mine) || []) if (D.radio.mine.length < 3000 && !has(D.radio.mine, y => y.id === x.id || y.url === x.url)) { D.radio.mine.push(x); n++; }
  for (const x of (c.tv && c.tv.lists) || []) if (D.tv.lists.length < 500 && !has(D.tv.lists, y => y.id === x.id || y.url === x.url)) { D.tv.lists.push(x); n++; }
  if (!D.tv.epg && c.tv && c.tv.epg) { D.tv.epg = c.tv.epg; n++; }
  for (const x of (c.tv && c.tv.epgs) || []) if (D.tv.epgs.length < 400 && !has(D.tv.epgs, y => y.id === x.id || y.url === x.url)) { D.tv.epgs.push(x); n++; }
  for (const x of (c.tv && c.tv.epgHide) || []) if (D.tv.epgHide.length < 400 && !D.tv.epgHide.includes(x)) { D.tv.epgHide.push(x); n++; }
  for (const x of (c.tv && c.tv.fav) || []) if (D.tv.fav.length < 3000 && !has(D.tv.fav, y => y.id === x.id || y.url === x.url)) { D.tv.fav.push(x); n++; }
  for (const k of Object.keys(D.rec)) if (!D.rec[k].cid && c.rec && c.rec[k] && c.rec[k].cid && D.conns.some(y => y.id === c.rec[k].cid)) { D.rec[k] = c.rec[k]; n++; }
  for (const k of Object.keys(c.covers || {})) if (!(k in D.covers) && Object.keys(D.covers).length < 3000) { D.covers[k] = c.covers[k]; n++; }
  for (const h of c.tabHosts || []) if (!(D.tabHosts || []).includes(h)) { (D.tabHosts = D.tabHosts || []).push(h); n++; }
  for (const x of c.desk || []) if (!D.desk.includes(x) && D.desk.length < 300) D.desk.push(x);
  if (Array.isArray(c.startPins)) { D.startPins = c.startPins.slice(0, 200); n++; }   // menu Démarrer : le cloud fait foi (épinglée = reste épinglée, retirée = reste retirée)
  if (!D.relay.url && c.relay && c.relay.url) { D.relay = c.relay; n++; }
  if ((!D.os || !D.os.key) && c.os && c.os.key) { D.os = c.os; n++; }
  if (D.wp.t === 'd' && c.wp && c.wp.t !== 'd') { D.wp = c.wp; n++; }
  if (!D.tuto && c.tuto) { D.tuto = c.tuto; n++; }
  if (!D.proxy && c.proxy) { D.proxy = c.proxy; D.ptoken = c.ptoken; }
  save(); return n;
}
async function pullFromCloud() {
  const c = bkConn(); if (!c) return toast('Choisissez d’abord le lecteur de sauvegarde dans « Sauvegarde dans mon cloud ».', 6000);
  const id = SESSION.user.id, t = toast('Récupération depuis votre cloud…', 0);
  try {
    let po = null, mo = null, miss = 0, from = '';
    const readBoth = async (cc, dir) => {
      po = null; mo = null; miss = 0;
      try { po = JSON.parse(await (await FS.read(cc, bkFile(id, false, dir), 'application/json')).text()); } catch (e) { if (e.code === 'path') miss++; else throw e; }
      try { mo = JSON.parse(await (await FS.read(cc, bkFile(id, true, dir), 'application/json')).text()); } catch (e) { if (e.code === 'path') miss++; else if (!(e instanceof SyntaxError)) throw e; }
    };
    await readBoth(c, BK_DIR);
    if (miss === 2) { const tg = bkCopyTarget(c); if (tg) { try { await readBoth(tg.c, tg.dir); if (miss < 2) from = bkWhere(tg); } catch { miss = 2; } } }   // dossier principal vide : on cherche dans la copie de secours
    if (miss === 2) {   // rien à récupérer (dossier absent ou vide) et donc rien à protéger : les sauvegardes commencent
      t.close(); setPending(id, false); bkSetDirty(true); toast('Aucune sauvegarde de ce profil dans ce cloud (dossier absent ou vide) : rien à récupérer. La première sauvegarde démarre.', 6000);
      await backupNow(false); return true;
    }
    let n = 0, m = 0;
    if (po && po.format === 'sormick-profile' && po.id === id && typeof po.blob === 'string') {
      const cd = await cloudProfileData(po);
      if (cd) m = mergeCloudData(cd);
    }
    if (po && po.format === 'sormick-profile' && po.id === id && Array.isArray(po.apps)) {
      if (Array.isArray(po.store)) {   // sauvegarde récente : le cloud fait foi (installée = reste installée, désinstallée = reste désinstallée, retirée du catalogue = disparue partout)
        const before = new Set(G.apps.map(x => x.id));
        G.apps = cleanApps(po.apps); G.store = cleanApps(po.store);
        n = G.apps.filter(a => !before.has(a.id)).length;
        D.desk = D.desk.filter(x => appById(x));
      } else {   // anciennes sauvegardes (sans catalogue) : on ajoute seulement ce qui manque
        for (const a of cleanApps(po.apps)) if (!G.apps.some(x => x.id === a.id || (x.url === a.url && x.name === a.name))) { G.apps.push(a); n++; }
        for (const a of cleanApps(po.apps)) if (G.store.length < 500 && !G.store.some(x => x.id === a.id || (x.url === a.url && x.name === a.name))) G.store.push(a);
      }
      saveG();
    }
    if (mo && mo.format === 'sormick-media' && mo.id === id) await importMedia(id, mo.media);
    setPending(id, false); renderDesk(); applyWp(); renderPinned(); NOTES_DRAW(); if (VP.w && VP.render) VP.render(); t.close();
    toast((from ? 'Dossier principal vide : récupéré depuis la copie de secours (' + from + '). ' : '') + 'Récupéré : ' + n + ' raccourci' + (n > 1 ? 's' : '') + ', ' + m + ' autre' + (m > 1 ? 's' : '') + ' élément' + (m > 1 ? 's' : '') + ' (post-it, playlist, clouds, réglages…), miniatures et PDF du tutoriel. Les sauvegardes peuvent reprendre.', 9000); return true;
  } catch (e) { t.close(); toast('Récupération impossible : ' + (e.message || e), 7000); return false; }
}
/* Profil importé (sauvegardes suspendues) : si le cloud choisi n'a aucune sauvegarde de ce profil (dossier « sormick-cloud » absent ou sans fichier du profil),
   il n'y a rien à récupérer ni à écraser : on lève la suspension et la première sauvegarde démarre. true = c'est fait. */
async function cloudHasBackup(c, id) {   // true / false / null (impossible de savoir : le serveur n'a pas répondu comme prévu)
  try { const ls = await FS.list(c, BK_DIR), names = [bkFile(id).split('/').pop(), bkFile(id, true).split('/').pop()]; return ls.some(x => !x.dir && names.includes(x.name)); }
  catch (e) { return e && e.code === 'path' ? false : null; }
}
async function startIfEmpty() {
  const id = SESSION.user.id, c = bkConn(); if (!c || !pendingPull(id)) return false;
  if ((await cloudHasBackup(c, id)) !== false) return false;
  const tg = bkCopyTarget(c); if (tg) { try { const ls = await FS.list(tg.c, tg.dir); if (ls.some(x => !x.dir && x.name === bkFile(id).split('/').pop())) return false; } catch { /* copie absente : rien à proposer */ } }
  setPending(id, false); bkSetDirty(true);
  toast('Aucune sauvegarde de ce profil dans le cloud « ' + (c.name || hostOf(c.url)) + ' » (dossier absent ou vide) : les sauvegardes commencent.', 7000);
  await backupNow(false); return true;
}
async function offerPull() {
  if (!pendingPull(SESSION.user.id)) return;
  if (!bkConn()) return;   // aucun lecteur de sauvegarde dans ce profil : récupération manuelle possible plus tard
  if (await startIfEmpty()) return;
  const ok = await confirmBox('Ce profil a été importé depuis un fichier : récupérez aussi ce qui est plus récent dans votre sauvegarde (raccourcis de l’App Store, miniatures de playlist, PDF du tutoriel, et ce qui a été ajouté depuis l’export : post-it, playlist, clouds…). Votre cloud « ' + (bkConn().name || hostOf(bkConn().url)) + ' » est déjà connecté : voulez-vous les récupérer maintenant ?', 'Récupérer');
  if (ok) await pullFromCloud(); else toast('D’accord. Les sauvegardes automatiques sont suspendues tant que vous ne les avez pas récupérés : Mon compte → Sauvegarde dans mon cloud.', 8000);
}

/* Bouton « Sauvegarder maintenant » toujours visible dans Mon compte */
async function saveNowBtn() {
  if (!bkConn()) { if (BK.open) BK.open(); return toast('Choisissez d’abord le lecteur WebDAV de sauvegarde (liste ci-dessus).', 6000); }
  if (BK.running && !bkStuck()) return toast('Une sauvegarde est déjà en cours…');
  if (pendingPull(SESSION.user.id) && await startIfEmpty()) { bkStatus(); return; }
  if (D.sync.last && !BK.dirty && !BK.err && !pendingPull(SESSION.user.id)) {   // rien n'a changé depuis la dernière sauvegarde
    return toastAct('Déjà sauvegardé : aucune modification depuis la dernière sauvegarde (' + new Date(D.sync.last).toLocaleString('fr-FR') + ').', 'Sauvegarder quand même', async () => { await backupNow(false); bkStatus(); }, 8000);
  }
  await backupNow(false); bkStatus();
}
