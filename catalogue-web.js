'use strict';
/* Catalogue d'applications Web ajouté à l'App Store (sans toucher au code de la boutique).
   Source : AlternativeTo → Parcourir → plateforme « Web » → « Online » (https://alternativeto.net/browse/all/?platform=online, pages 1 à 6, classées par popularité),
   publicités et partenaires sponsorisés exclus, applications sans version Web utilisable dans un navigateur exclues.
   Ces applications apparaissent dans l'App Store (onglet « Apps cloud ») : « Installer » / « Désinstaller » fonctionnent comme pour une application ajoutée à la main.
   Elles sont ajoutées UNE SEULE FOIS par profil (D.seed) : si vous en supprimez une, elle ne revient pas. Les icônes sont celles des sites eux-mêmes (/favicon.ico, sans service tiers).
   Format : [nom, adresse, catégorie, description, ia (1 = rangée dans « IA »)]. */
const SEED_VER = '2026-11-web1';
const SEED_APPS = [
  /* IA */
  ['ChatGPT', 'https://chatgpt.com/', 'IA', 'Assistant IA conversationnel d’OpenAI.', 1],
  ['Claude', 'https://claude.ai/', 'IA', 'Assistant IA d’Anthropic : écriture, analyse, code.', 1],
  ['DeepSeek', 'https://chat.deepseek.com/', 'IA', 'Assistant IA pour répondre, rédiger et résoudre des problèmes.', 1],
  ['Google Gemini', 'https://gemini.google.com/', 'IA', 'Assistant IA de Google pour écrire, planifier et apprendre.', 1],
  ['HuggingChat', 'https://huggingface.co/chat/', 'IA', 'Chatbot IA open source, sans publicité.', 1],
  ['Lumo (Proton)', 'https://lumo.proton.me/', 'IA', 'Assistant IA respectueux de la vie privée, chiffré.', 1],
  ['Perplexity', 'https://www.perplexity.ai/', 'IA', 'Moteur de réponses IA qui cite ses sources.', 1],
  ['Qwen', 'https://chat.qwen.ai/', 'IA', 'Assistant IA basé sur les modèles Qwen d’Alibaba.', 1],
  ['Duck.ai', 'https://duck.ai/', 'IA', 'Discussions IA privées, anonymisées par DuckDuckGo.', 1],

  /* Cloud & stockage */
  ['Dropbox', 'https://www.dropbox.com/', 'Cloud & Stockage', 'Stockage et synchronisation de fichiers en ligne.'],
  ['Google Drive', 'https://drive.google.com/', 'Cloud & Stockage', 'Stockage cloud intégré aux outils Google.'],
  ['Microsoft OneDrive', 'https://onedrive.live.com/', 'Cloud & Stockage', 'Stockage cloud de Microsoft (5 Go gratuits).'],
  ['MEGA', 'https://mega.nz/', 'Cloud & Stockage', 'Stockage cloud chiffré de bout en bout.'],
  ['Filen', 'https://app.filen.io/', 'Cloud & Stockage', 'Stockage cloud allemand à chiffrement zéro connaissance.'],
  ['Proton Drive', 'https://drive.proton.me/', 'Cloud & Stockage', 'Stockage de fichiers chiffré de bout en bout.'],
  ['Nextcloud', 'https://nextcloud.com/', 'Cloud & Stockage', 'Cloud personnel auto-hébergeable : fichiers et collaboration.'],
  ['Ente Photos', 'https://web.ente.io/', 'Cloud & Stockage', 'Sauvegarde et partage de photos chiffrés.'],
  ['Immich', 'https://immich.app/', 'Cloud & Stockage', 'Sauvegarde de photos et vidéos auto-hébergée, avec recherche IA.'],
  ['F-Droid', 'https://f-droid.org/', 'Cloud & Stockage', 'Catalogue d’applications Android libres et open source.'],
  ['Google Play Store', 'https://play.google.com/store', 'Cloud & Stockage', 'Boutique officielle d’applications, jeux et médias Android.'],
  ['PortableApps.com', 'https://portableapps.com/', 'Cloud & Stockage', 'Applications Windows portables pour clé USB.'],

  /* Bureautique, notes et tâches */
  ['ONLYOFFICE', 'https://www.onlyoffice.com/', 'Bureautique', 'Suite bureautique open source : textes, tableurs, présentations.'],
  ['Google Docs', 'https://docs.google.com/', 'Bureautique', 'Traitement de texte en ligne avec travail collaboratif.'],
  ['Microsoft 365', 'https://www.microsoft365.com/', 'Bureautique', 'Word, Excel, PowerPoint et Copilot dans le navigateur.'],
  ['Joplin', 'https://joplinapp.org/', 'Notes & Tâches', 'Prise de notes Markdown open source avec synchronisation.'],
  ['Notion', 'https://www.notion.so/', 'Notes & Tâches', 'Espace de travail : notes, tâches, wikis et bases de données.'],
  ['Google Keep', 'https://keep.google.com/', 'Notes & Tâches', 'Notes, listes et mémos synchronisés.'],
  ['Standard Notes', 'https://app.standardnotes.com/', 'Notes & Tâches', 'Notes chiffrées de bout en bout.'],
  ['Notesnook', 'https://app.notesnook.com/', 'Notes & Tâches', 'Notes open source chiffrées de bout en bout.'],
  ['Evernote', 'https://evernote.com/', 'Notes & Tâches', 'Capture et organisation de notes multi-appareils.'],
  ['Microsoft OneNote', 'https://www.onenote.com/', 'Notes & Tâches', 'Carnet de notes numérique de Microsoft.'],
  ['AFFiNE', 'https://app.affine.pro/', 'Notes & Tâches', 'Espace open source : notes, tâches, tableaux et whiteboard.'],
  ['Trello', 'https://trello.com/', 'Notes & Tâches', 'Gestion de tâches et de projets par tableaux et cartes.'],
  ['Todoist', 'https://app.todoist.com/', 'Notes & Tâches', 'Gestionnaire de tâches multiplateforme.'],
  ['Super Productivity', 'https://app.super-productivity.com/', 'Notes & Tâches', 'Gestionnaire de tâches et suivi du temps, gratuit.'],
  ['Raindrop.io', 'https://app.raindrop.io/', 'Notes & Tâches', 'Gestionnaire de favoris avec synchronisation.'],

  /* Sécurité & confidentialité */
  ['Bitwarden', 'https://vault.bitwarden.com/', 'Sécurité & Confidentialité', 'Gestionnaire de mots de passe open source.'],
  ['LastPass', 'https://lastpass.com/', 'Sécurité & Confidentialité', 'Gestionnaire de mots de passe dans le cloud.'],
  ['1Password', 'https://my.1password.com/', 'Sécurité & Confidentialité', 'Gestionnaire de mots de passe avec alertes de fuite.'],
  ['Proton Pass', 'https://pass.proton.me/', 'Sécurité & Confidentialité', 'Mots de passe chiffrés avec authentificateur intégré.'],
  ['Proton Authenticator', 'https://proton.me/authenticator', 'Sécurité & Confidentialité', 'Authentification à deux facteurs synchronisée.'],
  ['Ente Auth', 'https://auth.ente.io/', 'Sécurité & Confidentialité', 'Authentification à deux facteurs avec sauvegarde chiffrée.'],
  ['addy.io', 'https://app.addy.io/', 'Sécurité & Confidentialité', 'Alias d’e-mail anonymes illimités.'],
  ['NextDNS', 'https://my.nextdns.io/', 'Sécurité & Confidentialité', 'Filtrage DNS : sécurité, blocage des pubs et traqueurs.'],
  ['VirusTotal', 'https://www.virustotal.com/', 'Sécurité & Confidentialité', 'Analyse de fichiers, domaines et adresses contre les malwares.'],
  ['Have I Been Pwned', 'https://haveibeenpwned.com/', 'Sécurité & Confidentialité', 'Vérifie si votre e-mail figure dans une fuite de données.'],
  ['Privacy Guides', 'https://www.privacyguides.org/', 'Sécurité & Confidentialité', 'Guides pour protéger sa vie privée en ligne.'],
  ['PrivacyTools', 'https://www.privacytools.io/', 'Sécurité & Confidentialité', 'Annuaire d’outils et de guides de confidentialité.'],
  ['ToS;DR', 'https://tosdr.org/', 'Sécurité & Confidentialité', 'Résume les conditions d’utilisation des sites.'],

  /* E-mail, agenda et communication */
  ['Gmail', 'https://mail.google.com/', 'E-mail & Agenda', 'Messagerie web de Google.'],
  ['Proton Mail', 'https://mail.proton.me/', 'E-mail & Agenda', 'Messagerie suisse chiffrée de bout en bout.'],
  ['Tuta Mail', 'https://app.tuta.com/', 'E-mail & Agenda', 'E-mail, agenda et contacts chiffrés.'],
  ['Google Agenda', 'https://calendar.google.com/', 'E-mail & Agenda', 'Agenda en ligne synchronisé avec Gmail.'],
  ['Proton Calendar', 'https://calendar.proton.me/', 'E-mail & Agenda', 'Agenda respectueux de la vie privée.'],
  ['Telegram', 'https://web.telegram.org/', 'Communication', 'Messagerie instantanée avec groupes et canaux.'],
  ['Discord', 'https://discord.com/app', 'Communication', 'Discussions texte et vocales par salons.'],
  ['WhatsApp', 'https://web.whatsapp.com/', 'Communication', 'Messagerie avec appels gratuits.'],
  ['Element', 'https://app.element.io/', 'Communication', 'Messagerie chiffrée de bout en bout (protocole Matrix).'],
  ['Matrix', 'https://matrix.org/', 'Communication', 'Protocole ouvert de messagerie fédérée et chiffrée.'],
  ['Jitsi Meet', 'https://meet.jit.si/', 'Communication', 'Visioconférence open source.'],

  /* Réseaux sociaux */
  ['Mastodon', 'https://mastodon.social/', 'Réseaux sociaux', 'Réseau social fédéré, libre et sans publicité.'],
  ['Bluesky', 'https://bsky.app/', 'Réseaux sociaux', 'Réseau social ouvert, plus indépendant des plateformes.'],
  ['Reddit', 'https://www.reddit.com/', 'Réseaux sociaux', 'Actualités et forums par communautés (subreddits).'],
  ['X (Twitter)', 'https://x.com/', 'Réseaux sociaux', 'Réseau de microblogging.'],
  ['Pixelfed', 'https://pixelfed.social/', 'Réseaux sociaux', 'Partage de photos fédéré, sans publicité.'],
  ['Lemmy', 'https://lemmy.world/', 'Réseaux sociaux', 'Forum et agrégateur de liens fédéré, type Reddit.'],
  ['diaspora*', 'https://diasporafoundation.org/', 'Réseaux sociaux', 'Réseau social fédéré axé sur la vie privée.'],

  /* Vidéo, films et musique */
  ['YouTube', 'https://www.youtube.com/', 'Vidéo & Films', 'Publier, regarder et partager des vidéos.'],
  ['Netflix', 'https://www.netflix.com/', 'Vidéo & Films', 'Films et séries en streaming par abonnement.'],
  ['Stremio', 'https://web.stremio.com/', 'Vidéo & Films', 'Centre multimédia : films, séries et modules complémentaires.'],
  ['Plex', 'https://app.plex.tv/', 'Vidéo & Films', 'Serveur multimédia et vidéo gratuite en streaming.'],
  ['PeerTube', 'https://joinpeertube.org/', 'Vidéo & Films', 'Hébergement vidéo décentralisé et fédéré.'],
  ['Odysee', 'https://odysee.com/', 'Vidéo & Films', 'Plateforme vidéo pour créer des chaînes.'],
  ['IMDb', 'https://www.imdb.com/', 'Vidéo & Films', 'Base de données de films et séries, avec critiques.'],
  ['Invidious', 'https://invidious.io/', 'Vidéo & Films', 'Interface YouTube open source, sans publicité.'],
  ['Spotify', 'https://open.spotify.com/', 'Musique', 'Streaming musical avec playlists et podcasts.'],
  ['SoundCloud', 'https://soundcloud.com/', 'Musique', 'Streaming musical communautaire.'],
  ['Deezer', 'https://www.deezer.com/', 'Musique', 'Streaming musical avec grand catalogue.'],
  ['Last.fm', 'https://www.last.fm/', 'Musique', 'Communauté musicale et radio personnalisée.'],
  ['Shazam', 'https://www.shazam.com/', 'Musique', 'Reconnaît les musiques et bandes-son.'],

  /* Jeux */
  ['Steam', 'https://store.steampowered.com/', 'Jeux', 'Boutique et bibliothèque de jeux de Valve.'],
  ['GOG', 'https://www.gog.com/', 'Jeux', 'Boutique de jeux sans DRM.'],
  ['itch.io', 'https://itch.io/', 'Jeux', 'Place de marché de jeux indépendants.'],

  /* Développement et création de sites */
  ['GitHub', 'https://github.com/', 'Développement', 'Hébergement Git et collaboration.'],
  ['GitLab', 'https://gitlab.com/', 'Développement', 'Dépôts Git, tickets et intégration continue.'],
  ['Codeberg', 'https://codeberg.org/', 'Développement', 'Hébergement Git libre, géré par une association.'],
  ['VS Code pour le Web', 'https://vscode.dev/', 'Développement', 'Éditeur de code Visual Studio Code dans le navigateur.'],
  ['WordPress', 'https://wordpress.com/', 'Développement', 'Création de sites et de blogs.'],

  /* Design et graphisme */
  ['Figma', 'https://www.figma.com/', 'Design & Graphisme', 'Conception d’interfaces collaborative dans le navigateur.'],
  ['Canva', 'https://www.canva.com/', 'Design & Graphisme', 'Création graphique, photo et vidéo, avec IA.'],
  ['Photopea', 'https://www.photopea.com/', 'Design & Graphisme', 'Éditeur d’images dans le navigateur, calques et masques.'],
  ['Penpot', 'https://design.penpot.app/', 'Design & Graphisme', 'Plateforme de design et prototypage open source.'],
  ['Excalidraw', 'https://excalidraw.com/', 'Design & Graphisme', 'Tableau blanc open source au style dessiné à la main.'],
  ['draw.io (diagrams.net)', 'https://app.diagrams.net/', 'Design & Graphisme', 'Éditeur de diagrammes gratuit.'],
  ['Graphite', 'https://graphite.rs/', 'Design & Graphisme', 'Éditeur vectoriel et d’animation libre.'],

  /* Recherche et savoir */
  ['DuckDuckGo', 'https://duckduckgo.com/', 'Recherche & Savoir', 'Moteur de recherche respectueux de la vie privée.'],
  ['Google', 'https://www.google.com/', 'Recherche & Savoir', 'Moteur de recherche : web, images, actualités.'],
  ['Startpage', 'https://www.startpage.com/', 'Recherche & Savoir', 'Résultats Google sans pistage.'],
  ['Brave Search', 'https://search.brave.com/', 'Recherche & Savoir', 'Moteur de recherche privé avec son propre index.'],
  ['Kagi Search', 'https://kagi.com/', 'Recherche & Savoir', 'Moteur de recherche payant, sans publicité.'],
  ['SearXNG', 'https://searxng.org/', 'Recherche & Savoir', 'Métamoteur de recherche libre et privé.'],
  ['Wikipédia', 'https://www.wikipedia.org/', 'Recherche & Savoir', 'Encyclopédie libre et collaborative.'],
  ['Wayback Machine', 'https://web.archive.org/', 'Recherche & Savoir', 'Anciennes versions archivées des sites web.'],
  ['Internet Archive', 'https://archive.org/', 'Recherche & Savoir', 'Bibliothèque numérique : sites, livres et médias archivés.'],
  ['AlternativeTo', 'https://alternativeto.net/', 'Recherche & Savoir', 'Trouver des alternatives à n’importe quel logiciel.'],
  ['Product Hunt', 'https://www.producthunt.com/', 'Recherche & Savoir', 'Nouveaux produits et applications du jour.'],
  ['Wolfram Alpha', 'https://www.wolframalpha.com/', 'Recherche & Savoir', 'Moteur de calcul qui répond aux questions factuelles.'],
  ['Khan Academy', 'https://www.khanacademy.org/', 'Recherche & Savoir', 'Cours en ligne gratuits.'],

  /* Cartes, langues et lecture */
  ['Google Maps', 'https://www.google.com/maps', 'Cartes & Voyage', 'Cartes, trafic et itinéraires.'],
  ['Google Earth', 'https://earth.google.com/web/', 'Cartes & Voyage', 'Globe en images satellite.'],
  ['OpenStreetMap', 'https://www.openstreetmap.org/', 'Cartes & Voyage', 'Carte du monde libre, éditée par la communauté.'],
  ['Google Traduction', 'https://translate.google.com/', 'Langues & Lecture', 'Traduction dans plus de 100 langues.'],
  ['DeepL Traducteur', 'https://www.deepl.com/translator', 'Langues & Lecture', 'Traduction automatique neuronale.'],
  ['LanguageTool', 'https://languagetool.org/', 'Langues & Lecture', 'Correcteur orthographique et grammatical en 20+ langues.'],
  ['Feedly', 'https://feedly.com/', 'Langues & Lecture', 'Lecteur de flux RSS en vue magazine.'],
  ['Inoreader', 'https://www.inoreader.com/', 'Langues & Lecture', 'Agrégateur de flux RSS avec filtres.'],
  ['wallabag', 'https://wallabag.it/', 'Langues & Lecture', 'Enregistrer des articles pour les lire plus tard.'],

  /* Outils */
  ['Speedtest (Ookla)', 'https://www.speedtest.net/', 'Outils', 'Test de débit Internet.'],
  ['IFTTT', 'https://ifttt.com/', 'Outils', 'Automatisations sans code entre applications.'],
  ['Cobalt', 'https://cobalt.tools/', 'Outils', 'Téléchargeur de vidéos et musiques, sans publicité.']
];

