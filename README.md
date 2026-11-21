# sormick Cloud — PC virtuel

Un mini Windows dans le navigateur : bureau, barre des tâches, App Store, stockages WebDAV, lecteurs intégrés (musique, vidéo + sous-titres, documents Office/PDF/TXT, images), éditeur de texte enrichi, plusieurs utilisateurs.
Le site fonctionne **sur GitHub Pages**. Services externes : le **relais Cloudflare** (à vous, pour joindre les WebDAV sans CORS) et, facultatif, OpenSubtitles pour les sous-titres. **SFTP n'est pas pris en charge** : un navigateur ne sait pas parler SFTP ; utilisez WebDAV.

## Fichiers (tous à la racine du dépôt)
| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `config.js`, `vault.js`, `app.js` | l'application (obligatoires) |
| `readers.js`, `docs.js`, `sw.js` | lecteurs (musique, vidéo, images, documents) et lecture en continu depuis WebDAV (obligatoires ; `sw.js` doit rester à la racine) |
| `jszip.min.js`, `pdfjs.js`, `pdfjs-worker.js`, `THIRD_PARTY.md` | bibliothèques **copiées dans le dépôt** (aucun CDN) : JSZip (MIT) et PDF.js (Apache-2.0) |
| `wallpaper.jpg` | **fond d'écran par défaut de tous les utilisateurs** (photo de nuit étoilée). Chaque utilisateur peut choisir un autre fond : il est alors enregistré pour lui seul. Sans ce fichier, un dégradé est utilisé |
| `.nojekyll`, `.gitignore` | confort GitHub Pages / protection contre l'envoi de secrets |
| `worker.js` | **relais WebDAV** (Cloudflare Workers, gratuit) : se connecter à un WebDAV tiers sans aucun réglage sur ce serveur (voir « Relais »). Il ne tourne pas sur GitHub : il se colle dans Cloudflare |
| `server.js`, `package.json` | passerelle **facultative** auto-hébergée (sites qui interdisent l'intégration, WebDAV sans CORS) |

## Publier
Settings → Pages → *Deploy from a branch* → `main` / `/ (root)`. Le site s'ouvre sur `https://<utilisateur>.github.io/<dépôt>/` (pas sur la page du dépôt).

## Utilisateurs et confidentialité (dépôt public)
- Le dépôt ne contient **que du code** : aucune donnée personnelle.
- Chaque utilisateur a son bureau, ses raccourcis de bureau, son fond, ses connexions WebDAV, ses playlists et ses documents. Le **catalogue du App Store est commun** à tous les utilisateurs de l'appareil.
- Les données d'un utilisateur sont **chiffrées dans le navigateur** (AES-256-GCM). La clé est dérivée de son mot de passe (PBKDF2-SHA256, 600 000 itérations, sel aléatoire) et n'existe qu'en mémoire pendant la session. Les mots de passe WebDAV et OpenSubtitles sont dans ce profil chiffré : une fois enregistrés, ils ne sont plus redemandés.
- Sont stockés **en clair** sur l'appareil : le catalogue d'applications (noms, adresses, descriptions) et la liste des noms d'utilisateurs. Ne mettez rien de confidentiel dans une description d'application.
- Le mot de passe d'un utilisateur **ne peut pas être récupéré** (il n'existe aucun serveur). En cas d'oubli, le profil est perdu.
- Les données restent **dans le navigateur de cet appareil**. Pour les déplacer : *Mon compte → Exporter mon profil* (fichier chiffré), puis *Importer un profil* sur l'écran de connexion.
- Verrouillage automatique après inactivité (réglable). Sur un ordinateur partagé, verrouillez la session ou videz les données du site.
- Limite honnête : ce n'est pas une protection contre quelqu'un qui contrôle déjà votre navigateur ou votre ordinateur ; choisissez un mot de passe long.

