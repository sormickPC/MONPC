'use strict';
/* vault.js — comptes locaux, chiffrement et persistance.

   Modèle de sécurité
   - Un profil chiffré par utilisateur, dans localStorage ('vd2.u.<id>').
   - Clé AES-GCM 256 bits dérivée du mot de passe (PBKDF2-SHA256, 600 000 itérations, sel aléatoire de 16 octets).
     La clé n'est pas exportable et n'existe qu'en mémoire pendant la session.
   - Tout ce qui est personnel (connexions WebDAV et leurs mots de passe, bureau, playlists, documents,
     fond d'écran) est dans le profil chiffré. Le mot de passe de l'utilisateur n'est jamais stocké.
   - En clair : le catalogue d'applications partagé (noms, URL, descriptions) et la liste des utilisateurs
     (nom, sel, nombre d'itérations). Rien de secret. */

const TE = new TextEncoder(), TD = new TextDecoder();
const b64e = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const uid = () => crypto.randomUUID();
const httpUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && !x.username && !x.password ? x.href : null; } catch { return null; } };
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const ITER = 600000, ID_RE = /^[0-9a-f-]{36}$/;
const GKEY = 'vd2.g', UKEY = id => 'vd2.u.' + id;
let onSaveError = () => {};

/* ---------- Données globales (catalogue partagé + liste des utilisateurs) ---------- */
const G = (() => {
  const g = { apps: [], users: [], last: '' };
  try {
    const o = JSON.parse(localStorage.getItem(GKEY) || 'null') || {};
    if (Array.isArray(o.apps)) g.apps = o.apps.filter(a => a && typeof a.id === 'string' && typeof a.name === 'string' && httpUrl(a.url)).slice(0, 500)
      .map(a => ({ id: a.id.slice(0, 60), name: str(a.name, 40), url: httpUrl(a.url), cat: str(a.cat, 30), desc: str(a.desc, 240), mode: a.mode === 'tab' ? 'tab' : a.mode === 'win' ? 'win' : 'auto', img: str(a.img, 80000), ai: a.ai === true }));
    if (Array.isArray(o.users)) g.users = o.users.filter(u => u && ID_RE.test(u.id) && typeof u.name === 'string' && typeof u.salt === 'string' && Number.isInteger(u.iter) && u.iter >= 1e5 && u.iter <= 5e6)
      .map(u => ({ id: u.id, name: str(u.name, 24), salt: u.salt, iter: u.iter }));
    g.last = str(o.last, 40);
  } catch { /* données illisibles : démarrage à vide */ }
  return g;
})();
function saveG() { try { localStorage.setItem(GKEY, JSON.stringify(G)); return true; } catch { onSaveError(); return false; } }

