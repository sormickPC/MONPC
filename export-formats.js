'use strict';
/* export-formats.js : exporte le contenu de l'éditeur de texte (HTML déjà assaini par clean()) vers
   TXT, Markdown, RTF, Word (.docx) et OpenDocument (.odt), sans serveur ni bibliothèque (JSZip, déjà présent, pour .docx/.odt).
   Un « modèle » commun est d'abord extrait du HTML : blocs (paragraphe, titre, citation, élément de liste) faits de morceaux de texte mis en forme. */

const EX_SZ = { 1: 8, 2: 10, 3: 12, 4: 14, 5: 18, 6: 24, 7: 36 };   // <font size=…> → points
const exColor = s => {
  if (!s) return '';
  try {
    const x = document.createElement('canvas').getContext('2d'); x.fillStyle = '#000000'; x.fillStyle = String(s); const v = x.fillStyle;
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.slice(1).toUpperCase();
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v); return m ? [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('').toUpperCase() : '';
  } catch { return ''; }
};
const exLab = l => (l.kind === 'ml' ? l.path.join('.') : l.n) + '.';   // « 3. » ou, pour une liste à plusieurs niveaux, « 1.2.1. »
const exSameFmt = (a, b) => ['b', 'i', 'u', 's', 'c', 'h', 'z', 'a'].every(k => a[k] === b[k]);

function exModel(html) {
  const root = document.createElement('div'); root.innerHTML = html;
  const out = [];
  const fmtOf = (e, f) => {
    const n = { ...f }, tg = e.tagName, st = e.style || {};
    if (tg === 'B' || tg === 'STRONG') n.b = 1; if (tg === 'I' || tg === 'EM') n.i = 1; if (tg === 'U') n.u = 1; if (tg === 'S' || tg === 'STRIKE') n.s = 1;
    if (tg === 'A' && e.getAttribute('href')) n.a = e.getAttribute('href');
    if (tg === 'FONT') { const col = e.getAttribute('color'); if (col) n.c = exColor(col); const sz = e.getAttribute('size'); if (sz && EX_SZ[sz]) n.z = EX_SZ[sz]; }
    const fw = st.fontWeight; if (fw === 'bold' || +fw >= 600) n.b = 1; if (st.fontStyle === 'italic') n.i = 1;
    const td = st.textDecorationLine || st.textDecoration || ''; if (/underline/.test(td)) n.u = 1; if (/line-through/.test(td)) n.s = 1;
    if (st.color) n.c = exColor(st.color); if (st.backgroundColor) n.h = exColor(st.backgroundColor);
    return n;
  };
  const inline = (node, f, runs) => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) { if (c.data) runs.push({ ...f, t: c.data.replace(/ /g, ' ') }); }
      else if (c.nodeType === 1) { if (c.tagName === 'BR') runs.push({ br: 1 }); else inline(c, fmtOf(c, f), runs); }
    }
  };
  const trim = runs => { const r = runs.slice(); while (r.length && r[r.length - 1].br) r.pop(); return r; };   // le <br> final n'est qu'un repère du navigateur
  const align = e => { const a = e.style && e.style.textAlign; return /^(center|right|justify)$/.test(a) ? a : ''; };
  function lst(ul, depth, ctx, par) {   // par : { path, root } de l'élément parent quand c'est une liste à plusieurs niveaux
    const kind = ul.tagName === 'OL' ? (ul.classList.contains('ml') ? 'ml' : 'ol') : ul.classList.contains('chk') ? 'chk' : 'ul'; let n = 0, cur = null;
    for (const li of ul.children) {
      if (li.tagName !== 'LI') continue;
      const runs = [], nested = [], f = fmtOf(li, ctx.f);
      for (const c of li.childNodes) { if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) nested.push(c); else inline({ childNodes: [c] }, f, runs); }
      const tr = trim(runs), blank = !tr.some(r => r.t && r.t.trim());
      if (!(blank && nested.length)) { n++; const path = kind === 'ml' ? ((par && par.path) || []).concat(n) : null, root = kind === 'ml' ? (par && par.root) || ul : ul; cur = kind === 'ml' ? { path, root } : null; out.push({ k: ctx.k, runs: tr, al: align(li) || ctx.al, q: ctx.q, l: { kind, level: depth, n, on: li.classList.contains('on'), list: ul, path, root } }); }   // un <li> vide qui ne contient qu'une sous-liste est un simple conteneur
      for (const u of nested) lst(u, depth + 1, ctx, kind === 'ml' ? cur : null);
    }
  }
  function blocks(node, ctx) {
    let runs = [];
    const flush = () => { if (runs.length) { out.push({ k: ctx.k, runs: trim(runs), al: ctx.al, q: ctx.q }); runs = []; } };
    for (const c of node.childNodes) {
      if (c.nodeType === 3) { if (c.data.trim() || runs.length) inline({ childNodes: [c] }, ctx.f, runs); continue; }
      if (c.nodeType !== 1) continue;
      const tg = c.tagName;
      if (tg === 'UL' || tg === 'OL') { flush(); lst(c, 0, ctx); }
      else if (tg === 'P' || tg === 'DIV' || /^H[1-3]$/.test(tg) || tg === 'BLOCKQUOTE') {
        flush(); const sub = { ...ctx, f: fmtOf(c, ctx.f), al: align(c) || ctx.al }; if (tg[0] === 'H') sub.k = tg.toLowerCase(); if (tg === 'BLOCKQUOTE') sub.q = 1;
        const before = out.length; blocks(c, sub); if (out.length === before && (tg === 'P' || c.querySelector('br'))) out.push({ k: sub.k, runs: [], al: sub.al, q: sub.q });
      } else inline({ childNodes: [c] }, ctx.f, runs);
    }
    flush();
  }
  blocks(root, { f: {}, k: 'p', al: '', q: 0 });
  return out;
}
const exMerge = runs => { const o = []; for (const r of runs) { const p = o[o.length - 1]; if (p && !r.br && !p.br && exSameFmt(p, r)) p.t += r.t; else o.push({ ...r }); } return o; };
const exPlain = b => b.runs.map(r => r.br ? '\n' : r.t).join('');

