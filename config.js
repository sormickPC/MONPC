'use strict';
/* Configuration du formulaire « Contactez-moi ».
   L'adresse du destinataire n'est jamais affichée dans l'interface. Elle est seulement encodée ici (inversée + base64) pour ne pas
   apparaître en clair dans le code : ce n'est PAS un chiffrement, quelqu'un qui lit ce fichier peut la retrouver.
   Pour la cacher vraiment : faites un premier envoi, activez le formulaire via l'e-mail de confirmation de FormSubmit, puis
   remplacez la valeur ci-dessous par l'alias aléatoire qu'il vous donne (voir README). */
const CONTACT = {
  endpoint: () => 'https://formsubmit.co/ajax/' + [...atob('ZW0udHhuaUBrY2ltcm9z')].reverse().join('')
};

/* Relais WebDAV (facultatif) : adresse de votre Worker Cloudflare après l'avoir déployé (voir README, « Relais »).
   Exemple : const RELAY_URL = 'https://sormick-relais.votrecompte.workers.dev';
   Laissé vide, l'application se connecte directement aux serveurs WebDAV (ceux-ci doivent alors autoriser CORS). */
const RELAY_URL = 'https://sormick-relais.micky75016.workers.dev';
