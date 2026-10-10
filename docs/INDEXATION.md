# Indexation des pages publiques

Le domaine canonique est `https://www.ktga.me`. Les autres variantes du
domaine redirigent vers celui-ci en HTTPS.

Le serveur fournit le HTML des pages publiques sans attendre JavaScript :
accueil, catalogue et regles des jeux, FAQ, guide, patchnotes publiees et
informations legales. React reprend les interactions dans le navigateur.
Les visiteurs et les robots recoivent le meme contenu public.

Les comptes, tables, espaces administratifs, liens de verification et
portails parentaux prives ne sont pas indexes. Le rendu public ne contient
aucune donnee de compte, aucun brouillon, diagnostic ni resultat de vote.
`noindex` ne remplace pas les controles d'autorisation de l'API.

## Verifications

- `/robots.txt` est un vrai document texte.
- `/sitemap.xml` contient uniquement des URL publiques et des versions publiees.
- Les titres et descriptions sont propres a chaque page.
- Les liens canoniques evitent les doublons de domaine et de version.
- Les URL inexistantes renvoient HTTP 404, les anciennes variantes HTTP 308.
- Les cartes de partage utilisent une capture du site, sans outil de suivi.

Apres chaque mise a jour, executer `npm run build:prod` dans `client` : ce
script construit le navigateur et le moteur `dist-ssr`. Les tests du serveur
verifient aussi le HTML public lorsque ce moteur existe.

```powershell
cd client
node test/seo.smoke.mjs
$env:SEO_ORIGIN = "https://www.ktga.me"
node test/seo.smoke.mjs
```

Ce test visuel utilise les outils Playwright et Ghostery installes pour les
verifications du projet, hors de ses dependances. Les captures sont dans
`docs/previews/seo-20261007`. Le premier lancement genere aussi l'image de
partage : reconstruire ensuite le client pour la publier.

## A effectuer avec le compte du proprietaire

Ajouter la propriete de domaine `ktga.me` dans Google Search Console,
valider sa propriete avec l'enregistrement DNS TXT fourni par Google, puis
soumettre `https://www.ktga.me/sitemap.xml`. Utiliser l'inspection d'URL pour
verifier l'accueil et une page de jeu. Bing Webmaster Tools peut recevoir
le meme sitemap.

Ces preparatifs rendent le site explorable et indexable. Ils ne garantissent
pas un classement ni un delai d'apparition dans les moteurs de recherche.

## Google Analytics facultatif

La mesure `G-YK0459SVPW` est activee par `VITE_AUDIENCE_READY=true` lors de
la construction de production. Le modele d'environnement laisse cette
option desactivee : avant de l'activer pour une autre propriete, desactiver
les mesures ameliorees dans son flux Web. Le site envoie lui-meme uniquement
des vues de pages filtrees, sans parametres de lien, identifiant de table,
pseudo, email ou identifiant de compte. Les espaces de compte,
d'administration et parentaux sont exclus, ainsi que les comptes restreints
des moins de 13 ans.

Analytics n'est charge qu'apres un accord explicite, distinct du suivi des
succes de navigation. Les accords anterieurs n'autorisent pas cette mesure.
Le refus et les bloqueurs ne doivent pas empecher d'utiliser le site.
Le retrait dans "Mes preferences" bloque la collecte et retire les cookies
Analytics du site. Le consentement et les cookies expirent apres 180 jours.

Dans la propriete Google, conserver Google Signals, les integrations
publicitaires et la collecte de donnees fournies par l'utilisateur
desactives ; choisir une conservation courte des donnees d'evenement
(par exemple deux mois). Les parametres du compte Google ne sont pas
modifiables depuis ce projet.

Analytics mesure les visites consenties, il ne valide pas la propriete
Search Console et n'ameliore pas directement le classement du site.
Verification navigateur : `node test/audience.smoke.mjs` dans `client`.

### Conteneur Google Tag Manager

Les extraits standards du conteneur `GTM-NV3T6P8X` sont places dans le head
et au debut du body, y compris l'iframe noscript. Contrairement a Analytics,
Tag Manager est donc charge avant le choix de confidentialite, et peut
recevoir l'adresse IP et les informations de connexion. Cette installation
ne garantit pas a elle seule la conformite du suivi au consentement.

Le conteneur publie etait vide lors de l'installation. Ne pas y ajouter une
seconde balise GA4 qui doublerait les vues gerees par le site, ni declencher
une mesure sans les controles de consentement et de confidentialite adaptes.
Le code du site ne peut pas garantir ces controles pour des balises ajoutees
ulterieurement dans le compte Tag Manager.

La CSP autorise seulement le snippet inline par son empreinte SHA-256, sans
autoriser les scripts inline arbitraires ou unsafe-eval. Toute modification
du snippet necessite de recalculer l'empreinte apres normalisation des fins
de lignes LF. L'iframe Google utilise une autorisation frame-src distincte.
