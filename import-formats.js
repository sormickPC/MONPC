'use strict';
/* import-formats.js : ouvre dans l'éditeur de texte enrichi des fichiers TXT, Markdown, HTML, RTF, Word (.docx), OpenDocument (.odt)
   et (texte seulement) PDF. Tout est converti en « blocs » (paragraphes, titres, éléments de liste mis en forme) puis en HTML simple,
   que l'éditeur fait ensuite passer par clean() (liste blanche). Limites : images, tableaux et mises en page avancées ne sont pas repris
   (les tableaux deviennent des lignes « a | b | c »). */

const imEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const imHex = c => /^[0-9a-f]{6}$/i.test(c || '') ? '#' + c : '';
const imSize = pt => !pt ? 0 : pt <= 9 ? 1 : pt <= 10.5 ? 2 : pt <= 12.5 ? 0 : pt <= 15 ? 4 : pt <= 20 ? 5 : pt <= 28 ? 6 : 7;   // 0 = taille normale
function imRun(t, f = {}) {   // morceau de texte + mise en forme → HTML
  if (!t) return '';
  let h = imEsc(t).replace(/\t/g, '    ').replace(/ {2}/g, '  ').replace(/^ /, ' ').replace(/ $/, ' ');
  const st = (imHex(f.c) && f.c !== '000000' ? 'color:' + imHex(f.c) + ';' : '') + (imHex(f.h) && f.h !== 'FFFFFF' ? 'background-color:' + imHex(f.h) + ';' : '');
  if (st) h = '<span style="' + st + '">' + h + '</span>';
  const z = imSize(f.z); if (z) h = '<font size="' + z + '">' + h + '</font>';
  if (f.s) h = '<s>' + h + '</s>'; if (f.u && !f.a) h = '<u>' + h + '</u>'; if (f.i) h = '<i>' + h + '</i>'; if (f.b) h = '<b>' + h + '</b>';
  if (f.a) h = '<a href="' + imEsc(f.a) + '">' + h + '</a>';
  return h;
}

/* ---------- blocs → HTML (listes imbriquées) ---------- */
function edBlocksToHtml(blocks) {
  let out = '', stack = [];
  const closeTo = n => { while (stack.length > n) out += '</li></' + stack.pop().tag + '>'; };
  const liOpen = b => '<li' + (b.l.on ? ' class="on"' : '') + '>';
  for (const b of blocks) {
    const inner = b.html || '<br>';
    if (b.l) {
      const lv = Math.min(b.l.level || 0, stack.length), kind = b.l.kind;
      closeTo(lv + 1); if (stack.length === lv + 1 && stack[lv].kind !== kind) closeTo(lv);
      if (stack.length === lv + 1) out += '</li>' + liOpen(b);
      else { const tag = kind === 'ol' || kind === 'ml' ? 'ol' : 'ul'; out += '<' + tag + (kind === 'chk' ? ' class="chk"' : kind === 'ml' ? ' class="ml"' : '') + '>' + liOpen(b); stack.push({ kind, tag }); }
      out += inner; continue;
    }
    closeTo(0);
    const al = b.al && /^(center|right|justify)$/.test(b.al) ? ' style="text-align:' + b.al + '"' : '';
    if (/^h[1-3]$/.test(b.h || '')) out += '<' + b.h + al + '>' + inner + '</' + b.h + '>';
    else if (b.q) out += '<blockquote' + al + '>' + inner + '</blockquote>';
    else out += '<div' + al + '>' + inner + '</div>';
  }
  closeTo(0); return out;
}

