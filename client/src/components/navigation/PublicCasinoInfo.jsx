import { useLocale } from "../../locales/LocaleProvider.jsx";
import { appPath } from "../../navigation/routes.js";
import "./public-casino-info.css";

export function PublicCasinoInfo({ games = [], siteName = "KTGA.ME" }) {
  const { t } = useLocale();
  return <section className="app-shell public-casino-info" aria-labelledby="public-casino-introduction">
    <header><h2 id="public-casino-introduction">{t("Des jeux de cartes et de dés, à partager")}</h2><p>{t("{site} est un espace de mini-jeux gratuits sur navigateur. Retrouve les jeux de cartes et de dés, joue entre amis ou rencontre d’autres joueurs autour d’une table. Aucun logiciel de jeu n’est nécessaire pour participer.", { site: siteName })}</p></header>
    <div className="public-casino-categories">{["dice", "cards"].map((type) => <section key={type}><h3>{t(type === "dice" ? "Jeux de dés" : "Jeux de cartes")}</h3><p>{t(type === "dice" ? "Relancer, garder ses dés ou tenter sa chance : chaque jeu a ses combinaisons et sa façon de marquer des points." : "Stratégie, mémoire, bluff ou patience : choisis une partie multijoueur ou un solitaire, selon les règles du jeu.")}</p><ul>{games.filter((game) => game.enabled !== false && game.type === type).map((game) => <li key={game.id}><a href={appPath("games", game.id)}>{t(game.name)}</a></li>)}</ul></section>)}</div>
    <div className="public-casino-principles"><h3>{t("Des jetons de jeu, pas d’argent réel")}</h3><p>{t("Les jetons sont une monnaie exclusivement virtuelle. Ils ne peuvent être ni achetés avec de l’argent réel, ni retirés ou convertis en argent. Les parties classiques permettent de jouer à son rythme ; les parties classées proposent un classement sur une sélection de jeux.")}</p><p>{t("Les règles sont consultables librement avant de jouer. Le guide et la FAQ présentent les tables, les niveaux, les maîtrises et les protections des comptes. Un parcours parental est prévu pour les moins de 13 ans.")}</p></div>
    <nav aria-label={t("Découvrir le casino")}><a href={appPath("guide")}>{t("Guide du joueur")}</a><a href={appPath("faq")}>{t("Questions fréquentes")}</a><a href={appPath("parents")}>{t("Informations pour les parents")}</a></nav>
  </section>;
}
