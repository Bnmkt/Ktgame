import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { Lobby } from "../../src/pages/LobbyPage.jsx";
import { defaultPublicSettings } from "../../src/config/site.js";
import "../../src/styles.css";
import "../../src/navigation/casino.css";
import "../../src/features/theme/theme.css";

function Fixture() {
  const [user, setUser] = useState({ id: "me", pseudo: "Bnmkt", tokens: 10000, guest: false, profile: { favoriteGames: [] }, cosmetics: { equipped: { icon: "chip" } } });
  const [result, setResult] = useState(null);
  return <><style>{`body { background: linear-gradient(#00171066, #001710bb), url('/mascotte_assets/ui/scene-casino.webp') center / cover fixed; } .selector-fixture-top { height:58px; display:flex; align-items:center; justify-content:space-between; padding:0 24px; background:#0a1519; color:#f2d181; } .selector-fixture-result { position:fixed; left:5px; bottom:5px; background:#06291b; color:white; z-index:200; }`}</style><header className="casino-header selector-fixture-top"><strong>KT Game</strong><span>Casino · Boutique · Classements</span><strong>10 000 jetons</strong></header><Lobby user={user} setUser={setUser} settings={{ ...defaultPublicSettings, featuredGameId: "blackjack", lobbyNotice: null }} onOpenRoom={code => setResult({ action: 'create', code })} onEnterRoom={code => setResult({ action: 'join', code })} onOpenEvent={() => {}}/><output className="selector-fixture-result">{result ? JSON.stringify(result) : ''}</output></>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><Fixture/></LocaleProvider>);
