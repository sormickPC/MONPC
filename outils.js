/* ============================================================================
   outils.js — « Boîte à outils » : une suite d'outils pratiques qui fonctionnent tous hors ligne, dans le navigateur
   (rien n'est envoyé nulle part) : calculatrice, convertisseur d'unités, surfaces et volumes, travaux (peinture,
   carrelage), pourcentages et TVA, dates, mots de passe, IMC, minuteur, texte, couleurs, bases numériques,
   addition à partager, prêt, heure dans le monde, tirage au sort, carburant.
   ============================================================================ */
const TOOL_STATE = { tab: 'calc', hist: [], deg: true, ans: 0 };

const tNum = v => { const x = parseFloat(String(v == null ? '' : v).replace(/[\s ]/g, '').replace(',', '.')); return Number.isFinite(x) ? x : NaN; };
const tFmt = (n, d = 8) => {
  if (!Number.isFinite(n)) return '—';
  if (n !== 0 && (Math.abs(n) >= 1e15 || Math.abs(n) < 1e-9)) return n.toExponential(8).replace(/\.?0+e/, 'e');
  return new Intl.NumberFormat(typeof uiLang === 'function' ? uiLang() : 'fr', { maximumFractionDigits: d }).format(+n.toPrecision(12));
};
const tMoney = n => Number.isFinite(n) ? new Intl.NumberFormat(typeof uiLang === 'function' ? uiLang() : 'fr', { style: 'currency', currency: 'EUR' }).format(n) : '—';
const tIn = (label, o = {}) => {
  const i = el(o.tag || 'input', { type: o.type || 'text', placeholder: o.ph || '', value: o.value == null ? '' : String(o.value), maxLength: o.max || 40, inputMode: o.type ? undefined : 'decimal', 'aria-label': label, ...(o.attrs || {}) });
  if (o.on) i.addEventListener('input', o.on);
  return { box: el('label', { className: 'fld tl-f' }, el('span', { textContent: label }), i), i };
};
const tSel = (label, items, value, on) => { const s = el('select', { 'aria-label': label }); opts(s, items); if (value != null) s.value = String(value); if (on) s.onchange = on; return { box: el('label', { className: 'fld tl-f' }, el('span', { textContent: label }), s), s }; };
const tRes = () => el('div', { className: 'tl-res', 'aria-live': 'polite' });
const tShow = (box, pairs, main) => box.replaceChildren(...pairs.map(([k, v], i) => el('div', { className: 'tl-kv' + (main && i === 0 ? ' big' : '') }, el('span', { className: 'mut', textContent: k }), el('b', { textContent: v }))));
const tRand = n => { const a = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n; do crypto.getRandomValues(a); while (a[0] >= lim); return a[0] % n; };   // tirage sans biais

/* ---------- calculatrice (analyseur maison : aucun eval) ---------- */
function calcEval(src, deg, ans) {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/,/g, '.').replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/\s+/g, '').toLowerCase();
  let i = 0; const bad = () => { throw new Error('Expression incorrecte'); };
  const FN = {
    sin: x => Math.sin(deg ? x * Math.PI / 180 : x), cos: x => Math.cos(deg ? x * Math.PI / 180 : x), tan: x => Math.tan(deg ? x * Math.PI / 180 : x),
    asin: x => Math.asin(x) * (deg ? 180 / Math.PI : 1), acos: x => Math.acos(x) * (deg ? 180 / Math.PI : 1), atan: x => Math.atan(x) * (deg ? 180 / Math.PI : 1),
    ln: Math.log, log: Math.log10, log2: Math.log2, sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp, round: Math.round, floor: Math.floor, ceil: Math.ceil
  };
  const fact = n => { if (n < 0 || n !== Math.floor(n) || n > 170) bad(); let r = 1; for (let k = 2; k <= n; k++) r *= k; return r; };
  const expr = () => { let v = term(); while (s[i] === '+' || s[i] === '-') { const o = s[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; };
  const term = () => { let v = unary(); while (s[i] === '*' || s[i] === '/') { const o = s[i++]; const r = unary(); v = o === '*' ? v * r : v / r; } return v; };
  const unary = () => { if (s[i] === '-') { i++; return -unary(); } if (s[i] === '+') { i++; return unary(); } return power(); };
  const power = () => { const b = post(); if (s[i] === '^') { i++; return Math.pow(b, unary()); } return b; };
  const post = () => { let v = prim(); for (;;) { if (s[i] === '!') { i++; v = fact(v); } else if (s[i] === '%') { i++; v = v / 100; } else break; } return v; };
  const prim = () => {
    if (s[i] === '(') { i++; const v = expr(); if (s[i++] !== ')') bad(); return v; }
    let m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i)); if (m) { i += m[0].length; return parseFloat(m[0]); }
    m = /^[a-z][a-z0-9]*/.exec(s.slice(i)); if (!m) bad(); i += m[0].length;
    if (m[0] === 'pi') return Math.PI; if (m[0] === 'e') return Math.E; if (m[0] === 'ans') return ans;
    const f = FN[m[0]]; if (!f || s[i++] !== '(') bad(); const v = expr(); if (s[i++] !== ')') bad(); return f(v);
  };
  if (!s) return NaN;
  const v = expr(); if (i < s.length) bad(); return v;
}
function toolCalc() {
  const disp = el('input', { type: 'text', className: 'tl-disp', placeholder: '0', maxLength: 200, 'aria-label': 'Calcul', autocomplete: 'off', spellcheck: false });
  const out = el('div', { className: 'tl-out', 'aria-live': 'polite' }), histBox = el('div', { className: 'tl-hist' });
  const degB = btn('', '', () => { TOOL_STATE.deg = !TOOL_STATE.deg; paintDeg(); live(); }, 'tl-k tl-mode');
  const paintDeg = () => { degB.replaceChildren(el('span', { textContent: TOOL_STATE.deg ? 'Deg' : 'Rad' })); degB.title = degB.ariaLabel = TOOL_STATE.deg ? 'Angles en degrés (cliquer pour passer en radians)' : 'Angles en radians (cliquer pour passer en degrés)'; };
  const run = () => { try { return calcEval(disp.value, TOOL_STATE.deg, TOOL_STATE.ans); } catch { return NaN; } };
  const live = () => { const v = run(); out.textContent = disp.value.trim() && Number.isFinite(v) ? '= ' + tFmt(v, 10) : ''; };
  const drawHist = () => histBox.replaceChildren(...(TOOL_STATE.hist.length ? TOOL_STATE.hist.map(h => el('button', { type: 'button', className: 'tl-h', title: 'Reprendre ce calcul', onclick: () => { disp.value = h.e; live(); disp.focus(); } }, el('span', { className: 'mut', textContent: h.e }), el('b', { textContent: '= ' + h.r }))) : [el('small', { className: 'mut', textContent: 'L’historique de vos calculs apparaît ici.' })]));
  const equals = () => {
    if (!disp.value.trim()) return; const v = run();
    if (!Number.isFinite(v)) { out.textContent = 'Calcul impossible'; return; }
    TOOL_STATE.hist.unshift({ e: disp.value, r: tFmt(v, 10) }); TOOL_STATE.hist.length = Math.min(TOOL_STATE.hist.length, 30); TOOL_STATE.ans = v; disp.value = String(+v.toPrecision(14)).replace('.', ','); out.textContent = ''; drawHist();
  };
  const put = t => { const a = disp.selectionStart ?? disp.value.length, b = disp.selectionEnd ?? a; disp.setRangeText(t, a, b, 'end'); live(); disp.focus(); };
  const keys = [['C', 'C'], ['⌫', 'B'], ['(', '('], [')', ')'], ['÷', '÷'], ['DEG', 'D'],
    ['7', '7'], ['8', '8'], ['9', '9'], ['×', '×'], ['sin', 'sin('], ['ln', 'ln('], ['4', '4'], ['5', '5'], ['6', '6'], ['−', '−'], ['cos', 'cos('], ['log', 'log('],
    ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+'], ['tan', 'tan('], ['√', '√('], ['0', '0'], [',', ','], ['%', '%'], ['^', '^'], ['π', 'π'], ['e', 'e'], ['!', '!'], ['Ans', 'ans'], ['=', '=']];
  const pad = el('div', { className: 'tl-pad' }, ...keys.map(([l, v]) => v === 'D' ? degB : el('button', { type: 'button', className: 'tl-k' + (v === '=' ? ' eq' : /[0-9,]/.test(v) ? ' num' : ''), 'aria-label': l === '⌫' ? 'Effacer le dernier caractère' : l, onclick: () => { if (v === 'C') { disp.value = ''; out.textContent = ''; disp.focus(); } else if (v === 'B') { disp.value = disp.value.slice(0, -1); live(); disp.focus(); } else if (v === '=') equals(); else put(v); } }, l)));
  disp.addEventListener('input', live); disp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); equals(); } });
  paintDeg(); drawHist();
  return el('div', { className: 'tl-calc' }, el('div', { className: 'tl-lcd' }, disp, out), pad, el('div', { className: 'tl-histw' }, el('div', { className: 'row tight' }, el('b', { textContent: 'Historique' }), el('span', { className: 'grow' }), btn('Effacer', 'trash', () => { TOOL_STATE.hist = []; drawHist(); }, '', 'Effacer l’historique')), histBox));
}

