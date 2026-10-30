# Architecture multisportifs — audit et préparation

Date : 30 octobre 2026. Branche constatée : `developpement-coach`.

## 1. Périmètre et conclusion

Cette mission produit uniquement ce document. Aucun code applicatif, séance, compte, projet Firebase, règle déployée ou hébergement n'est modifié. Aucun commit ni push n'est effectué.

Recommandation : conserver le site statique sur GitHub Pages, ajouter Firebase Authentication pour l'identité et Cloud Firestore pour les résultats, et réserver les invitations et les changements d'autorisation à de petites fonctions de confiance hébergées dans Firebase. Aucun serveur Node.js permanent n'est nécessaire pour servir le site. Des Cloud Functions peuvent utiliser un environnement Node.js géré ; elles constituent néanmoins un composant serveur et impliquent une configuration et un budget à valider ultérieurement.

L'audit porte sur les fichiers du dépôt, pas sur une inspection du site publié ni sur les données d'un navigateur utilisateur. L'état réellement déployé, les caches déjà installés et les résultats existants ne sont donc pas vérifiés ici.

## 2. Audit de l'existant

### Fichiers et interface

Les seuls fichiers suivis constatés sont `index.html` et `sw.js`. Aucune dépendance, chaîne de compilation, configuration Firebase ou suite de tests n'est présente. Le HTML regroupe structure, styles et JavaScript.

`index.html` référence `manifest.webmanifest` et `icon.svg`, absents du dépôt audité. Les métadonnées mobiles sont présentes, mais l'installation comme application ne peut pas être considérée comme complète sur cette base. L'affichage UTF-8 du fichier est correct ; un affichage incorrect dans un terminal utilisant un autre encodage ne prouve pas une corruption du fichier.

Fonctionnalités observées :

- Programme fixe `S` : 12 séances numérotées de 1 à 12, réparties sur 4 semaines, 3 séances par semaine ; contenu et durées intégrés au JavaScript.
- Échauffement de 7 minutes, consignes, exercices sans aide, avec élastique, descentes lentes et exercices complémentaires.
- Choix de semaine et séance, détail de la séance, liste des 12 séances et navigation vers leur détail.
- Marquage d'une séance terminée, sans doublon ajouté par l'interface. « Réinitialiser » retire uniquement la séance sélectionnée des séances terminées ; il n'efface pas tout le suivi.
- Compteur et barre de progression calculés à partir de `done.length / 12`.
- Saisie d'un score global et de notes globales, enregistrées à chaque événement `input`.
- Affichage du meilleur score par `state.score || 1` : une valeur vide affiche 1 ; la chaîne `"0"` affiche bien 0. Ce 1 de présentation n'est pas une performance enregistrée.

Il n'existe ni identité, ni invitation, ni tableau de bord coach, ni synchronisation distante. Aucun historique de score, date de séance, résultat détaillé par exercice ou distinction entre plusieurs sportifs n'est enregistré. La sélection de séance repart sur semaine 1 / séance 1 au chargement.

### Données locales exactes

Une seule clé `localStorage` est utilisée : `tractions-v2` (`index.html`, lignes 77 à 85).

```json
{"done":[1,3],"score":"2","notes":"Exemple de notes"}
```

| Champ | Forme actuelle | Signification |
| --- | --- | --- |
| `done` | Tableau d'identifiants numériques | Séances terminées ; valeurs attendues de 1 à 12 |
| `score` | Chaîne, vide par défaut | Valeur du champ numérique, avec bornes HTML 0 à 30 |
| `notes` | Chaîne, vide par défaut | Texte libre global |

En l'absence de clé, l'état initial est `{"done":[],"score":"","notes":""}`. `save()` réécrit l'objet entier. Les bornes HTML ne constituent pas une validation des données stockées ou une autorisation de sécurité.

Limites : `JSON.parse` et les écritures ne sont pas protégés par une gestion d'erreur ; JSON invalide, structure inattendue, stockage bloqué ou quota dépassé peuvent empêcher le fonctionnement. Aucun export, sauvegarde, migration ou écoute des modifications d'un autre onglet n'est prévu. Deux onglets peuvent écraser leurs changements respectifs.

