import { sendTransactionalEmail } from "./email-verification.js";
import { siteContactEmail } from "./site-contact.js";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

function appUrl(parameters, environment = process.env) {
  const configured = String(environment.PUBLIC_APP_URL || "").trim();
  const clientOrigin = String(environment.CLIENT_ORIGIN || "http://localhost:5173").split(",")[0].trim().replace(/\/$/, "");
  const basePath = `/${String(environment.APP_BASE_PATH || "").replace(/^\/+|\/+$/g, "")}`;
  const origin = String(configured || `${clientOrigin}${basePath === "/" ? "" : basePath}`).replace(/\/$/, "");
  const url = new URL(`${origin}/parents`);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString();
}

function parentalTemplate({ eyebrow, title, intro, code, actionLabel, actionUrl, sections = [], footer }) {
  const safeTitle = escapeHtml(title);
  const sectionHtml = sections.map((section) => `<tr><td style="padding:0 38px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0d1514;border:1px solid #2f3b35;border-radius:7px"><tr><td style="padding:17px 18px"><strong style="display:block;color:#f7e9c7;font-size:14px;margin-bottom:5px">${escapeHtml(section.title)}</strong><span style="color:#aaa18e;font-size:13px;line-height:1.55">${escapeHtml(section.text)}</span></td></tr></table></td></tr>`).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title></head><body style="margin:0;background:#080d0c;color:#f7ecd2;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#080d0c"><tr><td align="center" style="padding:34px 14px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px"><tr><td style="padding:0 4px 16px;color:#f4e7c7;font-size:20px;font-weight:900">KTGA.ME <span style="color:#74c9aa;font-size:10px;letter-spacing:1px">ESPACE PARENT</span></td></tr><tr><td style="background:#121918;border:1px solid #3d3928;border-radius:8px;overflow:hidden"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td height="5" bgcolor="#63bd9b"></td></tr><tr><td style="padding:38px 38px 20px"><div style="color:#6fd0ad;font-size:11px;font-weight:900;letter-spacing:1px;text-transform:uppercase">${escapeHtml(eyebrow)}</div><h1 style="margin:9px 0 15px;color:#fff4dc;font-size:28px;line-height:1.2">${safeTitle}</h1><p style="margin:0;color:#c9bfaa;font-size:15px;line-height:1.65">${escapeHtml(intro)}</p>${code ? `<div style="margin-top:20px;padding:14px;background:#09100f;border:1px dashed #5db493;border-radius:7px;text-align:center"><small style="display:block;color:#8f998e;text-transform:uppercase;font-weight:800">Code du dossier</small><strong style="display:block;margin-top:5px;color:#a5e8cf;font-size:21px;letter-spacing:2px">${escapeHtml(code)}</strong></div>` : ""}</td></tr>${sectionHtml}${actionUrl ? `<tr><td align="center" style="padding:12px 38px 32px"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#63bd9b;border:1px solid #9ce2c8;border-radius:6px;color:#07110d;font-size:15px;font-weight:900;padding:14px 22px;text-decoration:none">${escapeHtml(actionLabel)}</a></td></tr>` : ""}<tr><td style="padding:20px 38px;border-top:1px solid #2c3028;color:#8f8776;font-size:11px;line-height:1.55">${escapeHtml(footer || "Les jetons sont virtuels et sans valeur réelle. Cette démarche protège l’accès d’un enfant au service.")}</td></tr></table></td></tr></table></td></tr></table></body></html>`;
}

export async function sendParentVerification(request, environment = process.env) {
  const url = appUrl({ "parental-verify": request.verificationToken }, environment);
  const subject = `Autorisation parentale ${request.code} · KTGA.ME`;
  const text = `Une inscription KTGA.ME pour ${request.childPseudo} indique votre adresse comme responsable légal. Dossier ${request.code}. Vérifiez votre adresse et donnez votre décision : ${url}`;
  const html = parentalTemplate({ eyebrow: "Autorisation requise", title: "Une demande attend votre accord", intro: `${request.childPseudo} souhaite créer un compte. Vérifiez votre adresse puis consultez les protections appliquées avant de donner votre accord.`, code: request.code, actionLabel: "Examiner la demande", actionUrl: url, sections: [{ title: "Après votre accord", text: "La demande sera examinée par l’équipe avant l’activation du compte." }, { title: "Suivi parental", text: "Vous recevrez un récapitulatif quotidien et pourrez suspendre ou révoquer l’accès jusqu’aux 13 ans de l’enfant." }] });
  return sendTransactionalEmail({ to: request.parentEmail, subject, text, html }, environment);
}

export async function sendParentalAdminNotice(request, environment = process.env) {
  const to = siteContactEmail({}, environment);
  const subject = `Nouvelle demande parentale ${request.code}`;
  const text = `Nouvelle demande parentale ${request.code}. Enfant : ${request.childPseudo} (${request.childEmail}). Parent : ${request.parentEmail}. En attente de validation email puis de revue administrative.`;
  const html = parentalTemplate({ eyebrow: "Contrôle parental", title: "Nouvelle inscription de moins de 13 ans", intro: "Un nouveau dossier a été créé. Aucune session ne sera ouverte avant la validation du parent et la revue administrative.", code: request.code, sections: [{ title: "Compte demandé", text: `${request.childPseudo} · ${request.childEmail} · naissance ${request.childBirthDate}` }, { title: "Responsable légal", text: request.parentEmail }] });
  return sendTransactionalEmail({ to, subject, text, html }, environment);
}

export async function sendParentalDecision(request, { approved, portalToken, reason = "" }, environment = process.env) {
  const url = approved ? appUrl({ "parental-access": portalToken }, environment) : "";
  const subject = approved ? `Compte de ${request.childPseudo} approuvé · KTGA.ME` : `Décision concernant ${request.code} · KTGA.ME`;
  const text = approved ? `Le compte de ${request.childPseudo} a été approuvé. Espace parent : ${url}` : `La demande ${request.code} n'a pas été approuvée. Motif : ${reason || "non précisé"}`;
  const html = parentalTemplate({ eyebrow: approved ? "Compte activé" : "Dossier examiné", title: approved ? "L’accès peut commencer" : "La demande n’a pas été approuvée", intro: approved ? `Le compte de ${request.childPseudo} est actif avec les protections configurées pour les moins de 13 ans.` : `Le dossier ${request.code} a été clôturé.`, code: request.code, actionLabel: approved ? "Ouvrir l’espace parent" : "", actionUrl: url, sections: approved ? [{ title: "Votre espace de suivi", text: "Consultez l’activité quotidienne, les temps de session et les jeux utilisés. Vous pouvez suspendre l’accès à tout moment." }] : [{ title: "Motif", text: reason || "Aucun motif complémentaire n’a été communiqué." }] });
  await sendTransactionalEmail({ to: request.parentEmail, subject, text, html }, environment);
  if (approved) await sendTransactionalEmail({ to: request.childEmail, subject: "Ton compte KTGA.ME est prêt", text: "Ton compte a été approuvé. Tu peux maintenant te connecter avec ton adresse email.", html: parentalTemplate({ eyebrow: "Compte prêt", title: "Bienvenue à la table", intro: "Ton compte a été approuvé par ton parent et par l’équipe. Tu peux maintenant te connecter avec ton adresse email.", sections: [{ title: "Protections du compte", text: "Certaines fonctionnalités peuvent rester indisponibles jusqu’à tes 13 ans. Elles sont indiquées directement dans le casino." }] }) }, environment);
}

