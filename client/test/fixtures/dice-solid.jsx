import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { DiceThrowTray, Die } from "../../src/components/game/GamePieces.jsx";
import { DiceScoreStrip } from "../../src/components/game/DiceScoreStrip.jsx";
import { FarkleBoard } from "../../src/components/game/GameBoards.jsx";
import { diceRendererStats } from "../../src/components/game/dice-solid-renderer.js";
import "../../src/styles.css";
import "../../src/features/theme/theme.css";
import "../../src/components/room/mobile-room.css";

const players = ["Bnmkt", "UnPseudoVraimentBeaucoupTropLong", "Alice", "Louis", "Jade", "Kevin"].map((pseudo, i) => ({ id: String(i), pseudo }));
window.diceFixtureStats = diceRendererStats;
function Fixture() {
  const [gameId, setGame] = useState("farkle");
  const [roll, setRoll] = useState(0);
  const [kept, setKept] = useState([]);
  const [skin, setSkin] = useState("classic-ivory");
  const state = { gameId, players, currentPlayerIndex: 0, dice: gameId === "farkle" ? [1, 2, 3, 4, 5, 6] : [4, 2, 1], turnScore: 450, remainingDice: 6, target: gameId === "farkle" ? 10000 : undefined, scores: { 0: 2400, 1: 3200, 2: 1500, 3: 1400, 4: 900, 5: 800 }, modifiers: { entryScore: 500 }, currentCombination: { rank: 800 }, lastRoll: { playerId: "0", pending: true, points: 60 } };
  players[0].cosmetics = { equipped: { diceSkin: skin } };
  return <main className="app-shell room-app-shell room-playing room-render-budget" style={{ maxWidth: 1200 }}>
    <div className="actions"><label>Jeu<select aria-label="Jeu" value={gameId} onChange={(e) => setGame(e.target.value)}><option value="farkle">Farkle</option><option value="421">421</option><option value="cul-de-chouette">Cul de Chouette</option></select></label><label>Apparence<select aria-label="Apparence" value={skin} onChange={(e) => setSkin(e.target.value)}><option value="classic-ivory">Ivoire</option><option value="classic-charcoal">Charbon</option><option value="premium-gold">Or</option></select></label><button onClick={() => { setKept([]); setRoll(roll + 1); }}>Relancer les six faces</button><button onClick={() => setRoll(roll + 1)}>Relancer les autres</button></div>
    <section className={`board board-${gameId}`}><div className="board-felt"><div className="board-heading"><h2>{gameId === "farkle" ? "Farkle" : gameId === "421" ? "421" : "Cul de Chouette"}</h2><span>Manche 2 / 5</span></div><div className="turn-line">A Bnmkt de jouer</div>
      <DiceScoreStrip state={state} userId="0" />
      {gameId === "farkle" ? <FarkleBoard key={roll} state={state} user={players[0]} onAction={() => {}}/> : <><DiceThrowTray label="Piste de lancer"><Die key={`first-${roll}`} value={4} skin={skin} rollKey={roll} kept={kept.includes(0)} animate={!kept.includes(0)} onClick={() => setKept(kept.includes(0) ? [] : [0])}/><Die key={`second-${roll}`} value={2} skin={skin} rollKey={roll}/><Die key={`third-${roll}`} value={1} skin={skin} rollKey={roll}/></DiceThrowTray><div className="actions"><button onClick={() => setRoll(roll + 1)}>Lancer (2/3)</button><button>Valider</button></div></>}
    </div></section>
  </main>;
}
function ThemeGallery() {
  return <main className="app-shell room-app-shell" style={{ maxWidth: 1000 }}><h1>Apparences des des</h1>{[
    ["Ivoire", "classic-ivory"], ["Charbon", "classic-charcoal"], ["Or", "premium-gold"], ["Rubis", "premium-ruby"], ["Saphir", "classic-sapphire"]
  ].map(([name, skin]) => <div style={{ marginBottom: 20 }} key={skin}><DiceThrowTray label={name} caption="1 - 2 - 3 - 4 - 5 - 6">{[1, 2, 3, 4, 5, 6].map((value) => <Die key={value} value={value} skin={skin} animate={false}/>)}</DiceThrowTray></div>)}</main>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider>{new URLSearchParams(location.search).has("themes") ? <ThemeGallery/> : <Fixture />}</LocaleProvider>);