/* ---------- Données d'un utilisateur ---------- */
const BUILTIN_IDS = ['b:music', 'b:video', 'b:docs', 'b:images'];
const defUser = () => ({ desk: BUILTIN_IDS.slice(), wp: { t: 'd', v: 0, fit: 'cover' }, conns: [], pl: Object.create(null), docs: Object.create(null), proxy: '', ptoken: '', relay: { url: '', tok: '' }, lock: 30, ddg: true, welcomed: false, notes: [], tabHosts: [], os: { key: '', user: '', pass: '', lang: 'fr' } });
function normUser(o) {
  const d = defUser();
  if (!o || typeof o !== 'object') return d;
  if (Array.isArray(o.desk)) d.desk = o.desk.filter(x => typeof x === 'string' && x.length <= 80).slice(0, 300);
  if (o.wp && typeof o.wp === 'object') d.wp = { t: ['d', 'p', 'u'].includes(o.wp.t) ? o.wp.t : 'd', v: o.wp.t === 'u' ? str(o.wp.v, 3e6) : (Number.isInteger(o.wp.v) ? o.wp.v : 0), fit: ['cover', 'contain', '100% 100%'].includes(o.wp.fit) ? o.wp.fit : 'cover' };
  if (Array.isArray(o.conns)) d.conns = o.conns.filter(c => c && typeof c.id === 'string' && (c.type === 'dav' || c.type === undefined) && httpUrl(c.url)).slice(0, 50)   // anciennes connexions SFTP : supprimées
    .map(c => ({ id: c.id.slice(0, 60), type: 'dav', name: str(c.name, 60), url: httpUrl(c.url), user: str(c.user, 200), pass: str(c.pass, 500), base: str(c.base, 300), site: /^https:\/\//i.test(String(c.site || '')) ? (httpUrl(c.site) || '') : '', img: str(c.img, 80000), ...(c.relay === true ? { relay: true } : {}) }));
  if (o.pl && typeof o.pl === 'object') for (const k of Object.keys(o.pl)) {
    if (RESERVED.has(k) || !Array.isArray(o.pl[k])) continue;
    d.pl[k.slice(0, 40)] = o.pl[k].filter(t => t && typeof t.cid === 'string' && typeof t.path === 'string').slice(0, 2000).map(t => ({ name: str(t.name, 200), cid: t.cid.slice(0, 60), path: t.path.slice(0, 1000) }));
  }
  if (o.docs && typeof o.docs === 'object') for (const k of Object.keys(o.docs)) if (!RESERVED.has(k) && typeof o.docs[k] === 'string') d.docs[k.slice(0, 80)] = o.docs[k].slice(0, 2e6);
  d.proxy = str(o.proxy, 500); d.ptoken = str(o.ptoken, 300);
  if (o.relay && typeof o.relay === 'object') d.relay = { url: (/^https:\/\//i.test(String(o.relay.url || '')) || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(String(o.relay.url || ''))) ? (httpUrl(o.relay.url) || '') : '', tok: /^[\w.~+\/=-]{0,200}$/.test(String(o.relay.tok || '')) ? String(o.relay.tok || '') : '' };
  d.lock = Number.isFinite(o.lock) ? Math.min(240, Math.max(0, Math.round(o.lock))) : 30;
  d.ddg = o.ddg !== false; d.welcomed = o.welcomed === true;
  if (Array.isArray(o.notes)) {   // post-it : au plus 5 épinglés sur le bureau
    let pins = 0;
    d.notes = o.notes.filter(n => n && typeof n.id === 'string').slice(0, 300).map(n => {
      const pin = n.pin === true && pins < 5; if (pin) pins++;
      return { id: n.id.slice(0, 60), text: str(n.text, 2000), color: ['y', 'p', 'g', 'b', 'o'].includes(n.color) ? n.color : 'y', pin,
        x: Number.isFinite(n.x) ? Math.min(5000, Math.max(0, Math.round(n.x))) : 40, y: Number.isFinite(n.y) ? Math.min(5000, Math.max(0, Math.round(n.y))) : 40, t: Number.isFinite(n.t) ? n.t : 0,
        ...(Number.isFinite(n.w) && Number.isFinite(n.h) ? { w: Math.min(640, Math.max(120, Math.round(n.w))), h: Math.min(640, Math.max(110, Math.round(n.h))) } : {}) };
    });
  }
  if (o.os && typeof o.os === 'object') d.os = { key: str(o.os.key, 100), user: str(o.os.user, 100), pass: str(o.os.pass, 200), lang: /^[a-z]{2}(-[A-Za-z]{2})?$/.test(o.os.lang) ? o.os.lang : 'fr' };
  if (Array.isArray(o.tabHosts)) d.tabHosts = [...new Set(o.tabHosts.filter(h => typeof h === 'string' && /^[a-z0-9.-]{1,253}$/.test(h)))].slice(0, 200);
  return d;
}

/* ---------- Cryptographie ---------- */
async function deriveKey(pw, salt, iter) {
  const base = await crypto.subtle.importKey('raw', TE.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(key, obj, id) {   // IV aléatoire neuf à chaque écriture ; l'id de l'utilisateur est authentifié (AAD)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: TE.encode(id) }, key, TE.encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64e(out);
}
async function unseal(key, b64, id) {
  const raw = b64d(b64);
  return JSON.parse(TD.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: TE.encode(id) }, key, raw.slice(12))));
}

/* ---------- Session ---------- */
let SESSION = null;          // { user, key, data }
let failN = 0, until = 0;    // ralentissement après des échecs de connexion
const BAD_PW = 'Mot de passe incorrect.';

async function unlockBlob(u, pw) {
  const key = await deriveKey(pw, b64d(u.salt), u.iter);
  const blob = localStorage.getItem(UKEY(u.id));
  if (!blob) throw new Error('Profil introuvable sur cet appareil.');
  try { return { key, data: normUser(await unseal(key, blob, u.id)) }; } catch { throw new Error(BAD_PW); }
}
async function login(id, pw) {
  const u = G.users.find(x => x.id === id);
  if (!u) throw new Error('Utilisateur inconnu.');
  const wait = until - Date.now();
  if (wait > 0) throw new Error('Trop d’essais : patientez ' + Math.ceil(wait / 1000) + ' s.');
  try {
    const r = await unlockBlob(u, String(pw));
    failN = 0; SESSION = { user: u, key: r.key, data: r.data }; G.last = id; saveG();
    return SESSION.data;
  } catch (e) {
    if (e.message === BAD_PW) { failN++; until = Date.now() + Math.min(30000, 1000 * 2 ** failN); }
    throw e;
  }
}
async function createUser(name, pw, seed) {
  name = String(name).trim(); pw = String(pw);
  if (name.length < 2 || name.length > 24 || /[\u0000-\u001f<>]/.test(name)) throw new Error('Nom : 2 à 24 caractères, sans < ni >.');
  if (G.users.some(u => u.name.toLowerCase() === name.toLowerCase())) throw new Error('Ce nom d’utilisateur existe déjà.');
  if (pw.length < 8) throw new Error('Mot de passe : 8 caractères minimum.');
  const id = uid(), salt = crypto.getRandomValues(new Uint8Array(16)), key = await deriveKey(pw, salt, ITER);
  const blob = await seal(key, normUser(seed), id);
  try { localStorage.setItem(UKEY(id), blob); } catch { throw new Error('Stockage local plein.'); }
  G.users.push({ id, name, salt: b64e(salt), iter: ITER });
  if (!saveG()) { G.users.pop(); localStorage.removeItem(UKEY(id)); throw new Error('Stockage local plein.'); }
  return id;
}

/* Sauvegarde : regroupée (300 ms) puis chiffrée ; les écritures sont sérialisées. */
let timer = null, chain = Promise.resolve();
function save() { if (!SESSION) return; clearTimeout(timer); timer = setTimeout(flush, 300); }
function flush() {
  clearTimeout(timer);
  const s = SESSION; if (!s) return chain;
  chain = chain.then(async () => { try { localStorage.setItem(UKEY(s.user.id), await seal(s.key, s.data, s.user.id)); } catch { onSaveError(); } });
  return chain;
}
function lock() { clearTimeout(timer); SESSION = null; }

async function changePassword(oldPw, newPw) {
  if (!SESSION) throw new Error('Session fermée.');
  if (String(newPw).length < 8) throw new Error('Mot de passe : 8 caractères minimum.');
  const u = SESSION.user, k = UKEY(u.id);
  await unlockBlob(u, String(oldPw));                      // vérifie l'ancien mot de passe
  await flush();
  const salt = crypto.getRandomValues(new Uint8Array(16)), key = await deriveKey(String(newPw), salt, ITER);
  const blob = await seal(key, SESSION.data, u.id), oldBlob = localStorage.getItem(k), oldSalt = u.salt, oldIter = u.iter;
  try { localStorage.setItem(k, blob); u.salt = b64e(salt); u.iter = ITER; if (!saveG()) throw 0; }
  catch { localStorage.setItem(k, oldBlob); u.salt = oldSalt; u.iter = oldIter; throw new Error('Stockage local indisponible : mot de passe inchangé.'); }
  SESSION.key = key;
}
async function deleteUser(id, pw) {
  const u = G.users.find(x => x.id === id);
  if (!u) return;
  await unlockBlob(u, String(pw));
  localStorage.removeItem(UKEY(id));
  G.users = G.users.filter(x => x.id !== id);
  if (G.last === id) G.last = '';
  saveG();
  if (SESSION && SESSION.user.id === id) lock();
}

/* Export / import du profil (toujours chiffré : inutilisable sans le mot de passe) */
async function exportProfile() {
  if (!SESSION) throw new Error('Session fermée.');
  await flush();
  const u = SESSION.user;
  return JSON.stringify({ format: 'sormick-profile', v: 1, id: u.id, name: u.name, salt: u.salt, iter: u.iter, blob: localStorage.getItem(UKEY(u.id)) });
}
function importProfile(text) {
  if (String(text).length > 12e6) throw new Error('Fichier trop volumineux.');
  let o; try { o = JSON.parse(text); } catch { throw new Error('Fichier invalide.'); }
  if (!o || o.format !== 'sormick-profile' || !ID_RE.test(o.id) || typeof o.blob !== 'string' || typeof o.salt !== 'string' || !Number.isInteger(o.iter) || o.iter < 1e5 || o.iter > 5e6) throw new Error('Profil invalide.');
  if (G.users.some(u => u.id === o.id)) throw new Error('Ce profil existe déjà sur cet appareil.');
  try { if (b64d(o.salt).length !== 16 || b64d(o.blob).length < 29) throw 0; } catch { throw new Error('Profil invalide.'); }
  const base = str(o.name, 24) || 'Profil'; let name = base, k = 2;
  while (G.users.some(u => u.name.toLowerCase() === name.toLowerCase())) name = base.slice(0, 20) + ' ' + k++;
  try { localStorage.setItem(UKEY(o.id), o.blob); } catch { throw new Error('Stockage local plein.'); }
  G.users.push({ id: o.id, name, salt: o.salt, iter: o.iter }); saveG();
  return o.id;
}
