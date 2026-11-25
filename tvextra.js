'use strict';
/* tvextra.js — fonctions de Sormick TV : sous-titres HLS (WebVTT) et guide des programmes (EPG au format XMLTV).
   - Sous-titres : si la liste HLS de la chaîne annonce des pistes de sous-titres (#EXT-X-MEDIA:TYPE=SUBTITLES), elles sont lues et affichées sur la vidéo.
     (Chrome ne les expose pas pour le HLS natif : le site les télécharge lui-même et les ajoute à la vidéo.)
   - EPG : fichier XMLTV (.xml ou .xml.gz) donné par vous ou annoncé par la liste M3U (url-tvg) ; ce qui passe et ce qui suit, pour la chaîne choisie. */

/* ---------- sous-titres ---------- */
const hlsAttrs = l => { const a = {}; for (const m of l.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) a[m[1]] = m[2].replace(/^"|"$/g, ''); return a; };
function hlsSubList(master, base) {
  const out = [];
  for (const l of master.split(/\r?\n/)) {
    if (!l.startsWith('#EXT-X-MEDIA:')) continue;
    const a = hlsAttrs(l.slice(13)); if (a.TYPE !== 'SUBTITLES' || !a.URI) continue;
    try { out.push({ name: String(a.NAME || a.LANGUAGE || 'Sous-titres').slice(0, 60), lang: String(a.LANGUAGE || '').slice(0, 12), def: a.DEFAULT === 'YES' || a.AUTOSELECT === 'YES', uri: new URL(a.URI, base).href }); } catch { /* adresse invalide */ }
  }
  return out.slice(0, 20);
}
function vttParse(text) {
  const t = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const clock = s => { const p = s.replace(',', '.').split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : (p[0] || 0) * 60 + (p[1] || 0); };
  const mp = /X-TIMESTAMP-MAP=([^\n]*)/.exec(t); let mpegts = 0, local = 0;
  if (mp) { const a = /MPEGTS:(\d+)/.exec(mp[1]), b = /LOCAL:([\d:.]+)/.exec(mp[1]); if (a) mpegts = +a[1]; if (b) local = clock(b[1]); }
  const cues = [];
  for (const blk of t.split(/\n\n+/)) {
    const ls = blk.split('\n'), i = ls.findIndex(x => x.includes('-->')); if (i < 0) continue;
    const m = /([\d:.,]+)\s*-->\s*([\d:.,]+)/.exec(ls[i]); if (!m) continue;
    const txt = ls.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
    if (txt) cues.push({ s: clock(m[1]), e: clock(m[2]), t: txt.slice(0, 500) });
  }
  return { cues, mpegts, local };
}
/* Suit une piste de sous-titres HLS et alimente une piste de texte de la vidéo. L'instant d'un sous-titre = son heure WebVTT, ramenée à la 1re portion reçue
   (X-TIMESTAMP-MAP) ; décalage réglable pour les directs. */
function subFollow(v, sub) {
  const ctl = new AbortController(), track = v.addTextTrack('subtitles', sub.name, sub.lang || 'und'); track.mode = 'showing';
  const seen = new Set(), keys = new Set(), raw = []; let off = 0, first = null;
  const put = c => { try { track.addCue(new VTTCue(Math.max(0, c.s + off), Math.max(0.1, c.e + off), c.t)); } catch { /* cue invalide */ } };
  const clear = () => { try { for (const c of [...(track.cues || [])]) track.removeCue(c); } catch { /* piste détachée */ } };
  const sleep = ms => new Promise(r => { const t = setTimeout(r, ms); ctl.signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });
  (async () => {
    let errs = 0;
    while (!ctl.signal.aborted) {
      try {
        const { text, base } = await hlsText(sub.uri, ctl.signal), pl = m3u8Parse(text, base); let fresh = 0;
        for (const sg of pl.segs) {
          if (seen.has(sg.uri)) continue; seen.add(sg.uri); fresh++;
          const r = await fetchAny(sg.uri, { signal: ctl.signal }); if (!r.ok) continue;
          const p = vttParse(await r.text()); if (first === null) first = p.mpegts;
          const shift = (p.mpegts - first) / 90000 - p.local;
          for (const c of p.cues) { const k = { s: c.s + shift, e: c.e + shift, t: c.t }, id = Math.round(k.s * 10) + '|' + k.t; if (keys.has(id)) continue; keys.add(id); raw.push(k); put(k); }
          if (raw.length > 6000) raw.splice(0, raw.length - 6000);
        }
        if (pl.ended && !fresh) break; errs = 0;
        await sleep(Math.max(2000, pl.td * 500));
      } catch { if (ctl.signal.aborted || ++errs > 5) break; await sleep(3000); }
    }
  })();
  return { stop: () => { ctl.abort(); clear(); try { track.mode = 'disabled'; } catch { /* rien */ } }, setOffset: o => { off = o; clear(); raw.forEach(put); } };
}

