'use strict';
/* chat.js — application intégrée « Sormick Tchat ».
   Discussion entre utilisateurs (profils et appareils différents) SANS serveur à nous : les messages sont de petits fichiers chiffrés déposés dans un dossier de VOTRE cloud WebDAV
   (par défaut « sormick-chat/<identifiant de la conversation>/ »). Chaque appareil relit ce dossier toutes les quelques secondes.
   - Chiffrement de bout en bout : une clé AES-256 par conversation, connue seulement des participants (elle voyage dans le code d'invitation, jamais sur le cloud). Le cloud ne voit que des octets illisibles.
   - Nom d'un fichier message : <horodatage sur 13 chiffres>-<6 premiers caractères de l'identifiant de l'expéditeur>-<4 hasard>.m  (contenu : IV 12 octets + AES-GCM(JSON), données associées = identifiant de conversation)
   - Pièces jointes (photos, fichiers, GIF) : f-<12 hasard>.b dans le même dossier (IV + AES-GCM des octets), 25 Mo au maximum.
   - Le code d'invitation (SMC1-…) contient : identifiant, clé, nom de la conversation, nom du dossier et l'adresse du cloud (indication). JAMAIS d'identifiant ni de mot de passe WebDAV : chacun se connecte avec son propre accès. */

const CHAT_DIR = 'sormick-chat', CHAT_MAXF = 25 * 1048576, CHAT_PAGE = 60, CHAT_ROOMS = 30;
const CHAT_IMG = /^image\/(png|jpeg|webp|gif|avif)$/;
const chex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
const cbEnc = u8 => b64e(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const cbDec = s => b64d(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4));
const chatMe = () => { const c = D.chat; if (!c.id) { c.id = chex(16); save(); } return c; };
const chatName = () => (chatMe().name || (SESSION && SESSION.user.name) || 'Moi').slice(0, 40);
const chatConn = r => D.conns.find(c => c.id === r.cid) || null;
const chatPath = r => '/' + r.p + '/' + r.id + '/';
const chatKeys = new Map();
async function chatKey(r) { let k = chatKeys.get(r.k); if (!k) { k = await crypto.subtle.importKey('raw', cbDec(r.k), 'AES-GCM', false, ['encrypt', 'decrypt']); chatKeys.set(r.k, k); } return k; }
async function chatSeal(r, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: TE.encode(r.id) }, await chatKey(r), bytes));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return new Blob([out], { type: 'application/octet-stream' });
}
async function chatOpen(r, buf) { const u = new Uint8Array(buf); return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12), additionalData: TE.encode(r.id) }, await chatKey(r), u.slice(12))); }
const chatInvite = (r, pre = 'SMC1-') => { const c = chatConn(r); let h = ''; try { h = c ? new URL(c.url).host : ''; } catch { /* sans indication */ } return pre + cbEnc(TE.encode(JSON.stringify({ i: r.id, k: r.k, n: r.n, p: r.p, h }))); };
function chatParse(code, pre = 'SMC1-') {
  try {
    const m = new RegExp(pre + '([A-Za-z0-9_-]{40,900})').exec(String(code || '').replace(/\s+/g, '')); if (!m) return null;
    const j = JSON.parse(TD.decode(cbDec(m[1])));
    if (!/^[a-f0-9]{16}$/.test(j.i) || !/^[A-Za-z0-9_-]{43}$/.test(j.k)) return null;
    return { id: j.i, k: j.k, n: String(j.n || '').slice(0, 60), p: /^[A-Za-z0-9._-]{1,60}$/.test(j.p) ? j.p : CHAT_DIR, h: String(j.h || '').replace(/[^A-Za-z0-9.:-]/g, '').slice(0, 100) };
  } catch { return null; }
}
const chatFile = n => String(n || 'fichier').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'fichier';
const chatMsgName = () => String(Date.now()).padStart(13, '0') + '-' + chatMe().id.slice(0, 6) + '-' + chex(2) + '.m';
const MSG_RE = /^(\d{13})-([a-f0-9]{6})-[a-f0-9]{4}\.m$/;
const chatTime = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const chatDay = t => new Date(t).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