/* ---------- Markdown ---------- */
function mdInline(s) {
  const codes = []; s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = imEsc(s).replace(/\\([\\`*_{}[\]()#+\-.!|~<>&"])/g, (_, c) => '\u0001' + c.charCodeAt(0) + '\u0001');
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, '<a href="$2">$1</a>').replace(/&lt;(https?:\/\/[^&\s]+)&gt;/g, '<a href="$1">$1</a>').replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, '<u>$1</u>');
  s = s.replace(/\*\*(\S(?:[\s\S]*?\S)?)\*\*/g, '<b>$1</b>').replace(/(^|[^\w])__(\S(?:[\s\S]*?\S)?)__(?!\w)/g, '$1<b>$2</b>').replace(/\*(\S(?:[^*]*?\S)?)\*/g, '<i>$1</i>').replace(/(^|[^\w])_(\S(?:[^_]*?\S)?)_(?!\w)/g, '$1<i>$2</i>').replace(/~~(\S(?:[\s\S]*?\S)?)~~/g, '<s>$1</s>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => '<span style="background-color:#e6e6e6">' + imEsc(codes[+i]) + '</span>').replace(/\u0001(\d+)\u0001/g, (_, c) => imEsc(String.fromCharCode(+c)));
  return s.replace(/ {2}/g, '  ');
}
function mdToHtml(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n'), blocks = []; let para = [], ind = [], inCode = false, lastList = null;
  const flush = () => { if (para.length) { blocks.push({ html: mdInline(para.join(' ')) }); para = []; } };
  for (let raw of lines) {
    if (/^\s*```/.test(raw)) { flush(); inCode = !inCode; lastList = null; continue; }
    if (inCode) { blocks.push({ html: imEsc(raw).replace(/ /g, ' ') || '' }); continue; }
    if (!raw.trim()) { flush(); continue; }   // ligne vide : fin de paragraphe (la pile de retraits de liste est conservée)
    let m;
    if ((m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw))) { flush(); ind = []; lastList = null; blocks.push({ html: mdInline(m[2]), h: 'h' + Math.min(3, m[1].length) }); continue; }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(raw)) { flush(); blocks.push({ html: '——————' }); continue; }
    if ((m = /^(\s*)([-*+]|\d{1,4}[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(raw))) {
      flush(); const w = m[1].replace(/\t/g, '    ').length; while (ind.length && w < ind[ind.length - 1]) ind.pop(); if (!ind.length || w > ind[ind.length - 1]) ind.push(w);
      const kind = m[3] != null ? 'chk' : /^\d/.test(m[2]) ? 'ol' : 'ul';
      lastList = { html: mdInline(m[4]), l: { kind, level: ind.length - 1, on: /x/i.test(m[3] || '') } }; blocks.push(lastList); continue;
    }
    if (lastList && /^\s{2,}\S/.test(raw) && !para.length) { lastList.html += ' ' + mdInline(raw.trim()); continue; }   // suite d'un élément de liste
    if ((m = /^\s*>\s?(.*)$/.exec(raw))) { flush(); ind = []; lastList = null; blocks.push({ html: mdInline(m[1]), q: 1 }); continue; }
    if (/^\s*\|.*\|\s*$/.test(raw)) { flush(); if (/^\s*\|?[\s:|-]+\|?\s*$/.test(raw)) continue; blocks.push({ html: raw.trim().replace(/^\||\|$/g, '').split('|').map(c => mdInline(c.trim())).join(' | ') }); continue; }
    ind = []; lastList = null; { const t = raw.trim(); para.push(/ {2,}$/.test(raw) ? t + '\u0002' : t); }
  }
  flush();
  return edBlocksToHtml(blocks).replace(/\u0002 ?/g, '<br>');
}

/* ---------- RTF ---------- */
function rtfToBlocks(src) {
  const blocks = [], cols = [''], ct = /\{\\colortbl;?([^}]*)\}/.exec(src);
  if (ct) for (const e of ct[1].split(';')) { const r = /\\red(\d+)\\green(\d+)\\blue(\d+)/.exec(e); cols.push(r ? [r[1], r[2], r[3]].map(n => (+n & 255).toString(16).padStart(2, '0')).join('').toUpperCase() : ''); }
  const SKIP = new Set('fonttbl colortbl stylesheet info pict listtable listoverridetable rsidtbl themedata colorschememapping latentstyles datastore header footer headerl headerr footerl footerr footnote pntxtb pntxta xmlnstbl mmathPr generator fldinst shpinst nonshppict object private revtbl'.split(' '));
  let st = { f: {}, skip: false, uc: 1, dest: '' }, stack = [], runs = [], para = { al: '', li: 0, fi: 0, ls: -1, ilvl: 0, marker: '' }, buf = '', skipN = 0, hexBuf = [], fld = null, link = '';
  const flushBuf = () => { if (buf) { runs.push({ t: buf, ...st.f, a: link || undefined }); buf = ''; } };
  const addText = t => { if (st.skip) return; if (st.dest === 'listtext') { para.marker += t; return; } if (st.dest === 'fldinst') { if (fld) fld.inst += t; return; } buf += t; };
  const flushHex = () => { if (hexBuf.length) { addText(new TextDecoder('windows-1252').decode(new Uint8Array(hexBuf))); hexBuf = []; } };
  const endPara = () => {
    flushBuf(); let rs = runs; runs = [];
    let b = { html: '', al: para.al }, l = null;
    const first = rs[0], txt = rs.map(r => r.t).join('');
    if (para.ls >= 0 || para.marker.trim()) { const mk = para.marker.replace(/[\t ]/g, ''); l = imMarkerKind(mk || '•', para.ilvl); }
    else if (first && para.fi < 0) { const m = /^([•◦▪·]|[☐☑]|\d+(?:\.\d+)*\.)\t/.exec(txt) || /^(o)\t/.exec(txt); if (m) { l = imMarkerKind(m[1], Math.max(0, Math.round(para.li / 360) - 2)); let cut = m[0].length; rs = rs.map(r => { if (cut <= 0) return r; const k = Math.min(cut, r.t.length); cut -= k; return { ...r, t: r.t.slice(k) }; }).filter(r => r.t); } }
    if (l && /^[☐☑]/.test(para.marker)) l.on = para.marker[0] === '☑';
    const big = rs.length && rs.every(r => r.b && r.z >= 13.5) && !l; const z = big ? Math.min(...rs.map(r => r.z)) : 0;
    if (big) { b.h = z >= 20 ? 'h1' : z >= 16 ? 'h2' : 'h3'; rs = rs.map(r => ({ ...r, b: 0, z: 0 })); }
    b.html = rs.map(r => r.br ? '<br>' : imRun(r.t, r)).join(''); if (l) b.l = l;
    blocks.push(b);
    para = { ...para, marker: '' };
  };
  const n = src.length; let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '{') { flushHex(); flushBuf(); stack.push(st); st = { ...st, f: { ...st.f }, dest: st.dest === 'listtext' ? 'listtext' : st.dest }; i++; let q = i; if (src[q] === '\\' && src[q + 1] === '*') { st.skip = !/^\\\*\\fldinst/.test(src.slice(q, q + 14)); } continue; }
    if (c === '}') { flushHex(); flushBuf(); const was = st; st = stack.pop() || st; if (was.dest === 'fldinst' && fld) { const m = /HYPERLINK\s+"([^"]+)"/i.exec(fld.inst); fld.url = m ? m[1] : ''; link = fld.url; } if (was.dest === 'fldrslt') link = ''; i++; continue; }
    if (c === '\\') {
      const d = src[i + 1];
      if (d === "'") { const h = parseInt(src.substr(i + 2, 2), 16); i += 4; if (skipN > 0) { skipN--; continue; } if (!st.skip && !isNaN(h)) hexBuf.push(h); continue; }
      flushHex();
      if (/[\\{}]/.test(d)) { i += 2; if (skipN > 0) { skipN--; continue; } addText(d); continue; }
      if (d === '~') { i += 2; addText(' '); continue; } if (d === '-' || d === '_') { i += 2; addText(d === '_' ? '-' : ''); continue; } if (d === '*') { i += 2; continue; }
      if (d === '\n' || d === '\r') { i += 2; if (!st.skip) { flushBuf(); endPara(); } continue; }
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i, i + 40)); if (!m) { i++; continue; }
      i += m[0].length; const w = m[1], v = m[2] != null ? +m[2] : null;
      if (SKIP.has(w) && stack.length) { st.skip = w !== 'fldinst'; if (w === 'fldinst') { st.dest = 'fldinst'; fld = { inst: '' }; } continue; }
      if (w === 'listtext' || w === 'pntext') { st.dest = 'listtext'; para.marker = ''; continue; }
      if (w === 'fldrslt') { st.dest = 'fldrslt'; flushBuf(); continue; }
      if (st.skip) continue;
      switch (w) {
        case 'par': case 'sect': flushBuf(); endPara(); break;
        case 'row': flushBuf(); runs = runs.filter((r, k, a) => !(k === a.length - 1 && r.t === ' | ')); endPara(); break;
        case 'cell': flushBuf(); runs.push({ t: ' | ' }); break;
        case 'line': flushBuf(); runs.push({ br: 1 }); break;
        case 'tab': addText('\t'); break;
        case 'emdash': addText('—'); break; case 'endash': addText('–'); break; case 'bullet': addText('•'); break;
        case 'lquote': addText('‘'); break; case 'rquote': addText('’'); break; case 'ldblquote': addText('“'); break; case 'rdblquote': addText('”'); break;
        case 'pard': para = { al: '', li: 0, fi: 0, ls: -1, ilvl: 0, marker: '' }; break;
        case 'ql': para.al = ''; break; case 'qc': para.al = 'center'; break; case 'qr': para.al = 'right'; break; case 'qj': para.al = 'justify'; break;
        case 'li': para.li = v || 0; break; case 'fi': para.fi = v || 0; break; case 'ls': para.ls = v == null ? 0 : v; break; case 'ilvl': para.ilvl = v || 0; break;
        case 'plain': flushBuf(); st.f = {}; break;
        case 'b': flushBuf(); st.f = { ...st.f, b: v === 0 ? 0 : 1 }; break; case 'i': flushBuf(); st.f = { ...st.f, i: v === 0 ? 0 : 1 }; break;
        case 'ul': case 'uld': case 'uldb': case 'ulw': flushBuf(); st.f = { ...st.f, u: v === 0 ? 0 : 1 }; break; case 'ulnone': flushBuf(); st.f = { ...st.f, u: 0 }; break;
        case 'strike': flushBuf(); st.f = { ...st.f, s: v === 0 ? 0 : 1 }; break;
        case 'cf': flushBuf(); st.f = { ...st.f, c: cols[v] || '' }; break; case 'highlight': case 'chcbpat': flushBuf(); st.f = { ...st.f, h: cols[v] || '' }; break;
        case 'fs': flushBuf(); st.f = { ...st.f, z: (v || 24) / 2 }; break;
        case 'uc': st.uc = v == null ? 1 : v; break;
        case 'u': { flushBuf(); let cp = v < 0 ? v + 65536 : v; addText(String.fromCharCode(cp)); skipN = st.uc; break; }
        default: break;
      }
      continue;
    }
    if (c === '\r' || c === '\n') { i++; continue; }
    i++; if (skipN > 0) { skipN--; continue; }
    if (st.skip) continue;
    addText(c);
  }
  flushHex(); flushBuf(); if (runs.length) endPara();
  while (blocks.length && !blocks[blocks.length - 1].html && !blocks[blocks.length - 1].l) blocks.pop();
  return blocks;
}
function imMarkerKind(mk, level) {   // texte du repère d'une liste → type de liste
  if (/^[☐☑]/.test(mk)) return { kind: 'chk', level, on: mk[0] === '☑' };
  if (/^\d+\.\d+/.test(mk)) return { kind: 'ml', level };
  if (/^(\d+|[a-zA-Z]|[ivxIVX]+)[.)]$/.test(mk)) return { kind: 'ol', level };
  return { kind: 'ul', level };
}

