import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { PiecePreview } from "../../src/components/cosmetics/PiecePreview.jsx";
import { cosmeticCssRules, defaultVisualDesign, VisualDesigner } from "../../src/components/cosmetics/Cosmetics.jsx";
import { DiceThrowTray, Die } from "../../src/components/game/GamePieces.jsx";
import { diceRendererStats } from "../../src/components/game/dice-solid-renderer.js";
import "../../src/styles.css";
window.piecePreviewStats = diceRendererStats;
function Fixture() {
  const [design, setDesign] = useState({ ...defaultVisualDesign("diceSkins"), backgroundMode: "solid", primaryColor: "#fff2a9", secondaryColor: "#fff2a9", pipColor: "#111111", glow: 0 });
  const item = { type: "diceSkins", value: "fixture-one", design };
  return <main className="app-shell" style={{ maxWidth: 1000, padding: 24 }}>
    <style>{cosmeticCssRules([item])}</style>
    <h1>Apercus des objets</h1>
    <div className="piece-check-gallery" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", background: "#16362a", padding: 16, borderRadius: 8 }}><section><h2>Carte</h2><PiecePreview type="cardSkins" skin="premium-ruby"/></section><section><h2>De</h2><PiecePreview type="diceSkins" skin="fixture-one"/></section></div>
    <div data-piece-case="table"><DiceThrowTray label="Piste de lancer"><Die value={1} skin="fixture-one" animate={false}/><Die value={6} skin="fixture-one" animate={false}/></DiceThrowTray></div>
    <VisualDesigner type="diceSkins" design={design} onChange={setDesign} onActivate={() => {}} onDisable={() => {}}/>
  </main>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><Fixture/></LocaleProvider>);
