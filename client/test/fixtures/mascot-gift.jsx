import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { MascotGift } from "../../src/components/cosmetics/MascotGift.jsx";
import { setCosmeticCatalogItems } from "../../src/components/cosmetics/Cosmetics.jsx";
import "../../src/styles.css";
function Fixture() {
  setCosmeticCatalogItems(window.giftFixtureCatalog || []);
  const [user, setUser] = useState({ id: "fixture-player", pseudo: "Camille", tokens: 1500, profile: { displayName: "Camille", favoriteGames: ["yahtzee"] }, cosmetics: { equipped: { icon: "chip", memberCard: "default" } }, stats: {}, gameProgression: [] });
  const [pending, setPending] = useState(true);
  window.giftFixtureUser = () => user;
  return <><main className="app-shell"><h1>Casino</h1><div id="lobby-collection-entry"/><section data-lobby-notice>Annonce</section><output data-gift-pending={String(pending)}>{pending ? "Choix du cadeau" : "Bienvenue"}</output></main><MascotGift user={user} lobby onClaim={setUser} onPendingChange={setPending}/></>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><Fixture/></LocaleProvider>);
