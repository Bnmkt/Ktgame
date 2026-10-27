import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { Room } from "../../src/pages/RoomPage.jsx";
import { cosmeticCssRules, defaultVisualDesign } from "../../src/components/cosmetics/Cosmetics.jsx";
import "../../src/styles.css";
import "../../src/navigation/casino.css";
import "../../src/features/theme/theme.css";

const game = new URLSearchParams(location.search).get("game") ?? "yahtzee";
const custom = { type: "diceSkins", value: "table-inlay", design: { ...defaultVisualDesign("diceSkins"), primaryColor: "#173e32", secondaryColor: "#52d9ad", pipColor: "#f9e6b4", borderColor: "#e5bf63" } };
function Fixture() {
  const [user, setUser] = useState({ id: "me", pseudo: "Bnmkt", tokens: 10000, cosmetics: { equipped: { icon: "chip", diceSkin: "table-inlay", cardSkin: "premium-gold" } }, gameTitle: { title: "Nocturne" } });
  return <><style>{cosmeticCssRules([custom])}{`body { background: linear-gradient(#00171077, #001710aa), url('/mascotte_assets/ui/scene-casino.webp') center / cover fixed; }`}</style><Room code={game} user={user} setUser={setUser} onBack={() => {}} onExcluded={() => {}}/></>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><Fixture/></LocaleProvider>);
