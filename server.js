// Proxy/passerelle optionnel : contournement iframe, relais WebDAV (sans CORS) et SFTP.
// ⚠ À protéger (PROXY_TOKEN / réseau privé) : il relaie des requêtes sortantes.
import express from 'express'; import cors from 'cors'; import SFTP from 'ssh2-sftp-client';
const app = express(), PORT = process.env.PORT || 8787, TOKEN = process.env.PROXY_TOKEN;
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' })); app.use(express.json({ limit: '200mb' }));
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/;
const safe = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && (process.env.ALLOW_PRIVATE || !PRIVATE.test(x.hostname)); } catch { return false; } };
app.use((q, r, n) => TOKEN && q.headers['x-token'] !== TOKEN && q.path !== '/proxy' ? r.sendStatus(401) : n());

app.get('/api/check', async (q, r) => {            // le site est-il intégrable ? joignable ?
  if (!safe(q.query.url)) return r.json({ proxiable: false, embeddable: false });
  try { const x = await fetch(q.query.url), csp = x.headers.get('content-security-policy') || '';
    r.json({ proxiable: true, embeddable: !x.headers.get('x-frame-options') && !/frame-ancestors/i.test(csp) });
  } catch { r.json({ proxiable: false, embeddable: false }); } });

app.get('/proxy', async (q, r) => {                 // relais sans X-Frame-Options / CSP, liens réécrits
  const u = q.query.url; if (!safe(u)) return r.sendStatus(400);
  try { const x = await fetch(u), ct = x.headers.get('content-type') || ''; r.set('content-type', ct);
    if (!ct.includes('text/html')) return r.send(Buffer.from(await x.arrayBuffer()));
    const inject = `<base href="${u}"><script>document.addEventListener('click',e=>{const a=e.target.closest('a[href]');
      if(a&&/^https?:/.test(a.href)){e.preventDefault();location='/proxy?url='+encodeURIComponent(a.href)}})</script>`;
    r.send((await x.text()).replace(/<head[^>]*>/i, m => m + inject));
  } catch { r.sendStatus(502); } });

app.post('/api/dav', async (q, r) => {              // relais WebDAV générique
  const { url, method, headers = {}, auth, b64 } = q.body; if (!safe(url)) return r.sendStatus(400);
  try { const x = await fetch(url, { method, headers: { ...headers, ...(auth && { Authorization: auth }) }, body: b64 ? Buffer.from(b64, 'base64') : undefined });
    r.status(x.status).send(Buffer.from(await x.arrayBuffer())); } catch { r.sendStatus(502); } });

const sftp = async (c, f) => { const s = new SFTP(); try { await s.connect({ host: c.host, port: +c.port || 22, username: c.user, password: c.pass }); return await f(s); } finally { s.end(); } };
app.post('/api/sftp/list', async (q, r) => { try { r.json(await sftp(q.body.conn, async s => (await s.list(q.body.path)).map(i => ({ name: i.name, dir: i.type === 'd', size: i.size })))); } catch (e) { r.status(500).send(e.message); } });
app.post('/api/sftp/read', async (q, r) => { try { r.send(await sftp(q.body.conn, s => s.get(q.body.path))); } catch (e) { r.status(500).send(e.message); } });
app.post('/api/sftp/write', async (q, r) => { try { await sftp(q.body.conn, s => s.put(Buffer.from(q.body.b64, 'base64'), q.body.path)); r.sendStatus(204); } catch (e) { r.status(500).send(e.message); } });
app.listen(PORT, () => console.log('Proxy Virtual Desktop sur :' + PORT));
