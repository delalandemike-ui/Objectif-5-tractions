# Parcours coach–sportif préparé sur developpement-coach

Les règles de coaching ont été publiées manuellement dans Firebase par le propriétaire le 3 novembre 2026. Le fichier canonique local est aligné sur cette version. La publication Pages est maintenant autorisée ; aucun compte ni invitation réel n'a été créé pour la préparation.

## Parcours

- Le coach invite par e-mail, puis copie le lien ou ouvre son logiciel de messagerie. L'adresse est préremplie grâce au fragment du lien ; elle reste une indication, jamais une preuve d'identité.
- La page d'invitation propose pseudo, adresse et mot de passe. Firebase envoie son e-mail de vérification. Après le clic et le retour à l'application, la demande est transmise automatiquement avec l'identité vérifiée. Le compte et le pseudo sont retrouvés sur un autre appareil après connexion.
- Le coach accepte ou refuse dans « Demandes à valider ». L'acceptation utilise une transaction qui vérifie l'état de l'invitation avant de créer l'admission et la relation. Deux acceptations concurrentes ne peuvent pas produire deux admissions incohérentes.
- La session sportive utilise la persistance locale Firebase quand le navigateur l'autorise. Le coach garde sa connexion en mémoire. La déconnexion se propage entre les onglets.
- `index.html` est la seule interface de séances. Les comptes utilisent les suivis existants `tractions-athlete-v1:<uid>`, séparés de `tractions-v2`. Aucune copie automatique de l'historique vers un compte. Un import volontaire archive la valeur brute et ne remplace pas un suivi existant.
- Le coach consulte pseudo, adresse, admission, 12 séances, performances, notes, commentaires et évolution du score. Les anciennes invitations ne contenant pas l'adresse ou le pseudo ne sont pas inventées : la fiche signale l'information indisponible.
- Les messages privés sont conservés dans `athletes/<uid>/messages`. Les lectures sont paginées par 50. Ils ne sont pas envoyés hors connexion ; le texte reste dans le champ en cas d'échec. Un identifiant stable et une transaction empêchent le double envoi lors d'une reprise sans rechargement.
- Les nouveaux résultats et leur archive dans `programs/tractions-12-v1/history` sont enregistrés atomiquement. L'historique commence à l'activation du correctif ; les anciennes révisions ne peuvent pas être reconstruites. Les résultats antérieurs restent intacts.

## Règles proposées

`firebase/firestore.rules` contient désormais la même version que `firebase/firestore.coaching.rules`, publiée manuellement et vérifiée par le moteur de règles local. `firebase.json` reste inchangé. Cette version prévoit :

- recherche des seules invitations adressées à l'e-mail vérifié du demandeur ;
- lecture de son propre statut d'admission, y compris après révocation, sans ouvrir les résultats ;
- messages immuables accessibles uniquement au sportif admis et au coach désigné actif, avec relation active ; auteur et horodatage serveur contrôlés ;
- archives immuables, créées uniquement par le propriétaire et liées par `getAfter()` à la même version du résultat ;
- aucune auto-admission, écriture de rôle, lecture des autres sportifs ou accès par un lien anonyme.

Les nouvelles écritures de résultats contiennent leur archive : publier le nouveau site avec les anciennes règles bloquerait ces synchronisations. Les données locales seraient conservées, mais la publication doit respecter l'ordre ci-dessous.

## Limites Spark et sécurité

La vérification d'e-mail exige un clic du propriétaire de l'adresse ; elle ne peut pas être validée silencieusement. La demande ne devient visible au coach qu'après cette vérification. L'application vérifie automatiquement lors du retour au premier plan et périodiquement pendant l'attente visible.

L'invitation est envoyée par le logiciel de messagerie du coach. Aucun serveur d'envoi, Cloud Functions, Resend ou service payant n'est ajouté. Les quotas Spark existants s'appliquent ; aucune bascule vers Blaze. Les invitations expirent après sept jours. La messagerie n'a ni pièces jointes, ni notifications push, ni envoi en arrière-plan ; le bouton d'actualisation récupère les nouveaux messages.

Une révocation ferme l'accès serveur aux résultats, à l'historique et à la conversation. Elle n'efface pas les résultats déjà enregistrés localement sur l'appareil du sportif. La session persistante et les sauvegardes locales nécessitent la déconnexion et un profil de navigateur personnel sur un appareil partagé.

Documentation officielle : [vérification d'e-mail](https://firebase.google.com/docs/auth/web/manage-users), [requêtes et règles](https://firebase.google.com/docs/firestore/security/rules-query), [quotas Authentication](https://firebase.google.com/docs/auth/limits), [plan Spark](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

## Tests ciblés

- `tests/run-multisport-tests.ps1` : programme, isolation, stockage, conflits, inscription/vérification, statuts, session, messagerie simulée et changement entre onglets.
- `tests/run-coach-tests.ps1` : authentification coach, invitations, demandes, acceptation/refus et fiche individuelle.
- `tests/run-tests.ps1` : contenu historique, progression, export et cache hors connexion.
- `tests/firestore/run-coaching-tests.ps1` : émulateur local uniquement, 31 scénarios de sécurité existants appliqués aux règles proposées et 8 scénarios de confidentialité, messages et historique. Utilise les outils déjà présents dans `.tools` ; aucune installation ni publication.
- `node --test tests/activation.test.mjs` : préparation du paquet public, sans publication. Le workflow de vérification inclut les tests de coaching et ne déploie aucune règle.

## Actions indispensables avant production

1. Les règles sont déjà publiées manuellement et le fichier canonique est aligné : ne pas les republier pour cette mise en ligne.
2. Conserver Firebase Spark. Le fournisseur e-mail/mot de passe et le domaine GitHub Pages sont déjà utilisés ; vérifier que le modèle Firebase de vérification renvoie bien vers l'URL `athlete.html` de cette application.
3. Créer le commit autorisé avec `[publish-multisport]`, pousser sur `developpement-coach`, puis attendre le workflow Pages existant. Aucun changement de `main` nécessaire.
4. Valider le parcours réel avec un compte existant autorisé et vérifier le cache mobile après actualisation. Aucun parcours réel Auth/e-mail n'a été exécuté par les tests locaux.
