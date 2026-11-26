'use strict';
/* epgdata.js — catalogue des guides de programmes (EPG, format XMLTV) de Sormick TV, et fenêtre pour le modifier.
   POURQUOI UN CATALOGUE MODIFIABLE : les adresses de ces guides sont tenues par des projets communautaires et peuvent changer.
   Vous pouvez donc, depuis la fenêtre « Guides des programmes », modifier, ajouter ou retirer chaque guide, rétablir le catalogue d'origine,
   ou même importer un catalogue à jour depuis une adresse (fichier JSON de votre choix) : aucun nouveau déploiement du site n'est nécessaire.
   Sources du catalogue d'origine (gratuites, mises à jour chaque jour par leurs auteurs) :
   - EPGShare — https://epgshare01.online/epgshare01/ (un guide par pays : epg_ripper_FR1.xml.gz, etc.)
   - epg.pw — https://epg.pw/xmltv.html (guides par pays, XMLTV)
   Le site ne conserve aucun guide : il télécharge celui du pays de la chaîne regardée, le garde en mémoire quelques heures, puis l'oublie. */
const EPG_ES = 'https://epgshare01.online/epgshare01/epg_ripper_';
const EPG_BUILTIN = (() => {
  const L = [];
  for (const k of 'AE1 AL1 AR1 AT1 AU1 BA1 BB1 BE2 BG1 BR1 BR2 CA2 CH1 CL1 CO1 CR1 CY1 CZ1 DE1 DK1 DO1 EC1 ES1 FI1 FR1 GR1 HK1 HR1 HU1 ID1 IE1 IL1 IN1 IN2 IN4 IT1 JM1 JP1 JP2 KE1 KR1 KZ1 LT1 LU1 LV1 MN1 MT1 MX1 MY1 NG1 NL1 NO1 NZ1 PA1 PE1 PH2 PL1 PT1 RO1 RO2 RS1 SA2 SE1 SG1 SK1 SV1 TH1 TR1 TR3 UA1 UK1 US2 UY1 VN1 ZA1'.split(' '))
    L.push({ id: 'es:' + k, cc: k.slice(0, 2).toLowerCase(), name: 'EPGShare · ' + k, url: EPG_ES + k + '.xml.gz' });
  for (const [k, n] of [['BEIN1', 'beIN Sports'], ['ALJAZEERA1', 'Al Jazeera'], ['DISTROTV1', 'DistroTV'], ['PLEX1', 'Plex (chaînes gratuites)'], ['RAKUTEN1', 'Rakuten TV'], ['US_LOCALS1', 'Chaînes locales américaines'], ['US_SPORTS1', 'Sport américain'], ['ALL_SOURCES1', 'Tous les guides EPGShare (très volumineux)']])
    L.push({ id: 'es:' + k, cc: '', name: 'EPGShare · ' + n, url: EPG_ES + k + '.xml.gz' });
  for (const c of ['FR', 'US', 'SG', 'TW', 'VN', 'ZA']) L.push({ id: 'pw:' + c, cc: c.toLowerCase(), name: 'epg.pw · ' + c, url: 'https://epg.pw/xmltv/epg_' + c + '.xml.gz' });
  return L;
})();

const ccName = cc => { if (!cc) return 'International'; try { return new Intl.DisplayNames([uiLang()], { type: 'region' }).of(cc === 'uk' ? 'GB' : cc.toUpperCase()) || cc.toUpperCase(); } catch { return cc.toUpperCase(); } };

/* liste effective : catalogue d'origine, moins ce que vous avez retiré, avec vos modifications, plus vos ajouts */
function epgAll() {
  const hide = new Set(D.tv.epgHide), ov = new Map(D.tv.epgs.filter(x => x.orig).map(x => [x.orig, x])), out = [];
  for (const b of EPG_BUILTIN) { if (hide.has(b.id)) continue; const o = ov.get(b.id); out.push(o ? { ...o, builtin: b.id, edited: true } : { ...b, builtin: b.id }); }
  for (const x of D.tv.epgs) if (!x.orig) out.push({ ...x, mine: true });
  return out;
}
const epgForCC = cc => (cc ? epgAll().filter(s => s.cc === cc) : []);

