import { useLocale } from "../locales/LocaleProvider.jsx";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Clock3, DoorOpen, KeyRound, Landmark, Link, LogIn, MailCheck, RefreshCw, ShieldAlert, UserPlus, X } from "lucide-react";
import { api, setToken } from "../api.js";
import { CosmeticIcon } from "../components/cosmetics/Cosmetics.jsx";
import { defaultPublicSettings } from "../config/site.js";
import { EnrollmentFields } from "../privacy/EnrollmentFields.jsx";
import { PRIVACY_VERSION } from "../privacy/consent.js";
import { Dialog } from "../components/common/Dialog.jsx";
import { PasswordField } from "../components/common/PasswordField.jsx";
import { startDiscordLogin } from "../features/accounts/discord-login.js";
import { isDiscordActivityLocation } from "../features/discord/context.js";
import "../components/profile/account-connections.css";

const volatileRegistrationDeviceId = crypto.randomUUID();

const passwordRequirements = [
  { label: "10 caractères minimum", test: (value) => value.length >= 10 },
  { label: "Au moins une lettre et un chiffre", test: (value) => /\p{L}/u.test(value) && /\p{N}/u.test(value) },
  { label: "Au moins une majuscule", test: (value) => /\p{Lu}/u.test(value) },
  { label: "Au moins un caractère spécial", test: (value) => /[^\p{L}\p{N}\s]/u.test(value) }
];

function PasswordRequirements({ value }) {
  const { t: localeText } = useLocale();
  return <ul className="password-requirements" aria-label={localeText("Conditions du mot de passe")}>
    {passwordRequirements.map((requirement) => {
      const met = requirement.test(value);
      return <li key={requirement.label} className={met ? "is-met" : "is-missing"} aria-label={`${requirement.label} : ${met ? "condition remplie" : "condition non remplie"}`}>{met ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}<span>{localeText(requirement.label)}</span></li>;
    })}
  </ul>;
}

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

