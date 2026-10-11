import { useLocale } from "../locales/LocaleProvider.jsx";
import { ArrowLeft, ArrowRight, BookOpen, Dice5, Spade, Users } from "lucide-react";
import { gameRules } from "../config/site.js";
import { Die, PlayingCard } from "../components/game/GamePieces.jsx";
import { appPath } from "../navigation/routes.js";
import { GameArtwork } from "../components/game/GameArtwork.jsx";
import { featuredGame, gameImageUrl } from "../features/games/presentation.js";
import "./public-games.css";

function GameVisual({ game }) {
  const { t: localeText } = useLocale();
  return <GameArtwork source={game.coverImage} fallback={<div className={`public-game-pieces pieces-${game.type}`} aria-hidden="true">{game.type === "dice" ? [4, 2, 1].map((value, index) => <Die key={index} value={value} animate={false} />) : [{ rank: "A", suit: "S" }, { rank: "K", suit: "H" }].map((card) => <PlayingCard key={card.suit} card={card} animate={false} />)}</div>} />;
}

export function PublicGamesOverview({ games = [], siteName = "KTGA.ME", compact = false, featuredGameId = "" }) {
  const { t: localeText } = useLocale();
  const selected = featuredGame(games, featuredGameId);
  const entries = compact ? (selected ? [selected] : []) : games.filter((game) => game.enabled !== false);
  return <section className={`public-games-overview ${compact ? "app-shell" : ""}`}>
    <header className="public-games-heading"><div><h2>{compact ? localeText("À l’affiche") : localeText("Choisir un jeu")}</h2><p>{localeText("Cartes, dés et parties entre amis. Gratuit, avec des jetons exclusivement virtuels.")}</p></div>{compact ? <a className="secondary game-catalog-toggle" href={appPath("games")}>{localeText("Tous les jeux")}<ArrowRight size={18} /></a> : <a href={appPath("guide")}><BookOpen size={18} />{localeText("Guide du joueur")}</a>}</header>
    <div className={`public-games-grid ${compact ? "public-games-featured" : ""}`}>{entries.map((game) => {
      const Entry = compact ? "article" : "a";
      const image = gameImageUrl(game.coverImage) || gameImageUrl(game.descriptiveImage);
      const details = <span className="public-game-type">{game.type === "dice" ? <Dice5 size={15} /> : <Spade size={15} />}{game.type === "dice" ? localeText("Dés") : localeText("Cartes")}<Users size={15} />{game.minPlayers === game.maxPlayers ? game.minPlayers : `${game.minPlayers}–${game.maxPlayers}`}{" " + localeText("joueurs")}</span>;
      return <Entry className={`public-game-entry public-game-${game.type} ${compact ? "public-game-featured" : ""} ${compact && image ? "public-game-spotlight" : ""}`} key={game.id} {...(!compact ? { href: appPath("games", game.id) } : {})}>
        {compact ? <GameArtwork source={image} backdrop eager /> : <><header className="public-game-meta">{details}</header><GameVisual game={game} /></>}<div>{compact ? <div className="public-game-featured-heading"><h3>{localeText(game.name)}</h3>{details}</div> : <h3>{localeText(game.name)}</h3>}<p>{localeText(game.description || gameRules[game.id]?.goal)}</p>{compact ? <div className="public-game-featured-actions"><a className="public-game-play" href={`${appPath("lobby")}#connexion`}>{localeText("Jouer")}<ArrowRight size={18} /></a><a className="public-game-action" href={appPath("games", game.id)}><BookOpen size={17} />{localeText("Les règles")}</a></div> : <span className="public-game-action">{localeText("Découvrir les règles")}<ArrowRight size={17} /></span>}</div>
      </Entry>;
    })}</div>
  </section>;
}

export function PublicGamesPage({ games = [], id = "", siteName = "KTGA.ME", onBack }) {
  const { t: localeText } = useLocale();
  const game = games.find((entry) => entry.id === id && entry.enabled !== false);
  const rules = game && gameRules[game.id];
  if (id && !game) return <main className="app-shell"><section className="public-games-surface"><h1>{localeText("Jeu introuvable")}</h1><p>{localeText("Ce jeu n’est pas disponible publiquement.")}</p><a href={appPath("games")}>{localeText("Tous les jeux")}</a></section></main>;
  return <main className="app-shell public-games-page">
    <header className="page-heading"><div><span className="eyebrow">{siteName}{" " + localeText("· Cartes et dés")}</span><h1>{game ? localeText(game.name) : localeText("Jeux gratuits en ligne")}</h1></div><a className="secondary" href={appPath("lobby")} onClick={onBack ? (event) => { event.preventDefault(); onBack(); } : undefined}><ArrowLeft size={17} />{localeText("Casino")}</a></header>
    <section className="public-games-surface">{game ? <>
      <div className="public-game-intro"><GameVisual game={game} /><div><h2>{localeText(rules?.goal || game.description)}</h2>{game.description !== rules?.goal && <p>{localeText(game.description)}</p>}<dl><div><dt>{localeText("Joueurs")}</dt><dd>{game.minPlayers === game.maxPlayers ? game.minPlayers : localeText("{value0} à {value1}", { value0: game.minPlayers, value1: game.maxPlayers })}</dd></div><div><dt>{localeText("Type")}</dt><dd>{game.type === "dice" ? localeText("Jeu de dés") : localeText("Jeu de cartes")}</dd></div><div><dt>{localeText("Accès")}</dt><dd>{localeText("Gratuit")}</dd></div></dl><a className="public-game-action" href={`${appPath("lobby")}#connexion`}>{localeText("Jouer sur") + " "}{siteName}<ArrowRight size={18} /></a><p className="muted">{localeText("Les jetons n’ont aucune valeur monétaire. Aucun achat ni retrait d’argent réel.")}</p></div></div>
      <nav className="public-game-sections" aria-label={localeText("Règles du jeu")}>{rules?.sections.map((section, index) => <a key={index} href={`#regles-${index}`}>{localeText(section.title)}</a>)}</nav>
      <div className="public-game-rules">{rules?.sections.map((section, index) => <section id={`regles-${index}`} key={index}><h2>{localeText(section.title)}</h2><ul>{section.items.map((item, itemIndex) => <li key={itemIndex}>{localeText(item)}</li>)}</ul></section>)}</div>
      <nav className="public-game-bottom"><a href={appPath("games")}><ArrowLeft size={17} />{localeText("Tous les jeux")}</a><a href={appPath("faq")}>{localeText("Questions fréquentes")}<ArrowRight size={17} /></a></nav>
    </> : <PublicGamesOverview games={games} siteName={siteName} />}</section>
  </main>;
}
