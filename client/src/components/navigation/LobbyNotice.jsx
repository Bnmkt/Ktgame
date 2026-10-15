import { useId, useState } from "react";
import { ChevronDown, ChevronUp, Megaphone, X } from "lucide-react";
import { api, API_URL } from "../../api.js";
import { gameImageUrl } from "../../features/games/presentation.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { MarkdownContent } from "../patchnotes/MarkdownContent.jsx";
import "./lobby-notice.css";

export function LobbyNotice({ notice, user = {}, setUser, preview = false }) {
  const { t: localeText } = useLocale();
  const [dismissed, setDismissed] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expandedRevision, setExpandedRevision] = useState("");
  const [failedImage, setFailedImage] = useState("");
  const bodyId = useId(), revision = notice?.updatedAt || "preview";
  const expanded = expandedRevision === revision;
  const background = gameImageUrl(notice?.backgroundImage);
  const imageUrl = background.startsWith("/api/") ? `${API_URL}${background}` : background;
  if (!notice?.content?.trim() || !preview && (!notice.enabled || !notice.updatedAt || notice.updatedAt === dismissed || notice.updatedAt === user.lobbyNoticeDismissedAt)) return null;
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
  return <section className={`lobby-notice${expanded ? " is-expanded" : ""}`} aria-label={localeText("Annonce")}>
    {background && failedImage !== imageUrl && <span className="lobby-notice-art" aria-hidden="true"><img src={imageUrl} alt="" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedImage(imageUrl)}/><img src={imageUrl} alt="" decoding="async" referrerPolicy="no-referrer"/></span>}
    <header><div><Megaphone size={20}/><h2>{notice.title || localeText("Annonce")}</h2></div>{!preview && <button type="button" className="secondary icon-toggle" disabled={busy} aria-label={localeText("Fermer l’annonce")} title={localeText("Fermer l’annonce")} onClick={close}><X size={18}/></button>}</header>
    <div id={bodyId}><MarkdownContent preserveLineBreaks className={`lobby-notice-content${expanded ? "" : " lobby-notice-snippet"}`}>{notice.content}</MarkdownContent></div>
    <footer><button type="button" className="secondary lobby-notice-expand" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpandedRevision(expanded ? "" : revision)}>{expanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}{expanded ? localeText("Réduire l’annonce") : localeText("Lire la suite")}</button></footer>
    {error && <p className="error" role="alert">{localeText(error)}</p>}
  </section>;
}
