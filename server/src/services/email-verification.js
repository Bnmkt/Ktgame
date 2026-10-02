import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;
const VERIFICATION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_LIFETIME_MS = 30 * 60 * 1000;
const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;
const RESERVED_PUBLIC_EMAIL_DOMAINS = new Set(["netdis.org", "ktga.me"]);
let transport;

const digest = (value) => createHash("sha256").update(String(value)).digest("hex");
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLocaleLowerCase("en-US");
}

export function validEmail(value) {
  const email = normalizeEmail(value);
  return email.length >= 6 && email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function reservedPublicEmail(value) {
  const email = normalizeEmail(value);
  const separator = email.lastIndexOf("@");
  return separator >= 0 && RESERVED_PUBLIC_EMAIL_DOMAINS.has(email.slice(separator + 1));
}

export function emailDeliveryConfigured(environment = process.env) {
  const credentialsAreComplete = Boolean(environment.SMTP_USER) === Boolean(environment.SMTP_PASS);
  return Boolean(environment.SMTP_HOST && environment.EMAIL_FROM && credentialsAreComplete);
}

export function issueEmailVerification(user, now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  user.emailVerification = {
    tokenHash: digest(token),
    sentAt: new Date(now).toISOString(),
    expiresAt: new Date(now + VERIFICATION_LIFETIME_MS).toISOString()
  };
  return token;
}

export function emailVerificationCanBeResent(user, now = Date.now()) {
  const sentAt = Date.parse(user?.emailVerification?.sentAt ?? "");
  return !Number.isFinite(sentAt) || now - sentAt >= RESEND_COOLDOWN_MS;
}

export function consumeEmailVerification(users, token, now = Date.now()) {
  const tokenHash = digest(String(token ?? ""));
  const user = users.find((entry) => entry.emailVerification?.tokenHash === tokenHash);
  if (!user || Date.parse(user.emailVerification.expiresAt) <= now) return null;
  user.emailVerifiedAt = new Date(now).toISOString();
  delete user.emailVerification;
  return user;
}

export function issuePasswordReset(user, now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  user.passwordReset = {
    tokenHash: digest(token),
    sentAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PASSWORD_RESET_LIFETIME_MS).toISOString()
  };
  return token;
}

export function passwordResetCanBeResent(user, now = Date.now()) {
  const sentAt = Date.parse(user?.passwordReset?.sentAt ?? "");
  return !Number.isFinite(sentAt) || now - sentAt >= PASSWORD_RESET_COOLDOWN_MS;
}

export function consumePasswordReset(users, token, now = Date.now()) {
  const tokenHash = digest(String(token ?? ""));
  const user = users.find((entry) => entry.passwordReset?.tokenHash === tokenHash);
  if (!user || Date.parse(user.passwordReset.expiresAt) <= now) return null;
  delete user.passwordReset;
  return user;
}

function publicAppUrl(environment = process.env) {
  const configured = String(environment.PUBLIC_APP_URL ?? "").trim();
  if (configured) return configured;
  const origin = String(environment.CLIENT_ORIGIN ?? "http://localhost:5173").split(",")[0].trim();
  const basePath = `/${String(environment.APP_BASE_PATH ?? "").replace(/^\/+|\/+$/g, "")}`;
  return `${origin}${basePath === "/" ? "" : basePath}`;
}

export function emailVerificationUrl(token, environment = process.env) {
  const url = new URL(publicAppUrl(environment));
  url.searchParams.set("verify-email", token);
  return url.toString();
}

export function passwordResetUrl(token, environment = process.env) {
  const url = new URL(publicAppUrl(environment));
  url.searchParams.set("reset-password", token);
  return url.toString();
}

