import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { emailDeliveryConfigured, sendTransactionalEmail, validEmail } from "./email-verification.js";
import { siteContactEmail } from "./site-contact.js";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const kinds = {
  "bug-received": { title: "Nouveau signalement de bug", intro: "Un signalement attend une analyse. Son contenu original, les captures et le diagnostic sont accessibles uniquement dans le dossier autorisé." },
  "bug-published": { title: "Un bug a été publié", intro: "Une version relue du signalement est maintenant visible dans le suivi public. Les informations privées restent réservées au dossier autorisé." },
  "data-request": { title: "Nouvelle demande de données personnelles", intro: "Une demande attend une approbation administrative. Aucun export n’est généré ni envoyé avant cette validation." }
};
const dateLabel = (value) => new Intl.DateTimeFormat("fr-BE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(value));

export function contactNoticeEmail(input, environment = process.env, siteName = "KTGA.ME") {
  const kind = kinds[input.kind];
  if (!kind) throw new Error("Type de notification invalide.");
  const to = siteContactEmail({}, environment);
  if (!validEmail(to)) throw new Error("Adresse de contact invalide.");
  const base = String(environment.PUBLIC_APP_URL || `${String(environment.CLIENT_ORIGIN || "http://localhost:5173").split(",")[0].replace(/\/$/, "")}/${String(environment.APP_BASE_PATH || "").replace(/^\/+|\/+$/g, "")}`).replace(/\/$/, "");
  const url = new URL(`${base}/${input.kind === "data-request" ? "admin" : `bugs/${encodeURIComponent(input.reference)}`}`);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Adresse publique invalide.");
  url.search = ""; url.hash = ""; url.username = ""; url.password = "";
  const reference = input.kind === "data-request" ? input.reference : `BUG ${input.reference}`;
  const details = [["Référence", reference], ["Date", dateLabel(input.at)], ...(input.dueAt ? [["Échéance de réponse", dateLabel(input.dueAt)]] : [])];
  const instruction = input.kind === "data-request" ? "Administration → Comptes joueurs → Demandes de données. Retrouve le dossier avec sa référence." : "Le dossier privé est consultable par les administrateurs et éditeurs connectés.";
  const subject = `${kind.title} · ${reference} · ${siteName}`;
  const text = `${kind.intro}\n\n${details.map(([label, value]) => `${label} : ${value}`).join("\n")}\n\n${instruction}\n${url}\n\nAucun diagnostic, capture, secret ni archive personnelle n’est joint à cette alerte.`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#080d0c;color:#f7ecd2;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#121918;border:1px solid #5b533b;border-radius:8px"><tr><td style="padding:24px 28px;border-bottom:1px solid #5b533b;color:#e5bd59;font-size:22px;font-weight:bold">${escape(siteName)}</td></tr><tr><td style="padding:28px"><p style="color:#75d1b5;font-size:12px;font-weight:bold">NOTIFICATION ADMINISTRATIVE</p><h1 style="font-size:25px;line-height:1.3;margin:14px 0">${escape(kind.title)}</h1><p style="color:#cfc5ad;line-height:1.7">${escape(kind.intro)}</p><table width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border-top:1px solid #3b4338">${details.map(([label, value]) => `<tr><th align="left" style="padding:12px 0;color:#b9b3a0;font-size:12px;font-weight:normal;border-bottom:1px solid #3b4338">${escape(label)}</th><td align="right" style="padding:12px 0;color:#f7ecd2;font-size:13px;border-bottom:1px solid #3b4338">${escape(value)}</td></tr>`).join("")}</table><p style="color:#b9b3a0;font-size:13px;line-height:1.6">${escape(instruction)}</p><p style="margin:24px 0"><a href="${escape(url)}" style="display:inline-block;padding:14px 22px;background:#d7a92f;color:#17130a;border-radius:6px;font-weight:bold;text-decoration:none">${input.kind === "data-request" ? "Ouvrir l’administration" : "Consulter le dossier"}</a></p><p style="color:#938b79;font-size:12px;line-height:1.6">Aucun diagnostic, capture, secret ni archive personnelle n’est joint à cette alerte.</p></td></tr></table></td></tr></table></body></html>`;
  return { to, subject, text, html };
}

export function createContactNoticeQueue({ filename, siteName = () => "KTGA.ME", environment = process.env, contactEmail = () => siteContactEmail({}, environment), sendEmail = sendTransactionalEmail, configured = () => emailDeliveryConfigured(environment), now = () => Date.now(), intervalMs = 60000 }) {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
    CREATE TABLE IF NOT EXISTS contact_notices(event_key TEXT PRIMARY KEY,kind TEXT NOT NULL,reference TEXT NOT NULL,event_at TEXT NOT NULL,due_at TEXT,sent_at INTEGER,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS contact_notices_pending ON contact_notices(sent_at,next_attempt_at);`);
  let running = null, closed = false, requested = false;
  async function deliver() {
    if (closed || !configured()) return;
    db.prepare("DELETE FROM contact_notices WHERE sent_at IS NOT NULL AND sent_at<?").run(now() - 90 * 86400000);
    const rows = db.prepare("SELECT * FROM contact_notices WHERE sent_at IS NULL AND next_attempt_at<=? ORDER BY next_attempt_at,event_at LIMIT 10").all(now());
    for (const row of rows) {
      if (closed) break;
      try {
        const mail = contactNoticeEmail({ kind: row.kind, reference: row.reference, at: row.event_at, dueAt: row.due_at }, { ...environment, CONTACT_EMAIL: contactEmail() }, siteName());
        await sendEmail({ ...mail, messageId: `<contact-${createHash("sha256").update(row.event_key).digest("hex")}@ktga.me>` }, environment);
        if (!closed) db.prepare("UPDATE contact_notices SET sent_at=? WHERE event_key=?").run(now(), row.event_key);
      } catch {
        if (!closed) db.prepare("UPDATE contact_notices SET attempts=attempts+1,next_attempt_at=? WHERE event_key=?").run(now() + Math.min(3600000, 60000 * 2 ** Math.min(row.attempts, 6)), row.event_key);
        console.warn("Contact notification pending: email delivery unavailable; retry scheduled.");
      }
    }
  }
  function flush() {
    if (closed) return Promise.resolve();
    requested = true;
    if (!running) running = Promise.resolve().then(async () => {
      do { requested = false; await deliver(); } while (requested && !closed);
    }).catch(() => { console.warn("Contact notification queue temporarily unavailable."); }).finally(() => { running = null; });
    return running;
  }
  const timer = intervalMs > 0 ? setInterval(flush, intervalMs) : null;
  timer?.unref();
  return {
    enqueue(key, input) {
      if (!kinds[input.kind] || !String(input.reference ?? "").trim() || String(input.reference).length > 80 || !Number.isFinite(Date.parse(input.at)) || input.dueAt && !Number.isFinite(Date.parse(input.dueAt))) throw new Error("Notification de contact invalide.");
      const result = db.prepare("INSERT OR IGNORE INTO contact_notices(event_key,kind,reference,event_at,due_at) VALUES(?,?,?,?,?)").run(String(key).slice(0, 180), input.kind, String(input.reference), input.at, input.dueAt || null);
      void flush();
      return Boolean(result.changes);
    },
    flush,
    pendingCount: () => db.prepare("SELECT COUNT(*) AS count FROM contact_notices WHERE sent_at IS NULL").get().count,
    close() { closed = true; if (timer) clearInterval(timer); db.close(); }
  };
}