/* Ajoute le catalogue à la boutique du profil ouvert (une seule fois par profil et par version du catalogue). Appelée à la connexion. */
function seedStore() {
  try {
    if (!SESSION || !D || !G || D.seed === SEED_VER || (typeof pendingPull === 'function' && pendingPull(SESSION.user.id))) return 0;   // profil importé : après la récupération des données du cloud
    const slug = s => s.normalize('NFD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    const all = G.store.concat(G.apps), names = new Set(all.map(a => String(a.name || '').toLowerCase())), urls = new Set(all.map(a => a.url).filter(Boolean)), ids = new Set(all.map(a => a.id));
    let n = 0;
    for (const [name, url, cat, desc, ai] of SEED_APPS) {
      if (G.store.length >= 500) break;   // limite de la boutique
      const id = 'w-' + slug(name);
      if (ids.has(id) || names.has(name.toLowerCase()) || urls.has(url)) continue;
      G.store.push({ id, name, url, lc: '', ex: '', ap: '', cat, desc, mode: 'auto', img: new URL(url).origin + '/favicon.ico', ai: ai === 1 });
      n++;
    }
    D.seed = SEED_VER; saveG(); save();
    return n;
  } catch { return 0; /* sans conséquence : réessayé à la prochaine connexion */ }
}