export function buildEmailVerificationMessage({ user, token, siteName }, environment = process.env) {
  const displayName = user.profile?.displayName || user.pseudo || "joueur";
  const casinoName = siteName || "KTGA.ME";
  const name = escapeHtml(displayName);
  const casino = escapeHtml(casinoName);
  const url = emailVerificationUrl(token, environment);
  const safeUrl = escapeHtml(url);
  const subject = `Valide ton adresse email sur ${casinoName}`;
  const text = `Bonjour ${displayName},\n\nConfirme ton adresse email pour finaliser ton accès à ${casinoName} :\n${url}\n\nCe lien est personnel et expire dans 24 heures. Si tu n'es pas à l'origine de cette demande, tu peux ignorer cet email.`;
  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#080d0c;color:#f7ecd2;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Une dernière étape pour accéder à ${casino}. Ce lien expire dans 24 heures.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#080d0c" style="width:100%;background:#080d0c;">
    <tr>
      <td align="center" style="padding:36px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;">
          <tr>
            <td style="padding:0 4px 18px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td valign="middle">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td width="42" height="42" align="center" valign="middle" bgcolor="#d7a92f" style="width:42px;height:42px;border:1px solid #f4d675;border-radius:8px;color:#11100b;font-size:19px;font-weight:900;">K</td>
                        <td style="padding-left:12px;color:#f8edcf;font-size:21px;font-weight:900;line-height:1.1;">${casino}<br><span style="color:#9d9278;font-size:10px;font-weight:700;letter-spacing:1.2px;">CASINO SOCIAL</span></td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" valign="middle" style="color:#d8b75d;font-size:11px;font-weight:700;text-transform:uppercase;">Sécurité du compte</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="#121918" style="background:#121918;border:1px solid #3d3928;border-radius:8px;overflow:hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr><td height="5" bgcolor="#d7a92f" style="height:5px;background:#d7a92f;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td style="padding:42px 44px 18px;">
                    <div style="color:#d8b75d;font-size:11px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;">Validation de l’adresse email</div>
                    <h1 style="margin:10px 0 18px;color:#fff6df;font-size:30px;line-height:1.18;font-weight:900;letter-spacing:0;">Bienvenue à la table, ${name}.</h1>
                    <p style="margin:0;color:#cfc5ad;font-size:16px;line-height:1.65;">Confirme ton adresse email pour finaliser ton accès à <strong style="color:#fff1c7;">${casino}</strong> et sécuriser ton compte.</p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:18px 44px 22px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center" bgcolor="#d7a92f" style="background:#d7a92f;border:1px solid #f1cf69;border-radius:6px;">
                          <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:15px 28px;color:#17130a;font-size:16px;font-weight:900;line-height:1;text-decoration:none;">Valider mon adresse email</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 44px 38px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0c1211" style="background:#0c1211;border:1px solid #2a302b;border-radius:6px;">
                      <tr>
                        <td width="42" valign="top" style="padding:16px 0 16px 16px;color:#d8b75d;font-size:20px;">&#9201;</td>
                        <td style="padding:15px 16px 15px 4px;color:#a9a18f;font-size:13px;line-height:1.55;"><strong style="color:#e8dcc0;">Lien valable pendant 24 heures</strong><br>Ce lien est personnel et ne peut valider que cette adresse.</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px 44px;border-top:1px solid #2c3028;color:#938b79;font-size:12px;line-height:1.6;">
                    <strong style="color:#cfc4a9;">Le bouton ne fonctionne pas ?</strong><br>
                    Copie ce lien dans ton navigateur :<br>
                    <a href="${safeUrl}" style="color:#ddb94f;text-decoration:underline;word-break:break-all;">${safeUrl}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 24px 0;color:#766f60;font-size:11px;line-height:1.6;">Tu n’es pas à l’origine de cette demande ? Ignore simplement cet email.<br>Les jetons de ${casino} sont virtuels et sans valeur réelle.</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, text, html, url };
}

function mailTransport(environment = process.env) {
  if (!emailDeliveryConfigured(environment)) throw new Error("Le serveur d'envoi d'emails n'est pas configuré.");
  if (!transport) transport = nodemailer.createTransport({
    host: environment.SMTP_HOST,
    port: Number(environment.SMTP_PORT || 587),
    secure: String(environment.SMTP_SECURE ?? "").toLowerCase() === "true",
    ...(environment.SMTP_USER ? { auth: { user: environment.SMTP_USER, pass: environment.SMTP_PASS } } : {})
  });
  return transport;
}

