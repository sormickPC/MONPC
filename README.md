# sormick Cloud — PC virtuel

Un mini Windows dans le navigateur : bureau, barre des tâches, App Store, stockages WebDAV, lecteurs intégrés (musique, vidéo + sous-titres, documents Office/PDF/TXT, images), éditeur de texte enrichi, plusieurs utilisateurs.
Tout fonctionne **sur GitHub Pages, sans serveur ni service externe** (le seul service externe, facultatif, est OpenSubtitles pour les sous-titres). **SFTP n'est pas pris en charge** : un navigateur ne sait pas parler SFTP ; utilisez WebDAV.

## Fichiers (tous à la racine du dépôt)
| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `config.js`, `vault.js`, `app.js` | l'application (obligatoires) |
| `readers.js`, `docs.js`, `sw.js` | lecteurs (musique, vidéo, images, documents) et lecture en continu depuis WebDAV (obligatoires ; `sw.js` doit rester à la racine) |
| `jszip.min.js`, `pdfjs.js`, `pdfjs-worker.js`, `THIRD_PARTY.md` | bibliothèques **copiées dans le dépôt** (aucun CDN) : JSZip (MIT) et PDF.js (Apache-2.0) |
| `wallpaper.jpg` | **fond d'écran par défaut de tous les utilisateurs** (photo de nuit étoilée). Chaque utilisateur peut choisir un autre fond : il est alors enregistré pour lui seul. Sans ce fichier, un dégradé est utilisé |
| `.nojekyll`, `.gitignore` | confort GitHub Pages / protection contre l'envoi de secrets |
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
Dans *Stockage cloud*, trois champs suffisent : l'adresse du serveur, l'utilisateur, le mot de passe. L'application teste la connexion, l'enregistre (chiffrée) et ouvre l'explorateur ; vous ne la ressaisissez plus jamais. Le nom est déduit de l'adresse (modifiable dans *Options*). `https://` est ajouté si vous l'oubliez.