/* ---------- convertisseur d'unités ---------- */
const UNIT_SETS = {
  'Longueur': { b: 'm', u: [['millimètre (mm)', .001], ['centimètre (cm)', .01], ['mètre (m)', 1], ['kilomètre (km)', 1000], ['pouce (in)', .0254], ['pied (ft)', .3048], ['yard (yd)', .9144], ['mile (mi)', 1609.344], ['mille marin', 1852]] },
  'Poids / masse': { b: 'kg', u: [['milligramme (mg)', 1e-6], ['gramme (g)', .001], ['kilogramme (kg)', 1], ['tonne (t)', 1000], ['once (oz)', .028349523125], ['livre (lb)', .45359237], ['stone (st)', 6.35029318], ['quintal (q)', 100]] },
  'Volume / liquides': { b: 'L', u: [['millilitre (mL)', .001], ['centilitre (cL)', .01], ['décilitre (dL)', .1], ['litre (L)', 1], ['mètre cube (m³)', 1000], ['cuillère à café', .005], ['cuillère à soupe', .015], ['tasse (250 mL)', .25], ['pinte US', .473176473], ['gallon US', 3.785411784], ['gallon UK', 4.54609]] },
  'Surface': { b: 'm²', u: [['cm²', 1e-4], ['m²', 1], ['are (a)', 100], ['hectare (ha)', 1e4], ['km²', 1e6], ['pouce² (in²)', 6.4516e-4], ['pied² (ft²)', .09290304], ['yard² (yd²)', .83612736], ['acre', 4046.8564224]] },
  'Température': { special: true, u: [['Celsius (°C)'], ['Fahrenheit (°F)'], ['Kelvin (K)']] },
  'Vitesse': { b: 'm/s', u: [['mètre/seconde (m/s)', 1], ['kilomètre/heure (km/h)', 1 / 3.6], ['mile/heure (mph)', .44704], ['nœud (kn)', 1852 / 3600], ['Mach (≈)', 340.29]] },
  'Temps': { b: 's', u: [['milliseconde (ms)', .001], ['seconde (s)', 1], ['minute (min)', 60], ['heure (h)', 3600], ['jour', 86400], ['semaine', 604800], ['mois (30,44 j)', 2629800], ['année (365,25 j)', 31557600]] },
  'Énergie': { b: 'J', u: [['joule (J)', 1], ['kilojoule (kJ)', 1000], ['calorie (cal)', 4.184], ['kilocalorie (kcal)', 4184], ['wattheure (Wh)', 3600], ['kilowattheure (kWh)', 3.6e6]] },
  'Puissance': { b: 'W', u: [['watt (W)', 1], ['kilowatt (kW)', 1000], ['cheval-vapeur (ch)', 735.49875], ['horsepower (hp)', 745.699872]] },
  'Pression': { b: 'Pa', u: [['pascal (Pa)', 1], ['hectopascal (hPa)', 100], ['kilopascal (kPa)', 1000], ['bar', 1e5], ['atmosphère (atm)', 101325], ['psi', 6894.757293168], ['mmHg', 133.322387415]] },
  'Données numériques': { b: 'o', u: [['bit', .125], ['octet (o)', 1], ['kilo-octet (Ko)', 1e3], ['méga-octet (Mo)', 1e6], ['giga-octet (Go)', 1e9], ['téra-octet (To)', 1e12], ['kibi-octet (Kio)', 1024], ['mébi-octet (Mio)', 1048576], ['gibi-octet (Gio)', 1073741824]] },
  'Angle': { b: '°', u: [['degré (°)', 1], ['radian (rad)', 180 / Math.PI], ['grade (gon)', .9], ['tour', 360]] }
};
const toTemp = (v, from) => from === 0 ? v : from === 1 ? (v - 32) * 5 / 9 : v - 273.15;
const fromTemp = (c, to) => to === 0 ? c : to === 1 ? c * 9 / 5 + 32 : c + 273.15;
function toolUnits() {
  const cat = tSel('Grandeur', Object.keys(UNIT_SETS).map(k => [k, k]), TOOL_STATE.ucat || 'Longueur', () => { TOOL_STATE.ucat = cat.s.value; fillU(); calc(); });
  const val = tIn('Valeur', { value: '1', on: () => calc() }), from = tSel('De', []), to = tSel('Vers', []), res = tRes(), tbl = el('div', { className: 'tl-tbl' });
  const swap = btn('', 'move', () => { const a = from.s.value; from.s.value = to.s.value; to.s.value = a; calc(); }, '', 'Inverser les deux unités');
  const fillU = () => { const set = UNIT_SETS[cat.s.value]; opts(from.s, set.u.map((u, i) => [String(i), u[0]])); opts(to.s, set.u.map((u, i) => [String(i), u[0]])); from.s.value = '0'; to.s.value = String(Math.min(2, set.u.length - 1)); };
  const conv = (set, v, a, b) => set.special ? fromTemp(toTemp(v, a), b) : v * set.u[a][1] / set.u[b][1];
  const calc = () => {
    const set = UNIT_SETS[cat.s.value], v = tNum(val.i.value), a = +from.s.value, b = +to.s.value;
    if (!Number.isFinite(v)) { res.textContent = 'Saisissez un nombre.'; tbl.replaceChildren(); return; }
    tShow(res, [[tFmt(v) + ' ' + set.u[a][0], tFmt(conv(set, v, a, b), 10) + ' ' + set.u[b][0]]], true);
    tbl.replaceChildren(...set.u.map((u, k) => el('div', { className: 'tl-kv' }, el('span', { className: 'mut', textContent: u[0] }), el('b', { textContent: tFmt(conv(set, v, a, k), 10) }))));
  };
  from.s.onchange = to.s.onchange = calc; fillU(); calc();
  return el('div', { className: 'tl-pane-in' }, el('div', { className: 'tl-grid' }, cat.box, val.box), el('div', { className: 'tl-grid tl-swap' }, from.box, swap, to.box), res, el('h4', { textContent: 'Toutes les unités' }), tbl);
}

