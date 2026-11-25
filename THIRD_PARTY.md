# Bibliothèques incluses (copiées telles quelles, sans modification)

| Fichier | Projet | Version | Licence | Usage |
|---|---|---|---|---|
| `pdfjs.js`, `pdfjs-worker.js` | [PDF.js](https://github.com/mozilla/pdf.js) (`pdf.min.mjs`, `pdf.worker.min.mjs`) | 6.2.108 | Apache-2.0 | affichage des PDF dans le Lecteur de documents |
| `jszip.min.js` | [JSZip](https://github.com/Stuk/jszip) | 3.10.1 | MIT (ou GPL-3.0) | ouverture des fichiers .docx, .xlsx, .pptx, .odt, .ods, .odp (archives ZIP) |

Elles sont servies par votre propre site (aucun CDN) et ne sont chargées que lorsqu'un document est ouvert.

# Services et données externes (appelés par votre navigateur, rien n'est copié dans le dépôt)

| Service | Usage | Remarque |
|---|---|---|
| [Radio Browser](https://www.radio-browser.info) | annuaire des radios (Sormick Radio) | base communautaire libre, interrogée en direct |
| [iptv-org/iptv](https://github.com/iptv-org/iptv) | listes M3U publiques (Sormick TV) | licence CC0 ; seuls les noms des listes sont dans `iptvdata.js` |
| IMDb (suggestions publiques) | affiches des films (Lecteur vidéo) | usage personnel ; les images appartiennent à IMDb ; le titre cherché est envoyé à imdb.com |
| OpenSubtitles | sous-titres (facultatif) | compte et clé API de l'utilisateur |

Icônes : tracés [Feather](https://feathericons.com) (MIT).


## LRCLIB (paroles)
Service en ligne utilisé par Sormick Radio pour chercher les paroles : https://lrclib.net (base de paroles libre et gratuite, sans clé). L'application n'y envoie que le texte « artiste / titre » cherché. Aucun code de ce projet n'est intégré.