## WebDAV : adresse + utilisateur + mot de passe
Dans *Stockage cloud*, trois champs suffisent : l'adresse du serveur, l'utilisateur, le mot de passe. L'application teste la connexion, l'enregistre (chiffrée) et ouvre l'explorateur ; vous ne la ressaisissez plus jamais. Le nom est déduit de l'adresse (modifiable dans *Options*), `https://` est ajouté si vous l'oubliez.
- **Aucun réglage CORS, aucun bouton à cliquer** : l'application essaie d'abord en direct ; si le navigateur refuse, elle **bascule toute seule par le relais** (voir ci-dessous) et s'en souvient pour cette connexion (lecture en continu et envoi de fichiers compris).
- **Site du fournisseur** (*Options*, facultatif) : l'adresse du site officiel de votre cloud. Chaque explorateur et chaque lecteur (musique, vidéo, documents, images, sélecteur cloud) a alors un bouton **Mon cloud (site officiel)** qui l'ouvre dans un nouvel onglet. Seules les adresses `https://` sont acceptées.
- **Explorateur** : cases à cocher, **Supprimer** (un ou plusieurs fichiers/dossiers, avec confirmation explicite ; un dossier est supprimé avec son contenu), **Nouveau dossier**, **Nouveau texte**, **Téléverser ici**, **Raccourci bureau** (icône du stockage sur le bureau). Un clic ouvre le fichier dans le bon lecteur ; si aucun lecteur ne le prend en charge, l'application **demande avant de le télécharger** (rien n'est téléchargé sans accord). Pas de miniatures : la navigation reste rapide. Les boutons « Fichier local » et « Lire le dossier » n'existent que dans les lecteurs concernés.
- Les stockages ne s'ouvrent jamais dans un nouvel onglet ; SFTP n'est pas pris en charge (voir plus bas).
- Diagnostic en cas d'échec : *serveur injoignable* (adresse, réseau, certificat), *identifiants refusés (401)*, *dossier introuvable (404)*. Serveur sur **réseau local** (NAS) : le relais, situé dans le cloud, ne peut pas l'atteindre ; l'accès direct exige alors un réglage CORS côté serveur (origine `https://<utilisateur>.github.io` autorisée, méthodes `GET, PUT, DELETE, MKCOL, PROPFIND, OPTIONS`, en-têtes `Authorization, Depth, Range`).

## Relais : se connecter à un WebDAV tiers sans réglage serveur
Si vous ne contrôlez pas le serveur WebDAV (fournisseur cloud, entreprise, hébergeur), il ne peut pas recevoir le réglage CORS. Solution : un **relais** à vous, déployé **une seule fois** (`worker.js`), qui fait les requêtes à la place du navigateur. Ensuite, chaque utilisateur ne saisit que adresse, nom d'utilisateur et mot de passe.

