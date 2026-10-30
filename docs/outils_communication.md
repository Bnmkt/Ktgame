# Signalements de bugs et purge du chat global

## Signalements

Les limites s'appliquent côté serveur, même si le formulaire est contourné :

| Protection | Valeur |
| --- | --- |
| Délai entre deux nouveaux signalements | 60 secondes |
| Nouveaux signalements par compte ou connexion anonyme | 6 par heure glissante |
| Doublon du même déclarant | Bloqué pendant 24 heures |
| Captures par compte ou connexion anonyme | 18 tentatives par tranche glissante de 15 minutes |
| Protection IP existante | 12 requêtes de signalement par heure ; 36 captures par 15 minutes |

Les quotas du compte suivent celui-ci lorsqu'il change de connexion. Pour les visiteurs anonymes, la clé dépend de la connexion réseau ; un réseau partagé partage donc son quota. La clé enregistrée est un HMAC, sans adresse IP en clair. Les IPv6 sont regroupées par le mécanisme d'`express-rate-limit`. Les limites IP restent un complément en mémoire du processus ; les quotas du déclarant et les empreintes des doublons sont conservés dans SQLite après redémarrage. La rotation de `JWT_SECRET` renouvelle ces clés.

L'empreinte compare la catégorie, le titre, la description, les résultats attendus et obtenus, les étapes, le jeu, la page et la zone, après normalisation de la casse et des espaces. Les événements expirent après 24 heures ; le nettoyage intervient aussi lors de la maintenance habituelle des dossiers.

Une nouvelle tentative avec le même identifiant d'envoi retrouve son reçu sans créer de dossier supplémentaire. Une soumission identique avec un nouvel identifiant renvoie `409 / BUG_INTAKE_DUPLICATE` et l'identifiant du dossier existant. Les quotas renvoient `429 / BUG_INTAKE_LIMIT`, un champ `retryAfter` et l'en-tête `Retry-After`. Le formulaire conserve la saisie et les captures, affiche un compte à rebours et empêche les doubles envois simultanés.

Code : `server/src/services/bug-reports.js` (`checkIntake`, `reserveUpload`, `create`, `prune`), `server/src/services/bug-report-routes.js` (`subjectKey`, `wrap`), `client/src/features/bugs/BugReportForm.jsx` (`submit`). L'admission des captures précède leur décodage. `GET /api/bugs/metadata` expose les limites dans `limits.intake`.

## Purger le chat global

Un administrateur ouvre le panneau de conversation, choisit **Global**, puis **Purger le chat global**. La boîte de confirmation explique la portée de la suppression. Annuler ne provoque aucune mutation.

`DELETE /api/admin/chat/global`, avec le corps JSON `{ "confirm": true }`, exige une session valide et le rôle administrateur vérifié côté serveur. Un éditeur ou un joueur ne dispose pas de cette permission. Le canal n'est pas paramétrable : seuls les messages `global/global` sont supprimés. Les conversations privées, les messages des tables et leurs marqueurs de lecture sont préservés.

La suppression, l'incrément d'une révision persistante et la trace administrative sont atomiques dans la base du chat. `chat_purges` conserve l'auteur, la date, le nombre de messages et la révision, sans recopier leur contenu. Une trace supplémentaire est ajoutée aux journaux administratifs.

Le serveur émet `chat-reset` vers les connexions abonnées à `chat:global`. Les clients affichant le global effacent leur historique et rechargent son état ; les conversations privées ouvertes restent affichées. Les réponses HTTP et les messages globaux portent une révision. Un ancien chargement ou une ancienne réponse d'envoi ne peut donc pas réintroduire des messages supprimés. Le chargement périodique permet aussi de récupérer une purge manquée pendant une déconnexion.

Code : `server/src/services/chat-moderation.js` (`registerChatModerationRoutes`), `server/src/services/chat.js` (`purgeGlobal`, `globalRevision`), `server/src/index.js` (enregistrement HTTP et diffusion Socket.IO), `client/src/components/social/SocialPanel.jsx` (`receiveReset`, `appendMessage`, `loadActive`), `useConversationInbox.js` et `chat-state.js` (`mergeChatSnapshot`).

Le déploiement crée uniquement des tables de contrôle supplémentaires et ne purge aucun message. La suppression demande ensuite une action explicite d'un administrateur. Elle est définitive dans le chat actif ; une éventuelle restauration relève des sauvegardes d'exploitation.

## Vérification

- Serveur : `node --test test/bug-intake.test.js test/bug-reports.test.js test/chat-moderation.test.js test/chat.test.js` depuis `server/`.
- Intégration du serveur complet, rôles et Socket.IO : `node --test test/admin-contact-api.test.js` depuis `server/`.
- Fusion des états et réponses obsolètes : `node --test test/chat-state.test.js` depuis `client/`.
- Navigateur : `node test/community-tools.smoke.mjs` depuis `client/`, avec `KTGA_BROWSER_TOOLS` pointant vers un dossier contenant Playwright et `@ghostery/adblocker-playwright`, et `KTGA_BLOCKER_CACHE` vers leurs listes précompilées. Le scénario emploie des API isolées, deux vues connectées, une confirmation annulée puis validée, des réponses retardées, un brouillon limité et un doublon. Aucun appel de purge ne vise la production.
- Build : `npm run build` depuis `client/`.

Les essais navigateur vérifient également la présence des outils avec Ghostery activé, sur ordinateur et sur une largeur de 390 pixels.
