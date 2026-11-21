# sormick Cloud — PC virtuel

Un mini Windows dans le navigateur : bureau, barre des tâches, App Store de raccourcis web, stockages WebDAV, lecteur de musique, éditeur de texte enrichi, plusieurs utilisateurs.
Tout fonctionne **sur GitHub Pages, sans serveur**. Seul SFTP demande un petit relais (voir plus bas).

## Fichiers (tous à la racine du dépôt)
| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `config.js`, `vault.js`, `app.js` | l'application (obligatoires) |
| `wallpaper.jpg` | **fond d'écran par défaut de tous les utilisateurs** (photo de nuit étoilée). Chaque utilisateur peut choisir un autre fond : il est alors enregistré pour lui seul. Sans ce fichier, un dégradé est utilisé |
| `.nojekyll`, `.gitignore` | confort GitHub Pages / protection contre l'envoi de secrets |
| `server.js`, `package.json` | passerelle **facultative** (SFTP, sites qui interdisent l'intégration) |

## Publier
Settings → Pages → *Deploy from a branch* → `main` / `/ (root)`. Le site s'ouvre sur `https://<utilisateur>.github.io/<dépôt>/` (pas sur la page du dépôt).

## Utilisateurs et confidentialité (dépôt public)
- Le dépôt ne contient **que du code** : aucune donnée personnelle.
- Chaque utilisateur a son bureau, ses raccourcis de bureau, son fond, ses connexions WebDAV/SFTP, ses playlists et ses documents. Le **catalogue du App Store est commun** à tous les utilisateurs de l'appareil.
- Les données d'un utilisateur sont **chiffrées dans le navigateur** (AES-256-GCM). La clé est dérivée de son mot de passe (PBKDF2-SHA256, 600 000 itérations, sel aléatoire) et n'existe qu'en mémoire pendant la session. Les mots de passe WebDAV/SFTP sont dans ce profil chiffré : une fois enregistrés, ils ne sont plus redemandés.
- Sont stockés **en clair** sur l'appareil : le catalogue d'applications (noms, adresses, descriptions) et la liste des noms d'utilisateurs. Ne mettez rien de confidentiel dans une description d'application.
- Le mot de passe d'un utilisateur **ne peut pas être récupéré** (il n'existe aucun serveur). En cas d'oubli, le profil est perdu.
- Les données restent **dans le navigateur de cet appareil**. Pour les déplacer : *Mon compte → Exporter mon profil* (fichier chiffré), puis *Importer un profil* sur l'écran de connexion.
- Verrouillage automatique après inactivité (réglable). Sur un ordinateur partagé, verrouillez la session ou videz les données du site.
- Limite honnête : ce n'est pas une protection contre quelqu'un qui contrôle déjà votre navigateur ou votre ordinateur ; choisissez un mot de passe long.

## WebDAV : adresse + utilisateur + mot de passe
Dans *Stockage cloud*, trois champs suffisent : l'adresse du serveur, l'utilisateur, le mot de passe. L'application teste la connexion, l'enregistre (chiffrée) et ouvre l'explorateur ; vous ne la ressaisissez plus jamais. Le nom est déduit de l'adresse (modifiable dans *Options*). `https://` est ajouté si vous l'oubliez.

**Ce que le navigateur impose (et qu'aucun site ne peut contourner sans relais).** Un site ne peut lire un autre serveur que si celui-ci l'y autorise (règle CORS). Il faut donc, **une seule fois, côté serveur** :
1. une adresse **HTTPS** avec un certificat valide ;
2. l'origine `https://<utilisateur>.github.io` autorisée (exactement, pas de `/` final), méthodes `GET, PUT, PROPFIND, OPTIONS`, en-têtes `Authorization, Depth` ;
3. une réponse `OPTIONS` **2xx sans mot de passe**, et ces mêmes en-têtes CORS sur les réponses normales (207, 200).

L'application envoie volontairement le strict minimum d'en-têtes (`Authorization`, `Depth`) : chaque en-tête de plus doit être autorisé par le serveur et fait échouer la connexion.
Quand ça échoue, elle fait le diagnostic : *serveur injoignable* (adresse, réseau, certificat), *CORS non autorisé*, *identifiants refusés (401)*, *dossier introuvable (404)*. Le bouton **Comment autoriser ce site** affiche un extrait prêt à copier (Nginx, Apache, Caddy, rclone, Nextcloud, autre) avec votre origine déjà renseignée.

Exemple nginx :
```nginx
location /dav/ {
  if ($request_method = OPTIONS) {
    add_header Access-Control-Allow-Origin  "https://<utilisateur>.github.io" always;
    add_header Access-Control-Allow-Methods "GET, PUT, PROPFIND, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Depth" always;
    add_header Access-Control-Max-Age 86400 always;
    return 204;
  }
  add_header Access-Control-Allow-Origin "https://<utilisateur>.github.io" always;
  # ... votre configuration WebDAV habituelle
}
```
N'autorisez que **votre** origine (pas `*`). Les stockages ne s'ouvrent jamais dans un nouvel onglet.
Nextcloud : adresse `https://VOTRE-CLOUD/remote.php/dav/files/VOTRE-NOM/`, un « mot de passe d'application », et l'application *WebAppPassword* pour l'origine autorisée.

## SFTP : ce qui est possible
Le SFTP est un protocole SSH, pas une requête web : **aucun navigateur ne peut l'ouvrir directement, et aucun site statique (GitHub Pages) non plus**, quel que soit le code. Les gestionnaires de fichiers analysés (Filestash, Alist/OpenList, sftp-browser, sftpbox) utilisent tous un serveur intermédiaire. Sans relais, l'application l'explique au lieu de proposer un faux formulaire. Deux voies :
- **La plus simple** : exposer le même dossier en WebDAV et le connecter comme ci-dessus. SFTPGo propose SFTP et WebDAV sur les mêmes comptes ; ou rclone relaie un SFTP existant :
  `rclone serve webdav monsftp:/ --addr :8443 --user NOM --pass MOTDEPASSE --allow-origin https://<utilisateur>.github.io --cert cert.pem --key cle.pem`
  (créez d'abord le remote `monsftp` avec `rclone config` ; vérifiez les options avec `rclone serve webdav --help`).
- **Passerelle fournie** (`server.js`, Node ≥ 20) : voir plus bas. Elle exige un jeton, l'empreinte du serveur SSH et confine les chemins. Une fois renseignée dans *Réglages*, le formulaire SFTP (hôte, port, utilisateur, mot de passe, empreinte) apparaît.

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
À placer derrière HTTPS, puis : *Réglages → Passerelle* (adresse + jeton, chiffrés dans votre profil). Variables : `PORT`, `ALLOW_PRIVATE_HOSTS` (ex. `nas.local`), `SFTP_HOSTS` (liste blanche). Empreinte SFTP : `ssh-keyscan -t ed25519 hôte | ssh-keygen -lf - -E sha256`.
Elle ajoute : SFTP, WebDAV sans CORS, et affichage dans le bureau de certains sites qui interdisent l'intégration (relais, avec des limites : seuls les clics sur liens sont réécrits).

## Sécurité du code
CSP stricte (pas de script inline), aucune donnée externe injectée via `innerHTML` (le HTML de l'éditeur passe par une liste blanche), adresses limitées à http(s), iframes en `sandbox`, fichiers lus en blob avec type MIME imposé, enregistrements chiffrés avec un nouvel IV à chaque écriture et authentifiés (toute modification du fichier est détectée), ralentissement après échecs de connexion.