/* ---------- XML : Word et OpenDocument ---------- */
const imXml = s => { const d = new DOMParser().parseFromString(s, 'application/xml'); if (d.getElementsByTagName('parsererror').length) throw new Error('Document illisible (XML invalide).'); return d; };
const imKids = (n, local) => [...n.childNodes].filter(x => x.nodeType === 1 && (!local || x.localName === local));
const imAttr = (n, local) => { if (!n) return null; for (const a of n.attributes) if (a.localName === local) return a.value; return null; };
const imHl = { yellow: 'FFFF00', green: '00FF00', cyan: '00FFFF', magenta: 'FF00FF', blue: '0000FF', red: 'FF0000', darkBlue: '000080', darkCyan: '008080', darkGreen: '008000', darkMagenta: '800080', darkRed: '800000', darkYellow: '808000', darkGray: '808080', lightGray: 'C0C0C0' };

async function docxToBlocks(blob) {
  if (typeof JSZip === 'undefined') throw new Error('Bibliothèque ZIP absente (jszip.min.js).');
  if (blob.size > 60e6) throw new Error('Fichier trop volumineux (60 Mo maximum).');
  const z = await JSZip.loadAsync(blob), dx = z.file('word/document.xml'); if (!dx) throw new Error('Ce fichier n’est pas un document Word (.docx) valide.');
  const doc = imXml(await dx.async('string')), rels = new Map(), num = new Map(), abs = new Map(); let images = 0;
  const rf = z.file('word/_rels/document.xml.rels'); if (rf) for (const r of imXml(await rf.async('string')).getElementsByTagName('Relationship')) rels.set(r.getAttribute('Id'), r.getAttribute('Target'));
  const nf = z.file('word/numbering.xml');
  if (nf) {
    const nd = imXml(await nf.async('string'));
    for (const a of nd.getElementsByTagNameNS('*', 'abstractNum')) { const lv = new Map(); for (const l of imKids(a, 'lvl')) lv.set(+imAttr(l, 'ilvl'), { fmt: imAttr(imKids(l, 'numFmt')[0], 'val'), txt: imAttr(imKids(l, 'lvlText')[0], 'val') || '' }); abs.set(imAttr(a, 'abstractNumId'), lv); }
    for (const n of nd.getElementsByTagNameNS('*', 'num')) { const a = imKids(n, 'abstractNumId')[0]; if (a) num.set(imAttr(n, 'numId'), imAttr(a, 'val')); }
  }
  const listOf = (numId, lvl) => {
    const lv = abs.get(num.get(numId)); const d = lv && lv.get(lvl) || { fmt: 'bullet', txt: '•' };
    if (d.fmt === 'bullet' || d.fmt === 'none') return { kind: /☐/.test(d.txt) ? 'chk' : /☑/.test(d.txt) ? 'chk' : 'ul', level: lvl, on: /☑/.test(d.txt) };
    return { kind: (d.txt.match(/%\d/g) || []).length >= 2 ? 'ml' : 'ol', level: lvl };
  };
  const runProps = (rp, f) => {
    const n = { ...f }; if (!rp) return n;
    const on = tag => { const e = imKids(rp, tag)[0]; if (!e) return null; const v = imAttr(e, 'val'); return !(v === '0' || v === 'false' || v === 'none'); };
    const b = on('b'), i = on('i'), u = on('u'), s = on('strike'); if (b != null) n.b = +b; if (i != null) n.i = +i; if (u != null) n.u = +u; if (s != null) n.s = +s;
    const c = imKids(rp, 'color')[0]; if (c && imAttr(c, 'val') && imAttr(c, 'val') !== 'auto') n.c = imAttr(c, 'val');
    const h = imKids(rp, 'highlight')[0]; if (h && imHl[imAttr(h, 'val')]) n.h = imHl[imAttr(h, 'val')]; const sh = imKids(rp, 'shd')[0]; if (sh && /^[0-9a-f]{6}$/i.test(imAttr(sh, 'fill') || '')) n.h = imAttr(sh, 'fill');
    const sz = imKids(rp, 'sz')[0]; if (sz) n.z = +imAttr(sz, 'val') / 2;
    return n;
  };
  const runs = (p, f, out, link) => {
    for (const c of imKids(p)) {
      const t = c.localName;
      if (t === 'r') {
        const rf = runProps(imKids(c, 'rPr')[0], f); let buf = '';
        const fl = () => { if (buf) { out.push({ t: buf, ...rf, a: link }); buf = ''; } };
        for (const k of imKids(c)) { const kn = k.localName; if (kn === 't') buf += k.textContent; else if (kn === 'tab') buf += '\t'; else if (kn === 'br' || kn === 'cr') { if (imAttr(k, 'type') !== 'page') { fl(); out.push({ br: 1 }); } } else if (kn === 'noBreakHyphen') buf += '-'; else if (kn === 'drawing' || kn === 'pict') images++; }
        fl();
      } else if (t === 'hyperlink') { const id = imAttr(c, 'id'), url = id && rels.get(id); runs(c, { ...f, u: 1 }, out, /^https?:/i.test(url || '') ? url : link); }
      else if (t === 'ins' || t === 'smartTag' || t === 'sdtContent' || t === 'fldSimple' || t === 'sdt') runs(c, f, out, link);
    }
  };
  const blocks = [];
  const para = p => {
    const pp = imKids(p, 'pPr')[0], out = [], sty = pp && imAttr(imKids(pp, 'pStyle')[0], 'val') || '';
    runs(p, {}, out, undefined); while (out.length && out[out.length - 1].br) out.pop();
    const b = { html: out.map(r => r.br ? '<br>' : imRun(r.t, r)).join('') };
    const jc = pp && imAttr(imKids(pp, 'jc')[0], 'val'); if (jc) b.al = jc === 'both' ? 'justify' : jc === 'start' ? '' : jc === 'end' ? 'right' : jc;
    const hm = /^(?:Heading|heading|Titre)\s?([1-6])$/.exec(sty); if (hm) b.h = 'h' + Math.min(3, +hm[1]); else if (/^(Title|Titre)$/i.test(sty)) b.h = 'h1'; else if (/quote|citation/i.test(sty)) b.q = 1;
    const np = pp && imKids(pp, 'numPr')[0]; if (np) { const id = imAttr(imKids(np, 'numId')[0], 'val'), lv = +(imAttr(imKids(np, 'ilvl')[0], 'val') || 0); if (id && id !== '0') b.l = listOf(id, lv); }
    blocks.push(b);
  };
  const body = (n) => {
    for (const c of imKids(n)) {
      const t = c.localName;
      if (t === 'p') para(c);
      else if (t === 'tbl') for (const tr of c.getElementsByTagNameNS('*', 'tr')) { const cells = imKids(tr, 'tc').map(tc => [...tc.getElementsByTagNameNS('*', 't')].map(x => x.textContent).join('').trim()); blocks.push({ html: imEsc(cells.join(' | ')) }); }
      else if (t === 'sdt') { const sc = imKids(c, 'sdtContent')[0]; if (sc) body(sc); }
    }
  };
  body(doc.getElementsByTagNameNS('*', 'body')[0]);
  return { blocks, note: images ? images + ' image(s) non reprise(s) (l’éditeur ne gère pas les images).' : '' };
}

