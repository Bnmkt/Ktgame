import { Dice5, Landmark, LogOut, Shield, ShoppingBag, Sparkles, Trophy, User, Users } from "lucide-react";
import { appPath } from "../../navigation/routes.js";
import { CosmeticIcon } from "../cosmetics/Cosmetics.jsx";

export function CasinoHeader({ user, siteName, siteIcon, view, roomCode, eventSlug, onNavigate, onFriends, onLogout, children }) {
  const destinations = [
    ["lobby", "Casino", Landmark],
    ["shop", "Boutique", ShoppingBag],
    ["leaderboard", "Classements", Trophy],
    ["profile", "Profil", User],
    ...(roomCode ? [["room", "Ma table", Dice5]] : []),
    ...(eventSlug ? [["event", "Événement", Sparkles]] : []),
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
        <button type="button" onClick={onFriends} aria-haspopup="dialog"><Users size={18} /><span>Amis</span></button>
      </nav>
      <div className="casino-accountbar">
        {children}
        <button type="button" className="secondary icon-toggle casino-logout" onClick={onLogout} title="Déconnexion" aria-label="Déconnexion"><LogOut size={18} /></button>
      </div>
    </div>
  </header>;
}