**Mise en place (≈ 5 minutes, offre gratuite de Cloudflare)** — un tutoriel PDF illustré existe ; en résumé :
1. Compte gratuit sur [cloudflare.com](https://dash.cloudflare.com/sign-up).
2. *Workers & Pages* → *Create* → *Create Worker* → nom au choix → *Deploy*.
3. *Edit code* : tout remplacer par le contenu de `worker.js`, vérifier `const SITE = 'https://…github.io'` (sans `/` final), *Deploy*.
4. Mettre l'adresse du Worker dans `config.js` (`RELAY_URL`).
5. Test : ouvrir l'adresse du Worker dans un onglet : « Relais sormick Cloud : en service. »

**Ce que le relais fait et ne fait pas**
- Il ne répond qu'aux pages de votre site (en-tête `Origin`) et ne relaie que des adresses **https:// publiques** (pas d'IP, pas de `localhost`, pas de réseau privé). Redirections revérifiées, l'identifiant n'est jamais envoyé à un autre hôte.
- Il ne stocke ni ne journalise rien dans son code ; l'en-tête d'identification est transmis tel quel au serveur WebDAV.
- **Limites de sécurité, dites honnêtement** :
  - vos identifiants et vos fichiers **transitent en clair pour le relais** (chiffrés en HTTPS jusqu'à lui et depuis lui) : il appartient à votre compte Cloudflare, vous seul le contrôlez, mais il faut lui faire confiance ;
  - le contrôle `Origin` empêche les *autres sites web* d'utiliser votre relais depuis un navigateur ; il **n'arrête pas** un script qui falsifie cet en-tête : n'importe qui connaissant l'adresse du relais peut consommer votre quota gratuit (environ 100 000 requêtes/jour), sans accéder à vos données. Si cela arrive : changez le nom du Worker, ou ajoutez un jeton secret (amélioration possible) ;
  - ce n'est pas un proxy ouvert : seuls les hôtes publics en https sont atteignables.
- Certains hébergeurs bloquent les adresses de Cloudflare : la connexion échoue alors même avec le relais. Un site peut aussi limiter les échecs de mot de passe : utilisez un mot de passe d'application si le fournisseur en propose.

## Pourquoi pas SFTP ?
SFTP est un protocole SSH, pas une requête web : **aucun navigateur ne peut l'ouvrir**. Il a donc été retiré. Si vos fichiers sont derrière SFTP, exposez le même dossier en WebDAV (SFTPGo propose les deux ; ou `rclone serve webdav monsftp:/ --addr :8443 --user NOM --pass MOTDEPASSE --allow-origin https://<utilisateur>.github.io --cert cert.pem --key cle.pem`, à vérifier avec `rclone serve webdav --help`).

## Applications intégrées (non supprimables)
Toujours présentes dans l'App Store (mention « Non supprimable ») : **Lecteur de musique**, **Lecteur vidéo**, **Lecteur de documents**, **Visionneuse d'images**, **Stockage cloud**, **Éditeur de texte**, **Post-it**. On peut seulement les retirer du bureau puis les y remettre. Chaque lecteur ouvre un fichier **depuis l'appareil** (bouton « Fichier local ») ou **depuis un stockage WebDAV** (bouton « Depuis le cloud… », navigation, sélection multiple). « Lire le dossier » n'existe que dans le lecteur de musique/vidéo/images.
- **Musique** : liste de lecture, **Vider la liste**, lecture en continu. **Pochette** et **paroles** intégrées au MP3 (étiquettes ID3v2.2/2.3/2.4 : titre, artiste, album, image APIC, paroles USLT) : la pochette s'affiche dans le lecteur et le bouton **Paroles** ouvre une nouvelle fenêtre qui suit le titre en cours. Pour un fichier WebDAV, seul le début du fichier est lu (lecture partielle). **MP3 uniquement** (pas FLAC/M4A) ; sans paroles intégrées, l'application l'indique. Aucun service de paroles externe n'est interrogé.
- **Vidéo** : lecture en continu avec déplacement dans la vidéo ; sous-titres `.srt`, `.vtt`, `.ass` chargés à la main, détectés automatiquement s'ils portent le même nom dans le même dossier, décalables de ±0,5 s ; recherche **OpenSubtitles** (compte et clé API gratuits, à saisir dans la fenêtre ; stockés chiffrés dans votre profil). L'accès direct à leur API dépend de leur réglage CORS : **non vérifié** depuis mon environnement (testé avec une API simulée). S'il est refusé, l'application le dit et vous pouvez charger le fichier à la main.
- **Documents** : `.docx`, `.xlsx`, `.pptx`, `.odt/.ods/.odp`, `.txt`, `.md`, `.csv`, `.json`, `.pdf` (PDF.js, mot de passe PDF géré). Affichage simplifié ; anciens formats `.doc/.xls/.ppt/.rtf` à télécharger. Documents convertis sans `innerHTML` ; XML avec DOCTYPE/ENTITY refusé ; limites de taille.
- **Images** : zoom, déplacement, rotation, plein écran, diaporama, glisser-déposer, flèches du clavier.

**Lecture en continu sans proxy** : `sw.js` (service worker de votre propre site) récupère le fichier WebDAV directement, avec vos identifiants gardés **en mémoire seulement**, par morceaux (Range). Si le serveur n'expose pas `Content-Range`, repli automatique sur un téléchargement complet.

## Barre des tâches, bureau, applications web
- **Barre des tâches** : *App Store*, **Applications** (toutes les applications intégrées regroupées dans une seule fenêtre : lecteurs, stockage cloud, éditeur, post-it), *Mes apps* (vos raccourcis web), **IA**, fond d'écran, réglages, à propos.
- **Clic droit sur le bureau** : menu pour ouvrir *Applications*, *Mes apps*, *Applications IA* ou l'*App Store* (ajouter une application). Échap ou un clic ailleurs le ferme.
- **Raccourcis du bureau** : chaque application, chaque stockage WebDAV (« Raccourci sur le bureau »), chaque raccourci web peut être posé sur le bureau ou retiré.
- **Applications IA** : dans l'App Store, choisissez *Type : application IA*. Elle apparaît alors dans la fenêtre du bouton **IA** (et pas dans *Mes apps*). Mêmes modes d'ouverture que les autres apps.
- **Mode d'ouverture** de chaque app web : **automatique** (par défaut), **toujours dans le bureau** ou **toujours dans un onglet**. Un navigateur ne peut pas savoir à l'avance si un site interdit l'affichage intégré (en-têtes `X-Frame-Options` / CSP illisibles) : la détection automatique est une heuristique (sites connus, sites déjà basculés en onglet, adresses `http://`). Ces sites s'ouvrent dans un onglet avec un bouton **Essayer dans le bureau** ; pour les autres, la fenêtre propose toujours *Ouvrir dans un onglet* et *Toujours dans un onglet*.
- Icônes : détectées depuis le site (`/favicon.ico`, puis le service d'icônes DuckDuckGo, désactivable dans Réglages) ou importées par vous.

## Post-it
Le bouton **Post-it** ouvre une fenêtre défilante : on peut en créer beaucoup (300 max) sans encombrer le bureau. Chacun a une couleur et peut être **épinglé sur le bureau** (5 au maximum, déplaçables à la souris ou au clavier, **redimensionnables** avec la poignée en bas à droite, souris ou flèches du clavier ; la taille est enregistrée) ; « détacher » le remet simplement dans la liste. Les post-it sont par utilisateur et **chiffrés** avec le profil.

## Contact
Dans *À propos*, « Contactez-moi. » ouvre simplement votre **application de messagerie** avec un nouvel e-mail adressé au contact : aucun service tiers, aucun formulaire, aucune configuration. L'adresse n'est jamais affichée dans l'interface ; elle n'est présente que **brouillée** dans `config.js` (voir « Ce que contient le dépôt public »).

## Ce que contient le dépôt public (et ce qu'il ne contient pas)
- **Aucun mot de passe, jeton, clé ni donnée d'utilisateur** : tout ce qui est secret (identifiants WebDAV, clé OpenSubtitles, notes, playlists) reste dans le navigateur de chaque utilisateur, chiffré avec son mot de passe.
- `config.js` ne contient que l'adresse du relais et l'adresse de contact, **brouillées** (inversion + base64). C'est de l'**obfuscation, pas du chiffrement** : le navigateur doit pouvoir les lire pour fonctionner, donc la « clé » est forcément dans le code ; quelqu'un de motivé les retrouvera en 1 minute. Cela évite seulement l'aspiration automatique d'adresses e-mail et le repérage par moteur de recherche. La vraie protection est qu'il n'y a **rien de sensible** dans le dépôt : l'adresse du relais et le contact sont des informations publiques par nature (le relais n'accepte que votre site et que des hôtes https publics).
- Quelqu'un qui télécharge le dépôt obtient l'application, pas vos données : sans le mot de passe d'un profil, un profil exporté ou le stockage du navigateur est illisible (AES-256-GCM).
- Avant de publier : vérifiez que `.gitignore` est bien envoyé et ne mettez jamais de mot de passe, de jeton Cloudflare ou de fichier de profil exporté dans le dépôt.

## Passerelle facultative
```bash
npm install
PROXY_TOKEN="$(openssl rand -hex 24)" ALLOWED_ORIGIN="https://<utilisateur>.github.io" npm start
```
À placer derrière HTTPS, puis : *Réglages → Passerelle* (adresse + jeton, chiffrés dans votre profil). Variables : `PORT`, `ALLOW_PRIVATE_HOSTS` (ex. `nas.local`).
Elle ajoute : WebDAV sans CORS (mais sans lecture en continu), et affichage dans le bureau de certains sites qui interdisent l'intégration (relais, avec des limites : seuls les clics sur liens sont réécrits).

## Sécurité du code
CSP stricte (pas de script inline), aucune donnée externe injectée via `innerHTML` (le HTML de l'éditeur passe par une liste blanche), adresses limitées à http(s), iframes en `sandbox`, fichiers lus en blob avec type MIME imposé, enregistrements chiffrés avec un nouvel IV à chaque écriture et authentifiés (toute modification du fichier est détectée), ralentissement après échecs de connexion.
