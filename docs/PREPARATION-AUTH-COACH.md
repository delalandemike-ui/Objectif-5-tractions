# Mission 3C — authentification indépendante et autorisation du coach

Date : 30 octobre 2026. Branche contrôlée : `developpement-coach`.

Références : [architecture multisportifs](ARCHITECTURE-MULTISPORTIFS.md), [préparation du code](PREPARATION-CODE-MULTISPORTIFS.md) et [configuration Firebase](PREPARATION-FIREBASE.md).

## Périmètre

`js/auth.js` prépare la connexion par lien e-mail, la déconnexion et l'observation de session. Il n'est référencé ni par `index.html` ni par `sw.js`. Son import et la construction de son client n'effectuent aucun chargement distant, envoi, création de compte ou accès au stockage du suivi. La configuration Firebase existante est réutilisée sans modification.

Les méthodes de connexion sont du code opérationnel à appeler uniquement lors d'une mission autorisée : un appel réel à `sendSignInLink` peut envoyer un e-mail ; un appel réel à `completeSignIn` peut créer un utilisateur Auth si l'adresse n'a pas encore de compte. Aucun de ces appels réels n'a été exécuté ici. Les tests utilisent uniquement des doublures locales. Firestore reste entièrement hors du module.

## API préparée

Le singleton exporté est `authClient`. La fabrique `createAuthClient({ load })` permet les tests par injection. Ne pas construire plusieurs clients applicatifs concurrents ; utiliser le singleton pour coordonner les opérations.

| Méthode | Contrat |
| --- | --- |
| `initialize()` | Prépare explicitement Auth en mémoire ; aucun envoi ou appel de connexion |
| `sendSignInLink(email)` | Envoi volontaire, retour fixe HTTPS, `handleCodeInApp: true` ; pas de renvoi automatique |
| `completeSignIn(email, link)` | Adresse saisie explicitement et lien complet ; contrôles locaux puis validation réelle par Firebase lors de l'appel |
| `observe(onChange, onError)` | Promesse de fonction de désabonnement ; transmet identité ou `null` et erreurs contrôlées |
| `signOut()` | Déconnexion de la session de cette instance ; pas d'effacement des résultats ni de révocation globale des autres appareils |

Le SDK Auth est chargé depuis le CDN modulaire avec la version exportée par `firebase-config.js` (13.1.0), puis reçoit l'application nommée initialisée par ce module. Les dépendances de chargement sont vérifiées et les imports distants disposent d'un délai de 12 secondes. Les imports natifs ne sont pas annulables : une expiration arrête l'attente sans lancer tardivement la connexion.

Les événements et le résultat de connexion exposent seulement `{ uid, email, emailVerified }`, figés, sans rôle ni jeton. Ces valeurs servent à l'affichage et ne sont jamais une preuve d'autorisation serveur. Les erreurs ne recopient ni lien, ni code à usage unique, ni adresse, ni message brut du SDK.

Exemple de raccordement futur, absent de l'application actuelle :

```js
const stop = await authClient.observe(
  identity => { /* afficher connecté/déconnecté, sans accorder de rôle */ },
  error => { /* afficher un message contrôlé */ }
);
// Après action utilisateur : await authClient.sendSignInLink(emailSaisi);
// Après ouverture et confirmation : await authClient.completeSignIn(emailSaisi, lienComplet);
// À la fermeture de la vue : stop();
```

Les erreurs d'initialisation de `observe` sont des rejets de sa promesse ; l'appelant doit aussi les intercepter. Il doit attendre cette promesse puis conserver et appeler le désabonnement, même si la vue a été fermée pendant le chargement. La disponibilité de la première identité doit être déduite de l'événement d'observation, pas d'une lecture immédiate avant initialisation.

## Persistance et parcours de lien

Choix de cette préparation : `initializeAuth(app, { persistence: inMemoryPersistence })`. Aucun courriel n'est conservé automatiquement et aucune session n'est persistée par ce module. Une navigation/recharge complète impose une nouvelle connexion ; une ouverture de lien demande à nouveau le courriel. Cette limite est volontaire pour préparer un usage sur appareil partagé. Si une autre partie de l'application a déjà initialisé Auth avec des options incompatibles, le module échoue explicitement au lieu de revenir aux options par défaut. Une session déjà en mémoire dans la même instance peut être observée.

Firebase permet de choisir les dépendances d'Auth via [`initializeAuth`](https://firebase.google.com/docs/reference/js/auth) ; les différences entre persistance locale, de session et mémoire sont décrites dans la [documentation de persistance](https://firebase.google.com/docs/auth/web/auth-state-persistence).

L'URL de retour d'envoi est fixée à `https://delalandemike-ui.github.io/Objectif-5-tractions/`. Elle ne contient ni adresse ni rôle. Le module n'accepte aucun retour fourni librement par l'utilisateur.