/* ---------- surfaces et volumes ---------- */
const SHAPES = {
  'Rectangle': { f: ['Longueur', 'Largeur'], area: (a, b) => a * b, per: (a, b) => 2 * (a + b) },
  'Carré': { f: ['Côté'], area: a => a * a, per: a => 4 * a },
  'Cercle (rayon)': { f: ['Rayon'], area: a => Math.PI * a * a, per: a => 2 * Math.PI * a },
  'Triangle (base × hauteur)': { f: ['Base', 'Hauteur'], area: (a, b) => a * b / 2 },
  'Trapèze': { f: ['Grande base', 'Petite base', 'Hauteur'], area: (a, b, h) => (a + b) / 2 * h },
  'Ellipse': { f: ['Demi-grand axe', 'Demi-petit axe'], area: (a, b) => Math.PI * a * b },
  'Parallélogramme': { f: ['Base', 'Hauteur'], area: (a, b) => a * b },
  'Losange (2 diagonales)': { f: ['Grande diagonale', 'Petite diagonale'], area: (a, b) => a * b / 2 },
  'Cube': { f: ['Côté'], vol: a => a ** 3, area: a => 6 * a * a, lab: 'Surface totale' },
  'Pavé droit': { f: ['Longueur', 'Largeur', 'Hauteur'], vol: (a, b, c) => a * b * c, area: (a, b, c) => 2 * (a * b + a * c + b * c), lab: 'Surface totale' },
  'Cylindre': { f: ['Rayon', 'Hauteur'], vol: (r, h) => Math.PI * r * r * h, area: (r, h) => 2 * Math.PI * r * (r + h), lab: 'Surface totale' },
  'Sphère': { f: ['Rayon'], vol: r => 4 / 3 * Math.PI * r ** 3, area: r => 4 * Math.PI * r * r, lab: 'Surface totale' },
  'Cône': { f: ['Rayon', 'Hauteur'], vol: (r, h) => Math.PI * r * r * h / 3, area: (r, h) => Math.PI * r * (r + Math.hypot(r, h)), lab: 'Surface totale' }
};
const LEN_M = { 'mm': .001, 'cm': .01, 'm': 1, 'km': 1000, 'pouce': .0254, 'pied': .3048 };
function toolArea() {
  const shape = tSel('Forme', Object.keys(SHAPES).map(k => [k, k]), 'Rectangle', () => { drawF(); calc(); }), unit = tSel('Unité des mesures', Object.keys(LEN_M).map(k => [k, k]), 'm', () => calc());
  const fbox = el('div', { className: 'tl-grid' }), res = tRes(); let fields = [];
  const drawF = () => { fields = SHAPES[shape.s.value].f.map(l => tIn(l, { on: () => calc() })); fbox.replaceChildren(...fields.map(f => f.box)); };
  const calc = () => {
    const sh = SHAPES[shape.s.value], k = LEN_M[unit.s.value], v = fields.map(f => tNum(f.i.value));
    if (v.some(x => !Number.isFinite(x) || x < 0)) { res.textContent = 'Saisissez toutes les mesures (nombres positifs).'; return; }
    const m = v.map(x => x * k), rows = [];
    if (sh.vol) { const V = sh.vol(...m); rows.push(['Volume', tFmt(V, 6) + ' m³'], ['Volume en litres', tFmt(V * 1000, 4) + ' L'], [sh.lab, tFmt(sh.area(...m), 6) + ' m²']); }
    else { const A = sh.area(...m); rows.push(['Surface', tFmt(A, 6) + ' m²'], ['En cm²', tFmt(A * 1e4, 4) + ' cm²'], ['En hectares', tFmt(A / 1e4, 8) + ' ha']); if (sh.per) rows.push(['Périmètre', tFmt(sh.per(...m) / k, 6) + ' ' + unit.s.value]); }
    tShow(res, rows, true);
  };
  drawF(); calc();
  return el('div', { className: 'tl-pane-in' }, el('div', { className: 'tl-grid' }, shape.box, unit.box), fbox, res, el('small', { className: 'mut', textContent: 'Astuce : pour une pièce ou un terrain, utilisez « Travaux » (murs, peinture, carrelage).' }));
}

/* ---------- travaux : murs, peinture, carrelage ---------- */
function toolWork() {
  const L = tIn('Longueur de la pièce (m)', { value: '4', on: () => calc() }), W = tIn('Largeur (m)', { value: '3', on: () => calc() }), H = tIn('Hauteur sous plafond (m)', { value: '2,5', on: () => calc() });
  const O = tIn('Portes et fenêtres (m² à retirer)', { value: '3', on: () => calc() }), Y = tIn('Rendement peinture (m² par litre)', { value: '10', on: () => calc() }), C = tIn('Nombre de couches', { value: '2', on: () => calc() });
  const TL_ = tIn('Carreau : longueur (cm)', { value: '60', on: () => calc() }), TW = tIn('Carreau : largeur (cm)', { value: '60', on: () => calc() }), P = tIn('Marge de chutes (%)', { value: '10', on: () => calc() }), PB = tIn('Carreaux par boîte (facultatif)', { value: '', on: () => calc() });
  const res = tRes();
  const calc = () => {
    const l = tNum(L.i.value), w = tNum(W.i.value), h = tNum(H.i.value), o = tNum(O.i.value) || 0, y = tNum(Y.i.value), c = tNum(C.i.value), tl = tNum(TL_.i.value), tw = tNum(TW.i.value), p = tNum(P.i.value) || 0, pb = tNum(PB.i.value);
    if (![l, w, h].every(x => Number.isFinite(x) && x > 0)) { res.textContent = 'Saisissez longueur, largeur et hauteur.'; return; }
    const sol = l * w, murs = Math.max(0, 2 * (l + w) * h - o), rows = [['Surface du sol (et du plafond)', tFmt(sol, 3) + ' m²'], ['Surface des murs (ouvertures retirées)', tFmt(murs, 3) + ' m²'], ['Murs + plafond', tFmt(murs + sol, 3) + ' m²'], ['Volume de la pièce', tFmt(sol * h, 3) + ' m³']];
    if (y > 0 && c > 0) rows.push(['Peinture pour les murs', tFmt(murs * c / y, 2) + ' L'], ['Peinture pour murs + plafond', tFmt((murs + sol) * c / y, 2) + ' L']);
    if (tl > 0 && tw > 0) { const n = Math.ceil(sol * 1e4 / (tl * tw) * (1 + p / 100)); rows.push(['Carreaux pour le sol (chutes comprises)', String(n)]); if (pb > 0) rows.push(['Boîtes à acheter', String(Math.ceil(n / pb))]); }
    tShow(res, rows, true);
  };
  calc();
  return el('div', { className: 'tl-pane-in' }, el('h4', { textContent: 'La pièce' }), el('div', { className: 'tl-grid' }, L.box, W.box, H.box, O.box), el('h4', { textContent: 'Peinture' }), el('div', { className: 'tl-grid' }, Y.box, C.box), el('h4', { textContent: 'Carrelage au sol' }), el('div', { className: 'tl-grid' }, TL_.box, TW.box, P.box, PB.box), res);
}

