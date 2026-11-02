# Espace coach — première version locale

Branche : `developpement-coach`. Aucun commit, push, déploiement ou changement de règles pendant cette mission.

## Ouvrir la version locale

Depuis la racine du dépôt :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/serve-coach.ps1
```

Ouvrir `http://127.0.0.1:19086/index.html`, puis « Ouvrir mon espace coach ». Le serveur écoute uniquement sur loopback et sert une liste fermée de fichiers. Arrêter avec Ctrl+C. Choisir un autre port avec `-Port 19087` si nécessaire. Utiliser un profil de test isolé et une origine neuve pour éviter un ancien service worker. Ne pas effacer les données du site d'entraînement pour dépanner.

La page coach affiche un formulaire statique. Aucun SDK Firebase n'est chargé avant soumission. Le propriétaire saisit lui-même les identifiants du compte existant dans le navigateur, jamais dans un fichier ou dans la conversation. Aucun compte, invitation, courriel ou sportif n'est créé. Le fournisseur e-mail/mot de passe et cette méthode de connexion du compte existant doivent déjà être disponibles ; aucune modification Console n'est automatisée. Une restriction de domaine, de clé ou de fournisseur peut empêcher la connexion locale : elle doit alors faire l'objet d'une validation distincte.

## Identité et autorisation

Le module Auth existant est réutilisé, avec ajout de `signInWithPassword` et `refreshIdentity`. La configuration publique, le projet et la version du SDK existants sont conservés. Auth utilise exclusivement `inMemoryPersistence`. Le mot de passe est vidé du champ dès soumission et ses références transitoires sont abandonnées à la fin de l'opération. Aucun stockage ou journal applicatif ne le reçoit ; un gestionnaire de mots de passe du navigateur peut cependant proposer sa propre mémorisation.

Les règles publiées interdisent **toute lecture directe de `settings/access`**. Le navigateur ne tente pas cette lecture et ne possède aucun UID coach codé en dur. La liste `coaches/{uidConnecte}/athletes`, filtrée sur `status == 'active'`, est écoutée avec `onSnapshot`. L'autorisation de cette requête dépend de `coach()` dans les règles, donc du courriel vérifié, du `coachUid` désigné et de `active: true` dans `settings/access`. Une réponse serveur réussie constitue la confirmation de rôle, même si la liste est vide. Une réponse issue du cache ne confirme jamais ce rôle.

Chaque relation est ensuite contrôlée par lecture serveur de l'admission `athletes/{uid}` et du profil `users/{uid}`. Un refus exclut le sportif de l'affichage ; une erreur réseau bloque l'affichage au lieu de produire un faux état vide. Le nom est affiché comme texte, avec l'UID en complément ; aucun résultat sportif n'est chargé dans cette première version. Les relations révoquées sont exclues. Les noms/profils sont des instantanés relus sur changement de liste, actualisation et retour au premier plan, pas des abonnements individuels permanents.

Le tableau affiche l'identité, le statut coach, la liste ou « Aucun sportif autorisé pour le moment », une actualisation et une déconnexion. L'actualisation recharge aussi le compte Auth et son jeton afin de prendre en compte une vérification récente du courriel. Un refus, une réponse en cache ou la perte réseau masque la liste et retire le statut confirmé. La déconnexion et la sortie de page détachent les écoutes ; les réponses obsolètes sont ignorées. Une restauration depuis le cache de navigation provoque un rechargement pour repartir sans session mémorisée. Les copies déjà lues sur un appareil ne peuvent pas être révoquées rétroactivement.

Firestore est initialisé avec `memoryLocalCache()`. Aucun cache persistant, rôle dans le stockage local ou API d'écriture Firestore n'est introduit. Aucune lecture cliente des invitations et aucune attribution de privilège.

## Programme et mode hors connexion

L'unique changement dans `index.html` est la carte contenant le lien coach. Le code du suivi local, les 12 séances, l'échauffement et les consignes restent identiques. Aucune lecture, suppression ou migration de données utilisateur n'est réalisée pendant les vérifications ; les tests utilisent leur propre stockage simulé.

Le service worker précharge toujours `./` et `./index.html`. Son cache est versionné pour renouveler le HTML. Il ne traite désormais que ces chemins sans paramètres, de même origine : les modules, la page coach et les échanges Firebase restent hors cache. À l'activation, seul l'ancien cache de cette application est supprimé, sans toucher à `localStorage` ni aux caches d'autres applications. Le programme reste disponible hors connexion après installation réussie ; l'espace coach nécessite Internet. Le cycle de mise à jour d'un ancien worker dans le profil habituel n'a pas été testé en conditions réelles.

## Tests et limites

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-coach-tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-coach-http-tests.ps1 -Browser
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-auth-tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-firebase-tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-verification-email-tests.ps1
```

Résultats locaux : 12 nouveaux groupes coach, 7 application, 10 Auth, 7 configuration et 10 vérification du courriel réussis dans Edge avec profils temporaires (46 groupes au total). Les SDK et stockages sensibles sont simulés. Le test HTTP réussit 8 vérifications et une vérification supplémentaire dans Edge : imports réels des modules locaux et formulaire utilisable, sans soumission ni chargement d'un SDK Firebase. Le test du service worker utilise des doubles de Cache API ; il contrôle le préchargement, le shell hors connexion, l'exclusion des ressources privées et la conservation des caches tiers.

La CI est préparée pour ces 46 groupes, sans exécution distante pendant cette mission. Les 24 scénarios Firestore et les règles restent inchangés. Leur relance locale est bloquée par l'absence de Node ; aucun outil n'est installé. Les nouveaux appels SDK et le parcours du compte réel n'ont pas été testés contre Firebase. Les succès de l'ancien run GitHub ne valent pas validation de cette nouvelle intégration. Le contrôle lexical Firestore et le contrôle statique CI passent ; ils ne remplacent pas le moteur.

La lecture directe de `settings/access` demandée initialement est donc remplacée par son évaluation dans les règles, sans les modifier. L'essai réel doit être effectué par le propriétaire du compte existant après revue de cette version ; aucun identifiant réel n'a été utilisé par l'agent. Aucun secret privé, compte de service ou mot de passe n'est ajouté.
