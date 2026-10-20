import { useEffect, useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { api } from "../../api.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";

export function IndexNowPanel({ admin }) {
  const { t } = useLocale();
  const [data, setData] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function load() { try { setData(await api("/api/admin/communication/indexnow")); setError(""); } catch (failure) { setError(failure.message); } }
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => clearInterval(timer); }, []);
  async function act(path, method, body) { setBusy(true); try { setData(await api(`/api/admin/communication/indexnow${path}`, { method, body: JSON.stringify(body) })); setError(""); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }
  return <section className="comms-indexnow"><header><h3>IndexNow</h3><div className="comms-export-actions">{admin && data && <label className="comms-binary"><input type="checkbox" checked={data.enabled} disabled={busy} onChange={event => act("", "PATCH", { enabled: event.target.checked })}/>{t("Notifications automatiques")}</label>}<button type="button" className="secondary icon-toggle" disabled={busy} title={t("Actualiser")} aria-label={t("Actualiser IndexNow")} onClick={load}><RefreshCw size={17}/></button>{admin && <button type="button" className="secondary" disabled={busy || !data?.enabled} onClick={() => act("/check", "POST", {})}><Send size={17}/>{t("Vérifier les changements")}</button>}</div></header>{error && <p className="error" role="alert">{t(error)}</p>}{data && <><dl><div><dt>{t("URL en attente")}</dt><dd>{data.pending}</dd></div><div><dt>{t("Dernier envoi accepté")}</dt><dd>{data.lastSuccess ? new Date(data.lastSuccess).toLocaleString() : "-"}</dd></div><div><dt>{t("Réponse du moteur")}</dt><dd>{data.httpStatus || "-"}</dd></div></dl>{data.error && <p className="error" role="status">{t(data.error)}{data.nextAttempt ? ` · ${new Date(data.nextAttempt).toLocaleString()}` : ""}</p>}</>}</section>;
}
