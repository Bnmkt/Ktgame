import { AlertCircle, CheckCircle2, Clock3, CircleHelp, MinusCircle, SearchCheck } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";

const indexStates = {
  ok: ["IndexNow OK", "success", CheckCircle2, "Envoi accepté par IndexNow (HTTP 200). Cela ne confirme pas l’indexation."],
  validating: ["IndexNow En attente", "warning", Clock3, "URL reçue (HTTP 202), validation de la clé en attente. Cela ne confirme pas l’indexation."],
  pending: ["IndexNow En attente", "warning", Clock3, "Un changement attend son prochain envoi."],
  error: ["IndexNow Erreur", "danger", AlertCircle, "L’envoi a échoué et sera réessayé automatiquement."],
  disabled: ["IndexNow Désactivé", "muted", MinusCircle, "Les notifications automatiques sont désactivées."],
  excluded: ["IndexNow Exclue", "muted", MinusCircle, "Cette page n’est pas destinée à l’indexation."],
  sent: ["IndexNow Envoyé", "muted", CheckCircle2, "Envoi accepté avant la mise en place du suivi détaillé par URL. Le code de réponse individuel n’est pas disponible."]
};
const googleStates = {
  indexed: ["Google Indexée", "success", CheckCircle2, "Google Search Console confirme la présence de cette URL dans son index à la date de vérification."],
  "not-indexed": ["Google Non indexée", "warning", AlertCircle, "Google Search Console ne confirme pas la présence de cette URL dans son index."],
  unknown: ["Google À vérifier", "muted", CircleHelp, "Aucune confirmation d’indexation disponible pour cette URL."],
  "not-configured": ["Google À connecter", "muted", SearchCheck, "Une connexion Google Search Console est nécessaire pour vérifier l’indexation."],
  error: ["Google Erreur", "danger", AlertCircle, "La vérification Google a échoué."],
  excluded: ["Google Exclue", "muted", MinusCircle, "Cette page n’est pas destinée à l’indexation."]
};

export function SeoPageStatus({ indexNow, google, googleConsoleUrl, canInspectGoogle, busy, onInspectGoogle }) {
  const { t } = useLocale();
  function badge(value, states, fallback, href) {
    const [label, tone, Icon, detail] = states[value?.state] ?? states[fallback];
    const date = value?.checkedAt || value?.attemptedAt || value?.acceptedAt;
    const title = [t(detail), date ? `${t("Vérifié le")} ${new Date(date).toLocaleString()}` : "", value?.coverageState, value?.error && t(value.error)].filter(Boolean).join("\n");
    const content = <><Icon size={13}/>{t(label)}{value?.error && value.state !== "error" && <AlertCircle size={13}/>}</>;
    const visibleTone = value?.error && value.state !== "error" ? "warning" : tone;
    return href ? <a className="comms-url-state" data-tone={visibleTone} href={href} target="_blank" rel="noopener noreferrer" title={title}>{content}</a> : <span className="comms-url-state" data-tone={visibleTone} title={title}>{content}</span>;
  }
  return <div className="comms-url-states">
    {badge(indexNow, indexStates, "pending")}
    {badge(google, googleStates, "not-configured", google?.state !== "excluded" ? google?.inspectionUrl || googleConsoleUrl : "")}
    {canInspectGoogle && google?.state !== "excluded" && <button type="button" className="secondary icon-toggle" disabled={busy} onClick={onInspectGoogle} title={t("Vérifier sur Google")} aria-label={t("Vérifier sur Google")}><SearchCheck size={15}/></button>}
  </div>;
}
