# Google Search Console : badges d'indexation

Sans cette configuration, le badge affiche **Google A connecter**, pas une
confirmation d'indexation. IndexNow fonctionne independamment de Google.

## Configuration

1. Dans Google Cloud, creer un projet ou utiliser un projet existant et activer
   **Google Search Console API**.
2. Creer un compte de service, puis une cle JSON. Aucun role IAM general de type
   proprietaire/editeur du projet n'est necessaire pour cette consultation.
3. Dans la propriete Search Console de KTGA, ajouter l'adresse `client_email`
   du compte de service dans **Parametres > Utilisateurs et autorisations** avec
   un acces complet a cette propriete. Ne pas partager le compte Google personnel.
4. Transferer le JSON sur le VPS, hors du projet et de la racine publique, par
   exemple `/etc/ktga/google-search-console.json`. Proprietaire `root:ktga`,
   permissions `0640`. Ne jamais le publier dans Git ou dans la mediatheque.
5. Dans `/etc/ktga/server.env`, definir :

```dotenv
GOOGLE_SEARCH_CONSOLE_CREDENTIALS=/etc/ktga/google-search-console.json
GOOGLE_SEARCH_CONSOLE_PROPERTY=https://www.ktga.me/
```

Pour une propriete de domaine, utiliser plutot `sc-domain:ktga.me`. La valeur
doit correspondre exactement a la propriete sur laquelle l'acces a ete accorde.
Redemarrer `ktga.service` uniquement quand les tables le permettent.

## Utilisation

Dans **Communication > Referencement**, le bouton d'inspection pres de chaque
badge interroge Google. Les resultats sont conserves 24 h afin de limiter la
consommation du quota. Une erreur conserve le dernier resultat valide et permet
une nouvelle tentative apres 15 min. Les jetons OAuth restent uniquement en
memoire sur le serveur ; le scope utilise est `webmasters.readonly`.

Le resultat concerne la version connue de Google, pas necessairement la derniere
version du contenu. Ce bouton consulte l'index ; il ne demande pas une indexation.
Les pages privees, non indexables et les URL arbitraires sont refusees.

Documentation : [Inspection d'URL](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect).
