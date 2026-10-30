# Mission 3D-BIS — audit et corrections des règles locales

Date : 30 octobre 2026. Branche : `developpement-coach`.

## Conclusion et portée

Le brouillon `firebase/firestore.rules` a été relu et corrigé. Deux ouvertures trop larges étaient présentes : lecture d'une relation sous n'importe quel coach par un utilisateur vérifié portant l'UID sportif du chemin, même non admis ; lecture de séances dont l'ID ne faisait pas partie des 12 séances autorisées à l'écriture.

Les accès ont été resserrés et les validations renforcées. **Le fichier n'a pas été compilé ni exécuté dans le moteur Firestore** : Node, Java et Firebase CLI ne sont pas disponibles. Les résultats statiques ci-dessous ne constituent pas une validation complète de syntaxe ou de sécurité et ne permettent pas de publier les règles.

Seuls les règles, leur suite de tests, le contrôleur statique et la documentation de sécurité ont été modifiés. Aucun compte, paramètre Console, dépendance installée, règle publiée, commit, push ou déploiement. Les changements existants des missions précédentes sont préservés.

## 1. Fichier réel et caractères parasites

Examen du fichier sur disque avant modification : UTF-8 strict valide, sans BOM, sans caractère invisible suspect parmi les caractères de contrôle, espaces insécables, caractères zéro largeur et marqueurs de direction vérifiés. Le fichier ne contenait pas d'enveloppe HTML, de délimiteurs Markdown ou de séquences littérales de saut de ligne issues d'un collage. Les accents et le tiret long sont dans les commentaires et ne sont pas des parasites.

Le contrôle reproductible `tests/firestore/check-preparation.ps1` vérifie maintenant ces propriétés, ainsi que l'équilibre des parenthèses, crochets et accolades après retrait des commentaires de ligne et des chaînes simples. Ce contrôle lexical est adapté à ce fichier, pas un parseur Firestore général. La compilation réelle reste nécessaire, notamment pour la résolution des types, la portée des fonctions et les requêtes autorisées.

## 2. UID unique du coach

Nouvelle fonction `designatedCoach(uid)` : existence de `settings/access`, présence de `coachUid` et `active`, UID chaîne non vide de 128 caractères maximum, activation de type booléen et correspondance exacte de l'UID. `coach()` exige en plus identité vérifiée et `active == true`.

Le champ d'activation n'accepte donc pas une chaîne `"true"`. Une configuration absente ou mal formée ferme les droits coach, sans fermer les droits propres d'un sportif admis. Aucune liste d'UID ni recherche « premier utilisateur connecté » n'est utilisée. Le refus client de lecture/écriture de `settings/*` reste en place ; les accès internes des règles ne le rendent pas public.

## 3. Admission, propriété et association

`verified()` teste aussi la présence du claim `email_verified`. `enrolled(uid)` vérifie l'existence de l'admission et du champ `enrolled`, puis sa valeur booléenne vraie. `owner(uid)` conserve identité vérifiée, égalité d'UID et admission. Aucune admission ne peut être créée par un client, même en batch avec une écriture de résultat.

`assigned(uid)` exige coach actif, admission, existence de la relation et présence du champ `status`, puis `status == 'active'`. Avant correction, les documents absents provoquaient un échec d'évaluation refusant l'accès ; les gardes explicites rendent ces cas plus faciles à examiner et tester. Aucun document absent n'est interprété comme une invitation ou une relation valide.

Une relation absente/révoquée ne donne aucun accès coach au suivi. Le sportif admis conserve son accès propre, même si la relation est révoquée, si le coach est désactivé ou si sa configuration est supprimée. Supprimer l'admission ferme cet accès propre ; ce n'est pas la procédure normale de révocation d'une relation.

## 4. Confidentialité des relations

Ancienne condition sportive : simple utilisateur vérifié dont l'UID égalait `athleteUid`. Elle n'exigeait ni admission ni correspondance de `coachUid` avec le coach désigné. Elle permettait de sonder des chemins tiers connus ou devinés.

Nouvelle condition : `owner(athleteUid) && designatedCoach(coachUid)`. Le sportif admis peut lire sa relation active ou révoquée sous le coach désigné ; il ne peut pas lire celle d'un autre sportif ni ses anciennes relations sous un autre coach après remplacement de l'UID désigné. Il ne peut toujours pas lister une collection de relations. Une désactivation temporaire du coach ne cache pas au sportif sa propre relation, car `designatedCoach` contrôle la désignation sans exiger l'activation.

Le coach actif conserve la lecture de ses relations, y compris révoquées, pour gérer sa liste. Cette lecture n'autorise pas les résultats d'une relation révoquée.

Les règles lisent un document entier : elles ne masquent pas certains champs. Le serveur d'invitation devra donc limiter strictement les relations aux métadonnées prévues (`status`, identifiant opaque d'invitation, dates). Aucun secret d'invitation, jeton ou information d'un autre sportif ne doit y être stocké. Les secrets restent dans la collection privée d'invitations. Une écriture Admin mal conçue peut toujours divulguer un champ supplémentaire à un lecteur autorisé de ce document : ce risque nécessite les tests du futur serveur.

## 5. Profils

Les créations et modifications ne permettent que `displayName` (texte, 100 caractères maximum) et `updatedAt`. Les champs requis sont contrôlés sur l'état final, y compris pour une modification partielle ; supprimer un champ requis est refusé. Ajouter un rôle ou un UID coach reste interdit.

Le sportif doit être admis et propriétaire. Le coach actif peut créer/modifier son profil propre sans admission sportive, mais pas le profil d'un sportif associé. Les listes globales et suppressions restent fermées.