export function Auth({ onAuth, onClearSession, onRecoveryComplete, currentUser, pendingRoomCode, discordResult, settings = defaultPublicSettings }) {
  const { t: localeText, locale } = useLocale();
  const [passwordResetToken, setPasswordResetToken] = useState(() => typeof window === "undefined" ? "" : new URL(window.location.href).searchParams.get("reset-password") ?? "");
  const [mode, setMode] = useState(passwordResetToken ? "reset-password" : "login");
  const activity = isDiscordActivityLocation();
  const [emailOpen, setEmailOpen] = useState(false);
  const [login, setLogin] = useState({ identifier: "", password: "" });
  const [register, setRegister] = useState({ email: "", pseudo: "", password: "", passwordConfirm: "" });
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [resetPassword, setResetPassword] = useState({ password: "", confirm: "" });
  const [upgradeEmail, setUpgradeEmail] = useState("");
  const [guest, setGuest] = useState("");
  const guestInput = useRef(null);
  const [tableEntry, setTableEntry] = useState(null);
  const [serverStatus, setServerStatus] = useState("checking");
  const [verification, setVerification] = useState(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [restrictedAccess, setRestrictedAccess] = useState(null);
  const [mfa, setMfa] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  useEffect(() => {
    if (discordResult?.mfaRequired) {
      setMfa({ ...discordResult, method: discordResult.methods.includes("totp") ? "totp" : discordResult.methods[0] });
      setMfaCode(""); setMode("mfa");
    } else if (discordResult?.error) {
      const err = discordResult.error;
      setError(err.message);
      if (["HARD_BAN", "PARENTAL_ACCESS_REVOKED"].includes(err.code)) setRestrictedAccess({ title: err.code === "HARD_BAN" ? "Accès temporairement bloqué" : "Accès suspendu par le responsable légal", reason: err.data?.reason ?? "", endsAt: err.data?.endsAt ?? "", parental: err.code === "PARENTAL_ACCESS_REVOKED" });
    }
  }, [discordResult]);
  async function connectDiscord() {
    setBusy("discord"); setError("");
    try {
      const result = await startDiscordLogin(pendingRoomCode);
      if (!result) return;
      if (result.mfaRequired) { setMfa({ ...result, method: result.methods.includes("totp") ? "totp" : result.methods[0] }); setMfaCode(""); setMode("mfa"); }
      else { setToken(result.token); onAuth(result.user); }
      setBusy("");
    }
    catch (err) { setError(err.message); setBusy(""); }
  }
  const registrationPasswordReady = passwordRequirements.every((requirement) => requirement.test(register.password));

  useEffect(() => { api("/api/health").then(() => setServerStatus("ok")).catch(() => setServerStatus("down")); }, []);
  useEffect(() => {
    let active = true;
    setTableEntry(null);
    if (pendingRoomCode && !currentUser) api(`/api/table-entry/${encodeURIComponent(pendingRoomCode)}`, { background: true })
      .then((entry) => { if (active) setTableEntry({ ...entry, requestedCode: pendingRoomCode }); })
      .catch((failure) => { if (active) setTableEntry({ requestedCode: pendingRoomCode, error: failure.message, closed: failure.status === 404 }); });
    return () => { active = false; };
  }, [pendingRoomCode, currentUser?.id]);
  useEffect(() => { if (mode === "guest" && pendingRoomCode) guestInput.current?.focus(); }, [mode, pendingRoomCode]);
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
        ? { email: register.email, pseudo: register.pseudo, password: register.password, birthDate: register.birthDate, parentEmail: register.parentEmail, termsVersion: register.termsAccepted ? PRIVACY_VERSION : "", locale }
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
      } else if (requestError.code === "PASSWORD_UPGRADE_REQUIRED") {
        setVerification({ type: "success", message: requestError.message });
        setRecoveryEmail(login.identifier.includes("@") ? login.identifier : "");
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
  return <main className="auth-screen" id="connexion"><div className={`auth-panel ${accountSetup ? "auth-account-setup" : ""}`}>
    <div><h1 className="auth-brand"><CosmeticIcon value="site" source={settings.siteIcon} /><span>{settings.siteName}</span></h1><p>{settings.siteSubtitle}</p></div>
    {serverStatus === "checking" && <div className="invite-banner"><Landmark size={18} />{" " + localeText("Vérification de la disponibilité du casino...")}</div>}
    {serverStatus === "down" && <div className="error">{localeText("Le casino est actuellement indisponible. Le serveur de jeu ne répond pas.")}</div>}
    {serverStatus === "ok" && accountSetup && <>
      <div className="account-setup-heading"><MailCheck size={28} /><div><span className="eyebrow">{localeText("Mise à jour du compte")}</span><h2>{currentUser.requiresEmailUpgrade ? localeText("Ajoute ton adresse email") : localeText("Valide ton adresse email")}</h2></div></div>
      {currentUser.requiresEmailUpgrade ? <form className="form-stack" onSubmit={updateLegacyLogin}><p className="account-setup-copy">{localeText("Ton ancien identifiant") + " "}<strong>{currentUser.login}</strong>{" " + localeText("a permis cette connexion. Désormais, une adresse email valide servira d’identifiant privé ; ton pseudo en jeu ne change pas.")}</p><label>{localeText("Adresse email")}<input required type="email" autoComplete="email" value={upgradeEmail} onChange={(event) => setUpgradeEmail(event.target.value)} placeholder={localeText("nom@exemple.be")} /></label><button type="submit" disabled={busy === "upgrade"}><MailCheck size={18} />{busy === "upgrade" ? localeText("Mise à jour…") : localeText("Mettre à jour mon identifiant")}</button></form> : <div className="form-stack"><p className="account-setup-copy">{localeText("Un lien a été envoyé à ton adresse. L’accès au casino sera disponible après sa validation.")}</p><button type="button" className="secondary" disabled={busy === "resend"} onClick={resendVerification}><RefreshCw size={17} />{busy === "resend" ? localeText("Envoi…") : localeText("Renvoyer le lien")}</button><button type="button" className="secondary" onClick={() => { setToken(""); onClearSession?.(); }}>{localeText("Revenir à la connexion")}</button></div>}
      {verification && <VerificationNotice value={verification} pending={busy === "resend"} onResend={resendVerification} canResend={Boolean(currentUser?.email)} />}
      {error && <div className="error">{localeText(error)}</div>}
    </>}
    {serverStatus === "ok" && !accountSetup && <>
      {pendingRoomCode && <section className="table-entry-notice" aria-label={localeText("Invitation à une table")}><p><Link size={18} /> {tableEntry?.requestedCode === pendingRoomCode && tableEntry.closed ? tableEntry.error : tableEntry?.hostName ? localeText("Invitation à la partie de {value0}", { value0: tableEntry.hostName }) : localeText("Invitation à la table {value0}", { value0: pendingRoomCode })}</p>{tableEntry?.requiresPassword && <small>{localeText("Le code d’accès de cette table sera demandé après la connexion.")}</small>}{settings.guestAccessEnabled && tableEntry?.requestedCode === pendingRoomCode && !tableEntry.error && !tableEntry.ranked && !passwordResetToken && mode === "login" && <button type="button" onClick={() => { setError(""); setMode("guest"); }}><DoorOpen size={18} /><span>{localeText("Pas encore de compte ? Choisis ton pseudo et rejoins") + " "}{tableEntry.hostName ? localeText("la partie de {value0}", { value0: tableEntry.hostName }) : localeText("la partie")}.</span></button>}{tableEntry?.ranked && <small>{localeText("Un compte enregistré est nécessaire pour le classé.")}</small>}</section>}
      {!passwordResetToken && (!activity || emailOpen) && !["forgot-password", "mfa"].includes(mode) && <div className="tabs segmented-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}><LogIn size={18} />{" " + localeText("Connexion")}</button>{settings.registrationsEnabled && <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}><UserPlus size={18} />{" " + localeText("Inscription")}</button>}{settings.guestAccessEnabled && <button className={mode === "guest" ? "active" : ""} onClick={() => setMode("guest")}><DoorOpen size={18} />{" " + localeText("Invité")}</button>}</div>}
      {verification && <VerificationNotice value={verification} pending={busy === "resend"} onResend={resendVerification} canResend={verification.type === "pending" && Boolean(pendingEmail)} />}
      {mode === "login" && settings.discordLoginAvailable && <button type="button" className={`${activity ? "" : "secondary "}account-link-entry`} disabled={Boolean(busy)} onClick={connectDiscord}><LogIn size={18} />{busy === "discord" ? localeText("Connexion…") : localeText("Se connecter avec Discord")}</button>}
      {mode === "login" && activity && <button type="button" className="secondary" aria-expanded={emailOpen} onClick={() => setEmailOpen(value => !value)}>{localeText(emailOpen ? "Masquer les autres connexions" : "Autre méthode de connexion")}</button>}
      {mode === "login" && (!activity || emailOpen) && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); submit("login"); }}><label>{localeText("Adresse email")}<input required autoComplete="username" value={login.identifier} onChange={(event) => setLogin({ ...login, identifier: event.target.value })} placeholder={localeText("nom@exemple.be")} /></label><small className="legacy-login-hint">{localeText("Ancien compte sans email ? Utilise une dernière fois ton ancien identifiant.")}</small><PasswordField label={localeText("Mot de passe")} required autoComplete="current-password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} placeholder={localeText("Votre mot de passe")} /><button type="submit" disabled={busy === "login"}>{busy === "login" ? localeText("Connexion…") : localeText("Se connecter")}</button><button type="button" className="secondary" onClick={() => { setError(""); setVerification(null); setRecoveryEmail(login.identifier.includes("@") ? login.identifier : ""); setMode("forgot-password"); }}><KeyRound size={17} />{" " + localeText("Mot de passe oublié ?")}</button></form>}
      {mode === "mfa" && mfa && <form className="form-stack auth-mfa" onSubmit={verifyMfa}><div className="account-setup-heading"><ShieldAlert size={25} /><div><span className="eyebrow">{localeText("Connexion sécurisée")}</span><h2>{localeText("Deuxième étape")}</h2></div></div><p className="account-setup-copy">{localeText("Confirme cette connexion avec une méthode associée à ton compte.")}</p>{mfa.methods.length > 1 && <div className="segmented-tabs mfa-methods">{mfa.methods.map((method) => <button key={method} type="button" className={mfa.method === method ? "active" : ""} onClick={() => { setMfa({ ...mfa, method }); setMfaCode(""); }}>{method === "totp" ? localeText("Application") : method === "email" ? localeText("Email") : localeText("Code de secours")}</button>)}</div>}<label>{mfa.method === "recovery" ? localeText("Code de secours") : localeText("Code à 6 chiffres")}<input required autoFocus inputMode={mfa.method === "recovery" ? "text" : "numeric"} autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} placeholder={mfa.method === "recovery" ? localeText("XXXXXX-XXXXXX") : "000000"} /></label>{mfa.method === "email" && <><small>{localeText("Le code est envoyé à") + " "}{mfa.email || localeText("l’adresse vérifiée du compte")}{" " + localeText("et expire avec cette tentative.")}</small><button type="button" className="secondary" disabled={busy === "mfa-email"} onClick={sendMfaEmail}><RefreshCw size={17} />{busy === "mfa-email" ? localeText("Envoi…") : mfa.emailCodeSent ? localeText("Renvoyer le code") : localeText("Envoyer le code")}</button></>}<button type="submit" disabled={busy === "mfa" || !mfaCode.trim()}>{busy === "mfa" ? localeText("Vérification…") : localeText("Confirmer la connexion")}</button><button type="button" className="secondary" onClick={() => { setMfa(null); setMfaCode(""); setError(""); setMode("login"); }}>{localeText("Annuler")}</button></form>}
      {mode === "forgot-password" && <form className="form-stack" onSubmit={requestPasswordReset}><div className="account-setup-heading"><KeyRound size={25} /><div><span className="eyebrow">{localeText("Récupération du compte")}</span><h2>{localeText("Mot de passe oublié")}</h2></div></div><p className="account-setup-copy">{localeText("Saisis l’adresse email du compte. Un lien valable 30 minutes te permettra de choisir un nouveau mot de passe.")}</p><label>{localeText("Adresse email")}<input required type="email" autoComplete="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder={localeText("nom@exemple.be")} /></label><button type="submit" disabled={busy === "password-reset-request"}><MailCheck size={17} />{busy === "password-reset-request" ? localeText("Envoi…") : localeText("Envoyer le lien")}</button><button type="button" className="secondary" onClick={() => { setError(""); setMode("login"); }}>{localeText("Retour à la connexion")}</button></form>}
      {mode === "reset-password" && <form className="form-stack" onSubmit={completePasswordReset}><div className="account-setup-heading"><KeyRound size={25} /><div><span className="eyebrow">{localeText("Récupération du compte")}</span><h2>{localeText("Nouveau mot de passe")}</h2></div></div><PasswordField label={localeText("Nouveau mot de passe")} required minLength={10} maxLength={128} autoComplete="new-password" value={resetPassword.password} onChange={(event) => setResetPassword({ ...resetPassword, password: event.target.value })} placeholder={localeText("10 caractères, lettre, chiffre, majuscule et symbole")} /><PasswordField label={localeText("Confirmer le mot de passe")} required minLength={10} maxLength={128} autoComplete="new-password" value={resetPassword.confirm} onChange={(event) => setResetPassword({ ...resetPassword, confirm: event.target.value })} feedback={resetPassword.confirm ? { matches: resetPassword.password === resetPassword.confirm } : null} placeholder={localeText("Saisissez à nouveau le mot de passe")} /><button type="submit" disabled={busy === "password-reset" || !resetPassword.confirm || resetPassword.password !== resetPassword.confirm}>{busy === "password-reset" ? localeText("Modification…") : localeText("Modifier le mot de passe")}</button></form>}
      {mode === "register" && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); submit("register"); }}><label>{localeText("Adresse email")}<input required type="email" autoComplete="email" value={register.email} onChange={(event) => setRegister({ ...register, email: event.target.value })} placeholder={localeText("nom@exemple.be")} /></label><label>{localeText("Pseudo en jeu")}<input required autoComplete="nickname" minLength="3" maxLength="32" value={register.pseudo} onChange={(event) => setRegister({ ...register, pseudo: event.target.value })} placeholder={localeText("Nom affiché sur ta member card")} /></label><EnrollmentFields value={register} onChange={setRegister} /><PasswordField label={localeText("Mot de passe")} blockClipboard required autoComplete="new-password" minLength={10} maxLength={128} value={register.password} onChange={(event) => setRegister({ ...register, password: event.target.value })} placeholder={localeText("Choisis un mot de passe sécurisé")} /><PasswordRequirements value={register.password} /><PasswordField label={localeText("Confirmer le mot de passe")} blockClipboard required autoComplete="new-password" minLength={10} maxLength={128} value={register.passwordConfirm} onChange={(event) => setRegister({ ...register, passwordConfirm: event.target.value })} feedback={register.passwordConfirm ? { matches: register.password === register.passwordConfirm } : null} placeholder={localeText("Saisissez à nouveau le mot de passe")} /><button type="submit" disabled={busy === "register" || !registrationPasswordReady || !register.passwordConfirm || register.password !== register.passwordConfirm}>{busy === "register" ? localeText("Création…") : localeText("Créer le compte")}</button></form>}
      {mode === "guest" && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); submit("guest"); }}><label>{localeText("Pseudo temporaire")}<input ref={guestInput} required minLength={3} maxLength={32} autoComplete="off" value={guest} onChange={(event) => setGuest(event.target.value)} placeholder={localeText("Nom affiché aux tables")} /></label><button type="submit" disabled={busy === "guest"}>{busy === "guest" ? localeText("Connexion…") : pendingRoomCode ? localeText("Rejoindre la partie") : localeText("Entrer en invité")}</button></form>}
      {(!settings.registrationsEnabled || !settings.guestAccessEnabled) && <div className="auth-availability-note"><AlertTriangle size={16} /><span>{!settings.registrationsEnabled && !settings.guestAccessEnabled ? localeText("Les inscriptions et l’accès invité sont actuellement fermés.") : !settings.registrationsEnabled ? localeText("Les nouvelles inscriptions sont actuellement fermées.") : localeText("L’accès invité est actuellement fermé.")}</span></div>}
      {error && <div className="error">{localeText(error)}</div>}
    </>}
    {restrictedAccess && <AccessRestrictionDialog value={restrictedAccess} supportEmail={settings.supportEmail} busy={busy === "parental-reactivation"} onRequest={requestParentalReactivation} onClose={() => setRestrictedAccess(null)} />}
  </div></main>;
}