function epgWin(onChange) {
  const q = el('input', { type: 'search', placeholder: 'Rechercher un pays ou un guide…', maxLength: 60, className: 'grow', 'aria-label': 'Rechercher un guide', oninput: () => draw() });
  const box = el('div', { className: 'tv-lists epg-list' }), st = el('small', { className: 'mut' });
  const done = () => { save(); draw(); if (onChange) onChange(); };
  const host = u => { try { const x = new URL(u); return x.host + x.pathname.replace(/^.*\//, '/…/'); } catch { return u; } };
  const check = async s => {
    st.textContent = tr('Test du guide…') + ' ' + s.name;
    try { const E = await epgGet(s.url); st.textContent = '✓ ' + s.name + ' : ' + E.prog.size + ' ' + tr('chaînes avec des programmes'); }
    catch (e) { st.textContent = '✗ ' + s.name + ' : ' + e.message; }
  };
  const fields = s => [{ k: 'name', label: 'Nom', value: s ? s.name : '', req: true, max: 100 }, { k: 'cc', label: 'Pays (2 lettres : fr, de, uk, us… ; vide = international)', value: s ? s.cc : '', max: 2 }, { k: 'url', label: 'Adresse du guide (https://….xml ou .xml.gz)', value: s ? s.url : '', req: true, max: 500, type: 'url' }];
  const valid = r => {
    const cc = String(r.cc || '').trim().toLowerCase(); if (cc && !/^[a-z]{2}$/.test(cc)) { toast('Le pays s’écrit avec 2 lettres (fr, de, uk…).'); return null; }
    const u = String(r.url || '').trim(); if (!/^https:\/\//i.test(u) || !httpUrl(u)) { toast('L’adresse du guide doit commencer par https://.'); return null; }
    return { name: String(r.name).trim().slice(0, 100), cc, url: httpUrl(u).slice(0, 500) };
  };
  const add = async () => {
    const r = await dialog('Ajouter un guide des programmes', fields(null), 'Ajouter'); if (!r) return; const v = valid(r); if (!v) return;
    if (D.tv.epgs.length >= 400) return toast('Trop de guides (400 maximum).');
    D.tv.epgs.push({ id: 'u:' + uid(), ...v, orig: '' }); done();
  };
  const edit = async s => {
    const r = await dialog('Modifier le guide', fields(s), 'Enregistrer', { note: s.builtin ? 'Le guide d’origine reste disponible : « Rétablir le catalogue d’origine » annule vos modifications.' : '' }); if (!r) return; const v = valid(r); if (!v) return;
    if (s.mine) { const t = D.tv.epgs.find(x => x.id === s.id); if (t) Object.assign(t, v); }
    else { const t = D.tv.epgs.find(x => x.orig === s.builtin); if (t) Object.assign(t, v); else D.tv.epgs.push({ id: 'u:' + uid(), ...v, orig: s.builtin }); }
    EPG_MEM.delete(s.url); done();
  };
  const del = async s => {
    if (!await confirmBox('Retirer le guide « ' + s.name + ' » de la liste ? (Vous pourrez le retrouver avec « Rétablir le catalogue d’origine ».)', 'Retirer', true)) return;
    if (s.mine) D.tv.epgs = D.tv.epgs.filter(x => x.id !== s.id);
    else { D.tv.epgs = D.tv.epgs.filter(x => x.orig !== s.builtin); if (!D.tv.epgHide.includes(s.builtin)) D.tv.epgHide.push(s.builtin); }
    done();
  };
  const reset = async () => {
    if (!await confirmBox('Rétablir le catalogue d’origine ? Vos modifications, ajouts et retraits de guides seront annulés (le guide « manuel » de Sormick TV n’est pas touché).', 'Rétablir', true)) return;
    D.tv.epgs = []; D.tv.epgHide = []; EPG_MEM.clear(); done(); toast('Catalogue d’origine rétabli.');
  };
  const cat = el('input', { type: 'url', placeholder: 'Adresse d’un catalogue à jour (fichier JSON, facultatif)', value: D.tv.epgCat || '', maxLength: 500, className: 'grow', 'aria-label': 'Catalogue de guides à jour', inputMode: 'url', autocapitalize: 'off', spellcheck: false });
  const upd = async () => {
    const u = cat.value.trim(); D.tv.epgCat = /^https:\/\//i.test(u) ? (httpUrl(u) || '').slice(0, 500) : ''; save();
    if (!D.tv.epgCat) return toast('Saisissez l’adresse (https://…) d’un fichier JSON : [{"name":"…","cc":"fr","url":"https://…xml.gz"}, …]', 6000);
    st.textContent = tr('Mise à jour du catalogue…');
    try {
      const r = await fetchAny(D.tv.epgCat, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('Le catalogue répond « ' + r.status + ' ».');
      const j = JSON.parse(await r.text()), a = Array.isArray(j) ? j : j && Array.isArray(j.guides) ? j.guides : null; if (!a) throw new Error('Format inattendu : une liste JSON est attendue.');
      const keep = D.tv.epgs.filter(x => !x.id.startsWith('r:')), seen = new Set(keep.map(x => x.url)), add = [];
      for (const x of a.slice(0, 300)) {
        if (!x || typeof x.url !== 'string' || !/^https:\/\//i.test(x.url) || !httpUrl(x.url)) continue;
        const url = httpUrl(x.url).slice(0, 500); if (seen.has(url)) continue; seen.add(url);
        add.push({ id: 'r:' + add.length, name: String(x.name || 'Guide').slice(0, 100), cc: /^[a-z]{2}$/i.test(x.cc || '') ? x.cc.toLowerCase() : '', url, orig: '' });
      }
      D.tv.epgs = keep.concat(add).slice(0, 400); EPG_MEM.clear(); done(); st.textContent = add.length + ' ' + tr('guide(s) importé(s)') + '.';
    } catch (e) { st.textContent = e.message; }
  };
  const auto = el('input', { type: 'checkbox', checked: D.tv.epgAuto !== false, onchange: () => { D.tv.epgAuto = auto.checked; save(); } });
  function draw() {
    const s = q.value.trim().toLowerCase(), all = epgAll().filter(x => !s || (ccName(x.cc) + ' ' + x.cc + ' ' + x.name + ' ' + x.url).toLowerCase().includes(s))
      .sort((a, b) => (a.cc ? 0 : 1) - (b.cc ? 0 : 1) || ccName(a.cc).localeCompare(ccName(b.cc), uiLang()) || a.name.localeCompare(b.name));
    box.replaceChildren(...(all.length ? all.slice(0, 300).map(x => el('div', { className: 'tv-row' },
      el('div', { className: 'grow' }, el('b', { textContent: ccName(x.cc) + ' — ' + x.name + (x.edited ? ' ✎' : x.mine ? ' ★' : '') }), el('div', { className: 'mut rd-sub', textContent: host(x.url) })),
      btn('', 'check', () => check(x), '', 'Tester ce guide (le télécharge et compte les chaînes)'), btn('', 'edit', () => edit(x), '', 'Modifier ce guide'), btn('', 'trash', () => del(x), 'dng', 'Retirer ce guide')))
      : [el('p', { className: 'mut', textContent: 'Aucun guide ne correspond.' })]));
  }
  draw();
  return win('Guides des programmes (EPG)', 'tv', [
    el('p', { className: 'mut', textContent: 'Sormick TV choisit tout seul le guide du pays de la chaîne regardée. Les adresses de ces guides peuvent changer : modifiez, ajoutez ou retirez-les ici, sans rien redéployer. ✎ = modifié par vous, ★ = ajouté par vous.' }),
    el('div', { className: 'row' }, q, btn('Ajouter un guide', 'plus', add, 'pri')), box, st,
    el('label', { className: 'chk' }, auto, el('span', { textContent: 'Charger automatiquement le guide du pays de la liste ouverte' })),
    el('div', { className: 'row' }, cat, btn('Mettre à jour le catalogue', 'refresh', upd)),
    el('div', { className: 'row' }, btn('Rétablir le catalogue d’origine', 'undo', reset, 'dng'))], { w: 700, h: 640, max: true });
}
