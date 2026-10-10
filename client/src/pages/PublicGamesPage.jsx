import { ArrowLeft, ArrowRight, BookOpen, Dice5, Spade, Users } from "lucide-react";
import { gameRules } from "../config/site.js";
import { Die, PlayingCard } from "../components/game/GamePieces.jsx";
import { appPath } from "../navigation/routes.js";
import { GameArtwork } from "../components/game/GameArtwork.jsx";
import { featuredGame, gameImageUrl } from "../features/games/presentation.js";
import "./public-games.css";

function GameVisual({ game }) {
  return <GameArtwork source={game.coverImage} fallback={<div className={`public-game-pieces pieces-${game.type}`} aria-hidden="true">{game.type === "dice" ? [4, 2, 1].map((value, index) => <Die key={index} value={value} animate={false} />) : [{ rank: "A", suit: "S" }, { rank: "K", suit: "H" }].map((card) => <PlayingCard key={card.suit} card={card} animate={false} />)}</div>} />;
}

export function PublicGamesOverview({ games = [], siteName = "KTGA.ME", compact = false, featuredGameId = "" }) {
  const selected = featuredGame(games, featuredGameId);
  const entries = compact ? (selected ? [selected] : []) : games.filter((game) => game.enabled !== false);
  return <section className={`public-games-overview ${compact ? "app-shell" : ""}`}>
    <header className="public-games-heading"><div><h2>{compact ? "À l’affiche" : "Choisir un jeu"}</h2><p>Cartes, dés et parties entre amis. Gratuit, avec des jetons exclusivement virtuels.</p></div>{compact ? <a className="secondary game-catalog-toggle" href={appPath("games")}>Tous les jeux<ArrowRight size={18} /></a> : <a href={appPath("guide")}><BookOpen size={18} />Guide du joueur</a>}</header>
    <div className={`public-games-grid ${compact ? "public-games-featured" : ""}`}>{entries.map((game) => <a className={`public-game-entry ${compact && gameImageUrl(game.coverImage) ? "public-game-spotlight" : ""}`} key={game.id} href={appPath("games", game.id)}>
      {compact && gameImageUrl(game.coverImage) ? <GameArtwork source={game.coverImage} backdrop eager fallback={<GameVisual game={{ ...game, coverImage: "" }} />} /> : <GameVisual game={game} />}<div><span className="public-game-type">{game.type === "dice" ? <Dice5 size={15} /> : <Spade size={15} />}{game.type === "dice" ? "Dés" : "Cartes"}<Users size={15} />{game.minPlayers === game.maxPlayers ? game.minPlayers : `${game.minPlayers}–${game.maxPlayers}`} joueurs</span><h3>{game.name}</h3><p>{game.description || gameRules[game.id]?.goal}</p><span className="public-game-action">Découvrir les règles<ArrowRight size={17} /></span></div>
    </a>)}</div>
  </section>;
}

export function PublicGamesPage({ games = [], id = "", siteName = "KTGA.ME", onBack }) {
  const game = games.find((entry) => entry.id === id && entry.enabled !== false);
  const rules = game && gameRules[game.id];
  if (id && !game) return <main className="app-shell"><section className="public-games-surface"><h1>Jeu introuvable</h1><p>Ce jeu n’est pas disponible publiquement.</p><a href={appPath("games")}>Tous les jeux</a></section></main>;
  return <main className="app-shell public-games-page">
    <header className="page-heading"><div><span className="eyebrow">{siteName} · Cartes et dés</span><h1>{game ? game.name : "Jeux gratuits en ligne"}</h1></div><a className="secondary" href={appPath("lobby")} onClick={onBack ? (event) => { event.preventDefault(); onBack(); } : undefined}><ArrowLeft size={17} />Casino</a></header>
    <section className="public-games-surface">{game ? <>
      <div className="public-game-intro"><GameVisual game={game} /><div><h2>{rules?.goal || game.description}</h2>{game.description !== rules?.goal && <p>{game.description}</p>}<dl><div><dt>Joueurs</dt><dd>{game.minPlayers === game.maxPlayers ? game.minPlayers : `${game.minPlayers} à ${game.maxPlayers}`}</dd></div><div><dt>Type</dt><dd>{game.type === "dice" ? "Jeu de dés" : "Jeu de cartes"}</dd></div><div><dt>Accès</dt><dd>Gratuit</dd></div></dl><a className="public-game-action" href={`${appPath("lobby")}#connexion`}>Jouer sur {siteName}<ArrowRight size={18} /></a><p className="muted">Les jetons n’ont aucune valeur monétaire. Aucun achat ni retrait d’argent réel.</p></div></div>
      <nav className="public-game-sections" aria-label="Règles du jeu">{rules?.sections.map((section, index) => <a key={index} href={`#regles-${index}`}>{section.title}</a>)}</nav>
      <div className="public-game-rules">{rules?.sections.map((section, index) => <section id={`regles-${index}`} key={index}><h2>{section.title}</h2><ul>{section.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul></section>)}</div>
      <nav className="public-game-bottom"><a href={appPath("games")}><ArrowLeft size={17} />Tous les jeux</a><a href={appPath("faq")}>Questions fréquentes<ArrowRight size={17} /></a></nav>
    </> : <PublicGamesOverview games={games} siteName={siteName} />}</section>
  </main>;
}
