import {
  Dice5,
  Landmark,
  LogOut,
  Menu,
  MoreHorizontal,
  Scale,
  Shield,
  ShoppingBag,
  Sparkles,
  Trophy,
  User,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Dialog } from "../common/Dialog.jsx";
import { appPath } from "../../navigation/routes.js";
import { CosmeticIcon } from "../cosmetics/Cosmetics.jsx";
import { LanguagePicker, useLocale } from "../../locales/LocaleProvider.jsx";
import { softBanLimited } from "../../features/accounts/softban.js";
import { SoundControl } from "../feedback/InterfaceSounds.jsx";
import { CurrencyBalances } from "../../features/koins/Koins.jsx";
import { visibleNavigationCount } from "../../navigation/header-layout.js";

export function CasinoHeader({
  user,
  siteName,
  siteIcon,
  siteIconFramed = true,
  view,
  roomCode,
  eventSlug,
  tribunalAvailable = false,
  onNavigate,
  onLogout,
  children,
}) {
  const { t: localeText } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const navigation = useRef(null),
    measurements = useRef(null);
  const restrictions = user.minor?.restrictions ?? [];
  const limited = (feature) =>
    restrictions.includes(feature) ||
    (feature !== "shop" && softBanLimited(user, feature));
  const destinations = [
    ["lobby", "Casino", Landmark],
    ...(!limited("shop") ? [["shop", "Boutique", ShoppingBag]] : []),
    ["leaderboard", "Classements", Trophy],
    ...(!user.guest &&
    !user.minor?.restricted &&
    !softBanLimited(user, "tribunal:vote") &&
    (tribunalAvailable || view === "tribunal")
      ? [["tribunal", "Tribunal", Scale]]
      : []),
    ["profile", "Profil", User],
    ...(roomCode ? [["room", "Ma table", Dice5]] : []),
    ...(eventSlug && !limited("community-events")
      ? [["event", "Événement", Sparkles]]
      : []),
  ];
  function follow(event, destination) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    setMenuOpen(false);
    onNavigate(destination);
  }
  const mainDestinations = destinations.filter(([key]) =>
    ["lobby", "shop", "leaderboard", "profile"].includes(key),
  );
  const moreActive = !mainDestinations.some(([key]) => key === view);
  const navigationKey = destinations
    .map(([key, label]) => `${key}:${localeText(label)}`)
    .join("|");
  useLayoutEffect(() => {
    const element = navigation.current,
      sizing = measurements.current;
    if (!element || !sizing) return;
    const update = () =>
      setVisibleCount(
        visibleNavigationCount(
          [...sizing.children]
            .slice(0, -1)
            .map((item) => item.getBoundingClientRect().width),
          element.clientWidth,
          sizing.lastElementChild.getBoundingClientRect().width,
        ),
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(sizing);
    return () => observer.disconnect();
  }, [navigationKey]);
  const link = ([key, label, Icon]) => (
    <a
      key={key}
      href={appPath(
        key,
        key === "room" ? roomCode : key === "event" ? eventSlug : "",
      )}
      className={view === key ? "active" : ""}
      aria-current={view === key ? "page" : undefined}
      onClick={(event) => follow(event, key)}
    >
      <Icon size={20} />
      <span>{localeText(label)}</span>
    </a>
  );
  return (
    <header className="casino-header">
      <div className="casino-header-inner">
        <a
          className="casino-brand"
          aria-label={siteName}
          href={appPath("lobby")}
          onClick={(event) => follow(event, "lobby")}
        >
          <CosmeticIcon
            value="site"
            source={siteIcon}
            framed={siteIconFramed}
          />{" "}
          <span className="casino-brand-label">{siteName}</span>
        </a>
        <nav
          ref={navigation}
          className="casino-navigation"
          aria-label={localeText("Navigation du casino")}
        >
          {destinations.slice(0, visibleCount).map(link)}
          {visibleCount < destinations.length && (
            <button
              type="button"
              className={`casino-nav-more ${destinations.slice(visibleCount).some(([key]) => key === view) ? "active" : ""}`}
              title={localeText("Menu du casino")}
              aria-label={localeText("Menu du casino")}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <MoreHorizontal size={21} />
            </button>
          )}
          <div
            ref={measurements}
            className="casino-nav-measure"
            aria-hidden="true"
            inert=""
          >
            {destinations.map(([key, label, Icon]) => (
              <a key={key} tabIndex={-1}>
                <Icon size={20} />
                <span>{localeText(label)}</span>
              </a>
            ))}
            <button type="button" className="casino-nav-more" tabIndex={-1}>
              <MoreHorizontal size={21} />
            </button>
          </div>
        </nav>
        <div className="casino-accountbar">
          <CurrencyBalances user={user} allowKoins={!limited("shop")} />
          {children}
          <button
            type="button"
            className="secondary icon-toggle casino-logout"
            onClick={onLogout}
            title={localeText("Déconnexion")}
            aria-label={localeText("Déconnexion")}
          >
            <LogOut size={18} />
          </button>
        </div>
        <div className="locale-header">
          <SoundControl />
          <LanguagePicker />
        </div>
      </div>
      <nav
        className="casino-mobile-navigation"
        aria-label={localeText("Navigation mobile")}
        style={{ "--mobile-destinations": mainDestinations.length + 1 }}
      >
        {mainDestinations.map(link)}
        <button
          type="button"
          className={menuOpen || moreActive ? "active" : ""}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={21} />
          <span>{localeText("Menu")}</span>
        </button>
      </nav>
      {menuOpen && (
        <Dialog
          title={localeText("Menu du casino")}
          className="casino-mobile-menu"
          layerClassName="casino-mobile-menu-layer"
          onClose={() => setMenuOpen(false)}
        >
          <nav aria-label={localeText("Toutes les destinations")}>
            {destinations.map(link)}
            {(user.admin || user.editor) &&
              link(["admin", user.admin ? "Administration" : "Studio", Shield])}
          </nav>
          <div className="casino-mobile-menu-footer">
            <LanguagePicker />
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
            >
              <LogOut size={18} />
              {localeText("Déconnexion")}
            </button>
          </div>
        </Dialog>
      )}
    </header>
  );
}
