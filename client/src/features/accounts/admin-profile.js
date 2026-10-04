import { localDate, validDateOnly } from "../../utils/dates.js";

export function accountDraftError(draft, original, now = new Date()) {
  if (!draft.displayName?.trim()) return "Le pseudo affiché est requis.";
  if (draft.login !== original.login && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.login ?? "")) return "Saisis une adresse email valide.";
  if (draft.birthDate && (!validDateOnly(draft.birthDate) || draft.birthDate > localDate(now))) return "La date de naissance doit être valide et ne peut pas être dans le futur.";
  if (draft.lastDailyClaim && (!validDateOnly(draft.lastDailyClaim) || draft.lastDailyClaim > localDate(now))) return "La date du dernier bonus ne peut pas être dans le futur.";
  if (!Number.isSafeInteger(Number(draft.tokens)) || Number(draft.tokens) < 0 || Number(draft.tokens) > 100000000) return "Le solde doit être un entier entre 0 et 100 000 000.";
  for (const key of ["softBan", "hardBan"]) {
    const sanction = draft.moderation?.[key];
    if (!sanction?.active) continue;
    if (!sanction.reason?.trim()) return "Indique un motif pour chaque sanction active.";
    if (sanction.endsAt && (!Number.isFinite(Date.parse(sanction.endsAt)) || Date.parse(sanction.endsAt) <= now.getTime())) return "La fin d’une sanction active doit être dans le futur.";
  }
  return "";
}
