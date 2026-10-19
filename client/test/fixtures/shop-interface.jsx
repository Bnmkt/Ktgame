import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { ShopCatalog } from "../../src/components/shop/ShopCatalog.jsx";
import { PublicProfileModal } from "../../src/components/profile/PublicProfileModal.jsx";
import { RankedProfile } from "../../src/features/games/RankedPlay.jsx";
import { previewUserForItem } from "../../src/components/cosmetics/Cosmetics.jsx";
import "../../src/features/theme/theme.css";
import "../../src/styles.css";
import "../../src/navigation/casino.css";

const user = {
  id: "preview-player", pseudo: "Camille", tokens: 3000, friendCode: "ABC123",
  profile: { displayName: "Camille", bio: "Les dés sont lancés.", favoriteGames: ["yahtzee"] },
  cosmetics: { equipped: { memberCard: "default", profileBanner: "default" } },
  profileStats: { publicStats: [{ key: "wins", label: "Victoires", value: "12" }] },
  stats: { gamesPlayed: 28, wins: 12, winRate: 43, achievementsUnlocked: 4, achievementsTotal: 20 },
  gameProgression: []
};
const items = [
  { id: "preview-banner", name: "Bannière cuivrée", type: "profileBanners", value: "shop-fixture-bronze", category: "classic", price: 100, description: "Bannière du profil", css: "background:linear-gradient(135deg,#d7a864,#7b344b 55%,#142c3a);" },
  { id: "preview-card", name: "Carte de collection", type: "memberCards", value: "shop-fixture-card", category: "classic", price: 200, description: "Carte membre", css: "background:linear-gradient(135deg,#154d40,#a0543c);" },
  { id: "preview-dice", name: "Dés jade", type: "diceSkins", value: "shop-fixture-dice", category: "classic", price: 300, description: "Dés de jeu", css: "background:#1c725f;color:#fff;" },
  { id: "preview-cards", name: "Cartes rubis", type: "cardSkins", value: "shop-fixture-cards", category: "classic", price: 400, description: "Cartes de jeu", css: "background:#792739;color:#fff;" }
];

function Fixture() {
  const [selected, setSelected] = useState(null);
  return <main className="app-shell shop-shell"><div className="page-heading"><div><span className="eyebrow">Collections</span><h1>Boutique</h1></div></div><section className="shop-page-panel"><ShopCatalog user={user} items={items} stats={[]} onPurchaseItem={() => {}} onPurchasePack={() => {}} onPreviewProfile={setSelected} /></section><RankedProfile rows={[{ gameId: "yahtzee", gameName: "Yahtzee", competitive: { rank: { id: "silver", label: "Argent III" }, games: 12, wins: 5, elo: 950 } }]} publicView />{selected && <PublicProfileModal profile={previewUserForItem(user, selected)} currentUser={user} preview onClose={() => setSelected(null)} />}</main>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><Fixture /></LocaleProvider>);
