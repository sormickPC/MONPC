/* ============================================================================
   mp4mux.js — enregistrements toujours en MP4.
   Radio et télé reçoivent des flux bruts (MP3, AAC, MPEG-TS) : ce module les emballe dans un fichier MP4 standard
   SANS les réencoder (la qualité ne change pas) :
     - MPEG-TS  (H.264 + AAC ou MP3)  -> MP4 vidéo
     - AAC (ADTS) ou MP3 brut         -> MP4 audio
   Tout se fait dans le navigateur. Si le flux n'est pas pris en charge (autre codec, fichier trop gros ou abîmé),
   convert() renvoie null : l'appelant garde alors le fichier d'origine, rien n'est perdu.
   ============================================================================ */
const MP4 = (() => {
  const MAX_IN = 800 * 1048576;   // au-delà, on garde le fichier d'origine (mémoire du navigateur)
  const u8 = (...a) => Uint8Array.from(a);
  const cat = parts => { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
  const be32 = v => u8((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  const be16 = v => u8((v >> 8) & 255, v & 255);
  const zeros = n => new Uint8Array(n);
  const str = s => u8(...[...s].map(c => c.charCodeAt(0)));
  const box = (type, ...payload) => { const p = cat(payload); return cat([be32(p.length + 8), str(type), p]); };
  const full = (type, ver, flags, ...payload) => box(type, u8(ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...payload);
  const RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

  /* ---------- AAC (ADTS) ---------- */
  function parseAdts(b, start = 0) {
    const frames = []; let i = start, info = null;
    while (i + 7 <= b.length) {
      if (b[i] !== 0xFF || (b[i + 1] & 0xF6) !== 0xF0) { i++; continue; }
      const hdr = (b[i + 1] & 1) ? 7 : 9, len = ((b[i + 3] & 3) << 11) | (b[i + 4] << 3) | (b[i + 5] >> 5);
      const sfi = (b[i + 2] >> 2) & 15, ot = ((b[i + 2] >> 6) & 3) + 1, ch = ((b[i + 2] & 1) << 2) | (b[i + 3] >> 6);
      if (len < hdr + 1 || sfi > 12 || i + len > b.length) { if (i + len > b.length && len >= hdr + 1) break; i++; continue; }
      if (!info) info = { ot, sfi, ch: ch || 2, rate: RATES[sfi] };
      frames.push(b.subarray(i + hdr, i + len)); i += len;
    }
    return info && frames.length ? { info, frames } : null;
  }

  /* ---------- MP3 (couche III) ---------- */
  const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  function mp3Header(b, i) {
    if (i + 4 > b.length || b[i] !== 0xFF || (b[i + 1] & 0xE0) !== 0xE0) return null;
    const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, bi = (b[i + 2] >> 4) & 15, si = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1, ch = ((b[i + 3] >> 6) & 3) === 3 ? 1 : 2;
    if (ver === 1 || layer !== 1 || bi === 0 || bi === 15 || si === 3) return null;   // seule la couche III est gérée
    const v1 = ver === 3, br = (v1 ? BR1 : BR2)[bi] * 1000, rate = SR[ver][si], spf = v1 ? 1152 : 576;
    const len = Math.floor((v1 ? 144 : 72) * br / rate) + pad;
    return { len, rate, ch, spf, v1 };
  }
  function parseMp3(b) {
    let i = 0;
    if (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) i = 10 + ((b[6] & 127) << 21 | (b[7] & 127) << 14 | (b[8] & 127) << 7 | (b[9] & 127));
    const frames = []; let info = null;
    while (i + 4 <= b.length) {
      const h = mp3Header(b, i);
      if (!h || i + h.len > b.length) { if (h && i + h.len > b.length) break; i++; continue; }
      const nx = i + h.len; if (nx + 4 <= b.length && !mp3Header(b, nx)) { i++; continue; }   // faux départ : l'image suivante doit être valide
      if (!info) info = { rate: h.rate, ch: h.ch, spf: h.spf, v1: h.v1 };
      frames.push(b.subarray(i, nx)); i = nx;
    }
    return info && frames.length ? { info, frames } : null;
  }

  /* ---------- MPEG-TS ---------- */
  const ts33 = (b, o) => (b[o] & 0x0E) * 536870912 + b[o + 1] * 4194304 + (b[o + 2] & 0xFE) * 16384 + b[o + 3] * 128 + (b[o + 4] >> 1);
  function demuxTS(b) {
    let off = 0;
    while (off + 376 < b.length && !(b[off] === 0x47 && b[off + 188] === 0x47 && b[off + 376] === 0x47)) off++;
    if (off + 376 >= b.length) return null;
    let pmtPid = -1, vPid = -1, aPid = -1, vType = 0, aType = 0, other = '';
    const acc = new Map(), pes = { v: [], a: [] };
    const finish = pid => {
      const a = acc.get(pid); if (!a || !a.n) return; acc.set(pid, { parts: [], n: 0 });
      const d = cat(a.parts); if (d.length < 9 || d[0] || d[1] || d[2] !== 1) return;
      const fl = d[7] >> 6, hl = d[8]; let pts = null, dts = null;
      if (fl >= 2 && d.length >= 14) pts = ts33(d, 9);
      if (fl === 3 && d.length >= 19) dts = ts33(d, 14);
      (pid === vPid ? pes.v : pes.a).push({ pts, dts: dts == null ? pts : dts, data: d.subarray(9 + hl) });
    };
    for (let p = off; p + 188 <= b.length; p += 188) {
      if (b[p] !== 0x47) { const q = b.indexOf(0x47, p + 1); if (q < 0) break; p = q - 188; continue; }
      const pusi = b[p + 1] & 0x40, pid = ((b[p + 1] & 0x1F) << 8) | b[p + 2], afc = (b[p + 3] >> 4) & 3;
      if (!(afc & 1)) continue;
      let s = p + 4; if (afc & 2) s += 1 + b[p + 4]; if (s >= p + 188) continue;
      if (pid === 0 && pusi && pmtPid < 0) {
        const t = s + 1 + b[s], sl = ((b[t + 1] & 15) << 8) | b[t + 2];
        for (let k = t + 8; k + 4 <= t + 3 + sl - 4; k += 4) if (((b[k] << 8) | b[k + 1]) !== 0) { pmtPid = ((b[k + 2] & 0x1F) << 8) | b[k + 3]; break; }
      } else if (pid === pmtPid && pusi && vPid < 0 && aPid < 0) {
        const t = s + 1 + b[s], sl = ((b[t + 1] & 15) << 8) | b[t + 2], pil = ((b[t + 10] & 15) << 8) | b[t + 11];
        for (let k = t + 12 + pil; k + 5 <= t + 3 + sl - 4;) {
          const st = b[k], ep = ((b[k + 1] & 0x1F) << 8) | b[k + 2], il = ((b[k + 3] & 15) << 8) | b[k + 4];
          if (st === 0x1B && vPid < 0) { vPid = ep; vType = st; }
          else if ((st === 0x0F || st === 0x03 || st === 0x04) && aPid < 0) { aPid = ep; aType = st; }
          else if (st === 0x24 || st === 0x10 || st === 0x02) other = 'vidéo non gérée (type ' + st + ')';
          k += 5 + il;
        }
        for (const q of [vPid, aPid]) if (q >= 0) acc.set(q, { parts: [], n: 0 });
      } else if (pid === vPid || pid === aPid) {
        if (pusi) finish(pid);
        const a = acc.get(pid); a.parts.push(b.subarray(s, p + 188)); a.n += p + 188 - s;
      }
    }
    finish(vPid); finish(aPid);
    if (vPid < 0 && aPid < 0) return null;
    if (vPid < 0 && other) return null;
    return { pes, vPid, aPid, aType };
  }

  /* ---------- H.264 ---------- */
  function nals(d) {   // découpe « Annex B » (00 00 01) en NAL
    const out = []; let st = -1;
    for (let i = 0; i + 2 < d.length; i++) {
      if (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 1) {
        if (st >= 0) { let e = i; while (e > st && d[e - 1] === 0) e--; out.push(d.subarray(st, e)); }
        st = i + 3; i += 2;
      }
    }
    if (st >= 0 && st < d.length) out.push(d.subarray(st));
    return out;
  }
  function spsSize(sps) {   // largeur / hauteur depuis le SPS (décodage Exp-Golomb)
    const r = []; for (let i = 1; i < sps.length; i++) { if (i >= 3 && sps[i] === 3 && sps[i - 1] === 0 && sps[i - 2] === 0) continue; r.push(sps[i]); }
    let pos = 0; const bit = () => { const v = (r[pos >> 3] >> (7 - (pos & 7))) & 1; pos++; return v; };
    const bits = n => { let v = 0; while (n--) v = v * 2 + bit(); return v; };
    const ue = () => { let z = 0; while (!bit() && z < 32) z++; return z ? (2 ** z - 1) + bits(z) : 0; };
    const se = () => { const k = ue(); return k & 1 ? (k + 1) / 2 : -k / 2; };
    const prof = bits(8); bits(16); ue();
    let cf = 1;
    if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(prof)) {
      cf = ue(); if (cf === 3) bit(); ue(); ue(); bit();
      if (bit()) for (let i = 0; i < (cf !== 3 ? 8 : 12); i++) if (bit()) { let l = 8, n = 8; for (let j = 0; j < (i < 6 ? 16 : 64); j++) { if (n) { n = (l + se() + 256) % 256; } l = n || l; } }
    }
    ue(); const poc = ue(); if (poc === 0) ue(); else if (poc === 1) { bit(); se(); se(); const n = ue(); for (let i = 0; i < n; i++) se(); }
    ue(); bit(); const w = ue() + 1, h = ue() + 1, fm = bit(); if (!fm) bit(); bit();
    let cl = 0, cr = 0, ct = 0, cb = 0; if (bit()) { cl = ue(); cr = ue(); ct = ue(); cb = ue(); }
    const sx = cf === 1 || cf === 2 ? 2 : 1, sy = cf === 1 ? 2 : 1, fy = 2 - fm;
    return { w: w * 16 - (cl + cr) * sx, h: (2 - fm) * h * 16 - (ct + cb) * sy * fy };
  }

  /* ---------- écriture MP4 ---------- */
  const rle = (arr, f) => { const o = []; for (const v of arr) { const l = o[o.length - 1]; if (l && l[1] === v) l[0]++; else o.push([1, v]); } return cat(o.map(([c, v]) => cat([be32(c), be32(f ? f(v) : v)]))); };
  function esds(oti, asc) {
    const dsi = asc ? [0x05, asc.length, ...asc] : [], dcd = [oti, 0x15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...dsi];
    const es = [0, 0, 0, 0x04, dcd.length, ...dcd, 0x06, 1, 2];
    return full('esds', 0, 0, u8(0x03, es.length, ...es));
  }
  /* tracks : [{ kind:'vide'|'soun', ts, samples:[{data,dur,cts,sync}], startAbs (en unités du ts), entry (boîte stsd), w, h, vol }] */
  function writeMp4(tracks) {
    const MT = 1000, ms = (v, ts) => Math.round(v * MT / ts);
    const base = 0;   // les dates de départ arrivent déjà ramenées à 0 pour la piste la plus précoce
    const build = offsets => {
      const traks = tracks.map((t, ti) => {
        const n = t.samples.length, dur = t.samples.reduce((a, s) => a + s.dur, 0);
        const lead = ms(t.startAbs - base, t.ts), mt = t.mediaStart || 0, seg = ms(dur - mt, t.ts), total = lead + seg;
        t.total = total;
        const stts = rle(t.samples.map(s => s.dur));
        const sttsBox = full('stts', 0, 0, be32(stts.length / 8), stts);
        const parts = [t.entry, sttsBox];
        if (t.kind === 'vide') {
          const cs = rle(t.samples.map(s => s.cts)); parts.push(full('ctts', 0, 0, be32(cs.length / 8), cs));
          const ss = []; t.samples.forEach((s, i) => { if (s.sync) ss.push(be32(i + 1)); }); parts.push(full('stss', 0, 0, be32(ss.length), ...ss));
        }
        parts.push(full('stsc', 0, 0, be32(1), be32(1), be32(1), be32(1)),
          full('stsz', 0, 0, be32(0), be32(n), ...t.samples.map(s => be32(s.data.length))),
          full('stco', 0, 0, be32(n), ...(offsets ? offsets[ti] : t.samples.map(() => be32(0)))));
        const elst = full('elst', 0, 0, be32((lead ? 1 : 0) + 1), ...(lead ? [be32(lead), be32(0xFFFFFFFF), be16(1), be16(0)] : []), be32(seg), be32(mt), be16(1), be16(0));
        const vid = t.kind === 'vide';
        return box('trak',
          full('tkhd', 0, 7, be32(0), be32(0), be32(ti + 1), be32(0), be32(total), zeros(8), be16(0), be16(0), be16(vid ? 0 : 0x0100), be16(0),
            be32(0x00010000), zeros(12), be32(0x00010000), zeros(12), be32(0x40000000), be32((t.w || 0) * 65536), be32((t.h || 0) * 65536)),
          box('edts', elst),
          box('mdia', full('mdhd', 0, 0, be32(0), be32(0), be32(t.ts), be32(dur), be16(0x55C4), be16(0)),
            full('hdlr', 0, 0, be32(0), str(t.kind), zeros(12), str(vid ? 'VideoHandler' : 'SoundHandler'), u8(0)),
            box('minf', vid ? full('vmhd', 0, 1, zeros(8)) : full('smhd', 0, 0, zeros(4)),
              box('dinf', full('dref', 0, 0, be32(1), full('url ', 0, 1))), box('stbl', ...parts))));
      });
      const movDur = Math.max(...tracks.map(t => t.total));
      return box('moov', full('mvhd', 0, 0, be32(0), be32(0), be32(MT), be32(movDur), be32(0x00010000), be16(0x0100), be16(0), zeros(8),
        be32(0x00010000), zeros(12), be32(0x00010000), zeros(12), be32(0x40000000), zeros(24), be32(tracks.length + 1)), ...traks);
    };
    const ftyp = box('ftyp', str('isom'), be32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'));
    const moov0 = build(null), start = ftyp.length + moov0.length + 8;
    // ordre des échantillons dans mdat : par date, pour que lecture et recherche restent fluides
    const items = []; tracks.forEach((t, ti) => { let d0 = 0; t.samples.forEach((s, si) => { items.push({ ti, si, time: (t.startAbs - base) / t.ts + d0 / t.ts }); d0 += s.dur; }); });
    items.sort((a, b) => a.time - b.time || a.ti - b.ti);
    const offsets = tracks.map(t => new Array(t.samples.length)); let pos = start; const order = [];
    for (const it of items) { const s = tracks[it.ti].samples[it.si]; offsets[it.ti][it.si] = be32(pos); pos += s.data.length; order.push(s.data); }
    if (pos > 0xFFFFFFF0) return null;   // trop gros pour des décalages sur 32 bits
    const moov = build(offsets);
    return new Blob([ftyp, moov, cat([be32(pos - start + 8), str('mdat')]), ...order], { type: 'video/mp4' });
  }

  const aacTrack = (a, startAbs) => {
    const asc = u8((a.info.ot << 3) | (a.info.sfi >> 1), ((a.info.sfi & 1) << 7) | (a.info.ch << 3));
    const entry = full('stsd', 0, 0, be32(1), box('mp4a', zeros(6), be16(1), zeros(8), be16(a.info.ch), be16(16), be16(0), be16(0), be32(a.info.rate < 65536 ? a.info.rate * 65536 : 0), esds(0x40, asc)));
    return { kind: 'soun', ts: a.info.rate, startAbs, entry, samples: a.frames.map(f => ({ data: f, dur: 1024 })) };
  };
  const mp3Track = (a, startAbs) => {
    const entry = full('stsd', 0, 0, be32(1), box('mp4a', zeros(6), be16(1), zeros(8), be16(a.info.ch), be16(16), be16(0), be16(0), be32(a.info.rate * 65536), esds(a.info.v1 ? 0x6B : 0x69, null)));
    return { kind: 'soun', ts: a.info.rate, startAbs, entry, samples: a.frames.map(f => ({ data: f, dur: a.info.spf })) };
  };

  function fromTS(buf) {
    const d = demuxTS(buf); if (!d) return null;
    const tracks = [];
    if (d.vPid >= 0) {
      let sps = null, pps = null, started = false; const smp = [];
      for (const p of d.pes.v) {
        const ns = nals(p.data), keep = []; let idr = false;
        for (const n of ns) {
          const t = n[0] & 31;
          if (t === 7 && !sps) sps = n.slice(); else if (t === 8 && !pps) pps = n.slice();
          else if (t === 5) { idr = true; keep.push(n); } else if (t === 1 || t === 6 || t === 2 || t === 3 || t === 4) keep.push(n);
        }
        if (!started) { if (!idr || !sps || !pps) continue; started = true; }
        if (!keep.length || p.pts == null) continue;
        smp.push({ data: cat(keep.flatMap(n => [be32(n.length), n])), pts: p.pts, dts: p.dts == null ? p.pts : p.dts, sync: idr });
      }
      if (smp.length < 2 || !sps || !pps) return null;
      const sz = spsSize(sps); if (!sz.w || !sz.h || sz.w > 8192 || sz.h > 8192) return null;
      let dd = 3000; const dur = [];
      for (let i = 0; i < smp.length; i++) { let x = i + 1 < smp.length ? smp[i + 1].dts - smp[i].dts : dd; if (x <= 0 || x > 90000 * 5) x = dd; dur.push(x); dd = x; }
      const d0 = smp[0].dts; let minOff = 0; smp.forEach(s => { minOff = Math.min(minOff, s.pts - s.dts); });
      let t = 0, pMin = Infinity; const samples = smp.map((s, i) => { const cts = s.pts - s.dts - minOff; pMin = Math.min(pMin, t + cts); const o = { data: s.data, dur: dur[i], cts, sync: s.sync }; t += dur[i]; return o; });
      const avcC = box('avcC', u8(1, sps[1], sps[2], sps[3], 0xFF, 0xE1), be16(sps.length), sps, u8(1), be16(pps.length), pps);
      const entry = full('stsd', 0, 0, be32(1), box('avc1', zeros(6), be16(1), zeros(16), be16(sz.w), be16(sz.h), be32(0x00480000), be32(0x00480000), be32(0), be16(1), zeros(32), be16(0x18), be16(0xFFFF), avcC));
      const pts0 = Math.min(...smp.map(s => s.pts));
      tracks.push({ kind: 'vide', ts: 90000, startAbs: pts0, mediaStart: pMin, entry, samples, w: sz.w, h: sz.h });
    }
    if (d.aPid >= 0 && d.pes.a.length) {
      const first = d.pes.a.find(p => p.pts != null), all = cat(d.pes.a.map(p => p.data));
      const a = d.aType === 0x0F ? parseAdts(all) : parseMp3(all);
      if (a && first) tracks.push((d.aType === 0x0F ? aacTrack : mp3Track)(a, first.pts * (a.info.rate / 90000)));
    }
    if (!tracks.length) return null;
    // les dates de départ sont dans l'unité de chaque piste : on les ramène à des secondes communes avant de les comparer
    const sec = tracks.map(t => t.startAbs / t.ts), m = Math.min(...sec);
    tracks.forEach((t, i) => { t.startAbs = Math.round(t.ts * (sec[i] - m)); });
    return writeMp4(tracks);
  }

  /* kind : 'ts' | 'aac' | 'mp3' ; renvoie un Blob MP4 ou null (l'appelant garde alors l'original) */
  async function convert(blob, kind) {
    try {
      if (!blob || !blob.size || blob.size > MAX_IN) return null;
      const buf = new Uint8Array(await blob.arrayBuffer());
      if (kind === 'ts') return fromTS(buf);
      if (kind === 'aac') { const a = parseAdts(buf); return a ? writeMp4([aacTrack(a, 0)]) : null; }
      if (kind === 'mp3') { const a = parseMp3(buf); return a ? writeMp4([mp3Track(a, 0)]) : null; }
      return null;
    } catch (e) { console.warn('Conversion MP4 impossible :', e); return null; }
  }
  return { convert };
})();