async function odtToBlocks(blob) {
  if (typeof JSZip === 'undefined') throw new Error('Bibliothèque ZIP absente (jszip.min.js).');
  if (blob.size > 60e6) throw new Error('Fichier trop volumineux (60 Mo maximum).');
  const z = await JSZip.loadAsync(blob), cf = z.file('content.xml'); if (!cf) throw new Error('Ce fichier n’est pas un document OpenDocument (.odt) valide.');
  const doc = imXml(await cf.async('string')), sf = z.file('styles.xml'), sdoc = sf ? imXml(await sf.async('string')) : null; let images = 0;
  const tst = new Map(), pst = new Map(), lst = new Map();
  const readStyles = d => {
    if (!d) return;
    for (const s of d.getElementsByTagNameNS('*', 'style')) {
      const name = imAttr(s, 'name'), fam = imAttr(s, 'family'), tp = imKids(s, 'text-properties')[0], pp = imKids(s, 'paragraph-properties')[0], par = imAttr(s, 'parent-style-name');
      const f = {}; if (tp) { if (imAttr(tp, 'font-weight') === 'bold') f.b = 1; if (imAttr(tp, 'font-style') === 'italic') f.i = 1; const us = imAttr(tp, 'text-underline-style'); if (us && us !== 'none') f.u = 1; const ls = imAttr(tp, 'text-line-through-style'); if (ls && ls !== 'none') f.s = 1; const c = imAttr(tp, 'color'); if (c && /^#[0-9a-f]{6}$/i.test(c)) f.c = c.slice(1); const bg = imAttr(tp, 'background-color'); if (bg && /^#[0-9a-f]{6}$/i.test(bg)) f.h = bg.slice(1); const fs = imAttr(tp, 'font-size'); if (fs && /pt$/.test(fs)) f.z = parseFloat(fs); }
      const info = { f, par, al: pp ? imAttr(pp, 'text-align') : '', ml: pp ? parseFloat(imAttr(pp, 'margin-left') || '0') : 0 };
      if (fam === 'text') tst.set(name, info); else if (fam === 'paragraph') pst.set(name, info);
    }
    for (const l of d.getElementsByTagNameNS('*', 'list-style')) { const lv = new Map(); for (const k of imKids(l)) { const level = +imAttr(k, 'level') - 1; if (k.localName === 'list-level-style-bullet') lv.set(level, { kind: /☐|☑/.test(imAttr(k, 'bullet-char') || '') ? 'chk' : 'ul', on: /☑/.test(imAttr(k, 'bullet-char') || '') }); else if (k.localName === 'list-level-style-number') lv.set(level, { kind: +(imAttr(k, 'display-levels') || 1) >= 2 ? 'ml' : 'ol' }); } lst.set(imAttr(l, 'name'), lv); }
  };
  readStyles(sdoc); readStyles(doc);
  const chain = (m, name) => { let f = {}, al = '', ml = 0, n = name, g = 0; const arr = []; while (n && m.has(n) && g++ < 6) { arr.unshift(m.get(n)); n = m.get(n).par; } for (const s of arr) { f = { ...f, ...s.f }; if (s.al) al = s.al; if (s.ml) ml = s.ml; } return { f, al, ml }; };
  const inl = (n, f, out, link) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { if (c.data) out.push({ t: c.data.replace(/\s+/g, ' '), ...f, a: link }); continue; }
      if (c.nodeType !== 1) continue; const t = c.localName;
      if (t === 'span') inl(c, { ...f, ...chain(tst, imAttr(c, 'style-name')).f }, out, link);
      else if (t === 'a') { const h = imAttr(c, 'href'); inl(c, { ...f, u: 1 }, out, /^https?:/i.test(h || '') ? h : link); }
      else if (t === 's') out.push({ t: ' '.repeat(+(imAttr(c, 'c') || 1)), ...f, a: link }); else if (t === 'tab') out.push({ t: '\t', ...f }); else if (t === 'line-break') out.push({ br: 1 });
      else if (t === 'frame' || t === 'image') images++; else if (t === 'note' || t === 'annotation') { /* ignoré */ } else inl(c, f, out, link);
    }
  };
  const blocks = [], lstStack = [];
  const para = (p, l) => {
    const out = [], ps = chain(pst, imAttr(p, 'style-name')); inl(p, ps.f, out, undefined); while (out.length && out[out.length - 1].br) out.pop();
    const b = { html: out.map(r => r.br ? '<br>' : imRun(r.t, r)).join('') }; if (ps.al && ps.al !== 'start') b.al = ps.al === 'end' ? 'right' : ps.al;
    if (p.localName === 'h') b.h = 'h' + Math.min(3, +(imAttr(p, 'outline-level') || 1));
    if (l) b.l = l;
    else {
      const plain = out.map(r => r.t || '').join(''), m = /^([☐☑])\s?/.exec(plain);
      if (m) { const first = out.find(r => r.t); first.t = first.t.replace(/^[☐☑]\s?/, ''); b.html = out.map(r => r.br ? '<br>' : imRun(r.t, r)).join(''); b.l = { kind: 'chk', level: Math.max(0, Math.round(ps.ml / 0.635) - 1), on: m[1] === '☑' }; }
      else if (ps.ml >= 1.2 && !b.h) b.q = 1;
    }
    blocks.push(b);
  };
  const list = (ul, depth, parentName) => {
    const name = imAttr(ul, 'style-name') || parentName, lv = (lst.get(name) || new Map()).get(depth) || { kind: 'ul' };
    for (const it of imKids(ul, 'list-item')) for (const c of imKids(it)) { if (c.localName === 'p' || c.localName === 'h') para(c, { kind: lv.kind, level: depth, on: !!lv.on }); else if (c.localName === 'list') list(c, depth + 1, name); }
  };
  const walk = n => {
    for (const c of imKids(n)) {
      const t = c.localName;
      if (t === 'p' || t === 'h') para(c, null); else if (t === 'list') list(c, 0, '');
      else if (t === 'table') for (const tr of c.getElementsByTagNameNS('*', 'table-row')) { const cells = imKids(tr, 'table-cell').map(tc => tc.textContent.trim()); blocks.push({ html: imEsc(cells.join(' | ')) }); }
      else if (t === 'section' || t === 'text') walk(c);
    }
  };
  walk(doc.getElementsByTagNameNS('*', 'text')[0]);
  return { blocks, note: images ? images + ' image(s) non reprise(s) (l’éditeur ne gère pas les images).' : '' };
}

