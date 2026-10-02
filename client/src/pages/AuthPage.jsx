import { useEffect, useState } from "react";
import { AlertTriangle, Clock3, DoorOpen, KeyRound, Landmark, Link, LogIn, MailCheck, RefreshCw, ShieldAlert, UserPlus } from "lucide-react";
import { api, setToken } from "../api.js";
import { CosmeticIcon } from "../components/cosmetics/Cosmetics.jsx";
import { defaultPublicSettings } from "../config/site.js";
import { EnrollmentFields } from "../privacy/EnrollmentFields.jsx";
import { PRIVACY_VERSION } from "../privacy/consent.js";
import { Dialog } from "../components/common/Dialog.jsx";

const volatileRegistrationDeviceId = crypto.randomUUID();

function registrationDeviceId() {
  const key = "ktga-registration-device";
  try {
    const stored = localStorage.getItem(key);
    if (stored) return stored;
    const next = crypto.randomUUID();
    localStorage.setItem(key, next);
    return next;
  } catch { return volatileRegistrationDeviceId; }
}

export function Auth({ onAuth, onClearSession, onRecoveryComplete, currentUser, pendingRoomCode, settings = defaultPublicSettings }) {
  const [passwordResetToken, setPasswordResetToken] = useState(() => new URL(window.location.href).searchParams.get("reset-password") ?? "");
  const [mode, setMode] = useState(passwordResetToken ? "reset-password" : "login");
  const [login, setLogin] = useState({ identifier: "", password: "" });
  const [register, setRegister] = useState({ email: "", pseudo: "", password: "", passwordConfirm: "" });
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [resetPassword, setResetPassword] = useState({ password: "", confirm: "" });
  const [upgradeEmail, setUpgradeEmail] = useState("");
  const [guest, setGuest] = useState("");
  const [serverStatus, setServerStatus] = useState("checking");
  const [verification, setVerification] = useState(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [restrictedAccess, setRestrictedAccess] = useState(null);
  const [mfa, setMfa] = useState(null);
  const [mfaCode, setMfaCode] = useState("");

  useEffect(() => { api("/api/health").then(() => setServerStatus("ok")).catch(() => setServerStatus("down")); }, []);
  useEffect(() => {
    if (mode === "register" && !settings.registrationsEnabled) setMode("login");
    if (mode === "guest" && !settings.guestAccessEnabled) setMode("login");
  }, [mode, settings.registrationsEnabled, settings.guestAccessEnabled]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("verify-email");
    url.searchParams.delete("verify-email");
    url.searchParams.delete("reset-password");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    if (!token) return;
    setBusy("verification");
    api("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) })
      .then((result) => setVerification({ type: "success", message: `L’adresse ${result.email} est validée. Tu peux te connecter.` }))
      .catch((requestError) => setVerification({ type: "error", message: requestError.message }))
      .finally(() => setBusy(""));
  }, []);

  async function submit(nextMode) {
    setError("");
    if (nextMode === "register" && register.password !== register.passwordConfirm) return setError("Les mots de passe ne correspondent pas.");
    setBusy(nextMode);
    try {
      const payload = nextMode === "register"
        ? { email: register.email, pseudo: register.pseudo, password: register.password, birthDate: register.birthDate, parentEmail: register.parentEmail, termsVersion: register.termsAccepted ? PRIVACY_VERSION : "" }
        : nextMode === "guest" ? { pseudo: guest } : { login: login.identifier, password: login.password };
      const data = await api(nextMode === "guest" ? "/api/auth/guest" : `/api/auth/${nextMode}`, { method: "POST", body: JSON.stringify(payload), ...(nextMode === "register" ? { headers: { "X-Registration-Device": registrationDeviceId() } } : {}) });
      if (data.parentalApprovalRequired) {
        setVerification({ type: "success", message: `${data.message} Code du dossier : ${data.code}.` });
        setMode("login");
        return;
      }
      if (data.verificationRequired) {
        setPendingEmail(register.email);
        setVerification({ type: "pending", message: `Un lien de validation a été envoyé à ${data.email}.` });
        setMode("login");
        return;
      }
      if (data.mfaRequired) {
        const preferredMethod = data.methods.includes("totp") ? "totp" : data.methods[0];
        setMfa({ ...data, method: preferredMethod, login: login.identifier });
        setMfaCode("");
        setMode("mfa");
        return;
      }
      setToken(data.token);
      onAuth(data.user);
    } catch (requestError) {
      if (requestError.code === "EMAIL_VERIFICATION_REQUIRED") {
        setPendingEmail(login.identifier);
        setVerification({ type: "pending", message: `Un lien de validation a été envoyé à ${requestError.data?.email ?? "ton adresse email"}.` });
      } else if (["HARD_BAN", "PARENTAL_ACCESS_REVOKED"].includes(requestError.code)) {
        setRestrictedAccess({ code: requestError.code, reason: requestError.data?.reason || requestError.message, endsAt: requestError.data?.endsAt || "", email: login.identifier });
      } else setError(requestError.message);
    } finally { setBusy(""); }
  }

  async function verifyMfa(event) {
    event.preventDefault();
    setBusy("mfa");
    setError("");
    try {
      const result = await api("/api/auth/mfa/verify", { method: "POST", body: JSON.stringify({ challengeId: mfa.challengeId, method: mfa.method, code: mfaCode, login: mfa.login }) });
      setToken(result.token);
      setMfa(null);
      setMfaCode("");
      onAuth(result.user);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(""); }
  }

  async function sendMfaEmail() {
    setBusy("mfa-email");
    setError("");
    try {
      await api("/api/auth/mfa/email", { method: "POST", body: JSON.stringify({ challengeId: mfa.challengeId }) });
      setVerification({ type: "success", message: `Un nouveau code a été envoyé à ${mfa.email || "ton adresse email"}.` });
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(""); }
  }

  async function updateLegacyLogin(event) {
    event.preventDefault();
    setError("");
    setBusy("upgrade");
    try {
      const result = await api("/api/me/email", { method: "POST", body: JSON.stringify({ email: upgradeEmail }) });
      if (result.verificationRequired) {
        setPendingEmail(upgradeEmail);
        setVerification({ type: "pending", message: `Un lien de validation a été envoyé à ${result.email}.` });
        onAuth(result.user);
      } else {
        setToken(result.token);
        onAuth(result.user);
      }
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(""); }
  }

  async function resendVerification() {
    const email = currentUser?.email || pendingEmail;
    if (!email) return;
    setBusy("resend");
    setError("");
    try {
      await api("/api/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });
      setVerification({ type: "pending", message: "Si cette adresse attend une validation, un nouveau lien vient d’être envoyé." });
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(""); }
  }

  async function requestPasswordReset(event) {
    event.preventDefault();
    setError("");
    setBusy("password-reset-request");
    try {
      const result = await api("/api/auth/request-password-reset", { method: "POST", body: JSON.stringify({ email: recoveryEmail }) });
      setVerification({ type: "success", message: result.message });
      setMode("login");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(""); }
  }

  async function completePasswordReset(event) {
    event.preventDefault();
    setError("");
    if (resetPassword.password !== resetPassword.confirm) return setError("Les mots de passe ne correspondent pas.");
    setBusy("password-reset");
    try {
      await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token: passwordResetToken, password: resetPassword.password }) });
      setToken("");
      onClearSession?.();
      setPasswordResetToken("");
      setResetPassword({ password: "", confirm: "" });
      setVerification({ type: "success", message: "Ton mot de passe a été modifié. Tu peux maintenant te connecter." });
      setMode("login");
      onRecoveryComplete?.();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(""); }
  }

  async function requestParentalReactivation() {
    setBusy("parental-reactivation"); setError("");
    try {
      const result = await api("/api/auth/request-parental-reactivation", { method: "POST", body: JSON.stringify({ email: restrictedAccess?.email }) });
      setVerification({ type: "success", message: result.message });
      setRestrictedAccess(null);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(""); }
  }

  const accountSetup = currentUser?.requiresEmailUpgrade || currentUser?.requiresEmailVerification;
  return <main className="auth-screen"><div className={`auth-panel ${accountSetup ? "auth-account-setup" : ""}`}>
    <div><h1 className="auth-brand"><CosmeticIcon value="site" source={settings.siteIcon} /><span>{settings.siteName}</span></h1><p>{settings.siteSubtitle}</p></div>
    {serverStatus === "checking" && <div className="invite-banner"><Landmark size={18} /> Vérification de la disponibilité du casino...</div>}
    {serverStatus === "down" && <div className="error">Le casino est actuellement indisponible. Le serveur de jeu ne répond pas.</div>}
    {serverStatus === "ok" && accountSetup && <>
      <div className="account-setup-heading"><MailCheck size={28} /><div><span className="eyebrow">Mise à jour du compte</span><h2>{currentUser.requiresEmailUpgrade ? "Ajoute ton adresse email" : "Valide ton adresse email"}</h2></div></div>
      {currentUser.requiresEmailUpgrade ? <form className="form-stack" onSubmit={updateLegacyLogin}><p className="account-setup-copy">Ton ancien identifiant <strong>{currentUser.login}</strong> a permis cette connexion. Désormais, une adresse email valide servira d’identifiant privé ; ton pseudo en jeu ne change pas.</p><label>Adresse email<input required type="email" autoComplete="email" value={upgradeEmail} onChange={(event) => setUpgradeEmail(event.target.value)} placeholder="nom@exemple.be" /></label><button type="submit" disabled={busy === "upgrade"}><MailCheck size={18} />{busy === "upgrade" ? "Mise à jour…" : "Mettre à jour mon identifiant"}</button></form> : <div className="form-stack"><p className="account-setup-copy">Un lien a été envoyé à ton adresse. L’accès au casino sera disponible après sa validation.</p><button type="button" className="secondary" disabled={busy === "resend"} onClick={resendVerification}><RefreshCw size={17} />{busy === "resend" ? "Envoi…" : "Renvoyer le lien"}</button><button type="button" className="secondary" onClick={() => { setToken(""); onClearSession?.(); }}>Revenir à la connexion</button></div>}
      {verification && <VerificationNotice value={verification} pending={busy === "resend"} onResend={resendVerification} canResend={Boolean(currentUser?.email)} />}
      {error && <div className="error">{error}</div>}
    </>}
    {serverStatus === "ok" && !accountSetup && <>
      {pendingRoomCode && <div className="invite-banner"><Link size={18} /> Invitation à la table {pendingRoomCode} : connecte-toi ou utilise le mode invité pour la rejoindre.</div>}
      {!passwordResetToken && !["forgot-password", "mfa"].includes(mode) && <div className="tabs segmented-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}><LogIn size={18} /> Connexion</button>{settings.registrationsEnabled && <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}><UserPlus size={18} /> Inscription</button>}{settings.guestAccessEnabled && <button className={mode === "guest" ? "active" : ""} onClick={() => setMode("guest")}><DoorOpen size={18} /> Invité</button>}</div>}
      {verification && <VerificationNotice value={verification} pending={busy === "resend"} onResend={resendVerification} canResend={verification.type === "pending" && Boolean(pendingEmail)} />}
      {mode === "login" && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); submit("login"); }}><label>Adresse email<input required autoComplete="username" value={login.identifier} onChange={(event) => setLogin({ ...login, identifier: event.target.value })} placeholder="nom@exemple.be" /></label><small className="legacy-login-hint">Ancien compte sans email ? Utilise une dernière fois ton ancien identifiant.</small><label>Mot de passe<input required autoComplete="current-password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} placeholder="Votre mot de passe" type="password" /></label><button type="submit" disabled={busy === "login"}>{busy === "login" ? "Connexion…" : "Se connecter"}</button><button type="button" className="secondary" onClick={() => { setError(""); setVerification(null); setRecoveryEmail(login.identifier.includes("@") ? login.identifier : ""); setMode("forgot-password"); }}><KeyRound size={17} /> Mot de passe oublié ?</button></form>}
      {mode === "mfa" && mfa && <form className="form-stack auth-mfa" onSubmit={verifyMfa}><div className="account-setup-heading"><ShieldAlert size={25} /><div><span className="eyebrow">Connexion sécurisée</span><h2>Deuxième étape</h2></div></div><p className="account-setup-copy">Confirme cette connexion avec une méthode associée à ton compte.</p>{mfa.methods.length > 1 && <div className="segmented-tabs mfa-methods">{mfa.methods.map((method) => <button key={method} type="button" className={mfa.method === method ? "active" : ""} onClick={() => { setMfa({ ...mfa, method }); setMfaCode(""); }}>{method === "totp" ? "Application" : method === "email" ? "Email" : "Code de secours"}</button>)}</div>}<label>{mfa.method === "recovery" ? "Code de secours" : "Code à 6 chiffres"}<input required autoFocus inputMode={mfa.method === "recovery" ? "text" : "numeric"} autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} placeholder={mfa.method === "recovery" ? "XXXXXX-XXXXXX" : "000000"} /></label>{mfa.method === "email" && <><small>Le code est envoyé à {mfa.email || "l’adresse vérifiée du compte"} et expire avec cette tentative.</small><button type="button" className="secondary" disabled={busy === "mfa-email"} onClick={sendMfaEmail}><RefreshCw size={17} />{busy === "mfa-email" ? "Envoi…" : mfa.emailCodeSent ? "Renvoyer le code" : "Envoyer le code"}</button></>}<button type="submit" disabled={busy === "mfa" || !mfaCode.trim()}>{busy === "mfa" ? "Vérification…" : "Confirmer la connexion"}</button><button type="button" className="secondary" onClick={() => { setMfa(null); setMfaCode(""); setError(""); setMode("login"); }}>Annuler</button></form>}
      {mode === "forgot-password" && <form className="form-stack" onSubmit={requestPasswordReset}><div className="account-setup-heading"><KeyRound size={25} /><div><span className="eyebrow">Récupération du compte</span><h2>Mot de passe oublié</h2></div></div><p className="account-setup-copy">Saisis l’adresse email du compte. Un lien valable 30 minutes te permettra de choisir un nouveau mot de passe.</p><label>Adresse email<input required type="email" autoComplete="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="nom@exemple.be" /></label><button type="submit" disabled={busy === "password-reset-request"}><MailCheck size={17} />{busy === "password-reset-request" ? "Envoi…" : "Envoyer le lien"}</button><button type="button" className="secondary" onClick={() => { setError(""); setMode("login"); }}>Retour à la connexion</button></form>}
      {mode === "reset-password" && <form className="form-stack" onSubmit={completePasswordReset}><div className="account-setup-heading"><KeyRound size={25} /><div><span className="eyebrow">Récupération du compte</span><h2>Nouveau mot de passe</h2></div></div><label>Nouveau mot de passe<input required minLength="10" maxLength="128" autoComplete="new-password" type="password" value={resetPassword.password} onChange={(event) => setResetPassword({ ...resetPassword, password: event.target.value })} placeholder="10 caractères et 3 types de caractères" /></label><label>Confirmer le mot de passe<input required minLength="10" maxLength="128" autoComplete="new-password" type="password" value={resetPassword.confirm} onChange={(event) => setResetPassword({ ...resetPassword, confirm: event.target.value })} placeholder="Saisissez à nouveau le mot de passe" /></label><button type="submit" disabled={busy === "password-reset"}>{busy === "password-reset" ? "Modification…" : "Modifier le mot de passe"}</button></form>}
      {mode === "register" && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); submit("register"); }}><label>Adresse email<input required type="email" autoComplete="email" value={register.email} onChange={(event) => setRegister({ ...register, email: event.target.value })} placeholder="nom@exemple.be" /></label><label>Pseudo en jeu<input required autoComplete="nickname" minLength="3" maxLength="32" value={register.pseudo} onChange={(event) => setRegister({ ...register, pseudo: event.target.value })} placeholder="Nom affiché sur ta member card" /></label><EnrollmentFields value={register} onChange={setRegister} /><label>Mot de passe<input required autoComplete="new-password" minLength="10" maxLength="128" value={register.password} onChange={(event) => setRegister({ ...register, password: event.target.value })} placeholder="10 caractères et 3 types de caractères" type="password" /></label><label>Confirmer le mot de passe<input required autoComplete="new-password" minLength="10" maxLength="128" value={register.passwordConfirm} onChange={(event) => setRegister({ ...register, passwordConfirm: event.target.value })} placeholder="Saisissez à nouveau le mot de passe" type="password" /></label><button type="submit" disabled={busy === "register"}>{busy === "register" ? "Création…" : "Créer le compte"}</button></form>}
      {mode === "guest" && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); submit("guest"); }}><label>Pseudo temporaire<input value={guest} onChange={(event) => setGuest(event.target.value)} placeholder="Nom affiché aux tables" /></label><button type="submit" disabled={busy === "guest"}>Entrer en invité</button></form>}
      {(!settings.registrationsEnabled || !settings.guestAccessEnabled) && <div className="auth-availability-note"><AlertTriangle size={16} /><span>{!settings.registrationsEnabled && !settings.guestAccessEnabled ? "Les inscriptions et l’accès invité sont actuellement fermés." : !settings.registrationsEnabled ? "Les nouvelles inscriptions sont actuellement fermées." : "L’accès invité est actuellement fermé."}</span></div>}
      {error && <div className="error">{error}</div>}
    </>}
    {restrictedAccess && <AccessRestrictionDialog value={restrictedAccess} supportEmail={settings.supportEmail} busy={busy === "parental-reactivation"} onRequest={requestParentalReactivation} onClose={() => setRestrictedAccess(null)} />}
  </div></main>;
}