Le stockage dépend du navigateur, du profil et de l'origine (protocole, hôte, port), pas du chemin du dépôt. Des sites GitHub Pages du même hôte peuvent partager cette clé. Changer de domaine ou de navigateur ne transfère pas les résultats. Effacer les données du site peut supprimer le suivi ; ce stockage n'est pas une sauvegarde durable.

### Fonctionnement hors connexion actuel

`index.html:95` enregistre `sw.js` et ignore silencieusement les erreurs. Le service worker utilise le cache `objectif-5-fractions-v1` ; le mot « fractions » est bien celui présent dans le code.

1. À l'installation, `cache.addAll` précharge `./` et `./index.html`. L'échec d'une ressource peut faire échouer l'installation.
2. `skipWaiting()` demande une activation sans attendre la fermeture des anciens onglets.
3. À l'activation, tous les caches dont le nom diffère sont supprimés, puis `clients.claim()` prend le contrôle des pages dans sa portée.
4. Pour tout GET intercepté, `caches.match` cherche d'abord une réponse dans les caches de l'origine. À défaut, une requête réseau est faite et sa réponse est ajoutée au cache.
5. En cas d'échec réseau, le worker retourne `./index.html`, quel que soit le type de ressource demandé. Les autres méthodes ne sont pas interceptées.

Après une installation réussie, le programme et le suivi local peuvent fonctionner sans réseau. Une toute première visite hors connexion ne le permet pas. Il n'y a pas de synchronisation différée actuelle : les résultats restent sur l'appareil. Le support dépend de HTTPS, du navigateur et de la disponibilité des caches ; aucune garantie de conservation permanente n'existe.

## 3. Architecture recommandée

### Composants

| Composant | Responsabilité |
| --- | --- |
| GitHub Pages | Servir HTML, CSS, JavaScript et ressources publiques en HTTPS |
| Application navigateur | Programme inchangé, vue sportif, vue coach, stockage local et synchronisation |
| Firebase Authentication | Identifier chaque utilisateur par un UID et vérifier son courriel |
| Cloud Firestore | Stocker profils, relations coach/sportifs et résultats ; appliquer les Security Rules |
| Cloud Functions Firebase | Créer, accepter et révoquer les invitations ; opérations privilégiées et transactions |
| Service de courriel | Envoyer les invitations depuis une fonction ; secrets conservés côté serveur |

Le navigateur communique directement avec Auth et Firestore via le SDK Web. Les opérations privilégiées passent par les fonctions. Une éventuelle compilation locale ou en CI n'impose aucun serveur Node.js sur GitHub Pages. Préférer des modules séparés (authentification, données, migration, vues) et des versions de SDK figées, avec ressources statiques maîtrisées pour le mode hors connexion.

Utiliser des URL relatives compatibles avec `/Objectif-5-tractions-git/` et une URL de retour d'authentification vers la page existante ; éviter les routes nécessitant une réécriture serveur. Le domaine GitHub Pages devra être autorisé dans Firebase Auth. La configuration Web Firebase est publique ; les comptes de service, clés Admin et identifiants d'envoi de courriel ne doivent jamais apparaître dans le site ou le dépôt.

Le mode local reste utilisable sans compte. La connexion, l'acceptation d'invitation et la première récupération distante nécessitent le réseau. Le tableau de bord affiche explicitement la date du dernier résultat synchronisé, pas une promesse de suivi en direct hors connexion.

### Modèle Firestore proposé

Les noms ci-dessous sont une proposition à implémenter et tester, pas une configuration existante.

| Chemin | Contenu et accès |
| --- | --- |
| `settings/access` | UID unique du coach et activation de son accès ; modifiable uniquement par une administration de confiance |
| `users/{uid}` | Profil minimal ; propriétaire et coach si relation active, champs d'identité contrôlés |
| `coaches/{coachUid}/athletes/{athleteUid}` | Relation active/révoquée, dates et référence d'invitation ; écriture serveur uniquement |
| `athletes/{uid}/programs/tractions-12-v1` | `schemaVersion`, score global nullable, notes globales, révision, horodatage serveur |
| `athletes/{uid}/programs/tractions-12-v1/sessions/{sessionId}` | ID 1 à 12, `completed` booléen, révision, date de modification ; date de réalisation nullable |
| `athletes/{uid}/imports/{importId}` | Copie du suivi historique, provenance et marqueur de migration ; création immuable contrôlée |
| `invitations/{invitationId}` | Courriel cible, coach, empreinte du secret, expiration et statut ; accès serveur uniquement |

