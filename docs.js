'use strict';
/* sormick Cloud — Lecteur de documents : PDF (PDF.js), Word .docx, Excel .xlsx, PowerPoint .pptx, OpenDocument .odt/.ods/.odp, texte et CSV.
   Les documents sont convertis en éléments DOM (createElement / textContent) : aucun HTML issu du document n'est injecté.
   Bibliothèques locales : jszip.min.js (archives ZIP) et pdfjs.js + pdfjs-worker.js (PDF), chargées seulement à l'ouverture d'un document.
   Limites assumées : mise en page simplifiée pour les formats Office (texte, styles, listes, tableaux, images) ; pas de .doc/.xls/.ppt anciens. */

const NS_ = { w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', a: 'http://schemas.openxmlformats.org/drawingml/2006/main', wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing' };
const kidsOf = (n, name) => [...n.childNodes].filter(x => x.nodeType === 1 && (!name || x.localName === name));
const kid = (n, name) => kidsOf(n, name)[0] || null;
const desc = (n, name) => [...n.getElementsByTagNameNS('*', name)];
const at = (n, local, ns) => n ? (ns ? n.getAttributeNS(ns, local) : null) || n.getAttribute(local) || n.getAttribute('w:' + local) || n.getAttribute('r:' + local) || n.getAttribute('text:' + local) || n.getAttribute('table:' + local) || n.getAttribute('xlink:' + local) || '' : '';
function xml(s) {
  if (/<!DOCTYPE|<!ENTITY/i.test(s)) throw new Error('Document refusé (déclaration XML non autorisée).');
  const d = new DOMParser().parseFromString(s, 'application/xml');
  if (d.getElementsByTagName('parsererror').length) throw new Error('Document illisible (XML invalide).');
  return d;
}
async function zxml(zip, path) {
  const f = zip.file(path); if (!f) return null;
  if (f._data && f._data.uncompressedSize > 60e6) throw new Error('Document trop volumineux.');
  return xml(await f.async('string'));
}
async function zimg(zip, path, urls) {   // image intégrée → URL blob (formats raster sûrs uniquement)
  const m = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext(path)], f = zip.file(path);
  if (!m || !f || (f._data && f._data.uncompressedSize > 25e6)) return null;
  const u = URL.createObjectURL(new Blob([await f.async('uint8array')], { type: m })); urls.push(u); return u;
}
const relMap = async (zip, path) => { const d = await zxml(zip, path), m = new Map(); if (d) for (const r of desc(d.documentElement, 'Relationship')) m.set(r.getAttribute('Id'), { t: r.getAttribute('Target') || '', ext: r.getAttribute('TargetMode') === 'External' }); return m; };
const resolveP = (base, t) => { const p = (t.startsWith('/') ? t.slice(1) : base + t).split('/'), o = []; for (const s of p) { if (s === '..') o.pop(); else if (s !== '.' && s) o.push(s); } return o.join('/'); };
const hex6 = v => /^[0-9A-Fa-f]{6}$/.test(v) ? '#' + v : '';
async function needZip() { if (typeof JSZip === 'undefined') throw new Error('Bibliothèque de lecture Office absente (jszip.min.js).'); }
const loadZip = async blob => { await needZip(); if (blob.size > 80e6) throw new Error('Fichier trop volumineux (80 Mo maximum).'); return JSZip.loadAsync(blob); };