/* ---------- guide des programmes (XMLTV) ---------- */
const epgKey = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const xmlText = s => String(s).replace(/<!\[CDATA\[([^]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
function xmlDate(s) {
  const m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?\s*([+-]\d{4})?/.exec(s || ''); if (!m) return 0;
  const z = m[7] || '+0000';
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - (z[0] === '-' ? -1 : 1) * (+z.slice(1, 3) * 60 + +z.slice(3, 5)) * 60000;
}
async function epgLoad(url, signal) {
  const r = await fetchAny(url, { signal }); if (!r.ok) throw new Error('Le guide répond « ' + r.status + ' ».');
  let buf = await r.arrayBuffer(); if (buf.byteLength > 60e6) throw new Error('Guide trop volumineux (60 Mo maximum).');
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0x1f && u8[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Ce navigateur ne sait pas décompresser les guides .gz : utilisez un guide .xml.');
    buf = await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    if (buf.byteLength > 300e6) throw new Error('Guide trop volumineux une fois décompressé.');
  }
  const txt = new TextDecoder('utf-8').decode(buf), now = Date.now(), lo = now - 3 * 3600e3, hi = now + 48 * 3600e3, prog = new Map(), names = new Map(); let n = 0;
  for (const m of txt.matchAll(/<channel\b[^>]*?\bid="([^"]*)"[^>]*>([^]*?)<\/channel>/g)) for (const d of m[2].matchAll(/<display-name[^>]*>([^]*?)<\/display-name>/g)) names.set(epgKey(xmlText(d[1])), m[1]);
  for (const m of txt.matchAll(/<programme\b([^>]*)>([^]*?)<\/programme>/g)) {
    const ch = /channel="([^"]*)"/.exec(m[1]), st = /start="([^"]*)"/.exec(m[1]), sp = /stop="([^"]*)"/.exec(m[1]); if (!ch || !st) continue;
    const s = xmlDate(st[1]), e = sp ? xmlDate(sp[1]) : s + 1800e3; if (!s || e < lo || s > hi) continue;
    const t = /<title[^>]*>([^]*?)<\/title>/.exec(m[2]), d = /<desc[^>]*>([^]*?)<\/desc>/.exec(m[2]);
    let a = prog.get(ch[1]); if (!a) prog.set(ch[1], a = []);
    a.push({ s, e, t: xmlText(t ? t[1] : '').slice(0, 150) || '—', d: d ? xmlText(d[1]).slice(0, 700) : '' }); if (++n > 250000) break;
  }
  for (const a of prog.values()) a.sort((x, y) => x.s - y.s);
  if (!n) throw new Error('Aucun programme trouvé dans ce guide (fichier XMLTV attendu, ou guide déjà périmé).');
  return { prog, names, n };
}
const epgFor = (E, ch) => { if (!E || !ch) return null; const id = ch.tvg && E.prog.has(ch.tvg) ? ch.tvg : E.names.get(epgKey(ch.name || '')); return (id && E.prog.get(id)) || null; };
function epgNow(list, t = Date.now()) {
  if (!list) return null; const i = list.findIndex(p => p.s <= t && t < p.e);
  return i < 0 ? { now: null, next: list.filter(p => p.s > t).slice(0, 8) } : { now: list[i], next: list.slice(i + 1, i + 9) };
}