/* ---------- TXT : texte + listes (retraits, - , 1. , ☐ / ☑) ---------- */
function exTxt(m) {
  return m.map(b => {
    const t = exPlain(b);
    if (b.l) { const ind = '  '.repeat(b.l.level), mk = b.l.kind === 'ul' ? '- ' : b.l.kind === 'chk' ? (b.l.on ? '☑ ' : '☐ ') : exLab(b.l) + ' '; return ind + mk + t.replace(/\n/g, '\n' + ind + ' '.repeat(mk.length)); }
    return b.q ? '> ' + t.replace(/\n/g, '\n> ') : t;
  }).join('\n') + '\n';
}

/* ---------- Markdown ---------- */
function exMd(m) {
  const esc = t => t.replace(/([\\`*_[\]<>~|])/g, '\\$1');
  const run = r => {
    if (r.br) return '  \n';
    let t = esc(r.t); const lead = /^\s*/.exec(t)[0], trail = /\s*$/.exec(t)[0]; let body = t.slice(lead.length, t.length - trail.length); if (!body) return t;
    if (r.u) body = '<u>' + body + '</u>'; if (r.s) body = '~~' + body + '~~'; if (r.i) body = '*' + body + '*'; if (r.b) body = '**' + body + '**';
    if (r.a) body = '[' + body + '](' + r.a.replace(/ /g, '%20').replace(/\)/g, '%29') + ')';
    return lead + body + trail;
  };
  const lines = []; let prevList = false;
  for (const b of m) {
    let t = exMerge(b.runs).map(run).join('');
    if (b.l) {
      const ind = '    '.repeat(b.l.level), mk = b.l.kind === 'ul' ? '- ' : b.l.kind === 'chk' ? (b.l.on ? '- [x] ' : '- [ ] ') : (b.l.kind === 'ml' ? b.l.path[b.l.path.length - 1] : b.l.n) + '. ';
      lines.push(ind + mk + t.replace(/\n/g, '\n' + ind + '    ')); prevList = true; continue;
    }
    if (prevList) lines.push(''); prevList = false;
    if (!t.trim()) continue;
    if (/^h[1-3]$/.test(b.k)) t = '#'.repeat(+b.k[1]) + ' ' + t.replace(/\*\*/g, ''); else { t = t.replace(/^(\s*)([#>+-]|\d+[.)])/, '$1\\$2'); if (b.q) t = '> ' + t.replace(/\n/g, '\n> '); }
    lines.push(t, '');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/* ---------- RTF ---------- */
function exRtf(m) {
  const cols = []; const ci = c => { if (!c) return 0; let i = cols.indexOf(c); if (i < 0) { cols.push(c); i = cols.length - 1; } return i + 1; };
  const esc = t => { let o = ''; for (const ch of t) { const c = ch.codePointAt(0); if (ch === '\\' || ch === '{' || ch === '}') o += '\\' + ch; else if (c === 9) o += '\\tab '; else if (c > 126) { if (c > 0xffff) { const s = c - 0x10000; for (const u of [0xd800 + (s >> 10), 0xdc00 + (s & 1023)]) o += '\\u' + (u > 32767 ? u - 65536 : u) + '?'; } else o += '\\u' + (c > 32767 ? c - 65536 : c) + '?'; } else if (c >= 32) o += ch; } return o; };
  const run = r => {
    if (r.br) return '\\line ';
    let f = ''; if (r.b) f += '\\b'; if (r.i) f += '\\i'; if (r.u) f += '\\ul'; if (r.s) f += '\\strike'; if (r.c) f += '\\cf' + ci(r.c); if (r.h) f += '\\highlight' + ci(r.h); if (r.z) f += '\\fs' + r.z * 2;
    const t = '{' + f + ' ' + esc(r.t) + '}'; return r.a ? '{\\field{\\*\\fldinst{HYPERLINK "' + r.a.replace(/[\\{}"]/g, '') + '"}}{\\fldrslt{\\ul\\cf' + ci('0563C1') + ' ' + esc(r.t) + '}}}' : t;
  };
  const SZ = { h1: 36, h2: 30, h3: 26 }, AL = { center: '\\qc', right: '\\qr', justify: '\\qj' };
  const body = m.map(b => {
    let p = '\\pard' + (AL[b.al] || '\\ql'), pre = '';
    if (b.l) { const lv = b.l.level + 1; p += '\\li' + 360 * (lv + 1) + '\\fi-360'; pre = b.l.kind === 'ul' ? ['\\u8226?', '\\u9702?', '\\u9642?'][b.l.level % 3] : b.l.kind === 'chk' ? (b.l.on ? '\\u9745?' : '\\u9744?') : esc(exLab(b.l)); pre += '\\tab '; }
    else if (b.q) p += '\\li720';
    if (SZ[b.k]) p += '\\sb200\\sa80';
    const inner = exMerge(b.runs).map(run).join(''), wrap = SZ[b.k] ? '{\\b\\fs' + SZ[b.k] + ' ' + inner + '}' : inner;
    return '{' + p + ' ' + pre + wrap + '\\par}';
  }).join('\n');
  const ct = cols.map(c => '\\red' + parseInt(c.slice(0, 2), 16) + '\\green' + parseInt(c.slice(2, 4), 16) + '\\blue' + parseInt(c.slice(4, 6), 16) + ';').join('');
  return '{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0{\\fonttbl{\\f0\\fswiss Arial;}}{\\colortbl;' + ct + '}\\viewkind4\\f0\\fs24\n' + body + '\n}';
}

/* ---------- Word (.docx) ---------- */
const exXml = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
async function exDocx(m) {
  if (typeof JSZip === 'undefined') throw new Error('Bibliothèque ZIP absente (jszip.min.js).');
  const rels = []; let lists = new Map(), nid = 10;
  const runXml = r => {
    if (r.br) return '<w:r><w:br/></w:r>';
    let p = ''; const col = r.a ? '0563C1' : r.c;   // ordre imposé par le schéma Word : b, i, strike, color, sz, u, shd
    if (r.b) p += '<w:b/>'; if (r.i) p += '<w:i/>'; if (r.s) p += '<w:strike/>'; if (col) p += '<w:color w:val="' + col + '"/>'; if (r.z) p += '<w:sz w:val="' + r.z * 2 + '"/>'; if (r.a || r.u) p += '<w:u w:val="single"/>'; if (r.h) p += '<w:shd w:val="clear" w:color="auto" w:fill="' + r.h + '"/>';
    const x = '<w:r>' + (p ? '<w:rPr>' + p + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + exXml(r.t) + '</w:t></w:r>';
    if (!r.a) return x; const id = 'rIdL' + (rels.length + 1); rels.push([id, r.a]); return '<w:hyperlink r:id="' + id + '">' + x + '</w:hyperlink>';
  };
  const body = m.map(b => {
    let pp = ''; if (/^h[1-3]$/.test(b.k)) pp += '<w:pStyle w:val="Heading' + b.k[1] + '"/>'; else if (b.q && !b.l) pp += '<w:pStyle w:val="Quote"/>';
    if (b.l) {
      let id; if (b.l.kind === 'ul') id = 1; else if (b.l.kind === 'chk') id = b.l.on ? 3 : 2; else { const key = b.l.kind === 'ml' ? b.l.root : b.l.list; if (!lists.has(key)) lists.set(key, { id: nid++, ml: b.l.kind === 'ml' }); id = lists.get(key).id; }
      pp += '<w:numPr><w:ilvl w:val="' + Math.min(8, b.l.level) + '"/><w:numId w:val="' + id + '"/></w:numPr>';
    }
    if (b.al) pp += '<w:jc w:val="' + (b.al === 'justify' ? 'both' : b.al) + '"/>';
    return '<w:p>' + (pp ? '<w:pPr>' + pp + '</w:pPr>' : '') + exMerge(b.runs).map(runXml).join('') + '</w:p>';
  }).join('');
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"', R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const lvl = (i, fmt, txt, font) => '<w:lvl w:ilvl="' + i + '"><w:start w:val="1"/><w:numFmt w:val="' + fmt + '"/><w:lvlText w:val="' + txt + '"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="' + (720 + 360 * i) + '" w:hanging="360"/></w:pPr>' + (font ? '<w:rPr><w:rFonts w:ascii="' + font + '" w:hAnsi="' + font + '" w:cs="' + font + '"/></w:rPr>' : '') + '</w:lvl>';
  const lv9 = f => Array.from({ length: 9 }, (_, i) => f(i)).join('');
  const BUL = ['•', '◦', '▪'];
  const numbering = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ' + W + '>' +
    '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>' + lv9(i => lvl(i, 'bullet', BUL[i % 3], 'Arial')) + '</w:abstractNum>' +
    '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>' + lv9(i => lvl(i, 'decimal', '%' + (i + 1) + '.')) + '</w:abstractNum>' +
    '<w:abstractNum w:abstractNumId="4"><w:multiLevelType w:val="multilevel"/>' + lv9(i => lvl(i, 'decimal', Array.from({ length: i + 1 }, (_, k) => '%' + (k + 1)).join('.') + '.')) + '</w:abstractNum>' +
    '<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>' + lv9(i => lvl(i, 'bullet', '☐', 'Segoe UI Symbol')) + '</w:abstractNum>' +
    '<w:abstractNum w:abstractNumId="3"><w:multiLevelType w:val="hybridMultilevel"/>' + lv9(i => lvl(i, 'bullet', '☑', 'Segoe UI Symbol')) + '</w:abstractNum>' +
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num><w:num w:numId="3"><w:abstractNumId w:val="3"/></w:num>' +
    [...lists.values()].map(({ id, ml }) => '<w:num w:numId="' + id + '"><w:abstractNumId w:val="' + (ml ? 4 : 1) + '"/>' + lv9(i => '<w:lvlOverride w:ilvl="' + i + '"><w:startOverride w:val="1"/></w:lvlOverride>') + '</w:num>').join('') + '</w:numbering>';
  const sty = (id, name, sz, extra) => '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="' + sz + '"/></w:rPr></w:style>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + W + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="24"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' + sty('Heading1', 'heading 1', 36) + sty('Heading2', 'heading 2', 30) + sty('Heading3', 'heading 3', 26) +
    '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:i/><w:color w:val="444444"/></w:rPr></w:style></w:styles>';
  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + W + ' ' + R + '><w:body>' + (body || '<w:p/>') + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + RT + 'officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="' + RT + 'styles" Target="styles.xml"/><Relationship Id="rIdN" Type="' + RT + 'numbering" Target="numbering.xml"/>' + rels.map(([id, u]) => '<Relationship Id="' + id + '" Type="' + RT + 'hyperlink" Target="' + exXml(u) + '" TargetMode="External"/>').join('') + '</Relationships>');
  z.file('word/document.xml', doc); z.file('word/styles.xml', styles); z.file('word/numbering.xml', numbering);
  return z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ---------- OpenDocument texte (.odt) ---------- */
async function exOdt(m) {
  if (typeof JSZip === 'undefined') throw new Error('Bibliothèque ZIP absente (jszip.min.js).');
  const styles = new Map(); let sn = 0;
  const tStyle = r => { const k = [r.b, r.i, r.u, r.s, r.c, r.h, r.z].join('|'); if (!/[^|]/.test(k)) return ''; if (!styles.has(k)) styles.set(k, { n: 'T' + (++sn), r }); return styles.get(k).n; };
  const link = new Map();
  const runX = r => {
    if (r.br) return '<text:line-break/>';
    const sx = tStyle(r), t = exXml(r.t).replace(/ {2,}/g, s => ' <text:s text:c="' + (s.length - 1) + '"/>').replace(/\t/g, '<text:tab/>'), core = sx ? '<text:span text:style-name="' + sx + '">' + t + '</text:span>' : t;
    return r.a ? '<text:a xlink:type="simple" xlink:href="' + exXml(r.a) + '">' + core + '</text:a>' : core;
  };
  const AL = { center: 'center', right: 'end', justify: 'justify' }, HS = { h1: 'H1', h2: 'H2', h3: 'H3' };
  const para = (b, extra) => {
    const inner = (extra || '') + exMerge(b.runs).map(runX).join('');
    if (HS[b.k]) return '<text:h text:style-name="' + HS[b.k] + '" text:outline-level="' + b.k[1] + '">' + inner + '</text:h>';
    return '<text:p text:style-name="' + (b.q ? 'PQ' : AL[b.al] ? 'P' + b.al : 'PN') + '">' + inner + '</text:p>';
  };
  // listes : on reconstruit l'imbrication à partir des niveaux (listes à puces / numérotées) ; les cases à cocher sont des paragraphes préfixés ☐ / ☑
  let xml = '', stack = [];   // pile de { kind, list }
  const closeTo = (n, keepLast) => { while (stack.length > n) { xml += '</text:list-item></text:list>'; stack.pop(); } };
  for (const b of m) {
    if (b.l && b.l.kind !== 'chk') {
      const lv = b.l.level, kind = b.l.kind;
      if (stack.length > lv + 1) { closeTo(lv + 1); }
      if (stack.length === lv + 1 && stack[lv].list !== (kind === 'ml' ? b.l.root : b.l.list)) { closeTo(lv); }
      if (stack.length === lv + 1) xml += '</text:list-item><text:list-item>';
      else { while (stack.length < lv + 1) { const first = stack.length === lv; xml += '<text:list text:style-name="' + (first ? (kind === 'ol' ? 'LNum' : kind === 'ml' ? 'LMl' : 'LBul') : 'LBul') + '"><text:list-item>'; stack.push({ kind, list: first ? (kind === 'ml' ? b.l.root : b.l.list) : null }); if (!first) { /* niveau intermédiaire manquant */ } } }
      xml += para({ ...b, k: 'p' });
    } else {
      closeTo(0);
      if (b.l) { xml += '<text:p text:style-name="PC' + Math.min(5, b.l.level) + '">' + (b.l.on ? '☑ ' : '☐ ') + exMerge(b.runs).map(runX).join('') + '</text:p>'; } else xml += para(b);
    }
  }
  closeTo(0);
  const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';
  const tp = r => '<style:text-properties' + (r.b ? ' fo:font-weight="bold"' : '') + (r.i ? ' fo:font-style="italic"' : '') + (r.u ? ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' : '') + (r.s ? ' style:text-line-through-style="solid"' : '') + (r.c ? ' fo:color="#' + r.c + '"' : '') + (r.h ? ' fo:background-color="#' + r.h + '"' : '') + (r.z ? ' fo:font-size="' + r.z + 'pt"' : '') + '/>';
  const pst = (n, props, tpx) => '<style:style style:name="' + n + '" style:family="paragraph"><style:paragraph-properties ' + props + '/>' + (tpx || '') + '</style:style>';
  const cm = i => (0.635 * (i + 1) + 0.635).toFixed(3) + 'cm';
  const lvlDef = (i, kind) => { const pos = '<style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="' + (0.635 * (i + 2)).toFixed(3) + 'cm" fo:text-indent="-0.635cm" fo:margin-left="' + (0.635 * (i + 2)).toFixed(3) + 'cm"/></style:list-level-properties>'; return kind === 'ol' || kind === 'ml' ? '<text:list-level-style-number text:level="' + (i + 1) + '" style:num-suffix="."' + (kind === 'ml' ? ' text:display-levels="' + (i + 1) + '"' : '') + ' style:num-format="1">' + pos + '</text:list-level-style-number>' : '<text:list-level-style-bullet text:level="' + (i + 1) + '" text:bullet-char="' + ['•', '◦', '▪'][i % 3] + '">' + pos + '</text:list-level-style-bullet>'; };
  const auto = [...styles.values()].map(s => '<style:style style:name="' + s.n + '" style:family="text">' + tp(s.r) + '</style:style>').join('') +
    pst('PN', 'fo:margin-top="0cm" fo:margin-bottom="0.15cm"') + pst('Pcenter', 'fo:text-align="center" fo:margin-bottom="0.15cm"') + pst('Pend', 'fo:text-align="end" fo:margin-bottom="0.15cm"') + pst('Pjustify', 'fo:text-align="justify" fo:margin-bottom="0.15cm"') +
    pst('PQ', 'fo:margin-left="1.27cm" fo:margin-bottom="0.15cm"', '<style:text-properties fo:font-style="italic" fo:color="#444444"/>') + [0, 1, 2, 3, 4, 5].map(i => pst('PC' + i, 'fo:margin-left="' + cm(i - 1) + '" fo:margin-bottom="0.1cm"')).join('') +
    [[1, 18], [2, 15], [3, 13]].map(([n, s]) => '<style:style style:name="H' + n + '" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.4cm" fo:margin-bottom="0.15cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="' + s + 'pt" fo:font-weight="bold"/></style:style>').join('') +
    '<text:list-style style:name="LBul">' + Array.from({ length: 9 }, (_, i) => lvlDef(i, 'ul')).join('') + '</text:list-style><text:list-style style:name="LNum">' + Array.from({ length: 9 }, (_, i) => lvlDef(i, 'ol')).join('') + '</text:list-style><text:list-style style:name="LMl">' + Array.from({ length: 9 }, (_, i) => lvlDef(i, 'ml')).join('') + '</text:list-style>';
  const content = '<?xml version="1.0" encoding="UTF-8"?><office:document-content ' + NS + ' office:version="1.2"><office:automatic-styles>' + auto + '</office:automatic-styles><office:body><office:text>' + (xml || '<text:p/>') + '</office:text></office:body></office:document-content>';
  const stylesX = '<?xml version="1.0" encoding="UTF-8"?><office:document-styles ' + NS + ' office:version="1.2"><office:styles><style:default-style style:family="paragraph"><style:text-properties style:font-name="Arial" fo:font-size="12pt" fo:language="fr" fo:country="FR"/></style:default-style></office:styles><office:font-face-decls/></office:document-styles>';
  const manifest = '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/></manifest:manifest>';
  const z = new JSZip(); z.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' }); z.file('META-INF/manifest.xml', manifest); z.file('content.xml', content); z.file('styles.xml', stylesX);
  return z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.oasis.opendocument.text' });
}

/* ---------- point d'entrée : format d'après l'extension ---------- */
const EX_FORMATS = [['txt', 'Texte brut (.txt)'], ['md', 'Markdown (.md)'], ['html', 'Page web (.html)'], ['rtf', 'Rich Text (.rtf)'], ['docx', 'Word (.docx)'], ['odt', 'OpenDocument (.odt)'], ['pdf', 'PDF (.pdf)']];
async function exConvert(ext, html, cb) {   // → Blob ; html = contenu déjà assaini
  const e = String(ext).toLowerCase().replace(/^\./, '');
  if (e === 'pdf') return ptHtmlPdf(html, '', cb);
  if (e === 'html' || e === 'htm') return new Blob(['<!doctype html><meta charset="utf-8"><style>ul.chk{list-style:none;padding-left:4px}ul.chk>li{position:relative;padding-left:30px;margin:4px 0}ul.chk>li::before{content:"\\2610";position:absolute;left:4px}ul.chk>li.on{color:#777;text-decoration:line-through}ul.chk>li.on::before{content:"\\2611"}ol.ml{list-style:none;counter-reset:ml;padding-left:0}ol.ml>li{counter-increment:ml;position:relative;padding-left:2.6em}ol.ml>li::before{content:counters(ml,".") ".";position:absolute;left:0}ol.ml>li.nw{counter-increment:none}ol.ml>li.nw::before{content:none}li.nw{list-style:none}ol:not(.ml) ol:not(.ml){list-style:lower-alpha}ol:not(.ml) ol:not(.ml) ol:not(.ml){list-style:lower-roman}</style>' + html], { type: 'text/html' });
  const m = exModel(html);
  if (e === 'md' || e === 'markdown') return new Blob([exMd(m)], { type: 'text/markdown' });
  if (e === 'rtf') return new Blob([exRtf(m)], { type: 'application/rtf' });
  if (e === 'docx') return exDocx(m);
  if (e === 'odt') return exOdt(m);
  return new Blob([exTxt(m)], { type: 'text/plain' });
}
