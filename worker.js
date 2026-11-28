/* sormick Cloud — relais WebDAV (Cloudflare Workers, offre gratuite).
 *
 * POURQUOI : un navigateur ne peut pas lire un serveur WebDAV tiers si ce serveur n'envoie pas d'en-têtes CORS.
 * Ce relais fait la requête à la place du navigateur (un serveur n'a pas cette limite) et ajoute les en-têtes CORS.
 * Vous le déployez UNE fois ; ni vos utilisateurs ni les fournisseurs WebDAV n'ont de réglage à faire.
 *
 * SÉCURITÉ :
 *  - répond uniquement aux pages venant de SITE (avec ou sans « www. ») (et OLD_SITE pendant la transition, et ALLOWED_ORIGINS si défini) (en-tête Origin) ;
 *  - si vous définissez le secret RELAY_TOKEN (Settings → Variables and Secrets → Secret), exige en plus ce jeton (en-tête X-Relay-Token) :
 *    sans lui, personne ne peut utiliser votre relais, même en connaissant son adresse ;
 *  - ne relaie que vers des adresses https:// publiques (pas d'IP, pas de localhost, pas de réseau privé) ;
 *  - ne transmet que les en-têtes WebDAV utiles ; aucun cookie ; supprime WWW-Authenticate (pas de fenêtre de connexion du navigateur) ;
 *  - ne stocke ni ne journalise rien : l'en-tête Authorization est transmis tel quel au serveur WebDAV, c'est tout.
 *
 * DIFFUSION (Cast) : avec le secret RELAY_TOKEN défini, le relais sait aussi fabriquer un LIEN TEMPORAIRE pour un fichier de votre cloud
 *    (une télévision / un Chromecast ne peut pas envoyer de mot de passe). Le lien est chiffré avec RELAY_TOKEN (votre identifiant WebDAV n'y figure jamais en clair),
 *    limité à 1 fichier et expire (6 h par défaut, 12 h au maximum). Quiconque possède le lien peut lire CE fichier jusqu'à son expiration ; il ne donne accès à rien d'autre.
 *
 * MISE EN PLACE (5 minutes) : voir README, section « Relais ». Il suffit de coller ce fichier dans un Worker et de cliquer « Deploy ».
 */
const SITE = 'https://sormickpc.app';        // ← l'adresse de VOTRE site (domaine personnalisé), sans « / » final
const OLD_SITE = 'https://sormickpc.github.io'; // ← ancienne adresse GitHub Pages, acceptée le temps de la transition (vous pouvez supprimer cette ligne et son usage plus bas)

const METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'PROPFIND', 'PROPPATCH', 'MKCOL', 'MOVE', 'COPY', 'OPTIONS']);
const PASS = ['authorization', 'depth', 'range', 'content-type', 'destination', 'overwrite', 'if-match', 'if-none-match', 'if-modified-since', 'if-range', 'if-unmodified-since', 'lock-token', 'if', 'timeout'];
const KEEP = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'dav', 'allow', 'location', 'content-disposition', 'cache-control'];
const EXPOSE = 'Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag, Last-Modified, DAV, Allow, Location, X-Relay-Error, X-Relay-Up';

const b64u = { enc: u => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), dec: t => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)) };
const castKey = async env => crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode('sormick-cast-v1|' + env.RELAY_TOKEN)), 'AES-GCM', false, ['encrypt', 'decrypt']);
const MIME = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav' };
const CAST_DEF = 6 * 3600, CAST_MAX = 12 * 3600;   // secondes
const publicHost = h => {
  if (!h || h.includes(':') || /^\d+(\.\d+){0,3}$/.test(h) || /^0x/i.test(h)) return false;                 // IP (v4/v6/entiers) : refusé
  if (h === 'localhost' || !h.includes('.') || /\.(local|lan|home|internal|localhost|workers\.dev)$/i.test(h)) return false;
  return true;
};