export async function sendTransactionalEmail({ to, subject, text, html }, environment = process.env) {
  await mailTransport(environment).sendMail({ from: environment.EMAIL_FROM, to, subject, text, html });
}

export async function verifyEmailDelivery(environment = process.env) {
  if (!emailDeliveryConfigured(environment)) return { configured: false, ok: false };
  try {
    await mailTransport(environment).verify();
    return { configured: true, ok: true };
  } catch (error) {
    return { configured: true, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function sendEmailVerification({ user, token, siteName }, environment = process.env) {
  const message = buildEmailVerificationMessage({ user, token, siteName }, environment);
  await mailTransport(environment).sendMail({
    from: environment.EMAIL_FROM,
    to: user.email,
    subject: message.subject,
    text: message.text,
    html: message.html
  });
}

export async function sendPasswordReset({ user, token, siteName }, environment = process.env) {
  const displayName = user.profile?.displayName || user.pseudo || "joueur";
  const name = escapeHtml(displayName);
  const casinoName = siteName || "KTGA.ME";
  const casino = escapeHtml(casinoName);
  const url = passwordResetUrl(token, environment);
  await mailTransport(environment).sendMail({
    from: environment.EMAIL_FROM,
    to: user.email,
    subject: `Réinitialise ton mot de passe sur ${casinoName}`,
    text: `Bonjour ${displayName},\n\nUtilise ce lien pour choisir un nouveau mot de passe sur ${casinoName} :\n${url}\n\nCe lien expire dans 30 minutes et ne peut être utilisé qu'une fois. Si tu n'es pas à l'origine de cette demande, ignore cet email.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#18201f"><h1 style="font-size:22px">Réinitialise ton mot de passe</h1><p>Bonjour ${name},</p><p>Utilise ce lien pour choisir un nouveau mot de passe sur <strong>${casino}</strong>.</p><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;background:#9f711d;color:#fff;text-decoration:none;border-radius:6px">Choisir un nouveau mot de passe</a></p><p style="color:#5c6662">Ce lien expire dans 30 minutes et ne peut être utilisé qu’une fois. Si tu n’es pas à l’origine de cette demande, ignore cet email.</p></div>`
  });
}

export async function sendMfaCode({ user, code, siteName }, environment = process.env) {
  const displayName = user.profile?.displayName || user.pseudo || "joueur";
  const casinoName = siteName || "KTGA.ME";
  const name = escapeHtml(displayName);
  const casino = escapeHtml(casinoName);
  const safeCode = escapeHtml(String(code));
  await mailTransport(environment).sendMail({
    from: environment.EMAIL_FROM,
    to: user.email,
    subject: `Code de connexion ${casinoName} : ${code}`,
    text: `Bonjour ${displayName},\n\nTon code de connexion ${casinoName} est ${code}.\n\nIl expire dans 10 minutes. Ne le communique à personne. Si tu n'es pas à l'origine de cette connexion, change immédiatement ton mot de passe.`,
    html: `<div style="margin:0;padding:32px 16px;background:#080d0c;color:#f7ecd2;font-family:Arial,sans-serif"><div style="max-width:560px;margin:auto;background:#121918;border:1px solid #3d3928;border-radius:8px;overflow:hidden"><div style="height:5px;background:#d7a92f"></div><div style="padding:36px"><div style="color:#d8b75d;font-size:11px;font-weight:800;text-transform:uppercase">Double authentification</div><h1 style="margin:10px 0 14px;color:#fff6df;font-size:27px">Confirme ta connexion</h1><p style="color:#cfc5ad;line-height:1.6">Bonjour ${name}, utilise ce code personnel pour terminer ta connexion à <strong>${casino}</strong>.</p><div style="margin:28px 0;padding:18px;text-align:center;background:#0b1110;border:1px solid #66552d;border-radius:6px;color:#f4d675;font:800 34px/1.2 monospace;letter-spacing:8px">${safeCode}</div><p style="color:#938b79;font-size:13px;line-height:1.55">Le code expire dans 10 minutes. Ne le communique à personne. Si tu n’es pas à l’origine de cette connexion, change immédiatement ton mot de passe.</p></div></div></div>`
  });
}

