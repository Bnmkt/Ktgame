import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { PlayingCard } from "../../src/components/game/GamePieces.jsx";
import { CardMotionSurface } from "../../src/components/game/CardMotionSurface.jsx";
import { cosmeticCssRules, defaultVisualDesign } from "../../src/components/cosmetics/Cosmetics.jsx";
import "../../src/styles.css";

const hand = [{ rank: "A", suit: "S" }, { rank: "K", suit: "H" }, { rank: "Q", suit: "D" }, { rank: "J", suit: "C" }];
const custom = { type: "cardSkins", value: "fixture-inlay", design: { ...defaultVisualDesign("cardSkins"), primaryColor: "#123b32", secondaryColor: "#247868", borderColor: "#e5bf63", borderStyle: "double", borderWidth: 4, glow: 8 } };
function Fixture() {
  const [played, setPlayed] = useState(false);
  const [redraw, setRedraw] = useState(0);
  return <main className="app-shell" style={{ maxWidth: 1100, padding: 24 }}>
    <style>{cosmeticCssRules([custom])}{`
      .card-check-table { background: #104c39; padding: 28px; border: 2px solid #ad8040; border-radius: 8px; }
      .card-check-table section { margin-block: 24px; min-height: 140px; }
      .card-check-gallery { display: flex; gap: 24px; flex-wrap: wrap; margin-block: 24px; }
      .card-check-gallery section { padding: 16px; background: #162522; border-radius: 8px; }
      .card-check-hand { display: flex; padding: 16px 4px; }
      .card-check-hand button { padding: 0; border: 0; background: transparent; }
      .card-check-hand button + button { margin-left: -24px; }
      [data-card-case="inline"] .playing-card { display: inline-flex; min-width: 36px; width: 36px; height: 44px; padding: 2px; gap: 2px; }
      [data-card-case="inline"] .playing-card strong, [data-card-case="inline"] .playing-card > span { font-size: 16px; }
      @media(max-width: 600px) { .card-check-table { padding: 16px; } .card-check-hand .playing-card { min-width: 56px; width: 56px; height: 84px; padding: 4px; } .card-check-gallery { gap: 8px; } }
    `}</style>
    <h1>Cartes en relief</h1>
    <CardMotionSurface version={`${played}-${redraw}`}>
      <div className="card-check-table">
        <h2>Table</h2><div className="card-row" data-card-arrival="played" data-card-case="destination">{played && <PlayingCard card={hand[0]} motionKey="ace" playerId="me" />}{hand.slice(1).map((card) => <PlayingCard key={card.rank} card={card} skin="premium-gold" animate={false}/>)}</div>
        <section data-card-owner="other"><h3>Adversaire</h3><div className="card-row" data-card-case="private">{[1, 2].map((i) => <PlayingCard key={i} hidden card={{ rank: "PRIVATE_RANK", suit: "PRIVATE_SUIT" }} skin="classic-red" animate={false} />)}</div></section>
        <section data-card-owner="me"><h3>Votre main</h3><div className="card-check-hand" data-card-case="hand">{!played && <button aria-label="Jouer l'as" onClick={() => setPlayed(true)}><PlayingCard card={hand[0]} motionKey="ace" animate={false} /></button>}{hand.map((card, i) => <button key={i} aria-label={`Carte ${i}`}><PlayingCard card={card} skin="classic-ivory" animate={false}/></button>)}</div></section>
        <button onClick={() => { setPlayed(false); setRedraw(redraw + 1); }}>Redistribuer</button>
      </div>
    </CardMotionSurface>
    <div className="card-check-gallery">{["premium-obsidian", "premium-frame", "premium-notched", "premium-starlight", "fixture-inlay"].map((skin) => <section key={skin} data-card-case={skin}><div className="card-row"><PlayingCard card={hand[1]} skin={skin} animate={false}/><PlayingCard skin={skin} animate={false}/></div></section>)}</div>
    <p data-card-case="inline">Symbole : <PlayingCard inline card={hand[0]} animate={false} /></p>
  </main>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><Fixture/></LocaleProvider>);
