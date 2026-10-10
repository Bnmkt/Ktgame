# Deux processus Node

## Repartition

Le processus principal reste le point d'entree HTTP et Socket.IO. Il possede
les tables, moteurs de jeu, salons, chat, presence, sessions et matchmaking.
Il sert aussi les pages publiques rendues sur le serveur. Nginx continue a
servir les fichiers statiques et a terminer HTTPS.

Un processus Node enfant `accounts-process.js` traite les mots de passe,
les lectures d'historique et de transactions, les statistiques, les vues des
comptes et profils publics, la recherche de joueurs, les notifications,
la consultation des succes et le catalogue boutique. Les grandes projections
JSON sont encodees dans ce processus avant leur retour a l'API.

Ce n'est pas une duplication du serveur HTTP. Le processus Comptes n'ouvre
aucun port public, ne charge pas les secrets SMTP/JWT ni le fichier .env,
et n'initialise pas les autres services. Le meme module de domaine sert
les projections synchrones encore necessaires aux actions de jeu.

## Coordination et ecritures

Le processus principal est aussi le coordinateur : aucune troisieme boucle
Node permanente n'est necessaire pour cette repartition.

Les mutations restent dans le coordinateur, qui est l'unique proprietaire
des ecritures de la base principale. Cela inclut creation/modification des
comptes, sessions, achats, bonus, inventaires, gains, XP, succes et Elo.
Les envois d'email et la validation des autorisations restent egalement dans
ce processus. Il s'agit donc d'une separation des calculs/lectures des comptes,
pas encore d'un service independant proprietaire de toutes leurs mutations.

Un achat ou une fin de partie continue a enregistrer le solde, le journal,
les recompenses et les marqueurs d'idempotence dans une seule transaction.
Deplacer ces mutations dans un second proprietaire avec une copie en memoire
des joueurs provoquerait des conflits ou des pertes de mises a jour.

Le processus Comptes ouvre SQLite en lecture seule avec `query_only`.
Il hydrate les donnees normalisees existantes sans migrations ni nouvelle
base de comptes. Chaque projection utilise une transaction de lecture.
Les versions des journaux sont controlees pour invalider les caches apres
une attribution de gains; les lectures hors contexte utilisent data_version.
Les autorisations de session sont reverifiees apres l'attente IPC avant de
livrer des donnees privees.

## Admission et cycle de vie

- Un seul processus Comptes, demarre a la premiere tache.
- Au maximum 256 taches en vol sur IPC, 512 en attente, huit par compte
  pour les projections identifiees. Les controles de connexion conservent
  aussi leurs limites HTTP existantes. Une seule verification de mot de passe
  et un seul hachage peuvent etre en vol par type d'operation. Les lectures
  SQLite restent synchrones dans le processus enfant : plusieurs messages en
  vol n'impliquent pas plusieurs transactions de lecture simultanees.
- Delai maximum de dix secondes, attente comprise. Une saturation renvoie
  une indisponibilite explicite; aucune execution automatique en double.
- L'annulation d'une lecture ignore son resultat sans interrompre les lectures
  des autres joueurs. Son emplacement reste reserve jusqu'a sa reponse ou
  son delai maximum, afin de ne pas creer une file IPC illimitee.
- Une panne echoue explicitement, puis une nouvelle tache recree le processus.
- Les catalogues/configurations ne traversent IPC qu'a leur changement ou
  apres creation d'un nouveau processus.
- Les messages et reponses d'un meme tour de boucle sont regroupes sur IPC.
  La revision des parametres n'avance qu'apres une ecriture validee ou une
  restauration; les consultations ne reparcourent pas tous les catalogues.
  Les scopes de lecture reutilisent cette revision sans serialiser a nouveau
  les configurations. Pendant les mutations et hors de ces scopes, la
  comparaison par contenu reste active, y compris avant COMMIT.
- A l'arret du serveur, la file est annulee et le processus enfant est attendu.
  La fermeture IPC et le groupe de controle systemd evitent les enfants orphelins.

## Supervision

Admin > Supervision distingue Site/tables/chat et Comptes : PID, etat, CPU,
memoire, boucle P95 et file. Les services montrent leur lieu d'execution;
la lecture des succes est distincte de leur attribution pendant une partie.
L'API de console PC/export expose aussi les deux processus, sans PID ni secret.
Les tests de capacite additionnent CPU et RSS des deux processus et surveillent
les deux boucles, pour ne pas faire disparaitre une surcharge dans les mesures.

Le pourcentage CPU cumule peut depasser 100 : 100 correspond a un coeur.
Les anciens rapports, sans mesures Comptes, restent lisibles.

## Activation et retour arriere

La separation est experimentale et desactivee par defaut. Definir explicitement
`ACCOUNTS_PROCESS_ENABLED=1` seulement apres validation de capacite sur la
machine cible. Le service systemd existant lance et arrete l'ensemble;
aucun nouveau port Nginx n'est requis. Les tests API du processus Comptes
activent explicitement ce parametre; les tests de charge suivent sa valeur
dans l'environnement de lancement.

