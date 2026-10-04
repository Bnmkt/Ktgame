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
  const change = (field, next) => onChange({ ...value, [field]: next });
  const age = ageFromBirthDate(value.birthDate);
  return <div className="form-stack enrollment-fields">
    <div className="enrollment-birth-field"><label>Date de naissance<input required type="date" max={localDate()} value={value.birthDate ?? ""} onChange={(event) => change("birthDate", event.target.value)} /></label><details className="enrollment-birth-help"><summary aria-label="Pourquoi demandons-nous la date de naissance ?"><CircleHelp size={18} /></summary><p>Elle permet de calculer l’âge, d’appliquer le parcours parental lorsqu’il est nécessaire et d’adapter les protections du compte. La date complète reste privée.</p></details></div>
    {age !== null && age < 13 && <section className="enrollment-parental-step"><div><ShieldCheck size={22} /><span><strong>Accord d’un responsable légal requis</strong><small>Le compte ne sera pas créé avant la validation de son email et la revue de l’équipe.</small></span></div><label><span><MailCheck size={16} />Email du parent ou responsable légal</span><input required type="email" autoComplete="email" maxLength={254} value={value.parentEmail ?? ""} onChange={(event) => change("parentEmail", event.target.value)} placeholder="parent@exemple.be" /></label><ol><li>Le parent reçoit un lien personnel.</li><li>Il consulte les protections et donne son accord.</li><li>L’équipe examine la demande avant d’activer le compte.</li></ol><a href={appPath("parents")} target="_blank" rel="noreferrer">Consulter le parcours parental</a></section>}
    <label className="privacy-age"><input type="checkbox" checked={value.termsAccepted === true} onChange={(event) => change("termsAccepted", event.target.checked)} /><span>J'accepte les <a href={appPath("terms")} target="_blank" rel="noreferrer">conditions d'utilisation</a> et j'ai pris connaissance des <a href={appPath("privacy")} target="_blank" rel="noreferrer">informations sur mes données</a>. Ce choix n'autorise pas le suivi facultatif.</span></label>
  </div>;
}
