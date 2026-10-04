import { useEffect, useRef, useState } from "react";
import { Bug, CheckCircle2, ImagePlus, RotateCcw, Send, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../../api.js";
import { appPath } from "../../navigation/routes.js";
import { Dialog } from "../../components/common/Dialog.jsx";
import { bugDiagnostics } from "./diagnostics.js";
import { saveBugReceipt } from "./BugReportProvider.jsx";
import { issueIdentifier } from "./identifiers.js";

const initial = () => ({ submissionId: issueIdentifier(), title: "", category: "interface", description: "", expected: "", actual: "", steps: "", frequency: "intermittent", impact: "minor" });
const contextNames = { page: "Page", zone: "Zone du site", game: "Jeu", match: "Partie / manche", room: "Salon", event: "Événement", other: "Autre identifiant" };
async function convertImage(file) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Choisis une image PNG, JPEG ou WebP de 10 Mo maximum.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 4096 / bitmap.width, 4096 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob || blob.size > 3145728) throw new Error("Cette capture dépasse 3 Mo après conversion. Réduis sa taille.");
    return { id: issueIdentifier(), name: file.name.slice(0, 100), blob, url: URL.createObjectURL(blob) };
  } finally { bitmap.close(); }
}
export function BugReportForm({ open, onClose, onFollow, detectedContext, user }) {
  const [draft, setDraft] = useState(initial), [context, setContext] = useState(null), [metadata, setMetadata] = useState(null);
  const [images, setImages] = useState([]), [consent, setConsent] = useState(false), [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState(null), [tab, setTab] = useState("problem");
  const imageRefs = useRef(images), consentRevision = useRef(0);
  imageRefs.current = images;
  useEffect(() => () => { imageRefs.current.forEach((image) => URL.revokeObjectURL(image.url)); }, []);
  useEffect(() => {
    consentRevision.current++; bugDiagnostics.stop(); setConsent(false); setVersion("");
    imageRefs.current.forEach((image) => URL.revokeObjectURL(image.url)); setImages([]); setDraft(initial()); setContext(null); setSuccess(null); setError("");
  }, [user?.id]);
  useEffect(() => {
    if (!open) return;
    if (!context) setContext({ ...detectedContext });
    if (!metadata) api("/api/bugs/metadata", { background: true }).then(setMetadata).catch((reason) => setError(reason.message));
  }, [open, context, detectedContext, metadata]);
  function changeConsent(enabled) {
    const revision = ++consentRevision.current;
    setConsent(enabled); setVersion("");
    if (!enabled) { bugDiagnostics.stop(); return; }
    bugDiagnostics.start();
    api("/api/bugs/diagnostic-version", { background: true }).then((data) => { if (revision === consentRevision.current) setVersion(data.version); }).catch(() => {});
  }
  async function addImages(files) {
    if (images.length + files.length > 6) { setError("Ajoute au maximum 6 captures."); return; }
    const revision = consentRevision.current, converted = []; setBusy(true); setError("");
    try {
      for (const file of files) converted.push(await convertImage(file));
      if (revision !== consentRevision.current) throw new Error("La session a changé. Ajoute les captures à nouveau.");
      if ([...images, ...converted].reduce((sum, image) => sum + image.blob.size, 0) > 12582912) throw new Error("Les captures dépassent 12 Mo au total.");
      setImages((current) => [...current, ...converted]);
    } catch (reason) { converted.forEach((image) => URL.revokeObjectURL(image.url)); setError(reason.message); }
    finally { setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault(); setError("");
    if (draft.title.trim().length < 4 || draft.description.trim().length < 20) { setTab("problem"); setError("Ajoute un titre de 4 caractères et une description de 20 caractères minimum."); return; }
    const revision = consentRevision.current;
    setBusy(true);
    try {
      const uploaded = [];
      for (const image of images) {
        if (!image.upload || Date.now() - image.uploadAt > 3500000) {
          image.upload = await api("/api/bugs/uploads", { method: "POST", background: true, headers: { "Content-Type": "image/png" }, body: image.blob });
          image.uploadAt = Date.now();
        }
        uploaded.push(image.upload);
      }
      const diagnostics = consent ? bugDiagnostics.snapshot(version) : null;
      if (revision !== consentRevision.current) throw new Error("La session a changé. Vérifie ton signalement avant de l'envoyer.");
      if (consent && !diagnostics) throw new Error("L'accord de diagnostic a expiré. Active-le à nouveau, ou envoie sans diagnostic.");
      const result = await api("/api/bugs", { method: "POST", background: true, body: JSON.stringify({ ...draft, context: context ?? detectedContext, images: uploaded, diagnosticConsent: Boolean(diagnostics), ...(diagnostics ? { diagnostics } : {}) }) });
      if (revision !== consentRevision.current) return;
      if (result.anonymous || !user || user.guest) saveBugReceipt(result.report.id, result.receipt);
      changeConsent(false);
      images.forEach((image) => URL.revokeObjectURL(image.url)); setImages([]); setDraft(initial()); setSuccess({ id: result.report.id, code: result.report.code });
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  function reset() {
    changeConsent(false); images.forEach((image) => URL.revokeObjectURL(image.url)); setImages([]); setDraft(initial()); setContext({ ...detectedContext }); setSuccess(null); setError(""); setTab("problem");
  }
  if (!open) return null;
  const field = (key, label, multiline = false, placeholder = "") => <label key={key}>{label}{multiline ? <textarea aria-label={label} value={draft[key]} maxLength={key === "description" ? 6000 : 3000} rows={key === "description" ? 5 : 3} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} placeholder={placeholder} /> : <input aria-label={label} value={draft[key]} maxLength={160} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} placeholder={placeholder} />}</label>;
  const select = (key, label, values) => <label>{label}<select aria-label={label} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}>{Object.entries(values ?? {}).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>;
  return <Dialog title={success ? "Signalement envoyé" : "Signaler un bug"} className="issue-form-dialog" dismissible={!busy} onClose={onClose}>
    {success ? <div className="issue-success"><CheckCircle2 size={42} /><h3>{success.code}</h3><p>Merci ! Ton signalement a bien été reçu. Les informations originales et les captures restent privées jusqu’à relecture.</p><div className="actions"><a className="button-link" href={appPath("bugs", success.id)} onClick={(event) => onFollow?.(event, success.id)}>Consulter le suivi</a><button type="button" className="secondary" onClick={reset}>Nouveau signalement</button></div></div> : <form onSubmit={submit} className="issue-form">
      <nav className="issue-tabs" aria-label="Signalement"><button type="button" className={tab === "problem" ? "active" : "secondary"} onClick={() => setTab("problem")}><Bug size={17} />Le problème</button><button type="button" className={tab === "context" ? "active" : "secondary"} onClick={() => setTab("context")}><ImagePlus size={17} />Contexte et captures</button><button type="button" className={tab === "diagnostic" ? "active" : "secondary"} onClick={() => setTab("diagnostic")}><ShieldCheck size={17} />Diagnostic facultatif</button></nav>
      <div className="issue-form-body">
        {tab === "problem" && <div className="issue-fields">{field("title", "Titre", false, "Ce qui ne fonctionne pas")}{select("category", "Catégorie", metadata?.categories)}<div className="issue-wide">{field("description", "Description", true, "Décris le problème et ce que tu faisais.")}</div>{field("expected", "Résultat attendu", true)}{field("actual", "Résultat obtenu", true)}<div className="issue-wide">{field("steps", "Étapes pour reproduire", true, "1. Ouvrir…\n2. Cliquer…\n3. Le problème apparaît.")}</div>{select("frequency", "Fréquence", metadata?.frequencies)}{select("impact", "Impact", metadata?.impacts)}</div>}
        {tab === "context" && <><div className="issue-section-heading"><h3>Où se situe le problème ?</h3><div className="actions"><button type="button" className="secondary" onClick={() => setContext({ ...detectedContext })}><RotateCcw size={16} />Page actuelle</button><button type="button" className="secondary" onClick={() => setContext(Object.fromEntries(Object.keys(contextNames).map((key) => [key, ""])))}>Vider le contexte</button></div></div><div className="issue-fields">{Object.entries(contextNames).map(([key, label]) => <label key={key}>{label}<input aria-label={label} maxLength={240} value={context?.[key] ?? ""} onChange={(event) => setContext({ ...context, [key]: event.target.value })} /></label>)}</div><h3>Captures · {images.length} / 6</h3><p className="issue-muted">Vérifie qu’aucun mot de passe, email privé ou conversation personnelle n’est visible. Les métadonnées des images sont retirées.</p><label className="issue-file-input"><ImagePlus size={18} />Ajouter des images<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} onChange={(event) => { addImages([...event.target.files]); event.target.value = ""; }} /></label><div className="issue-image-grid">{images.map((image) => <figure key={image.id}><img src={image.url} alt="Capture jointe" /><figcaption><span>{image.name}</span><button type="button" className="secondary icon-toggle" disabled={busy} title="Retirer la capture" onClick={() => { URL.revokeObjectURL(image.url); setImages((current) => current.filter((entry) => entry.id !== image.id)); }}><Trash2 size={16} /></button></figcaption></figure>)}</div></>}
        {tab === "diagnostic" && <section className="issue-consent"><ShieldCheck size={32} /><h3>Un diagnostic, seulement avec ton accord</h3><p>Tu peux envoyer ton signalement sans diagnostic technique.</p><label className="issue-check"><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => changeConsent(event.target.checked)} /><span>J’accepte de transmettre, uniquement pour diagnostiquer et résoudre ce bug, la version du site, la date, le navigateur, le système, les dimensions d’écran, mon identifiant de compte et les codes des erreurs JavaScript, API et WebSocket.</span></label><p className="issue-muted">La collecte commence après cet accord, jusqu’à l’envoi ou son retrait. Les erreurs antérieures ne sont pas récupérées. Aucun cookie, token, mot de passe, contenu de requête ni historique de navigation n’est joint. Le diagnostic reste privé et est supprimé après 90 jours.</p>{consent && <p role="status" className="issue-privacy-note">Diagnostic actif{version ? ` · version ${version}` : ""}. Tu peux fermer ce formulaire pour reproduire le problème, puis revenir ici. Décocher efface les informations recueillies.</p>}</section>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <footer className="issue-form-footer"><small>Privé à réception · Aucun diagnostic sans accord{consent ? " · Diagnostic actif" : ""}</small><button type="submit" disabled={busy || !metadata}><Send size={17} />{busy ? "Envoi en cours…" : "Envoyer le signalement"}</button></footer>
    </form>}
  </Dialog>;
}