export async function sendParentDailySummary({ request, portalToken, date, metrics }, environment = process.env) {
  const url = appUrl({ "parental-access": portalToken, date }, environment);
  const subject = `Activité de ${request.childPseudo} · ${date}`;
  const intro = metrics.sessions ? `${request.childPseudo} a utilisé KTGA.ME pendant la journée du ${date}. Le détail agrégé est disponible dans votre espace parent.` : `Aucune session de ${request.childPseudo} n’a été enregistrée pour la journée du ${date}.`;
  const text = `${intro}\nSessions : ${metrics.sessions}. Temps actif : ${Math.round(metrics.seconds / 60)} min. Parties : ${metrics.games}. Jetons dépensés : ${metrics.debits}. ${url}`;
  const html = parentalTemplate({ eyebrow: `Récapitulatif · ${date}`, title: `Activité de ${request.childPseudo}`, intro, actionLabel: "Consulter le détail", actionUrl: url, sections: [{ title: "Temps actif", text: `${Math.round(metrics.seconds / 60)} minute(s) sur le site` }, { title: "Activité de jeu", text: `${metrics.games} partie(s), ${metrics.wins} victoire(s) et ${metrics.actions} action(s) enregistrées` }, { title: "Jetons virtuels", text: `${metrics.credits} reçu(s) · ${metrics.debits} dépensé(s). Ces jetons n’ont aucune valeur monétaire.` }] });
  return sendTransactionalEmail({ to: request.parentEmail, subject, text, html }, environment);
}

export async function sendParentBirthdayReminder({ request, portalToken, days }, environment = process.env) {
  const url = appUrl({ "parental-access": portalToken }, environment);
  const subject = `${request.childPseudo} aura 13 ans dans ${days} jour${days > 1 ? "s" : ""}`;
  return sendTransactionalEmail({ to: request.parentEmail, subject, text: `Les limitations automatiques du compte de ${request.childPseudo} seront levées dans ${days} jour(s). Consultez l’espace parent : ${url}`, html: parentalTemplate({ eyebrow: "Évolution du compte", title: `Passage au compte standard dans ${days} jour${days > 1 ? "s" : ""}`, intro: `À son treizième anniversaire, le compte de ${request.childPseudo} ne sera plus soumis aux restrictions automatiques réservées aux moins de 13 ans.`, actionLabel: "Consulter l’espace parent", actionUrl: url, sections: [{ title: "Ce qui change", text: "Les fonctionnalités limitées par l’âge redeviennent disponibles. Les sanctions ou restrictions générales éventuellement actives restent appliquées." }] }) }, environment);
}

export async function sendParentalActionNotice({ request, portalToken, title, message }, environment = process.env) {
  const url = appUrl({ "parental-access": portalToken }, environment);
  return sendTransactionalEmail({ to: request.parentEmail, subject: `${title} · KTGA.ME`, text: `${message}\n${url}`, html: parentalTemplate({ eyebrow: "Décision parentale", title, intro: message, actionLabel: "Ouvrir l’espace parent", actionUrl: url }) }, environment);
}
