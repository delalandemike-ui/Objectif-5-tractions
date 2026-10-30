# Mission 3D — compte coach unique et règles locales

Date : 30 octobre 2026. Branche vérifiée : `developpement-coach`.

Références : [architecture](ARCHITECTURE-MULTISPORTIFS.md), [Firebase](PREPARATION-FIREBASE.md) et [Auth coach](PREPARATION-AUTH-COACH.md). La fin du message de mission était tronquée ; les livrables suivent les travaux et contraintes explicitement reçus.

Mise à jour 3D-BIS : voir [l'audit des corrections](AUDIT-REGLES-FIRESTORE.md). La suite comprend désormais 24 scénarios moteur préparés ; les nombres de tests et résultats ci-dessous décrivent la préparation initiale 3D. Les nouvelles restrictions de lecture de relations et de liste des séances prennent priorité.

## Statut de cette préparation

Les règles dans `firebase/firestore.rules` sont un **brouillon local non déployé et non validé par le moteur Firestore**. Les règles actuellement publiées, qui refusent tout accès, sont conservées. Aucun compte, document réel, message d'invitation ou Cloud Function n'est créé. `index.html`, `sw.js`, les séances, `tractions-v2` et les modules Firebase/Auth ne sont pas modifiés.

Le navigateur ne confère aucun privilège. L'autorisation du coach dépend d'un document serveur unique et des relations qu'un serveur de confiance aura créées. L'Admin SDK et les outils Console disposant des droits IAM peuvent contourner les Security Rules : leur sécurité relève des accès administratifs, pas des contrôles d'interface.

## Structure proposée

| Chemin | Champs utiles et responsabilité |
| --- | --- |
| `settings/access` | `{coachUid: string, active: boolean}` ; un seul document ; administration de confiance uniquement |
| `athletes/{uid}` | `{enrolled: true, invitedBy: coachUid, acceptedAt: timestamp}` ; preuve d'admission après invitation acceptée ; écriture serveur uniquement |
| `coaches/{coachUid}/athletes/{athleteUid}` | `{status: "active" ou "revoked", invitationId: string, acceptedAt: timestamp}` ; relation gérée côté serveur |
| `users/{uid}` | `{displayName: string, updatedAt: timestamp}` ; profil sans rôle, adresse d'identité ni privilège |
| `athletes/{uid}/programs/tractions-12-v1` | `{schemaVersion: 1, score: int ou null, notes: string, revision: int, updatedAt: timestamp}` |
| `athletes/{uid}/programs/tractions-12-v1/sessions/{1..12}` | `{completed: boolean, completedAt: timestamp ou null, revision: int, updatedAt: timestamp}` |
| `invitations/{id}` | Courriel cible, UID coach, empreinte du secret, expiration, statut et UID bénéficiaire ; serveur uniquement |
| `athletes/{uid}/imports/{id}` | Réservé à une future migration ; aucun accès client ouvert par ces règles |

`firebase/settings-access.example.json` donne un exemple **inactif**, avec un UID fictif à remplacer seulement lors d'une opération autorisée. Aucun script ne l'importe dans une base.

L'admission `athletes/{uid}` précise la proposition des missions précédentes : un utilisateur connecté non invité ne peut pas créer son espace Firestore. La relation active décide si le coach voit ce sportif ; elle n'est pas la propriété des résultats. Après révocation de la relation, le sportif admis conserve ses données et son accès propre, le coach perd ses lectures. La suppression administrative de l'admission retire aussi l'accès propre ; elle n'est pas une action ordinaire de révocation. Le remplacement du coach ne transforme pas automatiquement les anciennes relations en relations du nouveau coach.

## Politique des règles préparées

- Refus global par défaut, y compris pour les chemins et sous-collections inconnus. Une règle `false` n'annule pas un autre `allow` vrai : les seules ouvertures sont donc délibérément restreintes à des chemins précis.
- Chaque accès autorisé nécessite un compte authentifié et `email_verified == true`.
- Sportif : UID égal au propriétaire du chemin et admission serveur `enrolled == true`. Aucune lecture d'un autre sportif et aucune auto-admission.
- Coach : UID égal à `settings/access.coachUid`, configuration active, sportif admis et relation `status == "active"`. Lecture du suivi et du profil uniquement ; le coach ne modifie pas les résultats.
- Coach désigné : lecture de sa liste de relations (actives et révoquées) pour gérer son suivi ; cela n'autorise pas les résultats d'une relation révoquée. Un sportif admis peut lire sa relation individuelle sous le coach actuellement désigné, pas les chemins de coachs tiers ni lister les relations d'autrui.
- Configuration, invitations et admissions : aucune écriture cliente, même pour le coach. La configuration et les invitations ne sont pas lisibles directement par les clients. Les fonctions `get` des règles peuvent néanmoins consulter la configuration.
- Profils et résultats : listes fermées de champs ; un `role`, `coachUid` ou champ supplémentaire est rejeté. Les profils ne permettent pas de changer l'identité Auth.
- Score : entier 0 à 30 ou `null`. Notes : texte jusqu'à 20 000 caractères. Nom d'affichage : texte jusqu'à 100 caractères. Création de résultat avec révision 1, mise à jour avec révision précédente + 1 ; date de modification égale à l'heure serveur de la requête.
- Séances : seuls les ID 1 à 12 sont inscriptibles, état booléen, date réelle facultative sans date future ; une réinitialisation est `completed: false, completedAt: null`. Aucune suppression cliente.
- Aucun listing global de profils, sportifs ou programmes. Après lecture des relations du coach, lire le document de programme connu puis une liste de séances explicitement limitée aux ID 1 à 12 par `where(documentId(), 'in', ids)`. Une liste de séances sans ce filtre est refusée par la politique préparée ; cette requête doit encore être validée dans l'émulateur. Les règles ne filtrent pas une requête globale a posteriori.

Les contrôles de champs suivent les capacités décrites par [Firebase](https://firebase.google.com/docs/firestore/security/rules-fields). Les bornes de texte concernent les futures écritures distantes ; elles ne tronquent ni ne modifient les notes locales. Une future migration devra sauvegarder et résoudre explicitement une note plus longue avant de l'importer.

Le coach n'obtient pas de lecture générale de ses propres résultats sportifs ; il doit être admis comme sportif s'il veut aussi utiliser le suivi distant personnel. Son profil de coach peut être géré sans admission sportive.

## Contrat des futures invitations serveur

Ces opérations sont spécifiées, pas implémentées ni déployées dans cette mission :

1. `createInvitation(email)` vérifie un jeton du bon projet, son courriel vérifié et l'UID coach actif du document unique. Les endpoints privilégiés vérifient aussi révocation et désactivation. Le courriel fourni sert de cible, jamais de preuve de rôle. Limiter les envois et valider les saisies.
2. Créer un secret aléatoire d'au moins 256 bits, conserver seulement son empreinte et une expiration courte (proposition : 7 jours). Révoquer l'ancien secret lors d'un renvoi explicite. Les secrets d'envoi restent côté serveur ; le secret d'invitation circule dans le lien, jamais dans des journaux ou outils analytiques.
3. `acceptInvitation(id, secret)` exige une session Firebase vérifiée, compare le courriel du jeton à la cible et contrôle le secret, l'expiration, l'état de l'invitation et le coach toujours actif. Ignorer tout UID ou rôle déclaré dans le corps client.
4. Une transaction serveur consomme l'invitation et crée atomiquement admission et relation active pour l'UID authentifié. Un même appel repris par le même UID renvoie le résultat déjà établi, sans réinitialiser les résultats ; un autre UID est refusé. La transaction ne réécrit jamais un suivi existant. Une ancienne relation révoquée ne peut être réactivée que par une nouvelle invitation valide.
5. Révocation : seul le coach actif passe par une fonction autorisée qui modifie la relation. L'admission du sportif et ses résultats sont conservés. L'expiration d'une invitation est contrôlée à l'acceptation, même si aucun nettoyage n'a encore eu lieu.

L'Admin SDK contourne les règles : ces fonctions doivent refaire tous les contrôles de droits. Aucun endpoint d'invitation ne doit écrire `settings/access`. Les tests serveur futurs couvriront aussi double acceptation, mauvais courriel, expiration, révocation, rejeu, interruption et changement du coach pendant la transaction. Les règles locales bloquent les contournements directs ; elles ne prouvent pas la sécurité de fonctions encore inexistantes.

## Procédure Firebase Console pour le premier coach — à exécuter ultérieurement

Cette procédure nécessite une autorisation distincte. Ne rien exécuter pendant la mission 3D.

1. Un administrateur habilité ouvre le projet **objectif-5-tractions** dans Firebase Console et vérifie l'identifiant du projet, les fournisseurs Auth, le domaine autorisé et le refus global des règles publiées. Il confirme hors application l'adresse et l'identité du coach ; aucun premier inscrit automatique.
2. Dans **Authentication > Users / Utilisateurs**, rechercher l'adresse. Si le compte existe, contrôler l'UID et son état avant toute réutilisation. Sinon, utiliser **Add user / Ajouter un utilisateur**.
3. La création Console documentée crée un utilisateur avec mot de passe ([documentation Firebase](https://firebase.google.com/docs/auth/android/manage-users)). Elle ne doit pas être présentée comme une création sans mot de passe : si le formulaire l'exige, utiliser un mot de passe aléatoire long conservé hors dépôt dans un gestionnaire, sans le réutiliser ni l'intégrer à l'application. Si l'objectif impose strictement de ne créer aucune méthode mot de passe, interrompre ce parcours Console et choisir, après validation, la création Admin sans mot de passe décrite en mission 3C ou la première connexion par lien. Ne pas inventer une option Console de création passwordless.
4. Faire prouver au propriétaire l'accès à sa boîte par un parcours de lien e-mail autorisé ultérieurement. Ne pas marquer l'adresse vérifiée par commodité. Contrôler ensuite l'UID exact, l'état vérifié et l'absence de désactivation. Si un mot de passe de bootstrap a été créé, vérifier explicitement les méthodes de connexion restantes et traiter sa suppression/remédiation dans la mission de création : ne pas promettre sa disparition automatique pour toutes les situations.
5. Dans **Firestore Database > Data / Données**, vérifier que `settings/access` n'existe pas. S'il existe, arrêter pour examiner sa configuration ; ne pas le remplacer. Sous la responsabilité d'un seul administrateur, créer la collection `settings`, le document `access`, les champs `coachUid` (chaîne : UID contrôlé) et `active` (booléen : `false`). Ne pas ajouter d'adresse ou de mot de passe dans ce document.
6. La Console utilise des privilèges administratifs, pas les droits du coach : l'écriture peut être possible malgré les règles clientes de refus. Relire projet, chemin, UID et type des champs. Une création manuelle Console n'est pas une opération conditionnelle atomique contre plusieurs administrateurs ; convenir d'un opérateur unique et ne pas procéder en concurrence. Pour un bootstrap automatisé futur, utiliser une transaction administrative « créer seulement si absent ».
7. Après validation des règles par le vrai émulateur, revue et autorisation de déploiement dans une mission distincte, tester la session du bon UID sans données réelles. Passer `active` à `true` seulement au moment convenu. Ce changement seul n'ouvre rien tant que les règles publiées refusent tout. Aucun document d'admission ou de relation n'est nécessaire pour donner le rôle coach ; il sera nécessaire pour consulter un sportif.
8. Vérifier qu'un autre compte, même vérifié, ne peut ni écrire cette configuration, ni ajouter un champ de rôle à son profil, ni consulter un sportif non associé. Garder les accès IAM minimaux et prévoir la désactivation `active: false` et la révocation de sessions en cas d'incident.

Un seul document et un champ UID scalaire définissent un seul coach actif. Un utilisateur ne peut pas changer cette valeur via le SDK client ; un administrateur IAM de confiance peut le faire. Aucun claim client ou rôle stocké dans le navigateur n'est utilisé pour accorder les droits.

## Tests de sécurité préparés

`tests/firestore/security.test.mjs` contient 12 scénarios automatisés pour le **vrai moteur Firestore Emulator**, avec données fictives et contextes Auth simulés : anonyme, non-invité, admis, 12 séances, coach associé, courriel non vérifié, élévation de privilèges, profils/listes, schéma/révision, coach désactivé/configuration absente, relation révoquée, chemins inconnus/imports.

Les fixtures sont créées uniquement via `withSecurityRulesDisabled` dans un projet `demo-objectif-5-tractions`, puis chaque accès client est vérifié avec `assertSucceeds` ou `assertFails`. Aucune fixture n'utilise les UID ou résultats réels. Les tests n'effectuent pas d'authentification réelle. La [documentation officielle de test](https://firebase.google.com/docs/firestore/security/test-rules-emulator) décrit ce mode de validation.

Préparation de l'outillage à faire dans une mission autorisée : Node compatible, Java compatible avec la version choisie de Firebase CLI, CLI Firebase et bibliothèques de test `firebase` / `@firebase/rules-unit-testing` résolubles depuis `tests/firestore/security.test.mjs`. Figer leurs versions et leur lockfile au moment de l'installation ; aucune dépendance n'a été installée ici. L'outillage de tests n'impose aucun serveur Node pour GitHub Pages.

Commandes préparées depuis la racine :

```powershell
# Vérification des fichiers et garde-fous seulement, sans moteur de règles :
powershell -NoProfile -ExecutionPolicy Bypass -File tests/firestore/check-preparation.ps1
# Véritable validation, après installation autorisée des prérequis :
powershell -NoProfile -ExecutionPolicy Bypass -File tests/firestore/run-security-tests.ps1
```

Le lanceur d'émulateur utilise uniquement `--project demo-objectif-5-tractions`, la configuration locale `tests/firestore/firebase.json`, l'interface `127.0.0.1:8080` et une exécution séquentielle. Le fichier de test refuse tout autre `FIRESTORE_EMULATOR_HOST`. Il n'y a ni commande de connexion, ni déploiement, ni configuration du vrai projet. Ne pas utiliser cette configuration avec `firebase deploy`.

## Résultats réellement obtenus et limites

- 10 contrôles statiques réussis : présence du refus global, garde-fous, listes de champs, configuration d'émulateur locale et 12 scénarios préparés. Ils ne compilent pas et n'évaluent pas les règles.
- Le lanceur de sécurité a été essayé et s'est arrêté avant tout test avec `Missing prerequisite: node`. Node, Java et Firebase CLI sont absents des commandes disponibles. **Aucun des 12 tests moteur n'a donc été exécuté** ; ne pas présenter les règles comme validées ou prêtes à publier.
- Les empreintes des fichiers applicatifs et modules existants sont contrôlées avant et après la préparation. Aucun compte Console n'a été créé et aucun paramètre distant n'a été changé.

Avant publication : exécuter les 12 tests dans le moteur, corriger tout échec de compilation ou de comportement, tester les requêtes réelles du futur tableau de bord, puis développer/tester les transactions d'invitation et faire valider séparément le déploiement. Les limites de cache et d'intégration du service worker des missions précédentes demeurent. La préparation s'arrête ici ; toute création réelle ou activation attend validation.
