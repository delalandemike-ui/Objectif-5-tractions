# Mission 2 — préparation du code

Date : 30 octobre 2026. Référence : [architecture de la mission 1](ARCHITECTURE-MULTISPORTIFS.md).

## Périmètre réalisé

La branche vérifiée est `developpement-coach`. Le document de mission 1 était déjà présent mais non suivi par Git ; il a été conservé sans modification. Aucun compte, service Firebase, dépendance, commit, push ou déploiement n'a été créé.

`index.html` conserve le programme, l'échauffement, les consignes et le JavaScript intégré. Il ajoute la lecture contrôlée du suivi, des messages d'état et un bouton d'export JSON. `sw.js` est inchangé. Aucune URL publique ni aucun chemin de publication n'a été modifié. Le chemin cible imposé est `/Objectif-5-tractions/` : l'exemple `/Objectif-5-tractions-git/` du document de mission 1 devra être corrigé lors d'une future révision autorisée ; il ne doit pas servir à configurer Auth.

## Lecture et protection des données

La clé reste exactement `tractions-v2`. Le chargement ne fait aucune écriture, même si la clé est absente ou invalide. Une donnée valide conserve ses champs supplémentaires et la forme historique des champs connus : tableau de séances, score sous forme de chaîne et notes textuelles.

La validation exige un objet avec `done` contenant des entiers distincts de 1 à 12, `score` vide ou chaîne de chiffres représentant une valeur de 0 à 30, et `notes` textuel. Elle n'effectue aucune conversion, déduplication ou réparation automatique. Des données historiques non conformes, y compris un score décimal, restent intactes et exportables.

En cas de JSON invalide, structure incorrecte ou lecture inaccessible, les commandes de modification du suivi sont désactivées et un avertissement est affiché. Les séances restent consultables. Les compteurs neutres affichés dans ce cas ne constituent pas une réinitialisation du stockage ; l'avertissement précise que les données ne peuvent pas être chargées.

Les écritures demandées par les commandes habituelles restent sur la même clé. Les erreurs de quota ou de permission sont interceptées ; la valeur précédemment enregistrée est conservée et les modifications encore affichées peuvent être exportées. Une différence de valeur brute depuis la lecture précédente bloque l'écriture afin de limiter les écrasements entre onglets. Cette comparaison ne constitue pas une transaction atomique : deux écritures parfaitement simultanées restent une limite de `localStorage`. La résolution multisportifs/multiappareils demeure un travail futur.

## Export volontaire

Le bouton « Exporter mes données (JSON) » déclenche la préparation et le téléchargement d'un fichier local. Aucun export ni envoi réseau n'a lieu au démarrage. L'application ne prétend pas pouvoir confirmer que le navigateur a effectivement enregistré le fichier.

Le fichier contient :

- `format`, `version`, `exportedAt` et `key` pour identifier la sauvegarde ;
- `raw` : valeur exacte de `tractions-v2`, espaces inclus, ou `null` si la clé est absente ;
- `valid` et `data` : résultat de validation et objet validé, ou `null` si invalide ;
- `displayedData` : état affiché, utile pour conserver une saisie non enregistrée après un échec d'écriture.

Un JSON local invalide n'empêche pas l'export : il est conservé comme chaîne dans un fichier JSON valide. Un stockage totalement inaccessible empêche l'export de la source et produit un message explicite. Aucun import n'est activé. Le fichier contient des notes personnelles et doit être conservé de façon privée. En cas d'anomalie, `raw` est la copie de référence ; `displayedData` peut être un état neutre de présentation.

## Modularisation reportée et interfaces futures

Le service worker ne précharge que `./` et `./index.html`. Extraire maintenant le script vers un fichier externe créerait un nouveau prérequis hors connexion qui n'est pas garanti, particulièrement avec un ancien cache. La séparation physique est donc reportée à une mission autorisant une mise à jour coordonnée du worker. Aucun fichier de module vide ou import inactif n'a été ajouté.

Organisation proposée pour cette future extraction, sans activation actuelle :

| Module futur | Responsabilité | Interface envisagée |
| --- | --- | --- |
| `program.js` | Contenu immuable des 12 séances | Lecture seule des séances existantes |
| `storage-local.js` | Lecture, validation, sauvegarde et export historiques | `readLocalData()`, `validLocalData(value)`, export sur action utilisateur |
| `storage-sync.js` | Espaces par UID, file durable, révisions et conflits | Lecture du suivi, opération locale, état de synchronisation ; aucun effacement implicite |
| `migration.js` | Aperçu, rattachement explicite, sauvegarde et import idempotent | Préparer, confirmer, reprendre un import |
| `auth.js` | Connexion, déconnexion et identité Firebase | Observation de session, demande de connexion, déconnexion |
| `coach.js` | Relations autorisées, lecture des suivis et commandes d'invitation | Liste des sportifs autorisés, consultation, demande d'invitation/révocation |
| `app.js` | Raccordement des vues et événements | Initialisation et affichage des états |

