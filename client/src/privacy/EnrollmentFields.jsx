import { appPath } from "../navigation/routes.js";

export function EnrollmentFields({ value, onChange }) {
  const change = (field, next) => onChange({ ...value, [field]: next });
  return <div className="form-stack enrollment-fields">
    <label>Tranche d'âge<select value={value.ageBand ?? ""} onChange={(event) => change("ageBand", event.target.value)}><option value="">Choisir</option><option value="13plus">13 ans ou plus</option><option value="under13">Moins de 13 ans</option></select></label>
    {value.ageBand === "under13" && <><p>Ton représentant légal doit d'abord contacter l'éditeur et faire valider son autorisation. <a href={appPath("parents")}>Parcours parental</a></p><label>Code remis au parent<input autoComplete="off" maxLength={64} value={value.parentalCode ?? ""} onChange={(event) => change("parentalCode", event.target.value)} placeholder="Code d'autorisation à usage unique" /></label></>}
    <label className="privacy-age"><input type="checkbox" checked={value.termsAccepted === true} onChange={(event) => change("termsAccepted", event.target.checked)} /><span>J'accepte les <a href={appPath("terms")} target="_blank" rel="noreferrer">conditions d'utilisation</a> et j'ai pris connaissance des <a href={appPath("privacy")} target="_blank" rel="noreferrer">informations sur mes données</a>. Ce choix n'autorise pas le suivi facultatif.</span></label>
  </div>;
}
