# Préparation de la vérification du courriel du coach

Branche : `developpement-coach`. Cette mission est distincte de la précédente correction des chemins d'émulateur, également appelée 3F.

## Périmètre

Le compte existant a été créé par l'utilisateur dans Firebase Console. Aucun compte, connexion ou e-mail réel n'est créé/envoyé pendant cette préparation. Le succès précédent des 24 scénarios Firestore et 24 groupes Chromium sur GitHub Actions est une information fournie par l'utilisateur ; aucun nouveau run distant n'est lancé ici.

La page `tests/verification-email-coach.html` et son contrôleur sont indépendants de `index.html`, `sw.js` et `js/auth.js`. Le module applicatif par lien sans mot de passe n'est pas modifié. Le test utilise uniquement un compte existant par `signInWithEmailAndPassword`, jamais une API de création de compte. Les règles et `tractions-v2` ne sont ni lus ni modifiés.

Un fichier sous `tests/` n'est pas confidentiel sur GitHub Pages : le code source peut devenir public après publication. La page est donc désactivée hors d'une origine HTTP(S) locale (`127.0.0.1`, `localhost`, IPv6 loopback). Cette restriction n'est pas une preuve de rôle et ne protège pas contre un utilisateur qui copie/modifie le code. Aucun secret n'est embarqué. Aucune page publique d'administration n'est créée.

## Parcours préparé