const same = (a, b) => { let d = a.length ^ b.length; for (let i = 0; i < b.length; i++) d |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i); return d === 0; };   // comparaison à durée constante

/* Requête vers le serveur WebDAV ; redirections suivies à la main (chacune revérifiée) ; l'identifiant n'est jamais envoyé à un autre hôte */
async function hop(target, method, h, body, bodyless, local) {
  let up, cur = target;
  try {
    for (let i = 0; ; i++) {
      up = await fetch(cur, { method, headers: h, body, redirect: 'manual', duplex: 'half' });
      const loc = up.headers.get('location');
      if (up.status >= 300 && up.status < 400 && loc && i < 5 && bodyless) {
        const nx = new URL(loc, cur);
        if (nx.protocol !== 'https:' || (!local && !publicHost(nx.hostname))) return { err: [502, 'blocked', 'Redirection refusée.'] };
        if (nx.host !== cur.host) { h.delete('authorization'); }
        cur = nx; continue;
      }
      break;
    }
  } catch { return { err: [502, 'unreachable', 'Le relais n’a pas pu joindre le serveur WebDAV.'] }; }
  return { up, cur };
}
/* Lien de diffusion : lecture seule d'UN fichier, sans en-tête Origin (la télévision n'en envoie pas), jusqu'à expiration */
async function castServe(request, env, tok, local) {
  const cc = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range, Content-Type, Accept-Encoding, If-Range', 'Access-Control-Expose-Headers': EXPOSE, 'Access-Control-Max-Age': '86400', 'X-Robots-Tag': 'noindex' };
  const no = (st, t) => new Response(t, { status: st, headers: { ...cc, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cc });
  if (request.method !== 'GET' && request.method !== 'HEAD') return no(405, 'Méthode non prise en charge.');
  if (!env.RELAY_TOKEN) return no(501, 'Diffusion non activée sur ce relais.');
  let p; try { const raw = b64u.dec(tok); p = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await castKey(env), raw.slice(12)))); } catch { return no(403, 'Lien invalide.'); }
  if (!(p && p.e > Date.now())) return no(410, 'Lien expiré.');
  let target; try { target = new URL(p.u); } catch { return no(403, 'Lien invalide.'); }
  if (target.protocol !== 'https:' || target.username || target.password || (!local && !publicHost(target.hostname))) return no(403, 'Adresse refusée.');
  const h = new Headers(); for (const k of ['range', 'if-range']) { const v = request.headers.get(k); if (v) h.set(k, v); }
  if (p.a) h.set('Authorization', String(p.a));
  h.set('User-Agent', 'Mozilla/5.0 (compatible; sormick-cloud-relay)');
  const r = await hop(target, 'GET', h, undefined, true, local);   // HEAD aussi en GET (tous les serveurs ne savent pas répondre à HEAD) : le corps est abandonné
  if (r.err) return no(r.err[0], r.err[2]);
  const { up, cur } = r, out = new Headers(cc);
  for (const k of KEEP) { const v = up.headers.get(k); if (v) out.set(k, v); }
  out.delete('content-disposition'); out.set('Cache-Control', 'private, no-store');
  if ((up.status === 200 || up.status === 206) && !out.has('accept-ranges')) out.set('Accept-Ranges', 'bytes');
  const ext = (decodeURIComponent(new URL(request.url).pathname.split('/').pop() || '').match(/\.([A-Za-z0-9]{2,5})$/) || cur.pathname.match(/\.([A-Za-z0-9]{2,5})$/) || [])[1];
  const ct = out.get('content-type') || '';
  if ((!ct || /octet-stream/i.test(ct)) && ext && MIME[ext.toLowerCase()]) out.set('Content-Type', MIME[ext.toLowerCase()]);
  if (up.status === 401 || up.status === 403) return no(502, 'Le cloud a refusé l’accès (identifiants).');
  if (request.method === 'HEAD') { try { await up.body.cancel(); } catch { /* rien à abandonner */ } return new Response(null, { status: up.status, headers: out }); }
  return new Response([101, 204, 205, 304].includes(up.status) ? null : up.body, { status: up.status, headers: out });
}