Ne pas placer de rôles ou de relations modifiables par le sportif dans son profil. Les imports et notes ne doivent pas devenir des collections publiques. Les données historiques ne permettent pas de reconstituer les dates des séances : conserver `completedAt: null` et une provenance de migration plutôt qu'inventer des dates.

Le coach lit les résultats de ses sportifs actifs ; il ne les corrige pas dans cette première conception. Les scores et notes restent globaux comme aujourd'hui. Les futurs résultats par séance seraient une évolution distincte.

## 4. Invitations et autorisations

### Identité du coach et authentification

Un administrateur de confiance désignera ultérieurement un seul UID de coach dans `settings/access`, inaccessible en écriture aux clients. Aucune auto-inscription ne peut conférer ce rôle. Les fonctions et règles vérifient cet UID et son activation à chaque opération protégée. Un éventuel custom claim est une optimisation d'interface, pas un substitut au contrôle révocable. Les claims ne peuvent être attribués que depuis un environnement privilégié ([documentation Firebase](https://firebase.google.com/docs/auth/admin/custom-claims)).

Recommander une authentification par lien de connexion envoyé au courriel, pour le coach comme pour les sportifs. Sur un autre appareil, demander à nouveau le courriel ; ne pas l'extraire d'un paramètre de redirection pour terminer la connexion. Vérifier le lien avec l'API Auth, puis l'état vérifié de l'adresse. Le domaine et le chemin de retour sont prédéfinis ; aucune redirection arbitraire n'est acceptée. Ces précautions suivent le [parcours Web Firebase](https://firebase.google.com/docs/auth/web/email-link-auth).

### Cycle d'invitation recommandé

1. Le coach connecté et vérifié saisit un courriel. La fonction `createInvitation` valide son jeton Auth, l'UID de coach actif, le format de la saisie et une limite d'envois. Normaliser les courriels de façon cohérente sans réécrire les points ou suffixes propres à certains fournisseurs.
2. La fonction produit un identifiant et un secret aléatoire cryptographiquement sûr (au moins 256 bits). Seule son empreinte est stockée avec le courriel cible, le coach, `pending`, les dates serveur et une expiration courte proposée de 7 jours. Une réinvitation révoque le précédent secret.
3. Le serveur envoie une invitation vers la page GitHub Pages. Le secret est de préférence dans le fragment URL, retiré rapidement de l'URL après lecture, sans journalisation ni outil analytique sur ce parcours. Ne pas placer courriel ou résultats dans l'URL. L'expiration est contrôlée à l'acceptation, indépendamment d'un éventuel nettoyage automatique.
4. À l'ouverture, le sportif s'authentifie avec Firebase et prouve l'accès au courriel invité. Le lien d'invitation et le lien de connexion Auth sont deux mécanismes distincts. L'application peut demander l'envoi du lien Auth ; aucun secret d'envoi n'est embarqué. Si un lien Auth personnalisé est généré côté Admin, sa génération ne remplace pas l'envoi via un service de courriel ([documentation](https://firebase.google.com/docs/auth/admin/email-action-links)).
5. `acceptInvitation` contrôle le jeton Auth vérifié, le courriel de ce jeton, l'empreinte du secret, l'expiration, le coach actif et le statut. Elle ne fait confiance à aucun UID, rôle ou courriel déclaré dans le corps de la requête.
6. Une transaction serveur consomme l'invitation et crée la relation liée à l'UID authentifié. Deux acceptations concurrentes ne peuvent pas créer deux bénéficiaires. Une répétition par le même UID après succès renvoie le même résultat ; une tentative par un autre UID est rejetée. L'acceptation ne réinitialise jamais un suivi existant.
7. Le coach peut révoquer une invitation ou une relation via une fonction autorisée. La relation révoquée retire son accès aux lectures serveur suivantes ; elle ne détruit pas les résultats du sportif. Un changement de courriel ne transfère pas une invitation à un autre UID : prévoir une nouvelle invitation explicite si nécessaire.

Un compte Auth sans invitation peut exister, mais il n'obtient pas de relation de coaching ni d'accès aux données d'autrui. Connaître un lien transféré, un UID ou la configuration Firebase ne suffit pas à obtenir un accès.

### Politique des Security Rules

Refus par défaut sur tous les chemins ; ouvrir uniquement les accès précisément définis :

- Sportif : utilisateur connecté avec courriel vérifié, lecture/écriture de ses résultats sous son UID ; aucune lecture des autres sportifs.
- Coach : UID égal au coach actif de `settings/access` ET relation active pour le sportif concerné ; lecture de son profil autorisé et de son suivi uniquement. Aucune écriture de résultats.
- Profils : liste fermée de champs modifiables, sans possibilité d'ajouter un rôle, un `coachUid` ou un statut d'invitation.
- Résultats : champs autorisés, types, longueurs bornées, score entier entre 0 et 30 ou `null`, ID de séance autorisé, booléens, version et révision cohérentes ; identité et provenance protégées. Les imports conservent aussi les valeurs anciennes non conformes sans les injecter dans les champs actifs.
- Invitations et paramètres de sécurité : aucune lecture/écriture directe depuis les clients ; les fonctions renvoient seulement les informations nécessaires.
- Relations : lecture de sa propre relation pour le sportif et des relations du coach actif pour celui-ci ; aucune modification client.

Les requêtes doivent correspondre aux autorisations : lister les relations du coach puis lire les suivis associés ; aucune requête globale sur tous les sportifs. Les règles ne filtrent pas après coup une collection non autorisée. L'Admin SDK contourne les règles Firestore : chaque fonction doit donc effectuer ses propres contrôles, avec privilèges IAM minimaux ([conditions de règles Firebase](https://firebase.google.com/docs/firestore/security/rules-conditions)).

Prévoir des tests Emulator Suite avant tout déploiement : anonyme, compte non vérifié, sportif A contre B, faux coach, coach révoqué, injection de rôle, invitation expirée/révoquée/rejouée, mauvais courriel et double acceptation. App Check et les quotas peuvent renforcer la protection contre l'abus ; ils ne remplacent pas les autorisations.

## 5. Migration sans perte des résultats locaux

### Principes

Ne jamais supprimer ou réécrire `tractions-v2` au démarrage, à la connexion ou à la déconnexion. Ne jamais remplacer un suivi local par un objet vide reçu avant la fin d'une lecture distante. Conserver le même domaine pour accéder à l'ancien stockage ; un changement de domaine exige un export/import préalable depuis l'ancienne origine.

1. Lire la valeur brute avec gestion d'erreur et en conserver une copie exacte, datée et versionnée, dans un espace de sauvegarde distinct. Proposer un export JSON téléchargeable ; si le stockage est plein ou bloqué, ne pas poursuivre une migration qui écraserait la seule copie. Une sauvegarde dans le même navigateur ne protège pas d'un effacement complet.
2. Parser et valider sans détruire la source. Dédupliquer les identifiants valides 1 à 12, convertir uniquement un score explicitement valide en entier et convertir la chaîne vide en `null`. Ne jamais importer le 1 affiché par défaut. Préserver notes, valeurs hors bornes, champs inconnus et JSON invalide dans la sauvegarde brute ; signaler les anomalies plutôt que les effacer ou les tronquer silencieusement.
3. Présenter un aperçu et demander à quel sportif appartient ce suivi avant de le rattacher à l'UID connecté. Plusieurs personnes ont pu utiliser le même navigateur ; l'ancien objet n'a aucune identité. Le coach n'importe pas automatiquement les données présentes sur son appareil dans le compte d'un sportif.
4. Après confirmation explicite, attribuer un identifiant d'import stable pour cet UID et cette capture. Créer un import immuable avec empreinte de contenu, version source, copie et date d'import serveur. La même capture reprise après une coupure réutilise cet identifiant ; un même contenu nouvellement saisi ne doit pas être confondu avec une ancienne opération déjà confirmée.
5. Si le suivi distant est vide, importer les séances cochées, le score et les notes. S'il existe, afficher les différences : proposer l'union des séances, conserver les deux scores dans la sauvegarde et faire choisir la valeur active ; conserver séparément les deux textes de notes avant toute fusion. Une union automatique pourrait annuler une réinitialisation volontaire : ne pas la faire sans accord.
6. Écrire l'import et le suivi fusionné dans une transaction avec contrôle de révision ; relire et reproposer la fusion si le suivi a changé entre-temps. Une transaction Firestore nécessite le réseau ([documentation](https://firebase.google.com/docs/firestore/manage-data/transactions)). Distinguer sauvegarde locale, attente d'envoi et confirmation serveur.
7. Marquer la migration réussie uniquement après confirmation distante et vérification des données écrites. Conserver l'ancienne clé et l'export ; aucune suppression automatique. Un échec laisse l'application locale utilisable et permet une reprise sans doublon.

La garantie recherchée est l'absence de perte causée par la migration. Elle ne permet pas de récupérer des données déjà effacées avant celle-ci. Aucune date historique, série ou répétition non enregistrée ne peut être reconstruite.

### Écritures futures et conflits

Prévoir des espaces locaux séparés par UID et programme, plus un espace invité distinct. Ne jamais continuer à écrire les résultats de plusieurs comptes dans la clé historique commune. Une déconnexion n'attribue pas le suivi du compte précédent au compte suivant.

Conserver un journal local durable des opérations non confirmées, avec identifiant stable, UID et révision de base. Les séances ont chacune leur document : une modification de séance ne réécrit pas les 12 états. Une réinitialisation est une écriture `completed: false`, pas une disparition ambiguë. Score et notes nécessitent une résolution explicite si deux appareils modifient la même version ; conserver les versions concurrentes avant résolution. Distinguer heure locale déclarée et horodatage serveur de synchronisation.

Pour la première version, privilégier un cache Firestore en mémoire et une file locale contrôlée ; rejouer les opérations en ligne avec transactions et contrôle de révision. La persistance Firestore Web pourra être ajoutée sur appareil de confiance, sans supposer qu'elle règle les conflits : les écritures concurrentes d'un même document y suivent une logique de dernière écriture gagnante. Le cache persistant survit aux sessions ([documentation hors connexion](https://firebase.google.com/docs/firestore/manage-data/enable-offline)).

Sur un appareil partagé, éviter le cache persistant des données coach, prévoir l'effacement des copies sensibles lors de la déconnexion après traitement explicite des opérations en attente, et ne jamais supprimer une file non envoyée en silence. Une révocation distante ne peut pas effacer une copie déjà lue sur un appareil hors connexion.

## 6. Risques du service worker et stratégie de mise à jour

| Constat actuel | Risque | Évolution à prévoir après validation |
| --- | --- | --- |
| Cache prioritaire sans revalidation | Un nouveau `index.html` peut rester invisible si seul le HTML change | HTML recherché sur le réseau avec repli hors connexion ; ressources versionnées et cache par version |
| Nom de cache fixe | Réutilisation d'une ancienne version et mélange de ressources | Version de livraison explicite et ressources cohérentes |
| Suppression de tous les autres caches | Destruction de caches d'autres applications du même hôte | Supprimer uniquement les anciens caches portant le préfixe propre à cette application |
| `caches.match` sans cache ciblé | Réponse potentiellement issue d'un autre cache de l'origine | Rechercher dans le cache précis de la version |
| Tous les GET interceptés, sans liste d'hôtes | Mise en cache indésirable de ressources Auth/API ou de réponses sensibles | Limiter aux ressources publiques statiques de l'application ; exclure Firebase, fonctions et URLs d'authentification |
| Repli HTML pour toute requête | HTML reçu à la place de JS, JSON, image ou réponse API ; erreurs trompeuses | Repli uniquement pour les navigations prévues, échec explicite pour les autres ressources |
| Absence de contrôle du statut des réponses | Une réponse d'erreur peut être conservée | Vérifier statut, type et origine avant mise en cache |
| `cache.put` non rattaché à `event.waitUntil` | Écriture de cache non garantie jusqu'à son terme, erreurs non traitées | Attendre et traiter les écritures de cache |
| `skipWaiting` et `clients.claim` immédiats | Page ancienne contrôlée par un nouveau worker, incohérence de schéma | Informer de la mise à jour, sauvegarder la saisie et les opérations, coordonner les onglets avant activation/rechargement |
| Erreurs d'enregistrement ignorées | Mode hors connexion supposé disponible à tort | État visible et diagnostic sans exposer de données personnelles |

Le cache applicatif et `localStorage` sont des mécanismes distincts : supprimer un cache n'efface pas directement `tractions-v2`. En revanche, une consigne de dépannage demandant d'effacer toutes les données du site peut supprimer les résultats. Préférer un export préalable et une réparation ciblée des caches.

Pour une future livraison : conserver `sw.js` au même emplacement afin de mettre à jour le worker existant, changer ses octets et le nom du cache, vérifier les anciennes installations et proposer une activation coordonnée. Le cycle d'installation/attente/activation est décrit dans la [documentation Service Worker de MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

Prévoir la compatibilité temporaire entre deux versions clientes : migrations versionnées et additives, refus explicite des écritures trop anciennes sans effacer la sauvegarde, stratégie de retour arrière. Ne pas compter sur un simple rechargement pour remplacer un worker déjà installé. Un retour arrière du site ne revient pas automatiquement sur une migration de données.

Tester en particulier : navigateur déjà contrôlé par le worker actuel, onglets multiples, coupure pendant installation/import/synchronisation, cache incomplet, première visite hors connexion, mise à jour de HTML seul, connexion/déconnexion et changement de compte.

## 7. Autres risques et décisions à valider

- Confidentialité : informer le sportif de ce que le coach voit et du partage des notes historiques avant import. Minimiser les données, définir durée de conservation, export, suppression et sort du suivi après révocation. Les notes libres peuvent contenir des informations sensibles.
- Sécurité de l'interface : afficher les notes et profils comme texte, jamais comme HTML non fiable. Ne jamais journaliser jetons, secrets d'invitation ou notes.
- Disponibilité : une panne Firebase ne doit pas empêcher la consultation du programme déjà disponible et la sauvegarde locale. Distinguer clairement « enregistré sur cet appareil » et « synchronisé ».
- Coûts : valider facturation des fonctions, envoi de courriels, lectures Firestore, quotas Auth et alertes budgétaires avant activation. Limiter les abonnements temps réel et paginer le tableau de bord. Aucun tarif ou quota précis n'est présumé ici.
- Identité et exploitation : prévoir protection renforcée du compte coach, renouvellement de l'UID autorisé par administration de confiance et procédure de récupération ; ne pas créer de second coach par une inscription ordinaire.
- Hébergement : l'isolation par chemins GitHub Pages ne sépare pas les stockages d'origine. Un domaine dédié peut améliorer l'isolation, mais doit être précédé d'un plan d'export des données de l'ancien domaine.

## 8. Étapes de développement suivantes, soumises à validation

1. Valider cette architecture, le recours aux fonctions gérées, le mode de connexion, le partage des notes et les règles de conservation. Confirmer le domaine cible et le budget. Aucune ressource réelle n'est créée avant accord.
2. Après autorisation, préparer la séparation du code et une couche de stockage avec export et sauvegarde versionnée, sans changer les séances ni les comportements existants. Vérifier les 12 contenus et le sens du bouton de réinitialisation.
3. Préparer et tester la migration locale, la reprise après coupure et les conflits avec un suivi distant existant sur des données fictives. Vérifier score vide, score zéro, caractères accentués, notes longues, JSON invalide et saturation du stockage.
4. Préparer le correctif du service worker et ses scénarios de mise à jour depuis la version actuelle, avant de lui exposer des flux Auth ou Firestore.
5. Développer avec Emulator Suite les schémas, règles et fonctions d'invitation ; démontrer les refus d'accès croisés et la consommation atomique des invitations. Ne pas utiliser de résultats réels dans les tests.
6. Après accord explicite, configurer un environnement Firebase de test, les domaines autorisés, le coach unique et le fournisseur de courriel ; tester le parcours complet avec des comptes de test autorisés.
7. Ajouter les vues sportif et coach, les statuts de synchronisation, l'isolation des comptes et la résolution des conflits. Vérifier la révocation et l'absence de données du compte précédent après déconnexion.
8. Présenter les modifications et les résultats des vérifications avant toute autorisation distincte de commit, push ou déploiement. Prévoir sauvegarde, surveillance et retour arrière pour une éventuelle mise en production.

Les références officielles citées ont été consultées pour préparer cette proposition. Elles ne constituent ni une validation des règles futures ni un déploiement. La mission 1 s'arrête à ce document ; toute modification suivante attend la validation de l'utilisateur.