Pour revenir aux projections locales et anciens workers, definir
`ACCOUNTS_PROCESS_ENABLED=0`, verifier la configuration puis redemarrer
seulement lorsque toutes les vraies tables sont fermees. Cette bascule
ne modifie pas les donnees, mots de passe, soldes ou historiques.
`READING_WORKERS` ne concerne que ce mode de retour arriere.

## Dimensionnement

Deux coeurs permettent aux deux processus de travailler simultanement,
mais ne garantissent pas une capacite par simple multiplication. Un afflux
de verifications bcrypt peut saturer le processus Comptes, et la chaine
des tables reste sur la boucle principale. Quatre coeurs donnent davantage
de marge au systeme, a Nginx et aux traitements de fond; ils ne repartissent
pas automatiquement les tables sur quatre boucles.

Une annonce de 1000 ou 2000 joueurs doit reposer sur un scenario reproductible,
des cadences comparables, des historiques volumineux et une duree suffisante.
Les tests isoles ne modifient aucun compte reel et ne traversent pas
l'anti-DDoS public OVH.

## Verification

Les tests couvrent les projections publiques/privees, les inventaires et XP
normalises, les nouveaux commits, la recherche Unicode, les exclusions,
les comptes invites temporaires et l'absence de secrets dans la telemetrie.
Ils verifient aussi le hachage compatible, le regroupement de 300 lectures,
les limites, annulations et echeances, une panne suivie d'une reprise sans
rejeu, et la revalidation des droits apres une attente. Le test SIGSTOP de
revocation est execute sur Debian; Windows ne possede pas ce signal.

Les captures desktop/mobile sont conservees dans
`previews/accounts-process-20261010/`; les controles navigateur activent
Ghostery et verifient la presence des panneaux et l'absence de debordement.

Le profilage diagnostique peut utiliser `serve.mjs --password-rounds 4`
pour raccourcir la preparation fictive. Ce n'est pas un test de capacite
comparable aux executions normales, qui conservent le cout 10. Ce parametre
ne modifie jamais les mots de passe de production.

## Resultats du 10 octobre 2026

Candidate isolee sur le VPS actuel : deux vCPU, environ 3,8 Gio de RAM.
Le generateur tourne sur ce meme VPS. Les scenarios activent quinze jeux,
lectures, presence, notifications, chat, evenements, classe et reconnexions.
Cadences : 3-6 secondes par action/table, 15-24 secondes par navigation;
ramp 100 ms, creation des tables 200 ms, concurrence de preparation 10.
Les verifications bcrypt conservent le cout 10.

| Scenario | Charge | Requetes totales | Actions | Erreurs | P95 en charge | Integrite |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 500 joueurs | 60 secondes | 15361 | 3177 | 0 | 70 ms | valide |
| 1000 joueurs, dernier essai | 120 secondes | 47960 | 10018 | 237 | 2040 ms | valide |

Les requetes incluent preparation et nettoyage. Les fins naturelles sont
33 et 153 respectivement; les parties fermees par le nettoyage ne sont pas
comptees comme fins naturelles. Les annulations a l'arret sont distinctes
des erreurs (2 et 271). Les douze controles d'integrite passent dans les
deux scenarios. Les rares participants a l'evenement et le classe Belote
ne constituent pas une validation de tous les formats de parties classees
ou d'un afflux massif d'actions communautaires. Ces scenarios courts ne
valident pas toutes les fins de partie ni des historiques volumineux.

Lors du dernier essai a 1000, les echantillons de charge montrent environ
97 % de CPU pour le site et 5 % pour Comptes; RSS cumule environ 651 Mio.
La file IPC ne rejette plus de lectures, mais des requetes expirent,
notamment pendant la montee d'activite. L'integrite ne suffit pas a
qualifier ce scenario comme reussi. La version precedente avait passe
son scenario a 1000 : cette regression interdit une activation automatique.

**La production n'a pas ete modifiee ni redemarree pour cette separation.**
Le code, les parametres de retour arriere et l'installateur sont prepares;
le deploiement reste en attente d'une validation sans regression.
Quatre coeurs apporteraient de la marge aux deux processus et au generateur,
mais les tables restent sur une seule boucle : il faut retester, pas annoncer
une capacite de 1000/2000 par simple changement de materiel.

Rapports : `previews/accounts-process-20261010/500-final-passed.json` et
`1000-readonly-snapshots-failed.json`. Les essais intermediaires en echec
et le profil CPU avant optimisation sont egalement conserves.
Verification : 447 tests serveur reussis (deux ignores sur Windows),
83 tests client reussis, verifications ciblees Debian et Ghostery
desktop/mobile reussies. Le retour arriere a ete teste sur huit routes API.
La preversion extraite sur le VPS est rangee sous un nom `unvalidated`,
hors des chemins acceptes par l'installateur, pour eviter son activation
accidentelle. Les processus et comptes de charge ont ete arretes/nettoyes.
