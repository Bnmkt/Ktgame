import { useEffect, useState } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../../api.js";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";

export function ParentalApprovals() {
  const [rows, setRows] = useState([]);
  const [reference, setReference] = useState("");
  const [verified, setVerified] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api("/api/admin/parental-approvals").then(setRows).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);
  async function create(event) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try { setResult(await api("/api/admin/parental-approvals", { method: "POST", body: JSON.stringify({ reference, verified }) })); setVerified(false); await load(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <section className="parental-admin">
    <header><ShieldCheck size={24} /><div><h2>Autorisations parentales</h2><p>Inscription des moins de 13 ans après vérification manuelle.</p></div></header>
    <form className="form-stack" onSubmit={create}>
      <label>Référence du dossier<input required pattern="[a-zA-Z0-9_-]{3,60}" maxLength={60} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="PARENT-2026-001" /></label>
      <label className="privacy-age"><input required type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} /><span>J'ai vérifié de façon proportionnée l'identité du représentant légal, son autorité parentale et son autorisation explicite pour l'inscription et le profil public. La preuve est conservée dans le dossier référencé, hors du catalogue public.</span></label>
      <button disabled={busy || !verified} type="submit">{busy ? "Création…" : "Délivrer un code valable 72 h"}</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {result && <div className="parental-code" role="status"><strong>Code à transmettre au parent</strong><code>{result.code}</code><p>Affiché une seule fois. Utilisable pour une seule inscription avant le {new Date(result.expiresAt).toLocaleString("fr-BE")}.</p></div>}
    <div className="parental-pending">{rows.map((row) => <div key={row.id}><span><strong>{row.reference}</strong><small>Expire le {new Date(row.expiresAt).toLocaleString("fr-BE")}</small></span><ConfirmActionButton className="secondary icon-toggle" title="Révoquer l'autorisation" dialogTitle="Révoquer cette autorisation ?" message="Ce code ne permettra plus de créer un compte." confirmLabel="Révoquer" onConfirm={async () => { await api(`/api/admin/parental-approvals/${row.id}`, { method: "DELETE" }); if (result?.id === row.id) setResult(null); await load(); }}><Trash2 size={17} /></ConfirmActionButton></div>)}</div>
  </section>;
}
