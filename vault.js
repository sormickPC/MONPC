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
let onDirty = () => {};   // appelé à chaque modification de la session (sauvegarde automatique dans le cloud)

/* Avatar (visible sur l'écran de connexion : donc NON chiffré, et sans rien de secret) : un des emojis proposés, ou une petite photo JPEG 96×96. */
const AV_PRESETS = ['🦊', '🐼', '🐱', '🐶', '🦁', '🐙', '🚀', '🎧', '🎮', '🌈', '⚡', '🌿'];
const normAv = v => typeof v === 'string' && ((v.startsWith('e:') && AV_PRESETS.includes(v.slice(2))) || (v.length < 40000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v))) ? v : '';

/* ---------- Données globales (liste des utilisateurs) + catalogue de l'App Store de l'utilisateur connecté ----------
   Le catalogue (raccourcis web) est PROPRE À CHAQUE UTILISATEUR (clé AKEY) et enregistré NON chiffré ; G.apps est celui de la session ouverte. */
const AKEY = id => 'vd2.a.' + id;
const SKEY = id => 'vd2.s.' + id;   // catalogue de l'App Store (applications proposées, PAS encore installées) : propre à chaque utilisateur, non chiffré comme AKEY
/* Profil « léger » importé : raccourcis, miniatures et PDF restent à récupérer dans le cloud (marqueur local, sans donnée sensible) */
const PKEY = id => 'vd2.p.' + id;
const pendingPull = id => { try { return localStorage.getItem(PKEY(id)) === '1'; } catch { return false; } };
const setPending = (id, on) => { try { if (on) localStorage.setItem(PKEY(id), '1'); else localStorage.removeItem(PKEY(id)); } catch { /* facultatif */ } };
/* Raccourcis vers un programme local : lien de protocole (steam://…, ms-settings:…, spotify:…) ouvert par le système. Liste noire : schémas web/scripts/fichiers et protocoles Windows connus pour être dangereux. */
const BAD_SCHEMES = new Set(['javascript', 'data', 'vbscript', 'blob', 'file', 'about', 'http', 'https', 'ws', 'wss', 'ftp', 'ftps', 'chrome', 'chrome-extension', 'edge', 'view-source', 'filesystem', 'ms-msdt', 'msdt', 'search-ms', 'search', 'ms-appinstaller', 'ms-officecmd', 'ie', 'shell', 'mhtml', 'jar', 'cmd', 'powershell', 'wsl', 'ms-cxh', 'ms-cxh-full']);
const localUrl = u => { const m = /^([a-z][a-z0-9+.-]{1,30}):[^\s"'<>\\`]{0,300}$/i.exec(String(u || '').trim()); return m && !BAD_SCHEMES.has(m[1].toLowerCase()) ? m[1].toLowerCase() + String(u).trim().slice(m[1].length) : null; };
const EXE_RE = /^[A-Za-z]:\\[^"<>|*?%\r\n/]{1,250}\.exe$/i, BAD_EXE = /^(cmd|powershell|pwsh|wscript|cscript|mshta|rundll32|regsvr32|reg|regedit|msiexec|bash|wsl|certutil|bitsadmin|schtasks|sc|net|net1|taskkill|forfiles|msbuild|installutil|cscript|powershell_ise|conhost|explorer)\.exe$/i;
/* AppID Windows (Get-StartApps) : accepte l'AppID seul ou la ligne « explorer.exe shell:AppsFolder\<AppID> ». Aucun guillemet, % ni caractère de commande n'est admis. */
const appId = t => { let s = String(t || '').trim().replace(/^explorer(\.exe)?\s+/i, '').replace(/^["']|["']$/g, '').replace(/^shell:AppsFolder\\/i, '').trim(); return /^[^\x00-\x1f"'<>|*?%/:;`]{3,200}$/.test(s) && !s.includes('..') && !/^\\|\\$/.test(s) ? s : ''; };
const exePath = p => { const s = String(p || '').trim(); return EXE_RE.test(s) && !s.includes('..') && !BAD_EXE.test(s.split('\\').pop()) ? s : ''; };
const cleanApps = arr => (Array.isArray(arr) ? arr : []).filter(a => a && typeof a.id === 'string' && typeof a.name === 'string' && (httpUrl(a.url) || localUrl(a.lc))).slice(0, 500)
  .map(a => ({ id: a.id.slice(0, 60), name: str(a.name, 40), url: httpUrl(a.url) || '', lc: httpUrl(a.url) ? '' : localUrl(a.lc), ex: exePath(a.ex), ap: appId(a.ap), cat: str(a.cat, 30), desc: str(a.desc, 240), mode: a.mode === 'tab' ? 'tab' : a.mode === 'win' ? 'win' : 'auto', img: str(a.img, 80000), ai: a.ai === true }));
const loadApps = id => { try { return cleanApps(JSON.parse(localStorage.getItem(AKEY(id)) || '[]')); } catch { return []; } };
/* Catalogue de la boutique. Première ouverture (aucune clé) : les applications déjà installées y sont reprises, pour pouvoir les modifier depuis la boutique. */
const loadStore = (id, installed) => { const raw = localStorage.getItem(SKEY(id)); if (raw === null) return cleanApps(installed); try { return cleanApps(JSON.parse(raw)); } catch { return []; } };
const G = (() => {
  const g = { apps: [], store: [], users: [], last: '' };
  try {
    const o = JSON.parse(localStorage.getItem(GKEY) || 'null') || {};
    if (Array.isArray(o.users)) g.users = o.users.filter(u => u && ID_RE.test(u.id) && typeof u.name === 'string' && typeof u.salt === 'string' && Number.isInteger(u.iter) && u.iter >= 1e5 && u.iter <= 5e6)
      .map(u => ({ id: u.id, name: str(u.name, 24), salt: u.salt, iter: u.iter, av: normAv(u.av) }));
    g.last = str(o.last, 40);
    if (Array.isArray(o.apps) && o.apps.length) {   // anciennes versions : catalogue partagé → copié chez chaque utilisateur existant, puis retiré de la liste commune
      const old = JSON.stringify(cleanApps(o.apps)); let all = true;
      for (const u of g.users) if (localStorage.getItem(AKEY(u.id)) === null) { try { localStorage.setItem(AKEY(u.id), old); } catch { all = false; } }
      if (all) try { localStorage.setItem(GKEY, JSON.stringify({ users: g.users, last: g.last })); } catch { /* sera retiré à la prochaine sauvegarde */ }
    }
  } catch { /* données illisibles : démarrage à vide */ }
  return g;
})();
function saveG() {
  try {
    localStorage.setItem(GKEY, JSON.stringify({ users: G.users, last: G.last }));
    if (SESSION) { localStorage.setItem(AKEY(SESSION.user.id), JSON.stringify(G.apps)); localStorage.setItem(SKEY(SESSION.user.id), JSON.stringify(G.store)); onDirty(); }
    return true;
  } catch { onSaveError(); return false; }
}

/* ---------- Données d'un utilisateur ---------- */
const BUILTIN_IDS = ['b:music', 'b:video', 'b:docs', 'b:images'];
/* Sormick Radio, Sormick TV, enregistreurs : listes personnelles et destinations WebDAV (chaque application a son propre dossier d'enregistrement). */
const defRec = () => ({ radio: { cid: '', path: '/', seg: 30 }, tv: { cid: '', path: '/', seg: 10, q: 'mid' }, screen: { cid: '', path: '/', seg: 0 }, draw: { cid: '', path: '/' } });
const idOk = (v, n = 60) => typeof v === 'string' && /^[\w:.-]{1,60}$/.test(v) ? v.slice(0, n) : '';
const normStations = a => { const seen = new Set(); return (Array.isArray(a) ? a : []).filter(x => x && idOk(x.id) && !seen.has(x.id) && seen.add(x.id) && /^https:\/\//i.test(String(x.url || '')) && httpUrl(x.url)).slice(0, 3000)
  .map(x => ({ id: x.id, name: str(x.name, 120) || 'Sans nom', url: httpUrl(x.url), lang: str(x.lang, 40), genre: str(x.genre, 40), group: str(x.group, 60), tvg: str(x.tvg, 80), cc: /^[A-Za-z]{2}$/.test(x.cc || '') ? x.cc.toUpperCase() : '', logo: /^https:\/\//i.test(String(x.logo || '')) ? (httpUrl(x.logo) || '').slice(0, 300) : '',
    orig: /^https:\/\/[^\s<>"']{4,590}$/i.test(String(x.orig || '')) ? String(x.orig) : '' })); };   // orig : adresse de la radio/chaîne d'origine quand celle-ci est une version modifiée
function normMedia(o, d) {
  if (o.radio && typeof o.radio === 'object') {
    d.radio.mine = normStations(o.radio.mine);
    const l = o.radio.last || {}; d.radio.last = { lang: str(l.lang, 40), genre: str(l.genre, 40), cc: /^[A-Za-z]{2}$/.test(l.cc || '') ? l.cc.toUpperCase() : '' };
  }
  if (o.tv && typeof o.tv === 'object') {
    const seen = new Set();
    d.tv.lists = (Array.isArray(o.tv.lists) ? o.tv.lists : []).filter(x => x && idOk(x.id) && !seen.has(x.id) && seen.add(x.id) && /^https:\/\//i.test(String(x.url || '')) && httpUrl(x.url)).slice(0, 500)
      .map(x => ({ id: x.id, name: str(x.name, 120) || 'Sans nom', url: httpUrl(x.url), lang: str(x.lang, 40) }));
    d.tv.fav = normStations(o.tv.fav);
    d.tv.epg = /^https:\/\//i.test(String(o.tv.epg || '')) ? (httpUrl(o.tv.epg) || '').slice(0, 500) : '';
    const sid = new Set();   // guides EPG : vos ajouts / modifications du catalogue, et les guides du catalogue que vous avez retirés
    d.tv.epgs = (Array.isArray(o.tv.epgs) ? o.tv.epgs : []).filter(x => x && typeof x.id === 'string' && /^[\w:.-]{1,60}$/.test(x.id) && !sid.has(x.id) && sid.add(x.id) && /^https:\/\//i.test(String(x.url || '')) && httpUrl(x.url)).slice(0, 400)
      .map(x => ({ id: x.id, name: str(x.name, 100) || 'Guide', cc: /^[a-z]{2}$/.test(x.cc || '') ? x.cc : '', url: httpUrl(x.url).slice(0, 500), orig: /^[\w:.-]{1,60}$/.test(x.orig || '') ? x.orig : '' }));
    d.tv.epgHide = (Array.isArray(o.tv.epgHide) ? o.tv.epgHide : []).filter(x => typeof x === 'string' && /^[\w:.-]{1,60}$/.test(x)).slice(0, 400);
    d.tv.epgAuto = o.tv.epgAuto !== false;
    d.tv.epgCat = /^https:\/\//i.test(String(o.tv.epgCat || '')) ? (httpUrl(o.tv.epgCat) || '').slice(0, 500) : '';
    const l = o.tv.last || {}; d.tv.last = { k: ['languages', 'categories', 'countries'].includes(l.k) ? l.k : 'languages', v: /^[a-z]{2,9}$/.test(l.v || '') ? l.v : 'fra' };
  }
  if (o.rec && typeof o.rec === 'object') for (const k of Object.keys(d.rec)) {
    const r = o.rec[k]; if (!r || typeof r !== 'object') continue;
    d.rec[k].cid = str(r.cid, 60); d.rec[k].path = typeof r.path === 'string' && r.path.startsWith('/') ? r.path.slice(0, 500) : '/';
    if ('seg' in d.rec[k]) d.rec[k].seg = [0, 5, 10, 15, 30, 60].includes(r.seg) ? r.seg : d.rec[k].seg;
    if ('q' in d.rec[k]) d.rec[k].q = ['low', 'mid', 'high'].includes(r.q) ? r.q : 'mid';
  }
}
const defUser = () => ({ desk: BUILTIN_IDS.slice(), wp: { t: 'd', v: 0, fit: 'cover' }, conns: [], startPins: [], pl: Object.create(null), docs: Object.create(null), vp: [], vk: '', tuto: null, sync: { cid: '', cid2: '', auto: false, last: 0 }, proxy: '', ptoken: '', relay: { url: '', tok: '' }, lock: 30, ddg: true, welcomed: false, notes: [], tabHosts: [], os: { key: '', user: '', pass: '', lang: 'fr' },
  covers: Object.create(null), radio: { mine: [], last: { lang: '', genre: '', cc: '' } }, tv: { lists: [], fav: [], epg: '', epgs: [], epgHide: [], epgAuto: true, epgCat: '', last: { k: 'languages', v: 'fra' } }, rec: defRec() });
function normUser(o) {
  const d = defUser();
  if (!o || typeof o !== 'object') return d;
  if (Array.isArray(o.desk)) d.desk = o.desk.filter(x => typeof x === 'string' && x.length <= 80).slice(0, 300);
  if (Array.isArray(o.startPins)) d.startPins = [...new Set(o.startPins.filter(x => typeof x === 'string' && x.length <= 80))].slice(0, 200);   // applications épinglées dans le menu Démarrer
  if (o.wp && typeof o.wp === 'object') d.wp = { t: ['d', 'p', 'u'].includes(o.wp.t) ? o.wp.t : 'd', v: o.wp.t === 'u' ? str(o.wp.v, 3e6) : (Number.isInteger(o.wp.v) ? o.wp.v : 0), fit: ['cover', 'contain', '100% 100%'].includes(o.wp.fit) ? o.wp.fit : 'cover' };
  if (Array.isArray(o.conns)) d.conns = o.conns.filter(c => c && typeof c.id === 'string' && (c.type === 'dav' || c.type === undefined) && httpUrl(c.url)).slice(0, 50)   // anciennes connexions SFTP : supprimées
    .map(c => ({ id: c.id.slice(0, 60), type: 'dav', name: str(c.name, 60), url: httpUrl(c.url), user: str(c.user, 200), pass: str(c.pass, 500), base: str(c.base, 300), site: /^https:\/\//i.test(String(c.site || '')) ? (httpUrl(c.site) || '') : '', img: str(c.img, 80000), ...(c.relay === true ? { relay: true } : {}) }));
  if (o.pl && typeof o.pl === 'object') for (const k of Object.keys(o.pl)) {
    if (RESERVED.has(k) || !Array.isArray(o.pl[k])) continue;
    d.pl[k.slice(0, 40)] = o.pl[k].filter(t => t && typeof t.cid === 'string' && typeof t.path === 'string').slice(0, 2000).map(t => ({ name: str(t.name, 200), cid: t.cid.slice(0, 60), path: t.path.slice(0, 1000) }));
  }
  if (o.docs && typeof o.docs === 'object') for (const k of Object.keys(o.docs)) if (!RESERVED.has(k) && typeof o.docs[k] === 'string') d.docs[k.slice(0, 80)] = o.docs[k].slice(0, 2e6);
  d.proxy = str(o.proxy, 500); d.ptoken = str(o.ptoken, 300);
  if (Array.isArray(o.vp)) {   // « Playlist vidéos » : liens + catégories (les miniatures sont à part, dans IndexedDB, chiffrées avec vk)
    const seen = new Set();
    d.vp = o.vp.filter(x => x && typeof x.id === 'string' && x.id.length <= 60 && !seen.has(x.id) && seen.add(x.id) && httpUrl(x.url)).slice(0, 5000)
      .map(x => ({ id: x.id, title: str(x.title, 200) || 'Sans titre', url: httpUrl(x.url), cat: str(x.cat, 40), t: Number.isFinite(x.t) ? x.t : 0, p: x.p === true }));
  }
  d.sync = o.sync && typeof o.sync === 'object' ? { cid: str(o.sync.cid, 60), cid2: str(o.sync.cid2, 60), auto: o.sync.auto === true, last: Number.isFinite(o.sync.last) ? o.sync.last : 0 } : { cid: '', auto: false, last: 0 };
  d.vk = /^[A-Za-z0-9_-]{43}$/.test(String(o.vk || '')) ? o.vk : '';
  d.tuto = o.tuto && typeof o.tuto === 'object' && typeof o.tuto.name === 'string' && o.tuto.name ? { name: str(o.tuto.name, 200) } : null;   // nom du PDF « Tutoriel » (le fichier est dans IndexedDB, chiffré)
  if (o.relay && typeof o.relay === 'object') d.relay = { url: (/^https:\/\//i.test(String(o.relay.url || '')) || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(String(o.relay.url || ''))) ? (httpUrl(o.relay.url) || '') : '', tok: /^[\w.~+\/=-]{0,200}$/.test(String(o.relay.tok || '')) ? String(o.relay.tok || '') : '' };
  d.lock = Number.isFinite(o.lock) ? Math.min(240, Math.max(0, Math.round(o.lock))) : 30;
  d.ddg = o.ddg !== false; d.mlink = o.mlink !== false; d.welcomed = o.welcomed === true;
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
  normMedia(o, d);
  if (o.covers && typeof o.covers === 'object') { let n = 0; for (const k of Object.keys(o.covers)) { const c = o.covers[k]; if (RESERVED.has(k) || !c || typeof c !== 'object' || k.length > 700 || n >= 3000) continue;
    d.covers[k] = { u: /^https:\/\//i.test(String(c.u || '')) ? (httpUrl(c.u) || '').slice(0, 400) : '', t: str(c.t, 140) }; n++; } }
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
    failN = 0; SESSION = { user: u, key: r.key, data: r.data }; G.last = id;
    const mine = loadApps(id); G.apps = [...mine, ...G.apps.filter(a => !mine.some(m => m.url === a.url && m.name === a.name))];   // + éventuelles apps reprises d'une ancienne version
    G.store = loadStore(id, G.apps);
    saveG();
    return SESSION.data;
  } catch (e) {
    if (e.message === BAD_PW) { failN++; until = Date.now() + Math.min(30000, 1000 * 2 ** failN); }
    throw e;
  }
}
async function createUser(name, pw, seed, av) {
  name = String(name).trim(); pw = String(pw);
  if (name.length < 2 || name.length > 24 || /[\u0000-\u001f<>]/.test(name)) throw new Error('Nom : 2 à 24 caractères, sans < ni >.');
  if (G.users.some(u => u.name.toLowerCase() === name.toLowerCase())) throw new Error('Ce nom d’utilisateur existe déjà.');
  if (pw.length < 8) throw new Error('Mot de passe : 8 caractères minimum.');
  const id = uid(), salt = crypto.getRandomValues(new Uint8Array(16)), key = await deriveKey(pw, salt, ITER);
  const blob = await seal(key, normUser(seed), id);
  try { localStorage.setItem(UKEY(id), blob); } catch { throw new Error('Stockage local plein.'); }
  G.users.push({ id, name, salt: b64e(salt), iter: ITER, av: normAv(av) });
  if (!saveG()) { G.users.pop(); localStorage.removeItem(UKEY(id)); throw new Error('Stockage local plein.'); }
  return id;
}

/* Sauvegarde : regroupée (300 ms) puis chiffrée ; les écritures sont sérialisées. */
let timer = null, chain = Promise.resolve();
function save() { if (!SESSION) return; clearTimeout(timer); timer = setTimeout(flush, 300); onDirty(); }
function flush() {
  clearTimeout(timer);
  const s = SESSION; if (!s) return chain;
  chain = chain.then(async () => { try { localStorage.setItem(UKEY(s.user.id), await seal(s.key, s.data, s.user.id)); } catch { onSaveError(); } });
  return chain;
}
function lock() { clearTimeout(timer); SESSION = null; G.apps = []; G.store = []; }

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
function setAvatar(av) {   // change l'avatar de l'utilisateur connecté
  if (!SESSION) return false; const u = SESSION.user, old = u.av; u.av = normAv(av);
  if (!saveG()) { u.av = old; return false; } return true;
}
async function deleteUser(id, pw) {
  const u = G.users.find(x => x.id === id);
  if (!u) return;
  await unlockBlob(u, String(pw));
  localStorage.removeItem(UKEY(id)); localStorage.removeItem(AKEY(id)); localStorage.removeItem(SKEY(id)); setPending(id, false);
  G.users = G.users.filter(x => x.id !== id);
  if (G.last === id) G.last = '';
  saveG();
  if (SESSION && SESSION.user.id === id) lock();
}

/* Export / import : le PROFIL reste chiffré (inutilisable sans le mot de passe) ; le catalogue de l'App Store, les miniatures de la playlist et le PDF du tutoriel sont ajoutés NON chiffrés (v2). */
async function exportProfile(withMedia = true) {
  if (!SESSION) throw new Error('Session fermée.');
  await flush();
  const u = SESSION.user;
  const media = withMedia && typeof exportMedia === 'function' ? await exportMedia() : null;
  return JSON.stringify({ format: 'sormick-profile', v: 2, id: u.id, name: u.name, av: u.av || '', salt: u.salt, iter: u.iter, blob: localStorage.getItem(UKEY(u.id)), apps: G.apps, store: G.store, media });
}

/* Export vers l'ordinateur : TOUS les profils de cet appareil. Chaque profil reste chiffré par son propre mot de passe (il contient ses clouds, mots de passe
   WebDAV, relais et jetons) ET l'ensemble est chiffré une seconde fois par un « mot de passe d'export » choisi à l'export et redemandé à l'import
   (PBKDF2 + AES-GCM). Raccourcis, playlist, miniatures et PDF ne sont pas dans ce fichier : ils voyagent par le cloud. */
const EXPORT_AAD = 'sormick-profils';
async function exportAllProfiles(pass) {
  if (String(pass).length < 8) throw new Error('Mot de passe d’export : 8 caractères minimum.');
  if (SESSION) await flush();
  const profiles = G.users.map(u => ({ id: u.id, name: u.name, av: u.av || '', salt: u.salt, iter: u.iter, blob: localStorage.getItem(UKEY(u.id)) })).filter(p => p.blob);
  if (!profiles.length) throw new Error('Aucun profil à exporter.');
  const salt = crypto.getRandomValues(new Uint8Array(16)), key = await deriveKey(String(pass), salt, ITER);
  return JSON.stringify({ format: 'sormick-profiles', v: 2, enc: true, salt: b64e(salt), iter: ITER, blob: await seal(key, { profiles }, EXPORT_AAD) });
}
const profilesFileEncrypted = text => { try { const o = JSON.parse(text); return !!(o && o.format === 'sormick-profiles' && o.enc === true); } catch { return false; } };
/* Import d'un fichier de profils : lot « sormick-profiles » (mot de passe d'export requis) ou ancien fichier d'un seul profil */
async function importProfiles(text, pass) {
  if (String(text).length > 260e6) throw new Error('Fichier trop volumineux.');
  let o; try { o = JSON.parse(text); } catch { throw new Error('Fichier invalide.'); }
  if (!o || o.format !== 'sormick-profiles') return { ids: [await importProfile(text)], skipped: 0, bad: 0 };
  let list;
  if (o.enc === true) {
    if (typeof o.salt !== 'string' || typeof o.blob !== 'string' || !Number.isInteger(o.iter) || o.iter < 1e5 || o.iter > 5e6) throw new Error('Fichier invalide.');
    try { list = (await unseal(await deriveKey(String(pass || ''), b64d(o.salt), o.iter), o.blob, EXPORT_AAD)).profiles; } catch { throw new Error('Mot de passe d’export incorrect (ou fichier abîmé).'); }
  } else list = o.profiles;
  if (!Array.isArray(list)) throw new Error('Fichier invalide.');
  const ids = []; let skipped = 0, bad = 0;
  for (const p of list.slice(0, 50)) {
    try { ids.push(await importProfile(JSON.stringify({ ...p, format: 'sormick-profile', v: 2, light: true }))); } catch (e) { if (/existe déjà/.test(e.message)) skipped++; else bad++; }
  }
  if (!ids.length) throw new Error(skipped ? 'Ces profils existent déjà sur cet appareil : connectez-vous avec leur mot de passe.' : 'Aucun profil valide dans ce fichier.');
  return { ids, skipped, bad };
}
async function importProfile(text) {
  if (String(text).length > 260e6) throw new Error('Fichier trop volumineux.');
  let o; try { o = JSON.parse(text); } catch { throw new Error('Fichier invalide.'); }
  if (!o || o.format !== 'sormick-profile' || !ID_RE.test(o.id) || typeof o.blob !== 'string' || typeof o.salt !== 'string' || !Number.isInteger(o.iter) || o.iter < 1e5 || o.iter > 5e6) throw new Error('Profil invalide.');
  if (G.users.some(u => u.id === o.id)) throw new Error('Ce profil existe déjà sur cet appareil.');
  try { if (b64d(o.salt).length !== 16 || b64d(o.blob).length < 29) throw 0; } catch { throw new Error('Profil invalide.'); }
  const base = str(o.name, 24) || 'Profil'; let name = base, k = 2;
  while (G.users.some(u => u.name.toLowerCase() === name.toLowerCase())) name = base.slice(0, 20) + ' ' + k++;
  try { localStorage.setItem(UKEY(o.id), o.blob); } catch { throw new Error('Stockage local plein.'); }
  try { if (Array.isArray(o.apps)) localStorage.setItem(AKEY(o.id), JSON.stringify(cleanApps(o.apps))); if (Array.isArray(o.store)) localStorage.setItem(SKEY(o.id), JSON.stringify(cleanApps(o.store))); } catch { localStorage.removeItem(UKEY(o.id)); throw new Error('Stockage local plein.'); }
  G.users.push({ id: o.id, name, salt: o.salt, iter: o.iter, av: normAv(o.av) }); saveG();
  if (o.light === true && !Array.isArray(o.apps) && !o.media) setPending(o.id, true);
  if (o.media && typeof importMedia === 'function') { try { await importMedia(o.id, o.media); } catch { /* miniatures / PDF non restaurés : le profil reste importé */ } }
  return o.id;
}
