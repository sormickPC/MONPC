'use strict';
/* predict.js — texte prédictif du clavier virtuel (16 langues).
   - Suggestions de mots pendant la frappe : d'abord vos mots appris (les plus utilisés en premier), puis une petite liste de mots courants de la langue du clavier.
   - Apprentissage : seulement ce qui est écrit AVEC le clavier virtuel, jamais dans un champ de mot de passe, de nombre, d'e-mail, de téléphone, de code ou de carte.
   - Stockage : chiffré avec la clé de votre profil (AES-GCM) dans le navigateur ; si un cloud WebDAV est choisi pour la sauvegarde, une copie chiffrée
     « sormick-<id>.mots.json » est rangée dans le dossier « sormick-cloud » et fusionnée entre vos appareils (mots réunis, compteurs les plus élevés gardés).
   - Rien n'est envoyé à un serveur de ce site. Plafond : 3 000 mots (les moins utilisés sont oubliés en premier). Bouton « Oublier mes mots » : efface tout, ici et dans le cloud. */
const KP_LATIN = new Set(['fr', 'en', 'pt', 'es', 'it', 'pl', 'de', 'id', 'sw', 'tet']);   // accents ignorés pour comparer (« ete » trouve « été »)
const KP_RE = /([\p{L}\p{M}]+)$/u, KP_OK = /^[\p{L}\p{M}]{1,40}$/u, KP_LET = /[\p{L}\p{M}]/u;
const KP_MAX = 3000, KP_KEEP = 2700;
/* Mots courants par langue, du plus fréquent au moins fréquent. Japonais : « lecture=écriture » (les touches sont des kana ; la suggestion remplace par l'écriture). Chinois : mots en caractères. */
const KP_WORDS = {
  fr: `je tu il elle nous vous ils elles on le la les un une des de du et ou mais donc car que qui quoi dont où ne pas plus pour avec sans dans sur sous entre vers chez par en au aux ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs est sont être suis es sommes êtes été étaient était sera serait avoir ai as avons avez ont avait aura fait faire fais faisons dit dire peut peux pouvons pouvoir veut veux voulons vouloir doit dois devoir va vais vont allons aller viens vient venir voir vois vu sais sait savoir bonjour bonsoir bonne bon merci beaucoup salut oui non très bien mal tout tous toute toutes rien personne quelque chaque autre même aussi encore déjà toujours jamais souvent parfois maintenant aujourd'hui demain hier ici là comment pourquoi quand combien quel quelle quels quelles avant après pendant depuis alors ensuite puis enfin parce si comme moins assez trop peu petit petite grand grande nouveau nouvelle vieux jeune premier première dernier dernière long longue court haut bas beau belle joli content contente heureux triste fatigué malade prêt besoin envie temps jour jours nuit matin soir semaine mois année heure minute homme femme enfant garçon fille ami amie famille maison ville pays monde vie travail école voiture train avion route rue eau pain café repas manger boire dormir parler écouter regarder lire écrire jouer chanter musique film télévision message courrier fichier dossier document photo vidéo application ordinateur téléphone internet site recherche connexion compte profil paramètres bienvenue félicitations excusez pardon désolé problème question réponse exemple information service important possible nécessaire différent ensemble toujours quelqu'un chose choses fois idée côté partie point nom numéro adresse date prix argent marché magasin cadeau anniversaire vacances voyage plage montagne fleur arbre animal chat chien oiseau`,
  en: `the be to of and a in that have it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is are was were been has had did does said got made went came saw took thought hello hi thanks thank please yes sorry sure okay great little long very much more many such here where why again always never often today tomorrow yesterday tonight morning evening night week month hour minute home house world life family friend child children man woman boy girl school water food book computer phone message file folder photo video music movie game internet password account search settings welcome congratulations excuse problem question answer example information service important possible necessary different together something nothing everything someone anything really maybe probably actually already still while before between under again another around every found great right left small large young old high low early late free full open close start stop begin end city country street car train plane road town market store shop gift birthday holiday vacation travel beach mountain flower tree animal cat dog bird`,
  pt: `eu tu ele ela nós vós eles elas você vocês o a os as um uma uns umas de do da dos das em no na nos nas por para com sem sobre entre até desde e ou mas porque que quem qual quais onde quando como quanto não sim muito pouco mais menos bem mal tudo todo toda todos todas nada ninguém algum alguma cada outro outra mesmo também ainda já sempre nunca hoje amanhã ontem agora aqui ali lá depois antes durante então assim é são era foi será ser estar estou está estamos estão ter tenho tem temos têm tinha fazer faço faz fazemos fez dizer diz disse poder posso pode podemos querer quero quer queremos dever deve ir vou vai vamos vir vem ver vejo vê saber sei sabe olá oi bom boa bons boas dia tarde noite obrigado obrigada desculpe desculpa favor claro certo ótimo problema pergunta resposta exemplo informação serviço importante possível necessário diferente juntos casa cidade país mundo vida trabalho escola carro trem avião rua água pão café comida comer beber dormir falar ouvir olhar ler escrever jogar cantar música filme televisão mensagem arquivo pasta documento foto vídeo aplicativo computador telefone internet site busca conta senha configurações bem-vindo parabéns família amigo amiga filho filha homem mulher criança tempo hora minuto semana mês ano nome número endereço data preço dinheiro loja presente aniversário férias viagem praia montanha flor árvore animal gato cachorro pássaro`,
  es: `yo tú él ella nosotros vosotros ellos ellas usted ustedes el la los las un una unos unas de del al en con sin sobre entre hasta desde por para y o pero porque que quien cual cuales donde cuando como cuanto no sí muy poco más menos bien mal todo toda todos todas nada nadie alguno alguna cada otro otra mismo también todavía ya siempre nunca hoy mañana ayer ahora aquí allí allá después antes durante entonces así es son era fue será ser estar estoy está estamos están tener tengo tiene tenemos tienen hacer hago hace hacemos hizo decir dice dijo poder puedo puede podemos querer quiero quiere queremos deber debe ir voy va vamos venir viene ver veo ve saber sé sabe hola buenos buenas buen bueno buena día tarde noche gracias perdón disculpe favor claro cierto excelente problema pregunta respuesta ejemplo información servicio importante posible necesario diferente juntos casa ciudad país mundo vida trabajo escuela coche tren avión calle agua pan café comida comer beber dormir hablar escuchar mirar leer escribir jugar cantar música película televisión mensaje archivo carpeta documento foto vídeo aplicación ordenador teléfono internet sitio búsqueda cuenta contraseña ajustes bienvenido felicidades familia amigo amiga hijo hija hombre mujer niño niña tiempo hora minuto semana mes año nombre número dirección fecha precio dinero tienda regalo cumpleaños vacaciones viaje playa montaña flor árbol animal gato perro pájaro`,
  it: `io tu lui lei noi voi loro il lo la i gli le un uno una di del della dei delle a al alla in nel nella con senza su sopra tra fra fino da per e o ma perché che chi quale quali dove quando come quanto non sì molto poco più meno bene male tutto tutta tutti tutte niente nulla nessuno qualche ogni altro altra stesso anche ancora già sempre mai oggi domani ieri adesso ora qui qua lì là dopo prima durante poi così è sono era fu sarà essere stare sto sta stiamo stanno avere ho ha abbiamo hanno fare faccio fa facciamo fatto dire dice detto potere posso può possiamo volere voglio vuole vogliamo dovere deve andare vado va andiamo venire viene vedere vedo vede sapere so sa ciao buongiorno buonasera buonanotte buon buona giorno sera notte grazie prego scusa scusi favore certo giusto ottimo problema domanda risposta esempio informazione servizio importante possibile necessario diverso insieme casa città paese mondo vita lavoro scuola macchina treno aereo strada acqua pane caffè cibo mangiare bere dormire parlare ascoltare guardare leggere scrivere giocare cantare musica film televisione messaggio file cartella documento foto video applicazione computer telefono internet sito ricerca account password impostazioni benvenuto congratulazioni famiglia amico amica figlio figlia uomo donna bambino bambina tempo ora minuto settimana mese anno nome numero indirizzo data prezzo soldi negozio regalo compleanno vacanze viaggio spiaggia montagna fiore albero animale gatto cane uccello`,
  pl: `ja ty on ona ono my wy oni one pan pani i oraz lub albo ale bo ponieważ że który która które kto co gdzie kiedy jak ile nie tak bardzo mało więcej mniej dobrze źle wszystko wszyscy nic nikt każdy inny sam też jeszcze już zawsze nigdy dzisiaj jutro wczoraj teraz tutaj tam potem przed podczas wtedy tak jest są był była było będzie być mieć mam ma mamy mają robić robię robi zrobić mówić mówi powiedzieć móc mogę może możemy chcieć chcę chce chcemy musieć muszę musi iść idę idzie jechać widzieć widzę wiedzieć wiem wie cześć dzień dobry wieczór dobranoc dziękuję dzięki proszę przepraszam przykro oczywiście dobrze świetnie problem pytanie odpowiedź przykład informacja usługa ważny możliwy konieczny inny razem dom miasto kraj świat życie praca szkoła samochód pociąg samolot ulica woda chleb kawa jedzenie jeść pić spać rozmawiać słuchać patrzeć czytać pisać grać śpiewać muzyka film telewizja wiadomość plik folder dokument zdjęcie wideo aplikacja komputer telefon internet strona wyszukiwanie konto hasło ustawienia witamy gratulacje rodzina przyjaciel przyjaciółka syn córka mężczyzna kobieta dziecko czas godzina minuta tydzień miesiąc rok imię numer adres data cena pieniądze sklep prezent urodziny wakacje podróż plaża góry kwiat drzewo zwierzę kot pies ptak`,
  de: `ich du er sie es wir ihr der die das den dem des ein eine einen einem einer und oder aber denn weil dass der welche wer was wo wann wie wie viel nicht ja sehr wenig mehr weniger gut schlecht alles alle nichts niemand jeder anderer selbst auch noch schon immer nie heute morgen gestern jetzt hier dort da dann vor nach während damals ist sind war waren wird werden sein haben habe hat haben hatte machen mache macht gemacht sagen sagt gesagt können kann könnten wollen will wollen müssen muss sollen soll gehen gehe geht kommen komme kommt sehen sehe sieht wissen weiß hallo guten tag abend nacht morgen danke bitte entschuldigung entschuldigen leid klar sicher natürlich super problem frage antwort beispiel information dienst wichtig möglich nötig verschieden zusammen haus stadt land welt leben arbeit schule auto zug flugzeug straße wasser brot kaffee essen trinken schlafen sprechen hören schauen lesen schreiben spielen singen musik film fernsehen nachricht datei ordner dokument foto video anwendung computer telefon internet seite suche konto passwort einstellungen willkommen glückwunsch familie freund freundin sohn tochter mann frau kind zeit stunde minute woche monat jahr name nummer adresse datum preis geld laden geschenk geburtstag urlaub reise strand berg blume baum tier katze hund vogel`,
  ru: `я ты он она оно мы вы они это этот эта эти тот та те мой моя мое мои твой наш ваш их его ее в на с со к ко по из за от до для о об при про над под между через без у и а но или что чтобы потому если когда где куда откуда как какой какая какие кто сколько не да нет очень мало много больше меньше хорошо плохо все всё всего всех ничего никто каждый другой сам тоже еще уже всегда никогда сегодня завтра вчера сейчас здесь там потом перед после тогда так есть был была было были будет быть иметь делать сделать говорить сказать мочь могу можно хотеть хочу должен идти иду ехать видеть вижу знать знаю привет здравствуйте добрый день вечер ночь спасибо пожалуйста извините прости конечно отлично проблема вопрос ответ пример информация сервис важный возможный нужный разный вместе дом город страна мир жизнь работа школа машина поезд самолет улица вода хлеб кофе еда есть пить спать слушать смотреть читать писать играть петь музыка фильм телевизор сообщение файл папка документ фото видео приложение компьютер телефон интернет сайт поиск аккаунт пароль настройки добро поздравляю семья друг подруга сын дочь мужчина женщина ребенок время час минута неделя месяц год имя номер адрес дата цена деньги магазин подарок праздник отпуск поездка пляж гора цветок дерево животное кошка собака птица`,
  mn: `би чи тэр бид та тэд энэ тэр миний чиний манай танай нь бол байна байсан байх болно болох гэж гэсэн ба болон эсвэл гэхдээ учир яагаад хэзээ хаана хаашаа хаанаас яаж ямар хэн хэд хэдэн хэр их бага илүү дутуу сайн муу бүх бүгд юу ч хэн ч өөр өөрөө бас дахин аль хэдийн үргэлж хэзээ ч өнөөдөр маргааш өчигдөр одоо энд тэнд дараа өмнө үед тийм тиймээ үгүй баярлалаа гуйя уучлаарай мэдээж гоё асуудал асуулт хариулт жишээ мэдээлэл үйлчилгээ чухал боломжтой хэрэгтэй өөр хамт гэр хот улс дэлхий амьдрал ажил сургууль машин галт тэрэг онгоц гудамж ус талх кофе хоол идэх уух унтах ярих сонсох харах унших бичих тоглох дуулах хөгжим кино телевиз мессеж файл хавтас баримт зураг видео програм компьютер утас интернэт сайт хайлт бүртгэл нууц үг тохиргоо тавтай морил баяр хүргэе гэр бүл найз хүү охин эрэгтэй эмэгтэй хүүхэд цаг минут долоо хоног сар жил нэр дугаар хаяг огноо үнэ мөнгө дэлгүүр бэлэг төрсөн өдөр амралт аялал далай уул цэцэг мод амьтан муур нохой шувуу сайн байна уу сайн уу мэнд`,
  id: `saya aku kamu anda dia ia kami kita mereka ini itu yang dan atau tetapi tapi karena sebab jika kalau ketika saat di ke dari untuk dengan tanpa pada dalam atas bawah antara sampai sejak oleh tentang siapa apa mana kapan di mana bagaimana berapa mengapa kenapa tidak bukan ya sangat sedikit banyak lebih kurang baik buruk semua segala tidak ada setiap lain sendiri juga masih sudah belum selalu tidak pernah hari ini besok kemarin sekarang di sini di sana nanti sebelum sesudah adalah ialah ada punya mempunyai membuat buat berkata bilang bisa dapat mau ingin harus pergi datang melihat lihat tahu halo hai selamat pagi siang sore malam terima kasih tolong maaf permisi tentu baik bagus masalah pertanyaan jawaban contoh informasi layanan penting mungkin perlu berbeda bersama rumah kota negara dunia hidup kerja sekolah mobil kereta pesawat jalan air roti kopi makanan makan minum tidur bicara mendengar melihat membaca menulis bermain bernyanyi musik film televisi pesan berkas folder dokumen foto video aplikasi komputer telepon internet situs pencarian akun kata sandi pengaturan selamat datang keluarga teman anak laki-laki perempuan waktu jam menit minggu bulan tahun nama nomor alamat tanggal harga uang toko hadiah ulang tahun liburan perjalanan pantai gunung bunga pohon hewan kucing anjing burung`,
  sw: `mimi wewe yeye sisi ninyi wao huyu hii hiki hizi yule ile ya wa la za cha vya kwa katika na au lakini kwa sababu kama wakati ambaye ambayo nani nini wapi lini vipi ngapi kwa nini si ndiyo hapana sana kidogo zaidi bora mbaya yote kila mtu kitu mwingine mwenyewe pia bado tayari daima kamwe leo kesho jana sasa hapa pale baadaye kabla baada ni ndiye yupo kuna ana nina una tuna mna wana kuwa kufanya kusema kuweza naweza unaweza tunaweza kutaka nataka unataka lazima kwenda naenda kuja naona kuona kujua najua jambo hujambo habari salamu asante tafadhali samahani pole karibu kwaheri hakika nzuri tatizo swali jibu mfano taarifa huduma muhimu inawezekana tofauti pamoja nyumba mji nchi dunia maisha kazi shule gari treni ndege barabara maji mkate kahawa chakula kula kunywa kulala kuongea kusikia kutazama kusoma kuandika kucheza kuimba muziki filamu televisheni ujumbe faili folda hati picha video programu kompyuta simu mtandao tovuti utafutaji akaunti nenosiri mipangilio hongera familia rafiki mtoto mwana binti mwanaume mwanamke wakati saa dakika wiki mwezi mwaka jina namba anwani tarehe bei pesa duka zawadi sikukuu likizo safari pwani mlima ua mti mnyama paka mbwa ndege`,
  tet: `ita ami imi nia sira ne'e ne'ebé ida ho no maibé tanba karik se bainhira iha hosi ba ba mai ho sai sim lae barak uitoan liu diak aat hotu ruma buat seluk aat mós sei tia nafatin dala ruma ohin aban horiseik agora antes hafoin iha ne ne'e mak hakarak bele tenke hatene hare rona hatete halo foo fó hola mai bá tama sai koalia hakerek lee obrigadu obrigada bondia botarde bonoite favór deskulpa saida oinsá bainhira iha ne'ebé loron semana fulan tinan oras minutu naran númeru enderesu data folin osan loja prezente aniversáriu feriadu viajen tasi foho funan ai-hun animál busa asu manu uma sidade nasaun mundu moris serbisu eskola kareta tren aviaun dalan bee modo kafé ai-han han hemu toba rona haree hakerek lee muzika filme televizaun mensajen fixeiru dokumentu foto vídeo aplikasaun komputadór telefone internet sítiu buka konta liafuan-xave konfigurasaun benvindu parabéns família belun oan mane feto labarik inan aman maun alin avó tempu`,
  ar: `أنا أنت هو هي نحن أنتم هم هذا هذه ذلك تلك الذي التي في من على إلى عن مع بدون بين حتى منذ و أو لكن لأن إذا عندما حيث أين متى كيف كم لماذا ماذا من لا نعم جدا قليل كثير أكثر أقل جيد سيء كل كل شيء لا شيء أحد آخر نفس أيضا ما زال لقد دائما أبدا اليوم غدا أمس الآن هنا هناك بعد قبل أثناء ثم كان كانت يكون سيكون هو هي يوجد عند لدي لديك لديه لديها عمل يعمل قال يقول استطيع يستطيع أريد يريد يجب ذهب يذهب جاء يأتي رأى يرى عرف يعرف مرحبا أهلا السلام عليكم وعليكم صباح مساء الخير ليلة سعيدة شكرا عفوا من فضلك آسف معذرة طبعا بالتأكيد ممتاز مشكلة سؤال جواب مثال معلومات خدمة مهم ممكن ضروري مختلف معا بيت منزل مدينة بلد عالم حياة عمل مدرسة سيارة قطار طائرة شارع ماء خبز قهوة طعام أكل شرب نوم كلام سماع نظر قراءة كتابة لعب غناء موسيقى فيلم تلفزيون رسالة ملف مجلد وثيقة صورة فيديو تطبيق حاسوب هاتف انترنت موقع بحث حساب كلمة السر إعدادات أهلا وسهلا مبروك عائلة صديق ابن ابنة رجل امرأة طفل وقت ساعة دقيقة أسبوع شهر سنة اسم رقم عنوان تاريخ سعر مال متجر هدية عيد ميلاد عطلة سفر شاطئ جبل زهرة شجرة حيوان قطة كلب طائر إن شاء الله الحمد لله بسم الله`,
  hi: `मैं हम तुम आप वह वे यह ये का की के को में से पर और या लेकिन क्योंकि अगर तो भी ही नहीं हाँ हां बहुत थोड़ा ज्यादा कम अच्छा बुरा सब कुछ कोई हर दूसरा खुद फिर अभी हमेशा कभी आज कल यहाँ वहाँ बाद पहले दौरान है हैं था थी थे होगा होना रहा रही करना करता करती किया कहना कहा सकना सकता चाहना चाहता चाहिए जाना जाता गया आना आता आया देखना देखा जानना जानता नमस्ते नमस्कार सुप्रभात शुभ रात्रि धन्यवाद शुक्रिया कृपया माफ़ क्षमा जरूर बिल्कुल बढ़िया समस्या सवाल प्रश्न जवाब उत्तर उदाहरण जानकारी सेवा महत्वपूर्ण संभव जरूरी अलग साथ घर शहर देश दुनिया जीवन काम स्कूल गाड़ी रेल हवाई सड़क पानी रोटी चाय खाना खाना पीना सोना बोलना सुनना पढ़ना लिखना खेलना गाना संगीत फिल्म टेलीविजन संदेश फाइल फ़ोल्डर दस्तावेज़ फोटो वीडियो ऐप कंप्यूटर फोन इंटरनेट वेबसाइट खोज खाता पासवर्ड सेटिंग स्वागत बधाई परिवार दोस्त मित्र बेटा बेटी आदमी औरत बच्चा समय घंटा मिनट सप्ताह महीना साल नाम नंबर पता तारीख कीमत पैसा दुकान उपहार जन्मदिन छुट्टी यात्रा समुद्र पहाड़ फूल पेड़ जानवर बिल्ली कुत्ता पक्षी भारत हिंदी अंग्रेज़ी`,
  ja: `おはよう=おはよう こんにちは=こんにちは こんばんは=こんばんは ありがとう=ありがとう ありがとうございます=ありがとうございます すみません=すみません ごめんなさい=ごめんなさい おねがいします=お願いします はい=はい いいえ=いいえ だいじょうぶ=大丈夫 わかりました=分かりました おつかれさま=お疲れ様 よろしく=よろしく さようなら=さようなら おやすみなさい=おやすみなさい いただきます=いただきます ごちそうさま=ごちそうさま いってきます=行ってきます ただいま=ただいま おかえり=お帰り わたし=私 あなた=あなた かれ=彼 かのじょ=彼女 ともだち=友達 かぞく=家族 おとうさん=お父さん おかあさん=お母さん がっこう=学校 しごと=仕事 でんわ=電話 てんき=天気 きょう=今日 あした=明日 きのう=昨日 いま=今 なに=何 どこ=どこ だれ=誰 いつ=いつ どう=どう なぜ=なぜ たべる=食べる のむ=飲む みる=見る きく=聞く いく=行く くる=来る する=する ある=ある いる=いる たのしい=楽しい うれしい=嬉しい かなしい=悲しい おいしい=美味しい おおきい=大きい ちいさい=小さい あたらしい=新しい ふるい=古い すき=好き きらい=嫌い にほん=日本 にほんご=日本語 えいご=英語 ほんとう=本当 ほんとうに=本当に たくさん=たくさん すこし=少し もっと=もっと とても=とても ぜんぶ=全部 ひと=人 みず=水 ごはん=ご飯 おんがく=音楽 えいが=映画 ほん=本 じかん=時間 ばしょ=場所 おかね=お金 くるま=車 でんしゃ=電車 えき=駅 みせ=店 いえ=家 ねこ=猫 いぬ=犬 さくら=桜 やま=山 うみ=海 そら=空 あめ=雨 ゆき=雪 コンピューター=コンピューター スマートフォン=スマートフォン インターネット=インターネット メッセージ=メッセージ ファイル=ファイル パスワード=パスワード アカウント=アカウント ビデオ=ビデオ ゲーム=ゲーム メール=メール`,
  zh: `你好 谢谢 不客气 对不起 没关系 再见 早上好 晚安 请问 请 我们 你们 他们 她们 什么 怎么 为什么 可以 不是 没有 知道 喜欢 朋友 家人 学校 工作 今天 明天 昨天 现在 时间 电话 手机 电脑 网络 中国 汉语 英语 非常 一起 已经 因为 所以 但是 如果 还是 或者 以后 以前 开始 结束 帮助 问题 回答 吃饭 喝水 睡觉 学习 高兴 快乐 漂亮 好吃 欢迎 祝你 生日快乐 新年快乐 身体健康 谢谢你 我爱你 我想 我要 我是 我有 你是 你有 他是 她是 这个 那个 这里 那里 哪里 多少 几点 天气 老师 学生 医生 公司 医院 银行 超市 餐厅 火车 飞机 地铁 出租车 水果 蔬菜 米饭 面条 咖啡 音乐 电影 电视 游戏 文件 文档 照片 视频 消息 邮件 密码 账号 设置 搜索 应用 软件 信息 服务 重要 可能 需要 不同 大家 孩子 男人 女人 名字 号码 地址 日期 价格 钱 商店 礼物 假期 旅行 海边 山 花 树 动物 小猫 小狗 鸟`
};
const KP = { uid: '', loaded: false, on: true, offT: 0, clr: 0, w: Object.create(null), ldirty: false, cdirty: false, lt: 0, ct: 0, busy: false, st: '' };
const kpNow = () => Math.floor(Date.now() / 1000);   // secondes
const kpCJ = l => l === 'zh' || l === 'ja';
const kpFold = (s, l) => { s = s.toLowerCase(); return KP_LATIN.has(l) ? s.normalize('NFD').replace(/\p{Mn}/gu, '') : s; };
const kpActive = () => KP.on && KP.loaded && !!SESSION && KP.uid === SESSION.user.id;
const kpCount = () => { let n = 0; for (const l in KP.w) n += Object.keys(KP.w[l]).length; return n; };
const kpData = () => { const w = {}; for (const l in KP.w) w[l] = KP.w[l]; return { v: 1, off: !KP.on, offT: KP.offT, clr: KP.clr, w }; };
const kpSig = d => { let n = 0, s = 0, t = 0; for (const l in d.w) for (const k in d.w[l]) { n++; s += d.w[l][k][0]; t = Math.max(t, d.w[l][k][1]); } return [n, s, t, d.clr, d.offT].join(':'); };
function kpReset() { clearTimeout(KP.lt); clearTimeout(KP.ct); KP.uid = ''; KP.loaded = false; KP.on = true; KP.offT = 0; KP.clr = 0; KP.w = Object.create(null); KP.ldirty = KP.cdirty = false; KP.busy = false; KP.st = ''; }
/* Données reçues (stockage local ou cloud) : jamais crues sur parole */
function kpClean(b) {
  const o = { off: false, offT: 0, clr: 0, w: Object.create(null) }; if (!b || typeof b !== 'object') return o;
  const int = (v, mx) => Number.isInteger(v) && v >= 0 && v <= mx ? v : 0;
  o.off = b.off === true; o.offT = int(b.offT, 4e9); o.clr = int(b.clr, 4e9);
  if (b.w && typeof b.w === 'object') for (const l of Object.keys(b.w)) {
    if (typeof KBL !== 'object' || !KBL[l] || !b.w[l] || typeof b.w[l] !== 'object') continue;
    const m = Object.create(null); let n = 0;
    for (const k of Object.keys(b.w[l])) {
      const e = b.w[l][k]; if (!KP_OK.test(k) || !Array.isArray(e) || n >= KP_MAX) continue;
      const c = int(e[0], 1e6), t = int(e[1], 4e9); if (c < 1) continue;
      m[k] = [c, t]; n++;
    }
    o.w[l] = m;
  }
  return o;
}
function kpPrune() {
  const all = []; for (const l in KP.w) for (const k in KP.w[l]) all.push([l, k, KP.w[l][k]]);
  if (all.length <= KP_MAX) return;
  all.sort((a, b) => b[2][0] - a[2][0] || b[2][1] - a[2][1]);
  for (const [l, k] of all.slice(KP_KEEP)) delete KP.w[l][k];
}
function kpMerge(raw) {
  const b = kpClean(raw);
  if (b.clr > KP.clr) { KP.clr = b.clr; for (const l in KP.w) for (const k of Object.keys(KP.w[l])) if (KP.w[l][k][1] < KP.clr) delete KP.w[l][k]; }
  if (b.offT > KP.offT) { KP.offT = b.offT; KP.on = !b.off; }
  for (const l in b.w) {
    const m = KP.w[l] || (KP.w[l] = Object.create(null));
    for (const k in b.w[l]) {
      const e = b.w[l][k]; if (e[1] < KP.clr) continue;
      const x = m[k]; m[k] = x ? [Math.max(x[0], e[0]), Math.max(x[1], e[1])] : [e[0], e[1]];
    }
  }
  kpPrune();
}
const kpPath = uid => BK_DIR + '/sormick-' + uid + '.mots.json';
async function kpSaveLocal() {
  if (!SESSION || KP.uid !== SESSION.user.id) return;
  const key = SESSION.key, uid = KP.uid; KP.ldirty = false;
  try { localStorage.setItem('vd2.kw.' + uid, await seal(key, kpData(), uid)); } catch { /* stockage plein ou indisponible : les mots restent en mémoire */ }
}
function kpSched() { clearTimeout(KP.lt); KP.lt = setTimeout(kpSaveLocal, 800); clearTimeout(KP.ct); KP.ct = setTimeout(kpSync, 25000); }
async function kpFlush() { clearTimeout(KP.lt); clearTimeout(KP.ct); if (KP.ldirty) await kpSaveLocal(); if (KP.cdirty) await kpSync(); }
function kpLock() {   // session fermée : dernier enregistrement local (chiffré), puis la mémoire est vidée
  try { if (SESSION && KP.loaded && KP.uid === SESSION.user.id && KP.ldirty) { const uid = KP.uid; seal(SESSION.key, kpData(), uid).then(s => { try { localStorage.setItem('vd2.kw.' + uid, s); } catch { /* facultatif */ } }).catch(() => {}); } } catch { /* facultatif */ }
  kpReset();
}
async function kpLoadNow() {   // lit les mots enregistrés sur cet appareil
  const id = SESSION && SESSION.user && SESSION.user.id; if (!id) return false;
  if (KP.uid !== id) { kpReset(); KP.uid = id; }
  if (!KP.loaded) {
    try { const raw = localStorage.getItem('vd2.kw.' + id); if (raw) kpMerge(await unseal(SESSION.key, raw, id)); } catch { /* illisible (ancien mot de passe) : on repart de zéro */ }
    if (!SESSION || KP.uid !== id) return false;
    KP.loaded = true;
  }
  return true;
}
async function kpInit() { if (!(await kpLoadNow())) return; kpStatus(); kbSug(); kpSync(); }
async function kpRekey() { if (KP.loaded && SESSION && KP.uid === SESSION.user.id) { KP.ldirty = true; KP.cdirty = true; await kpSaveLocal(); kpSync(); } }   // mot de passe changé : mots rechiffrés avec la nouvelle clé
/* Cloud : lecture, fusion, puis envoi si quelque chose a changé */
async function kpSync() {
  const c = typeof bkConn === 'function' ? bkConn() : null;
  if (!c) { KP.st = 'nocloud'; kpStatus(); return; }
  if (!SESSION || !KP.loaded || KP.busy || KP.uid !== SESSION.user.id) return;
  KP.busy = true; KP.cdirty = false;
  const uid = KP.uid, key = SESSION.key, path = kpPath(uid);
  try {
    let remote = null;
    try {
      const txt = await (await FS.read(c, path, 'application/json')).text();
      try { const o = JSON.parse(txt); if (o && o.format === 'sormick-mots' && typeof o.d === 'string') remote = kpClean(await unseal(key, o.d, uid)); } catch { remote = null; }   // fichier abîmé ou chiffré avec un ancien mot de passe : remplacé
    } catch (e) { if (!(e && e.code === 'path' && /404/.test(String(e.message)))) throw e; }   // 404 = pas encore de fichier ; toute autre erreur = on réessaie plus tard sans rien écraser
    if (!SESSION || KP.uid !== uid) return;
    const s0 = kpSig(kpData());
    if (remote) kpMerge(remote);
    const now = kpData(), s1 = kpSig(now);
    if (s1 !== s0) { KP.ldirty = true; kpSaveLocal(); }
    if (!remote || s1 !== kpSig(remote)) {
      try { await FS.mkdir(c, BK_DIR); } catch (e) { if (!/existe déjà/.test(String(e && e.message))) throw e; }
      await FS.write(c, path, new Blob([JSON.stringify({ format: 'sormick-mots', v: 1, id: uid, d: await seal(key, now, uid) })], { type: 'application/json' }));
    }
    KP.st = 'ok';
  } catch { KP.st = 'err'; KP.cdirty = true; }
  finally { KP.busy = false; kpStatus(); kbSug(); }
}
function kpAdd(l, w) {
  if (!kpActive() || !KBL[l]) return;
  const m = KP.w[l] || (KP.w[l] = Object.create(null)), e = m[w];
  m[w] = e ? [Math.min(e[0] + 1, 1e6), kpNow()] : [1, kpNow()];
  KP.ldirty = KP.cdirty = true; kpPrune(); kpSched();
}
function kpClear() { KP.w = Object.create(null); KP.clr = kpNow(); KP.ldirty = KP.cdirty = true; kpFlush(); kpStatus(); kbSug(); }   // tout ce qui date d'avant est effacé sur les autres appareils aussi
function kpSetOn(v) { KP.on = v; KP.offT = kpNow(); KP.ldirty = KP.cdirty = true; kpSched(); kpStatus(); kbSug(); }
/* Champs où l'on n'apprend ni ne suggère rien : mots de passe, nombres, e-mail, téléphone, codes, cartes */
function kpBlocked(t) {
  if (!t || t.nodeType !== 1) return true;
  if (t === KB.zone) return false;
  if (/^(password|email|number|tel|url|date|datetime-local|time|month|week|color|range)$/i.test(t.type || '')) return true;
  if (/^(numeric|decimal|tel|email|url)$/i.test(t.getAttribute('inputmode') || '')) return true;
  if (/(^|\s)(cc-|one-time|current-password|new-password|username|email|tel)/i.test(t.getAttribute('autocomplete') || '')) return true;
  if (t.hasAttribute('data-nopredict')) return true;
  return /pass|mdp|mot de passe|pwd|\bpin\b|secret|token|jeton|iban|card|carte|cvv/i.test([t.name, t.id, t.getAttribute('aria-label'), t.placeholder].join(' '));
}
function kpBefore(t) {   // texte juste avant le curseur (80 caractères au plus)
  try {
    if (t.isContentEditable) { const s = t.ownerDocument.defaultView.getSelection(); if (!s || !s.rangeCount || !s.anchorNode || s.anchorNode.nodeType !== 3) return ''; return s.anchorNode.data.slice(Math.max(0, s.anchorOffset - 80), s.anchorOffset); }
    const p = t.selectionStart; if (p === null || p === undefined) return null;
    return t.value.slice(Math.max(0, p - 80), p);
  } catch { return null; }
}
/* Apprentissage : le mot qui vient d'être terminé (espace, Entrée, ponctuation) */
function kpLearnBefore(t) {
  if (!kpActive() || kpBlocked(t)) return;
  const b = kpBefore(t); if (!b) return;
  const m = KP_RE.exec(b); if (!m) return;
  const L = KB.lang, ch = [...m[1]];
  let w = kpCJ(L) ? ch.slice(-8).join('') : m[1];
  const n = [...w].length;
  if (n < 2 || n > 24 || (!kpCJ(L) && ch.length > 24)) return;
  const low = w.toLowerCase(), up = w.toUpperCase();
  if (w === up && w !== low) return;   // MOTS EN MAJUSCULES : pas appris
  const pre = b.slice(0, b.length - m[1].length);
  if (/(^|[.!?¿¡。！？\n])\s*$/.test(pre) && w.slice(1) === low.slice(1) && w[0] !== low[0]) w = low;   // début de phrase : « Bonjour » → « bonjour » (les noms propres gardent leur majuscule)
  kpAdd(L, w);
}
const kpStar = Object.create(null);
function kpStarter(l) {
  if (kpStar[l]) return kpStar[l];
  const seen = new Set(), out = [];
  for (const raw of (KP_WORDS[l] || '').split(/\s+/)) {
    if (!raw) continue;
    const i = raw.indexOf('='), r = i > 0 ? raw.slice(0, i) : raw, s = i > 0 ? raw.slice(i + 1) : raw;
    if (!KP_OK.test(r) || !KP_OK.test(s) || seen.has(r)) continue;
    seen.add(r); out.push({ r, s, f: kpFold(r, l) });
  }
  return kpStar[l] = out;
}
function kpCase(w, pre) {   // reprend la casse de ce qui est tapé : « Bo » → « Bonjour », « BO » → « BONJOUR »
  const c = pre[0]; if (c === c.toLowerCase()) return w;
  return [...pre].length > 1 && pre === pre.toUpperCase() ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1);
}
function kpCands(l, before, max) {
  const m = KP_RE.exec(before); if (!m) return [];
  const learned = KP.w[l] || Object.create(null), ch = [...m[1]], pres = [];
  if (kpCJ(l)) { for (let k = Math.min(4, ch.length); k >= 1; k--) pres.push(ch.slice(-k).join('')); } else pres.push(ch.slice(-24).join(''));
  const out = [], seen = new Set();
  const put = (w, pre) => { const t = kpCase(w, pre), k = t.toLowerCase(); if (t === pre || seen.has(k) || out.length >= max) return; seen.add(k); out.push({ t, w, d: [...pre].length }); };
  for (const pre of pres) {
    const key = kpFold(pre, l), got = [];
    for (const w in learned) { const f = kpFold(w, l); if (f.startsWith(key)) got.push([w, learned[w]]); }
    got.sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1]);
    for (const [w] of got) put(w, pre);
    for (const e of kpStarter(l)) if (e.f.startsWith(key)) put(e.s, pre);
    if (out.length >= max) break;
  }
  return out;
}
function kpPick(c) {
  const t = kbTarget(); if (!t) return;
  for (let i = 0; i < c.d; i++) kbBack(t);
  kbInsert(t, c.t + (kpCJ(KB.lang) ? '' : ' '));
  kpAdd(KB.lang, c.w); kbLabel(); kbSug(); kpStatus();
}
function kbSug() {   // barre de suggestions (3 mots sur smartphone, 5 ailleurs)
  if (!KB.sug) return;
  const on = kpActive(); KB.sug.hidden = !on; if (!on) return;
  const t = kbTarget(); let list = [];
  if (!KB.buf && t && !kpBlocked(t)) { const b = kpBefore(t); if (b) list = kpCands(KB.lang, b, innerWidth < 520 ? 3 : 5); }
  KB.sug.replaceChildren(...list.map(c => kbKey(c.t, () => kpPick(c), 'ks', c.t)));
}
function kpStatus() {
  if (!KB.ps) return;
  KB.ps.hidden = !kpActive(); if (!kpActive()) return;
  const st = { ok: 'cloud synchronisé', nocloud: 'cloud non connecté', err: 'cloud : erreur, nouvel essai plus tard' }[KP.st] || '';
  KB.ps.textContent = tr('Mots appris :') + ' ' + kpCount() + (st ? ' · ' + tr(st) : '');
}