La finalisation exige une adresse explicitement fournie. Elle accepte uniquement les liens HTTPS directs de l'action Firebase sur `objectif-5-tractions.firebaseapp.com/__/auth/action`, ou du site sous `/Objectif-5-tractions/` (et son `index.html`). Elle refuse identifiants d'URL, domaines/chemins étrangers et paramètres `apiKey`, `mode`, `oobCode` absents ou dupliqués. La clé du lien doit correspondre à l'application. `isSignInWithEmailLink` confirme la nature du lien avant `signInWithEmailLink`. Ce contrôle local ne garantit pas qu'un code est encore valable : Firebase le décide lors de la finalisation.

Les formats enveloppés de liens mobiles ou domaines personnalisés ne sont pas implémentés ; les refuser plutôt que suivre arbitrairement une redirection. La future intégration devra vérifier le format effectivement envoyé pour ce projet.

Le [parcours Web officiel par lien e-mail](https://firebase.google.com/docs/auth/web/email-link-auth) impose que l'adresse corresponde au lien et déconseille sa récupération depuis l'URL pour terminer la connexion. Le module ne lit pas `location.href` automatiquement. Une future interface devra recevoir le lien, le conserver seulement en mémoire pour l'opération et retirer ses paramètres de la barre d'adresse après traitement. Aucun code ni lien complet ne doit être journalisé ou envoyé à un outil analytique. Cette manipulation de l'URL n'est pas activée ici.

## Erreurs et interruptions

| Situation | Traitement prévu |
| --- | --- |
| Lien expiré | `auth/expired-action-code`, nouvelle demande volontaire |
| Lien invalide ou déjà consommé | `auth/invalid-action-code`, message commun ; ne pas prétendre distinguer les deux |
| Mauvais courriel/identifiant | `auth/invalid-email` ou `auth/invalid-credential`, corriger la saisie sans extraire d'adresse de l'URL |
| Compte désactivé, quota, fournisseur/domaine non autorisé | Codes dédiés et messages contrôlés |
| SDK inaccessible/incompatible | `auth/sdk-load-failed` ou `auth/sdk-timeout` ; prochaine tentative explicite possible |
| Initialisation incompatible | `auth/already-initialized` ; diagnostic dans un contexte isolé, sans changement silencieux de persistance |
| Réseau interrompu | `auth/network-request-failed` ; consulter l'état observé avant toute nouvelle tentative |
| Autre erreur | `auth/operation-failed` ou `auth/init-failed`, sans détails sensibles |
| Double action simultanée | `auth/busy` pour envoi/finalisation/déconnexion tant que l'opération précédente n'est pas terminée |

Une réponse réseau perdue ne prouve pas que le serveur n'a rien fait : un e-mail peut avoir été envoyé ou une connexion aboutie. Le module ne rejoue aucune opération automatiquement et ne marque pas un code consommé dans le navigateur. L'observateur reste la source de l'état local de session ; il ne garantit pas l'accès serveur. Une coupure ou un rechargement avant consommation d'un lien permet de le présenter à nouveau explicitement, si Firebase l'accepte encore.

Les opérations d'envoi/finalisation ne reçoivent pas de faux mécanisme d'annulation. Si leur promesse reste en attente, la vue devra indiquer cette attente ; une déconnexion demandée simultanément est refusée jusqu'au règlement de l'opération. Une future interface ne doit pas annoncer « déconnecté » avant confirmation. Recharger détruit la session mémoire mais ne garantit pas qu'un envoi distant a été annulé.

## Création sécurisée du premier coach — mission ultérieure

Cette procédure est un plan, pas une opération exécutée. Elle nécessitera une autorisation pour les créations de compte, les envois et la configuration serveur.

1. Confirmer hors de l'application l'adresse personnelle du coach, l'identité de son propriétaire et les administrateurs habilités du projet. Sécuriser la boîte e-mail et les accès d'administration. Aucun mécanisme « le premier inscrit devient coach » ne doit exister.
2. Dans un environnement d'administration de confiance, rechercher un éventuel utilisateur Auth correspondant. Si absent, créer un seul utilisateur pour cette adresse, sans mot de passe artificiel et avec `emailVerified: false`. Si présent, contrôler son UID et sa situation avant réutilisation. Ne pas déclarer le courriel vérifié sans preuve. L'Admin SDK peut gérer les utilisateurs depuis un environnement privilégié ([documentation](https://firebase.google.com/docs/auth/admin/manage-users)). Employer une identité d'administration gérée ou des identifiants hors dépôt ; jamais une clé privée dans le navigateur ou Git.
3. Dans un parcours de test/intégration autorisé, envoyer volontairement un lien à cette adresse et faire terminer la connexion par le propriétaire. Vérifier côté administration l'UID attendu, le courriel vérifié et l'absence de désactivation. L'accès aux sportifs reste fermé pendant cette phase. Le lien prouve l'accès à la boîte, pas le rôle coach.
4. Par une opération administrative atomique de création du document unique `settings/access`, définir par exemple `{ coachUid: UID_CONFIRME, active: true }`. Si ce document existe déjà, arrêter et examiner la situation ; ne jamais l'écraser automatiquement. Le chemin unique garantit qu'une seule valeur d'UID coach est active dans cette stratégie. Aucun bouton client ni endpoint public de bootstrap ne doit attribuer cet UID.
5. Les futures règles refuseront toutes les écritures clientes sur ce document. Les fonctions autorisées n'exposeront aucune opération permettant de choisir soi-même le coach. Les opérateurs IAM de confiance restent capables de changer la configuration : leur périmètre doit être réduit et les changements audités.
6. Un claim `coach` n'est pas nécessaire pour cette stratégie. S'il est ajouté ultérieurement, seul l'Admin SDK l'attribue et l'UID actif du document reste obligatoire pour l'autorisation. Une variable, un champ de profil ou un claim décodé uniquement dans l'interface ne confère aucun droit.
7. Prévoir révocation, perte de boîte et remplacement du coach : désactiver d'abord l'accès dans `settings/access`, révoquer ses sessions par administration si nécessaire, puis remplacer l'UID par une procédure contrôlée. Ne pas ajouter un deuxième coach actif pour contourner un problème de récupération.

## Autorisations serveur avant les résultats des sportifs

L'authentification seule ne doit jamais ouvrir une collection Firestore. Conserver les règles actuelles de refus global jusqu'à une mission dédiée avec tests Emulator Suite.

Pour une future lecture Firestore par le coach : exiger `request.auth != null`, courriel vérifié, `request.auth.uid` égal au `coachUid` actif lu par la règle dans `settings/access`, et relation active `coaches/{coachUid}/athletes/{athleteUid}` pour chaque sportif visé. Prévoir des requêtes compatibles avec ces conditions ; les règles ne filtrent pas une liste globale après lecture. Les sportifs ne lisent/écrivent que leurs propres chemins validés. Relations, invitations et configuration d'accès restent hors écriture cliente. Les accès internes des règles à un document ne nécessitent pas de rendre ce document public ([conditions des Security Rules](https://firebase.google.com/docs/firestore/security/rules-conditions)).

Pour les futures fonctions d'invitation/acceptation : vérifier un vrai jeton Firebase du bon projet, son UID et `email_verified: true` côté serveur, puis consulter la même source d'autorisation active. Pour les endpoints HTTP privilégiés du coach, vérifier le Bearer token avec l'Admin SDK en activant le contrôle de révocation/désactivation (`verifyIdToken(token, true)`) ; pour les callable functions, vérifier le contexte Auth fourni puis les droits métier et prévoir le même contrôle renforcé pour les opérations coach. Les lectures d'un suivi exigent aussi la relation active avec le sportif concerné. Ne pas accepter d'UID, rôle ou courriel de confiance dans le corps client. L'Admin SDK contourne les règles Firestore : les fonctions doivent vérifier elles-mêmes les relations et les droits. La [vérification officielle des ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens) ne remplace pas ces contrôles métier.

La révocation d'une relation ou du coach bloque les futures requêtes serveur, mais n'efface pas une donnée déjà téléchargée sur un appareil. Le module préparé ne lit aucune relation et ne répond jamais « coach autorisé ». Les tests du présent module ne constituent donc pas des tests d'autorisation serveur ; ceux-ci seront obligatoires avant toute ouverture de données.

## Vérifications et limites

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-auth-tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-firebase-tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-tests.ps1
```

Le banc Auth importe le module ES réel depuis un Blob et injecte un SDK simulé dans un profil Edge isolé. Aucun chargement du vrai SDK Auth, envoi e-mail ou compte réel n'est nécessaire. Les cas couverts sont l'initialisation volontaire/mémoire, l'envoi, la finalisation, l'observation/désabonnement, la déconnexion, les saisies et liens refusés, les erreurs de code/quota/compte, les actions concurrentes et une réponse perdue après un changement d'état.

Résultats exécutés pour cette mission : **10 groupes Auth, 7 groupes Firebase et 7 groupes de non-régression réussis**, avec `ALL PASSED` et code de sortie 0 pour les trois lanceurs. `git diff --check` ne signale aucune erreur. Les empreintes SHA-256 de `index.html` et `sw.js` sont identiques à celles relevées au début de la mission : `C90A303BEAFDF075C0E74FF909801F7C57D572A52A2594632820FBCE899725F5` et `C92365E098ED7FE1B34AC7DBA9755C1E69C70C2E5DD69FF7C1F83E4A7589BACE`. Le statut Git modifié de `index.html` est celui de la mission 2, conservé.

Restent à vérifier lors d'une mission autorisée : import HTTP du vrai SDK Auth et compatibilité de sa version, format réel des liens, configuration des domaines, livraison et réutilisation de codes sur un environnement de test, comportement réseau réel et mobile. Aucun test actuel ne garantit les règles, les droits IAM, les opérations Admin ou les restrictions de la clé du projet. Le service worker existant reste un préalable à traiter avant l'intégration au site. Les données, séances, résultats et fichiers applicatifs existants ne sont pas modifiés.

La mission s'arrête à la préparation et aux tests simulés. Toute intégration, création de compte, envoi réel, attribution d'UID coach, règle Firestore, commit, push ou déploiement attend une nouvelle validation.
