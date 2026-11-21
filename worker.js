/* sormick Cloud — relais WebDAV (Cloudflare Workers, offre gratuite).
 *
 * POURQUOI : un navigateur ne peut pas lire un serveur WebDAV tiers si ce serveur n'envoie pas d'en-têtes CORS.
 * Ce relais fait la requête à la place du navigateur (un serveur n'a pas cette limite) et ajoute les en-têtes CORS.
 * Vous le déployez UNE fois ; ni vos utilisateurs ni les fournisseurs WebDAV n'ont de réglage à faire.
 *
 * SÉCURITÉ :
 *  - répond uniquement aux pages venant de SITE (en-tête Origin) ;
 *  - ne relaie que vers des adresses https:// publiques (pas d'IP, pas de localhost, pas de réseau privé) ;
 *  - ne transmet que les en-têtes WebDAV utiles ; aucun cookie ; supprime WWW-Authenticate (pas de fenêtre de connexion du navigateur) ;
 *  - ne stocke ni ne journalise rien : l'en-tête Authorization est transmis tel quel au serveur WebDAV, c'est tout.
 *
 * MISE EN PLACE (5 minutes) : voir README, section « Relais ». Il suffit de coller ce fichier dans un Worker et de cliquer « Deploy ».
 */
const SITE = 'https://sormickpc.github.io';   // ← l'adresse de VOTRE site GitHub Pages (sans « / » final)

const METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'PROPFIND', 'PROPPATCH', 'MKCOL', 'MOVE', 'COPY', 'OPTIONS']);
const PASS = ['authorization', 'depth', 'range', 'content-type', 'destination', 'overwrite', 'if-match', 'if-none-match', 'if-modified-since', 'if-range', 'if-unmodified-since', 'lock-token', 'if', 'timeout'];
const KEEP = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'dav', 'allow', 'location', 'content-disposition', 'cache-control'];
const EXPOSE = 'Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag, Last-Modified, DAV, Allow, Location, X-Relay-Error';

const publicHost = h => {
  if (!h || h.includes(':') || /^\d+(\.\d+){0,3}$/.test(h) || /^0x/i.test(h)) return false;                 // IP (v4/v6/entiers) : refusé
  if (h === 'localhost' || !h.includes('.') || /\.(local|lan|home|internal|localhost|workers\.dev)$/i.test(h)) return false;
  return true;
};

export default {
  async fetch(request, env = {}) {
    const allowed = new Set([SITE, ...String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)]);
    const origin = request.headers.get('Origin') || '';
    const cors = ok => ({
      'Access-Control-Allow-Origin': ok ? origin : SITE, 'Vary': 'Origin',
      'Access-Control-Allow-Methods': [...METHODS].join(', '),
      'Access-Control-Allow-Headers': 'Authorization, Depth, Range, Content-Type, Destination, Overwrite, If-Match, If-None-Match, If-Modified-Since, If-Range, Lock-Token, If, Timeout',
      'Access-Control-Expose-Headers': EXPOSE, 'Access-Control-Max-Age': '86400'
    });
    const fail = (status, code, text) => new Response(text, { status, headers: { ...cors(allowed.has(origin)), 'X-Relay-Error': code, 'Content-Type': 'text/plain; charset=utf-8' } });

    const url = new URL(request.url);
    if (request.method === 'GET' && !url.searchParams.has('u') && !origin)       // page d'état, ouverte à la main dans un onglet
      return new Response('Relais sormick Cloud : en service.\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    if (!allowed.has(origin)) return fail(403, 'origin', 'Site non autorisé.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(true) });   // contrôle CORS : répondu ici, sans toucher au serveur WebDAV
    if (!METHODS.has(request.method)) return fail(405, 'method', 'Méthode non prise en charge.');

    let target; try { target = new URL(url.searchParams.get('u') || ''); } catch { return fail(400, 'url', 'Adresse invalide.'); }
    const local = env.ALLOW_LOCAL === '1';   // réservé aux tests automatiques
    if (target.protocol !== 'https:' || target.username || target.password || (!local && !publicHost(target.hostname))) return fail(400, 'blocked', 'Adresse refusée : seules les adresses https:// publiques sont relayées.');
    if (target.host === url.host) return fail(400, 'blocked', 'Boucle refusée.');

    const h = new Headers(); for (const k of PASS) { const v = request.headers.get(k); if (v) h.set(k, v); }
    h.set('User-Agent', 'sormick-cloud-relay');
    const bodyless = ['GET', 'HEAD', 'PROPFIND', 'OPTIONS', 'DELETE', 'MKCOL'].includes(request.method) && !request.headers.get('content-length');
    let up, cur = target;
    try {
      for (let i = 0; ; i++) {                  // redirections suivies à la main (chacune revérifiée) ; l'identifiant n'est jamais envoyé à un autre hôte
        up = await fetch(cur, { method: request.method, headers: h, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual', duplex: 'half' });
        const loc = up.headers.get('location');
        if (up.status >= 300 && up.status < 400 && loc && i < 5 && bodyless) {
          const nx = new URL(loc, cur);
          if (nx.protocol !== 'https:' || (!local && !publicHost(nx.hostname))) return fail(502, 'blocked', 'Redirection refusée.');
          if (nx.host !== cur.host) { h.delete('authorization'); }
          cur = nx; continue;
        }
        break;
      }
    } catch { return fail(502, 'unreachable', 'Le relais n’a pas pu joindre le serveur WebDAV.'); }

    const out = new Headers(cors(true));
    for (const k of KEEP) { const v = up.headers.get(k); if (v) out.set(k, v); }
    if (up.status === 401 || up.status === 403) out.set('X-Relay-Auth', '1');
    return new Response([101, 204, 205, 304].includes(up.status) ? null : up.body, { status: up.status, headers: out });
  }
};
