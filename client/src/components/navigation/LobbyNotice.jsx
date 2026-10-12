import { useState } from "react";
import { Megaphone, X } from "lucide-react";
import { api } from "../../api.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { MarkdownContent } from "../patchnotes/MarkdownContent.jsx";
import "./lobby-notice.css";

export function LobbyNotice({ notice, user, setUser }) {
  const { t: localeText } = useLocale();
  const [dismissed, setDismissed] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!notice?.enabled || !notice.content?.trim() || !notice.updatedAt || notice.updatedAt === dismissed || notice.updatedAt === user.lobbyNoticeDismissedAt) return null;
  async function close() {
    if (busy) return;
    const revision = notice.updatedAt, userId = user.id;
    setBusy(true); setError(""); setDismissed(revision);
    try {
      const result = await api("/api/me/lobby-notice/dismiss", { method: "POST", body: JSON.stringify({ updatedAt: revision }) });
      setUser((current) => current?.id === userId ? { ...current, lobbyNoticeDismissedAt: result.dismissedAt } : current);
    } catch (failure) { setDismissed(""); setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="lobby-notice" aria-label={localeText("Annonce")}>
    <header><div><Megaphone size={20}/><h2>{notice.title || localeText("Annonce")}</h2></div><button type="button" className="secondary icon-toggle" disabled={busy} aria-label={localeText("Fermer l’annonce")} title={localeText("Fermer l’annonce")} onClick={close}><X size={18}/></button></header>
    <MarkdownContent className="lobby-notice-content">{notice.content}</MarkdownContent>
    {error && <p className="error" role="alert">{localeText(error)}</p>}
  </section>;
}
