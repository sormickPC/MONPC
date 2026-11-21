# Virtual Desktop

Bureau virtuel web : fenêtres, App Store de raccourcis, WebDAV/SFTP, lecteur de musique, éditeur de texte enrichi.

## Fichiers (tous à la racine du dépôt)
`index.html`, `app.js`, `style.css` : l'application (GitHub Pages). `server.js` + `package.json` : proxy optionnel (SFTP, sites bloquant les iframes).

## Publier sur GitHub Pages
Settings → Pages → *Deploy from a branch* → `main` / `/ (root)`. L'application s'ouvre sur `https://<utilisateur>.github.io/<dépôt>/` (et non sur la page du dépôt).

## Confidentialité (dépôt public)
- Le dépôt ne contient **aucun** identifiant, mot de passe, hôte ni fichier personnel : uniquement du code.
- Vos données (connexions WebDAV/SFTP sans mot de passe, raccourcis, playlists, documents) restent dans **le navigateur de l'utilisateur** (`localStorage`) et ne sont jamais envoyées à GitHub. Chaque visiteur du site voit son propre bureau, vide au départ.
- Les mots de passe ne sont jamais enregistrés (mémoire de session) ; le jeton du proxy reste en `sessionStorage`.
- Le proxy se configure uniquement par variables d'environnement (jamais dans un fichier du dépôt) : `PROXY_TOKEN`, `ALLOWED_ORIGIN`, etc. `.gitignore` bloque `.env`, clés et `*.txt`.
- Sur un ordinateur partagé, videz les données du site (cadenas du navigateur → Effacer les données) après usage.

## Proxy (optionnel)
```bash
npm install
PROXY_TOKEN="$(openssl rand -hex 24)" ALLOWED_ORIGIN="https://<utilisateur>.github.io" npm start
```
À placer derrière HTTPS. Variables : `PORT`, `ALLOW_PRIVATE_HOSTS`, `SFTP_HOSTS`. Empreinte SFTP : `ssh-keyscan -t ed25519 hôte | ssh-keygen -lf - -E sha256`.
Limites : sans proxy, WebDAV exige le CORS côté serveur et SFTP est indisponible.
