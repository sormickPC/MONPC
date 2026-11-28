'use strict';
/* passkey.js — connexion par clé d'accès (passkey / WebAuthn) en plus du mot de passe.
   Principe : le mot de passe reste la clé qui chiffre le profil. Avec la clé d'accès, l'appareil (Windows Hello, Touch ID / Face ID, téléphone, clé de sécurité)
   fournit un secret propre au site grâce à l'extension « PRF » de WebAuthn ; ce secret chiffre une copie du mot de passe, rangée dans les réglages de l'appareil.
   Sans la clé d'accès (et son déverrouillage biométrique ou son code), cette copie est illisible. Tout reste dans le navigateur. */
const PK_INFO = new TextEncoder().encode('sormick-passkey-v1');
const pkSupported = () => !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create && window.isSecureContext);
const pkRand = n => crypto.getRandomValues(new Uint8Array(n));
async function pkAesKey(prf) {
  const base = await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: PK_INFO }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const pkList = u => normPk(u && u.pk) || [];   // clés d'accès du profil : une par appareil (téléphone, ordinateur…), 8 au maximum
const PK_MAX = 8;
const b64u = b => String(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/* Demande au dispositif le secret lié à ce site et à ce sel (déverrouillage obligatoire : code, biométrie…). Avec plusieurs clés d'accès, l'appareil présente celle qu'il possède :
   renvoie l'indice de la clé utilisée et son secret. Toutes les clés partagent le même sel (il n'est pas secret) : une seule demande suffit. */
async function pkGet(list) {
  const same = new Set(list.map(e => e.salt)).size === 1;
  const prf = same ? { eval: { first: b64d(list[0].salt) } } : { evalByCredential: Object.fromEntries(list.map(e => [b64u(e.cid), { first: b64d(e.salt) }])) };
  let a;
  try {
    a = await navigator.credentials.get({ publicKey: { challenge: pkRand(32), allowCredentials: list.map(e => ({ type: 'public-key', id: b64d(e.cid) })), userVerification: 'required', timeout: 120000, extensions: { prf } } });
  } catch (e) { throw new Error(e && e.name === 'NotAllowedError' ? 'Clé d’accès annulée ou refusée.' : 'Clé d’accès indisponible sur cet appareil : utilisez le mot de passe.'); }
  const r = a && a.getClientExtensionResults && a.getClientExtensionResults().prf;
  if (!r || !r.results || !r.results.first) throw new Error('Cet appareil ou ce navigateur ne permet pas d’utiliser la clé d’accès pour déverrouiller (extension « PRF » absente). Utilisez le mot de passe.');
  const i = list.findIndex(e => e.cid === b64e(new Uint8Array(a.rawId)));
  if (i < 0) throw new Error('Cette clé d’accès ne correspond pas à ce profil : utilisez le mot de passe.');
  return { i, prf: new Uint8Array(r.results.first) };
}
async function pkSeal(u, prf, pw) {   // copie du mot de passe chiffrée par le secret de la clé d'accès
  const key = await pkAesKey(prf), iv = pkRand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: TE.encode(u.id) }, key, TE.encode(String(pw))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64e(out);
}
function pkStore(u, list) {   // enregistre la liste (réglages de l'appareil + profil chiffré, donc sauvegardes) ; false si le stockage local est indisponible
  if (list.length) u.pk = list; else delete u.pk;
  if (!saveG()) return false;
  if (list.length) D.pk = list; else delete D.pk;
  save(); return true;
}
function pkDefaultName(list) {   // « Smartphone », « Ordinateur »… (avec un numéro si le nom existe déjà)
  const base = { phone: 'Smartphone', tablet: 'Tablette', tv: 'TV' }[document.documentElement.dataset.dev] || 'Ordinateur';
  const t = typeof tr === 'function' ? tr(base) : base; let n = t, k = 2;
  while (list.some(e => (e.n || '').toLowerCase() === n.toLowerCase())) n = t + ' ' + k++;
  return n;
}
async function pkEnable(pw, name) {   // utilisateur connecté + mot de passe actuel ; AJOUTE une clé d'accès (celles des autres appareils restent)
  if (!SESSION) throw new Error('Session fermée.');
  if (!pkSupported()) throw new Error('Les clés d’accès ne sont pas disponibles ici (il faut un navigateur récent et une adresse https).');
  const u = SESSION.user, list = pkList(u);
  if (list.length >= PK_MAX) throw new Error('8 clés d’accès au maximum : retirez-en une avant d’en ajouter.');
  await unlockBlob(u, String(pw));   // vérifie le mot de passe
  let c;
  try {
    c = await navigator.credentials.create({ publicKey: { rp: { name: 'sormick Cloud' }, user: { id: pkRand(16), name: u.name, displayName: u.name }, challenge: pkRand(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' }, timeout: 120000, extensions: { prf: {} },
      excludeCredentials: list.map(e => ({ type: 'public-key', id: b64d(e.cid) })) } });
  } catch (e) { throw new Error(e && e.name === 'NotAllowedError' ? 'Création de la clé d’accès annulée.' : e && e.name === 'InvalidStateError' ? 'Cette clé d’accès existe déjà sur cet appareil.' : 'Création de la clé d’accès impossible ici.'); }
  // Chrome/Edge sous Windows annoncent parfois « PRF absent » à la création alors que la lecture fonctionne : on essaie vraiment avant de conclure
  const salt = list.length ? b64d(list[0].salt) : pkRand(32), cid = new Uint8Array(c.rawId);
  const g = await pkGet([{ cid: b64e(cid), salt: b64e(salt) }]);
  const nm = String(name || '').trim().slice(0, 30) || pkDefaultName(list);
  const entry = { cid: b64e(cid), salt: b64e(salt), w: await pkSeal(u, g.prf, pw), n: nm, t: Date.now() };
  if (!pkStore(u, [...list, entry])) { if (list.length) u.pk = list; else delete u.pk; throw new Error('Stockage local indisponible.'); }
}
/* Après un changement de mot de passe, la copie chiffrée doit suivre : seule la clé d'accès de CET appareil peut être mise à jour (il faut son déverrouillage). Les clés des autres appareils
   contiennent l'ancien mot de passe et ne servent plus : elles sont retirées (à réactiver sur ces appareils). Renvoie le nombre de clés retirées. */
async function pkRewrap(pw) {
  const u = SESSION && SESSION.user, list = pkList(u); if (!u || !list.length) return 0;
  try {
    const g = await pkGet(list), keep = { ...list[g.i], w: await pkSeal(u, g.prf, pw) };
    pkStore(u, [keep]); return list.length - 1;
  } catch (e) { pkStore(u, []); throw new Error('Les clés d’accès ont été désactivées (' + e.message.replace(/\.$/, '') + '). Réactivez-les dans « Mon compte ».'); }
}
function pkRemove(cid) { if (!SESSION) return; const u = SESSION.user; pkStore(u, pkList(u).filter(e => e.cid !== cid)); }   // retire une seule clé d'accès
function pkDisable() { if (SESSION) pkStore(SESSION.user, []); }   // les retire toutes
async function pkLogin(id) {   // -> données du profil (comme login) ; erreurs en français
  const u = G.users.find(x => x.id === id), list = pkList(u);
  if (!u || !list.length) throw new Error('Pas de clé d’accès pour cet utilisateur : utilisez le mot de passe.');
  const g = await pkGet(list), e0 = list[g.i], key = await pkAesKey(g.prf), drop = () => { (window.PK_STALE = window.PK_STALE || []).push(e0.cid); const rest = list.filter(e => e.cid !== e0.cid); if (rest.length) u.pk = rest; else delete u.pk; saveG(); };
  let pw;
  try { const raw = b64d(e0.w); pw = TD.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: TE.encode(u.id) }, key, raw.slice(12))); }
  catch { throw new Error('Cette clé d’accès ne correspond pas à ce profil : utilisez le mot de passe.'); }
  try { return await login(id, pw); }
  catch (e) { if (e.message === BAD_PW) { drop(); throw new Error('Le mot de passe a changé depuis l’activation : saisissez-le, puis réactivez la clé d’accès dans « Mon compte ».'); } throw e; }
}