// Le même site avec ou sans « www. » (domaine personnalisé) : les deux adresses sont acceptées (sinon une TV ou un téléphone ouvrant www.… serait refusé, sans message clair).
const altHost = s => { try { const u = new URL(s), h = u.hostname, n = h.split('.').length; return n === 2 ? u.protocol + '//www.' + h : (h.startsWith('www.') && n === 3 ? u.protocol + '//' + h.slice(4) : ''); } catch { return ''; } };

export default {
  async fetch(request, env = {}) {
    const allowed = new Set([SITE, altHost(SITE), OLD_SITE, ...String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)]);
    const origin = request.headers.get('Origin') || '';
    const cors = ok => ({
      'Access-Control-Allow-Origin': ok ? origin : SITE, 'Vary': 'Origin',
      'Access-Control-Allow-Methods': [...METHODS].join(', '),
      'Access-Control-Allow-Headers': 'X-Relay-Token, X-Relay-Mode, Authorization, Depth, Range, Content-Type, Destination, Overwrite, If-Match, If-None-Match, If-Modified-Since, If-Range, Lock-Token, If, Timeout',
      'Access-Control-Expose-Headers': EXPOSE + ', X-Relay-Ok, X-Relay-Cast', 'Access-Control-Max-Age': '86400'
    });
    const fail = (status, code, text) => new Response(text, { status, headers: { ...cors(allowed.has(origin)), 'X-Relay-Error': code, 'Content-Type': 'text/plain; charset=utf-8' } });

    const url = new URL(request.url);
    const cm = /^\/cast\/([\w-]+)(?:\/|$)/.exec(url.pathname);
    if (cm) return castServe(request, env, cm[1], env.ALLOW_LOCAL === '1');   // lien de diffusion (voir plus haut) : sans Origin ni jeton, le lien lui-même est l'autorisation
    if (request.method === 'GET' && !url.searchParams.has('u') && !origin)       // page d'état, ouverte à la main dans un onglet
      return new Response('Relais sormick Cloud : en service.\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    if (!allowed.has(origin)) return fail(403, 'origin', 'Site non autorisé.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(true) });   // contrôle CORS : répondu ici, sans toucher au serveur WebDAV
    if (!METHODS.has(request.method)) return fail(405, 'method', 'Méthode non prise en charge.');
    if (env.RELAY_TOKEN && !same(request.headers.get('X-Relay-Token') || '', String(env.RELAY_TOKEN))) return fail(401, 'token', 'Jeton du relais manquant ou incorrect.');
    if (url.pathname === '/turn') {   // serveurs relais d’appel (TURN Cloudflare) : permet les appels Konekt en 4G/5G ; demande les secrets TURN_KEY_ID et TURN_KEY_API_TOKEN du relais
      if (request.method !== 'GET') return fail(405, 'method', 'Méthode non prise en charge.');
      if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return fail(501, 'turnkey', 'Appels en réseau mobile : définissez les secrets TURN_KEY_ID et TURN_KEY_API_TOKEN du relais.');
      try {
        const r = await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/' + encodeURIComponent(String(env.TURN_KEY_ID)) + '/credentials/generate-ice-servers', {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + env.TURN_KEY_API_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 86400 })
        });
        if (!r.ok) return fail(502, 'turn', 'Cloudflare a refusé la demande TURN (' + r.status + ').');
        const j = await r.json();
        const iceServers = (Array.isArray(j.iceServers) ? j.iceServers : [j.iceServers]).filter(Boolean).map(s => ({ ...s, urls: [].concat(s.urls || []).filter(u => !/:53(\?|$)/.test(u)) })).filter(s => s.urls.length);
        return new Response(JSON.stringify({ iceServers }), { headers: { ...cors(true), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch { return fail(502, 'turn', 'Service TURN injoignable.'); }
    }
    if (url.searchParams.has('ping')) return new Response('ok', { headers: { ...cors(true), 'X-Relay-Ok': '1', ...(env.RELAY_TOKEN ? { 'X-Relay-Cast': '1' } : {}), 'Content-Type': 'text/plain; charset=utf-8' } });   // test depuis l'application

    let target; try { target = new URL(url.searchParams.get('u') || ''); } catch { return fail(400, 'url', 'Adresse invalide.'); }
    const local = env.ALLOW_LOCAL === '1';   // réservé aux tests automatiques
    if (target.protocol !== 'https:' || target.username || target.password || (!local && !publicHost(target.hostname))) return fail(400, 'blocked', 'Adresse refusée : seules les adresses https:// publiques sont relayées.');
    if (target.host === url.host) return fail(400, 'blocked', 'Boucle refusée.');
    if (url.searchParams.has('cast')) {   // fabrique le lien temporaire de diffusion pour CE fichier (GET, avec l'en-tête Authorization du cloud)
      if (request.method !== 'GET') return fail(405, 'method', 'Méthode non prise en charge.');
      if (!env.RELAY_TOKEN) return fail(501, 'castkey', 'Pour diffuser des fichiers du cloud, définissez le secret RELAY_TOKEN du relais.');
      const ttl = Math.min(CAST_MAX, Math.max(300, parseInt(url.searchParams.get('ttl'), 10) || CAST_DEF));
      const name = (url.searchParams.get('n') || 'media').replace(/[^\w.\- ]+/g, '_').slice(-80) || 'media';
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await castKey(env), new TextEncoder().encode(JSON.stringify({ u: target.href, a: request.headers.get('Authorization') || '', e: Date.now() + ttl * 1000 }))));
      const raw = new Uint8Array(12 + ct.length); raw.set(iv); raw.set(ct, 12);
      return new Response(JSON.stringify({ url: url.origin + '/cast/' + b64u.enc(raw) + '/' + encodeURIComponent(name), ttl }), { headers: { ...cors(true), 'Content-Type': 'application/json' } });
    }

    const h = new Headers(); for (const k of PASS) { const v = request.headers.get(k); if (v) h.set(k, v); }
    h.set('User-Agent', request.headers.get('User-Agent') || 'Mozilla/5.0 (compatible; sormick-cloud-relay)');   // même identité que le navigateur (certains serveurs répondent « vide » aux inconnus)
    const mode = (request.headers.get('X-Relay-Mode') || '').split(',');   // essais du Diagnostic uniquement : imitent un autre client WebDAV
    if (mode.includes('ref')) h.set('Referer', target.origin + '/');
    if (mode.includes('noct')) h.delete('content-type');
    if (mode.includes('ua')) h.set('User-Agent', 'rclone/v1.76.0');
    const bodyless = ['GET', 'HEAD', 'PROPFIND', 'OPTIONS', 'DELETE', 'MKCOL'].includes(request.method) && !request.headers.get('content-length');
    const r = await hop(target, request.method, h, ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, bodyless, local);
    if (r.err) return fail(r.err[0], r.err[1], r.err[2]);
    const { up, cur } = r;

    const out = new Headers(cors(true));
    for (const k of KEEP) { const v = up.headers.get(k); if (v) out.set(k, v); }
    if (up.status === 401 || up.status === 403) out.set('X-Relay-Auth', '1');
    out.set('X-Relay-Up', 'v3 / ' + up.status + ' / ' + cur.host);   // aide au diagnostic : ce que le serveur WebDAV a répondu au relais
    return new Response([101, 204, 205, 304].includes(up.status) ? null : up.body, { status: up.status, headers: out });
  }
};