/* ---- emojis (pas de texte à traduire : le dessin suffit) ---- */
const CHAT_EMO = [
  ['😀', 'Visages', '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫡 🤭 🫢 🤫 🫠 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 ☠️ 👽 🤖 🎃'],
  ['👍', 'Gestes', '👍 👎 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👋 🤚 🖐️ ✋ 🖖 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 💪 🦾 🙋 🙆 🙅 🤷 🤦 🙇 🧍 🚶 🏃 💃 🕺 👀 👁️ 👅 👄 🧠'],
  ['❤️', 'Cœurs', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❤️‍🔥 💕 💞 💓 💗 💖 💘 💝 💟 💋 💯 💢 💥 💫 💦 💨 🕳️ 💬 💭 💤 ✨ ⭐ 🌟 🔥 🎉 🎊 🎈 🎁 🏆 🥇 🏅'],
  ['🐶', 'Animaux et nature', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🐢 🐍 🦎 🐙 🦑 🦀 🐠 🐟 🐬 🐳 🦈 🐘 🦒 🦓 🐪 🐑 🐐 🐓 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍁 🍂 🌸 🌼 🌻 🌹 🌷 🌞 🌝 🌙 ⭐ ☁️ ⛅ 🌧️ ⛈️ ❄️ ☃️ 🌈 🌊'],
  ['🍕', 'Nourriture', '🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥕 🌽 🌶️ 🥔 🍞 🥐 🥖 🧀 🥚 🍳 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🍤 🍙 🍚 🍦 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍿 ☕ 🍵 🥤 🍺 🍻 🥂 🍷 🍸 🍹 🍾'],
  ['⚽', 'Activités', '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🥋 ⛳ 🎣 🎿 🏂 🏄 🚴 🏊 🧘 🎮 🕹️ 🎲 🧩 🎯 🎳 🎭 🎨 🎬 🎤 🎧 🎸 🎹 🥁 🎻 🎺'],
  ['🚗', 'Voyage et lieux', '🚗 🚕 🚌 🚎 🏎️ 🚓 🚑 🚒 🚚 🚜 🏍️ 🚲 🛴 ✈️ 🚀 🛸 🚁 ⛵ 🚤 🚢 🚂 🚆 🚇 🏠 🏡 🏢 🏥 🏫 🏰 🗼 🗽 ⛪ 🕌 🏖️ 🏝️ 🏔️ 🌋 🗺️ ⛺ 🌅 🌄 🌃 🎡 🎢'],
  ['💡', 'Objets et symboles', '⌚ 📱 💻 🖥️ ⌨️ 🖱️ 📷 📹 🎥 📺 📻 ⏰ ⌛ 🔋 💡 🔦 📚 📖 📝 ✏️ 📎 📌 📍 ✂️ 🔒 🔓 🔑 🔨 🛠️ ⚙️ 💰 💳 📦 📬 📅 📈 ✅ ❌ ⭕ ❗ ❓ ⚠️ ➕ ➖ ✔️ ➡️ ⬅️ ⬆️ ⬇️ 🔔 🔕 🎵 🎶 ♻️ 🏁 🚩']
].map(([i, t, s]) => [i, t, s.split(' ').filter(Boolean)]);

const chatErr = e => e && e.code === 'net' ? e.message : (e && e.message) || 'Erreur inconnue.';
function chatCloudPicker(hint, onChange) {
  const box = el('div', { className: 'col' }), st = el('div', { className: 'chat-st' });
  let sel = null, tok = 0;
  const test = async c => {
    const my = ++tok; st.className = 'chat-st'; st.textContent = tr('Test de la connexion…');
    try { await FS.list(c, '/'); if (my !== tok) return; st.className = 'chat-st ok'; st.textContent = tr('Connexion réussie : ce cloud peut servir de boîte aux lettres.'); onChange(c); }
    catch (e) { if (my !== tok) return; st.className = 'chat-st bad'; st.textContent = tr('Connexion impossible : {0}').replace('{0}', chatErr(e)); onChange(null); }
  };
  const draw1 = () => {
    const cs = D.conns, pre = sel && cs.find(c => c.id === sel.id);
    if (!pre) { sel = null; }
    if (!sel && hint && cs.length) { const m = cs.find(c => { try { return new URL(c.url).host === hint; } catch { return false; } }); if (m) { sel = m; setTimeout(() => test(m), 0); } }
    if (!sel && cs.length === 1) { sel = cs[0]; setTimeout(() => test(sel), 0); }
    box.replaceChildren(
      ...(cs.length ? [] : [el('div', { className: 'warn', textContent: 'Aucun cloud WebDAV n’est encore connecté sur ce profil. Cliquez sur « Ajouter un cloud WebDAV », saisissez l’adresse, l’utilisateur et le mot de passe (ou le jeton) de votre fournisseur, puis revenez ici.' })]),
      ...cs.map(c => el('button', { type: 'button', className: 'chat-cl' + (sel && sel.id === c.id ? ' on' : ''), onclick: () => { sel = c; draw1(); test(c); } },
        appIcon(connApp('c:' + c.id) || { name: c.name || c.url, icon: 'cloud', c: ['#35c8ea', '#3a7bd5'] }, 34),
        el('span', { className: 'grow' }, el('b', { nt: 1, textContent: c.name || c.url }), el('small', { className: 'mut', nt: 1, textContent: c.user + ' · ' + c.url })),
        sel && sel.id === c.id ? ico('check', 18) : null)),
      el('div', { className: 'row tight' }, btn('Ajouter un cloud WebDAV', 'plus', () => connWin(true)), btn('Actualiser la liste', 'refresh', draw1)), st);
  };
  VIEWS.add(draw1); draw1();
  return { el: box, dispose: () => VIEWS.delete(draw1), get: () => sel };
}

function chatInviteBody(r, pre, app, done) {
  const code = chatInvite(r, pre), box = el('textarea', { readOnly: true, rows: 4, className: 'chat-code', value: code, 'aria-label': tr('Code d’invitation') });
  box.onfocus = () => box.select();
  return [el('p', { textContent: tr('Voici le code d’invitation. Envoyez-le à la personne (message, e-mail…). Elle ouvre « {0} », clique sur « Rejoindre avec un code », colle le code, choisit son accès au même cloud : c’est tout.').replace('{0}', tr(app)) }), box,
    el('div', { className: 'row' }, btn('Copier le code', 'copy', () => copyText(code), 'pri'), navigator.share ? btn('Partager…', 'upload', () => navigator.share({ title: tr('Invitation'), text: code }).catch(() => {})) : null),
    el('div', { className: 'warn', textContent: 'Ce code contient la clé de chiffrement : ne le publiez pas, envoyez-le seulement aux personnes à inviter. Il ne contient aucun mot de passe de cloud.' }),
    el('div', { className: 'row' }, btn('Ouvrir', 'check', done, 'pri'))];
}

/* Prépare une pièce jointe : les grandes photos (téléphone) sont réduites à 2000 px en JPEG, le reste part tel quel. */
async function chatPrepFile(file) {
  let blob = file, name = chatFile(file.name), mime = file.type || mimeOf(name) || 'application/octet-stream';
  if (/^image\/(jpeg|png|webp)$/.test(mime) && file.size > 1.5 * 1048576) {
    try { const bm = await createImageBitmap(file), k = Math.min(1, 2000 / Math.max(bm.width, bm.height)), cv = document.createElement('canvas'); cv.width = Math.round(bm.width * k); cv.height = Math.round(bm.height * k); cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height);
      const b = await new Promise(rs => cv.toBlob(rs, 'image/jpeg', .86)); if (b && b.size < file.size) { blob = b; mime = 'image/jpeg'; name = name.replace(/\.[A-Za-z0-9]+$/, '') + '.jpg'; } } catch { /* envoi tel quel */ }
  }
  return { blob, name, mime };
}
/* Télécommande de TV : dans une zone de texte les flèches déplacent le curseur ; au bord du texte elles sortent vers un bouton voisin (sinon on y reste bloqué). */
function chatTvEdge(ta, go) {
  ta.addEventListener('keydown', e => {
    if (document.documentElement.dataset.dev !== 'tv' || e.defaultPrevented || !/^Arrow(Up|Down|Left|Right)$/.test(e.key)) return;
    const a = ta.selectionStart === 0 && ta.selectionEnd === 0, z = ta.selectionStart === ta.value.length && ta.selectionEnd === ta.selectionStart;
    if (!((e.key === 'ArrowUp' || e.key === 'ArrowLeft') ? a : z)) return;
    const t = go(e.key); if (t) { e.preventDefault(); t.focus(); }
  });
}

/* Petite fenêtre (emojis, GIF, options) : titre + croix de fermeture, commune à Tchat et Konekt. */
function chatPopHead(title, close) { return el('div', { className: 'chat-ph' }, el('b', { textContent: title }), btn('', 'x', close, 'chat-px', 'Fermer')); }

/* Recherche de GIF dans une fenêtre interne (GIPHY). Clé gratuite personnelle (D.chat.gk, dans le profil chiffré) : l'API Tenor a fermé le 30/06/2026.
   Les miniatures sont chargées depuis giphy.com ; le GIF choisi est envoyé comme simple adresse https (g) : ses destinataires le chargent aussi depuis giphy.com. */
const CHAT_GIPHY = 'https://api.giphy.com/v1/gifs/';
const chatGiphyOk = u => { try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)giphy\.com$/i.test(x.hostname); } catch { return false; } };
function chatGifBox({ pick, device, close }) {
  const root = el('div', { className: 'col chat-gb' }), lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
  let q = '', off = 0, busy = false, timer = 0, token = 0;
  const grid = el('div', { className: 'chat-gg' }), msg = el('div', { className: 'chat-st', hidden: true }), more = btn('Plus de GIF', 'refresh', () => load(true), 'sm'), search = el('input', { type: 'search', className: 'chat-gs', placeholder: 'Chercher un GIF (ex. : bravo, chat, merci)', maxLength: 50, autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': 'Chercher un GIF' });
  more.hidden = true;
  const say = (t, bad) => { msg.hidden = !t; msg.className = 'chat-st ' + (bad ? 'bad' : 'ok'); msg.textContent = t ? tr(t) : ''; };
  const pickable = g => { const im = g && g.images || {}, f = im.downsized_medium || im.fixed_height || im.downsized || im.original; return f && chatGiphyOk(f.url) ? f.url : ''; };
  const thumb = g => { const im = g.images || {}, t = im.fixed_width_small || im.fixed_width || im.fixed_height || im.downsized; return t && chatGiphyOk(t.url) ? t : null; };
  async function load(next) {
    const my = ++token; if (!next) { off = 0; grid.replaceChildren(); more.hidden = true; } say('');
    const key = D.chat.gk; if (!key) return;
    busy = true; const w = el('small', { className: 'mut', textContent: tr('Recherche…') }); root.append(w);
    try {
      const u = new URL(CHAT_GIPHY + (q ? 'search' : 'trending'));
      u.searchParams.set('api_key', key); if (q) u.searchParams.set('q', q); u.searchParams.set('limit', '18'); u.searchParams.set('offset', String(off)); u.searchParams.set('rating', 'pg-13'); if (q) u.searchParams.set('lang', lang);
      const r = await fetch(u, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000) });
      if (my !== token) return;
      if (r.status === 401 || r.status === 403) { say('Clé GIPHY refusée : vérifiez-la (bouton « Changer la clé »).', true); return; }
      if (r.status === 429) { say('Limite GIPHY atteinte : réessayez dans un moment.', true); return; }
      if (!r.ok) { say('GIPHY ne répond pas correctement. Réessayez plus tard.', true); return; }
      const j = await r.json(), list = (Array.isArray(j.data) ? j.data : []).filter(g => pickable(g) && thumb(g));
      off += Array.isArray(j.data) ? j.data.length : 0;
      grid.append(...list.map(g => { const t = thumb(g), b = el('button', { type: 'button', className: 'chat-gt', title: tr('Envoyer ce GIF'), 'aria-label': tr('Envoyer ce GIF') + (g.title ? ' : ' + g.title : ''), onclick: () => pick(pickable(g)) }, el('img', { src: t.url, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' })); return b; }));
      if (!grid.children.length) say('Aucun GIF trouvé.', true);
      const tot = j.pagination && Number.isFinite(j.pagination.total_count) ? j.pagination.total_count : 0; more.hidden = !list.length || (tot && off >= tot) || off >= 120;
    } catch { if (my === token) say('Impossible de joindre GIPHY (connexion ou bloqueur de publicités).', true); }
    finally { w.remove(); if (my === token) busy = false; }
  }
  const go = () => { q = search.value.trim().slice(0, 50); load(false); };
  search.oninput = () => { clearTimeout(timer); timer = setTimeout(go, 600); };
  search.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); go(); } };
  const url = el('input', { type: 'url', placeholder: 'https://…', inputMode: 'url', autocapitalize: 'off', spellcheck: false, maxLength: 500, 'aria-label': 'Adresse du GIF' }), prev = el('div', { className: 'chat-gp' });
  const show = () => { const u = httpUrl(url.value.trim()); prev.replaceChildren(u ? el('img', { src: u, alt: '', referrerPolicy: 'no-referrer' }) : ''); return u; };
  url.oninput = show; const goUrl = () => { const u = show(); if (!u || !/^https:\/\//i.test(u)) return toast('Adresse invalide : une adresse https:// est requise.'); pick(u); };
  url.onkeydown = e => { if (e.key === 'Enter') goUrl(); };
  const other = el('details', { className: 'chat-go' }, el('summary', { textContent: tr('Autres façons d’ajouter un GIF') }), btn('Choisir un GIF sur cet appareil', 'image', device, 'sm'), el('small', { className: 'mut', textContent: 'ou coller l’adresse https:// d’un GIF (clic droit → copier l’adresse de l’image) :' }), url, prev, btn('Envoyer ce GIF', 'send', goUrl, 'sm'));
  const attrib = el('small', { className: 'mut', nt: 1, textContent: 'Powered by GIPHY' });
  function setup() {
    root.replaceChildren(
      el('p', { textContent: 'Pour chercher des GIF ici, il faut une clé GIPHY personnelle et gratuite (à créer une seule fois) :' }),
      el('ol', { className: 'chat-gl' }, el('li', {}, el('a', { href: 'https://developers.giphy.com/dashboard/', target: '_blank', rel: 'noopener noreferrer', textContent: tr('Ouvrir developers.giphy.com') }), ' ' + tr('→ créez un compte gratuit, puis « Create an App » (type API).')), el('li', { textContent: tr('Copiez la clé « API Key » affichée.') }), el('li', { textContent: tr('Collez-la ci-dessous et enregistrez : elle reste dans votre profil chiffré.') })),
      key, el('div', { className: 'row' }, btn('Enregistrer la clé', 'check', () => { const v = key.value.trim(); if (!/^[A-Za-z0-9]{16,80}$/.test(v)) return toast('Clé invalide : lettres et chiffres uniquement (16 à 80 caractères).'); D.chat.gk = v; save(); ready(); }, 'pri')),
      el('small', { className: 'mut', textContent: 'Les GIF viennent du service GIPHY : GIPHY voit les recherches faites depuis votre navigateur, et les destinataires chargent le GIF depuis giphy.com.' }), other, attrib);
  }
  const key = el('input', { type: 'text', placeholder: 'Clé API GIPHY', maxLength: 80, autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': 'Clé API GIPHY' });
  function ready() {
    root.replaceChildren(search, msg, grid, more, el('div', { className: 'row' }, btn('Changer la clé', 'key', () => { key.value = D.chat.gk || ''; setup(); }, 'sm'), attrib), other);
    q = ''; load(false); search.focus();
  }
  if (D.chat.gk) ready(); else setup();
  return root;
}

/* Liens de vidéos et de musique (YouTube, Dailymotion, Vimeo, Rutube, Youku, Bilibili, Twitch, TikTok, Odysee, Niconico, Spotify, SoundCloud, Deezer, Apple Music, Bandcamp, Mixcloud, Tidal, Audiomack…) :
   chaque lien reconnu devient une carte cliquable qui s'ouvre dans un nouvel onglet. Rien n'est lu ni téléchargé : seul le lien est ouvert (miniature chargée uniquement pour YouTube et Dailymotion).
   Un lien n'est reconnu que s'il pointe vers une page précise (pas la page d'accueil) ; les liens https sont ouverts tels quels, sans identifiants. */
const CHAT_MEDIA = [
  ['YouTube', 'v', /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)$/],
  ['Dailymotion', 'v', /^(?:www\.|geo\.)?(?:dailymotion\.com|dai\.ly)$/], ['Vimeo', 'v', /^(?:www\.|player\.)?vimeo\.com$/], ['Rutube', 'v', /^(?:www\.)?rutube\.ru$/],
  ['Youku', 'v', /^(?:[\w-]+\.)?youku\.com$/], ['Bilibili', 'v', /^(?:www\.|m\.)?(?:bilibili\.com|b23\.tv)$/], ['Twitch', 'v', /^(?:www\.|m\.|clips\.)?twitch\.tv$/],
  ['TikTok', 'v', /^(?:www\.|vm\.|m\.)?tiktok\.com$/], ['Odysee', 'v', /^(?:www\.)?odysee\.com$/], ['Niconico', 'v', /^(?:www\.|sp\.)?(?:nicovideo\.jp|nico\.ms)$/], ['Facebook Watch', 'v', /^(?:www\.|m\.)?(?:facebook\.com|fb\.watch)$/],
  ['Instagram', 'v', /^(?:www\.)?instagram\.com$/], ['Kick', 'v', /^(?:www\.)?kick\.com$/], ['VK Vidéo', 'v', /^(?:www\.|m\.)?(?:vk\.com|vkvideo\.ru)$/], ['Arte', 'v', /^(?:www\.)?arte\.tv$/], ['France.tv', 'v', /^(?:www\.)?france\.tv$/],
  ['Spotify', 'm', /^(?:open\.|play\.)?spotify\.com$|^spotify\.link$/], ['SoundCloud', 'm', /^(?:www\.|m\.|on\.)?soundcloud\.com$/], ['Deezer', 'm', /^(?:www\.)?deezer\.com$|^link\.deezer\.com$|^dzr\.page\.link$/],
  ['Apple Music', 'm', /^(?:music|embed\.music)\.apple\.com$/], ['Bandcamp', 'm', /^(?:[\w-]+\.)?bandcamp\.com$/], ['Mixcloud', 'm', /^(?:www\.)?mixcloud\.com$/], ['Tidal', 'm', /^(?:listen\.|www\.)?tidal\.com$/],
  ['Audiomack', 'm', /^(?:www\.)?audiomack\.com$/], ['Qobuz', 'm', /^(?:open\.|play\.|www\.)?qobuz\.com$/], ['Amazon Music', 'm', /^music\.amazon\.[a-z.]{2,6}$/], ['NetEase Music', 'm', /^(?:music\.163\.com|y\.music\.163\.com)$/], ['QQ Music', 'm', /^y\.qq\.com$/]
];
function chatMediaInfo(raw) {
  try {
    const u = new URL(raw); if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    const h = u.hostname.toLowerCase(), path = u.pathname.replace(/\/+$/, '');
    for (const [name, kind, re] of CHAT_MEDIA) {
      if (!re.test(h)) continue;
      if (name === 'YouTube') {
        const p = u.pathname.split('/'); let id = '';
        if (/youtu\.be$/.test(h)) id = p[1] || ''; else id = p[1] === 'watch' ? (u.searchParams.get('v') || '') : ['shorts', 'embed', 'live', 'v'].includes(p[1]) ? (p[2] || '') : '';
        if (!/^[\w-]{11}$/.test(id)) return null;
        const t = u.searchParams.get('t') || u.searchParams.get('start') || '', sec = /^\d{1,6}s?$/.test(t) ? parseInt(t, 10) : 0;
        return { name: h.startsWith('music.') ? 'YouTube Music' : name, kind: h.startsWith('music.') ? 'm' : kind, href: (h.startsWith('music.') ? 'https://music.youtube.com/watch?v=' : 'https://www.youtube.com/watch?v=') + id + (sec ? '&t=' + sec + 's' : ''), thumb: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg', key: 'y' + id };
      }
      if (path.length < 2) return null;   // page d'accueil : simple lien
      let thumb = '';
      if (name === 'Dailymotion') { const m = /\/video\/([a-z0-9]{5,12})/i.exec(u.pathname) || (/dai\.ly$/.test(h) ? /^\/([a-z0-9]{5,12})$/i.exec(u.pathname) : null); if (m) thumb = 'https://www.dailymotion.com/thumbnail/video/' + m[1]; else return null; }
      return { name, kind, href: 'https://' + u.host + u.pathname + u.search, thumb, key: h + path };
    }
  } catch { /* adresse illisible */ }
  return null;
}
function chatMediaCards(text) {
  const seen = new Set(), out = [];
  for (const m of String(text || '').matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const y = chatMediaInfo(m[0].replace(/[).,;!?]+$/, '')); if (!y || seen.has(y.key) || seen.size >= 4) continue; seen.add(y.key);
    const lab = tr(y.kind === 'm' ? 'Ouvrir cette musique dans un nouvel onglet' : 'Ouvrir cette vidéo dans un nouvel onglet');
    out.push(el('a', { className: 'chat-yt' + (y.thumb ? '' : ' nothumb'), href: y.href, target: '_blank', rel: 'noopener noreferrer', title: lab, 'aria-label': lab + ' : ' + y.name },
      el('span', { className: 'chat-ytp' }, y.thumb ? el('img', { src: y.thumb, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', onerror: ev => ev.target.remove() }) : null, el('i', {}, ico(y.kind === 'm' ? 'music' : 'play', y.thumb ? 26 : 22))),
      el('span', { className: 'chat-ytl' }, el('b', { nt: 1, textContent: y.name }), el('small', { textContent: y.kind === 'm' ? 'Musique : cliquer pour écouter dans un nouvel onglet' : 'Vidéo : cliquer pour regarder dans un nouvel onglet' }))));
  }
  return out;
}

/* Sélecteur « Vidéo / musique » (Tchat et Konekt) : coller un lien (YouTube, Dailymotion, SoundCloud, Spotify…) ou choisir dans « Playlist Medias ».
   Le lien (avec son titre) est ajouté au texte en cours d'écriture : à l'envoi, il devient une carte cliquable. Rien n'est téléchargé ni lu ici. */
function chatMediaBox({ pick, close }) {
  const root = el('div', { className: 'col chat-mb' }), MAXN = 4;
  let tab = 'v', q = ''; const sel = new Map();
  const url = el('input', { type: 'url', className: 'chat-ms', placeholder: 'Coller un lien (YouTube, SoundCloud…)', maxLength: 2000, inputMode: 'url', autocapitalize: 'off', spellcheck: false, 'aria-label': tr('Lien de la vidéo ou de la musique') });
  const info = el('small', { className: 'mut chat-mi', 'aria-live': 'polite' });
  const norm = () => { let raw = url.value.trim(); if (raw && !/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'https://' + raw; return raw ? (httpUrl(raw) || '') : ''; };
  const upd = () => { const raw = norm(), inf = raw ? chatMediaInfo(raw) : null; info.textContent = !url.value.trim() ? '' : !raw ? tr('Lien invalide : une adresse http(s):// est requise.') : inf ? tr('Fournisseur reconnu : {0}.').replace('{0}', inf.name) + ' ' + tr(inf.kind === 'm' ? 'Musique' : 'Vidéo') : tr('Lien non reconnu comme vidéo ou musique : il apparaîtra comme un simple lien.'); addB.disabled = !raw; saveB.disabled = !raw; };
  const addB = btn('Insérer ce lien', 'plus', () => { const raw = norm(); if (!raw) return upd(); const inf = chatMediaInfo(raw); pick([{ url: raw, title: '' }]); }, 'pri'), saveB = btn('Aussi dans Playlist Medias', 'list', () => {
    const raw = norm(); if (!raw || typeof D.vp === 'undefined') return;
    if (D.vp.some(x => x.url === raw)) return toast('Ce lien est déjà dans « Playlist Medias ».');
    if (D.vp.length >= 5000) return toast('Limite de 5 000 vidéos atteinte.', 5000);
    const inf = chatMediaInfo(raw); D.vp.push({ id: uid(), title: (inf ? inf.name : new URL(raw).hostname).slice(0, 200), url: raw, cat: '', t: Date.now(), p: false, k: inf && inf.kind === 'm' ? 'm' : 'v' }); save(); toast('Ajouté à « Playlist Medias ».', 3500); draw();
  }, 'sm', 'Garder ce lien dans l’application Playlist Medias');
  url.oninput = upd; url.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addB.click(); } };
  const tabV = el('button', { type: 'button', className: 'vptab', onclick: () => { tab = 'v'; draw(); } }), tabM = el('button', { type: 'button', className: 'vptab', onclick: () => { tab = 'm'; draw(); } });
  const search = el('input', { type: 'search', className: 'chat-ms', placeholder: 'Rechercher dans ma playlist…', maxLength: 100, 'aria-label': tr('Rechercher dans ma playlist'), oninput: () => { q = search.value; draw(); } });
  const list = el('div', { className: 'chat-ml', role: 'listbox', 'aria-multiselectable': 'true' }), goB = btn('', 'send', () => { const a = [...sel.values()].map(x => ({ url: x.url, title: x.title })); if (a.length) pick(a); }, 'pri');
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function draw() {
    const vp = (typeof D.vp !== 'undefined' && D.vp) || [], kd = x => x.k === 'm' ? 'm' : 'v';
    tabV.textContent = tr('Vidéos') + ' (' + vp.filter(x => kd(x) === 'v').length + ')'; tabM.textContent = tr('Musique') + ' (' + vp.filter(x => kd(x) === 'm').length + ')';
    for (const [b, k] of [[tabV, 'v'], [tabM, 'm']]) { b.classList.toggle('on', tab === k); b.setAttribute('aria-pressed', String(tab === k)); }
    const s = fold(q.trim()), items = vp.filter(x => kd(x) === tab && (!s || fold(x.title + ' ' + x.cat + ' ' + x.url).includes(s))).sort((a, b) => (b.t || 0) - (a.t || 0));
    list.replaceChildren(...(items.length ? items.slice(0, 80).map(it => { const inf = chatMediaInfo(it.url), on = sel.has(it.id);
      return el('button', { type: 'button', className: 'chat-mrow' + (on ? ' on' : ''), role: 'option', 'aria-selected': String(on), title: it.url, onclick: () => { if (sel.has(it.id)) sel.delete(it.id); else if (sel.size >= MAXN) return toast(tr('{0} médias au maximum par message.').replace('{0}', MAXN), 3500); else sel.set(it.id, it); draw(); } },
        el('span', { className: 'chat-mth' }, inf && inf.thumb ? el('img', { src: inf.thumb, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', onerror: ev => ev.target.remove() }) : null, el('i', {}, ico(tab === 'm' ? 'music' : 'play', 20))),
        el('span', { className: 'chat-mtx' }, el('b', { nt: 1, textContent: it.title }), el('small', { nt: 1, textContent: [inf && inf.name, it.cat].filter(Boolean).join(' · ') || hostOf(it.url) })),
        el('span', { className: 'chat-mck' }, on ? ico('check', 18) : null)); })
      : [el('p', { className: 'mut chat-me', textContent: vp.length ? 'Rien ne correspond.' : 'Votre « Playlist Medias » est vide : collez un lien ci-dessus, ou ouvrez l’application pour en ajouter.' })]));
    goB.replaceChildren(ico('send', 16), document.createTextNode(' ' + (sel.size ? tr('Insérer la sélection ({0})').replace('{0}', sel.size) : tr('Choisissez un média')))); goB.disabled = !sel.size;
  }
  root.append(el('b', { textContent: 'Coller un lien' }), el('div', { className: 'row chat-mr' }, url), info, el('div', { className: 'row' }, addB, saveB),
    el('b', { textContent: 'Ou choisir dans ma Playlist Medias' }), el('div', { className: 'row' }, tabV, tabM), search, list,
    el('div', { className: 'row' }, goB, typeof videoPlaylistWin === 'function' ? btn('Ouvrir Playlist Medias', 'list', () => { close && close(); videoPlaylistWin(); }, 'sm') : null));
  draw(); upd(); setTimeout(() => url.focus(), 0);
  return root;
}
/* ajoute des médias (titre + lien) au texte d'un champ de saisie */
function chatInsertMedia(ta, items) {
  const add = items.map(i => (i.title ? i.title + '\n' : '') + i.url).join('\n'), cur = ta.value;
  ta.value = cur + (cur && !/\s$/.test(cur) ? '\n' : '') + add; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
}

/* Agrandissement d'une image / d'un GIF : croix toujours visible en haut à droite (sur tous les écrans), Échap, ou clic n'importe où. */
function chatLightbox(url) {
  const prev = document.activeElement, close = () => { ov.remove(); if (prev && prev.focus && prev.isConnected) prev.focus(); };
  const x = btn('', 'x', e => { e.stopPropagation(); close(); }, 'chat-lbx', 'Fermer');
  const ov = el('div', { className: 'ov chat-lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('Image'), onclick: close, onkeydown: e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } } }, el('img', { src: url, alt: '', referrerPolicy: 'no-referrer' }), x);
  document.body.append(ov); x.focus();
}

let CHATWIN = null;
function chatWin(roomId) {
  if (CHATWIN && WINS.has(CHATWIN.rec)) { CHATWIN.w.hidden = false; CHATWIN.w.style.zIndex = ++Z; if (roomId) CHATWIN.open(roomId); return; }
  chatMe(); D.chat.rooms = D.chat.rooms || [];
  const S = { cur: null, view: '', items: [], names: [], first: 0, cache: new Map(), imgs: new Map(), busy: false, dead: false, err: '', timer: 0, loading: false, wiz: null, ip: new Map(), sig: '' };
  const root = el('div', { className: 'chat' }), side = el('div', { className: 'chat-side' }), main = el('div', { className: 'chat-main' });
  root.append(side, main);
  const w = win('Sormick Tchat', 'chat', [root], { w: 940, h: 620, cls: 'chatw', onclose: () => { S.dead = true; clearInterval(S.timer); for (const u of S.imgs.values()) URL.revokeObjectURL(u); S.imgs.clear(); VIEWS.delete(draw); CHATWIN = null; } });
  const rec = [...WINS].find(r => r.w === w);
  new ResizeObserver(() => root.classList.toggle('narrow', w.clientWidth < 660)).observe(w);
  const room = () => D.chat.rooms.find(r => r.id === S.cur) || null;
  const errText = chatErr;
  const open = id => { S.cur = id; S.view = id ? 'chat' : 'welcome'; S.items = []; S.names = []; S.cache = new Map(); S.err = ''; S.sig = ''; S.first = 0; root.classList.remove('showside'); draw(); if (id) { load(false, true); } };

  /* ---------- liste des conversations ---------- */
  const drawSide = () => {
    const rs = D.chat.rooms;
    side.replaceChildren(
      el('div', { className: 'chat-sh' }, el('b', { textContent: 'Conversations' })),
      el('div', { className: 'chat-rooms' }, ...rs.map(r => el('button', { type: 'button', className: 'chat-r' + (r.id === S.cur && S.view === 'chat' ? ' on' : ''), onclick: () => open(r.id) },
        el('span', { className: 'chat-av', style: `background:hsl(${hue(r.n)} 55% 45%)`, nt: 1, textContent: (r.n || '?').trim().slice(0, 1).toUpperCase() }),
        el('span', { className: 'grow' }, el('b', { nt: 1, textContent: r.n || 'Conversation' }), el('small', { className: 'mut', nt: 1, textContent: (chatConn(r) || { name: '' }).name || (chatConn(r) ? chatConn(r).url : '') })),
        r.unread ? el('i', { className: 'chat-dot', title: tr('Nouveaux messages'), 'aria-label': tr('Nouveaux messages') }) : null))),
      el('div', { className: 'chat-sf' }, btn('Nouvelle conversation', 'plus', () => wizard('create'), 'pri'), btn('Rejoindre avec un code', 'link', () => wizard('join')), btn('Zone rouge', 'trash', () => { S.view = 'danger'; root.classList.remove('showside'); draw(); }, 'dng chat-redb')));
  };

  /* ---------- assistant : créer / rejoindre ---------- */
  const cloudPicker = chatCloudPicker;
  function wizard(kind) {
    S.view = 'wiz'; S.cur = S.cur; root.classList.remove('showside');
    const W = { kind, step: 1, conn: null, name: '', me: chatName(), inv: null, picker: null, code: '', room: null };
    S.wiz = W; wdraw(); draw();
  }
  const wdraw = () => {
    const W = S.wiz; if (!W) return;
    if (W.picker) { W.picker.dispose(); W.picker = null; }
    const total = 3, head = el('div', { className: 'chat-wh' }, el('b', { textContent: W.kind === 'create' ? 'Nouvelle conversation' : 'Rejoindre une conversation' }), el('small', { className: 'mut', textContent: tr('Étape {0} sur {1}').replace('{0}', W.step).replace('{1}', total) }),
      btn('Annuler', 'x', () => { S.wiz = null; open(D.chat.rooms.length ? (room() ? S.cur : D.chat.rooms[0].id) : null); }, 'sm'));
    let body;
    if (W.kind === 'create') {
      if (W.step === 1) {
        W.picker = cloudPicker('', c => { W.conn = c; nx.disabled = !c; });
        const nx = btn('Suivant', 'fwd', () => { W.step = 2; wdraw(); draw(); }, 'pri'); nx.disabled = !W.picker.get() || !W.conn;
        body = [el('p', { textContent: 'Choisissez le cloud WebDAV qui servira de boîte aux lettres. Les personnes à inviter devront avoir accès au même cloud (même compte, ou dossier partagé avec elles). Vos messages y sont déposés sous forme de fichiers chiffrés illisibles pour le cloud.' }), W.picker.el, el('div', { className: 'row' }, nx)];
      } else if (W.step === 2) {
        const nm = el('input', { value: W.name, placeholder: 'Nom de la conversation (par exemple : Famille)', maxLength: 60, autocomplete: 'off' }), me = el('input', { value: W.me, placeholder: 'Votre nom affiché', maxLength: 40, autocomplete: 'off' });
        const go = async () => {
          if (W.busy) return; W.name = nm.value.trim() || tr('Discussion'); W.me = me.value.trim() || chatName(); W.busy = true; goB.disabled = true;
          try { const r = await chatCreate(W.conn, W.name, W.me); W.room = r; W.step = 3; W.busy = false; wdraw(); draw(); }
          catch (e) { W.busy = false; goB.disabled = false; toast(errText(e), 8000); }
        };
        nm.onkeydown = me.onkeydown = e => { if (e.key === 'Enter') go(); };
        const goB = btn('Créer la conversation', 'check', go, 'pri');
        body = [el('label', { className: 'col' }, el('small', { className: 'mut', textContent: 'Nom de la conversation' }), nm), el('label', { className: 'col' }, el('small', { className: 'mut', textContent: 'Votre nom affiché' }), me), el('div', { className: 'row' }, btn('Précédent', 'back', () => { W.step = 1; wdraw(); draw(); }), goB)];
      } else body = inviteBody(W.room, () => { const id = W.room.id; S.wiz = null; open(id); });
    } else {
      if (W.step === 1) {
        const ta = el('textarea', { rows: 4, placeholder: 'Collez ici le code d’invitation (il commence par SMC1-)', spellcheck: false, autocomplete: 'off', autocapitalize: 'off', value: W.code }), info = el('div', { className: 'chat-st' });
        const nx = btn('Suivant', 'fwd', () => { W.step = 2; wdraw(); draw(); }, 'pri');
        const chk = () => { W.code = ta.value; W.inv = chatParse(ta.value); nx.disabled = !W.inv; info.className = 'chat-st' + (W.inv ? ' ok' : ''); info.textContent = W.inv ? tr('Invitation reconnue : « {0} »').replace('{0}', W.inv.n || tr('Conversation')) : (ta.value.trim() ? tr('Ce code n’est pas valide : copiez-le en entier.') : ''); };
        ta.oninput = chk; chk();
        const paste = navigator.clipboard && navigator.clipboard.readText ? btn('Coller', 'copy', async () => { try { ta.value = await navigator.clipboard.readText(); chk(); } catch { toast('Collage impossible : appuyez longuement dans la zone puis choisissez « Coller ».'); } }) : null;
        body = [el('p', { textContent: 'La personne qui vous invite vous a envoyé un code. Collez-le ci-dessous.' }), ta, info, el('div', { className: 'row' }, paste, nx)];
      } else if (W.step === 2) {
        W.picker = cloudPicker(W.inv.h, c => { W.conn = c; nx.disabled = !c; });
        const nx = btn('Suivant', 'fwd', () => { W.step = 3; wdraw(); draw(); }, 'pri'); nx.disabled = !W.picker.get() || !W.conn;
        body = [el('p', { textContent: W.inv.h ? tr('Cette conversation est stockée sur le cloud « {0} ». Choisissez votre accès à ce même cloud (le vôtre, avec votre identifiant).').replace('{0}', W.inv.h) : 'Choisissez votre accès au cloud où la conversation est stockée.' }), W.picker.el, el('div', { className: 'row' }, btn('Précédent', 'back', () => { W.step = 1; wdraw(); draw(); }), nx)];
      } else {
        const me = el('input', { value: W.me, placeholder: 'Votre nom affiché', maxLength: 40, autocomplete: 'off' });
        const go = async () => {
          if (W.busy) return; W.me = me.value.trim() || chatName(); W.busy = true; goB.disabled = true;
          try { const r = await chatJoin(W.conn, W.inv, W.me); S.wiz = null; toast('Conversation rejointe.'); open(r.id); }
          catch (e) { W.busy = false; goB.disabled = false; toast(errText(e), 10000); }
        };
        me.onkeydown = e => { if (e.key === 'Enter') go(); };
        const goB = btn('Rejoindre', 'check', go, 'pri');
        body = [el('p', { textContent: tr('Vous allez rejoindre « {0} ».').replace('{0}', W.inv.n || tr('Conversation')) }), el('label', { className: 'col' }, el('small', { className: 'mut', textContent: 'Votre nom affiché' }), me), el('div', { className: 'row' }, btn('Précédent', 'back', () => { W.step = 2; wdraw(); draw(); }), goB)];
      }
    }
    main.replaceChildren(head, el('div', { className: 'chat-wb' }, ...body));
  };
  const inviteBody = (r, done) => chatInviteBody(r, 'SMC1-', 'Sormick Tchat', done);
  async function chatCreate(c, name, me) {
    const r = { id: chex(8), k: cbEnc(crypto.getRandomValues(new Uint8Array(32))), n: name.slice(0, 60), cid: c.id, p: CHAT_DIR, seen: 0 };
    if (D.chat.rooms.length >= CHAT_ROOMS) throw new Error('30 conversations au maximum : quittez-en une avant d’en créer une.');
    try { await FS.mkdir(c, '/' + r.p + '/'); } catch { /* existe déjà */ }
    await FS.mkdir(c, chatPath(r)).catch(e => { throw new Error(tr('Impossible de créer le dossier de la conversation sur ce cloud : {0}').replace('{0}', e.message)); });
    D.chat.name = me.slice(0, 40);
    await chatPost(r, { sys: 'created' });
    D.chat.rooms.push(r); save(); return r;
  }
  async function chatJoin(c, inv, me) {
    const ex = D.chat.rooms.find(r => r.id === inv.id); if (ex) return ex;
    if (D.chat.rooms.length >= CHAT_ROOMS) throw new Error('30 conversations au maximum : quittez-en une avant d’en rejoindre une autre.');
    const r = { id: inv.id, k: inv.k, n: inv.n || tr('Conversation'), cid: c.id, p: inv.p, seen: 0 };
    try { await FS.list(c, chatPath(r)); }
    catch (e) { throw new Error(tr('Dossier de la conversation introuvable sur ce cloud. Vérifiez que vous avez choisi le même cloud et le même compte que la personne qui vous invite (ou que le dossier « {0} » est bien partagé avec vous).').replace('{0}', inv.p) + ' (' + errText(e) + ')'); }
    D.chat.name = me.slice(0, 40); D.chat.rooms.push(r); save();
    chatPost(r, { sys: 'joined' }).catch(() => {});
    return r;
  }
  async function chatPost(r, m, extra) {
    const c = chatConn(r); if (!c) throw new Error('Le cloud de cette conversation n’est plus connecté sur ce profil. Ajoutez-le dans « Stockage cloud ».');
    const body = { v: 1, u: chatMe().id, n: chatName(), t: Date.now(), ...m };
    await FS.write(c, chatPath(r) + chatMsgName(), await chatSeal(r, TE.encode(JSON.stringify(body))));
  }

  /* ---------- lecture de la conversation ---------- */
  const decode = async (r, c, name) => {
    try {
      const blob = await FS.read(c, chatPath(r) + name, 'application/octet-stream'), j = JSON.parse(TD.decode(await chatOpen(r, await blob.arrayBuffer())));
      if (!j || typeof j !== 'object') throw 0;
      const f = j.f && typeof j.f === 'object' && /^f-[a-f0-9]{12}\.b$/.test(j.f.r) ? { n: chatFile(j.f.n), s: Math.max(0, +j.f.s || 0), m: String(j.f.m || '').slice(0, 80), r: j.f.r } : null;
      return { name, ts: Number(name.slice(0, 13)), u: String(j.u || '').slice(0, 40), n: String(j.n || '?').slice(0, 40), x: typeof j.x === 'string' ? j.x.slice(0, 4000) : '', f, g: typeof j.g === 'string' ? httpUrl(j.g) : null, sys: ['created', 'joined'].includes(j.sys) ? j.sys : '' };
    } catch { return { name, ts: Number(name.slice(0, 13)), bad: true, u: '', n: '?', x: '', f: null, g: null, sys: '' }; }
  };
  async function load(more, first) {
    const r = room(); if (!r || S.loading) return; const c = chatConn(r);
    if (!c) { S.err = 'Le cloud de cette conversation n’est plus connecté sur ce profil. Ajoutez-le dans « Stockage cloud », puis revenez ici.'; return draw(); }
    S.loading = true;
    try {
      const names = (await FS.list(c, chatPath(r))).map(e => e.name).filter(n => MSG_RE.test(n)).sort();
      const my = S.cur; S.err = '';
      if (!more && !S.names.length && !S.cache.size) S.first = Math.max(0, names.length - CHAT_PAGE);
      if (more) S.first = Math.max(0, S.first - CHAT_PAGE);
      S.names = names;
      const need = names.slice(S.first).filter(n => !S.cache.has(n));
      for (let i = 0; i < need.length; i += 6) { const got = await Promise.all(need.slice(i, i + 6).map(n => decode(r, c, n))); if (S.cur !== my || S.dead) return; got.forEach(g => S.cache.set(g.name, g)); }
      for (const k of [...S.cache.keys()]) if (!names.includes(k)) { S.cache.delete(k); }
      S.items = names.slice(S.first).map(n => S.cache.get(n)).filter(Boolean);
      const last = S.items.length ? S.items[S.items.length - 1].ts : 0;
      if (last > (r.seen || 0)) { r.seen = last; save(); }
      r.unread = false;
    } catch (e) { S.err = errText(e); }
    S.loading = false; const sig = S.items.map(m => m.name).join('|') + '#' + S.err + '#' + S.first; if (!S.dead && (more || first || sig !== S.sig)) { S.sig = sig; draw(more ? 'keep' : first ? 'end' : undefined); }
  }
  const tick = () => { if (S.dead || w.hidden || document.visibilityState !== 'visible' || S.view !== 'chat' || S.busy) return; load(); };
  S.timer = setInterval(tick, 4000);

  /* ---------- envoi ---------- */
  const send = async (m, attach) => {
    const r = room(), c = r && chatConn(r); if (!r || !c) return toast('Cloud de la conversation introuvable.');
    S.busy = true;
    try { if (attach) m.f = await attach(r, c); await chatPost(r, m); S.busy = false; await load(); draw('end'); return true; }
    catch (e) { S.busy = false; toast(errText(e), 9000); return false; }
  };
  const sendFile = async file => {
    if (!file) return;
    if (file.size > CHAT_MAXF * 8) return toast('Fichier trop volumineux (25 Mo au maximum).');
    const t = toast(tr('Préparation de « {0} »…').replace('{0}', file.name), 0);
    try {
      const pr = await chatPrepFile(file); let blob = pr.blob, name = pr.name, mime = pr.mime;
      if (blob.size > CHAT_MAXF) { t.close(); return toast('Fichier trop volumineux (25 Mo au maximum).'); }
      t.set(tr('Envoi de « {0} »…').replace('{0}', name));
      const ok = await send({ x: '' }, async (r, c) => { const ref = 'f-' + chex(6) + '.b'; await FS.write(c, chatPath(r) + ref, await chatSeal(r, new Uint8Array(await blob.arrayBuffer()))); return { n: name, s: blob.size, m: mime, r: ref }; });
      t.close(); if (ok) toast('Envoyé.');
    } catch (e) { t.close(); toast(errText(e), 9000); }
  };
  const readAtt = async (m, mime) => { const r = room(), c = r && chatConn(r); const blob = await FS.read(c, chatPath(r) + m.f.r, 'application/octet-stream'); return new Blob([await chatOpen(r, await blob.arrayBuffer())], { type: mime }); };
  const del = async m => {
    if (!await confirmBox('Supprimer ce message pour tout le monde ?', 'Supprimer', true)) return;
    const r = room(), c = r && chatConn(r);
    try { if (m.f) await FS.remove(c, chatPath(r) + m.f.r).catch(() => {}); await FS.remove(c, chatPath(r) + m.name); S.cache.delete(m.name); await load(); } catch (e) { toast(errText(e), 8000); }
  };

  /* ---------- affichage de la conversation ---------- */
  const linkify = t => { const out = []; let i = 0; for (const m of t.matchAll(/https?:\/\/[^\s<>"']+/g)) { const u = httpUrl(m[0].replace(/[).,;!?]+$/, '')); if (!u) continue; const raw = m[0].replace(/[).,;!?]+$/, ''); if (m.index > i) out.push(document.createTextNode(t.slice(i, m.index))); out.push(el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', nt: 1, textContent: raw })); i = m.index + raw.length; } if (i < t.length) out.push(document.createTextNode(t.slice(i))); return out; };
  const lightbox = chatLightbox;
  const imgNode = (m, url) => {
    const img = el('img', { className: 'chat-img', alt: m.f ? m.f.n : 'GIF', loading: 'lazy', referrerPolicy: 'no-referrer' }); img.src = url;
    return el('button', { type: 'button', className: 'chat-imgb', title: tr('Agrandir'), 'aria-label': tr('Agrandir'), onclick: () => lightbox(url) }, img);
  };
  const attNode = m => {
    const f = m.f;
    if (CHAT_IMG.test(f.m)) {
      const have = S.imgs.get(m.name);
      if (have) return imgNode(m, have);
      if (have === '') return el('div', { className: 'chat-ph', textContent: 'Image illisible.' });
      if (!S.ip.has(m.name)) S.ip.set(m.name, readAtt(m, f.m).then(b => { S.imgs.set(m.name, URL.createObjectURL(b)); }).catch(() => { S.imgs.set(m.name, ''); }).then(() => { if (!S.dead) draw(); }));
      return el('div', { className: 'chat-ph', textContent: 'Chargement de l’image…' });
    }
    return el('div', { className: 'chat-file' }, ico('file', 22), el('span', { className: 'grow' }, el('b', { nt: 1, textContent: f.n }), el('small', { className: 'mut', textContent: fmtSize(f.s) })),
      btn('Télécharger', 'download', async e => { const t = toast('Téléchargement…', 0); try { download(await readAtt(m, 'application/octet-stream'), f.n); t.close(); } catch (er) { t.close(); toast(errText(er), 8000); } }));
  };
  const bubble = m => {
    const mine = m.u === D.chat.id;
    if (m.sys) return el('div', { className: 'chat-sys' }, mine ? el('span', { textContent: 'Vous' }) : el('b', { nt: 1, textContent: m.n }), document.createTextNode(' '), el('span', { textContent: m.sys === 'created' ? 'a créé la conversation.' : 'a rejoint la conversation.' }));
    const kids = [];
    if (!mine) kids.push(el('b', { className: 'chat-who', nt: 1, textContent: m.n, style: `color:hsl(${hue(m.u || m.n)} 70% 72%)` }));
    if (m.bad) kids.push(el('i', { className: 'mut', textContent: '🔒 Message illisible (clé différente ?)' }));
    if (m.f) kids.push(attNode(m));
    if (m.g) kids.push(imgNode(m, m.g));
    if (m.x) { const big = /^(?:\p{Extended_Pictographic}|‍|️|\s){1,8}$/u.test(m.x); kids.push(el('div', { className: 'chat-tx' + (big ? ' big' : ''), nt: 1 }, ...linkify(m.x))); kids.push(...chatMediaCards(m.x)); }
    kids.push(el('div', { className: 'chat-meta' }, el('span', { textContent: chatTime(m.ts) }), mine ? el('button', { type: 'button', className: 'chat-del', title: tr('Supprimer ce message'), 'aria-label': tr('Supprimer ce message'), onclick: () => del(m) }, ico('trash', 13)) : null));
    return el('div', { className: 'chat-b ' + (mine ? 'me' : 'ot') }, ...kids);
  };
  const thread = el('div', { className: 'chat-th', tabIndex: 0 }), chatH = el('div', { className: 'chat-h' }), chatE = el('div', { className: 'warn chat-err', hidden: true });
  const ta = el('textarea', { className: 'chat-in', rows: 1, maxLength: 4000, placeholder: 'Écrire un message…', 'aria-label': 'Écrire un message', enterKeyHint: 'send' });
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 130) + 'px'; };
  const submit = async () => { const x = ta.value.trim(); if (!x || S.busy) return; closePop(); ta.disabled = true; const ok = await send({ x }); ta.disabled = false; if (ok) { ta.value = ''; grow(); } ta.focus(); };
  ta.oninput = grow; ta.onkeydown = e => { if (e.key === 'Escape' && pop) { e.stopPropagation(); closePop(); return; } if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } };
  ta.onpaste = e => { const f = [...(e.clipboardData ? e.clipboardData.files : [])][0]; if (f) { e.preventDefault(); sendFile(f); } };
  const pickF = (accept, cb) => { const i = el('input', { type: 'file', accept, hidden: true, multiple: true }); i.onchange = () => { [...i.files].forEach(cb); i.remove(); }; document.body.append(i); i.click(); };
  let pop = null;
  const closePop = () => { if (pop) { pop.remove(); pop = null; } };
  const popup = (node, title) => { closePop(); pop = el('div', { className: 'chat-pop', onkeydown: e => { if (e.key === 'Escape') { e.stopPropagation(); closePop(); ta.focus(); } } }, chatPopHead(title, () => { closePop(); ta.focus(); }), node); composer.append(pop); };
  const emojiPop = () => {
    if (pop && pop.dataset.k === 'e') return closePop();
    let cat = D.chat.recent && D.chat.recent.length ? -1 : 0; const grid = el('div', { className: 'chat-eg' }), tabs = el('div', { className: 'chat-et' });
    const put = e => { const a = ta.selectionStart, b = ta.selectionEnd; ta.setRangeText(e, a, b, 'end'); ta.focus(); grow(); D.chat.recent = [e, ...(D.chat.recent || []).filter(x => x !== e)].slice(0, 24); };
    const dr = () => {
      tabs.replaceChildren(...[...(D.chat.recent && D.chat.recent.length ? [['🕘', 'Récents', null]] : []), ...CHAT_EMO].map((c, i) => { const idx = D.chat.recent && D.chat.recent.length ? i - 1 : i; return el('button', { type: 'button', className: idx === cat ? 'on' : '', title: tr(c[1]), 'aria-label': tr(c[1]), onclick: () => { cat = idx; dr(); } }, c[0]); }));
      const list = cat < 0 ? (D.chat.recent || []) : CHAT_EMO[cat][2];
      grid.replaceChildren(...list.map(e => el('button', { type: 'button', textContent: e, 'aria-label': e, onclick: () => put(e) })));
    };
    dr(); popup(el('div', {}, tabs, grid), 'Emojis'); pop.dataset.k = 'e';
  };
  const gifPop = () => {
    if (pop && pop.dataset.k === 'g') return closePop();
    popup(chatGifBox({ pick: u => { closePop(); send({ x: '', g: u }); }, device: () => { closePop(); pickF('image/gif', sendFile); } }), 'GIF'); pop.dataset.k = 'g'; pop.classList.add('chat-popg');
  };
  const mediaPop = () => {
    if (pop && pop.dataset.k === 'm') return closePop();
    popup(chatMediaBox({ pick: items => { closePop(); chatInsertMedia(ta, items); }, close: closePop }), 'Vidéo ou musique en ligne'); pop.dataset.k = 'm'; pop.classList.add('chat-popm');
  };
  const composer = el('div', { className: 'chat-co' },
    el('div', { className: 'chat-cb' },
      btn('', 'smile', emojiPop, 'chat-ib', 'Emojis'), btn('GIF', '', gifPop, 'chat-ib chat-gif', 'GIF'), btn('', 'play', mediaPop, 'chat-ib', 'Vidéo ou musique en ligne (YouTube, Dailymotion, SoundCloud…)'),
      btn('', 'image', () => pickF('image/*', sendFile), 'chat-ib', 'Envoyer une photo'), btn('', 'paperclip', () => pickF('*/*', sendFile), 'chat-ib', 'Envoyer un fichier'),
      ta, btn('', 'send', submit, 'chat-send pri', 'Envoyer')));
  chatTvEdge(ta, k => k === 'ArrowUp' ? (chatH.querySelector('button:not(.chat-back)') || chatH.querySelector('button')) : k === 'ArrowLeft' ? [...composer.querySelectorAll('.chat-cb>button')].filter(b => ta.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING).pop() : composer.querySelector('.chat-send'));
  const chatV = el('div', { className: 'chat-v' }, chatH, chatE, thread, composer);
  w.addEventListener('dragover', e => { if (S.view === 'chat') e.preventDefault(); });
  w.addEventListener('drop', e => { if (S.view !== 'chat') return; e.preventDefault(); [...e.dataTransfer.files].forEach(sendFile); });
  w.addEventListener('pointerdown', e => { if (pop && !pop.contains(e.target) && !e.target.closest('.chat-cb button')) closePop(); }, true);
  const nearEnd = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 90;

  const clearRoom = async r => {   // supprime du cloud tous les messages et pièces jointes de la conversation (pour tous les participants)
    const c = chatConn(r); if (!c) throw new Error('Le cloud de cette conversation n’est plus connecté sur ce profil. Ajoutez-le dans « Stockage cloud ».');
    const all = await FS.list(c, chatPath(r)); let n = 0;
    for (const e of all) if (!e.dir && (MSG_RE.test(e.name) || /^f-[a-f0-9]{12}\.b$/.test(e.name))) { await FS.remove(c, chatPath(r) + e.name); n++; }
    if (S.cur === r.id) { S.cache = new Map(); S.items = []; S.sig = ''; S.imgs.forEach(u => URL.revokeObjectURL(u)); S.imgs.clear(); S.ip.clear(); }
    r.seen = 0; return n;
  };
  const dangerView = () => {
    const r = room(), act = (label, icon, note, fn) => el('div', { className: 'chat-red' }, el('div', { className: 'grow' }, el('b', { textContent: label }), el('small', { className: 'mut', textContent: note })), btn(label, icon, fn, 'dng pri'));
    const run = async (ask, okLabel, job, done) => { if (!await confirmBox(ask, okLabel, true)) return; const t = toast('Suppression…', 0); try { await job(); t.close(); toast(done, 5000); save(); await (S.cur && room() ? load(false, true) : Promise.resolve()); } catch (e) { t.close(); toast(errText(e), 9000); } draw(); };
    main.replaceChildren(el('div', { className: 'chat-wh' }, el('b', { textContent: 'Zone rouge' }), btn('Retour', 'back', () => { S.view = room() ? 'chat' : 'welcome'; draw(); }, 'sm')),
      el('div', { className: 'chat-wb' }, el('div', { className: 'warn', textContent: 'Actions définitives, sans retour possible. Les messages et fichiers effacés disparaissent du cloud pour tous les participants.' }),
        ...(r ? [act('Effacer l’historique de cette conversation', 'trash', tr('Supprime tous les messages, photos et fichiers de « {0} » sur le cloud, pour tout le monde. La conversation reste ouverte et vide.').replace('{0}', r.n), () => run('Effacer tout l’historique de cette conversation, pour tout le monde ?', 'Tout effacer', () => clearRoom(r), 'Historique effacé.'))] : []),
        ...(D.chat.rooms.length ? [act('Effacer l’historique de toutes mes conversations', 'trash', 'Fait la même chose pour toutes les conversations de ce profil.', () => run('Effacer l’historique de TOUTES vos conversations, pour tout le monde ?', 'Tout effacer', async () => { for (const x of D.chat.rooms) await clearRoom(x); }, 'Tous les historiques sont effacés.'))] : []),
        ...(r ? [act('Quitter cette conversation', 'x', 'La retire de cet appareil et de votre profil. Les messages restent sur le cloud : vous pourrez la rejoindre de nouveau avec le code d’invitation.', async () => { if (!await confirmBox('Quitter cette conversation sur cet appareil ? Les messages restent sur le cloud et vous pourrez la rejoindre de nouveau avec le code d’invitation.', 'Quitter', true)) return; D.chat.rooms = D.chat.rooms.filter(x => x !== r); save(); open(D.chat.rooms.length ? D.chat.rooms[0].id : null); })] : []),
        ...(D.chat.rooms.length ? [act('Oublier toutes mes conversations', 'x', 'Retire toutes les conversations de cet appareil (clés comprises). Le cloud n’est pas modifié.', async () => { if (!await confirmBox('Retirer toutes les conversations de ce profil ? Les messages restent sur le cloud.', 'Tout retirer', true)) return; D.chat.rooms = []; save(); open(null); })] : []),
        ...(!D.chat.rooms.length ? [el('p', { className: 'mut', textContent: 'Aucune conversation pour l’instant : rien à effacer.' })] : [])));
  };
  const menu = () => {
    const r = room(); if (!r) return;
    const act = async (kind) => {
      closePop();
      if (kind === 'name') { const v = await dialog('Mon nom affiché', [{ k: 'n', label: 'Votre nom affiché', value: chatName(), max: 40, req: true }], 'Enregistrer'); if (v) { D.chat.name = v.n.trim().slice(0, 40); save(); toast('Nom enregistré.'); } }
      else if (kind === 'ren') { const v = await dialog('Renommer la conversation', [{ k: 'n', label: 'Nom de la conversation', value: r.n, max: 60, req: true }], 'Enregistrer'); if (v) { r.n = v.n.trim().slice(0, 60); save(); draw(); } }
      else if (kind === 'inv') { S.view = 'invite'; draw(); }
      else if (kind === 'red') { S.view = 'danger'; draw(); }
      else if (kind === 'leave') { if (!await confirmBox('Quitter cette conversation sur cet appareil ? Les messages restent sur le cloud et vous pourrez la rejoindre de nouveau avec le code d’invitation.', 'Quitter', true)) return; D.chat.rooms = D.chat.rooms.filter(x => x !== r); save(); open(D.chat.rooms.length ? D.chat.rooms[0].id : null); }
    };
    const items = [['Inviter quelqu’un', 'link', 'inv'], ['Mon nom affiché', 'user', 'name'], ['Renommer la conversation', 'edit', 'ren'], ['Zone rouge', 'trash', 'red']];
    const m = el('div', { className: 'chat-menu' }, chatPopHead('Options', () => m.remove()), ...items.map(([l, i, k]) => el('button', { type: 'button', onclick: () => { m.remove(); act(k); } }, ico(i, 15), el('span', { textContent: l }))));
    chatH.append(m); setTimeout(() => addEventListener('pointerdown', function f(e) { if (!m.contains(e.target)) { m.remove(); removeEventListener('pointerdown', f, true); } }, true), 0);
  };

  function draw(scroll) {
    if (S.dead) return;
    drawSide();
    if (S.view === 'wiz') { root.classList.add('wiz'); return; }
    root.classList.remove('wiz');
    const r = room();
    if ((!r || S.view === 'welcome') && S.view !== 'danger') {
      main.replaceChildren(el('div', { className: 'chat-wel' }, ico('chat', 54), el('h3', { textContent: 'Sormick Tchat' }),
        el('p', { textContent: 'Discutez avec d’autres utilisateurs : messages, photos, fichiers, emojis et GIF. Tout est chiffré et stocké dans le cloud WebDAV de votre choix, sans autre serveur.' }),
        el('div', { className: 'col chat-bigb' }, btn('Créer une conversation', 'plus', () => wizard('create'), 'pri'), btn('Rejoindre avec un code d’invitation', 'link', () => wizard('join')))));
      return;
    }
    if (S.view === 'danger') { dangerView(); return; }
    if (S.view === 'invite') { main.replaceChildren(el('div', { className: 'chat-wh' }, el('b', { textContent: 'Inviter quelqu’un' }), btn('Retour', 'back', () => { S.view = 'chat'; draw(); }, 'sm')), el('div', { className: 'chat-wb' }, ...inviteBody(r, () => { S.view = 'chat'; draw('end'); }))); return; }
    const c = chatConn(r), keep = thread.scrollHeight - thread.scrollTop, end = scroll === 'end' || nearEnd();
    const rows = []; let day = '';
    if (S.first > 0) rows.push(btn('Afficher les messages précédents', 'back', () => load(true), 'chat-more'));
    for (const m of S.items) { const d = chatDay(m.ts); if (d !== day) { day = d; rows.push(el('div', { className: 'chat-day', nt: 1, textContent: d })); } rows.push(bubble(m)); }
    if (!S.items.length && !S.loading && !S.err) rows.push(el('div', { className: 'chat-sys', textContent: 'Aucun message pour l’instant : écrivez le premier !' }));
    if (S.loading && !S.items.length) rows.push(el('div', { className: 'chat-sys', textContent: 'Chargement…' }));
    thread.replaceChildren(...rows);
    chatH.replaceChildren(btn('', 'menu', () => root.classList.toggle('showside'), 'chat-back sm', 'Conversations'),
      el('div', { className: 'grow' }, el('b', { nt: 1, textContent: r.n }), el('small', { className: 'mut', nt: 1, textContent: c ? (c.name || c.url) : tr('Cloud non connecté') })),
      btn('', 'video', () => chatRecWin({ attach: f => sendFile(f), attachLabel: 'Envoyer dans la conversation' }), 'sm', 'Enregistrer la webcam et le micro, ou le micro seul (MP4, vers votre cloud)'), btn('Inviter', 'link', () => { S.view = 'invite'; draw(); }, 'sm'), btn('', 'more', menu, 'sm', 'Options de la conversation'));
    chatE.replaceChildren(...(S.err ? [S.err, ' ', btn('Réessayer', 'refresh', () => load(), 'sm')] : [])); chatE.hidden = !S.err;
    if (main.firstChild !== chatV) main.replaceChildren(chatV);
    if (scroll === 'keep') thread.scrollTop = thread.scrollHeight - keep; else if (end) thread.scrollTop = thread.scrollHeight;
  }
  VIEWS.add(draw);
  CHATWIN = { w, rec, open, cur: () => (!w.hidden && S.view === 'chat') ? S.cur : null };
  if (roomId && D.chat.rooms.some(r => r.id === roomId)) open(roomId); else if (D.chat.rooms.length) open(D.chat.rooms[0].id); else { S.view = 'welcome'; draw(); }
}

/* ---- notifications : un coup d'œil discret toutes les 45 s (conversations non ouvertes) ---- */
const chatNotified = new Map();
async function chatBg() {
  try {
    if (typeof SESSION === 'undefined' || !SESSION || !D || !D.chat || !D.chat.rooms || !D.chat.rooms.length || document.visibilityState !== 'visible') return;
    const me = chatMe().id.slice(0, 6), curId = CHATWIN ? CHATWIN.cur() : null;
    for (const r of D.chat.rooms) {
      const c = chatConn(r); if (!c) continue;
      const names = (await FS.list(c, chatPath(r))).map(e => e.name).filter(n => MSG_RE.test(n));
      const fresh = names.filter(n => Number(n.slice(0, 13)) > (r.seen || 0) && MSG_RE.exec(n)[2] !== me);
      if (!fresh.length) { r.unread = false; continue; }
      if (curId === r.id) continue;
      r.unread = true; const top = Math.max(...fresh.map(n => Number(n.slice(0, 13))));
      if ((chatNotified.get(r.id) || 0) < top) { chatNotified.set(r.id, top); toastAct(tr('💬 {0} nouveau(x) message(s) dans « {1} »').replace('{0}', fresh.length).replace('{1}', r.n), tr('Ouvrir'), () => chatWin(r.id), 12000); if (typeof refresh === 'function') refresh(); }
    }
  } catch (e) { console.warn('Sormick Tchat : relecture en arrière-plan impossible', e && e.message); }   // hors ligne ou cloud indisponible : on réessaie plus tard
}
setInterval(chatBg, 45000);
