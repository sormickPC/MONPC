'use strict';
/* sormick Cloud — sauvegarde et restauration du compte dans VOTRE cloud WebDAV (aucun serveur de ce site).
   Dossier « sormick-cloud » du lecteur choisi, deux fichiers par utilisateur :
   - sormick-<id>.profil.json : profil CHIFFRÉ (mot de passe de l'utilisateur) + catalogue de l'App Store (en clair) + avatar + nom ;
   - sormick-<id>.media.json  : miniatures de la playlist + PDF du tutoriel (en clair).
   Le fond d'écran personnalisé, la playlist (liens), les connexions, les Post-it… sont dans le profil chiffré.
   Dernière sauvegarde = la bonne : pas de fusion entre deux ordinateurs. */
const BK_DIR = '/sormick-cloud';
const BK = { running: false, timer: 0, skip: false, dirty: false, media: true };
const bkFile = (id, media) => BK_DIR + '/sormick-' + id + (media ? '.media.json' : '.profil.json');
const bkConn = () => (D && D.sync && D.conns.find(c => c.id === D.sync.cid)) || null;

onDirty = () => {
  if (BK.skip || BK.running || !D || !D.sync) return;
  BK.dirty = true;
  if (!D.sync.auto || !bkConn()) return;
  clearTimeout(BK.timer); BK.timer = setTimeout(() => backupNow(true), 60000);   // 1 minute après la dernière modification
};

async function backupNow(quiet) {
  const c = bkConn();
  if (!c) { if (!quiet) toast('Choisissez d’abord le lecteur WebDAV de sauvegarde.'); return false; }
  if (pendingPull(SESSION.user.id)) { if (!quiet) toast('Récupérez d’abord vos données depuis le cloud (ou choisissez de les ignorer) : une sauvegarde maintenant écraserait ceux du cloud.', 8000); return false; }   // protège la sauvegarde existante
  if (BK.running) return false;
  BK.running = true; clearTimeout(BK.timer);
  const t = quiet ? null : toast('Sauvegarde dans votre cloud…', 0);
  try {
    await flush();
    try { await FS.mkdir(c, BK_DIR); } catch (e) { if (!/existe déjà/.test(e.message)) throw e; }
    const id = SESSION.user.id;
    await FS.write(c, bkFile(id), new Blob([await exportProfile(false)], { type: 'application/json' }));
    if (BK.media || !quiet) {
      const media = await exportMedia();
      await FS.write(c, bkFile(id, true), new Blob([JSON.stringify({ format: 'sormick-media', v: 1, id, media })], { type: 'application/json' })); BK.media = false;
    }
    D.sync.last = Date.now(); BK.skip = true; save(); BK.skip = false; BK.dirty = false;
    if (t) t.close(); if (!quiet) toast('Sauvegarde terminée.');
    return true;
  } catch (e) { if (t) t.close(); toast('Sauvegarde impossible : ' + (e.message || e), 7000); return false; }
  finally { BK.running = false; BK.skip = false; }
}

/* Réglage dans « Mon compte » */
function syncBox() {
  const sel = el('select', { 'aria-label': 'Lecteur de sauvegarde' }), auto = el('input', { type: 'checkbox', checked: !!D.sync.auto }), st = el('small', { className: 'mut' });
  opts(sel, [['', 'Aucun (pas de sauvegarde)'], ...D.conns.map(c => [c.id, (c.name || hostOf(c.url)) + ' — ' + c.user])]); sel.value = D.sync.cid;
  const info = () => { st.textContent = D.sync.last ? 'Dernière sauvegarde : ' + new Date(D.sync.last).toLocaleString('fr-FR') : 'Aucune sauvegarde pour le moment.'; };
  sel.onchange = () => { D.sync.cid = sel.value; save(); };
  auto.onchange = () => { D.sync.auto = auto.checked; save(); };
  info(); BK.info = info;
  const det = el('details', { className: 'frm' }, el('summary', { textContent: 'Sauvegarde dans mon cloud (autres ordinateurs)' }), el('div', { className: 'col' },
    el('small', { className: 'mut', textContent: 'Pour retrouver votre compte sur un autre ordinateur : choisissez un de vos lecteurs WebDAV, puis utilisez le bouton « Sauvegarder maintenant dans mon cloud » (ci-dessous). Un dossier « sormick-cloud » y est créé.' }),
    el('label', { className: 'fld' }, el('span', { textContent: 'Lecteur WebDAV de sauvegarde' }), sel),
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
    let po = null, mo = null, miss = 0;
    try { po = JSON.parse(await (await FS.read(c, bkFile(id), 'application/json')).text()); } catch (e) { if (e.code === 'path') miss++; else throw e; }
    try { mo = JSON.parse(await (await FS.read(c, bkFile(id, true), 'application/json')).text()); } catch (e) { if (e.code === 'path') miss++; else if (!(e instanceof SyntaxError)) throw e; }
    if (miss === 2) throw new Error('Aucune sauvegarde de ce profil dans le dossier « sormick-cloud » de ce cloud.');
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
    toast('Récupéré : ' + n + ' raccourci' + (n > 1 ? 's' : '') + ', ' + m + ' autre' + (m > 1 ? 's' : '') + ' élément' + (m > 1 ? 's' : '') + ' (post-it, playlist, clouds, réglages…), miniatures et PDF du tutoriel. Les sauvegardes peuvent reprendre.', 9000); return true;
  } catch (e) { t.close(); toast('Récupération impossible : ' + (e.message || e), 7000); return false; }
}
async function offerPull() {
  if (!pendingPull(SESSION.user.id)) return;
  if (!bkConn()) return;   // aucun lecteur de sauvegarde dans ce profil : récupération manuelle possible plus tard
  const ok = await confirmBox('Ce profil a été importé depuis un fichier : récupérez aussi ce qui est plus récent dans votre sauvegarde (raccourcis de l’App Store, miniatures de playlist, PDF du tutoriel, et ce qui a été ajouté depuis l’export : post-it, playlist, clouds…). Votre cloud « ' + (bkConn().name || hostOf(bkConn().url)) + ' » est déjà connecté : voulez-vous les récupérer maintenant ?', 'Récupérer');
  if (ok) await pullFromCloud(); else toast('D’accord. Les sauvegardes automatiques sont suspendues tant que vous ne les avez pas récupérés : Mon compte → Sauvegarde dans mon cloud.', 8000);
}

/* Bouton « Sauvegarder maintenant » toujours visible dans Mon compte */
async function saveNowBtn() {
  if (!bkConn()) { if (BK.open) BK.open(); return toast('Choisissez d’abord le lecteur WebDAV de sauvegarde (liste ci-dessus).', 6000); }
  await backupNow(false); if (BK.info) BK.info();
}
