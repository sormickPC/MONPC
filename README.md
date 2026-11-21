# Virtual Desktop

Bureau virtuel web : fenêtres, barre des tâches, App Store de raccourcis web, WebDAV/SFTP, lecteur de musique + playlists, vidéo/images/PDF/texte, éditeur de texte enrichi, fond d'écran persistant.

```
index.html  css/style.css  js/app.js   client statique (aucune dépendance)
server/                                proxy optionnel Node ≥ 20 (SFTP, iframes bloquées, WebDAV sans CORS)
```

## Client seul (GitHub Pages) vs proxy
| Fonction | Client seul | Avec proxy |
|---|---|---|
| Bureau, App Store, Mes apps, fond, éditeur, lecteurs, fichiers locaux | ✅ | ✅ |
| Raccourcis en fenêtre | iframe directe + repli « nouvel onglet » | détection du blocage, relais `/proxy`, repli onglet automatique |
| WebDAV | si le serveur autorise le CORS | ✅ sans CORS |
| SFTP | ❌ | ✅ |

Déploiement client : Settings → Pages → branche `main`, racine.

## Proxy
```bash
cd server && npm install
PROXY_TOKEN="$(openssl rand -hex 24)" ALLOWED_ORIGIN="https://<user>.github.io" npm start
```
Placez-le derrière un reverse proxy HTTPS (Caddy, nginx) ; il écoute sur 127.0.0.1. Dans l'app : Réglages → URL du proxy + jeton (le jeton reste en `sessionStorage`).
Variables : `PROXY_TOKEN` (≥ 16 car., obligatoire), `ALLOWED_ORIGIN` (obligatoire), `PORT`, `ALLOW_PRIVATE_HOSTS` (ex. `nas.local,192.168.1.10`), `SFTP_HOSTS` (liste blanche), `SFTP_ALLOW_UNVERIFIED=1` (déconseillé).
Empreinte SFTP : `ssh-keyscan -t ed25519 hôte | ssh-keygen -lf - -E sha256` → coller `SHA256:…` dans la connexion.

## Sécurité
- **Client** : CSP stricte (pas de script inline), aucun `innerHTML` sur des données externes, HTML de l'éditeur filtré par liste blanche, URLs limitées à http(s), iframes en `sandbox`, PDF en sandbox sans script, blob URLs révoquées. Mots de passe uniquement en mémoire ; jeton en `sessionStorage`.
- **Proxy** : jeton comparé en temps constant, CORS limité à une origine, limite de débit, anti-SSRF (IP privées bloquées à chaque connexion et chaque redirection), liens `/proxy` signés valables 60 s, contenu relayé servi en `Content-Security-Policy: sandbox` (origine opaque), méthodes/en-têtes WebDAV restreints, SFTP avec empreinte obligatoire et chemins confinés au dossier de base, rien n'est journalisé ni stocké.
- **Limites connues** : les identifiants WebDAV/SFTP transitent par le proxy (utilisez HTTPS) ; le relais d'iframe ne réécrit que les clics sur liens (pas les requêtes XHR/formulaires des sites relayés) ; un site relayé peut ne pas fonctionner pleinement.