function AccessRestrictionDialog({ value, supportEmail = "contact@netdis.org", busy, onRequest, onClose }) {
  const { t: localeText } = useLocale();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const remaining = value.endsAt ? Math.max(0, Date.parse(value.endsAt) - now) : 0;
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor(remaining % 86400000 / 3600000);
  const minutes = Math.floor(remaining % 3600000 / 60000);
  const seconds = Math.floor(remaining % 60000 / 1000);
  return <Dialog title={value.code === "HARD_BAN" ? localeText("Accès au compte suspendu") : localeText("Accès suspendu par le responsable légal")} className="access-restriction-dialog" onClose={onClose}>
    <div className="access-restriction-icon"><ShieldAlert size={30} /></div>
    <p>{value.reason || localeText("L’accès à ce compte est temporairement indisponible.")}</p>
    {value.endsAt && <div className="access-restriction-countdown"><Clock3 size={20} /><span><small>{localeText("Temps restant")}</small><strong>{days ? localeText("{value0} j ", { value0: days }) : ""}{String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</strong></span></div>}
    {value.code === "HARD_BAN" && <p>{localeText("Un recours peut être adressé par écrit à") + " "}<a href={`mailto:${supportEmail}`}>{supportEmail}</a>{localeText(". Indique l’adresse du compte et les éléments permettant de réexaminer la décision.")}</p>}
    <div className="actions">{value.code === "PARENTAL_ACCESS_REVOKED" && <button type="button" disabled={busy} onClick={onRequest}><MailCheck size={17} />{busy ? localeText("Envoi…") : localeText("Demander une réactivation")}</button>}<button type="button" className="secondary" onClick={onClose}>{localeText("Fermer")}</button></div>
  </Dialog>;
}

function VerificationNotice({ value, pending, onResend, canResend }) {
  const { t: localeText } = useLocale();
  return <div className={`auth-verification ${value.type}`}>{value.type === "success" ? <MailCheck size={18} /> : <AlertTriangle size={18} />}<span>{value.message}</span>{canResend && <button type="button" className="secondary" disabled={pending} onClick={onResend}><RefreshCw size={15} />{" " + localeText("Renvoyer")}</button>}</div>;
}
