# KTGA.ME - Console PC

Application native Windows 10/11 64 bits, en C++20. Aucun navigateur embarque,
installation ou abonnement n'est necessaire. Ouvrir `KtgaConsole.exe` puis se
connecter avec son compte **administrateur ou editeur**. Les comptes joueurs
n'ont pas acces aux mesures. La double authentification du compte est conservee
(email, application TOTP ou code de recuperation).

## Consultation

- Vue d'ensemble : connexions, tables, CPU, memoire, trafic et latence.
- Services : disponibilite publique, traitements et files des workers.
- Metriques : activite quotidienne, jeux, succes et boutique.
- Incidents : incidents publies et leurs mises a jour.
- Preferences : frequence de lecture, periode et informations de connexion.

Les graphiques techniques conservent jusqu'a 30 minutes. L'activite peut etre
consultee sur 30, 90 ou 365 jours ; la disponibilite suit la retention du site.
Le bouton d'export produit un rapport JSON pour une analyse ulterieure.
L'application ne permet pas de modifier le serveur ou les comptes.

## Securite

L'API utilise HTTPS avec verification des certificats. Le serveur controle les
permissions a chaque requete. Le mot de passe et la session ne sont pas
enregistres ; seuls la frequence et la periode d'affichage sont sauvegardees dans
`%LOCALAPPDATA%\KTGA Console\settings.json`. Fermer ou deconnecter l'application
efface sa session en memoire. Les donnees consultees sont des agregats : pas de
conversations, adresses email, secrets, notes privees ou listes de joueurs.

L'acces depend des nouvelles routes `/api/desktop/overview`, `/metrics` et
`/status` du serveur KTGA. Aucun acces SSH ou mot de passe du VPS n'est requis.

## Compilation

Depuis PowerShell :

```powershell
./desktop/build.ps1 -Compiler C:\chemin\llvm-mingw\bin\clang++.exe
./desktop/dist/KtgaConsole.exe --self-test
./desktop/test/smoke.ps1 -Visual
```

Le script verifie l'empreinte de la dependance JSON, compile un executable
autonome et prepare les notices dans `desktop/dist`. Une configuration CMake
est egalement fournie pour Visual Studio 2022 ou LLVM-MinGW (C++20).
L'executable n'est pas signe numeriquement a ce stade.

Dependances : API Windows et [nlohmann/json 3.12.0](https://github.com/nlohmann/json),
sous licence MIT. Compilateur portable de verification :
[LLVM-MinGW](https://github.com/mstorsjo/llvm-mingw).

Pour les tests seulement, `--server http://127.0.0.1:PORT` accepte une instance
locale isolee (pas le port 4000). `--fixture fichier.json` ouvre un apercu
**hors connexion**, sans session ni acces au serveur.
