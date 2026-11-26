'use strict';
/* Configuration publique. Aucun secret ici : le dépôt est public.
   - CONTACT : adresse de contact, jamais affichée dans l'interface (le lien « Contactez-moi » ouvre un e-mail).
   - RELAY_URL : vide par défaut. L'adresse du relais (Cloudflare Worker) et son jeton secret se saisissent dans l'application, pas ici.
   L'adresse de contact est seulement masquée (inversée + base64) pour échapper aux robots ; ce n'est PAS un chiffrement : un navigateur doit
   pouvoir les lire pour fonctionner. La protection réelle est que rien de confidentiel ne figure dans le dépôt. */
const dec = s => [...atob(s)].reverse().join('');   // (outil de masquage, voir ci-dessus)
/* Adresse de contact : vide dans cette copie publique (le lien « Contactez-moi » de la fenêtre « À propos » est alors masqué).
   Pour en mettre une : CONTACT = { to: () => dec('<votre adresse e-mail écrite à l'envers, puis encodée en base64>') } ou simplement { to: () => 'vous@exemple.org' }. */
const CONTACT = { to: () => '' };
const RELAY_URL = '';   // laissé vide : l'adresse et le jeton du relais se saisissent une fois dans l'application (Stockages → Relais), chiffrés dans votre profil
