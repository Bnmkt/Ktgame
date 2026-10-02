import { Dice5, Landmark, LogOut, Scale, Shield, ShoppingBag, Sparkles, Trophy, User } from "lucide-react";
import { appPath } from "../../navigation/routes.js";
import { CosmeticIcon } from "../cosmetics/Cosmetics.jsx";

export function CasinoHeader({ user, siteName, siteIcon, view, roomCode, eventSlug, tribunalAvailable = false, onNavigate, onLogout, children }) {
  const restrictions = user.minor?.restrictions ?? [];
  const limited = (feature) => restrictions.includes(feature) || (user.moderation?.type === "soft" && ["friends", "community-events"].includes(feature));
  const destinations = [
    ["lobby", "Casino", Landmark],
    ...(!limited("shop") ? [["shop", "Boutique", ShoppingBag]] : []),
    ["leaderboard", "Classements", Trophy],
    ...(!user.guest && !user.minor?.restricted && user.moderation?.type !== "soft" && (tribunalAvailable || view === "tribunal") ? [["tribunal", "Tribunal", Scale]] : []),
    ["profile", "Profil", User],
    ...(roomCode ? [["room", "Ma table", Dice5]] : []),
    ...(eventSlug && !limited("community-events") ? [["event", "Événement", Sparkles]] : []),
    ...(user.admin || user.editor ? [["admin", user.admin ? "Administration" : "Studio", Shield]] : [])
  ];
  function follow(event, destination) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(destination);
  }
  return <header className="casino-header">
    <div className="casino-header-inner">
      <a className="casino-brand" href={appPath("lobby")} onClick={(event) => follow(event, "lobby")}><CosmeticIcon value="site" source={siteIcon} /> <span>{siteName}</span></a>
      <nav className="casino-navigation" aria-label="Navigation du casino">
        {destinations.map(([key, label, Icon]) => <a key={key} href={appPath(key, key === "room" ? roomCode : key === "event" ? eventSlug : "")} className={view === key ? "active" : ""} aria-current={view === key ? "page" : undefined} onClick={(event) => follow(event, key)}><Icon size={18} /><span>{label}</span></a>)}
      </nav>
      <div className="casino-accountbar">
        {children}
        <button type="button" className="secondary icon-toggle casino-logout" onClick={onLogout} title="Déconnexion" aria-label="Déconnexion"><LogOut size={18} /></button>
      </div>
    </div>
  </header>;
}
