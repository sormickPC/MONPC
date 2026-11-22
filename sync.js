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
  const go = btn('Sauvegarder maintenant', 'upload', async () => { go.disabled = true; await backupNow(false); go.disabled = false; info(); }, 'pri');
  info();
  return el('details', { className: 'frm' }, el('summary', { textContent: 'Sauvegarde dans mon cloud (autres ordinateurs)' }), el('div', { className: 'col' },
    el('small', { className: 'mut', textContent: 'Pour retrouver votre compte sur un autre ordinateur : choisissez un de vos lecteurs WebDAV. Un dossier « sormick-cloud » y est créé.' }),
    el('label', { className: 'fld' }, el('span', { textContent: 'Lecteur WebDAV de sauvegarde' }), sel),
    el('label', { className: 'row tight' }, auto, el('span', { textContent: 'Sauvegarde automatique (1 minute après une modification, et au verrouillage)' })),
    go, st,
    el('small', { className: 'mut', textContent: 'Votre profil (bureau, connexions, playlist, fond d’écran personnalisé…) reste chiffré avec votre mot de passe. Sont enregistrés EN CLAIR : votre catalogue de raccourcis, votre nom et avatar, les miniatures de la playlist et le PDF du tutoriel. La dernière sauvegarde remplace la précédente (pas de fusion entre deux ordinateurs).' })));
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
  const prevD = D, t = toast('Recherche de vos sauvegardes…', 0);
  D = { proxy: '', ptoken: '', conns: [], lock: 0, relay: { url: r.ru.trim().replace(/\/+$/, ''), tok: r.rt } };   // contexte provisoire (aucun profil n'est ouvert)
  try {
    const c = { id: uid(), type: 'dav', name: '', url: u, user: r.user.trim(), pass: r.pass, base: r.base.trim(), site: '' };
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
