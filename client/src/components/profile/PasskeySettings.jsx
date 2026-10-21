import { useEffect, useState } from "react";
import { Fingerprint, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../../api.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { passkeyError, registerPasskey, supportsPasskeys } from "../../features/accounts/passkeys.js";
import { Dialog } from "../common/Dialog.jsx";
import { PasswordField } from "../common/PasswordField.jsx";
import "./passkey-settings.css";

export function PasskeySettings({ user, onResult, onError }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null), [available, setAvailable] = useState(false), [action, setAction] = useState(null);
  const [name, setName] = useState(""), [method, setMethod] = useState("password"), [password, setPassword] = useState(""), [code, setCode] = useState(""), [authorizationId, setAuthorizationId] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setAvailable(supportsPasskeys());
    api("/api/me/passkeys").then(result => { if (active) setData(result); }).catch(failure => { if (active) onError(failure.message); });
    return () => { active = false; };
  }, [user.id, onError]);
  function open(kind, key) { setAction({ kind, key }); setName(key?.name || ""); setMethod("password"); setPassword(""); setCode(""); setAuthorizationId(""); setError(""); }
  async function email() {
    setBusy(true); setError("");
    try {
      const result = await api("/api/me/passkeys/email", { method: "POST", body: JSON.stringify({ purpose: action.kind, id: action.key?.id }) });
      setAuthorizationId(result.authorizationId);
    } catch (failure) { setError(passkeyError(failure)); }
    finally { setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const proof = { name, method, ...(method === "password" ? { password } : { code, authorizationId }) };
      const result = action.kind === "register" ? await registerPasskey(proof) : await api(`/api/me/passkeys/${encodeURIComponent(action.key.id)}`, { method: action.kind === "rename" ? "PATCH" : "DELETE", body: JSON.stringify(action.kind === "rename" ? { name } : proof) });
      setData(current => ({ ...current, passkeys: result.passkeys }));
      onResult(result, action.kind === "register" ? "Passkey ajoutée." : action.kind === "rename" ? "Passkey renommée." : "Passkey supprimée.");
      setAction(null); setPassword(""); setCode(""); setAuthorizationId("");
    } catch (failure) { setError(passkeyError(failure)); }
    finally { setBusy(false); }
  }
  const date = value => value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value)) : t("Jamais utilisée");
  return <section className="passkey-settings" aria-label={t("Passkeys")}>
    <header><Fingerprint size={23}/><div><h3>{t("Passkeys")}</h3><span>{data ? `${data.passkeys.length} / ${data.limit}` : t("Chargement…")}</span></div><button type="button" className="secondary" disabled={!available || !data || data.passkeys.length >= data.limit} onClick={() => open("register")}><Plus size={17}/>{t("Ajouter")}</button></header>
    {!available && <p className="passkey-caption">{t("Les passkeys sont disponibles depuis un navigateur compatible en HTTPS, hors de l’activité Discord.")}</p>}
    {data && !data.passkeys.length && <p className="passkey-caption">{t("Aucune passkey enregistrée.")}</p>}
    {data?.passkeys.map(key => <article className="passkey-entry" key={key.id}><KeyRound size={20}/><div><strong>{key.name}</strong><small>{t("Ajoutée le {value0}", { value0: date(key.createdAt) })}</small><small>{key.lastUsedAt ? t("Dernière utilisation : {value0}", { value0: date(key.lastUsedAt) }) : t("Jamais utilisée")}</small></div><div className="passkey-entry-tools"><button type="button" className="secondary icon-toggle" disabled={!available} title={t("Renommer {value0}", { value0: key.name })} aria-label={t("Renommer {value0}", { value0: key.name })} onClick={() => open("rename", key)}><Pencil size={16}/></button><button type="button" className="secondary icon-toggle danger-subtle" disabled={!available} title={t("Supprimer {value0}", { value0: key.name })} aria-label={t("Supprimer {value0}", { value0: key.name })} onClick={() => open("delete", key)}><Trash2 size={16}/></button></div></article>)}
    {action && <Dialog title={t(action.kind === "register" ? "Ajouter une passkey" : action.kind === "rename" ? "Renommer une passkey" : "Supprimer une passkey")} onClose={() => { if (!busy) { setAction(null); setPassword(""); setCode(""); } }} dismissible={!busy} className="passkey-dialog"><form className="form-stack" onSubmit={submit}>
      {action.kind !== "delete" ? <label>{t("Nom de la passkey")}<input required maxLength={64} autoComplete="off" value={name} onChange={event => setName(event.target.value)}/></label> : <p>{action.key.name}</p>}
      {action.kind !== "rename" && <><div className="segmented-tabs" role="group" aria-label={t("Confirmer ton identité")}>{["password", ...(data?.totpEnabled ? ["totp"] : []), ...(data?.emailAvailable ? ["email"] : [])].map(value => <button key={value} type="button" disabled={busy} className={method === value ? "active" : "secondary"} aria-pressed={method === value} onClick={() => { setMethod(value); setPassword(""); setCode(""); setAuthorizationId(""); }}>{t(value === "password" ? "Mot de passe" : value === "totp" ? "Application" : "Email")}</button>)}</div>
      {method === "password" ? <PasswordField label={t("Mot de passe actuel")} autoComplete="current-password" required maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)}/> : <>{method === "email" && <button type="button" className="secondary" disabled={busy} onClick={email}>{t(authorizationId ? "Renvoyer le code" : "Envoyer le code")}</button>}<label>{t("Code à 6 chiffres")}<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} disabled={busy} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}/></label></>}
      </>}
      {error && <p role="alert" className="error">{t(error)}</p>}
      <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={() => { setAction(null); setPassword(""); setCode(""); }}>{t("Annuler")}</button><button type="submit" className={action.kind === "delete" ? "danger" : ""} disabled={busy || method === "email" && action.kind !== "rename" && !authorizationId}><Fingerprint size={18}/>{t(busy ? "Vérification…" : action.kind === "delete" ? "Supprimer" : action.kind === "rename" ? "Enregistrer" : "Créer la passkey")}</button></div>
    </form></Dialog>}
  </section>;
}
