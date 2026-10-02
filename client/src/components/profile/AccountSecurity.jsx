import { useEffect, useState } from "react";
import { Check, Clipboard, KeyRound, MailCheck, RefreshCw, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { api } from "../../api.js";
import { Dialog } from "../common/Dialog.jsx";

export function AccountSecurity({ user, onUser, onError, onMessage }) {
  const [security, setSecurity] = useState(user.mfa ?? null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let active = true;
    api("/api/me/security").then((result) => { if (active) setSecurity(result); }).catch((error) => { if (active) onError(error.message); });
    return () => { active = false; };
  }, [user.id, onError]);

  function acceptResult(result, message) {
    if (result.security) setSecurity((current) => ({ ...current, ...result.security }));
    if (result.user) onUser(result.user);
    if (message) onMessage(message);
  }

  async function toggleEmail() {
    setBusy("email"); onError("");
    try {
      const result = await api("/api/me/security/email", { method: "PATCH", body: JSON.stringify({ enabled: !security.emailEnabled }) });
      acceptResult(result, result.security.emailEnabled ? "Double authentification par email activée." : "Double authentification par email désactivée.");
    } catch (error) { onError(error.message); }
    finally { setBusy(""); }
  }

  async function startTotp() {
    setBusy("setup"); onError("");
    try { setSetup(await api("/api/me/security/totp/setup", { method: "POST" })); setCode(""); }
    catch (error) { onError(error.message); }
    finally { setBusy(""); }
  }

  async function confirmTotp(event) {
    event.preventDefault();
    setBusy("confirm"); onError("");
    try {
      const result = await api("/api/me/security/totp/confirm", { method: "POST", body: JSON.stringify({ code }) });
      acceptResult(result, "Application d’authentification activée.");
      setRecoveryCodes(result.recoveryCodes ?? []);
      setSetup(null); setCode("");
    } catch (error) { onError(error.message); }
    finally { setBusy(""); }
  }

  async function disableApplication(event) {
    event.preventDefault();
    setBusy("disable"); onError("");
    try {
      const result = await api("/api/me/security/totp", { method: "DELETE", body: JSON.stringify({ method: "totp", code }) });
      acceptResult(result, "Application d’authentification désactivée.");
      setCode("");
    } catch (error) { onError(error.message); }
    finally { setBusy(""); }
  }

  async function regenerate(event) {
    event.preventDefault();
    setBusy("recovery"); onError("");
    try {
      const result = await api("/api/me/security/recovery", { method: "POST", body: JSON.stringify({ code }) });
      acceptResult(result, "De nouveaux codes de secours ont été générés. Les anciens sont invalides.");
      setRecoveryCodes(result.recoveryCodes ?? []); setCode("");
    } catch (error) { onError(error.message); }
    finally { setBusy(""); }
  }

  async function copyRecoveryCodes() {
    await navigator.clipboard?.writeText(recoveryCodes.join("\n"));
    onMessage("Codes de secours copiés.");
  }

  if (!security) return <div className="security-loading">Chargement des méthodes de sécurité…</div>;
  return <div className="mfa-settings">
    <div className="mfa-status"><ShieldCheck size={22} /><span><small>Double authentification</small><strong>{security.enabled ? "Protection active" : "Protection facultative"}</strong></span>{security.required && <em>Obligatoire</em>}</div>
    <div className="mfa-method-list">
      <article><span className="mfa-method-icon"><MailCheck size={20} /></span><div><strong>Code par email</strong><small>{security.emailAvailable ? `Adresse vérifiée ${security.email}` : "Une adresse vérifiée est nécessaire."}</small></div><button type="button" className={security.emailEnabled ? "danger-subtle" : "secondary"} disabled={busy === "email" || (!security.emailAvailable && !security.emailEnabled)} onClick={toggleEmail}>{security.emailEnabled ? "Désactiver" : "Activer"}</button></article>
      <article><span className="mfa-method-icon"><Smartphone size={20} /></span><div><strong>Application TOTP</strong><small>Compatible avec Aegis, 2FAS, Google Authenticator et les gestionnaires de mots de passe.</small></div><button type="button" className={security.totpEnabled ? "danger-subtle" : "secondary"} disabled={busy === "setup"} onClick={security.totpEnabled ? () => { setSetup({ disable: true }); setCode(""); } : startTotp}>{security.totpEnabled ? "Gérer" : "Configurer"}</button></article>
    </div>
    {security.totpEnabled && <div className="mfa-recovery-summary"><KeyRound size={17} /><span><strong>{security.recoveryCodesRemaining}</strong> code{security.recoveryCodesRemaining > 1 ? "s" : ""} de secours disponible{security.recoveryCodesRemaining > 1 ? "s" : ""}</span><button type="button" className="secondary compact" onClick={() => { setSetup({ recovery: true }); setCode(""); }}><RefreshCw size={15} />Renouveler</button></div>}
    {setup?.secret && <Dialog title="Configurer une application TOTP" className="mfa-setup-dialog" onClose={() => setSetup(null)}><form className="form-stack" onSubmit={confirmTotp}><p>Ajoute manuellement ce compte dans ton application, puis saisis le code généré.</p><div className="totp-secret"><small>Clé secrète</small><strong>{setup.secret}</strong><button type="button" className="secondary icon-toggle" title="Copier la clé" aria-label="Copier la clé" onClick={() => navigator.clipboard?.writeText(setup.secret.replace(/\s/g, ""))}><Clipboard size={17} /></button></div><details><summary>Lien de configuration avancé</summary><code className="totp-uri">{setup.uri}</code></details><label>Code à 6 chiffres<input required autoFocus inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" /></label><button type="submit" disabled={busy === "confirm" || code.length !== 6}><Check size={17} />{busy === "confirm" ? "Vérification…" : "Activer"}</button></form></Dialog>}
    {setup?.disable && <Dialog title="Désactiver l’application TOTP" onClose={() => setSetup(null)}><form className="form-stack" onSubmit={disableApplication}><p>Saisis un code actuel. Un administrateur doit conserver la méthode email active avant cette désactivation.</p><label>Code à 6 chiffres<input required autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label><button type="submit" className="danger" disabled={busy === "disable" || code.length !== 6}><Trash2 size={17} />Désactiver</button></form></Dialog>}
    {setup?.recovery && <Dialog title="Renouveler les codes de secours" onClose={() => setSetup(null)}><form className="form-stack" onSubmit={regenerate}><p>Cette action invalide tous les anciens codes de secours.</p><label>Code TOTP actuel<input required autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label><button type="submit" disabled={busy === "recovery" || code.length !== 6}><RefreshCw size={17} />Générer</button></form></Dialog>}
    {recoveryCodes.length > 0 && <Dialog title="Codes de secours" className="mfa-recovery-dialog" dismissible={false} onClose={() => { setRecoveryCodes([]); setSetup(null); }}><p>Conserve ces codes hors du site. Chacun ne fonctionne qu’une fois et ils ne seront plus affichés après la fermeture.</p><div className="recovery-code-grid">{recoveryCodes.map((entry) => <code key={entry}>{entry}</code>)}</div><div className="actions"><button type="button" className="secondary" onClick={copyRecoveryCodes}><Clipboard size={17} />Copier</button><button type="button" onClick={() => { setRecoveryCodes([]); setSetup(null); }}><Check size={17} />Je les ai conservés</button></div></Dialog>}
  </div>;
}
