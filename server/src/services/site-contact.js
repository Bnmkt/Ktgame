import { normalizeEmail, validEmail } from "./email-verification.js";

export const DEFAULT_CONTACT_EMAIL = "contact@netdis.org";

export function normalizeContactEmail(value) {
  const email = normalizeEmail(value);
  if (!validEmail(email) || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/i.test(email)) throw new Error("Adresse de contact invalide.");
  return email;
}

export function siteContactEmail(settings = {}, environment = process.env) {
  return normalizeContactEmail(settings.contactEmail || environment.CONTACT_EMAIL || DEFAULT_CONTACT_EMAIL);
}