`updatedAt` est maintenant explicitement de type timestamp, égal à `request.time`, et ne peut pas reculer par rapport à un ancien timestamp valide. Un profil ancien mal formé nécessite une réparation administrative contrôlée ; aucun contournement de schéma n'est ajouté pour faciliter cette réparation. Le profil ne possède toujours pas de compteur de révision : deux modifications simultanées de nom peuvent se remplacer. Ce profil minimal ne porte aucun privilège.

## 6. Révisions et horodatages

Les programmes et séances exigent désormais une nouvelle révision entière positive. Une création commence à 1 ; une mise à jour exige une ancienne révision entière positive présente et un incrément exact de 1. Une ancienne valeur 0 n'est plus acceptée comme base d'une modification. Une ancienne valeur manquante ou incorrecte n'est pas réparée silencieusement.

`validUpdatedAt()` centralise le type timestamp, l'égalité avec l'heure serveur de la requête et la non-régression temporelle lors d'une modification. Une date historique future introduite par Admin bloquera l'écriture cliente jusqu'à réparation. Le client futur utilisera `serverTimestamp()` ; une chaîne, une ancienne date arbitraire ou un horodatage futur ne satisfait pas ce contrat. Les propriétés de `request.method` et `request.time` figurent dans la [référence officielle](https://firebase.google.com/docs/reference/rules/rules.firestore.Request).

`completedAt` reste une information déclarative facultative : `null` pour un historique sans date ; sinon timestamp non futur. Les règles ne certifient pas qu'un exercice a réellement été effectué. Une réinitialisation exige `completed: false` et `completedAt: null`.

Un nouveau scénario prépare deux écritures concurrentes à la même révision : une seule doit être acceptée. La politique attendue est définie mais doit encore être démontrée dans le moteur.

## 7. Lecture et liste des séances

`validSessionId` définit la même liste fermée de chaînes `1` à `12` pour les lectures, listes, créations et modifications. Avant correction, une séance hors programme créée par un outil Admin pouvait être lue par un acteur autorisé au suivi ; elle est désormais hors du périmètre client.

Le contrat de requête change : une liste doit limiter les ID de documents aux ID autorisés. Exemple préparé pour le futur module de données :

```js
const ids = Array.from({ length: 12 }, (_, i) => String(i + 1));
const sessions = query(collection(db, cheminSessions), where(documentId(), "in", ids));
```

Une requête de collection sans filtre, ou un filtre incluant `13`, doit être refusé. Il ne faut pas lire toute la collection puis filtrer côté navigateur. La [documentation Firebase des requêtes sécurisées](https://firebase.google.com/docs/firestore/security/rules-query) explique que les règles évaluent les résultats potentiels d'une requête. **L'acceptation exacte de la requête filtrée et les limites d'accès internes doivent être vérifiées dans l'émulateur avant d'adopter ce contrat.** Aucun appel de l'application actuelle n'est affecté : elle n'utilise pas Firestore.

## 8. Chemins inconnus

Le refus récursif final est conservé. Aucune autorisation récursive positive n'a été introduite. Les profils, admissions et relations ne transmettent pas automatiquement leurs droits aux sous-collections. Les imports, autres programmes, chemins privés imbriqués et collections inconnues sont fermés. Un `allow false` n'annule pas un autre `allow true` : la fermeture repose aussi sur la précision des chemins positifs.

## 9. Scénarios et résultats réellement obtenus

La suite `tests/firestore/security.test.mjs` passe de **12 à 24 scénarios préparés**. Les nouveaux cas couvrent configuration et admissions mal formées, relations absentes, chemins de coach tiers, remplacement du coach, lectures/listes de séances dont des documents Admin hors schéma, création/modification des profils, création/révisions exactes, concurrence, horodatages corrompus, batch d'auto-admission et sous-collections inconnues.

Commandes exécutées :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/firestore/check-preparation.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/firestore/run-security-tests.ps1
git diff --check
```

- **16 contrôles statiques réussis**, dont les vérifications lexicales. Ils ne prouvent ni la compilation ni l'application des droits par Firestore.
- Lanceur moteur : arrêt avec `Missing prerequisite: node`, code de sortie 1. Node, Java et Firebase CLI sont absents ; aucune installation effectuée. **0 scénario moteur exécuté sur les 24 préparés.**
- `git diff --check` : aucune erreur signalée.
- Empreintes SHA-256 de `index.html` et `sw.js` identiques avant/après : `C90A303BEAFDF075C0E74FF909801F7C57D572A52A2594632820FBCE899725F5` et `C92365E098ED7FE1B34AC7DBA9755C1E69C70C2E5DD69FF7C1F83E4A7589BACE`. Le statut modifié d'`index.html` demeure celui de mission 2.

## 10. Risques résiduels et validation suivante

Avant toute publication : obtenir l'autorisation d'installer l'outillage manquant, compiler les règles dans l'émulateur, exécuter les 24 scénarios et examiner les traces, notamment les listes filtrées, les documents absents et les accès internes utilisés par les règles. Corriger tout échec avant une revue séparée de déploiement.

Les écritures Admin, les transactions d'invitation, les accès IAM et le respect du schéma serveur restent à implémenter/tester. Une désactivation Auth n'efface pas les copies déjà téléchargées ni instantanément tout jeton existant ; la désactivation du coach dans la configuration et les contrôles de révocation des futures fonctions restent nécessaires. Les règles ne traitent pas les conflits de notes, la migration ou la conservation des résultats hors connexion. Les quotas et coûts doivent être évalués avec les requêtes réelles.

La mission s'arrête aux corrections locales documentées. Aucune règle n'est publiée ; aucune opération Console ou création de compte n'est réalisée. Toute installation, activation ou autre opération attend validation.
