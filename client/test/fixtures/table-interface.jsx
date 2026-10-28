import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { Room } from "../../src/pages/RoomPage.jsx";
import { cosmeticCssRules, defaultVisualDesign } from "../../src/components/cosmetics/Cosmetics.jsx";
import "../../src/styles.css";
import "../../src/navigation/casino.css";
import "../../src/features/theme/theme.css";

const game = new URLSearchParams(location.search).get("game") ?? "yahtzee";
const viewer = new URLSearchParams(location.search).get("viewer") ?? "me";
const custom = { type: "diceSkins", value: "table-inlay", design: { ...defaultVisualDesign("diceSkins"), primaryColor: "#173e32", secondaryColor: "#52d9ad", pipColor: "#f9e6b4", borderColor: "#e5bf63" } };
function Fixture() {
  const [user, setUser] = useState({ id: viewer, pseudo: viewer === "me" ? "Bnmkt" : "Camille", tokens: 10000, cosmetics: { equipped: { icon: "chip", diceSkin: "table-inlay", cardSkin: "premium-gold" } }, gameTitle: { title: "Nocturne" } });
  return <><style>{cosmeticCssRules([custom])}{`body { background: linear-gradient(#00171099, #001710cc), url('/mascotte_assets/ui/scene-casino.webp') center / cover fixed; } .table-fixture-top { height: 58px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; color: #e8c777; background: #0a1519; }`}</style><header className="casino-header table-fixture-top"><strong>KT Game</strong><span>Casino · Ma table</span><strong>10 000</strong></header><Room code={game} user={user} setUser={setUser} onBack={() => {}} onExcluded={() => {}}/></>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><Fixture/></LocaleProvider>);