/* ---------- Word (.docx) ---------- */
async function renderDocx(blob, host, urls) {
  const zip = await loadZip(blob), docx = await zxml(zip, 'word/document.xml'); if (!docx) throw new Error('Ce fichier n’est pas un document Word valide.');
  const rels = await relMap(zip, 'word/_rels/document.xml.rels'), stylesX = await zxml(zip, 'word/styles.xml'), numX = await zxml(zip, 'word/numbering.xml');
  const styles = new Map();
  if (stylesX) for (const s of desc(stylesX.documentElement, 'style')) if (at(s, 'type') === 'paragraph' || at(s, 'type') === 'character') styles.set(at(s, 'styleId'), { name: at(kid(s, 'name'), 'val').toLowerCase(), base: at(kid(s, 'basedOn'), 'val'), rPr: kid(s, 'rPr'), pPr: kid(s, 'pPr') });
  const fmts = new Map(), nums = new Map();
  if (numX) {
    for (const a of kidsOf(numX.documentElement, 'abstractNum')) { const m = new Map(); for (const l of kidsOf(a, 'lvl')) m.set(+at(l, 'ilvl'), at(kid(l, 'numFmt'), 'val')); fmts.set(at(a, 'abstractNumId'), m); }
    for (const n of kidsOf(numX.documentElement, 'num')) nums.set(at(n, 'numId'), at(kid(n, 'abstractNumId'), 'val'));
  }
  const chain = id => { const o = []; for (let k = 0; id && styles.has(id) && k < 6; k++) { o.unshift(styles.get(id)); id = styles.get(id).base; } return o; };
  const HL = { yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000' };
  const on = n => { if (!n) return false; const v = at(n, 'val'); return v !== '0' && v !== 'false' && v !== 'off' && v !== 'none'; };
  const runCss = rprs => {
    let css = '';
    for (const r of rprs) if (r) {
      if (kid(r, 'b')) css += `font-weight:${on(kid(r, 'b')) ? 700 : 400};`; if (kid(r, 'i')) css += `font-style:${on(kid(r, 'i')) ? 'italic' : 'normal'};`;
      const u = kid(r, 'u'), st = kid(r, 'strike') || kid(r, 'dstrike'); if (u || st) css += `text-decoration:${[u && on(u) ? 'underline' : '', st && on(st) ? 'line-through' : ''].join(' ').trim() || 'none'};`;
      const c = hex6(at(kid(r, 'color'), 'val')); if (c) css += `color:${c};`; const h = HL[at(kid(r, 'highlight'), 'val')]; if (h) css += `background:${h};`;
      const sz = +at(kid(r, 'sz'), 'val'); if (sz >= 4 && sz <= 400) css += `font-size:${Math.round(sz * 0.667 * 10) / 10}pt;`;
      const va = at(kid(r, 'vertAlign'), 'val'); if (va === 'superscript') css += 'vertical-align:super;font-size:.75em;'; if (va === 'subscript') css += 'vertical-align:sub;font-size:.75em;';
      if (kid(r, 'caps') && on(kid(r, 'caps'))) css += 'text-transform:uppercase;';
    }
    return css;
  };
  const cnt = new Map();
  const marker = (numId, lvl) => {
    const abs = nums.get(numId), f = (fmts.get(abs) || new Map()).get(lvl) || 'bullet', key = numId + ':' + lvl;
    for (const k of [...cnt.keys()]) if (k.startsWith(numId + ':') && +k.split(':')[1] > lvl) cnt.delete(k);
    const n = (cnt.get(key) || 0) + 1; cnt.set(key, n);
    const roman = x => { let s = ''; for (const [v, r] of [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]) while (x >= v) { s += r; x -= v; } return s; };
    const L = x => String.fromCharCode(96 + ((x - 1) % 26) + 1);
    return { decimal: n + '.', lowerLetter: L(n) + ')', upperLetter: L(n).toUpperCase() + ')', lowerRoman: roman(n) + '.', upperRoman: roman(n).toUpperCase() + '.', bullet: ['•', '◦', '▪'][lvl % 3] }[f] || '•';
  };
  const image = async d => {
    const b = desc(d, 'blip')[0]; if (!b) return null; const rid = at(b, 'embed', NS_.r), rel = rels.get(rid); if (!rel || rel.ext) return null;
    const u = await zimg(zip, resolveP('word/', rel.t), urls); if (!u) return null;
    const im = el('img', { alt: at(desc(d, 'docPr')[0], 'descr').slice(0, 200), src: u, className: 'dv-img' }), ex = desc(d, 'extent')[0];
    if (ex && +ex.getAttribute('cx') > 0) im.style.width = Math.min(+ex.getAttribute('cx') / 9525, 2000) + 'px';
    return im;
  };
  async function inline(node, rprs, into) {
    for (const c of kidsOf(node)) {
      const n = c.localName;
      if (n === 'r') {
        const rp = [...rprs, ...(kid(c, 'rStyle') ? chain(at(kid(c, 'rStyle'), 'val')).map(s => s.rPr) : []), kid(c, 'rPr')], css = runCss(rp), s = el('span', css ? { style: css } : {});
        for (const k of kidsOf(c)) {
          if (k.localName === 't') s.append(k.textContent); else if (k.localName === 'tab') s.append('\t'); else if (k.localName === 'noBreakHyphen') s.append('-');
          else if (k.localName === 'br' || k.localName === 'cr') s.append(at(k, 'type') === 'page' ? el('hr', { className: 'dv-pb' }) : el('br'));
          else if (k.localName === 'drawing' || k.localName === 'pict') { const im = await image(k); if (im) s.append(im); }
        }
        into.append(s);
      } else if (n === 'hyperlink') {
        const rel = rels.get(at(c, 'id', NS_.r)), h = rel && rel.ext ? httpUrl(rel.t) : null, a = h ? el('a', { href: h, target: '_blank', rel: 'noopener noreferrer' }) : el('span');
        await inline(c, rprs, a); into.append(a);
      } else if (['sdt', 'sdtContent', 'smartTag', 'fldSimple', 'ins', 'customXml'].includes(n)) await inline(c, rprs, into);
    }
  }
  const algn = { center: 'center', right: 'right', both: 'justify', end: 'right' };
  async function para(p) {
    const pPr = kid(p, 'pPr'), sid = pPr && at(kid(pPr, 'pStyle'), 'val'), ch = chain(sid), names = ch.map(s => s.name);
    const hm = names.map(n => (n.match(/^heading (\d)/) || [])[1]).find(Boolean), isTitle = names.includes('title'), lvl = hm ? Math.min(6, +hm) : isTitle ? 1 : 0;
    let np = pPr && kid(pPr, 'numPr'); if (!np) for (const s of [...ch].reverse()) if (s.pPr && kid(s.pPr, 'numPr')) { np = kid(s.pPr, 'numPr'); break; }   // liste définie par le style (ex. « Liste à puces »)
    const numId = np && at(kid(np, 'numId'), 'val'), il = np ? +at(kid(np, 'ilvl'), 'val') || 0 : 0;
    const e = el(lvl ? 'h' + lvl : 'p', { className: 'dv-p' });
    let jc = pPr && at(kid(pPr, 'jc'), 'val'); for (const s of ch) if (!jc && s.pPr) jc = at(kid(s.pPr, 'jc'), 'val'); if (algn[jc]) e.style.textAlign = algn[jc];
    if (numId && numId !== '0') { e.classList.add('dv-li'); e.style.marginLeft = (1.6 * (il + 1)) + 'em'; e.append(el('span', { className: 'dv-mk', textContent: marker(numId, il) })); }
    await inline(p, [...ch.map(s => s.rPr), pPr && kid(pPr, 'rPr')], e);
    if (!e.textContent.trim() && !e.querySelector('img,hr')) e.append(el('br'));
    return e;
  }
  async function blocks(node, into) {
    for (const c of kidsOf(node)) {
      if (c.localName === 'p') into.append(await para(c));
      else if (c.localName === 'tbl') {
        const t = el('table', { className: 'dv-tbl' });
        for (const tr of kidsOf(c, 'tr')) {
          const r = el('tr'); t.append(r);
          for (const tc of kidsOf(tr, 'tc')) {
            const pr = kid(tc, 'tcPr'), td = el('td'), gs = pr && +at(kid(pr, 'gridSpan'), 'val'), f = pr && hex6(at(kid(pr, 'shd'), 'fill'));
            if (gs > 1) td.colSpan = Math.min(gs, 50); if (f) td.style.background = f; await blocks(tc, td); r.append(td);
          }
        }
        into.append(t);
      } else if (c.localName === 'sdt') { const sc = kid(c, 'sdtContent'); if (sc) await blocks(sc, into); }
    }
  }
  const body = kid(docx.documentElement, 'body'), page = el('div', { className: 'dv-paper' }); await blocks(body, page); host.append(page);
}

/* ---------- PowerPoint (.pptx) ---------- */
async function renderPptx(blob, host, urls) {
  const zip = await loadZip(blob), pres = await zxml(zip, 'ppt/presentation.xml'); if (!pres) throw new Error('Ce fichier n’est pas une présentation PowerPoint valide.');
  const prel = await relMap(zip, 'ppt/_rels/presentation.xml.rels'); let slides = [];
  for (const s of desc(pres.documentElement, 'sldId')) { const r = prel.get(at(s, 'id', NS_.r)); if (r) slides.push(resolveP('ppt/', r.t)); }
  if (!slides.length) slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/g).pop()) - parseInt(b.match(/\d+/g).pop()));
  if (!slides.length) throw new Error('Aucune diapositive trouvée.');
  const wrap = el('div', { className: 'dv-slides' });
  for (const [k, path] of slides.slice(0, 300).entries()) {
    const d = await zxml(zip, path); if (!d) continue; const dir = path.replace(/[^/]+$/, ''), rels = await relMap(zip, dir + '_rels/' + path.split('/').pop() + '.rels');
    const card = el('section', { className: 'dv-slide' }, el('small', { className: 'mut', textContent: 'Diapositive ' + (k + 1) + ' / ' + slides.length }));
    for (const sp of desc(d.documentElement, 'sp')) {
      const ph = desc(sp, 'ph')[0], isTitle = ph && /^(title|ctrTitle)$/.test(at(ph, 'type')), tx = kid(sp, 'txBody'); if (!tx) continue;
      for (const p of kidsOf(tx, 'p')) {
        const t = desc(p, 'r').map(r => (kid(r, 't') || {}).textContent || '').join('') ; if (!t.trim()) continue;
        const lvl = +at(kid(p, 'pPr'), 'lvl') || 0; const e = el(isTitle ? 'h3' : 'p', { textContent: t }); if (!isTitle) { e.className = 'dv-sl'; e.style.marginLeft = lvl * 1.4 + 'em'; } card.append(e);
      }
    }
    for (const pic of desc(d.documentElement, 'pic')) { const b = desc(pic, 'blip')[0], rl = b && rels.get(at(b, 'embed', NS_.r)); if (rl && !rl.ext) { const u = await zimg(zip, resolveP(dir, rl.t), urls); if (u) card.append(el('img', { src: u, alt: '', className: 'dv-img' })); } }
    wrap.append(card);
  }
  host.append(wrap);
}

