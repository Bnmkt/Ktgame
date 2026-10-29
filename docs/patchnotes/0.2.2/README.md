# Préparation éditoriale de la version 0.2.2

Préparée le 29 octobre 2026 à partir des changements livrés depuis la version 0.2.1 et du format des patchnotes existantes.

- [annonce.md](annonce.md) : annonce courte, prête à copier.
- [patchnote.md](patchnote.md) : texte complet illustré, lisible sans ouvrir l’administration.
- [patchnote.json](patchnote.json) : source structurée des 29 blocs ; les références `local-*` désignent les quatre fichiers du dossier `assets/`.
- [annonce.json](annonce.json) : modèle d’annonce au format du site, désactivé par défaut.
- [preparation.json](preparation.json) : référence du brouillon et résultat des vérifications.

## Relire le brouillon sur KTGA

Le brouillon **0.2.2** est enregistré dans le gestionnaire de patchnotes, avec ses quatre images téléversées. Son identifiant est `00514312-c65c-44dd-b6a6-2e6112aecc82`.

Se connecter avec un compte administrateur ou éditeur, ouvrir [les patchnotes](https://www.ktga.me/patchnotes?version=0.2.2), activer **Mode admin / éditeur**, puis sélectionner **0.2.2**. Le texte peut être relu et modifié avec l’éditeur existant.

La version publique reste **0.2.1**. Le lien vers 0.2.2 présent dans l’annonce deviendra accessible à tous après la publication du patchnote ; publier le patchnote avant d’activer l’annonce.

## Organisation du texte

Le résumé d’ouverture compte 466 caractères. Il est suivi des listes d’ajouts, d’améliorations, de suppressions/remplacements et de corrections. Les sections suivantes expliquent les changements par thème : sélection des jeux, tables, Président, bilans, compte, cosmétiques et économie.

Les conditions des Koins sont reprises dans le résumé, l’annonce et la section dédiée : dépense disponible pour les cosmétiques concernés, achat fermé, obtention actuelle uniquement en récompense de tests décidée à la discrétion de l’administration.

Les illustrations sont des captures de l’interface existante, copiées sans retouche. Les exemples de tables et de bilans sont signalés comme démonstrations. Les chiffres de score, de portefeuille ou de récompense présents sur ces captures ne constituent pas une promesse de gain.

## Vérifications

- Enregistrement des blocs et des images validé avec le store existant, sans troncature du contenu.
- Lecture et affichage des quatre illustrations vérifiés.
- Aperçus à 1 440 × 1 000 et 390 × 844, avec Ghostery activé : aucun débordement horizontal ni erreur JavaScript constaté.
- Quinze liens du patchnote vérifiés en HTTPS : réponse HTTP 200.
- Brouillon absent du catalogue public ; accès public direct à l’API du brouillon refusé avec HTTP 404 ; API éditoriale sans connexion refusée avec HTTP 401.
