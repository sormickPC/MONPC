// Proxy/passerelle durci pour Virtual Desktop : relais d'iframes et WebDAV (sans CORS).
// Principes : jeton obligatoire, CORS strict, anti-SSRF (résolution DNS filtrée à chaque connexion, redirections revalidées),
// liens /proxy signés et éphémères, contenu relayé isolé par CSP sandbox, aucun secret journalisé ni stocké.
import express from 'express'; import cors from 'cors';
import { Agent } from 'undici'; import dns from 'node:dns'; import net from 'node:net'; import crypto from 'node:crypto'; import path from 'node:path';

const { PROXY_TOKEN: TOKEN, ALLOWED_ORIGIN: ORIGIN, PORT = 8787, ALLOW_PRIVATE_HOSTS = '' } = process.env;
if (!TOKEN || TOKEN.length < 16 || !ORIGIN) { console.error('Définissez PROXY_TOKEN (≥ 16 caractères) et ALLOWED_ORIGIN.'); process.exit(1); }
const LAN = new Set(ALLOW_PRIVATE_HOSTS.split(',').map(s => s.trim()).filter(Boolean)); // hôtes privés explicitement autorisés (ex. NAS)
const sha = s => crypto.createHash('sha256').update(String(s ?? '')).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const sign = (u, e) => crypto.createHmac('sha256', TOKEN).update(`${e}|${u}`).digest('hex');

/* ----- Anti-SSRF ----- */
const bl = new net.BlockList();
[['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]].forEach(([a, n]) => bl.addSubnet(a, n, 'ipv4'));
[['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]].forEach(([a, n]) => bl.addSubnet(a, n, 'ipv6'));
const isBad = ip => { if (ip.startsWith('::ffff:')) ip = ip.slice(7); return bl.check(ip, net.isIPv6(ip) ? 'ipv6' : 'ipv4'); };
const guardLookup = (host, o, cb) => dns.lookup(host, { ...o, all: true }, (err, list) => {   // appelé à CHAQUE connexion (anti DNS-rebinding)
  if (err) return cb(err);
  if (!LAN.has(host) && list.some(a => isBad(a.address))) return cb(new Error('blocked'));
  o.all ? cb(null, list) : cb(null, list[0].address, list[0].family); });
const agent = new Agent({ connect: { lookup: guardLookup } });
const okUrl = u => { try { const x = new URL(u), h = x.hostname.replace(/^\[|\]$/g, '');
  return /^https?:$/.test(x.protocol) && !x.username && (!net.isIP(h) || LAN.has(h) || !isBad(h)) ? x : null; } catch { return null; } };
async function get(u, o = {}) {                       // redirections suivies à la main, chacune revalidée
  for (let i = 0; i < 5; i++) { const x = okUrl(u); if (!x) throw new Error('blocked');
    const r = await fetch(x, { ...o, dispatcher: agent, signal: AbortSignal.timeout(15000), redirect: 'manual' });
    const loc = r.headers.get('location'); if (r.status >= 300 && r.status < 400 && loc) { u = new URL(loc, x).href; continue; } return r; }
  throw new Error('redirects'); }
const body = async (r, max = 30e6) => { if (+r.headers.get('content-length') > max) throw new Error('size'); const b = Buffer.from(await r.arrayBuffer()); if (b.length > max) throw new Error('size'); return b; };

/* ----- Middleware ----- */
const app = express(); app.disable('x-powered-by');
app.use((q, r, n) => { r.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Strict-Transport-Security': 'max-age=31536000', 'Cache-Control': 'no-store' }); n(); });
const hits = new Map(); setInterval(() => hits.clear(), 60e3).unref();
app.use((q, r, n) => { const c = (hits.get(q.ip) || 0) + 1; hits.set(q.ip, c); c > 120 ? r.sendStatus(429) : n(); });  // 120 req/min/IP
app.use(cors({ origin: ORIGIN, methods: ['POST'], allowedHeaders: ['content-type', 'x-token'] }));
app.use('/api', (q, r, n) => same(q.get('x-token'), TOKEN) ? n() : r.sendStatus(401));  // auth AVANT lecture du corps
app.use(express.json({ limit: '60mb' }));
const wrap = f => (q, r) => f(q, r).catch(e => { console.error(e.message); r.status(502).send('Erreur'); });

/* ----- Iframe : détection + lien signé ----- */
app.post('/api/open', wrap(async (q, r) => {
  const x = okUrl(q.body.url); if (!x) return r.json({ proxiable: false });
  let res; try { res = await get(x.href); } catch { return r.json({ proxiable: false }); }
  res.body?.cancel?.(); const csp = res.headers.get('content-security-policy') || '';
  if (!res.headers.get('x-frame-options') && !/frame-ancestors/i.test(csp)) return r.json({ proxiable: true, embeddable: true });
  const exp = Date.now() + 60e3; r.json({ proxiable: true, embeddable: false, path: `/proxy?url=${encodeURIComponent(x.href)}&exp=${exp}&sig=${sign(x.href, exp)}` }); }));
app.get('/proxy', wrap(async (q, r) => {
  const { url, exp, sig } = q.query; if (!(+exp > Date.now()) || !same(sig, sign(url, exp)) || !okUrl(url)) return r.sendStatus(403);
  const x = await get(url), ct = x.headers.get('content-type') || 'application/octet-stream';
  r.set({ 'Content-Type': ct, 'Content-Security-Policy': 'sandbox allow-scripts allow-forms allow-popups' }); // origine opaque : aucun accès à ce serveur
  if (!/text\/html/i.test(ct)) return r.send(await body(x));
  const base = new URL(url).href.replace(/"/g, '%22');
  const inject = `<base href="${base}"><script>addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href]');if(a&&/^https?:/.test(a.href)){e.preventDefault();parent.postMessage({vdNav:a.href},'*')}},true)</script>`;
  r.send((await body(x)).toString('utf8').replace(/<head[^>]*>/i, m => m + inject)); }));

/* ----- WebDAV : relais restreint ----- */
app.post('/api/dav', wrap(async (q, r) => {
  const { url, method, headers = {}, auth, b64 } = q.body;
  if (!['PROPFIND', 'GET', 'PUT'].includes(method) || !okUrl(url) || (auth && !/^Basic [\w+/=]+$/.test(auth))) return r.sendStatus(400);
  const h = { ...(auth && { Authorization: auth }) }; for (const k of ['Depth', 'Content-Type']) if (typeof headers[k] === 'string') h[k] = headers[k];
  const x = await get(url, { method, headers: h, body: b64 ? Buffer.from(b64, 'base64') : undefined });
  r.status(x.status).type(x.headers.get('content-type') || 'application/octet-stream').send(await body(x, 200e6)); }));

app.listen(PORT, '127.0.0.1', () => console.log(`Proxy sur 127.0.0.1:${PORT} (placez-le derrière HTTPS)`));