/* ---------- pourcentages, TVA, remises ---------- */
function toolPercent() {
  const a1 = tIn('Pourcentage (%)', { value: '15', on: () => c1() }), b1 = tIn('de', { value: '200', on: () => c1() }), r1 = tRes();
  const c1 = () => { const p = tNum(a1.i.value), v = tNum(b1.i.value); tShow(r1, Number.isFinite(p + v) ? [[tFmt(p) + ' % de ' + tFmt(v), tFmt(v * p / 100, 6)], ['Valeur + ' + tFmt(p) + ' %', tFmt(v * (1 + p / 100), 6)], ['Valeur − ' + tFmt(p) + ' %', tFmt(v * (1 - p / 100), 6)]] : [['Résultat', '—']], true); };
  const a2 = tIn('Valeur', { value: '30', on: () => c2() }), b2 = tIn('Total', { value: '120', on: () => c2() }), r2 = tRes();
  const c2 = () => { const a = tNum(a2.i.value), b = tNum(b2.i.value); tShow(r2, [[tFmt(a) + ' est quel % de ' + tFmt(b) + ' ?', Number.isFinite(a / b) ? tFmt(a / b * 100, 4) + ' %' : '—']], true); };
  const a3 = tIn('Valeur de départ', { value: '80', on: () => c3() }), b3 = tIn('Valeur d’arrivée', { value: '100', on: () => c3() }), r3 = tRes();
  const c3 = () => { const a = tNum(a3.i.value), b = tNum(b3.i.value); tShow(r3, [['Variation', Number.isFinite((b - a) / a) ? (b >= a ? '+' : '') + tFmt((b - a) / a * 100, 4) + ' %' : '—'], ['Écart', tFmt(b - a, 6)]], true); };
  const m4 = tIn('Montant', { value: '100', on: () => c4() }), t4 = tIn('Taux de TVA (%)', { value: '20', on: () => c4() }), r4 = tRes();
  const chips = [20, 10, 5.5, 2.1].map(t => btn(String(t).replace('.', ',') + ' %', '', () => { t4.i.value = String(t).replace('.', ','); c4(); }, 'tl-chip'));
  const c4 = () => { const m = tNum(m4.i.value), t = tNum(t4.i.value); tShow(r4, Number.isFinite(m + t) ? [['Si c’est un montant HT : TTC', tMoney(m * (1 + t / 100))], ['… dont TVA', tMoney(m * t / 100)], ['Si c’est un montant TTC : HT', tMoney(m / (1 + t / 100))], ['… dont TVA', tMoney(m - m / (1 + t / 100))]] : [['Résultat', '—']], true); };
  const p5 = tIn('Prix initial', { value: '59,90', on: () => c5() }), d5 = tIn('Remise (%)', { value: '30', on: () => c5() }), d6 = tIn('2e remise (%) – facultatif', { value: '', on: () => c5() }), r5 = tRes();
  const c5 = () => { const p = tNum(p5.i.value), d = tNum(d5.i.value) || 0, e = tNum(d6.i.value) || 0, f = p * (1 - d / 100) * (1 - e / 100); tShow(r5, Number.isFinite(f) ? [['Prix final', tMoney(f)], ['Vous économisez', tMoney(p - f) + ' (' + tFmt((1 - f / p) * 100, 2) + ' %)']] : [['Résultat', '—']], true); };
  c1(); c2(); c3(); c4(); c5();
  const sec = (t, ...c) => el('section', { className: 'tl-sec' }, el('h4', { textContent: t }), ...c);
  return el('div', { className: 'tl-pane-in' }, sec('Pourcentage d’une valeur', el('div', { className: 'tl-grid' }, a1.box, b1.box), r1), sec('Quel pourcentage ?', el('div', { className: 'tl-grid' }, a2.box, b2.box), r2), sec('Évolution entre deux valeurs', el('div', { className: 'tl-grid' }, a3.box, b3.box), r3),
    sec('TVA (HT ↔ TTC)', el('div', { className: 'tl-grid' }, m4.box, t4.box), el('div', { className: 'row tight' }, ...chips), r4), sec('Soldes et remises', el('div', { className: 'tl-grid' }, p5.box, d5.box, d6.box), r5));
}

/* ---------- dates ---------- */
function toolDates() {
  const today = new Date().toISOString().slice(0, 10), mk = (l, v, on) => tIn(l, { type: 'date', value: v, on, max: 12 });
  const d1 = mk('Du', today, () => c1()), d2 = mk('Au', today, () => c1()), r1 = tRes();
  const dayMs = 86400000, P = s => { const [y, m, d] = String(s).split('-').map(Number); return y ? new Date(Date.UTC(y, m - 1, d)) : null; };
  const c1 = () => {
    let a = P(d1.i.value), b = P(d2.i.value); if (!a || !b) return tShow(r1, [['Résultat', '—']]); let sign = '';
    if (b < a) { [a, b] = [b, a]; sign = '(dates inversées) '; }
    const days = Math.round((b - a) / dayMs); let y = b.getUTCFullYear() - a.getUTCFullYear(), m = b.getUTCMonth() - a.getUTCMonth(), d = b.getUTCDate() - a.getUTCDate();
    if (d < 0) { m--; d += new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate(); } if (m < 0) { y--; m += 12; }
    let ow = 0; for (let t = a.getTime(); t < b.getTime(); t += dayMs) { const w = new Date(t).getUTCDay(); if (w && w < 6) ow++; }
    tShow(r1, [[sign + 'Écart', tFmt(days, 0) + ' jour' + (days > 1 ? 's' : '')], ['En clair', y + ' an(s), ' + m + ' mois, ' + d + ' jour(s)'], ['En semaines', tFmt(days / 7, 2)], ['Jours ouvrés (lun–ven, sans jours fériés)', tFmt(ow, 0)]], true);
  };
  const d3 = mk('Date de départ', today, () => c2()), n3 = tIn('Nombre', { value: '30', on: () => c2() }), u3 = tSel('Unité', [['d', 'jours'], ['w', 'semaines'], ['m', 'mois'], ['y', 'années']], 'd', () => c2()), r2 = tRes();
  const c2 = () => {
    const a = P(d3.i.value), n = tNum(n3.i.value); if (!a || !Number.isFinite(n)) return tShow(r2, [['Résultat', '—']]);
    const f = (sg) => { const x = new Date(a); const k = Math.trunc(n) * sg; if (u3.s.value === 'd') x.setUTCDate(x.getUTCDate() + k); else if (u3.s.value === 'w') x.setUTCDate(x.getUTCDate() + 7 * k); else if (u3.s.value === 'm') x.setUTCMonth(x.getUTCMonth() + k); else x.setUTCFullYear(x.getUTCFullYear() + k); return x.toLocaleDateString(typeof uiLang === 'function' ? uiLang() : 'fr', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); };
    tShow(r2, [['Plus', f(1)], ['Moins', f(-1)]], true);
  };
  const d4 = mk('Date de naissance', '', () => c3()), r3 = tRes();
  const c3 = () => {
    const a = P(d4.i.value), t = P(today); if (!a) return tShow(r3, [['Âge', 'Choisissez une date']]); if (a > t) return tShow(r3, [['Âge', 'Date dans le futur']]);
    let y = t.getUTCFullYear() - a.getUTCFullYear(), m = t.getUTCMonth() - a.getUTCMonth(), d = t.getUTCDate() - a.getUTCDate();
    if (d < 0) { m--; d += new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0)).getUTCDate(); } if (m < 0) { y--; m += 12; }
    const next = new Date(Date.UTC(t.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())); if (next < t) next.setUTCFullYear(next.getUTCFullYear() + 1);
    tShow(r3, [['Âge', y + ' an(s), ' + m + ' mois, ' + d + ' jour(s)'], ['Jours vécus', tFmt(Math.round((t - a) / dayMs), 0)], ['Prochain anniversaire', 'dans ' + Math.round((next - t) / dayMs) + ' jour(s)']], true);
  };
  c1(); c2(); c3();
  const sec = (t, ...c) => el('section', { className: 'tl-sec' }, el('h4', { textContent: t }), ...c);
  return el('div', { className: 'tl-pane-in' }, sec('Écart entre deux dates', el('div', { className: 'tl-grid' }, d1.box, d2.box), r1), sec('Ajouter ou retirer une durée', el('div', { className: 'tl-grid' }, d3.box, n3.box, u3.box), r2), sec('Âge', el('div', { className: 'tl-grid' }, d4.box), r3));
}

