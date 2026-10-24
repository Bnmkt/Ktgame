export const defaultDocumentTemplate = {
  brandName: "KTGA.ME",
  logoImage: "",
  accentColor: "#7350a1",
  note: "Merci de faire partie de KTGA. Retrouve ce document dans ton espace personnel.",
  footer:
    "Les Koins sont réservés aux cosmétiques, sans conversion en argent ni utilisation dans les jeux.",
  links: [
    { label: "Mon espace", url: "https://www.ktga.me/profil" },
    { label: "Conditions", url: "https://www.ktga.me/conditions" },
  ],
};

export function validDocumentLink(value) {
  if (
    typeof value !== "string" ||
    value.length > 500 ||
    /[\u0000-\u001f]/.test(value)
  )
    return false;
  if (/^mailto:[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validProviderInvoiceLink(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      ["invoice.stripe.com", "pay.stripe.com", "files.stripe.com"].includes(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
}

export function normalizeDocumentTemplate(value = {}) {
  const template = { ...defaultDocumentTemplate, ...value };
  if (!/^#[a-f0-9]{6}$/i.test(template.accentColor))
    throw Error("Couleur du document invalide.");
  if (
    template.logoImage &&
    !/^\/api\/media\/[a-f0-9]{64}\.(?:png|jpg)$/.test(template.logoImage)
  )
    throw Error(
      "Le logo PDF doit être une image PNG ou JPEG de la médiathèque.",
    );
  if (!Array.isArray(template.links) || template.links.length > 4)
    throw Error("Maximum quatre liens par document.");
  return {
    brandName: String(template.brandName || "KTGA.ME")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80),
    accentColor: template.accentColor,
    logoImage: template.logoImage || "",
    note: String(template.note ?? "")
      .trim()
      .slice(0, 700),
    footer: String(template.footer ?? "")
      .trim()
      .slice(0, 1200),
    links: template.links.map((link) => {
      if (!validDocumentLink(link.url))
        throw Error(
          "Les liens des documents doivent utiliser HTTPS ou mailto.",
        );
      return {
        label: String(link.label || "Consulter")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 45),
        url: link.url,
      };
    }),
  };
}