Auth ne devient pas un prérequis du programme local. `coach.js` ne décide jamais seul des droits : Firestore et les fonctions de confiance les vérifient selon la mission 1. Aucun SDK, secret, configuration Firebase ou appel à ces futurs modules n'est présent dans l'application actuelle.

Avant extraction, il faudra tester les mises à jour depuis le worker actuel, précharger les ressources nécessaires, définir leur versionnement et exclure les API du cache applicatif. La présente mission ne change pas sa stratégie cache-first : une installation existante peut continuer à afficher l'ancien HTML et ne pas proposer immédiatement le bouton d'export. Ne pas conseiller d'effacer les données du site pour forcer une mise à jour.

## Tests exécutés

Commande depuis la racine, sous Windows avec Microsoft Edge installé :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-tests.ps1
```

Le lanceur utilise uniquement PowerShell, Git et Edge existants. Il refuse une autre branche, injecte les sources locales dans le banc de test, crée un profil Edge temporaire isolé et utilise le DOM réel du navigateur dans des iframes. Il n'utilise jamais le stockage du site public ni le profil habituel de navigation. Les fichiers temporaires et journaux sont conservés au chemin indiqué par le lanceur pour inspection. Le lancement d'un navigateur peut nécessiter une autorisation selon l'environnement.

Résultat obtenu : **7 groupes PASS, ALL PASSED**, dans Edge 156.0.4314.50.

| Groupe | Vérification réalisée |
| --- | --- |
| Programme protégé | Comparaison du tableau `S`, de l'échauffement et des consignes avec `HEAD` ; comparaison du worker avec `HEAD` |
| 12 séances | Sélection et détail des 12 séances, double validation sans doublon, progression jusqu'à 100 %, retrait individuel des 12 séances jusqu'à 0 % |
| Score et notes | Saisie 5, 0, vide, affichage historique, notes accentuées et multiligne, rechargement sans écriture initiale |
| Export | Aucun téléchargement au démarrage, un téléchargement au clic, contenu du Blob JSON, valeur brute exacte et champs inconnus préservés |
| Données invalides | Chaîne vide, JSON cassé, null, tableau, objet incomplet, doublon, ID hors bornes ou textuel, score mal typé/hors bornes, notes invalides ; absence d'écrasement et export brut |
| Erreurs de stockage | Lecture bloquée, échec d'écriture simulant un quota, export de la saisie non enregistrée, conflit avec une autre capture |
| Hors connexion simulé | Exécution des vrais gestionnaires de `sw.js` avec Cache API simulée, réseau rejeté, réponse HTML du cache et repli ; absence de script externe ou initialisation Firebase dans le HTML |

Les tests comparent le contenu pédagogique au `HEAD` de la branche au moment de l'exécution ; ils ne remplacent pas une revue du diff contre la version validée avant un futur commit. Les groupes sont automatisés, sans dépendance ajoutée.

## Limites et contrôles restant avant une livraison

`localStorage`, le clic de téléchargement et l'enregistrement du worker sont simulés dans les tests d'interface. Le Blob produit est réellement lu et parsé, mais le téléchargement sur disque n'est pas testé. Le test hors connexion ne constitue pas un essai de cycle de vie réel du service worker, de cache évincé ou d'installation GitHub Pages. Aucune validation sur téléphone, Safari ou Firefox n'a été effectuée. L'accès au site public et sa configuration ne sont pas modifiés ni vérifiés.

Avant une future livraison autorisée, effectuer dans un profil de test distinct :

1. Charger une copie du site en HTTP local ou HTTPS avec la même structure de chemin, saisir un suivi fictif et vérifier le téléchargement JSON réel.
2. Attendre l'installation et le contrôle effectifs du worker, fermer/recharger la page puis couper le réseau ; consulter les 12 séances, modifier le suivi et exporter.
3. Vérifier la persistance après fermeture/réouverture, les erreurs réelles de stockage, et les limites entre plusieurs onglets.
4. Tester une installation possédant déjà l'ancien cache : constater le risque d'ancien HTML et valider une future stratégie de mise à jour dans une mission dédiée à `sw.js`.

La mission s'arrête à ces modifications locales. Toute configuration Firebase, modification du worker, mise en ligne, commit ou push attend une autorisation ultérieure.