/* ---------- Excel (.xlsx) ---------- */
const colName = n => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
const colIdx = r => { let n = 0; for (const ch of r.replace(/[^A-Z]/gi, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
async function renderXlsx(blob, host) {
  const zip = await loadZip(blob), wb = await zxml(zip, 'xl/workbook.xml'); if (!wb) throw new Error('Ce fichier n’est pas un classeur Excel valide.');
  const rels = await relMap(zip, 'xl/_rels/workbook.xml.rels'), ss = await zxml(zip, 'xl/sharedStrings.xml'), st = await zxml(zip, 'xl/styles.xml');
  const strings = ss ? kidsOf(ss.documentElement, 'si').map(si => desc(si, 't').map(t => t.textContent).join('')) : [];
  const custom = new Map(); if (st) for (const f of desc(st.documentElement, 'numFmt')) custom.set(at(f, 'numFmtId'), at(f, 'formatCode'));
  const xfs = st ? kidsOf(kid(st.documentElement, 'cellXfs') || st.documentElement, 'xf').map(x => at(x, 'numFmtId')) : [];
  const isDate = id => { if (/^(1[4-9]|2[0-2]|2[7-9]|3[0-6]|4[5-7]|5[0-8])$/.test(id)) return true; const c = custom.get(id); return !!c && /[ymdhs]/i.test(c.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')); };
  const sheets = desc(wb.documentElement, 'sheet').map(s => ({ name: at(s, 'name') || 'Feuille', path: (rels.get(at(s, 'id', NS_.r)) || {}).t })).filter(s => s.path).map(s => ({ ...s, path: resolveP('xl/', s.path) }));
  if (!sheets.length) throw new Error('Aucune feuille trouvée.');
  const val = c => {
    const t = at(c, 't'), v = (kid(c, 'v') || {}).textContent;
    if (t === 's') return strings[+v] ?? ''; if (t === 'inlineStr') return desc(c, 't').map(x => x.textContent).join(''); if (t === 'b') return v === '1' ? 'VRAI' : 'FAUX'; if (t === 'str' || t === 'e') return v || '';
    if (v == null || v === '') return ''; const n = Number(v); if (!isFinite(n)) return v;
    if (isDate(xfs[+at(c, 's')] || '0')) { const d = new Date(Math.round((n - 25569) * 864e5)); return d.toLocaleDateString('fr-FR', { timeZone: 'UTC' }) + (n % 1 ? ' ' + d.toLocaleTimeString('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }) : ''); }
    return String(parseFloat(n.toPrecision(12)));
  };
  const cache = new Map(), view = el('div', { className: 'dv-sheet' }), tabs = el('div', { className: 'row tight dv-tabs' });
  const show = async k => {
    [...tabs.children].forEach((b, j) => b.classList.toggle('on', j === k));
    if (!cache.has(k)) {
      const d = await zxml(zip, sheets[k].path), t = el('table', { className: 'dv-grid' }); let rows = 0, maxC = 0, cut = false;
      if (d) for (const r of desc(d.documentElement, 'row')) {
        if (rows >= 3000) { cut = true; break; }
        const cells = new Map(); for (const c of kidsOf(r, 'c')) { const i = colIdx(at(c, 'r')); if (i < 60) cells.set(i, val(c)); else cut = true; }
        const rn = +at(r, 'r') || rows + 1; if (!cells.size) continue; const tr = el('tr', {}, el('th', { textContent: rn })); maxC = Math.max(maxC, ...cells.keys());
        t.append(tr); tr._c = cells; rows++;
      }
      for (const tr of [...t.rows]) { const cells = tr._c; for (let i = 0; i <= maxC; i++) tr.append(el('td', { textContent: cells.get(i) ?? '' })); }
      t.prepend(el('tr', {}, el('th'), ...Array.from({ length: maxC + 1 }, (_, i) => el('th', { textContent: colName(i) }))));
      cache.set(k, el('div', {}, rows ? t : el('p', { className: 'mut', textContent: 'Feuille vide.' }), cut ? el('p', { className: 'mut', textContent: 'Affichage limité (3 000 lignes, 60 colonnes).' }) : null));
    }
    view.replaceChildren(cache.get(k));
  };
  sheets.slice(0, 40).forEach((s, k) => tabs.append(el('button', { type: 'button', textContent: s.name, onclick: () => show(k) })));
  host.append(el('div', { className: 'dv-xl' }, tabs, view)); await show(0);
}

/* ---------- OpenDocument (.odt / .ods / .odp) ---------- */
async function renderOdf(blob, host, urls) {
  const zip = await loadZip(blob), d = await zxml(zip, 'content.xml'); if (!d) throw new Error('Ce fichier n’est pas un document OpenDocument valide.');
  const bodyEl = kid(d.documentElement, 'body'), main = bodyEl && kidsOf(bodyEl)[0]; if (!main) throw new Error('Document vide.');
  const inl = (n, into) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) into.append(c.data); else if (c.nodeType === 1) {
        const l = c.localName; if (l === 's') into.append(' '.repeat(Math.min(+at(c, 'c') || 1, 50))); else if (l === 'tab') into.append('\t'); else if (l === 'line-break') into.append(el('br'));
        else if (l === 'a') { const h = httpUrl(at(c, 'href')), a = h ? el('a', { href: h, target: '_blank', rel: 'noopener noreferrer' }) : el('span'); inl(c, a); into.append(a); } else inl(c, into);
      }
    }
  };
  const para = (n, tag) => { const e = el(tag || 'p', { className: 'dv-p' }); inl(n, e); if (!e.textContent.trim()) e.append(el('br')); return e; };
  const table = n => {
    const t = el('table', { className: 'dv-tbl' }); let rows = 0;
    for (const r of desc(n, 'table-row')) {
      if (rows++ > 3000) break; const tr = el('tr'); let cc = 0;
      for (const c of kidsOf(r).filter(x => x.localName === 'table-cell' || x.localName === 'covered-table-cell')) {
        const rep = Math.min(+at(c, 'number-columns-repeated') || 1, 30), td = el('td'); const ps = kidsOf(c, 'p');
        ps.forEach((p, i) => { if (i) td.append(el('br')); inl(p, td); });
        for (let k = 0; k < rep && cc < 100; k++, cc++) tr.append(k ? td.cloneNode(true) : td);
      }
      if ([...tr.cells].some(c => c.textContent)) t.append(tr);
    }
    return t;
  };
  const walk = (n, into) => {
    for (const c of kidsOf(n)) {
      const l = c.localName;
      if (l === 'h') into.append(para(c, 'h' + Math.min(6, +at(c, 'outline-level') || 2))); else if (l === 'p') into.append(para(c));
      else if (l === 'list') { const ul = el('ul', { className: 'dv-ul' }); for (const li of kidsOf(c, 'list-item')) { const e = el('li'); walk(li, e); ul.append(e); } into.append(ul); }
      else if (l === 'table') into.append(table(c)); else if (l === 'section') walk(c, into);
    }
  };
  if (main.localName === 'text') { const page = el('div', { className: 'dv-paper' }); walk(main, page); host.append(page); }
  else if (main.localName === 'spreadsheet') { const wrap = el('div', { className: 'dv-xl' }); for (const t of kidsOf(main, 'table')) wrap.append(el('h4', { textContent: at(t, 'name') }), el('div', { className: 'dv-sheet' }, table(t))); host.append(wrap); }
  else if (main.localName === 'presentation') {
    const wrap = el('div', { className: 'dv-slides' }); let k = 0;
    for (const pg of kidsOf(main, 'page')) { const card = el('section', { className: 'dv-slide' }, el('small', { className: 'mut', textContent: 'Diapositive ' + (++k) })); const ps = desc(pg, 'p').filter(p => p.textContent.trim()); ps.forEach((p, i) => card.append(para(p, i ? 'p' : 'h3'))); wrap.append(card); }
    host.append(wrap);
  } else throw new Error('Type OpenDocument non pris en charge.');
}

/* ---------- Texte, CSV ---------- */
function csvRows(t, sep) {
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < t.length && rows.length < 5000; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === sep) { r.push(f); f = ''; } else if (c === '\n') { r.push(f.replace(/\r$/, '')); rows.push(r); r = []; f = ''; } else f += c;
  }
  if (f || r.length) { r.push(f); rows.push(r); } return rows;
}
function renderText(buf, name, host) {
  let t = decodeText(buf); const e = ext(name);
  if (e === 'csv' || e === 'tsv') {
    const rows = csvRows(t, e === 'tsv' ? '\t' : (t.split('\n', 1)[0].split(';').length > t.split('\n', 1)[0].split(',').length ? ';' : ','));
    if (rows.length) { const tb = el('table', { className: 'dv-grid' }); rows.forEach((r, i) => tb.append(el('tr', {}, ...r.slice(0, 100).map(c => el(i ? 'td' : 'th', { textContent: c }))))); host.append(el('div', { className: 'dv-sheet' }, tb)); return; }
  }
  if (e === 'json' && t.length < 2e6) { try { t = JSON.stringify(JSON.parse(t), null, 2); } catch { /* texte brut */ } }
  host.append(el('pre', { className: 'dv-text', textContent: t }));
}

/* ---------- PDF (PDF.js local) ---------- */
let PDFLIB = null;
async function pdfLib() {
  if (!PDFLIB) { PDFLIB = await import('./pdfjs.js'); PDFLIB.GlobalWorkerOptions.workerSrc = new URL('pdfjs-worker.js', document.baseURI).href; }
  return PDFLIB;
}
async function renderPdf(blob, host, ctl) {
  if (blob.size > 200e6) throw new Error('PDF trop volumineux (200 Mo maximum).');
  const lib = await pdfLib(), task = lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, enableXfa: false, useSystemFonts: true });
  task.onPassword = async (cb, reason) => { const r = await dialog('PDF protégé', [{ k: 'p', label: reason === 2 ? 'Mot de passe incorrect, réessayez' : 'Mot de passe du document', type: 'password', req: true, max: 200 }], 'Ouvrir'); r ? cb(r.p) : task.destroy(); };
  const pdf = await task.promise, n = pdf.numPages, wrap = el('div', { className: 'dv-pdf' }); let zoom = 1, base = 1, live = true; const jobs = new Set(), pages = [];
  const first = await pdf.getPage(1), v1 = first.getViewport({ scale: 1 });
  const fitW = () => Math.max(0.4, Math.min(3, (host.clientWidth - 40) / v1.width));
  const io = new IntersectionObserver(es => { for (const e of es) { const p = e.target._p; if (e.isIntersecting) draw(p); else drop(p); } }, { root: host, rootMargin: '700px 0px' });
  async function draw(p) {
    if (p.busy || p.done || !live) return; p.busy = true;
    try {
      const page = await pdf.getPage(p.n), vp = page.getViewport({ scale: base * zoom }), dpr = Math.min(window.devicePixelRatio || 1, 2), c = el('canvas');
      c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr); c.style.width = vp.width + 'px'; c.style.height = vp.height + 'px'; p.box.style.width = vp.width + 'px'; p.box.style.height = vp.height + 'px';
      const job = page.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }); jobs.add(job);
      await job.promise; jobs.delete(job); if (live && p.box.isConnected) { p.box.replaceChildren(c); p.done = true; }
    } catch (e) { if (!(e && e.name === 'RenderingCancelledException')) console.error(e); } finally { p.busy = false; }
  }
  function drop(p) { if (p.done) { p.box.replaceChildren(); p.done = false; } }
  const layout = () => {
    io.disconnect(); for (const j of jobs) j.cancel(); jobs.clear(); wrap.replaceChildren(); pages.length = 0;
    for (let k = 1; k <= n; k++) {
      const vp = { width: v1.width * base * zoom, height: v1.height * base * zoom };
      const box = el('div', { className: 'dv-pg', style: `width:${vp.width}px;height:${vp.height}px` }); const p = { n: k, box, done: false, busy: false }; box._p = p; pages.push(p); wrap.append(box); io.observe(box);
    }
  };
  base = fitW(); layout(); host.append(wrap);
  // la taille réelle des pages suivantes peut différer : chaque page est redimensionnée à son rendu
  ctl.zoom = f => { zoom = Math.min(4, Math.max(0.3, zoom * f)); layout(); ctl.label && (ctl.label.textContent = Math.round(base * zoom * 100) + ' %'); };
  ctl.fit = () => { zoom = 1; base = fitW(); layout(); ctl.label && (ctl.label.textContent = Math.round(base * 100) + ' %'); };
  ctl.pages = n; ctl.goto = k => { const p = pages[Math.min(n, Math.max(1, k)) - 1]; if (p) host.scrollTop = p.box.offsetTop - 8; };
  ctl.current = () => { const y = host.scrollTop + 60; let c = 1; for (const p of pages) if (p.box.offsetTop <= y) c = p.n; return c; };
  ctl.label && (ctl.label.textContent = Math.round(base * 100) + ' %');
  ctl.destroy = () => { live = false; io.disconnect(); for (const j of jobs) j.cancel(); try { pdf.destroy(); } catch { /* déjà détruit */ } };
}

