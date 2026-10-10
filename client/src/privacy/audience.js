import { CONSENT_DURATION, PRIVACY_VERSION } from "./consent.js";
import { gameRules } from "../config/site.js";

export const AUDIENCE_VERSION = "2026-10-07";
export const AUDIENCE_ID = "G-YK0459SVPW";
export const AUDIENCE_ENABLED = import.meta.env?.VITE_AUDIENCE_READY === "true";
const pages = { lobby: ["/", "Accueil"], games: ["/jeux", "Jeux et règles"], faq: ["/faq", "Questions fréquentes"], guide: ["/guide", "Guide du joueur"], patchnotes: ["/patchnotes", "Patchnotes"], status: ["/status", "État des services"], shop: ["/shop", "Boutique"], leaderboard: ["/classements", "Classements"], room: ["/table", "Table de jeu"], spectator: ["/observer", "Partie observée"], event: ["/evenement", "Événement communautaire"], bugs: ["/bugs", "Suivi des bugs"], terms: ["/conditions", "Conditions d’utilisation"], legal: ["/mentions-legales", "Mentions légales"], privacy: ["/confidentialite", "Confidentialité"], cookies: ["/cookies", "Cookies"] };

export function audienceAllowed(choice, now = Date.now()) {
  return choice?.version === PRIVACY_VERSION && choice.audienceVersion === AUDIENCE_VERSION && choice.audience === true && choice.ageConfirmed === true && Number.isFinite(choice.chosenAt) && choice.chosenAt <= now && now - choice.chosenAt < CONSENT_DURATION;
}

export function audiencePage(route, search = "") {
  if ([...new URLSearchParams(search).keys()].some((key) => /password|token|verify|parental|receipt|email|secret|challenge|code/i.test(key))) return null;
  const entry = pages[route.view];
  if (!entry) return null;
  const game = route.view === "games" && route.id && Object.hasOwn(gameRules, route.id) ? route.id : "";
  return { page_location: `https://www.ktga.me${entry[0]}${game ? `/${game}` : ""}`, page_title: `KTGA.ME - ${entry[1]}`, page_referrer: "", content_group: route.view };
}

function eraseAudienceCookies(document, hostname) {
  const domains = ["", hostname, `.${hostname}`, "ktga.me", ".ktga.me"];
  for (const part of document.cookie.split(";")) {
    const name = part.split("=", 1)[0].trim();
    if (!/^_ga(?:_|$)/.test(name)) continue;
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure${domain ? `; Domain=${domain}` : ""}`;
  }
}

export function createAudienceClient(window, document, { enabled = AUDIENCE_ENABLED, now = Date.now } = {}) {
  const disabledKey = `ga-disable-${AUDIENCE_ID}`;
  let initialized = false, active = false, script = null, loaded = false, lastPage = "", expiry;
  let minorObserved = false;
  window[disabledKey] = true;
  function tag() { window.dataLayer.push(arguments); }
  function stop({ erase = true } = {}) {
    window[disabledKey] = true;
    if (initialized && active) tag("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    active = false;
    window.clearTimeout(expiry);
    lastPage = "";
    if (script && !loaded) {
      script.onload = null; script.onerror = null; script.remove(); script = null;
      window.dataLayer.length = 0;
      initialized = false;
    }
    if (erase) eraseAudienceCookies(document, window.location.hostname);
  }
  function update({ choice, route, user, accountReady }) {
    if (user?.minor?.restricted) minorObserved = true;
    const allowed = enabled && accountReady && !minorObserved && audienceAllowed(choice, now());
    const page = audiencePage(route, window.location.search);
    if (!allowed || !page) { stop({ erase: !allowed }); return; }
    window[disabledKey] = false;
    if (!initialized) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = tag;
      tag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      tag("set", { allow_google_signals: false, allow_ad_personalization_signals: false, ads_data_redaction: true, url_passthrough: false });
      tag("js", new Date(now()));
      tag("config", AUDIENCE_ID, { ...page, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_domain: "none", cookie_path: "/", cookie_expires: CONSENT_DURATION / 1000, cookie_update: false, cookie_flags: "SameSite=Lax;Secure", ignore_referrer: true });
      script = document.createElement("script");
      script.id = "ktga-metrics-client";
      script.async = true;
      script.referrerPolicy = "no-referrer";
      script.src = `https://www.googletagmanager.com/gtag/js?id=${AUDIENCE_ID}`;
      script.onload = () => { loaded = true; };
      script.onerror = () => { stop(); };
      initialized = true;
      document.head.append(script);
    }
    if (!active) tag("consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    active = true;
    // Only curated page categories are sent; never the browser URL or its title.
    tag("set", page);
    if (lastPage !== page.page_location) {
      tag("event", "page_view", { ...page, send_to: AUDIENCE_ID });
      lastPage = page.page_location;
    }
    window.clearTimeout(expiry);
    expiry = window.setTimeout(() => update({ choice, route, user, accountReady }), Math.max(0, Math.min(2147483647, choice.chosenAt + CONSENT_DURATION - now())));
  }
  return { update, stop };
}
