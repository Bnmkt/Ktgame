import React from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { Auth } from "../../src/pages/AuthPage.jsx";
import { PublicGamesOverview } from "../../src/pages/PublicGamesPage.jsx";
import { Lobby } from "../../src/pages/LobbyPage.jsx";
import { GameProgression } from "../../src/components/profile/GameProgression.jsx";
import { RoomStatusPanel } from "../../src/components/room/RoomPanels.jsx";
import { ClassicCompletion } from "../../src/components/room/ClassicCompletion.jsx";
import { Mascot } from "../../src/components/mascots/Mascot.jsx";
import { defaultPublicSettings } from "../../src/config/site.js";
import "../../src/features/theme/theme.css";
import "../../src/styles.css";
import "../../src/privacy/privacy.css";
import "../../src/navigation/casino.css";
import "../../src/navigation/mobile-casino.css";

const user = { id: "one", pseudo: "Alice", profile: { displayName: "Alice", favoriteGames: ["yahtzee"] }, cosmetics: { equipped: {} } };
const players = [user, { id: "two", pseudo: "Camille" }];
const room = { id: "fixture", name: "La table d’Alice", code: "ABC123", gameId: "midnight-dice", ownerId: user.id, players, stake: 10, minPlayers: 2, readyPlayerIds: ["one", "two"] };
const games = [{ id: "yahtzee", name: "Yahtzee", type: "dice", minPlayers: 1, maxPlayers: 6, category: "score", description: "Marque le plus de points après 13 catégories." }];
const settings = { ...defaultPublicSettings, siteName: "KTGA.ME", siteSubtitle: "Cartes, dés et parties entre amis.", registrationsEnabled: true, guestAccessEnabled: true, discordLoginAvailable: true };
const view = new URL(location.href).searchParams.get("view");
const content = view === "lobby" ? <Lobby user={user} setUser={() => {}} settings={settings}/>
  : view === "contexts" ? <main className="app-shell"><div className="page-heading mascot-page-heading"><div><span className="eyebrow">Collections</span><h1>Boutique</h1></div><Mascot character="jacky"/></div><RoomStatusPanel room={room} userId={user.id} isOwner/><GameProgression rows={[{ gameId: "yahtzee", gameName: "Yahtzee", level: 20, mastery: 1, xp: 12000, nextXp: 1500, levelXp: 700, title: "Ministre I" }]} favorites={["yahtzee"]}/><ClassicCompletion room={{ ...room, gameId: "yahtzee", state: { gameId: "yahtzee", finished: true, players, ranking: [{ id: "one", score: 320 }, { id: "two", score: 280 }], winners: ["one"], payouts: { one: 20 } } }} userId={user.id} isOwner onReplay={() => {}} onLeave={() => {}}/></main>
  : <><Auth settings={settings} onAuth={account => { window.lastAuthenticatedAccount = account; }}/><PublicGamesOverview games={games} compact/></>;
createRoot(document.getElementById("root")).render(<LocaleProvider>{content}</LocaleProvider>);