/* ===================== Fenêtre : Lecteur de documents ===================== */
const DV = { w: null };
const DOC_KINDS = ['pdf', 'doc', 'text', 'legacy'];
function docWin(files, i = 0) {
  if (DV.w && DV.w.isConnected) { DV.w.hidden = false; DV.w.style.zIndex = ++Z; if (files) DV.set(files, i); return; }
  let q = [], idx = 0, tok = 0, ctl = {}, urls = [], blobNow = null;
  const view = el('div', { className: 'dv-view', style: '--dz:1' }), info = el('small', { className: 'mut grow' }), lbl = el('small', { className: 'mut', textContent: '' });
  const pg = el('input', { type: 'number', min: 1, value: 1, 'aria-label': 'Page', style: 'width:64px', hidden: true }), pgN = el('small', { className: 'mut', hidden: true });
  const editB = btn('Modifier', 'edit', () => { const t = q[idx]; if (t && blobNow) blobNow.arrayBuffer().then(b => editor(t.name, { text: decodeText(b) }, t.c ? { cid: t.c.id, path: t.path } : null)); }); editB.hidden = true;
  const cleanup = () => { if (ctl.destroy) ctl.destroy(); ctl = {}; for (const u of urls) URL.revokeObjectURL(u); urls = []; view.replaceChildren(); view.style.setProperty('--dz', 1); pg.hidden = pgN.hidden = true; editB.hidden = true; lbl.textContent = ''; };
  const note = (m, ...acts) => view.replaceChildren(el('div', { className: 'dv-note' }, el('p', { textContent: m }), ...acts));
  const showIdx = async n => {
    if (!q.length) return; idx = (n + q.length) % q.length; const t = q[idx], my = ++tok, k = kindOf(t.name); cleanup(); blobNow = null;
    info.textContent = t.name + (q.length > 1 ? ' · ' + (idx + 1) + ' / ' + q.length : ''); view.append(el('p', { className: 'mut', textContent: 'Chargement…' }));
    try {
      if (k === 'legacy') { const b0 = await getBlob(t); return note('Les anciens formats Office binaires (.doc, .xls, .ppt, .rtf) ne peuvent pas être lus ici. Enregistrez le document en .docx / .xlsx / .pptx / .pdf, ou téléchargez-le.', btn('Télécharger', 'download', () => download(b0, t.name))); }
      if (!DOC_KINDS.includes(k)) return note('Format non pris en charge par ce lecteur.');
      const prog = toast('Chargement de ' + t.name + '…', 0); let b; try { b = await getBlob(t, f => { if (f != null) prog.set('Chargement de ' + t.name + ' : ' + Math.round(f * 100) + ' %'); }); } finally { prog.close(); }
      if (my !== tok) return; blobNow = b; view.replaceChildren(); const e = ext(t.name);
      if (k === 'pdf') {
        ctl = { label: lbl };
        try { await renderPdf(b, view, ctl); } catch (er) {
          if (my !== tok) return; cleanup(); console.error(er);
          const u = URL.createObjectURL(new Blob([b], { type: 'application/pdf' })); urls.push(u);
          view.replaceChildren(el('div', { className: 'dv-note' }, el('p', { textContent: 'Le moteur PDF intégré n’a pas pu ouvrir ce fichier (' + (er.message || 'erreur') + '). Lecteur PDF du navigateur :' }), el('iframe', { src: u, title: t.name, className: 'dv-frame' }))); return;
        }
        if (my !== tok) { ctl.destroy && ctl.destroy(); return; }
        pg.hidden = pgN.hidden = false; pgN.textContent = '/ ' + ctl.pages; pg.max = ctl.pages; pg.value = 1;
      } else if (k === 'text') { if (b.size > 8e6) throw new Error('Fichier texte trop volumineux (8 Mo maximum).'); renderText(await b.arrayBuffer(), t.name, view); editB.hidden = !/^(txt|md|log|ini|yml|yaml|csv|tsv|json|xml|css|js)$/.test(e); }
      else if (e === 'docx') await renderDocx(b, view, urls);
      else if (e === 'xlsx') await renderXlsx(b, view);
      else if (e === 'pptx') await renderPptx(b, view, urls);
      else await renderOdf(b, view, urls);
      if (my !== tok) cleanup();
    } catch (er) { if (my === tok) { cleanup(); note(er.message || 'Lecture impossible.'); } }
  };
  const open = r => { if (r) { q = r.files; showIdx(r.i || 0); } };
  DV.set = (f, n) => open({ files: f, i: n });
  const zoom = f => { if (ctl.zoom) ctl.zoom(f); else { const z = Math.min(3, Math.max(0.5, (+view.style.getPropertyValue('--dz') || 1) * f)); view.style.setProperty('--dz', z); lbl.textContent = Math.round(z * 100) + ' %'; } };
  pg.onchange = () => ctl.goto && ctl.goto(+pg.value || 1);
  view.onscroll = () => { if (ctl.current && document.activeElement !== pg) pg.value = ctl.current(); };
  const bar = el('div', { className: 'row tight vwbar' }, btn('Depuis le cloud…', 'cloud', async () => open(await pickCloud(['pdf', 'doc', 'text', 'legacy'])), 'pri'), btn('Depuis cet appareil…', 'upload', () => chooseLocal('.pdf,.docx,.xlsx,.pptx,.odt,.ods,.odp,.txt,.md,.csv,.tsv,.json,.log,.xml,.doc,.xls,.ppt,.rtf,text/*', l => open({ files: l, i: 0 }))),
    btn('', 'prev', () => q.length > 1 && showIdx(idx - 1), '', 'Document précédent'), btn('', 'next', () => q.length > 1 && showIdx(idx + 1), '', 'Document suivant'),
    btn('', 'minus', () => zoom(0.85), '', 'Réduire'), lbl, btn('', 'plus', () => zoom(1.18), '', 'Agrandir'), btn('Ajuster', '', () => ctl.fit ? ctl.fit() : (view.style.setProperty('--dz', 1), lbl.textContent = '')), pg, pgN, editB,
    btn('', 'download', () => blobNow && q[idx] && download(blobNow, q[idx].name), '', 'Télécharger'), provBtn(() => (q[idx] || {}).c), info);
  view.ondragover = e => e.preventDefault();
  view.ondrop = e => { e.preventDefault(); const l = [...e.dataTransfer.files].map(f => ({ name: f.name, blob: f })); if (l.length) open({ files: l, i: 0 }); };
  DV.w = win('Lecteur de documents', 'file', [bar, view], { w: 880, h: 640, cls: 'vw', onclose: () => { tok++; cleanup(); } });
  if (files) open({ files, i }); else note('Ouvrez un document depuis votre stockage cloud ou cet appareil : PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), OpenDocument, texte, CSV. Vous pouvez aussi y glisser un fichier.');
}
