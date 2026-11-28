'use strict';
/* Configuration publique. Aucun secret ici : le dépôt est public.
   - CONTACT : adresse de contact, jamais affichée dans l'interface (le lien « Contactez-moi » ouvre un e-mail).
   - RELAY_URL : vide par défaut. L'adresse du relais (Cloudflare Worker) et son jeton secret se saisissent dans l'application, pas ici.
   L'adresse de contact est seulement masquée (inversée + base64) pour échapper aux robots ; ce n'est PAS un chiffrement : un navigateur doit
   pouvoir les lire pour fonctionner. La protection réelle est que rien de confidentiel ne figure dans le dépôt. */
const dec = s => [...atob(s)].reverse().join('');
const CONTACT = { to: () => dec('ZW0udHhuaUBrY2ltcm9z') };
const RELAY_URL = '';   // laissé vide : l'adresse et le jeton du relais se saisissent une fois dans l'application (Stockages → Relais), chiffrés dans votre profil