/* ---------- PDF : texte seulement ---------- */
async function pdfToText(blob) {
  if (typeof pdfLib !== 'function') throw new Error('Lecteur PDF indisponible.');
  const lib = await pdfLib(), task = lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, enableXfa: false, useSystemFonts: true });
  const pdf = await task.promise, out = [], n = Math.min(pdf.numPages, 150);
  for (let p = 1; p <= n; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent(); let s = '', y = null, x1 = null;
    for (const it of tc.items) {
      if (!('str' in it)) continue; const ty = it.transform[5], tx = it.transform[4];
      if (y !== null && Math.abs(ty - y) > 2) s += '\n'; else if (x1 !== null && tx - x1 > 1.5 && s && !/\s$/.test(s)) s += ' ';
      s += it.str; y = ty; x1 = tx + (it.width || 0); if (it.hasEOL) { s += '\n'; y = null; }
    }
    out.push(s.replace(/[ \t]+\n/g, '\n').trim());
  }
  try { pdf.destroy(); } catch { /* déjà détruit */ }
  return out.join('\n\n') + (pdf.numPages > n ? '\n\n[… ' + (pdf.numPages - n) + ' page(s) non lue(s)]' : '');
}

/* ---------- point d'entrée ---------- */
const ED_OPEN_EXT = 'txt md markdown html htm rtf docx odt pdf csv tsv json log ini yml yaml xml css js srt vtt';
async function edImport(blob, name) {   // → { html } ou { text }, + note, fmt
  const e = String(name).split('.').pop().toLowerCase();
  if (e === 'docx') { const r = await docxToBlocks(blob); return { html: edBlocksToHtml(r.blocks), note: r.note || 'Document Word importé : tableaux aplatis, images ignorées.', fmt: e }; }
  if (e === 'odt') { const r = await odtToBlocks(blob); return { html: edBlocksToHtml(r.blocks), note: r.note || 'Document OpenDocument importé : tableaux aplatis, images ignorées.', fmt: e }; }
  if (e === 'doc' || e === 'xls' || e === 'ppt') throw new Error('Ancien format binaire (.' + e + ') : enregistrez-le d’abord en .docx ou .odt.');
  if (blob.size > 30e6) throw new Error('Fichier trop volumineux (30 Mo maximum).');
  if (e === 'pdf') return { text: await pdfToText(blob), note: 'Texte extrait du PDF : la mise en page, les images et les tableaux sont perdus. Il s’enregistrera sous un nouveau nom.', fmt: e, extracted: true };
  const buf = await blob.arrayBuffer(), txt = decodeText(buf);
  if (e === 'rtf' || /^\s*\{\\rtf/.test(txt.slice(0, 20))) return { html: edBlocksToHtml(rtfToBlocks(txt)), note: 'Document RTF importé : images et tableaux simplifiés.', fmt: 'rtf' };
  if (e === 'md' || e === 'markdown') return { html: mdToHtml(txt), fmt: 'md' };
  if (e === 'html' || e === 'htm') { const d = new DOMParser().parseFromString(txt, 'text/html'); return { html: d.body ? d.body.innerHTML : '', fmt: 'html' }; }
  return { text: txt, fmt: e };
}
