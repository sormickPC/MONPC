'use strict';
/* keyboard.js — clavier virtuel : application interne + bouton dans la barre des tâches.
   - 16 langues (celles du profil) : AZERTY / QWERTY / QWERTZ, russe, mongol, arabe, hindi (devanagari), japonais (kana), chinois (pinyin, caractères courants).
   - Écrit dans le champ sélectionné de n'importe quelle app interne (champ, zone de texte, éditeur) et dans les pages intégrées de même origine.
   - Un site externe affiché dans un cadre (iframe) est protégé par le navigateur : on ne peut pas y écrire à sa place. La « zone de saisie » du clavier sert alors
     à écrire puis « Copier », et on colle (Ctrl+V) dans le site.
   - Fenêtre ancrée en bas de l'écran, toujours au premier plan ; touches utilisables à la souris, au doigt et à la télécommande (flèches + OK). */
const KBL = {   // r = rangées de lettres ; s = rangées avec Maj (sinon majuscules automatiques) ; x = touches supplémentaires (accents, signes)
  fr: { r: ['azertyuiop', 'qsdfghjklm', 'wxcvbn'], x: 'éèêëàâçùûîïôœ' },
  en: { r: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'], x: '' },
  pt: { r: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'], x: 'áàâãçéêíóôõú' },
  es: { r: ['qwertyuiop', 'asdfghjklñ', 'zxcvbnm'], x: 'áéíóúü¿¡' },
  it: { r: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'], x: 'àèéìòù' },
  pl: { r: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'], x: 'ąćęłńóśźż' },
  de: { r: ['qwertzuiop', 'asdfghjkl', 'yxcvbnm'], x: 'äöüß' },
  ru: { r: ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю'], x: 'ё' },
  mn: { r: ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю'], x: 'өүёы' },
  id: { r: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'], x: '' },
  sw: { r: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'], x: '' },
  tet: { r: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'], x: 'ãçñêô' },
  ar: { r: ['ضصثقفغعهخحجد', 'شسيبلاتنمكط', 'ئءؤرىةوزظذ'], x: '،؟؛ًٌٍَُِّْ٠١٢٣٤٥٦٧٨٩' },
  hi: { r: ['ौैाीूबहगदजड', 'ोे्िुपरकतचट', 'ंमनवलसय'], s: ['औऐआईऊभङघधझढ', 'ओएअइउफऱखथछठ', 'ँणऩळऴशष'], x: 'ऋञॐ।॥़०१२३४५६७८९' },
  ja: { r: ['あいうえおかきくけこ', 'さしすせそたちつてと', 'なにぬねのはひふへほ', 'まみむめもやゆよらり', 'るれろわをんーっゃゅょ'], x: 'ぁぃぅぇぉ゛゜、。「」?!', kana: 1 },
  zh: { r: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'], x: '，。？！；：、（）“”《》', py: 1 }
};
const KB_SYM = ['@#€$%&*+-=', '()[]{}<>/\\|', '.,:;?!\'"_~', '£¥©®°§¿¡…«»'];
/* Pinyin sans ton → caractères courants (simplifiés). Pour davantage de caractères, utilisez le clavier du système. */
const KB_PY = `a:啊阿|ai:爱哀矮|an:安岸按暗|ang:昂|ao:奥傲|ba:吧把八爸|bai:白百摆|ban:半班办般|bang:帮棒|bao:包保报宝|bei:被北背杯|ben:本|bi:比必笔毕|bian:变边便遍|biao:表标|bie:别|bin:宾|bing:并病冰兵|bo:波博播|bu:不步部布|ca:擦|cai:才菜采财|can:参残餐|cang:仓藏|cao:草操|ce:测册|cha:查差茶察|chai:拆|chan:产缠|chang:长常场唱|chao:超朝吵|che:车彻|chen:陈沉晨|cheng:成城程称|chi:吃持迟尺|chong:充重冲|chu:出处初除|chuan:传船穿|chuang:创床窗|chui:吹|chun:春纯|ci:次此词|cong:从聪|cu:粗促|cun:村存|cuo:错|da:大打达|dai:带待代|dan:但单担|dang:当党|dao:到道倒|de:的得地|deng:等灯登|di:地低第弟|dian:点电店|diao:调掉|die:爹|ding:定顶订|dong:东动冬懂|dou:都斗|du:度读都独|duan:短段断|dui:对队|dun:顿|duo:多朵|e:额饿|en:恩|er:二而儿耳|fa:发法|fan:反饭翻烦|fang:方放房访|fei:非飞费|fen:分份粉|feng:风丰封|fo:佛|fou:否|fu:父付福服夫|gai:改该|gan:干感敢|gang:刚港|gao:高告|ge:个各歌哥|gei:给|gen:根跟|geng:更|gong:工公共功|gou:够狗构|gu:古故顾骨|gua:挂|guai:怪|guan:关管观官|guang:光广|gui:贵规|guo:国过果|ha:哈|hai:还海害孩|han:喊汉寒|hang:行航|hao:好号|he:和河合何|hei:黑|hen:很|heng:横|hong:红|hou:后厚候|hu:湖户护|hua:花话画化|huai:坏|huan:换欢还|huang:黄|hui:会回灰|hun:婚|huo:活火或货|ji:几机鸡记及极己级|jia:家加假价|jian:见间件建简|jiang:将讲江|jiao:叫教交脚|jie:接结姐解节|jin:进今近金|jing:经京静睛|jiu:就九久酒|ju:句局举居|juan:卷|jue:觉决绝|jun:军|ka:卡|kai:开|kan:看刊|kang:康|kao:考靠|ke:可课客科|ken:肯|kong:空控|kou:口|ku:苦哭库|kua:夸|kuai:快块|kuan:宽|kuang:况狂|kui:亏|kun:困|la:拉啦辣|lai:来|lan:蓝烂懒|lang:浪朗|lao:老劳|le:了乐|lei:类累泪|leng:冷|li:里力理立利李|lian:连脸练|liang:两亮量|liao:了料|lie:列|lin:林临|ling:零领另|liu:六留流|long:龙|lou:楼|lu:路陆录|lv:绿旅律|luan:乱|lun:论|luo:落罗|ma:吗妈马|mai:买卖麦|man:满慢|mang:忙|mao:毛猫|me:么|mei:没每美|men:们门|meng:梦|mi:米秘|mian:面|miao:秒|min:民|ming:名明|mo:么末模|mou:某|mu:母木目|na:那拿哪|nai:奶|nan:男难南|nao:脑|ne:呢|nei:内|neng:能|ni:你|nian:年|niang:娘|niao:鸟|nin:您|ning:宁|niu:牛|nong:农|nu:女努|nv:女|nuan:暖|ou:欧|pa:怕爬|pai:排牌|pan:盘|pang:胖|pao:跑|pei:陪配|peng:朋|pi:皮批|pian:片便|piao:票飘|pin:品|ping:平瓶|po:破|pu:普铺|qi:起七气期其|qia:恰|qian:前千钱|qiang:强|qiao:桥巧|qie:且切|qin:亲|qing:请清情青|qiu:秋求球|qu:去取区|quan:全权|que:却确|qun:群|ran:然|rang:让|re:热|ren:人认任|reng:仍|ri:日|rong:容|rou:肉|ru:如入|ruan:软|rui:瑞|run:润|sa:撒|sai:赛|san:三散|sang:桑|sao:扫|se:色|sen:森|seng:僧|sha:杀沙|shan:山闪|shang:上商|shao:少|she:社设|shei:谁|shen:什身深|sheng:生声胜|shi:是十事时师市世|shou:手受收|shu:书数树|shua:刷|shuai:帅|shuang:双|shui:水睡谁|shun:顺|shuo:说|si:四死思|song:送|sou:搜|su:速素|suan:算|sui:岁随|sun:孙|suo:所|ta:他她它|tai:太台|tan:谈|tang:糖|tao:套|te:特|teng:疼|ti:提题体|tian:天田|tiao:条|tie:铁|ting:听停|tong:同通|tou:头|tu:图土|tuan:团|tui:推|tuo:脱|wa:哇|wai:外|wan:万完晚玩|wang:王网望往|wei:为位未喂|wen:问文闻|wo:我|wu:五无物午|xi:西喜洗系|xia:下夏|xian:先现线|xiang:想向香相|xiao:小笑校|xie:写谢些|xin:新心信|xing:行星性|xiong:兄|xiu:休修|xu:需许|xuan:选|xue:学雪|xun:寻|ya:呀牙|yan:言眼烟|yang:样阳|yao:要药|ye:也夜叶|yi:一以意已|yin:因音银|ying:应英影|yo:哟|yong:用永|you:有又友|yu:于鱼雨语|yuan:远元院|yue:月越|yun:云运|za:杂|zai:在再|zan:赞|zang:脏|zao:早造|ze:则|zen:怎|zeng:增|zha:炸|zhai:宅|zhan:站占|zhang:张长|zhao:找照|zhe:这着者|zhen:真|zheng:正整|zhi:只知直之|zhong:中重|zhou:周州|zhu:主住注|zhua:抓|zhuan:转|zhuang:装|zhui:追|zhun:准|zhuo:桌|zi:字自子|zong:总|zou:走|zu:组足|zuan:钻|zui:最|zun:尊|zuo:做作坐`;
const KB_PYM = new Map(KB_PY.split('|').map(s => { const i = s.indexOf(':'); return [s.slice(0, i), [...s.slice(i + 1)]]; }));
const KB_VOICED = { 'う': 'ゔ' }, KB_SEMI = {};
'かきくけこさしすせそたちつてとはひふへほ'.split('').forEach((c, i) => { KB_VOICED[c] = 'がぎぐげござじずぜぞだぢづでどばびぶべぼ'[i]; });
'はひふへほ'.split('').forEach((c, i) => { KB_SEMI[c] = 'ぱぴぷぺぽ'[i]; });
const KB = { rec: null, lang: null, shift: 0, sym: false, kata: false, buf: '', last: null, zone: null, lbl: null, host: null, cand: null, sug: null, ps: null };

function kbLangPref() { let l = ''; try { l = localStorage.getItem('vd2.kb') || ''; } catch { /* facultatif */ } return KBL[l] ? l : (typeof LANG === 'string' && KBL[LANG] ? LANG : 'fr'); }
const kbEditable = n => !!n && n.nodeType === 1 && ((n.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|file|range|color|image|hidden)$/i.test(n.type)) || n.tagName === 'TEXTAREA' || n.isContentEditable);
const kbInside = n => !!(KB.rec && n && KB.rec.contains(n));
function kbTarget() {
  const ae = document.activeElement;
  if (ae && ae.tagName === 'IFRAME') { try { const d = ae.contentDocument, a = d && d.activeElement; if (kbEditable(a)) return a; } catch { /* site externe : protégé par le navigateur */ } }
  else if (kbEditable(ae) && !kbInside(ae)) return ae;
  if (KB.last && KB.last.isConnected && !KB.last.closest('[hidden]')) return KB.last;
  return KB.zone;
}
function kbTargetName(t) {
  if (!t || t === KB.zone) return 'Zone de saisie du clavier';
  return t.getAttribute('aria-label') || t.placeholder || t.getAttribute('name') || t.id || (t.isContentEditable ? 'Éditeur de texte' : 'Champ sélectionné');
}
function kbLabel() { if (KB.lbl) KB.lbl.textContent = (typeof tr === 'function' ? tr('Écrit dans :') : 'Écrit dans :') + ' ' + (typeof tr === 'function' ? tr(kbTargetName(kbTarget())) : kbTargetName(kbTarget())); }

function kbInsert(t, s) {
  if (!t || !s) return;
  if (t.isContentEditable) { t.focus(); document.execCommand('insertText', false, s); return; }
  const d = t.ownerDocument.defaultView;
  let a = null, b = null; try { a = t.selectionStart; b = t.selectionEnd; } catch { /* type sans sélection (email, nombre) */ }
  if (a === null || a === undefined) { a = b = t.value.length; }
  if (t.maxLength > 0 && t.value.length - (b - a) + s.length > t.maxLength) return;
  try { t.setRangeText(s, a, b, 'end'); } catch { t.value = t.value.slice(0, a) + s + t.value.slice(b); }
  t.dispatchEvent(new d.Event('input', { bubbles: true }));
}
function kbBack(t) {
  if (!t) return;
  if (t.isContentEditable) { t.focus(); document.execCommand('delete'); return; }
  let a = null, b = null; try { a = t.selectionStart; b = t.selectionEnd; } catch { /* sans sélection */ }
  if (a === null || a === undefined) { a = b = t.value.length; }
  if (a === b) { if (a === 0) return; const c = t.value.charCodeAt(a - 1); a -= (c >= 0xDC00 && c <= 0xDFFF && a > 1) ? 2 : 1; }
  try { t.setRangeText('', a, b, 'end'); } catch { t.value = t.value.slice(0, a) + t.value.slice(b); }
  t.dispatchEvent(new t.ownerDocument.defaultView.Event('input', { bubbles: true }));
}
function kbEnter(t) {
  if (!t) return;
  if (t.tagName === 'TEXTAREA') return kbInsert(t, '\n');
  if (t.isContentEditable) { t.focus(); document.execCommand('insertLineBreak'); return; }
  const W = t.ownerDocument.defaultView, o = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
  const ok = t.dispatchEvent(new W.KeyboardEvent('keydown', o)); t.dispatchEvent(new W.KeyboardEvent('keyup', o));
  if (ok && t.form && t.form.requestSubmit) { try { t.form.requestSubmit(); } catch { /* facultatif */ } }
}
function kbMove(t, dir) {
  if (!t || t.isContentEditable) { if (t) { t.focus(); const s = getSelection(); if (s && s.modify) s.modify('move', dir < 0 ? 'backward' : 'forward', 'character'); } return; }
  try { const p = Math.max(0, Math.min(t.value.length, (dir < 0 ? t.selectionStart : t.selectionEnd) + dir)); t.setSelectionRange(p, p); } catch { /* sans sélection */ }
}
function kbVoice(t, mark) {   // ゛ ゜ : transforme le dernier caractère (か → が, は → ぱ)
  if (!t || t === undefined || t.isContentEditable) return;
  let p = null; try { p = t.selectionStart; } catch { return; }
  if (!p) return;
  const c = t.value[p - 1], k = c >= 'ァ' && c <= 'ヶ', h = k ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c, m = mark === '゛' ? KB_VOICED[h] : KB_SEMI[h];
  if (!m) return;
  kbBack(t); kbInsert(t, k ? String.fromCharCode(m.charCodeAt(0) + 0x60) : m);
}

function kbPress(kind, ch) {   // apprend le mot terminé (espace, Entrée, ponctuation), saisit la touche, puis met à jour les suggestions (predict.js)
  const t = kbTarget();
  if (kpActive() && t && !KB.buf && (kind === 'sp' || kind === 'en' || (kind === 'ch' && !KP_LET.test(ch) && ch !== '゛' && ch !== '゜'))) kpLearnBefore(t);
  kbPress0(kind, ch); kbSug();
}
function kbPress0(kind, ch) {
  const t = kbTarget(); kbLabel();
  const L = KBL[KB.lang];
  if (kind === 'ch') {
    if (L.py && /^[a-z]$/.test(ch) && !KB.sym) { KB.buf += ch; return kbCand(); }
    if (L.py && KB.buf && /^[1-9]$/.test(ch)) { const c = kbCands()[+ch - 1]; if (c) { kbInsert(t, c); KB.buf = ''; kbCand(); } return; }
    if (L.py && KB.buf) { kbInsert(t, KB.buf); KB.buf = ''; kbCand(); }
    if (L.kana && (ch === '゛' || ch === '゜')) return kbVoice(t, ch);
    let s = ch;
    if (L.kana && KB.kata && ch >= 'ぁ' && ch <= 'ん') s = String.fromCharCode(ch.charCodeAt(0) + 0x60);
    else if (KB.shift && !L.s && !L.kana && !KB.sym) s = ch.toUpperCase();
    kbInsert(t, s);
    if (KB.shift === 1) { KB.shift = 0; kbDraw(); }
  } else if (kind === 'sp') { if (L.py && KB.buf) { const c = kbCands()[0]; kbInsert(t, c || KB.buf); KB.buf = ''; kbCand(); } else kbInsert(t, ' '); }
  else if (kind === 'bk') { if (KB.buf) { KB.buf = KB.buf.slice(0, -1); kbCand(); } else kbBack(t); }
  else if (kind === 'en') { if (KB.buf) { kbInsert(t, KB.buf); KB.buf = ''; kbCand(); } else kbEnter(t); }
  else if (kind === 'lf') kbMove(t, -1);
  else if (kind === 'rt') kbMove(t, 1);
}
const kbCands = () => {
  if (!KB.buf) return [];
  const out = [], seen = new Set();
  for (const [k, v] of KB_PYM) if (k === KB.buf || k.startsWith(KB.buf)) for (const c of v) if (!seen.has(c) && out.length < 30) { seen.add(c); out.push(c); }
  if (KB_PYM.has(KB.buf)) { const ex = KB_PYM.get(KB.buf); return [...ex, ...out.filter(c => !ex.includes(c))]; }
  return out;
};
function kbCand() {
  if (!KB.cand) return;
  const t = kbTarget(), list = kbCands();
  KB.cand.hidden = !KBL[KB.lang].py;
  KB.cand.replaceChildren(el('span', { className: 'kcb', textContent: KB.buf || '　' }), ...list.map((c, i) => kbKey(String(i < 9 ? i + 1 : '') + c, () => { kbInsert(kbTarget(), c); KB.buf = ''; kbCand(); }, 'kc', c)));
  void t;
}
function kbKey(label, fn, cls = '', aria = '') {
  const b = el('button', { type: 'button', className: 'kk ' + cls, textContent: label, ...(/\bks\b/.test(cls) ? { nt: 1 } : {}), ...(aria ? { 'aria-label': aria, title: aria } : {}) });
  b.addEventListener('mousedown', e => e.preventDefault());   // le champ garde le focus (souris et doigt)
  b.addEventListener('click', fn);
  return b;
}
function kbDraw() {
  if (!KB.host) return;
  const L = KBL[KB.lang], rows = [];
  const letters = r => [...r];
  const caseOf = (s, i) => L.s && KB.shift ? letters(L.s[i]) : letters(s);
  const chKey = c => {
    let lab = c;
    if (L.kana && KB.kata && c >= 'ぁ' && c <= 'ん') lab = String.fromCharCode(c.charCodeAt(0) + 0x60);
    else if (KB.shift && !L.s && !L.kana) lab = c.toUpperCase();
    return kbKey(lab, () => kbPress('ch', c), '', '');
  };
  rows.push(el('div', { className: 'krow' }, ...[...'1234567890'].map(c => kbKey(c, () => kbPress('ch', c)))));
  if (KB.sym) {
    KB_SYM.forEach(r => rows.push(el('div', { className: 'krow' }, ...[...r].map(c => kbKey(c, () => kbPress('ch', c))))));
  } else {
    L.r.forEach((r, i) => {
      const keys = caseOf(r, i).map(chKey);
      if (i === L.r.length - 1 && !L.kana) {
        keys.unshift(kbKey(KB.shift === 2 ? '⇪' : '⇧', () => { KB.shift = (KB.shift + 1) % 3; kbDraw(); }, 'kw' + (KB.shift ? ' on' : ''), 'Majuscules'));
        keys.push(kbKey('⌫', () => kbPress('bk'), 'kw', 'Effacer'));
      }
      rows.push(el('div', { className: 'krow' }, ...keys));
    });
    if (L.kana) rows.push(el('div', { className: 'krow' }, kbKey(KB.kata ? 'ひらがな' : 'カタカナ', () => { KB.kata = !KB.kata; kbDraw(); }, 'kw', 'Hiragana / Katakana'), kbKey('⌫', () => kbPress('bk'), 'kw', 'Effacer')));
    if (L.x) { const xs = [...L.x]; for (let i = 0; i < xs.length; i += 11) rows.push(el('div', { className: 'krow' }, ...xs.slice(i, i + 11).map(c => kbKey(c, () => kbPress('ch', c))))); }   // pas plus de 11 touches par rangée : lisibles sur smartphone
  }
  rows.push(el('div', { className: 'krow' },
    kbKey(KB.sym ? 'ABC' : '123', () => { KB.sym = !KB.sym; kbDraw(); }, 'kw kwide', KB.sym ? 'Lettres' : 'Chiffres et symboles'),
    kbKey('←', () => kbPress('lf'), 'kw', 'Curseur à gauche'),
    kbKey('', () => kbPress('sp'), 'kspace', 'Espace'),
    kbKey('→', () => kbPress('rt'), 'kw', 'Curseur à droite'),
    ...(KB.sym ? [kbKey('⌫', () => kbPress('bk'), 'kw', 'Effacer')] : []),
    kbKey('↵', () => kbPress('en'), 'kw kwide', 'Entrée')));
  KB.host.replaceChildren(...rows);
  kbCand(); kbSug();
}
function kbDock(w) {   // ancrée en bas du bureau, centrée, jamais plus grande que lui
  const dk = document.getElementById('desk'); if (!dk) return;
  const ui = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1, dw = dk.clientWidth || innerWidth, dh = dk.clientHeight || innerHeight - 70;
  const W = Math.min(dw - 8, Math.round(780 * Math.min(1.7, ui))), H = Math.min(dh - 8, Math.round(500 * Math.min(1.7, ui)));
  w.classList.remove('max'); w.style.cssText = `left:${Math.round((dw - W) / 2)}px;top:${Math.max(0, dh - H - 4)}px;width:${W}px;height:${H}px`;
}
function kbOpen() {
  if (KB.rec && KB.rec.isConnected) { KB.rec.hidden = false; return; }
  KB.lang = kbLangPref(); KB.shift = 0; KB.sym = false; KB.buf = '';
  const sel = el('select', { 'aria-label': 'Langue du clavier', title: 'Langue du clavier', onchange: () => { KB.lang = sel.value; try { localStorage.setItem('vd2.kb', KB.lang); } catch { /* facultatif */ } KB.shift = 0; KB.sym = false; KB.buf = ''; KB.zone.dir = KB.lang === 'ar' ? 'rtl' : 'auto'; kbDraw(); kbSug(); } });
  sel.replaceChildren(...i18nLangsSorted().filter(l => KBL[l[0]]).map(([c, n]) => el('option', { value: c, textContent: n, nt: 1 }))); sel.value = KB.lang;
  KB.zone = el('textarea', { className: 'kzone', rows: 2, maxLength: 4000, placeholder: 'Zone de saisie (pour écrire puis copier dans un site)', 'aria-label': 'Zone de saisie du clavier', dir: KB.lang === 'ar' ? 'rtl' : 'auto' });
  KB.lbl = el('small', { className: 'mut klbl', role: 'status' });
  const copy = async () => {
    const v = KB.zone.value; if (!v) return toast('La zone de saisie est vide.');
    try { await navigator.clipboard.writeText(v); } catch { KB.zone.select(); try { document.execCommand('copy'); } catch { return toast('Copie refusée par le navigateur : sélectionnez le texte et faites Ctrl+C.', 5000); } }
    toast('Texte copié : collez-le (Ctrl+V) dans le site.', 4000);
  };
  KB.cand = el('div', { className: 'kcand', hidden: true });
  KB.sug = el('div', { className: 'ksug', role: 'group', 'aria-label': 'Suggestions de mots', hidden: true });
  KB.ps = el('small', { className: 'mut kps', role: 'status', hidden: true });
  const mkTg = () => btn(KP.on ? 'Suggestions : oui' : 'Suggestions : non', 'check', () => { kpSetOn(!KP.on); const n = mkTg(); KB.tg.replaceWith(n); KB.tg = n; n.focus(); }, '', KP.on ? 'Suggestions : oui (cliquez pour désactiver)' : 'Suggestions : non (cliquez pour activer)');
  KB.tg = mkTg();
  const forget = async () => { if (await confirmBox('Effacer tous les mots appris par le clavier, sur cet appareil et dans votre cloud ?', 'Effacer')) { kpClear(); toast('Mots appris effacés.'); } };
  KB.host = el('div', { className: 'kboard' });
  const w = win('Clavier virtuel', 'keyboard', [
    el('div', { className: 'ktop' }, sel, KB.lbl),
    KB.zone,
    el('div', { className: 'row' }, btn('Copier', 'copy', copy, '', 'Copier le texte de la zone de saisie (à coller dans un site intégré)'), btn('Effacer', 'x', () => { KB.zone.value = ''; KB.buf = ''; kbCand(); kbSug(); }, '', 'Effacer la zone de saisie'), KB.tg, btn('Oublier mes mots', 'trash', forget, '', 'Oublier mes mots appris (sur cet appareil et dans votre cloud)')),
    KB.ps, KB.sug, KB.cand, KB.host], { w: 780, h: 500, cls: 'kbw', onclose: () => { KB.rec = null; KB.host = null; KB.cand = null; KB.lbl = null; KB.sug = null; KB.ps = null; KB.tg = null; removeEventListener('resize', onr); document.removeEventListener('focusin', onf, true); document.removeEventListener('input', oni, true); kpFlush(); } });
  KB.rec = w; kbDock(w); kbDraw(); kbLabel();
  const onr = () => kbDock(w);
  const onf = e => { const n = e.target; if (kbEditable(n) && !kbInside(n)) KB.last = n; if (n === KB.zone) KB.last = null; kbLabel(); kbSug(); };
  const oni = e => { if (!kbInside(e.target) || e.target === KB.zone) kbSug(); };   // frappe au clavier physique : les suggestions suivent
  addEventListener('resize', onr); document.addEventListener('focusin', onf, true); document.addEventListener('input', oni, true);
  KB.zone.focus(); kpInit();
}
function kbToggle() { if (KB.rec && KB.rec.isConnected) KB.rec.close(); else kbOpen(); }
