# Virtual Desktop

Bureau virtuel web : fenêtres, barre des tâches, App Store de raccourcis web, stockages WebDAV/SFTP, lecteur de musique avec playlists, vidéo/images/PDF, éditeur de texte enrichi, fond d'écran persistant.

## Structure
```
index.html        application complète (HTML + CSS + JS, sans dépendance)
server/           proxy/passerelle optionnel (Node 18+)
```

## Ce qui fonctionne 100 % côté client (GitHub Pages)
- Bureau, fenêtres, App Store, « Mes apps », fond d'écran, éditeur, lecteurs, fichiers locaux.
- Raccourcis en iframe directe, avec bouton de repli « Ouvrir dans un onglet ».
- WebDAV **si** le serveur autorise le CORS.
- Persistance : `localStorage` (mots de passe jamais stockés, conservés en mémoire de session).

## Ce qui nécessite le proxy (`server/`)
- Contournement de `X-Frame-Options` / `frame-ancestors` (`/proxy`), avec repli automatique en nouvel onglet si le site est injoignable.
- WebDAV sans CORS, et **SFTP** (impossible depuis un navigateur).
```bash
cd server && npm install && npm start      # http://localhost:8787
```
Puis : Réglages → URL du proxy. Variables : `PORT`, `PROXY_TOKEN`, `ALLOWED_ORIGIN`, `ALLOW_PRIVATE=1`.
⚠ Depuis une page HTTPS (GitHub Pages), le proxy doit lui aussi être en HTTPS. Ne l'exposez pas publiquement sans protection : il relaie des requêtes sortantes (les adresses privées sont bloquées par défaut).

## Règles App Store
Retirer du bureau ≠ supprimer : seul « Supprimer » (App Store) efface définitivement l'app du bureau, de l'App Store et de « Mes apps ».

## Déploiement
GitHub Pages : Settings → Pages → branche `main`, dossier racine.
