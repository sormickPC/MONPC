'use strict';
/* Import de vos favoris (fichier HTML exporté par un navigateur ou un gestionnaire de favoris, format « Netscape ») dans l'App Store.
   Tout se passe dans le navigateur : le fichier n'est jamais envoyé nulle part et les liens restent dans votre profil chiffré (donc dans votre sauvegarde cloud).
   Par prudence, les mots de passe, jetons et clés qui seraient écrits dans une adresse sont retirés (l'adresse est gardée sans eux). */
const FAV_SECRET = /token|jwt|key|pass|pwd|mdp|motdepasse|secret|login|user|session|sid|signature|credential|code=|auth(?!=2)/i;
const favHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const favText = s => { try { return new DOMParser().parseFromString(String(s), 'text/html').documentElement.textContent || ''; } catch { return ''; } };
function favClean(raw) {   // -> { url, cleaned } ou null
  let u; try { u = new URL(favText(raw)); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  let cleaned = false;
  if (u.username || u.password) { u.username = ''; u.password = ''; cleaned = true; }
  if (u.search && (FAV_SECRET.test(u.search) || [...u.searchParams.values()].some(v => v.length >= 24))) { u.search = ''; cleaned = true; }
  if (u.hash) { if (FAV_SECRET.test(u.hash) || u.hash.length > 40) { u.hash = ''; cleaned = true; } }
  if (u.pathname.split('/').some(p => /^[0-9a-f-]{32,}$/i.test(p) || /^[A-Za-z0-9_-]{40,}$/.test(p))) return { url: u.origin + '/', cleaned: true };   // lien privé (partage, jeton dans le chemin) : on garde seulement le site
  return { url: u.href, cleaned };
}
function favParse(html) {   // HTML « Netscape » : Chrome, Edge, Firefox, Safari, Brave, Opera, Vivaldi, start.me, Raindrop, Diigo, Pinboard…
  const out = [], stack = []; let pend = '';
  const re = /<DT>\s*<H3[^>]*>([\s\S]*?)<\/H3>|<\/DL>|<DL[^>]*>|<A\s[^>]*?HREF\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/A>(?:\s*<DD>([\s\S]*?)(?=<DT>|<\/DL>|<DD>|$))?/gi;
  let m;
  while ((m = re.exec(html))) {
    const g = m[0].toUpperCase();
    if (g.startsWith('<DT') && m[1] !== undefined) pend = favText(m[1]).trim();
    else if (g.startsWith('<DL')) { stack.push(pend); pend = ''; }
    else if (g === '</DL>') stack.pop();
    else if (m[2] !== undefined) out.push({ path: stack.filter(Boolean), href: m[2], name: favText(String(m[3]).replace(/<[^>]*>/g, '')).trim(), desc: favText(String(m[4] || '').replace(/<[^>]*>/g, '')).trim() });
  }
  return out;
}
function favJson(text) {   // JSON : Chrome / Edge / Brave / Opera / Vivaldi (fichier « Bookmarks »), Firefox (sauvegarde), et la plupart des exports de gestionnaires
  const out = []; let n = 0;
  const walk = (o, path, depth) => {
    if (!o || typeof o !== 'object' || depth > 40 || ++n > 200000) return;
    if (Array.isArray(o)) { for (const x of o) walk(x, path, depth + 1); return; }
    const u = typeof o.url === 'string' ? o.url : typeof o.uri === 'string' ? o.uri : typeof o.href === 'string' ? o.href : typeof o.link === 'string' ? o.link : '';
    if (u && !Array.isArray(o.children)) { out.push({ path, href: u, name: String(o.name || o.title || '').trim(), desc: String(o.description || o.note || o.excerpt || '').trim() }); return; }
    const label = typeof o.name === 'string' ? o.name : typeof o.title === 'string' ? o.title : '', sub = label && (Array.isArray(o.children) || o.type === 'folder') ? path.concat(label) : path;
    for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === 'object') walk(v, k === 'roots' || !label ? path : sub, depth + 1); }
  };
  walk(JSON.parse(text), [], 0);
  return out;
}
function favOpml(text) {   // OPML (lecteurs de flux, certains gestionnaires de favoris)
  const d = new DOMParser().parseFromString(text, 'text/xml'), out = [];
  const walk = (node, path) => { for (const c of node.children) { if (c.tagName.toLowerCase() !== 'outline') continue; const u = c.getAttribute('htmlUrl') || c.getAttribute('url') || c.getAttribute('xmlUrl') || ''; const nm = (c.getAttribute('title') || c.getAttribute('text') || '').trim(); if (u) out.push({ path, href: u, name: nm, desc: (c.getAttribute('description') || '').trim() }); if (c.children.length) walk(c, nm && !u ? path.concat(nm) : path); } };
  const body = d.querySelector('body'); if (body) walk(body, []);
  return out;
}
function favCsvRows(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',' || c === ';' || c === '\t') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cur += c; }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
function favCsv(text) {   // CSV : Raindrop, Pocket, Pinboard, Firefox, LastPass, tableurs…
  const rows = favCsvRows(text); if (rows.length < 2) return [];
  const h = rows[0].map(x => x.trim().toLowerCase()), col = (...n) => h.findIndex(x => n.includes(x)), iu = col('url', 'link', 'href', 'address', 'website', 'uri');
  if (iu < 0) return [];
  const it = col('title', 'name', 'titre', 'nom'), ifd = col('folder', 'collection', 'category', 'dossier', 'catégorie', 'categorie', 'tags', 'tag'), id = col('note', 'excerpt', 'description', 'notes');
  return rows.slice(1).map(r => ({ path: ifd >= 0 && r[ifd] && r[ifd].trim() ? [r[ifd].split(/[,|]/)[0].trim()] : [], href: (r[iu] || '').trim(), name: it >= 0 ? (r[it] || '').trim() : '', desc: id >= 0 ? (r[id] || '').trim() : '' }));
}
function favText2(text) {   // liste d'adresses (une par ligne), raccourcis .url, Markdown : on prend toutes les adresses trouvées
  const out = [], seen = new Set();
  for (const m of text.matchAll(/(?:\[([^\]\n]{1,80})\]\()?(https?:\/\/[^\s<>"')\]]+)/gi)) { if (seen.has(m[2])) continue; seen.add(m[2]); out.push({ path: [], href: m[2], name: (m[1] || '').trim(), desc: '' }); }
  return out;
}
function favAuto(text) {   // reconnaît le format d'après le contenu (pas l'extension) ; ne plante jamais
  const t = String(text).replace(/^﻿/, ''), s = t.trimStart();
  const tries = [];
  if (/^[\[{]/.test(s)) tries.push(() => favJson(t));
  if (/^<\?xml|^<opml/i.test(s)) tries.push(() => favOpml(t));
  if (/<DT>|<A\s[^>]*href/i.test(t)) tries.push(() => favParse(t));
  tries.push(() => favCsv(t), () => favText2(t));
  for (const f of tries) { try { const r = f(); if (r && r.length) return r; } catch { /* format suivant */ } }
  return [];
}
function favCat(path) {
  const GEN = /^(favoris|autre|autres|bookmarks|divers)$/i, nice = s => { s = s.trim(); return s && s === s.toUpperCase() && /[A-ZÀ-Ý]/.test(s) ? s[0] + s.slice(1).toLowerCase() : s; };
  const p = path.filter(x => !/^(accueil|home|bookmarks)$/i.test(x));
  let last = p[p.length - 1] || 'Favoris';
  if (GEN.test(last) && p.length > 1 && !GEN.test(p[p.length - 2])) last = p[p.length - 2] + ' – ' + last;
  return nice(last).slice(0, 30);
}
const favKey = u => { try { const x = new URL(u); return x.hostname.replace(/^www\./, '').toLowerCase() + x.pathname.replace(/\/+$/, '') + x.search; } catch { return String(u).toLowerCase(); } };
function favImport(text) {   // -> { added, dup, cleaned, skipped, total } : ce qui existe déjà (même adresse) n'est pas réimporté ; ce qui n'est pas une adresse web valide est ignoré
  const items = favAuto(text), all = G.store.concat(G.apps), have = new Set(all.map(a => favKey(a.url || '')).filter(Boolean)), ids = new Set(all.map(a => a.id));
  const catMap = new Map(); let added = 0, dup = 0, cleaned = 0, skipped = 0;
  for (const it of items) {
    try {
      const c = favClean(it.href); if (!c) { skipped++; continue; }
      const key = favKey(c.url), id = 'f-' + favHash(key);
      if (have.has(key) || ids.has(id)) { dup++; continue; }
      if (G.store.length >= 10000) { skipped++; continue; }
      const raw = favCat(it.path || []), lc = raw.toLowerCase(); if (!catMap.has(lc)) catMap.set(lc, raw);
      const o = new URL(c.url), host = o.hostname.replace(/^www\./, '');
      G.store.push({ id, name: String(it.name || host).slice(0, 40), url: c.url, lc: '', ex: '', ap: '', cat: catMap.get(lc), desc: String(it.desc || '').slice(0, 240), mode: 'auto', img: o.origin + '/favicon.ico', ai: false });
      have.add(key); ids.add(id); added++; if (c.cleaned) cleaned++;
    } catch { skipped++; }
  }
  if (added) { saveG(); save(); }
  return { added, dup, cleaned, skipped, total: items.length };
}
function importFavoris(done) {
  const f = el('input', { type: 'file', multiple: true, accept: '.html,.htm,.json,.opml,.xml,.csv,.txt,.url,.md,text/*,application/json' });
  f.onchange = async () => {
    const R = { added: 0, dup: 0, cleaned: 0, skipped: 0, total: 0 };
    for (const file of [...f.files]) {
      if (file.size > 50e6) { R.skipped++; continue; }
      try { const r = favImport(await file.text()); for (const k in R) R[k] += r[k]; } catch { R.skipped++; }
    }
    if (!R.total) toast('Aucun favori reconnu dans ce fichier. Formats acceptés : HTML (Chrome, Edge, Firefox, Safari, Brave, Opera, Vivaldi, start.me…), JSON (Chrome/Edge/Firefox), OPML, CSV, liste d’adresses.', 9000);
    else toast(R.added + ' favori' + (R.added > 1 ? 's' : '') + ' ajouté' + (R.added > 1 ? 's' : '') + ' à l’App Store'
      + (R.dup ? ' · ' + R.dup + ' déjà dans votre boutique (non réimporté' + (R.dup > 1 ? 's' : '') + ')' : '')
      + (R.skipped ? ' · ' + R.skipped + ' ignoré' + (R.skipped > 1 ? 's' : '') + ' (non compatible' + (R.skipped > 1 ? 's' : '') + ')' : '')
      + (R.cleaned ? ' · ' + R.cleaned + ' adresse' + (R.cleaned > 1 ? 's' : '') + ' nettoyée' + (R.cleaned > 1 ? 's' : '') + ' (mot de passe, jeton ou lien privé retiré)' : '') + '.', 12000);
    if (typeof done === 'function') done();
  };
  f.click();
}
