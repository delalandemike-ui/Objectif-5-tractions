# Missions 3A et 3B — préparation et configuration indépendante de Firebase

Date : 30 octobre 2026. Branche vérifiée : `developpement-coach`.

Références locales : [architecture multisportifs](ARCHITECTURE-MULTISPORTIFS.md) et [préparation du code](PREPARATION-CODE-MULTISPORTIFS.md).

## État et périmètre

Selon les informations fournies, le projet `objectif-5-tractions` contient l'application Web `Objectif-5-tractions-web`. Les fournisseurs e-mail/mot de passe et lien e-mail sont activés, le domaine `delalandemike-ui.github.io` est autorisé et Firestore refuse toutes les lectures/écritures. Ces paramètres distants n'ont pas été inspectés ni modifiés pendant cette mission.

Le module `js/firebase-config.js` est créé mais n'est référencé ni par `index.html`, ni par `sw.js`. L'application locale et son fonctionnement hors connexion restent donc identiques. Les modifications des missions précédentes sont conservées. Aucune authentification, création de compte, synchronisation, migration ou modification des règles n'est exécutée.

## Configuration Web intégrée en mission 3B

Les chaînes vides de la mission 3A ont été remplacées par les paramètres officiels fournis par l'utilisateur en mission 3B. Le module contient exactement les six champs du bloc communiqué : `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId` et `appId`. Le projet est `objectif-5-tractions`, le domaine Auth `objectif-5-tractions.firebaseapp.com` et l'identifiant Web `1:90002170931:web:07ca95c598402824dc6f46`. Aucun paramètre n'est déduit ou inventé. Aucun accès console n'a été effectué.

Cet objet est public et figé. Aucun compte de service, clé privée Admin ou secret d'envoi de courriel ne doit y être placé. Le module ne remplace pas les autorisations Firestore. Les quatre champs sont vérifiés avant tout chargement du SDK ; le `projectId` doit être `objectif-5-tractions`. Cette validation ne prouve pas que la clé ou l'identifiant d'application sont valides côté Firebase.

## Chargement et initialisation

Le module utilise l'API modulaire native du navigateur, sans npm ni bundler. Le SDK de base est importé dynamiquement depuis `https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js`, avec version figée. Ce mode CDN est documenté par [Firebase](https://firebase.google.com/docs/web/alt-setup). Cette version correspond au bloc officiel fourni et son chargement réel a été vérifié en HTTP local en mission 3B. La compatibilité avec de futurs modules Auth reste à tester avant intégration.

Importer le module ne charge pas le SDK et n'initialise pas Firebase. Seul un appel explicite à `initializeFirebase()` déclenche ces étapes. Le module ne charge ni Auth, ni Firestore, ni Analytics. Il n'appelle aucun fournisseur d'authentification et ne lit ni n'écrit le stockage du suivi.

