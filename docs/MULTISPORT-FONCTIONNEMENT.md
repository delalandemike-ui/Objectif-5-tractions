# Multisport Spark

La version en vigueur est gratuite et remplace la précédente préparation serveur. La procédure de publication et de test est dans [ACTIVATION-FIREBASE.md](ACTIVATION-FIREBASE.md).

Le coach unique crée une invitation Firestore pour une adresse précise, copie le lien ou prépare un e-mail manuel. Le sportif crée son compte e-mail/mot de passe, vérifie son adresse puis demande son admission. Seul le coach peut confirmer cette demande. Les règles Firestore vérifient l'identité, le destinataire, l'expiration et les écritures atomiques d'approbation ; connaître le lien ne suffit jamais.

Le tableau de bord conserve les sportifs actifs, invitations, demandes à confirmer, annulations et révocations. Le coach consulte les séances réalisées, les performances, commentaires et progressions. Les douze séances restent dans leur source unique `index.html`, sans modification du programme.

Chaque sportif conserve son stockage distinct, sa file de synchronisation, ses exports et ses résolutions explicites de conflits. Les données `tractions-v2` ne sont ni remplacées ni supprimées ; l'import volontaire conserve une copie brute complète. Les séances restent utilisables hors connexion après un premier chargement réussi. Les copies déjà enregistrées sur un appareil ne sont pas effacées par une révocation distante.

Les codes et dépendances serveur ont été retirés de l'application et des workflows. Aucun fournisseur d'e-mails, service de paiement, App Check ou secret de déploiement n'est nécessaire. Firebase CLI et les outils de test sont uniquement des dépendances de développement locales. Les notes historiques antérieures décrivant une architecture serveur ne constituent plus la procédure d'activation.

Validation de cette version : 31 scénarios réussis dans le vrai moteur Firestore, dont les opérations du module d'invitations sur le projet local `demo-objectif-5-tractions` ; 59 groupes navigateur réussis et construction du paquet public vérifiée. Aucun compte ou invitation réel n'a été créé, aucune règle publiée, aucun déploiement ni commit effectué.
