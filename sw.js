'use strict';
/* Service Worker de sormick Cloud : lecture EN CONTINU des vidéos/musiques WebDAV, sans proxy ni service externe.
   Le lecteur (<video>/<audio>) demande une adresse de ce site (…/_dav/<id>/nom) ; ce worker, qui tourne dans votre navigateur,
   relaie la requête (avec les en-têtes Authorization et Range) vers VOTRE serveur WebDAV. Les identifiants restent en mémoire
   uniquement : ils sont transmis par la page, jamais stockés, et perdus à la fermeture. */
const creds = new Map();   // id → { url, auth, mime }
const BASE = new URL('_dav/', self.registration.scope).pathname;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'reg' && /^[\w-]{8,64}$/.test(d.id) && /^https?:\/\//.test(d.url) && /^Basic [\w+/=]+$/.test(d.auth)) creds.set(d.id, { url: d.url, auth: d.auth, mime: String(d.mime || '') });
  else if (d.type === 'del') creds.delete(d.id);
  else if (d.type === 'clear') creds.clear();
});

async function ask(id) {   // le worker a pu être arrêté (inactivité) : la page ré-envoie les identifiants si elle est encore ouverte
  for (const cl of await self.clients.matchAll({ type: 'window' })) {
    const r = await new Promise(res => { const ch = new MessageChannel(); ch.port1.onmessage = m => res(m.data); setTimeout(() => res(null), 1500); cl.postMessage({ type: 'need', id }, [ch.port2]); });
    if (r && r.url) { creds.set(id, r); return r; }
  }
  return null;
}
async function handle(req, id) {
  const c = creds.get(id) || await ask(id);
  if (!c) return new Response('Session expirée : rouvrez le fichier.', { status: 401 });
  const h = new Headers({ Authorization: c.auth }); const rg = req.headers.get('range'); if (rg) h.set('Range', rg);
  let up;
  try { up = await fetch(c.url, { headers: h, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow' }); }
  catch { return new Response('Serveur WebDAV injoignable ou CORS refusé.', { status: 502 }); }
  const out = new Headers();
  out.set('Content-Type', c.mime || up.headers.get('content-type') || 'application/octet-stream');
  const cl = up.headers.get('content-length'), cr = up.headers.get('content-range');
  if (cl) out.set('Content-Length', cl);
  if (up.status === 206) {
    // Content-Range n'est lisible que si le serveur l'expose en CORS ; sans lui, la lecture/le déplacement seraient faux : la page bascule alors en téléchargement complet.
    if (!cr) return new Response('Le serveur doit exposer Content-Range (Access-Control-Expose-Headers).', { status: 502 });
    out.set('Content-Range', cr);
  }
  if (up.status === 206 || up.headers.get('accept-ranges') === 'bytes') out.set('Accept-Ranges', 'bytes');
  return new Response(up.status === 204 ? null : up.body, { status: up.status, headers: out });
}
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || !u.pathname.startsWith(BASE) || e.request.method !== 'GET') return;
  const id = u.pathname.slice(BASE.length).split('/')[0];
  e.respondWith(handle(e.request, id));
});
