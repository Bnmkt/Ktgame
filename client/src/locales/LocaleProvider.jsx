import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { catalogs, languages, translate, validLocale } from "./catalog.js";
import "./locale.css";

const LocaleContext = createContext(null);
const initialLocale = () => { try { const saved = localStorage.getItem("ktga-locale"); return validLocale(saved) ? saved : "fr"; } catch { return "fr"; } };

export function LocaleProvider({ children, initial = "fr", server = false }) {
  const [locale, updateLocale] = useState(() => server ? initial : initialLocale());
  const [messages, setMessages] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const account = useRef(null);
  const revision = useRef(0);
  const load = useCallback(async (language) => {
    try {
      const result = await api(`/api/locales/${language}`, { background: true });
      if (result?.messages && typeof result.messages === "object" && !Array.isArray(result.messages)) setMessages((current) => ({ ...current, ...(language === "en" ? { fr: result.fallback ?? {} } : {}), [language]: result.messages }));
    } catch { /* Bundled translations work offline and during service interruptions. */ }
  }, []);
  useEffect(() => { if (!server) load(locale); }, [locale, load, server]);
  useEffect(() => {
    if (server) return;
    document.documentElement.lang = locale;
    try { localStorage.setItem("ktga-locale", locale); } catch { /* Keep this visit usable without storage. */ }
  }, [locale, server]);
  useEffect(() => {
    if (server) return;
    const refresh = () => load(locale);
    window.addEventListener("ktga-locales-updated", refresh);
    return () => window.removeEventListener("ktga-locales-updated", refresh);
  }, [locale, load, server]);
  const setLocale = useCallback(async (language) => {
    if (!validLocale(language)) return;
    const id = ++revision.current;
    updateLocale(language); setError("");
    const current = account.current;
    if (!current || current.guest) return;
    setSaving(true);
    try {
      const updated = await api("/api/me/locale", { method: "PATCH", background: true, body: JSON.stringify({ locale: language }) });
      if (revision.current === id && account.current?.id === current.id) current.onUser(updated);
    } catch (requestError) { if (revision.current === id) setError(requestError.message); }
    finally { if (revision.current === id) setSaving(false); }
  }, []);
  const bindAccount = useCallback((user, onUser) => {
    const changed = account.current?.id !== user?.id;
    account.current = user ? { id: user.id, guest: user.guest, onUser } : null;
    if (changed) { revision.current++; setSaving(false); setError(""); }
    if (changed && validLocale(user?.profile?.locale)) updateLocale(user.profile.locale);
  }, []);
  const value = useMemo(() => ({ locale, region: languages.find((entry) => entry.code === locale).region, setLocale, bindAccount, saving, error,
    t: (key, values) => translate(locale, messages[locale], key, values, messages.fr) }), [locale, messages, setLocale, bindAccount, saving, error]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext) ?? { locale: "fr", region: "fr-BE", t: (key, values) => translate("fr", catalogs.fr, key, values), setLocale: async () => {}, bindAccount: () => {}, saving: false, error: "" };
}

export function LanguagePicker({ profile = false }) {
  const { locale, setLocale, saving, error, t } = useLocale();
  return <div className={`locale-picker ${profile ? "locale-profile" : ""}`}>
    <label><span className={profile ? "" : "sr-only"}>{t("Langue")}</span><span className="locale-control">
      <img src={`${import.meta.env.BASE_URL}locales/${locale}.svg`} width="24" height="16" alt="" />
      <select aria-label={t("Langue")} value={locale} disabled={saving} onChange={(event) => setLocale(event.target.value)}>{languages.map((language) => <option key={language.code} value={language.code}>{profile ? language.name : language.code.toUpperCase()}</option>)}</select>
    </span></label>{error && <span className="locale-save-error" role="alert">{t(error)}</span>}
  </div>;
}
