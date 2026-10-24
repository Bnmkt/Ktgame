# Koins : exploitation et activation

## Etat initial

Les Koins constituent un portefeuille independant des Jetons. Les achats payants,
les depenses en boutique et les codes gratuits sont **desactives par defaut**.
Le mode test est actif. Aucune cle ni aucun SKU fictif n'est ajoute.

Les ventes reelles sont implementees, mais leur ouverture exige une activation
explicite dans **Administration > Monetisation > Activation et facturation**.
Le statut particulier ne permet pas d'activer les ventes reelles dans cet outil.
Les achats de test sont reserves aux administrateurs majeurs. Utiliser une base
isolee et des comptes de test : leurs Koins ne sont pas une seconde monnaie de
production et ne doivent pas servir a offrir involontairement des objets.

## Fonctionnement

- Les Koins ne sont utilisables que pour les cosmétiques. Pas de mise, jeu,
  evenement, conversion en Jetons, retrait ou transfert entre comptes.
- Le studio boutique permet de fixer le prix en Jetons, en Koins ou les deux.
  Chaque achat utilise une seule monnaie et les remises habituelles des packs.
- Les achats en Koins n'activent pas de succes, XP ou recompense de jeu.
- Un compte majeur avec un email verifie peut acheter. Les comptes de moins de
  18 ans et les comptes sans date de naissance valable ne peuvent pas acheter.
  Les restrictions parentales et de boutique existantes restent applicables.
- Les offres initiales sont 25 Koins / 1 EUR, 150 / 5 EUR et 500 / 15 EUR.
  Prix TTC, quantites, bonus, ordre, disponibilite et fournisseurs sont editables.
- L'onglet Personnalisation permet d'importer une icone de monnaie et une image
  pour chaque offre, avec la mediatheque et le recadrage existants. Les
  descriptions acceptent les retours a la ligne, pas du HTML executable.
- Les codes sont aleatoires, stockes sous empreinte SHA-256, utilisables une seule
  fois au total. Les codes en clair ne sont affiches qu'a leur generation.

## Architecture et migration

Les tables `koin_*` sont creees de facon additive au demarrage dans la base
principale `SQLITE_PATH`. Aucune conversion de Jetons ni reprise de soldes
existants n'est executee. Sauvegarder la base avant la premiere installation.

Tables : `koin_settings`, `koin_wallets`, `koin_ledger`, `koin_cosmetic_grants`,
`koin_orders`, `koin_codes`, `koin_skus`, `koin_documents`,
`koin_document_numbers`, `koin_jobs`, `koin_mail_log`.

Le debit et l'attribution d'inventaire partagent le `BEGIN IMMEDIATE` de
`updateDb`. Une erreur annule les deux operations, y compris le cache utilisateur.
Les references fournisseur, sources de credits, utilisations de codes et
evenements de documents sont uniques. Les preuves de paiement viennent du
serveur, jamais du navigateur. Les processus de comptes et de rooms continuent
a utiliser l'architecture actuelle ; aucun nouveau processus n'est necessaire.

Les tableaux economiques des Jetons ne recoivent aucune transaction Koins.
Un reset des donnees de jeu conserve les soldes, historiques et documents Koins,
ainsi que les cosmetiques achetes avec cette monnaie. Les archives personnelles
incluent les transactions et les PDF propres au demandeur, sans secrets de codes.

## Variables serveur

Conserver les secrets uniquement dans `/etc/ktga/server.env` sur le VPS,
ou dans le `.env` serveur local. **Jamais dans les variables VITE, Git ou le chat.**

```dotenv
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_KOINS_TAX_CODE=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
```

