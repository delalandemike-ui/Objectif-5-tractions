# Publier la version gratuite Spark

Cette version utilise uniquement Firebase Authentication (e-mail/mot de passe et vérification d'adresse), Firestore et GitHub Pages. Aucun service serveur, fournisseur d'e-mails, clé reCAPTCHA, carte bancaire ou forfait payant n'est requis. Rester sur Spark : si un quota gratuit est atteint, attendre son renouvellement ; ne pas ajouter de moyen de paiement. La saisie locale reste disponible.

## Firebase Console : seules actions indispensables

1. Conserver **Spark**. Disposer de la base Firestore `(default)` en mode production, sans données d'exemple.
2. Authentication : activer **E-mail/Mot de passe**, autoriser `delalandemike-ui.github.io`. Les liens de connexion par e-mail ne sont pas nécessaires. Les sportifs utilisent leur mot de passe après vérification de leur adresse via les e-mails gratuits Firebase.
3. Dans Firestore, vérifier le document `settings/access` : `coachUid` (string) = UID du coach unique existant, `active` (boolean) = `true`. Le coach doit avoir une adresse vérifiée. Aucun sportif ou compte à créer à la main.
4. Si App Check avait été rendu obligatoire auparavant, désactiver cette application forcée pour les services utilisés : la version Spark livrée ne dépend pas d'App Check.

## Publication des règles et de l'application (après autorisation)

Depuis la racine du dépôt, PowerShell :

```powershell
$env:Path = "$PWD\.tools\node-v24.22.2-win-x64;$env:Path"
# Sur une autre machine : installer Node.js 24 LTS et exécuter npm --prefix tests ci.
node scripts/build-pages.mjs
.\tests\node_modules\.bin\firebase.cmd login --reauth
.\tests\node_modules\.bin\firebase.cmd deploy --project objectif-5-tractions --only firestore:rules
```

La construction produit `_site` sans configuration supplémentaire ni secret. Elle ne déploie rien. Le déploiement ciblé ne publie que les règles Firestore, pas de Functions ou de Hosting.

GitHub CLI doit être installé et connecté au dépôt. GitHub Pages gratuit exige un dépôt public ; utiliser uniquement les runners hébergés standards gratuits, sans achat de minutes ou de forfait.

```powershell
gh auth login
gh api --method PUT repos/delalandemike-ui/Objectif-5-tractions/pages -f build_type=workflow
# Seulement après autorisation du push et de la publication ; le commit est préparé séparément :
git push origin developpement-coach
```

Si le site Pages n'existe pas, remplacer PUT par POST. Si l'environnement `github-pages` n'autorise que `main`, y autoriser `developpement-coach`. Aucun changement de `main` n'est nécessaire. Un push ordinaire ne déclenche pas le nouveau job de publication : le marqueur `[publish-multisport]` est requis dans le dernier message de commit. Aucun secret ni variable GitHub n'est requis.

## Test complet : invitation, compte, admission, séance, consultation

Après publication autorisée et avec une adresse d'essai expressément autorisée :

1. Le coach ouvre `coach.html` et se connecte à son compte existant. Il crée une invitation pour l'adresse exacte du sportif. Il copie le lien affiché ou ouvre **Préparer mon e-mail** pour l'envoyer depuis sa messagerie habituelle. Aucun e-mail n'est envoyé automatiquement par l'application.
2. Le sportif ouvre le lien dans son propre profil de navigateur, saisit l'adresse invitée et un mot de passe, clique sur **Créer mon compte et vérifier mon adresse**, puis vérifie l'adresse avec le message Firebase. Il revient à son invitation et se connecte. Si le lien n'est plus rempli, il le colle dans **Lien d'invitation reçu**.
3. Le sportif renseigne son nom et clique sur **Demander mon admission au coach**. Cette action ne donne aucun accès aux résultats distants.
4. Le coach clique sur **Actualiser les invitations**, vérifie l'adresse et confirme l'admission. Cette confirmation écrit atomiquement l'invitation acceptée, l'admission et la relation active.
5. Le sportif enregistre la séance 1 avec une performance et un commentaire, puis synchronise. Le coach actualise son accès et consulte les performances : séance réalisée, performance, commentaire et progression.
6. Hors connexion, enregistrer la séance 2 puis rétablir Internet : la file est synchronisée si la session vérifiée reste ouverte. Après rechargement, reprendre le suivi local et se reconnecter avant transmission.
7. Le coach révoque l'accès ; la synchronisation du sportif doit être refusée. Les résultats ne sont jamais supprimés. L'ancien lien ne réactive rien à lui seul : toute réadmission exige une invitation encore valide, une demande liée à l'identité vérifiée et une nouvelle confirmation explicite du coach.

## Garanties et limites gratuites

- Le lien contient un identifiant, pas une preuve d'autorisation. Firestore exige une identité Firebase vérifiée correspondant à l'adresse invitée, puis la confirmation du coach désigné.
- Un compte Authentication seul ne donne accès à aucun résultat du programme partagé. Les exercices publics et le suivi local historique restent accessibles comme auparavant.
- Les invitations expirent après sept jours et peuvent être annulées. Les demandes, annulations, approbations et révocations sont vérifiées par les règles ; aucun privilège n'est confié à un champ de profil.
- Les écritures d'approbation et de révocation sont liées par `getAfter()` : les clients modifiés ne peuvent pas ouvrir l'admission par une écriture isolée.
- Les quotas Spark de Firestore et d'Authentication restent applicables. Il n'existe aucun basculement automatique vers un service payant. Les liens de connexion e-mail, limités à 5 envois quotidiens sur Spark, ne sont pas utilisés par ce parcours.

Sources : [quotas Authentication](https://firebase.google.com/docs/auth/limits), [règles et écritures atomiques](https://firebase.google.com/docs/firestore/security/rules-conditions).
