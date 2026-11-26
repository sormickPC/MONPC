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
async function pkPrf(cid, salt) {   // demande au dispositif le secret lié à ce site et à ce sel (déverrouillage obligatoire : code, biométrie…)
  let a;
  try {
    a = await navigator.credentials.get({ publicKey: { challenge: pkRand(32), allowCredentials: [{ type: 'public-key', id: cid }], userVerification: 'required', timeout: 120000, extensions: { prf: { eval: { first: salt } } } } });
  } catch (e) { throw new Error(e && e.name === 'NotAllowedError' ? 'Clé d’accès annulée ou refusée.' : 'Clé d’accès indisponible sur cet appareil.'); }
  const r = a && a.getClientExtensionResults && a.getClientExtensionResults().prf;
  if (!r || !r.results || !r.results.first) throw new Error('Cet appareil ou ce navigateur ne permet pas d’utiliser la clé d’accès pour déverrouiller (extension « PRF » absente). Utilisez le mot de passe.');
  return new Uint8Array(r.results.first);
}
async function pkWrap(u, cid, pw) {   // -> { cid, salt, w }
  const salt = pkRand(32), key = await pkAesKey(await pkPrf(cid, salt)), iv = pkRand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: TE.encode(u.id) }, key, TE.encode(String(pw))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return { cid: b64e(cid), salt: b64e(salt), w: b64e(out) };
}
async function pkEnable(pw) {   // utilisateur connecté + mot de passe actuel
  if (!SESSION) throw new Error('Session fermée.');
  if (!pkSupported()) throw new Error('Les clés d’accès ne sont pas disponibles ici (il faut un navigateur récent et une adresse https).');
  const u = SESSION.user; await unlockBlob(u, String(pw));   // vérifie le mot de passe
  let c;
  try {
    c = await navigator.credentials.create({ publicKey: { rp: { name: 'sormick Cloud' }, user: { id: pkRand(16), name: u.name, displayName: u.name }, challenge: pkRand(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' }, timeout: 120000, extensions: { prf: {} } } });
  } catch (e) { throw new Error(e && e.name === 'NotAllowedError' ? 'Création de la clé d’accès annulée.' : e && e.name === 'InvalidStateError' ? 'Cette clé d’accès existe déjà sur cet appareil.' : 'Création de la clé d’accès impossible ici.'); }
  const ext = c.getClientExtensionResults && c.getClientExtensionResults().prf;
  if (ext && ext.enabled === false) throw new Error('Cet appareil ou ce navigateur ne permet pas de déverrouiller avec une clé d’accès (extension « PRF » absente). Le mot de passe reste nécessaire.');
  const prev = u.pk; u.pk = await pkWrap(u, new Uint8Array(c.rawId), pw);
  if (!saveG()) { u.pk = prev; throw new Error('Stockage local indisponible.'); }
}
async function pkRewrap(pw) {   // après un changement de mot de passe : la copie chiffrée doit suivre
  const u = SESSION && SESSION.user; if (!u || !u.pk) return;
  try { u.pk = await pkWrap(u, b64d(u.pk.cid), pw); saveG(); }
  catch (e) { delete u.pk; saveG(); throw new Error('La clé d’accès a été désactivée (' + e.message.replace(/\.$/, '') + '). Réactivez-la dans « Mon compte ».'); }
}
function pkDisable() { if (SESSION && SESSION.user.pk) { delete SESSION.user.pk; saveG(); } }
async function pkLogin(id) {   // -> données du profil (comme login) ; erreurs en français
  const u = G.users.find(x => x.id === id);
  if (!u || !u.pk) throw new Error('Pas de clé d’accès pour cet utilisateur : utilisez le mot de passe.');
  const key = await pkAesKey(await pkPrf(b64d(u.pk.cid), b64d(u.pk.salt)));
  let pw;
  try { const raw = b64d(u.pk.w); pw = TD.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: TE.encode(u.id) }, key, raw.slice(12))); }
  catch { throw new Error('Cette clé d’accès ne correspond pas à ce profil : utilisez le mot de passe.'); }
  try { return await login(id, pw); }
  catch (e) { if (e.message === BAD_PW) { delete u.pk; saveG(); throw new Error('Le mot de passe a changé depuis l’activation : saisissez-le, puis réactivez la clé d’accès dans « Mon compte ».'); } throw e; }
}