Le service SMTP existant est reutilise : `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
`SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`. Les destinataires contact et administratif
de la monetisation sont configurables dans son onglet de facturation.

Installer les dependances serveur avec `npm ci --omit=dev` : Stripe SDK et PDFKit
sont ajoutes au manifeste et au lockfile. Reconstruire le client et le rendu SSR
avec `npm run build`. Deployer uniquement les fichiers concernes, sans ecraser
les autres modifications locales en cours.

## Stripe

1. Configurer le compte marchand, les informations legales, les numeros fiscaux,
   les regles de facturation et Stripe Tax selon la situation effectivement validee.
2. Commencer avec `sk_test_...` et un secret webhook du meme environnement.
3. Creer l'endpoint HTTPS `https://api.ktga.me/api/koins/stripe/webhook` pour :
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`,
   `charge.dispute.closed`, `credit_note.created`.
4. Checkout utilise un prix EUR TTC cote serveur, collecte l'adresse de
   facturation et demande une facture Stripe. La classification fiscale du
   produit et les inscriptions TVA doivent etre validees avant le mode reel.
5. Le retour vers `/profil?koins=confirmation` n'accorde aucun credit. Le webhook
   signe valide montant, monnaie, mode test/reel et reference. Une tache durable
   reconcilie aussi les sessions en attente si un webhook a ete manque.
6. Le remboursement admin demande un avoir Stripe avec remboursement du solde
   restant de la vente. Les retraits de Koins attendent la confirmation fournisseur.
   Un litige suspend les depenses ; sa cloture est reverifiee chez Stripe pour
   supporter les notifications retardees. Une perte de litige retire les Koins.

Si des Koins ont deja ete depenses avant un remboursement, le solde peut devenir
negatif. Aucun Jeton n'est retire ; aucune conversion n'est effectuee. Les achats
premium sont alors impossibles jusqu'au retour a un solde suffisant.

## Discord Premium Apps

1. Verifier l'eligibilite de l'application, l'accord de monetisation, les conditions
   commerciales et les coordonnees de paiement dans le Developer Portal.
2. Creer trois SKU **Consumable**, par exemple `KTGA Koins 25`, `KTGA Koins 150`
   et `KTGA Koins 500`. Recopier les vrais identifiants dans les offres admin.
3. Un SKU deja associe conserve sa quantite et son bonus historiques. Pour
   changer cette attribution, creer un nouveau SKU ; ne pas recycler l'ancien.
4. Configurer les prix dans Discord en respectant sa politique de parite.
   Les prix localises sont ceux presentes par Discord, pas une promesse de tarif
   EUR identique a celui du site. Le site affiche cette distinction.
5. Le SDK utilise `authorize`, `authenticate` puis `startPurchase`. Le code OAuth
   est echange par le serveur, avec verification de l'origine de l'activite et de
   l'identite Discord liee. Le jeton d'acces temporaire n'est pas conserve.
6. Le serveur interroge l'API officielle : application, utilisateur, SKU de type
   Consumable, type d'entitlement, dates et etat. Seuls les droits verifies sont
   credites, une fois, puis consommes avec reprise durable en cas d'echec.
7. Le bouton de recuperation parcourt les entitlements par pages ; les droits
   consommes par une autre integration ne sont pas recrees. Les commandes connues
   sont aussi reverifiees periodiquement pour detecter les droits supprimes.
   Une erreur reseau ou un 404 ne vaut jamais preuve de remboursement : examiner
   les erreurs dans l'administration avant d'intervenir.

L'API d'entitlements ne fournit pas une facture PDF ni le prix local effectivement
paye. KTGA n'invente donc ni montant ni TVA : il fournit un **justificatif
d'attribution**, distinct d'une facture fiscale. Les documents de vente restent
ceux accessibles chez Discord. Verifier avec Discord et le comptable les besoins
de facturation du cas concret avant d'ouvrir ce canal. Les statistiques indiquent
un montant inconnu pour ces achats, et non une vente gratuite.

## Documents, emails et confidentialite

Le modele des nouveaux justificatifs se regle dans **Monetisation > Modele des
factures** : logo PNG/JPEG (2 Mo maximum), nom affiche, couleur, textes et quatre
liens utiles. L'apercu PDF est prive, reserve aux administrateurs et n'emet ni
numero comptable ni transaction. Les champs de facturation restent ceux de
l'onglet Activation et facturation. Les documents deja emis ne sont pas modifies.

Pour les factures Stripe, configurer aussi le logo et les informations de
l'entreprise dans le compte Stripe. KTGA transmet les textes de pied de page,
les liens et la reference de commande aux nouvelles factures de Checkout, sans
recomposer les PDF officiels. Un lien vers le document fournisseur est disponible
dans l'historique lorsqu'il est fourni par Stripe.

L'apercu PDF utilise un iframe local `blob:`. La configuration Nginx HTTPS doit
inclure `frame-src 'self' blob:` en conservant les autres sources existantes.
Le modele fourni dans ce depot est a jour ; valider avec `nginx -t` avant reload.

Les factures et avoirs Stripe sont recuperes sans regeneration ni modification
de leur numero officiel. KTGA conserve une reference d'archivage distincte et le
PDF original. Les attributions gratuites emettent un justificatif a 0 EUR, non
une vente ou une facture fiscale. Les justificatifs de remboursement ne
remplacent pas un avoir officiel.

Les PDF sont prives : seuls leur proprietaire et les administrateurs peuvent les
telecharger. Les editeurs n'ont pas acces a la monetisation. Les documents emis
ne sont ni reecrits ni renumerotes lors d'un nouvel envoi.

Les taches d'emission, consommation et envoi persistent dans SQLite. Les erreurs
sont visibles, avec jusqu'a dix tentatives et delais croissants, puis reprise
manuelle. L'email utilisateur et sa copie administrative joignent le document et
indiquent le solde au moment de l'envoi. Une reprise d'email ne recree aucun
credit ni document. SMTP assure une livraison au moins une fois : une panne
apres acceptation du courrier peut provoquer un doublon malgre un Message-ID stable.

Ne pas exposer les PDF via un dossier statique ou des liens permanents publics.
La suppression d'un compte ou un reset ne doit pas effacer les pieces comptables
encore soumises a conservation. Definir une politique de conservation documentee,
un acces restreint aux sauvegardes et la procedure d'anonymisation/effacement
apres expiration des obligations. L'outil ne remplace pas cette politique legale.
La suppression administrative d'un compte est bloquee lorsqu'un paiement connu
reste en attente ou en litige, afin de permettre sa livraison ou son remboursement.

## Activation reelle, uniquement une fois en ordre

1. Valider le statut de l'activite, la TVA, les obligations d'information et le
   traitement des achats numeriques avec un professionnel competent.
2. Publier des conditions d'achat adaptees, le remboursement/la retractation
   applicable, les contacts, la confidentialite et les durees de conservation.
   La case d'acceptation KTGA ne supprime pas automatiquement la retractation.
3. Completer l'emetteur, l'adresse, le pays, l'identification d'entreprise, le
   regime TVA et les emails administratifs. Choisir l'activite declaree et
   confirmer la validation juridique/fiscale dans l'admin.
4. Configurer les identifiants reels des fournisseurs et leurs webhooks, sans
   melanger cles test et commandes reelles. Tester d'abord dans une base isolee.
5. Desactiver le mode test, enregistrer, puis activer explicitement les achats.
   La boutique et les codes peuvent etre ouverts separement.
6. Surveiller les premieres ventes, livraisons, factures et emails. Verifier le
   traitement d'un remboursement et rapprocher les montants avec les fournisseurs.

Les seuils DAC7 (30 ventes / 2 000 EUR) concernent la transmission d'informations
par les plateformes. Ce ne sont pas une franchise fiscale ou une autorisation
generale d'exercer une activite commerciale sans formalites.

## Verification sans argent reel

```powershell
cd server
node --test test/koins.test.js test/koins-storage.test.js test/koins-api.test.js test/gameplay-reset.test.js test/mascot-gift.test.js
cd ../client
npm run build
```

Le controle navigateur facultatif `client/scripts/check-koins-browser.mjs`
utilise un serveur Vite, Playwright et le bloqueur Ghostery. `PLAYWRIGHT_MODULE`
et `BLOCKER_MODULE` permettent de pointer vers des installations locales sans
ajouter de dependances a l'application. Les captures vont dans `docs/previews`.

La suite couvre les signatures, les montants incorrects, les doublons, les codes,
la concurrence HTTP, les SKU non consommables, les remboursements, les litiges,
les pannes email, l'immuabilite des documents, les permissions et les rollbacks
avec le stockage normalise reel. Elle ne certifie pas un compte marchand :
effectuer aussi les parcours sandbox officiels Stripe/Discord avant activation.

## References officielles

- [Stripe Checkout : factures et recus](https://docs.stripe.com/receipts)
- [Stripe : webhooks](https://docs.stripe.com/webhooks)
- [Stripe : avoir et remboursement](https://docs.stripe.com/api/credit_notes/create)
- [Discord : entitlements](https://docs.discord.com/developers/resources/entitlement)
- [Discord : SKU](https://docs.discord.com/developers/resources/sku)
- [Discord : politique de monetisation et parite](https://support-dev.discord.com/hc/en-us/articles/23810643331735-Premium-Apps-Required-Support-for-Monetizing-Apps)
- [SPF Finances : declaration DAC7](https://news.belgium.be/fr/declaration-obligatoire-par-les-operateurs-de-plateforme-des-ventes-sur-leur-plateforme-partir-de)
- [Belgique : facturation electronique obligatoire](https://efacture.belgium.be/fr/article/partir-de-quand-la-facturation-electronique-est-elle-obligatoire)
- [Belgique : PDF et facture structuree](https://efacture.belgium.be/fr/article/quest-ce-quune-facture-electronique)
- [SPF Finances : comptabilite et conservation](https://finances.belgium.be/fr/entreprises/impot_des_societes/comptabilite)
- [Droits des consommateurs, contenu numerique](https://eur-lex.europa.eu/eli/dir/2011/83/2022-05-28/fra)
