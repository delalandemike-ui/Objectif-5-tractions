# Mission 3F — correction du répertoire projet de l'émulateur

Branche : `developpement-coach`. Aucun déploiement, commit ou push effectué.

## Cause

La configuration était placée dans `tests/firestore/firebase.json`, avec `firestore.rules` défini à `../../firebase/firestore.rules`. Le CLI détermine son répertoire de projet à partir de la configuration ; cette référence remonte hors du projet Firebase imbriqué et son contrôle de confinement la refuse. Le [code officiel du CLI, fonction `Config.path`](https://github.com/firebase/firebase-tools/blob/main/src/config.ts), normalise le chemin et rejette les références extérieures au répertoire du projet.

Les contrôles précédents vérifiaient seulement que le chemin résolu existait : ils n'imposaient pas que les règles restent à l'intérieur du projet Firebase. Mon hypothèse précédente, selon laquelle un chemin relatif vers les règles du dépôt suffisait, était donc incorrecte. Changer uniquement le répertoire courant du shell n'aurait pas corrigé cette configuration imbriquée.

## Correction

- Configuration déplacée à la racine : `firebase.json` référence désormais `firebase/firestore.rules`. L'ancienne configuration imbriquée est supprimée pour éviter deux sources de vérité.
- GitHub Actions exécute l'émulateur depuis la racine, avec `./tests/node_modules/.bin/firebase`, `--config firebase.json` et `tests/firestore/security.test.mjs` ; le journal reste dans `test-results/firestore.log`.
- Le lanceur PowerShell, déjà positionné à la racine, utilise aussi `--config firebase.json`.
- Les contrôleurs CI et Firestore vérifient la nouvelle configuration ; le contrôleur Node impose aussi le confinement du chemin réel dans le dépôt. Les artefacts incluent les journaux d'émulateur désormais créés à la racine.
- Les instructions existantes sont mises à jour. L'installation npm reste dans `tests/` : elle n'impose pas que l'émulateur y soit lancé.

Le chemin `../../firebase/firestore.rules` dans `security.test.mjs` reste correct : il est résolu avec `new URL(..., import.meta.url)` depuis le fichier de test, pour lire les octets des règles, et non comme un chemin de configuration du CLI. Les 24 scénarios et le contenu des règles sont conservés.

Le projet reste `demo-objectif-5-tractions`, Firestore seul sur `127.0.0.1:8080`, sans secret ni accès à la production. Aucun SDK Auth n'est ajouté et aucun fichier applicatif n'est modifié.

## Vérifications

Contrôles prévus et exécutés localement : contrôleurs statiques CI et Firestore, existence/confinement du fichier de règles, 24 déclarations de scénarios, cohérence des chemins et `git diff --check`. Les empreintes des règles, des scénarios, d'`index.html` et de `sw.js` sont comparées avant/après.

Node, Java et Firebase CLI ne sont pas installés localement pour cette mission. Aucun test moteur, parseur YAML Node ou nouveau workflow GitHub n'est exécuté ici. Le prochain run GitHub autorisé devra confirmer la levée de l'erreur de chemin, puis rapporter les résultats réels des 24 scénarios. Cette correction ne prétend pas qu'ils passent déjà.
