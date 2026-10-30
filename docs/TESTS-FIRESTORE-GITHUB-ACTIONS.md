# Missions 3E et 3E-BIS — tests Firestore dans GitHub Actions

Date : 30 octobre 2026. Branche locale vérifiée : `developpement-coach`.

## Solution recommandée et statut

GitHub Actions permet de lancer les 24 scénarios avec le véritable Firestore Emulator dans une machine Linux temporaire. Node, Java, Firebase CLI et Chromium sont installés uniquement dans cette machine, jamais sur l'ordinateur de l'utilisateur. Aucun projet Firebase réel ni secret de production n'est nécessaire.

Le workflow `.github/workflows/firestore-security-manual.yml` est **préparé localement, non publié et non exécuté**. Les règles restent un brouillon non validé par le moteur. Les modifications applicatives précédentes sont conservées ; `index.html`, `sw.js`, les 12 séances et `tractions-v2` ne changent pas.

## Lancement automatique sur la branche de développement

La mission 3E-BIS ajoute `push.branches: [developpement-coach]` au workflow existant. Un futur push contenant ces fichiers sur cette branche pourra déclencher les tests dans **le dépôt actuel**, sans modification de `main` et sans second dépôt. Le workflow est lu depuis le commit concerné par le push ; ce déclencheur n'exige pas sa présence sur la branche par défaut. Voir les [événements et filtres GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).

Le filtre ne vise ni les autres branches, ni les tags. Aucun filtre de chemin ne limite les tests : chaque push admissible sur cette branche est concerné. Une seconde garde dans le job refuse un événement autre que `push`/`workflow_dispatch` et exige `refs/heads/developpement-coach`. Le fichier conserve son nom `firestore-security-manual.yml` pour éviter un renommage inutile ; son nom affiché devient **Firestore - securite et non-regression (developpement)**.

Un push réel reste une opération future soumise à autorisation. GitHub Actions doit être activé et les actions utilisées autorisées par la politique du dépôt ; un commit demandant explicitement de sauter la CI peut empêcher le lancement. Le déclenchement préparé ne garantit pas que les tests réussiront.

## Déclenchement manuel conservé pour plus tard

GitHub exige qu'un workflow `workflow_dispatch` existe sur la **branche par défaut** avant de pouvoir le déclencher. Choisir ensuite une autre branche dans « Run workflow » est possible, mais ne supprime pas cette condition. Voir la [procédure officielle GitHub](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow?tool=webui).

La référence locale `origin/HEAD` pointe vers `origin/main`. C'est un indice local, pas une vérification en direct des paramètres GitHub. Si `main` est effectivement la branche par défaut et ne contient pas ce workflow, le bouton manuel n'est pas garanti disponible. Un appel CLI/API avec `--ref developpement-coach` ne contourne pas cette exigence. Cela ne bloque pas le nouveau déclenchement sur push.

La proposition de dépôt dédié de la mission 3E est remplacée par le déclenchement sur push demandé en 3E-BIS. Aucun second dépôt, changement de branche par défaut ou modification de `main` n'est prévu.

## Prérequis vérifiés et choix de versions

| Élément | Choix du workflow | Motif |
| --- | --- | --- |
| Runner | `ubuntu-24.04`, hébergé par GitHub | Environnement temporaire, pas de runner personnel |
| Node.js | Branche 24, avec garde ≥ 24.12.0 | Exigence de `@firebase/rules-unit-testing` 6.0.0 |
| Java | Temurin 21 | Anticipe/supporte l'exigence Java 21 de Firestore Emulator |
| Firebase CLI | `firebase-tools` 15.34.2 | Démarrage et arrêt du moteur via `emulators:exec` |
| SDK de tests | `firebase` 13.1.0 et `@firebase/rules-unit-testing` 6.0.0 | Dépendance pair `firebase ^13.0.0` compatible |
| Navigateur | Playwright 1.56.1 et son Chromium | Exécuter les bancs DOM existants sous Linux |
| Analyse YAML | `yaml` 2.8.1 | Vérification de syntaxe YAML et des garde-fous dans le runner |

