# sormick Cloud — PC virtuel

Un mini Windows dans le navigateur : bureau, barre des tâches, App Store de raccourcis web, stockages WebDAV, lecteur de musique, éditeur de texte enrichi, plusieurs utilisateurs.
Tout fonctionne **sur GitHub Pages, sans serveur**. Seul SFTP demande un petit relais (voir plus bas).

## Fichiers (tous à la racine du dépôt)
| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `vault.js`, `app.js` | l'application (obligatoires) |
| `wallpaper.jpg` | **fond d'écran par défaut** : ajoutez simplement votre image sous ce nom (sans elle, un dégradé est utilisé) |
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

## WebDAV sans proxy
Le navigateur contacte directement votre serveur. Il faut donc :
1. une adresse **HTTPS** avec un certificat valide ;
2. que le serveur **autorise CORS** pour l'origine de votre site (`https://<utilisateur>.github.io`).

Exemple nginx devant votre WebDAV :
```nginx
location /dav/ {
  if ($request_method = OPTIONS) {
    add_header Access-Control-Allow-Origin  "https://<utilisateur>.github.io" always;
    add_header Access-Control-Allow-Methods "GET, PUT, PROPFIND, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Depth, Content-Type" always;
    add_header Access-Control-Max-Age 86400 always;
    return 204;
  }
  add_header Access-Control-Allow-Origin "https://<utilisateur>.github.io" always;
  # ... votre configuration WebDAV habituelle
}
```
N'autorisez que **votre** origine (pas `*`). Si la connexion échoue, l'application l'indique et ne bascule jamais vers un nouvel onglet pour les stockages.

## SFTP
Un navigateur ne sait pas parler SFTP : c'est impossible sans relais, même sur un hébergement 100 % statique. Deux solutions :
- **Sans passerelle personnalisée (recommandé)** : exposez votre SFTP en WebDAV avec [rclone](https://rclone.org), puis ajoutez-le comme un stockage WebDAV, par exemple
  `rclone serve webdav sftp:dossier --addr 127.0.0.1:8080 --user NOM --pass MOTDEPASSE --allow-origin https://<utilisateur>.github.io`
  (à placer derrière HTTPS ; vérifiez les options avec `rclone serve webdav --help`).
- **Passerelle fournie** (`server.js`, Node ≥ 20) : voir ci-dessous. Elle exige un jeton, l'empreinte du serveur SSH et confine les chemins.

## Applications dans le bureau
Chaque application s'ouvre au choix **dans une fenêtre** ou **dans un nouvel onglet**. Sans passerelle, l'intégration dépend du site : beaucoup de sites (Google, YouTube, GitHub, Wikipédia, réseaux sociaux…) l'interdisent. L'application connaît une liste de ces sites et les ouvre automatiquement dans un onglet ; pour les autres, la fenêtre contient toujours un bouton « Ouvrir dans un onglet ». Les sites en `http://` sont ouverts dans un onglet.
Icônes : détectées depuis le site (`/favicon.ico`, puis le service d'icônes DuckDuckGo, désactivable dans Réglages), ou importées par vous.

## Passerelle facultative
```bash
npm install
PROXY_TOKEN="$(openssl rand -hex 24)" ALLOWED_ORIGIN="https://<utilisateur>.github.io" npm start
```
À placer derrière HTTPS, puis : *Réglages → Passerelle* (adresse + jeton, chiffrés dans votre profil). Variables : `PORT`, `ALLOW_PRIVATE_HOSTS` (ex. `nas.local`), `SFTP_HOSTS` (liste blanche). Empreinte SFTP : `ssh-keyscan -t ed25519 hôte | ssh-keygen -lf - -E sha256`.
Elle ajoute : SFTP, WebDAV sans CORS, et affichage dans le bureau de certains sites qui interdisent l'intégration (relais, avec des limites : seuls les clics sur liens sont réécrits).

## Sécurité du code
CSP stricte (pas de script inline), aucune donnée externe injectée via `innerHTML` (le HTML de l'éditeur passe par une liste blanche), adresses limitées à http(s), iframes en `sandbox`, fichiers lus en blob avec type MIME imposé, enregistrements chiffrés avec un nouvel IV à chaque écriture et authentifiés (toute modification du fichier est détectée), ralentissement après échecs de connexion.