function AccessRestrictionDialog({ value, supportEmail = "contact@netdis.org", busy, onRequest, onClose }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const remaining = value.endsAt ? Math.max(0, Date.parse(value.endsAt) - now) : 0;
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor(remaining % 86400000 / 3600000);
  const minutes = Math.floor(remaining % 3600000 / 60000);
  const seconds = Math.floor(remaining % 60000 / 1000);
  return <Dialog title={value.code === "HARD_BAN" ? "Accès au compte suspendu" : "Accès suspendu par le responsable légal"} className="access-restriction-dialog" onClose={onClose}>
    <div className="access-restriction-icon"><ShieldAlert size={30} /></div>
    <p>{value.reason || "L’accès à ce compte est temporairement indisponible."}</p>
    {value.endsAt && <div className="access-restriction-countdown"><Clock3 size={20} /><span><small>Temps restant</small><strong>{days ? `${days} j ` : ""}{String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</strong></span></div>}
    {value.code === "HARD_BAN" && <p>Un recours peut être adressé par écrit à <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. Indique l’adresse du compte et les éléments permettant de réexaminer la décision.</p>}
    <div className="actions">{value.code === "PARENTAL_ACCESS_REVOKED" && <button type="button" disabled={busy} onClick={onRequest}><MailCheck size={17} />{busy ? "Envoi…" : "Demander une réactivation"}</button>}<button type="button" className="secondary" onClick={onClose}>Fermer</button></div>
  </Dialog>;
}

function VerificationNotice({ value, pending, onResend, canResend }) {
  return <div className={`auth-verification ${value.type}`}>{value.type === "success" ? <MailCheck size={18} /> : <AlertTriangle size={18} />}<span>{value.message}</span>{canResend && <button type="button" className="secondary" disabled={pending} onClick={onResend}><RefreshCw size={15} /> Renvoyer</button>}</div>;
}