L'initialisation utilise une application SDK nommée `objectif-5-tractions-web`. Ce nom technique local n'est pas l'identifiant `appId` de l'application enregistrée dans Firebase. Les appels concurrents partagent la même promesse ; une instance déjà créée avec ce nom et les mêmes options est réutilisée. Une configuration différente provoque un refus plutôt qu'un remplacement. Une application SDK par défaut créée par un autre code n'est pas réutilisée implicitement. Les opérations `initializeApp` et `getApps` sont décrites dans la [référence Firebase App](https://firebase.google.com/docs/reference/js/app).

Exemple pour une intégration future autorisée uniquement — aucun script de ce type n'a été ajouté au HTML :

```js
try {
  const { initializeFirebase } = await import("./js/firebase-config.js");
  const app = await initializeFirebase();
  // Le SDK de base est prêt ; aucune connexion utilisateur n'a eu lieu.
} catch (error) {
  // Afficher un état Firebase indisponible sans bloquer le programme local.
  // Traiter aussi l'échec de l'import du module local lui-même.
}
```

Le module doit être servi en HTTP(S) avec un type MIME JavaScript, pas ouvert directement via `file://` pour une utilisation réelle. Utiliser des chemins relatifs compatibles avec `/Objectif-5-tractions/`. L'exemple `/Objectif-5-tractions-git/` de la mission 1 ne doit pas être repris pour le site public ou les retours d'authentification.

## Gestion des erreurs

Les erreurs retournées sont des rejets de promesse, à intercepter par l'appelant. Aucun message d'interface ou journal contenant des données personnelles n'est ajouté par ce module.

| Code | Signification |
| --- | --- |
| `firebase/config-incomplete` | Champs absents, mal typés, vides ou mauvais projet ; aucun chargement SDK |
| `firebase/sdk-load-failed` | Import CDN impossible ou interface SDK incompatible |
| `firebase/sdk-timeout` | Chargement dépassant 12 secondes |
| `firebase/config-conflict` | Instance SDK de même nom déjà configurée différemment |
| `firebase/init-failed` | Erreur lors de la récupération/création de l'instance |

Après un échec, un nouvel appel volontaire est possible ; aucune reprise automatique n'est lancée. Le délai libère l'attente de l'application mais n'annule pas l'import réseau natif. Une fois le délai dépassé, le module n'appelle pas tardivement `initializeApp`. Le navigateur conserve ses propres règles de cache des imports, y compris certains échecs : un nouvel appel n'assure pas un nouveau téléchargement et un rechargement pourra être nécessaire. Les erreurs de résolution du module local doivent être traitées au niveau du futur appelant, avant l'accès aux exports.

## Étapes avant une future connexion coach/sportifs

1. Les valeurs Web sont intégrées et l'initialisation HTTP locale est vérifiée en mission 3B. Valider séparément l'intégration à l'application avant de la réaliser. Ne pas modifier l'adresse publique ni effacer `tractions-v2`.
2. Préparer, dans une mission autorisant la modification du worker, son traitement des API et des modules. Aujourd'hui il peut conserver du HTML ancien, mettre en cache les GET externes ou retourner du HTML à la place d'un module en cas de panne. Ne pas intégrer Firebase au HTML avant de valider ce parcours et le maintien du programme local hors connexion.
3. Créer ensuite un module Auth séparé utilisant la même version CDN et l'instance nommée retournée ici. Définir explicitement la persistance et le traitement d'une session existante : initialiser Auth peut restaurer une ancienne session, même sans nouvel appel de connexion. Choisir avec l'utilisateur le parcours par mot de passe ou lien e-mail, puis ajouter une interface dans une mission distincte.
4. Pour le lien e-mail, prévoir l'URL de retour HTTPS exacte sous `https://delalandemike-ui.github.io/Objectif-5-tractions/`, vérifier les domaines autorisés, demander le courriel sur un autre appareil et contrôler le lien via l'API Auth. Ne pas réutiliser un courriel extrait d'un paramètre URL pour finaliser la connexion. Le parcours Web est documenté par [Firebase Authentication](https://firebase.google.com/docs/auth/web/email-link-auth). Tester lien expiré, compte existant, erreur réseau et déconnexion avant tout usage réel.
5. Désigner le coach unique dans un environnement de confiance et implémenter les invitations et relations selon la mission 1. Un compte authentifié n'est pas automatiquement coach ou sportif invité ; ne jamais déduire le rôle d'une variable du navigateur. L'activation d'un fournisseur Auth ne constitue pas un contrôle des relations de coaching.
6. Concevoir et tester les futures règles et fonctions avec des données fictives avant toute ouverture Firestore. Conserver le refus global actuel jusqu'à validation. Tester les accès croisés, la révocation et la consommation unique des invitations ; ne pas créer de comptes réels pour cette préparation.
7. Ajouter ensuite le stockage distant et la migration explicite avec export, sauvegarde brute et accord de rattachement à un UID. Une connexion ne doit ni importer ni écraser automatiquement le suivi local. La synchronisation, les conflits et l'isolation des comptes restent hors mission 3A.

## Tests reproductibles et limites

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-firebase-tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-firebase-http-tests.ps1
```

Le nouveau banc importe le véritable module ES depuis un Blob dans Edge et injecte un SDK simulé via `createFirebaseInitializer`. Il vérifie : configuration incomplète, rejet avant chargement, absence d'initialisation automatique, concurrence et réutilisation, copie de configuration, conflit, panne CDN simulée, reprise explicite, interface SDK incorrecte et échec d'initialisation. Les sources de l'application et du worker sont contrôlées pour vérifier l'absence de référence au module ; le module est contrôlé pour l'absence d'API Auth, Firestore et stockage du suivi.

Les tests unitaires avec SDK simulé ne contactent pas le projet Firebase et ne chargent pas le vrai SDK CDN. Le délai réseau de 12 secondes n'est pas exercé par ce SDK simulé. La suite de non-régression de mission 2 conserve ses limites de stockage, téléchargement et hors connexion simulés. Les profils temporaires Edge isolés et les journaux sont conservés pour inspection.

Résultats historiques de mission 3A, le 30 octobre 2026 : **6 groupes PASS pour Firebase, 7 groupes PASS pour la non-régression**.

## Test technique HTTP de mission 3B

`tests/firebase-http.html` importe le module local via HTTP, puis appelle explicitement l'unique fonction `initializeFirebase`. Cette page de test est indépendante du site et n'est référencée par aucun de ses fichiers. Elle ne contient aucune interface ou API de connexion utilisateur.

`tests/run-firebase-http-tests.ps1` démarre un serveur TCP HTTP temporaire sur `127.0.0.1` avec un port libre. Seuls la page de test et le module sont servis, sous `/Objectif-5-tractions/`, avec les types MIME adaptés. Il lance Edge sans interface dans un profil temporaire neuf, puis arrête son serveur en fin de test, y compris en cas d'échec. Aucun serveur n'est exposé sur les interfaces réseau externes. PowerShell, Git et Edge suffisent ; aucune dépendance n'est installée.

Le test utilise le vrai SDK CDN et vérifie :

- import du module local sans chargement SDK implicite ;
- téléchargement et exécution du SDK 13.1.0 depuis le CDN ;
- initialisation explicite avec les six paramètres officiels, appels concurrents et réutilisation d'une seule instance ;
- absence de chargement des SDK Auth et Firestore dans les ressources observées.

**Portée exacte :** `initializeApp` initialise un conteneur SDK ; il ne prouve pas qu'une opération distante du projet est autorisée. Ce test ne valide donc pas la clé API auprès d'Authentication, l'existence distante de l'application, les restrictions HTTP de la clé ou les règles Firestore. Aucune requête Auth/Firestore n'est implémentée. Le test ne lit ni n'écrit `tractions-v2`, n'installe aucun service worker et ne charge pas `index.html`. Le profil de test est distinct de celui contenant les résultats réels.

Résultats de mission 3B : **7 groupes Firebase simulés, 7 groupes de non-régression et 4 vérifications HTTP réelles réussis**, avec `ALL PASSED` dans les trois lanceurs. Les tests simulés ont été adaptés pour ne plus attendre une erreur de configuration vide ; ils vérifient les six valeurs fournies et leur transmission intégrale au SDK.

Les empreintes SHA-256 de `index.html` et `sw.js` sont restées inchangées, respectivement `C90A303BEAFDF075C0E74FF909801F7C57D572A52A2594632820FBCE899725F5` et `C92365E098ED7FE1B34AC7DBA9755C1E69C70C2E5DD69FF7C1F83E4A7589BACE`. Le statut Git modifié de `index.html` provient de la mission 2. Aucun second appel d'initialisation n'a été ajouté au module et aucun SDK Auth/Firestore n'a été ajouté.

Le module est prêt comme socle de la prochaine mission d'authentification indépendante, après validation. Cela ne constitue pas une validation du parcours de connexion coach/sportifs ni une autorisation de brancher le module dans le site actuel. Les questions de service worker, de retour e-mail, de persistance et de rôle du coach décrites plus haut restent à traiter.

Toute intégration au HTML, connexion de compte, modification du service worker, règle Firestore, commit, push ou déploiement attend une nouvelle validation.
