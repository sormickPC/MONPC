'use strict';
/* Configuration publique. Aucun secret ici : le dépôt est public.
   - CONTACT : adresse de contact, jamais affichée dans l'interface (le lien « Contactez-moi » ouvre un e-mail).
   - RELAY_URL : adresse du relais WebDAV (Cloudflare Worker).
   Les deux valeurs sont seulement masquées (inversées + base64) pour échapper aux robots ; ce n'est PAS un chiffrement : un navigateur doit
   pouvoir les lire pour fonctionner. La protection réelle est que rien de confidentiel ne figure dans le dépôt. */
const dec = s => [...atob(s)].reverse().join('');
const CONTACT = { to: () => dec('ZW0udHhuaUBrY2ltcm9z') };
const RELAY_URL = dec('dmVkLnNyZWtyb3cuNjEwNTd5a2NpbS5zaWFsZXIta2NpbXJvcy8vOnNwdHRo');