/* ---------- Code PIN (écrans de TV uniquement, activé par VOUS) ----------
   Rien n'est proposé automatiquement : le code PIN n'existe sur un appareil que si, connecté sur une TV, vous l'activez vous-même (Mon compte → Activer le code PIN),
   en retapant votre mot de passe. L'écran de connexion n'affiche le clavier PIN que sur cet appareil et sur une TV.
   Le mot de passe reste la clé du profil. Une copie du mot de passe est chiffrée par le code à 6 chiffres (PBKDF2 + AES-GCM), PUIS le tout (copie, sel, compteur d'erreurs, limite)
   est chiffré une seconde fois par une clé propre à l'appareil : clé AES non exportable rangée dans IndexedDB, qui ne quitte jamais l'appareil. Copier le stockage du navigateur ne suffit donc pas pour
   essayer les 1 000 000 de codes ailleurs. Après 3 à 5 erreurs (au choix), tout est supprimé : le mot de passe reste valable et permet de recréer le code PIN. Jamais exporté ni sauvegardé. */
const pinOk = () => document.documentElement.dataset.dev === 'tv';
const PIN_ITER = 300000;
const pinAad = u => TE.encode('pin:' + u.id), pinAad2 = u => TE.encode('pin2:' + u.id);
const pinIdb = () => new Promise((ok, ko) => {
  if (!window.indexedDB) return ko(new Error('idb'));
  let r; try { r = indexedDB.open('sormick-dev', 1); } catch (e) { return ko(e); }
  r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error || new Error('idb')); r.onblocked = () => ko(new Error('idb'));
});
async function pinDevKey(create) {   // clé de l'appareil (null si elle n'existe pas et qu'on ne la crée pas)
  const db = await pinIdb();
  try {
    const get = () => new Promise((ok, ko) => { const q = db.transaction('k', 'readonly').objectStore('k').get('pin'); q.onsuccess = () => ok(q.result || null); q.onerror = () => ko(q.error); });
    let k = await get();
    if (!k && create) {
      k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await new Promise((ok, ko) => { const t = db.transaction('k', 'readwrite'); t.objectStore('k').put(k, 'pin'); t.oncomplete = ok; t.onerror = () => ko(t.error); t.onabort = () => ko(t.error); });
    }
    return k;
  } finally { db.close(); }
}
async function pinWrap(u, inner) {   // bloc v2 : { v: 2, d } ; lève si le stockage sécurisé de l'appareil est indisponible
  let key; try { key = await pinDevKey(true); } catch { key = null; }
  if (!key) throw new Error('Le stockage sécurisé de cet appareil n’est pas disponible : le code PIN ne peut pas être activé ici.');
  const iv = pkRand(12), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: pinAad2(u) }, key, TE.encode(JSON.stringify(inner))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return { v: 2, d: b64e(out) };
}
async function pinOpen(u) {   // contenu du bloc { salt, iter, w, max, fails } ; ancien format lu tel quel
  const p = u.pin; if (!p) return null;
  if (p.v !== 2) return { salt: p.salt, iter: p.iter, w: p.w, max: p.max, fails: p.fails, old: true };
  const key = await pinDevKey(false); if (!key) throw new Error('clé de l’appareil absente');
  const raw = b64d(p.d); return JSON.parse(TD.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: pinAad2(u) }, key, raw.slice(12))));
}
async function pinEnable(pw, pin, max) {
  if (!SESSION) throw new Error('Session fermée.');
  if (!pinOk()) throw new Error('Le code PIN est réservé aux écrans de TV.');
  if (!/^\d{6}$/.test(String(pin))) throw new Error('Le code PIN doit comporter 6 chiffres.');
  const u = SESSION.user; await unlockBlob(u, String(pw));   // vérifie le mot de passe
  const salt = pkRand(16), key = await deriveKey(String(pin), salt, PIN_ITER), iv = pkRand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: pinAad(u) }, key, TE.encode(String(pw))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  const blk = await pinWrap(u, { salt: b64e(salt), iter: PIN_ITER, w: b64e(out), max: Math.min(5, Math.max(3, Math.round(Number(max)) || 3)), fails: 0 });
  const prev = u.pin, pb = u.pb;
  u.pin = blk; delete u.pb;
  if (!saveG()) { if (prev) u.pin = prev; else delete u.pin; if (pb) u.pb = pb; throw new Error('Stockage local indisponible.'); }
}
function pinDisable() { if (SESSION) { delete SESSION.user.pin; delete SESSION.user.pb; saveG(); } }
async function pinLogin(id, pin) {   // -> données du profil (comme login) ; erreurs en français
  const u = G.users.find(x => x.id === id);
  if (!u || !u.pin) throw new Error('Pas de code PIN pour cet utilisateur : utilisez le mot de passe.');
  let inner; try { inner = await pinOpen(u); } catch { delete u.pin; u.pb = true; saveG(); throw new Error('Le code PIN de cet appareil n’est plus lisible (données de l’appareil effacées) : saisissez le mot de passe, puis recréez le code PIN.'); }
  let pw;
  try {
    const raw = b64d(inner.w), key = await deriveKey(String(pin), b64d(inner.salt), inner.iter);
    pw = TD.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: pinAad(u) }, key, raw.slice(12)));
  } catch {
    inner.fails = (inner.fails || 0) + 1; const left = inner.max - inner.fails;
    if (left <= 0) { delete u.pin; u.pb = true; saveG(); throw new Error('Code PIN bloqué après trop d’erreurs : saisissez le mot de passe. Vous pourrez recréer le code PIN ensuite.'); }
    try { u.pin = await pinWrap(u, { salt: inner.salt, iter: inner.iter, w: inner.w, max: inner.max, fails: inner.fails }); } catch { if (u.pin && u.pin.v !== 2) u.pin.fails = inner.fails; }   // compteur d'erreurs conservé (chiffré)
    saveG(); throw new Error((typeof tr === 'function' ? tr('Code PIN incorrect. Essais restants avant blocage :') : 'Code PIN incorrect. Essais restants avant blocage :') + ' ' + left);
  }
  try {
    const d = await login(id, pw);
    if (u.pin && (inner.fails || inner.old)) { try { u.pin = await pinWrap(u, { salt: inner.salt, iter: inner.iter, w: inner.w, max: inner.max, fails: 0 }); saveG(); } catch { /* ancien format conservé */ } }   // remet le compteur à zéro ; passe l'ancien format au chiffrement par la clé de l'appareil
    return d;
  }
  catch (e) { if (e.message === BAD_PW) { delete u.pin; u.pb = true; saveG(); throw new Error('Le mot de passe a changé depuis l’activation : saisissez-le, puis recréez le code PIN.'); } throw e; }
}
