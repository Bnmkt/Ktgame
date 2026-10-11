import { useLocale } from "../locales/LocaleProvider.jsx";
import { appPath } from "../navigation/routes.js";
import { localDate, validDateOnly } from "../utils/dates.js";
import { CircleHelp, MailCheck, ShieldCheck } from "lucide-react";

function ageFromBirthDate(value) {
  if (!validDateOnly(value)) return null;
  const born = new Date(`${value}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) age -= 1;
  return Number.isFinite(age) && age >= 0 ? age : null;
}

export function EnrollmentFields({ value, onChange }) {
  const { t: localeText } = useLocale();
  const change = (field, next) => onChange({ ...value, [field]: next });
  const age = ageFromBirthDate(value.birthDate);
  return <div className="form-stack enrollment-fields">
    <div className="enrollment-birth-field"><label>{localeText("Date de naissance")}<input required type="date" max={localDate()} value={value.birthDate ?? ""} onChange={(event) => change("birthDate", event.target.value)} /></label><details className="enrollment-birth-help"><summary aria-label={localeText("Pourquoi demandons-nous la date de naissance ?")}><CircleHelp size={18} /></summary><p>{localeText("Elle permet de calculer l’âge, d’appliquer le parcours parental lorsqu’il est nécessaire et d’adapter les protections du compte. La date complète reste privée.")}</p></details></div>
    {age !== null && age < 13 && <section className="enrollment-parental-step"><div><ShieldCheck size={22} /><span><strong>{localeText("Accord d’un responsable légal requis")}</strong><small>{localeText("Le compte ne sera pas créé avant la validation de son email et la revue de l’équipe.")}</small></span></div><label><span><MailCheck size={16} />{localeText("Email du parent ou responsable légal")}</span><input required type="email" autoComplete="email" maxLength={254} value={value.parentEmail ?? ""} onChange={(event) => change("parentEmail", event.target.value)} placeholder={localeText("parent@exemple.be")} /></label><ol><li>{localeText("Le parent reçoit un lien personnel.")}</li><li>{localeText("Il consulte les protections et donne son accord.")}</li><li>{localeText("L’équipe examine la demande avant d’activer le compte.")}</li></ol><a href={appPath("parents")} target="_blank" rel="noreferrer">{localeText("Consulter le parcours parental")}</a></section>}
    <label className="privacy-age"><input type="checkbox" checked={value.termsAccepted === true} onChange={(event) => change("termsAccepted", event.target.checked)} /><span>{localeText("J'accepte les") + " "}<a href={appPath("terms")} target="_blank" rel="noreferrer">{localeText("conditions d'utilisation")}</a>{" " + localeText("et j'ai pris connaissance des") + " "}<a href={appPath("privacy")} target="_blank" rel="noreferrer">{localeText("informations sur mes données")}</a>{localeText(". Ce choix n'autorise pas le suivi facultatif.")}</span></label>
  </div>;
}