/* ---------- mot de passe ---------- */
function toolPassword() {
  const len = tIn('Longueur', { type: 'range', value: '16', attrs: { min: '6', max: '64' } }), lenV = el('b', { textContent: '16' });
  const mk = (l, on) => { const c = el('input', { type: 'checkbox', checked: on, 'aria-label': l, onchange: () => gen() }); return { c, box: el('label', { className: 'row tight tl-chk' }, c, el('span', { textContent: l })) }; };
  const lo = mk('Minuscules (a–z)', true), up = mk('Majuscules (A–Z)', true), di = mk('Chiffres (0–9)', true), sy = mk('Symboles (!?#…)', true), am = mk('Éviter les caractères ambigus (O/0, l/1/I)', true);
  const out = el('input', { type: 'text', readOnly: true, className: 'tl-pw', 'aria-label': 'Mot de passe généré' }), str = el('div', { className: 'tl-str' }), info = el('small', { className: 'mut' });
  const gen = () => {
    lenV.textContent = len.i.value; let pools = [];
    const cut = s => am.c.checked ? s.replace(/[O0lI1|]/g, '') : s;
    if (lo.c.checked) pools.push(cut('abcdefghijklmnopqrstuvwxyz')); if (up.c.checked) pools.push(cut('ABCDEFGHIJKLMNOPQRSTUVWXYZ')); if (di.c.checked) pools.push(cut('0123456789')); if (sy.c.checked) pools.push('!@#$%&*?+-=_.:;()[]{}');
    if (!pools.length) { out.value = ''; info.textContent = 'Cochez au moins un type de caractères.'; str.style.width = '0'; return; }
    const n = +len.i.value, all = pools.join(''), chars = pools.map(p => p[tRand(p.length)]);
    while (chars.length < n) chars.push(all[tRand(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) { const j = tRand(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    out.value = chars.join('');
    const bits = Math.round(n * Math.log2(all.length)); const q = bits < 50 ? ['faible', '#e5484d'] : bits < 75 ? ['moyen', '#f5a623'] : bits < 100 ? ['bon', '#7bc043'] : ['excellent', '#22c55e'];
    str.style.width = Math.min(100, bits) + '%'; str.style.background = q[1]; info.textContent = 'Solidité : ' + q[0] + ' (≈ ' + bits + ' bits). Généré ici, jamais envoyé ni enregistré.';
  };
  len.i.addEventListener('input', gen); gen();
  return el('div', { className: 'tl-pane-in' }, el('div', { className: 'row' }, out, btn('Copier', 'copy', () => out.value && copyText(out.value).then(() => toast('Mot de passe copié.')), '', 'Copier le mot de passe'), btn('Nouveau', 'refresh', gen, 'pri', 'Générer un autre mot de passe')),
    el('div', { className: 'tl-bar' }, str), info, el('div', { className: 'row tight' }, len.box, lenV), el('div', { className: 'tl-checks' }, lo.box, up.box, di.box, sy.box, am.box));
}

/* ---------- IMC ---------- */
function toolBmi() {
  const h = tIn('Taille (cm)', { value: '170', on: () => calc() }), w = tIn('Poids (kg)', { value: '65', on: () => calc() }), res = tRes();
  const calc = () => {
    const H = tNum(h.i.value) / 100, W = tNum(w.i.value); if (!(H > .5 && H < 2.6 && W > 10 && W < 400)) return tShow(res, [['IMC', 'Saisissez une taille et un poids réalistes']]);
    const b = W / (H * H), c = b < 16.5 ? 'dénutrition' : b < 18.5 ? 'maigreur' : b < 25 ? 'corpulence normale' : b < 30 ? 'surpoids' : b < 35 ? 'obésité modérée' : b < 40 ? 'obésité sévère' : 'obésité massive';
    tShow(res, [['IMC', tFmt(b, 1)], ['Catégorie (OMS)', c], ['Poids « normal » pour cette taille', tFmt(18.5 * H * H, 1) + ' à ' + tFmt(24.9 * H * H, 1) + ' kg']], true);
  };
  calc();
  return el('div', { className: 'tl-pane-in' }, el('div', { className: 'tl-grid' }, h.box, w.box), res, el('small', { className: 'mut', textContent: 'Indicateur général pour adultes : il ne remplace pas l’avis d’un professionnel de santé.' }));
}

/* ---------- minuteur et chronomètre ---------- */
function toolTimer(ctxClean) {
  const hh = tIn('Heures', { value: '0', on: () => {} }), mm = tIn('Minutes', { value: '5', on: () => {} }), ss = tIn('Secondes', { value: '0', on: () => {} });
  const disp = el('div', { className: 'tl-clock', textContent: '00:00:00', 'aria-live': 'off' }); let end = 0, left = 0, tm = 0, running = false;
  const f = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(x => String(x).padStart(2, '0')).join(':'); };
  const beep = () => { try { const ac = new (window.AudioContext || window.webkitAudioContext)(); for (let k = 0; k < 4; k++) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; g.gain.value = .2; o.connect(g); g.connect(ac.destination); o.start(ac.currentTime + k * .35); o.stop(ac.currentTime + k * .35 + .2); } setTimeout(() => ac.close(), 2000); } catch { /* pas de son */ } };
  const tick = () => { left = end - Date.now(); disp.textContent = f(left); if (left <= 0) { clearInterval(tm); running = false; startB.firstChild && paint(); toast('⏰ Minuteur terminé !', 8000); beep(); } };
  const startB = btn('Démarrer', 'play', () => {
    if (running) { clearInterval(tm); running = false; left = end - Date.now(); paint(); return; }
    if (!left) left = ((tNum(hh.i.value) || 0) * 3600 + (tNum(mm.i.value) || 0) * 60 + (tNum(ss.i.value) || 0)) * 1000; if (left <= 0) return toast('Réglez une durée.');
    end = Date.now() + left; running = true; clearInterval(tm); tm = setInterval(tick, 200); tick(); paint();
  }, 'pri'), resetB = btn('Remise à zéro', 'refresh', () => { clearInterval(tm); running = false; left = 0; disp.textContent = '00:00:00'; paint(); });
  const paint = () => { startB.lastChild.textContent = running ? 'Pause' : left > 0 ? 'Reprendre' : 'Démarrer'; };
  // chronomètre
  const cdisp = el('div', { className: 'tl-clock', textContent: '00:00:00,0' }), laps = el('ol', { className: 'tl-laps' }); let c0 = 0, cacc = 0, ct = 0, crun = false;
  const cf = ms => { const t = Math.floor(ms / 100), d = t % 10, s = Math.floor(t / 10) % 60, m = Math.floor(t / 600) % 60, h = Math.floor(t / 36000); return [h, m, s].map(x => String(x).padStart(2, '0')).join(':') + ',' + d; };
  const cnow = () => cacc + (crun ? Date.now() - c0 : 0);
  const cB = btn('Démarrer', 'play', () => { if (crun) { cacc = cnow(); crun = false; clearInterval(ct); } else { c0 = Date.now(); crun = true; ct = setInterval(() => { cdisp.textContent = cf(cnow()); }, 100); } cB.lastChild.textContent = crun ? 'Pause' : 'Reprendre'; }, 'pri');
  const lapB = btn('Tour', 'star', () => { if (!crun && !cacc) return; laps.prepend(el('li', { textContent: cf(cnow()) })); }), crB = btn('Remise à zéro', 'refresh', () => { crun = false; clearInterval(ct); cacc = 0; cdisp.textContent = '00:00:00,0'; laps.replaceChildren(); cB.lastChild.textContent = 'Démarrer'; });
  ctxClean.push(() => { clearInterval(tm); clearInterval(ct); });
  const sec = (t, ...c) => el('section', { className: 'tl-sec' }, el('h4', { textContent: t }), ...c);
  return el('div', { className: 'tl-pane-in' }, sec('Minuteur', el('div', { className: 'tl-grid' }, hh.box, mm.box, ss.box), disp, el('div', { className: 'row' }, startB, resetB)), sec('Chronomètre', cdisp, el('div', { className: 'row' }, cB, lapB, crB), laps));
}

/* ---------- texte ---------- */
function toolText() {
  const ta = el('textarea', { rows: 8, maxLength: 200000, placeholder: 'Collez ou saisissez votre texte ici…', 'aria-label': 'Texte', oninput: () => stats() }), res = tRes();
  const stats = () => {
    const t = ta.value, words = (t.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length, sent = (t.match(/[^.!?…]+[.!?…]+/g) || []).length || (t.trim() ? 1 : 0), lines = t ? t.split('\n').length : 0;
    tShow(res, [['Mots', tFmt(words, 0)], ['Caractères', tFmt(t.length, 0) + ' (sans espaces : ' + tFmt(t.replace(/\s/g, '').length, 0) + ')'], ['Phrases', tFmt(sent, 0)], ['Lignes', tFmt(lines, 0)], ['Lecture', words ? '≈ ' + (words / 230 < 1 ? Math.max(1, Math.round(words / 230 * 60)) + ' s' : tFmt(words / 230, 1) + ' min') : '—']]);
  };
  const set = f => () => { ta.value = f(ta.value); stats(); };
  const cap = s => s.toLowerCase().replace(/(^|[\s'’(-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const acc = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const bs = [['MAJUSCULES', s => s.toUpperCase()], ['minuscules', s => s.toLowerCase()], ['Première Lettre', cap], ['Sans accents', acc], ['Espaces en trop', s => s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim()], ['Trier les lignes', s => s.split('\n').sort((a, b) => a.localeCompare(b, 'fr')).join('\n')], ['Supprimer les doublons', s => [...new Set(s.split('\n'))].join('\n')], ['Inverser', s => [...s].reverse().join('')], ['Lignes vides en moins', s => s.split('\n').filter(l => l.trim()).join('\n')]];
  stats();
  return el('div', { className: 'tl-pane-in' }, ta, el('div', { className: 'row tight tl-wrapb' }, ...bs.map(([l, f]) => btn(l, '', set(f), 'tl-chip'))), el('div', { className: 'row' }, btn('Copier', 'copy', () => ta.value && copyText(ta.value).then(() => toast('Texte copié.'))), btn('Effacer', 'trash', () => { ta.value = ''; stats(); })), res);
}

/* ---------- couleurs ---------- */
function toolColor() {
  const pick = el('input', { type: 'color', value: '#3a7bd5', 'aria-label': 'Choisir une couleur', className: 'tl-pick' });
  const hex = tIn('HEX', { value: '#3a7bd5', max: 9, on: () => fromHex() }), rgb = tIn('RGB', { value: '', max: 20, on: () => fromRgb() }), hsl = tIn('HSL', { value: '', max: 24, on: () => fromHsl() });
  const sw = el('div', { className: 'tl-sw' }), shades = el('div', { className: 'tl-shades' }), info = tRes();
  const toHsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]; };
  const fromHslv = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [0, 8, 4].map(n => Math.round(f(n) * 255)); };
  const hx = v => v.toString(16).padStart(2, '0'), toHex = (r, g, b) => '#' + hx(r) + hx(g) + hx(b);
  const lum = (r, g, b) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const show = (r, g, b, from) => {
    const H = toHex(r, g, b), [h, s, l] = toHsl(r, g, b); pick.value = H; sw.style.background = H;
    if (from !== 'hex') hex.i.value = H; if (from !== 'rgb') rgb.i.value = `rgb(${r}, ${g}, ${b})`; if (from !== 'hsl') hsl.i.value = `hsl(${h}, ${s}%, ${l}%)`;
    const L = lum(r, g, b), cw = 1.05 / (L + .05), cb = (L + .05) / .05; tShow(info, [['Contraste avec le blanc', tFmt(cw, 2) + ':1 ' + (cw >= 4.5 ? '✓ lisible' : '✗ faible')], ['Contraste avec le noir', tFmt(cb, 2) + ':1 ' + (cb >= 4.5 ? '✓ lisible' : '✗ faible')]]);
    shades.replaceChildren(...[10, 25, 40, 55, 70, 85, 95].map(ll => { const c = toHex(...fromHslv(h, s, ll)); return el('button', { type: 'button', className: 'tl-shade', style: 'background:' + c, title: c + ' (clic : copier)', 'aria-label': 'Copier ' + c, onclick: () => copyText(c).then(() => toast(c + ' copié.')) }, el('span', { textContent: c })); }));
  };
  const fromHex = () => { let v = hex.i.value.trim().replace('#', ''); if (v.length === 3) v = [...v].map(c => c + c).join(''); if (/^[0-9a-f]{6}$/i.test(v)) show(parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), 'hex'); };
  const fromRgb = () => { const m = rgb.i.value.match(/\d+/g); if (m && m.length >= 3 && m.slice(0, 3).every(x => +x <= 255)) show(+m[0], +m[1], +m[2], 'rgb'); };
  const fromHsl = () => { const m = hsl.i.value.match(/\d+/g); if (m && m.length >= 3 && +m[0] <= 360 && +m[1] <= 100 && +m[2] <= 100) { const [r, g, b] = fromHslv(+m[0], +m[1], +m[2]); show(r, g, b, 'hsl'); } };
  pick.oninput = () => { hex.i.value = pick.value; fromHex(); }; fromHex();
  return el('div', { className: 'tl-pane-in' }, el('div', { className: 'row' }, pick, sw), el('div', { className: 'tl-grid' }, hex.box, rgb.box, hsl.box), el('h4', { textContent: 'Nuances (cliquer pour copier)' }), shades, info);
}

/* ---------- bases numériques ---------- */
function toolBase() {
  const f = { 10: tIn('Décimal', { attrs: { 'data-b': '10' }, max: 70 }), 2: tIn('Binaire', { max: 200 }), 8: tIn('Octal', { max: 80 }), 16: tIn('Hexadécimal', { max: 70 }) }, msg = el('small', { className: 'mut' });
  const OK = { 10: /^-?\d+$/, 2: /^-?[01]+$/, 8: /^-?[0-7]+$/, 16: /^-?[0-9a-f]+$/i };
  const parse = (s, b) => { const neg = s.startsWith('-'); s = neg ? s.slice(1) : s; let v = 0n; for (const c of s.toLowerCase()) v = v * BigInt(b) + BigInt(parseInt(c, 36)); return neg ? -v : v; };
  for (const b of [10, 2, 8, 16]) f[b].i.addEventListener('input', () => {
    const s = f[b].i.value.trim().replace(/\s+/g, ''); msg.textContent = '';
    if (!s) { for (const k of [10, 2, 8, 16]) if (+k !== b) f[k].i.value = ''; return; }
    if (!OK[b].test(s)) { msg.textContent = 'Caractère non valide pour cette base.'; return; }
    const v = parse(s, b); for (const k of [10, 2, 8, 16]) if (+k !== b) f[k].i.value = v.toString(+k).toUpperCase();
  });
  f[10].i.value = '255'; f[10].i.dispatchEvent(new Event('input'));
  return el('div', { className: 'tl-pane-in' }, el('div', { className: 'tl-grid' }, f[10].box, f[16].box, f[2].box, f[8].box), msg, el('small', { className: 'mut', textContent: 'Saisissez dans l’un des champs : les autres se mettent à jour (grands nombres acceptés).' }));
}

/* ---------- addition à partager ---------- */
function toolSplit() {
  const m = tIn('Montant de l’addition', { value: '84,50', on: () => calc() }), t = tIn('Pourboire (%)', { value: '10', on: () => calc() }), n = tIn('Nombre de personnes', { value: '4', on: () => calc() }), res = tRes();
  const calc = () => { const M = tNum(m.i.value), T = tNum(t.i.value) || 0, N = Math.max(1, Math.floor(tNum(n.i.value) || 1)); if (!Number.isFinite(M)) return tShow(res, [['Résultat', '—']]); const tot = M * (1 + T / 100); tShow(res, [['Chacun paie', tMoney(tot / N)], ['Total avec pourboire', tMoney(tot)], ['Pourboire', tMoney(tot - M)]], true); };
  calc(); return el('div', { className: 'tl-pane-in' }, el('div', { className: 'tl-grid' }, m.box, t.box, n.box), res);
}

/* ---------- prêt / crédit ---------- */
function toolLoan() {
  const c = tIn('Capital emprunté (€)', { value: '200000', on: () => calc() }), r = tIn('Taux annuel (%)', { value: '3,5', on: () => calc() }), d = tIn('Durée', { value: '20', on: () => calc() }), u = tSel('Unité', [['y', 'années'], ['m', 'mois']], 'y', () => calc()), res = tRes();
  const calc = () => {
    const C = tNum(c.i.value), R = tNum(r.i.value), D = tNum(d.i.value), n = Math.round(u.s.value === 'y' ? D * 12 : D); if (!(C > 0 && R >= 0 && n > 0)) return tShow(res, [['Résultat', 'Saisissez capital, taux et durée']]);
    const i = R / 1200, p = i ? C * i / (1 - Math.pow(1 + i, -n)) : C / n, tot = p * n;
    tShow(res, [['Mensualité', tMoney(p)], ['Coût total du crédit (intérêts)', tMoney(tot - C)], ['Total remboursé', tMoney(tot)], ['Nombre de mensualités', String(n)]], true);
  };
  calc(); return el('div', { className: 'tl-pane-in' }, el('div', { className: 'tl-grid' }, c.box, r.box, d.box, u.box), res, el('small', { className: 'mut', textContent: 'Estimation hors assurance et frais, avec mensualités constantes.' }));
}

/* ---------- heure dans le monde ---------- */
const ZONES = [['Europe/Paris', 'Paris'], ['Europe/London', 'Londres'], ['Europe/Moscow', 'Moscou'], ['Africa/Casablanca', 'Casablanca'], ['Africa/Johannesburg', 'Johannesburg'], ['Asia/Dubai', 'Dubaï'], ['Asia/Kolkata', 'Mumbai / New Delhi'], ['Asia/Shanghai', 'Pékin / Shanghai'], ['Asia/Tokyo', 'Tokyo'], ['Australia/Sydney', 'Sydney'], ['Pacific/Auckland', 'Auckland'], ['America/Sao_Paulo', 'São Paulo'], ['America/New_York', 'New York'], ['America/Toronto', 'Montréal / Toronto'], ['America/Chicago', 'Chicago'], ['America/Los_Angeles', 'Los Angeles'], ['Pacific/Tahiti', 'Papeete'], ['America/Martinique', 'Fort-de-France'], ['Indian/Reunion', 'Saint-Denis (La Réunion)'], ['Pacific/Noumea', 'Nouméa']];
function toolWorld() {
  const lang = typeof uiLang === 'function' ? uiLang() : 'fr', box = el('div', { className: 'tl-tbl' });
  const src = tSel('Heure saisie dans', ZONES.map(z => [z[0], z[1]]), 'Europe/Paris', () => paint());
  const now = new Date(), dflt = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const when = tIn('Date et heure', { type: 'datetime-local', value: dflt, on: () => paint(), max: 20 });
  const offsetOf = (tz, t) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(t).map(x => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000; };
  const toUtc = (s, tz) => { const m = s.match(/^(\d+)-(\d+)-(\d+)T(\d+):(\d+)/); if (!m) return null; const g = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]); let t = g - offsetOf(tz, new Date(g)); t = g - offsetOf(tz, new Date(t)); return new Date(t); };
  const paint = () => {
    const t = toUtc(when.i.value, src.s.value) || new Date();
    box.replaceChildren(...ZONES.map(([tz, nm]) => el('div', { className: 'tl-kv' }, el('span', { textContent: nm }), el('b', { textContent: new Intl.DateTimeFormat(lang, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(t) }))));
  };
  paint();
  return el('div', { className: 'tl-pane-in' }, el('div', { className: 'tl-grid' }, src.box, when.box), box, el('small', { className: 'mut', textContent: 'Les changements d’heure (été/hiver) sont pris en compte pour la date choisie.' }));
}

/* ---------- tirage au sort ---------- */
function toolRandom() {
  const res = tRes(), out = el('div', { className: 'tl-big', textContent: '—', 'aria-live': 'polite' });
  const faces = tIn('Faces du dé', { value: '6', max: 6 }), mn = tIn('Minimum', { value: '1', max: 12 }), mx = tIn('Maximum', { value: '100', max: 12 }), cnt = tIn('Combien de tirages', { value: '1', max: 3 });
  const list = el('textarea', { rows: 5, placeholder: 'Un nom par ligne (ex. Léa, Hugo, Sofia…)', 'aria-label': 'Liste de noms', maxLength: 5000 });
  const dice = btn('Lancer le dé', 'refresh', () => { const f = Math.max(2, Math.min(1000, Math.floor(tNum(faces.i.value) || 6))), k = Math.max(1, Math.min(20, Math.floor(tNum(cnt.i.value) || 1))); const r = Array.from({ length: k }, () => 1 + tRand(f)); out.textContent = r.join(' · '); tShow(res, k > 1 ? [['Total', String(r.reduce((a, b) => a + b, 0))]] : []); }, 'pri');
  const coin = btn('Pile ou face', 'refresh', () => { out.textContent = tRand(2) ? 'Pile' : 'Face'; res.replaceChildren(); });
  const num = btn('Nombre au hasard', 'refresh', () => { let a = Math.floor(tNum(mn.i.value)), b = Math.floor(tNum(mx.i.value)); if (!Number.isFinite(a + b)) return toast('Saisissez deux nombres entiers.'); if (a > b) [a, b] = [b, a]; if (b - a > 2e9) return toast('Écart trop grand.'); out.textContent = String(a + tRand(b - a + 1)); res.replaceChildren(); });
  const pickN = btn('Tirer un nom', 'user', () => { const l = list.value.split('\n').map(s => s.trim()).filter(Boolean); if (!l.length) return toast('Saisissez au moins un nom.'); out.textContent = l[tRand(l.length)]; res.replaceChildren(); });
  const mixN = btn('Mélanger la liste', 'refresh', () => { const l = list.value.split('\n').map(s => s.trim()).filter(Boolean); for (let i = l.length - 1; i > 0; i--) { const j = tRand(i + 1); [l[i], l[j]] = [l[j], l[i]]; } list.value = l.join('\n'); });
  const sec = (t, ...c) => el('section', { className: 'tl-sec' }, el('h4', { textContent: t }), ...c);
  return el('div', { className: 'tl-pane-in' }, out, res, sec('Dés et nombres', el('div', { className: 'tl-grid' }, faces.box, cnt.box, mn.box, mx.box), el('div', { className: 'row tight' }, dice, coin, num)), sec('Tirage dans une liste', list, el('div', { className: 'row tight' }, pickN, mixN)));
}

/* ---------- carburant et trajet ---------- */
function toolFuel() {
  const d = tIn('Distance (km)', { value: '350', on: () => calc() }), c = tIn('Consommation (L/100 km)', { value: '6,5', on: () => calc() }), p = tIn('Prix du litre (€)', { value: '1,85', on: () => calc() }), np = tIn('Personnes (partage des frais)', { value: '1', on: () => calc() }), res = tRes();
  const calc = () => {
    const D = tNum(d.i.value), C = tNum(c.i.value), P = tNum(p.i.value), N = Math.max(1, Math.floor(tNum(np.i.value) || 1)); if (!(D >= 0 && C > 0)) return tShow(res, [['Résultat', '—']]);
    const L = D * C / 100, rows = [['Carburant nécessaire', tFmt(L, 2) + ' L']]; if (P > 0) rows.push(['Coût du trajet', tMoney(L * P)], ['Par personne', tMoney(L * P / N)], ['Coût aux 100 km', tMoney(C * P)]);
    rows.push(['Équivalent en miles par gallon (US)', tFmt(235.215 / C, 1) + ' mpg']); tShow(res, rows, true);
  };
  calc(); return el('div', { className: 'tl-pane-in' }, el('div', { className: 'tl-grid' }, d.box, c.box, p.box, np.box), res);
}

/* ---------- fenêtre ---------- */
const TOOLS = [
  ['calc', '🧮', 'Calculatrice', toolCalc], ['units', '📏', 'Convertisseur d’unités', toolUnits], ['area', '📐', 'Surfaces et volumes (m²)', toolArea], ['work', '🎨', 'Travaux : peinture, carrelage', toolWork],
  ['percent', '％', 'Pourcentages, TVA, remises', toolPercent], ['dates', '📅', 'Dates et âge', toolDates], ['loan', '🏦', 'Prêt / crédit', toolLoan], ['split', '🍽️', 'Addition à partager', toolSplit],
  ['fuel', '⛽', 'Carburant et trajet', toolFuel], ['bmi', '⚖️', 'IMC (poids / taille)', toolBmi], ['timer', '⏱️', 'Minuteur et chronomètre', toolTimer], ['text', '🔤', 'Texte (compteur, casse…)', toolText],
  ['color', '🎯', 'Couleurs', toolColor], ['base', '💻', 'Binaire, hexadécimal…', toolBase], ['world', '🌍', 'Heure dans le monde', toolWorld], ['random', '🎲', 'Tirage au sort', toolRandom], ['pwd', '🔑', 'Mot de passe', toolPassword]
];
function toolsWin(start) {
  const clean = [], pane = el('div', { className: 'tl-pane', tabIndex: -1 }), nav = el('nav', { className: 'tl-nav', 'aria-label': 'Outils' });
  const open = id => {
    const t = TOOLS.find(x => x[0] === id) || TOOLS[0]; TOOL_STATE.tab = t[0];
    clean.splice(0).forEach(f => { try { f(); } catch { /* arrêt de minuteurs */ } });
    [...nav.children].forEach(b => b.classList.toggle('on', b.dataset.id === t[0]));
    pane.replaceChildren(el('h3', { className: 'tl-h3', textContent: t[1] + ' ' + t[2] }), t[3](clean)); pane.scrollTop = 0;
  };
  TOOLS.forEach(t => { const b = el('button', { type: 'button', className: 'tl-n', onclick: () => open(t[0]), 'aria-label': t[2], title: t[2] }, el('span', { className: 'tl-ic', textContent: t[1] }), el('span', { textContent: t[2] })); b.dataset.id = t[0]; nav.append(b); });
  const w = win('Boîte à outils', 'tools', [el('div', { className: 'tl-wrap' }, nav, pane)], { w: 900, h: 660, cls: 'tlw', onclose: () => clean.forEach(f => { try { f(); } catch { /* rien */ } }) });
  open(start || TOOL_STATE.tab);
  return w;
}