1. Au chargement local, seule l'interface apparaît : aucun SDK Firebase n'est chargé, aucun courriel envoyé. Hors origine locale, les contrôles restent désactivés.
2. Sur validation du formulaire, chargement explicite du SDK Auth modulaire CDN de même version que `js/firebase-config.js`, puis initialisation Auth en mémoire seule. Une instance incompatible déjà initialisée provoque une erreur, sans retour silencieux à une persistance durable.
3. Connexion du compte existant par adresse/mot de passe. Le champ mot de passe est vidé dès soumission, et la référence transitoire est vidée après succès/échec. Aucun log, stockage navigateur ou URL ne reçoit ce mot de passe. La session et les jetons sont en mémoire. Le navigateur ou son gestionnaire de mots de passe peut néanmoins proposer une mémorisation malgré `autocomplete="off"` : ne pas l'accepter pour cet essai.
4. Vérifier l'adresse du compte connecté affichée. Cocher la confirmation explicite puis cliquer « Envoyer l’e-mail de vérification ». La connexion seule ne déclenche aucun envoi.
5. `sendEmailVerification(user)` utilise le gestionnaire de confirmation hébergé par Firebase, sans URL de retour locale personnalisée et sans envoyer de lien de connexion passwordless. Aucun paramètre sensible n'est repris de l'URL locale. La procédure suit les [API de gestion des utilisateurs Firebase](https://firebase.google.com/docs/auth/web/manage-users).
6. Ouvrir le message dans la boîte du coach, éventuellement les indésirables, et suivre le lien Firebase pour confirmer. Si le lien est expiré ou déjà utilisé, consulter d'abord l'état du compte ; demander ensuite volontairement un nouveau message si nécessaire. La page locale ne consomme ni ne journalise le code du lien.
7. Revenir sur la page locale et cliquer « Actualiser l’état du compte ». Le SDK exécute `reload(user)`, puis, si l'adresse est vérifiée, `getIdToken(user, true)` pour rafraîchir aussi le claim d'identité. Le jeton n'est pas affiché. En cas d'erreur de renouvellement, le message signale l'échec même si le compte rechargé est déjà vérifié ; réessayer l'actualisation explicitement. API décrites dans la [référence Firebase Auth](https://firebase.google.com/docs/reference/js/auth).
8. Se déconnecter, fermer la page, puis arrêter le serveur local. Aucun résultat d'entraînement n'est concerné.

`emailVerified: true` prouve l'étape de vérification Firebase, pas le rôle coach. La correspondance avec l'UID de `settings/access`, son activation et les relations serveur restent nécessaires pour accéder à des sportifs. Cette page ne lit ni n'écrit Firestore et n'attribue aucun privilège.

## Prévention des envois répétés et erreurs

- Confirmation décochée après chaque tentative ; bouton désactivé pendant les opérations ; aucun retry automatique.
- Délai local de **120 secondes après le début de chaque tentative**, y compris après erreur réseau : la réponse peut avoir été perdue alors que Firebase a envoyé le message.
- Le délai est conservé pendant la vie de la page, même après déconnexion/reconnexion. Après attente, revenir sur l'onglet ou cocher à nouveau la confirmation actualise le bouton ; aucun polling réseau ni envoi programmé.
- Un compte déjà vérifié ne peut plus demander de message depuis cette interface.
- Le délai est une protection d'interface, pas un quota serveur : recharger la page ou changer d'onglet/appareil peut le contourner. Les limites Firebase restent applicables ; ne pas multiplier les tentatives et traiter `auth/too-many-requests` en attendant davantage.
- Erreurs de saisie/compte, réseau, quota, méthode désactivée, SDK inaccessible et besoin de reconnexion : messages contrôlés, sans afficher les messages bruts du SDK. Une opération encore en attente ne doit pas être présentée comme annulée.
- La déconnexion Firebase ne déconnecte pas les autres appareils ; la mémoire seule implique une nouvelle connexion après rechargement. Aucun mot de passe n'est demandé par e-mail ou ajouté à Git.

## Utilisation réelle ultérieure — validation requise

Ne pas exécuter ce parcours avec de vrais identifiants pendant la présente mission.

Après autorisation explicite de connexion/envoi réel, ouvrir un terminal à la racine du dépôt puis lancer, sans installer Node ou un serveur externe :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/serve-verification-email-coach.ps1
```

Le serveur écoute uniquement sur `127.0.0.1:19085`, ne sert que la page, son contrôleur et la configuration Web publique, et ne journalise pas le contenu des requêtes. Il ne sert ni l'application ni le service worker et ne lance aucune action Firebase. Ouvrir manuellement `http://127.0.0.1:19085/tests/verification-email-coach.html`. Un autre port peut être choisi avec `-Port 19086` si nécessaire. Utiliser un profil de navigateur isolé sans extensions de capture de formulaires et une origine locale neuve, sans ancien worker.

Si Firebase ou les restrictions de clé refusent cette origine, arrêter et faire valider séparément l'autorisation de domaine/local ou la stratégie de test. Ne pas modifier la Console ou élargir les restrictions automatiquement. Une éventuelle URL de retour personnalisée exigerait une vérification distincte des domaines autorisés ; elle n'est pas ajoutée ici.

Saisir l'adresse et le mot de passe uniquement dans la page locale, jamais dans une commande, un fichier, une capture, un journal ou un message de discussion. Ne pas transmettre ces valeurs pour faire exécuter le test par un agent. Aucun lien de cette page n'est ajouté au site public.

## Tests

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-verification-email-tests.ps1
```

Neuf groupes préparés : origine distante bloquée, absence d'action automatique, connexion et effacement du champ, confirmation/délai/double clic, erreur réseau sans rejeu, `reload` et renouvellement du jeton, déconnexion, message d'erreur sans détail sensible, opérations concurrentes. Les adresses sont fictives, les SDK sont entièrement simulés et les accès au stockage de l'iframe sont rendus interdits dans les tests.

Le lanceur local utilise Edge et un profil temporaire isolé ; il ne charge pas le vrai SDK Auth. Le lanceur CI réutilise ce même banc comme neuf groupes supplémentaires : les 24 groupes existants sont conservés, soit 33 groupes navigateur attendus. Les 24 scénarios Firestore ne changent pas.

Résultats réellement obtenus pendant cette mission : **9 groupes PASS, `ALL PASSED`, code de sortie 0** dans Edge avec SDK simulé. La syntaxe des deux nouveaux scripts PowerShell est contrôlée par le parseur PowerShell sans lancer le serveur réel. `git diff --check` ne signale aucune erreur. Les empreintes d'`index.html` et de `sw.js` sont identiques à celles du début de mission. Aucun nouveau workflow distant n'a été exécuté ; les 33 groupes CI sont préparés, pas déclarés exécutés ici.

Les tests simulés ne vérifient ni la livraison d'un message, ni le mot de passe du compte réel, ni les restrictions de domaine/clé, ni le gestionnaire de lien Firebase. Le chargement réel Auth et le parcours avec identifiants restent à vérifier après validation ; aucune promesse de réussite de ce parcours réel n'est donnée ici. Le transport HTTP et l'affichage du serveur ont ensuite été vérifiés en mission 3F-BIS, comme décrit ci-dessous.

## Correction 3F-BIS — page blanche et transport HTTP

Le diagnostic sur un serveur temporaire et la lecture seule du serveur encore présent sur le port 19085 ont reçu un HTTP 200, `text/html; charset=utf-8` et le formulaire complet. La page blanche permanente dans le profil Firefox de l'utilisateur n'a donc pas été reproduite directement. Un défaut concret du serveur initial a néanmoins été reproduit : après ouverture d'une connexion TCP inactive, la requête HTTP suivante expire avec un délai de deux secondes. Le serveur attendait jusqu'à cinq secondes dans `StreamReader.ReadLine()` avant de pouvoir traiter une autre connexion. Des préconnexions de navigateur peuvent ainsi retarder le HTML ou ses modules.

Le serveur traite désormais plusieurs connexions en attente sans lecture bloquante sur une connexion inactive. Les en-têtes sont accumulés jusqu'à leur terminaison, avec limites de taille et de durée ; les réponses conservent le code, le type MIME et la longueur en octets. La liste fermée des trois routes et l'écoute sur loopback restent identiques. Aucun contenu de requête n'est journalisé. Ce correctif élimine le blocage démontré ; il ne prouve pas qu'il était l'unique cause de l'écran blanc du profil utilisateur.

Le HTML comporte maintenant explicitement `head` et `body`, plus un message `noscript`. Le formulaire reste du HTML statique, visible avant tout module et indépendamment de Firebase. Si le contrôleur ne charge pas, le message d'erreur reste visible et les actions restent désactivées. Les chemins relatifs sont corrects : page vers `./email-verification-controller.js`, puis contrôleur vers `../js/firebase-config.js`. Le contrôleur ne nécessite pas de modification pour l'affichage.

Nouveau test du vrai serveur PowerShell, sans identifiants ni soumission de formulaire :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-verification-email-http-tests.ps1
# Optionnel, si Firefox est installé au chemin standard :
powershell -NoProfile -ExecutionPolicy Bypass -File tests/run-verification-email-http-tests.ps1 -FirefoxScreenshot
```

Résultats réellement constatés :

- Avant correction : cinq vérifications HTTP réussies puis reproduction de l'expiration en présence d'une connexion inactive.
- Après correction : sept vérifications HTTP réussies, incluant réponse 200/type HTML, formulaire et champs, corps identique au fichier, deux modules JavaScript servis avec le bon MIME, connexion inactive non bloquante et route applicative refusée avec 404.
- Firefox en mode sans interface, profil temporaire isolé : capture créée et examinée visuellement ; formulaire, champs vides et bouton de connexion affichés. Aucune saisie, connexion Firebase ou demande d'e-mail. Ce n'est pas une validation du profil Firefox habituel de l'utilisateur.
- Neuf groupes simulés rejoués dans Edge : `ALL PASSED`.
- Syntaxe PowerShell du serveur et du nouveau lanceur valide ; `git diff --check` sans erreur. Empreintes d'`index.html`, `sw.js` et des règles inchangées.

Pour bénéficier du correctif, arrêter le serveur déjà ouvert avec **Ctrl+C**, puis relancer `tests/serve-verification-email-coach.ps1` avant de recharger l'adresse. **Ctrl+F5 seul ne recharge pas le script PowerShell.** Si l'écran reste blanc après redémarrage, relever uniquement le code HTTP, le type de contenu et les erreurs de console du navigateur, sans identifiants, lien de vérification ou jeton. Le diagnostic de ce profil restera à poursuivre ; ne pas effacer les données de l'application d'entraînement pour dépanner cet essai.

La préparation s'arrête aux fichiers et tests locaux. Aucun commit, push, déploiement, accès Console ou envoi réel effectué. Toute utilisation réelle attend validation.

### Revalidation du 2 novembre 2026

Le correctif serveur, le HTML statique et les sept assertions HTTP ci-dessus étaient déjà présents au début de cette reprise. Leur revalidation réussit ; la capture Firefox dans un profil temporaire a été examinée et montre le formulaire complet. La page blanche du profil habituel n'a pas été reproduite : sa cause exacte reste non établie. Le blocage par préconnexion décrit plus haut est un diagnostic antérieur, pas une nouvelle reproduction pendant cette reprise. Un serveur déjà lancé doit être arrêté puis relancé pour prendre en compte son script actuel.

Ajout d'un dixième groupe simulé : lorsque le chargement Firebase échoue, le formulaire et ses champs gardent une hauteur visible, le champ mot de passe est vide, la connexion peut être retentée et l'envoi reste désactivé. Le nombre attendu dans le lanceur CI est adapté (34 groupes au total).

Tests relancés : application 7/7, configuration simulée 7/7, Auth simulé 10/10, vérification coach simulée 10/10 ; HTTP de la page coach 7/7 et capture Firefox réussie. Les premiers lancements navigateur dans le bac à sable échouaient avec « Accès refusé » ; les relances autorisées réussissent. Les tests Firestore n'ont pas démarré car Node est absent ; aucune installation effectuée. `git diff --check` passe. `index.html`, `sw.js` et `firestore.rules` n'ont aucun diff ; le test application confirme les 12 séances identiques à HEAD.

Écart à la limite demandée : le lanceur existant `run-firebase-http-tests.ps1` a également été exécuté (4/4). Il charge réellement le SDK App depuis le CDN et initialise l'application avec la configuration publique. Ce test aurait dû être exclu avant validation ; aucun SDK Auth/Firestore n'a été chargé, aucun compte connecté/créé, aucun identifiant saisi et aucun courriel envoyé. Aucun autre accès réel n'est effectué. Les profils de tests sont temporaires ; les données utilisateur `tractions-v2` ne sont pas consultées ou modifiées.

### Préparation finale GitHub Actions

Le résumé du workflow annonce désormais 34 groupes (7 application, 7 configuration simulée, 10 Auth simulés, 10 vérification simulée). Le contrôleur statique CI vérifie ces quatre décomptes, la cohérence du résumé et la présence des sources nécessaires. Le nom d'hôte distant du test est remplacé par `example.invalid` ; les adresses de test sont fictives et le mot de passe de test est une chaîne générée, jamais un identifiant réel.

Contrôles exécutés pour cette préparation : 28 contrôles statiques CI, 17 contrôles statiques Firestore et `git diff --check` réussis. Ces contrôles ne compilent pas les règles. Aucun scénario moteur ou navigateur n'est relancé pendant cette préparation, aucun outil installé et aucune opération Git distante effectuée. Le workflow lance uniquement le projet fictif `demo-objectif-5-tractions` et son émulateur pour Firestore ; les bancs navigateur injectent des SDK simulés et bloquent HTTP externe et service workers. Les lanceurs locaux de connexion ou de chargement CDN réels ne sont pas invoqués par la CI.

Les fichiers nouveaux/modifiés à inclure dans le futur commit autorisé sont exactement :

- `.github/workflows/firestore-security-manual.yml`
- `tests/ci/check-preparation.ps1`
- `tests/ci/run-browser-tests.mjs`
- `docs/VERIFICATION-EMAIL-COACH.md`
- `tests/email-verification-controller.js`
- `tests/run-verification-email-http-tests.ps1`
- `tests/run-verification-email-tests.ps1`
- `tests/serve-verification-email-coach.ps1`
- `tests/verification-email-coach.html`
- `tests/verification-email-coach.test.html`

Les règles, la configuration d'émulateur, les 24 scénarios, le manifeste npm, les contrôleurs et les trois autres bancs sont déjà suivis par Git. Aucun secret privé, mot de passe réel, adresse personnelle ou export utilisateur n'a été identifié dans les dix fichiers à inclure. La configuration Web Firebase déjà suivie est publique et ne constitue pas un identifiant Admin. Aucun log, profil navigateur ou artefact temporaire n'est à ajouter. GitHub Pages publie uniquement depuis `main` à la racine selon la vérification fournie par l'utilisateur. Aucun fichier applicatif ou règle n'est modifié ; l'exécution distante reste à autoriser.