Les métadonnées publiques npm de ces cinq dépendances ont été lues sans installation. Le manifeste officiel de la [bibliothèque de tests Firebase](https://github.com/firebase/firebase-js-sdk/blob/main/packages/rules-unit-testing/package.json) précise ses exigences Node et sa dépendance pair. La [documentation Firestore Emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore) recommande Java 21 et décrit les projets `demo-` sans ressources réelles. Les anciennes valeurs minimales d'une page générale d'Emulator Suite ne suffisent donc pas à choisir les versions de cette suite.

`tests/package.json` est privé et ne concerne que les tests. Les versions directes sont exactes. Aucun `node_modules` ni lockfile n'a été produit localement. Le premier workflow utilisera `npm install --ignore-scripts --no-audit --no-fund` et conservera son `tests/package-lock.json` en artefact. Les dépendances transitives ne sont pas encore figées entre deux premières exécutions : après un premier run validé, examiner et publier ce lockfile avec autorisation, puis envisager `npm ci`. Les tags d'actions et la branche Node 24 peuvent aussi évoluer ; leurs versions peuvent être figées plus finement lors de cette revue.

## Ce que le workflow fera

1. Accepter seulement `push` ou `workflow_dispatch` et refuser toute branche autre que `developpement-coach`.
2. Récupérer le commit du déclenchement en lecture seule, sans conserver les identifiants Git dans la copie. Le rattachement local au nom de branche se fait uniquement dans le runner jetable, sur le même SHA, sans commit ni push.
3. Préparer Node 24 et Java 21, puis les dépendances de tests dans `tests/node_modules`. Aucun SDK n'est ajouté au site.
4. Analyser le YAML avec `tests/ci/check-workflow.mjs` : clés uniques, déclencheur, branche, permissions, versions, projet fictif, chemin réel du fichier de règles, garde émulateur et nombre de scénarios. Exécuter aussi les contrôles PowerShell statiques existants. Ces étapes ne sont pas une validation des règles.
5. Lancer uniquement Firestore sur `127.0.0.1:8080` via la configuration existante `tests/firestore/firebase.json`, dans le projet **demo-objectif-5-tractions**. `emulators:exec` charge les règles locales et lance les 24 scénarios Node, puis arrête l'émulateur.
6. Installer Chromium dans le runner et exécuter `tests/ci/run-browser-tests.mjs`. Ce lanceur réutilise sans les modifier `regression.html` (7 groupes), `firebase-config.html` (7 groupes) et `auth.html` (10 groupes). Il vérifie les nombres attendus et bloque les requêtes HTTP externes et les vrais service workers dans ces bancs simulés.
7. Afficher le statut de chaque catégorie dans le résumé GitHub ; conserver journaux TAP Firestore, comptes rendus navigateur, journaux d'émulateur, versions installées et lockfile de résolution pendant 7 jours.

Commande moteur prévue, exécutée depuis `tests` dans le runner :

```sh
./node_modules/.bin/firebase emulators:exec --non-interactive \
  --project demo-objectif-5-tractions --config firestore/firebase.json \
  --only firestore \
  'node --test --test-concurrency=1 --test-reporter=tap firestore/security.test.mjs'
```

Le fichier de tests impose toujours `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, fourni par le CLI. Les contextes Auth et les données sont fictifs ; aucun compte Auth réel n'est créé. Le [guide officiel des tests de règles](https://firebase.google.com/docs/firestore/security/test-rules-emulator) décrit l'évaluation des règles par l'émulateur. La [documentation Playwright CI](https://playwright.dev/docs/ci-intro) décrit l'installation des navigateurs dans GitHub Actions.

Le job est limité à 25 minutes. Aucun `continue-on-error` ne masque les échecs ; `pipefail` préserve les codes d'erreur malgré les journaux `tee`. La non-régression peut encore être exécutée après un échec du moteur, mais le job reste en échec. Un échec de compilation ou de prérequis ne doit jamais être annoncé comme « 24 scénarios exécutés » : consulter les nombres réellement rapportés dans les journaux.

## Garanties de périmètre

- Déclenchement automatique sur les seuls push de `developpement-coach`, manuel conservé ; aucun événement `pull_request` ou planification.
- Permissions GitHub limitées à `contents: read`, sans secret Firebase, connexion Google, compte de service, OIDC ou jeton Firebase.
- Aucune commande de déploiement Firebase ni action de publication GitHub Pages, aucune modification Console, aucun script de création de compte ni d'envoi d'e-mail. Les permissions non déclarées, notamment Pages et OIDC, ne sont pas accordées à ce workflow.
- Projet fictif `demo-`, émulateur local uniquement, interface d'administration de l'émulateur désactivée.
- Les scripts d'installation npm sont ignorés ; le téléchargement explicite de Chromium et de l'émulateur concerne seulement le runner temporaire.

Le téléchargement des outils exige un accès réseau dans le runner. GitHub Actions doit être autorisé dans le dépôt et les actions utilisées admises par ses politiques. Les quotas/minutes GitHub éventuels dépendent du compte et du dépôt ; rien n'est activé ni facturé par la préparation locale.

## Procédure de lancement depuis GitHub — après autorisation

1. Faire valider les fichiers locaux. Un futur commit et push sur `developpement-coach` nécessiteront une autorisation distincte ; aucun envoi n'est effectué ici. Inclure les sources, les règles, les 24 scénarios, les bancs navigateur, les scripts CI, `tests/package.json` et le workflow.
2. Avant ce futur push, vérifier dans GitHub que les Actions sont autorisées. Contrôler aussi les autres workflows et la source de publication Pages du dépôt : ce workflow de tests ne déploie rien, mais ne peut pas empêcher un mécanisme de publication indépendant déjà configuré de réagir à un push. Si cette branche sert déjà à publier Pages, résoudre ce point avant le push, sans changer les paramètres pendant la présente mission.
3. Après un push autorisé sur `developpement-coach`, ouvrir **Actions** et sélectionner **Firestore - securite et non-regression (developpement)**. Le lancement est automatique : inutile d'utiliser **Run workflow**. Filtrer la branche `developpement-coach` et l'événement `push` si nécessaire.
4. Ouvrir l'exécution correspondant au commit envoyé et vérifier son SHA. Le déclencheur manuel reste une option ultérieure si GitHub le rend disponible selon sa condition de branche par défaut ; ce n'est pas la procédure requise ici. Aucun secret ni paramètre de projet réel n'est à fournir.
5. Ouvrir l'exécution puis le job **verify**. Examiner l'installation des outils, les contrôles, l'étape **Executer les 24 scenarios dans Firestore Emulator** et les étapes Chromium. Vérifier que le SHA affiché correspond exactement à la version approuvée.
6. Dans **Summary**, lire les statuts séparés. Télécharger l'artefact **verification-firestore-…** pour les logs et le lockfile. Vérifier les résultats TAP, y compris le nombre exécuté, les échecs, les skips ou les erreurs de hooks.
7. Si une étape échoue, conserver le log et corriger localement dans une mission dédiée. Une nouvelle exécution exige que les corrections aient été publiées avec autorisation. Une exécution verte valide cette version testée, sans publier les règles et sans autoriser un déploiement ultérieur.

## Vérifications réellement faites pendant les missions 3E et 3E-BIS

- Branche et état Git examinés ; fichiers de l'émulateur et 24 déclarations de scénario relus.
- Métadonnées des dépendances lues et compatibilité Node/Firebase vérifiée ; aucune installation locale.
- **11 contrôles statiques CI réussis** via `tests/ci/check-preparation.ps1`.
- **16 contrôles statiques de règles réussis** via `tests/firestore/check-preparation.ps1`.
- `git diff --check` sans erreur ; empreintes des deux fichiers applicatifs conservées.

En mission 3E-BIS, les deux contrôleurs CI ont été adaptés aux deux événements, au filtre exact de branche et à l'absence d'actions Pages. Les 11 contrôles statiques CI et les 16 contrôles statiques des règles ont été rejoués avec succès. Le contrôle du workflow dans le runner vérifiera aussi, via le parseur YAML, que la section `push` ne contient que la liste exacte `developpement-coach`.

**Non exécutés ici :** parseur YAML Node, lanceur Chromium Linux, installation des dépendances, compilation des règles, les 24 scénarios moteur, workflow GitHub. Les scripts nouveaux sont préparés et relus, mais leur première exécution réelle peut révéler un problème de chemin, de dépendance, de requête ou de règle ; il faudra l'analyser sans le masquer. Les contrôles statiques PowerShell ne valident pas toute la syntaxe GitHub Actions ou JavaScript.

Les tests navigateur conservent les limites des bancs précédents : stockage, téléchargement et hors connexion simulés. La comparaison pédagogique existante utilise `HEAD` comme référence ; elle ne remplace pas une revue du programme contre une version précédemment approuvée. Ces limites n'empêchent pas l'exécution indépendante du véritable moteur de règles.

Conclusion : **le workflow pourra se déclencher lors d'un futur push autorisé sur `developpement-coach`**, sans le placer sur `main` et sans second dépôt, sous réserve des politiques Actions du dépôt. Les étapes moteur et non-régression sont câblées, mais leur exécution effective et leurs résultats restent à constater dans GitHub. Rien n'a été publié ou lancé à distance. Toute publication et toute autre opération attend validation.
