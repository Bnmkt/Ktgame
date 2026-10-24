import { Dice5, Landmark, LogOut, Menu, Scale, Shield, ShoppingBag, Sparkles, Trophy, User } from "lucide-react";
import { useState } from "react";
import { Dialog } from "../common/Dialog.jsx";
import { appPath } from "../../navigation/routes.js";
import { CosmeticIcon } from "../cosmetics/Cosmetics.jsx";
import { LanguagePicker , useLocale } from "../../locales/LocaleProvider.jsx";
import { softBanLimited } from "../../features/accounts/softban.js";
import { SoundControl } from "../feedback/InterfaceSounds.jsx";
import { KoinAccess } from "../../features/koins/Koins.jsx";

export function CasinoHeader({ user, siteName, siteIcon, siteIconFramed = true, view, roomCode, eventSlug, tribunalAvailable = false, onNavigate, onLogout, children }) {
  const { t: localeText } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const restrictions = user.minor?.restrictions ?? [];
  const limited = (feature) => restrictions.includes(feature) || feature !== "shop" && softBanLimited(user, feature);
  const destinations = [
    ["lobby", "Casino", Landmark],
    ...(!limited("shop") ? [["shop", "Boutique", ShoppingBag]] : []),
    ["leaderboard", "Classements", Trophy],
    ...(!user.guest && !user.minor?.restricted && !softBanLimited(user, "tribunal:vote") && (tribunalAvailable || view === "tribunal") ? [["tribunal", "Tribunal", Scale]] : []),
    ["profile", "Profil", User],
    ...(roomCode ? [["room", "Ma table", Dice5]] : []),
    ...(eventSlug && !limited("community-events") ? [["event", "Événement", Sparkles]] : []),
  ];
  function follow(event, destination) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setMenuOpen(false);
    onNavigate(destination);
  }
  const mainDestinations = destinations.filter(([key]) => ["lobby", "shop", "leaderboard", "profile"].includes(key));
  const moreActive = !mainDestinations.some(([key]) => key === view);
  const link = ([key, label, Icon]) => <a key={key} href={appPath(key, key === "room" ? roomCode : key === "event" ? eventSlug : "")} className={view === key ? "active" : ""} aria-current={view === key ? "page" : undefined} onClick={(event) => follow(event, key)}><Icon size={20}/><span>{localeText(label)}</span></a>;
  return <header className="casino-header">
    <div className="casino-header-inner">
      <a className="casino-brand" href={appPath("lobby")} onClick={(event) => follow(event, "lobby")}><CosmeticIcon value="site" source={siteIcon} framed={siteIconFramed}/> <span>{siteName}</span></a>
      <nav className="casino-navigation" aria-label={localeText("Navigation du casino")}>
        {destinations.map(link)}
      </nav>
      <div className="casino-accountbar">
        {!limited("shop") && <KoinAccess user={user}/>}
        {children}
        <button type="button" className="secondary icon-toggle casino-logout" onClick={onLogout} title={localeText("Déconnexion")} aria-label={localeText("Déconnexion")}><LogOut size={18} /></button>
      </div>
    </div>
    <div className="locale-header"><SoundControl/><LanguagePicker /></div>
    <nav className="casino-mobile-navigation" aria-label={localeText("Navigation mobile")} style={{ "--mobile-destinations": mainDestinations.length + 1 }}>
      {mainDestinations.map(link)}
      <button type="button" className={menuOpen || moreActive ? "active" : ""} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={21}/><span>{localeText("Menu")}</span></button>
    </nav>
    {menuOpen && <Dialog title={localeText("Menu du casino")} className="casino-mobile-menu" layerClassName="casino-mobile-menu-layer" onClose={() => setMenuOpen(false)}><nav aria-label={localeText("Toutes les destinations")}>{destinations.map(link)}{(user.admin || user.editor) && link(["admin", user.admin ? "Administration" : "Studio", Shield])}</nav><div className="casino-mobile-menu-footer"><LanguagePicker/><button type="button" className="secondary" onClick={() => { setMenuOpen(false); onLogout(); }}><LogOut size={18}/>{localeText("Déconnexion")}</button></div></Dialog>}
  </header>;
}