**Ce que le navigateur impose (et qu'aucun site ne peut contourner sans relais).** Un site ne peut lire un autre serveur que si celui-ci l'y autorise (règle CORS). Il faut donc, **une seule fois, côté serveur** :
1. une adresse **HTTPS** avec un certificat valide ;
2. l'origine `https://<utilisateur>.github.io` autorisée (exactement, pas de `/` final), méthodes `GET, PUT, PROPFIND, OPTIONS`, en-têtes `Authorization, Depth, Range` ;
3. une réponse `OPTIONS` **2xx sans mot de passe**, et ces mêmes en-têtes CORS sur les réponses normales (207, 200, 206) ;
4. pour la **lecture en continu** et le déplacement dans les vidéos/musiques : `Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges`. Sans cela, l'application bascule automatiquement sur un téléchargement complet du fichier (ça marche, mais plus lentement) ;
5. serveur sur le **réseau local** (NAS, `192.168.x.x`) : Chrome demande d'autoriser l'accès au réseau local ; la réponse `OPTIONS` doit contenir `Access-Control-Allow-Private-Network: true`.

**Il n'existe aucun moyen de contourner l'absence de CORS depuis une page web** (ni dans ce code, ni dans un autre) sans relais. Les trois projets étudiés (Tiarait/WebDAV_Client, KeepCoolCH/WebDAVOnlineClient, gtsteffaniak/filebrowser) fonctionnent soit hébergés sur le même domaine que le serveur, soit avec un serveur/relais intermédiaire ; ils n'ont donc pas de « astuce » réutilisable pour un site statique sur un autre domaine.

L'application envoie volontairement le strict minimum d'en-têtes (`Authorization`, `Depth`, et `Range` seulement pour la lecture en continu) : chaque en-tête de plus doit être autorisé par le serveur.
Quand ça échoue, elle fait le diagnostic : *serveur injoignable* (adresse, réseau, certificat), *CORS non autorisé*, *identifiants refusés (401)*, *dossier introuvable (404)*. Le bouton **Comment autoriser ce site** affiche un extrait prêt à copier (Nginx, Apache, Caddy, rclone, Nextcloud, autre) avec votre origine déjà renseignée.

Exemple nginx :
```nginx
location /dav/ {
  if ($request_method = OPTIONS) {
    add_header Access-Control-Allow-Origin  "https://<utilisateur>.github.io" always;
    add_header Access-Control-Allow-Methods "GET, PUT, PROPFIND, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Depth, Range" always;
    add_header Access-Control-Max-Age 86400 always;
    return 204;
  }
  add_header Access-Control-Allow-Origin "https://<utilisateur>.github.io" always;
  add_header Access-Control-Expose-Headers "Content-Length, Content-Range, Accept-Ranges" always;
  # ... votre configuration WebDAV habituelle
}
```
N'autorisez que **votre** origine (pas `*`). Les stockages ne s'ouvrent jamais dans un nouvel onglet.
Nextcloud : adresse `https://VOTRE-CLOUD/remote.php/dav/files/VOTRE-NOM/`, un « mot de passe d'application », et l'application *WebAppPassword* pour l'origine autorisée.

## Pourquoi pas SFTP ?
SFTP est un protocole SSH, pas une requête web : **aucun navigateur ne peut l'ouvrir**. Il a donc été retiré. Si vos fichiers sont derrière SFTP, exposez le même dossier en WebDAV (SFTPGo propose les deux ; ou `rclone serve webdav monsftp:/ --addr :8443 --user NOM --pass MOTDEPASSE --allow-origin https://<utilisateur>.github.io --cert cert.pem --key cle.pem`, à vérifier avec `rclone serve webdav --help`).

## Applications intégrées (non supprimables)
Toujours présentes dans l'App Store, avec la mention « Non supprimable » : **Lecteur de musique**, **Lecteur vidéo**, **Lecteur de documents**, **Visionneuse d'images**. On peut seulement les retirer du bureau puis les y remettre depuis l'App Store. Chacune ouvre un fichier **depuis l'appareil** ou **depuis un stockage WebDAV** (bouton « Depuis le cloud… », navigation dans les dossiers, sélection multiple).
- **Musique** : liste de lecture, bouton **Vider la liste**, retrait titre par titre, ajout depuis le cloud, lecture en continu.
- **Vidéo** : lecture en continu avec déplacement dans la vidéo ; sous-titres `.srt`, `.vtt`, `.ass` chargés à la main (appareil ou cloud), détectés automatiquement s'ils portent le même nom dans le même dossier, décalables de ±0,5 s ; recherche **OpenSubtitles** (compte et clé API gratuits sur opensubtitles.com, à saisir dans la fenêtre ; stockés chiffrés dans votre profil). L'accès direct depuis le navigateur à leur API dépend de leur réglage CORS : je n'ai pas pu le vérifier depuis mon environnement (testé avec une API simulée). S'il est refusé, l'application le dit et vous pouvez télécharger le fichier sur leur site puis le charger à la main.
- **Documents** : `.docx`, `.xlsx`, `.pptx`, `.odt/.ods/.odp`, `.txt`, `.md`, `.csv`, `.json`, `.pdf` (PDF.js, mot de passe PDF géré). Affichage simplifié (pas de mise en page identique à Word) ; les anciens formats `.doc/.xls/.ppt/.rtf` sont à télécharger. Documents convertis sans `innerHTML` ; XML avec DOCTYPE/ENTITY refusé ; limites de taille.
- **Images** : zoom, déplacement, rotation, plein écran, diaporama, glisser-déposer, flèches du clavier.

**Lecture en continu sans proxy** : `sw.js` (service worker de votre propre site) récupère le fichier WebDAV directement, avec vos identifiants gardés **en mémoire seulement**, par morceaux (Range). Si le serveur n'expose pas `Content-Range`, repli automatique sur un téléchargement complet.

## Applications dans le bureau
Chaque application a un mode d'ouverture : **automatique** (par défaut), **toujours dans le bureau** ou **toujours dans un onglet**.
Un navigateur ne peut pas savoir à l'avance si un site interdit l'affichage intégré (les en-têtes `X-Frame-Options` / CSP d'un autre site sont illisibles), donc la détection automatique est une heuristique : liste de sites connus pour l'interdire (Google, YouTube, GitHub, Wikipédia, réseaux sociaux…), sites que vous avez déjà basculés en onglet, et adresses `http://`. Ces sites s'ouvrent directement dans un onglet, avec un bouton **Essayer dans le bureau**. Pour tous les autres, l'app s'ouvre dans une fenêtre qui propose **toujours les deux choix** : *Ouvrir dans un onglet* et *Toujours dans un onglet* (le site est mémorisé pour votre compte).
Icônes : détectées depuis le site (`/favicon.ico`, puis le service d'icônes DuckDuckGo, désactivable dans Réglages), ou importées par vous.

## Post-it
Le bouton **Post-it** ouvre une fenêtre défilante : on peut en créer beaucoup (300 max) sans encombrer le bureau. Chacun a une couleur et peut être **épinglé sur le bureau** (5 au maximum, déplaçables à la souris ou au clavier) ; « détacher » le remet simplement dans la liste. Les post-it sont par utilisateur et **chiffrés** avec le profil.

## Formulaire « Contactez-moi »
Dans *À propos*, « Contactez-moi. » ouvre un formulaire (nom, e-mail, message). L'adresse du destinataire n'apparaît jamais à l'écran. L'envoi utilise le service gratuit [FormSubmit](https://formsubmit.co) depuis le navigateur (pas de serveur à vous).
- **Activation (une fois)** : le tout premier message déclenche un e-mail de confirmation chez le destinataire ; cliquez le lien, puis les messages suivants arrivent normalement.
- **Cacher vraiment l'adresse** : `config.js` ne la contient qu'encodée (inversée + base64), ce qui n'est **pas** un chiffrement. Après l'activation, FormSubmit fournit un alias aléatoire : remplacez-le dans `config.js` (`'https://formsubmit.co/ajax/' + 'ALIAS'`) et plus aucune adresse n'apparaît dans le dépôt.
- Le contenu du message transite par FormSubmit (service tiers) ; ne l'utilisez pas pour des informations confidentielles. Anti-abus minimal : un message toutes les 20 secondes par session.

## Passerelle facultative
```bash
npm install
PROXY_TOKEN="$(openssl rand -hex 24)" ALLOWED_ORIGIN="https://<utilisateur>.github.io" npm start
```
À placer derrière HTTPS, puis : *Réglages → Passerelle* (adresse + jeton, chiffrés dans votre profil). Variables : `PORT`, `ALLOW_PRIVATE_HOSTS` (ex. `nas.local`).
Elle ajoute : WebDAV sans CORS (mais sans lecture en continu), et affichage dans le bureau de certains sites qui interdisent l'intégration (relais, avec des limites : seuls les clics sur liens sont réécrits).

## Sécurité du code
CSP stricte (pas de script inline), aucune donnée externe injectée via `innerHTML` (le HTML de l'éditeur passe par une liste blanche), adresses limitées à http(s), iframes en `sandbox`, fichiers lus en blob avec type MIME imposé, enregistrements chiffrés avec un nouvel IV à chaque écriture et authentifiés (toute modification du fichier est détectée), ralentissement après échecs de connexion.
