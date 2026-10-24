import { casinoDateKey } from "../time.js";

const number = (value, min, max, label) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw Error(`${label} invalide.`);
  return value;
};
const text = (value, max = 200) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const image = (value) => {
  const path = text(value, 200);
  if (path && !/^\/api\/media\/[a-f0-9]{64}\.(?:png|jpg|webp|gif)$/.test(path))
    throw Error("Choisis une image de la médiathèque.");
  return path;
};
export const initialKoinOffers = [
  { id: "koins-25", name: "25 Koins", quantity: 25, bonus: 0, priceCents: 100 },
  {
    id: "koins-150",
    name: "150 Koins",
    quantity: 150,
    bonus: 0,
    priceCents: 500,
  },
  {
    id: "koins-500",
    name: "500 Koins",
    quantity: 500,
    bonus: 0,
    priceCents: 1500,
  },
].map((offer, index) => ({
  ...offer,
  enabled: true,
  position: index,
  methods: ["stripe", "discord"],
  discordSkuId: "",
}));
export const defaultKoinConfig = {
  purchasesEnabled: false,
  shopEnabled: false,
  codesEnabled: false,
  testMode: true,
  legalReviewed: false,
  iconImage: "",
  billing: {
    status: "individual",
    legalName: "",
    address: "",
    country: "BE",
    registrationNumber: "",
    vatId: "",
    administrativeEmail: "",
    contactEmail: "",
    termsUrl: "",
    termsVersion: "1",
  },
  offers: initialKoinOffers,
};
export function validateKoinConfig(input) {
  const billing = input.billing ?? {};
  const result = {
    ...defaultKoinConfig,
    ...Object.fromEntries(
      [
        "purchasesEnabled",
        "shopEnabled",
        "codesEnabled",
        "testMode",
        "legalReviewed",
      ].map((key) => [key, input[key] === true]),
    ),
    billing: Object.fromEntries(
      Object.keys(defaultKoinConfig.billing).map((key) => [
        key,
        text(billing[key], key === "address" ? 600 : 200),
      ]),
    ),
    offers: [],
  };
  result.iconImage = image(input.iconImage);
  if (!["individual", "professional"].includes(result.billing.status))
    throw Error("Statut de facturation invalide.");
  for (const key of ["administrativeEmail", "contactEmail"])
    if (
      result.billing[key] &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.billing[key])
    )
      throw Error("Adresse email de facturation invalide.");
  if (
    (result.purchasesEnabled || result.codesEnabled) &&
    (!result.billing.administrativeEmail || !result.billing.contactEmail)
  )
    throw Error(
      "Configure les emails administratif et de contact avant d’activer les achats ou les codes.",
    );
  if (!Array.isArray(input.offers) || input.offers.length > 50)
    throw Error("Maximum 50 offres.");
  const ids = new Set(),
    skus = new Set();
  for (const row of input.offers) {
    if (!/^[a-z0-9-]{1,70}$/.test(row.id) || ids.has(row.id))
      throw Error("Identifiant d’offre invalide ou en double.");
    ids.add(row.id);
    const discordSkuId = text(row.discordSkuId, 22);
    if (
      discordSkuId &&
      (!/^\d{16,22}$/.test(discordSkuId) || skus.has(discordSkuId))
    )
      throw Error("SKU Discord invalide ou en double.");
    if (discordSkuId) skus.add(discordSkuId);
    result.offers.push({
      id: row.id,
      name: text(row.name, 80) || "Koins",
      description: text(row.description, 1500),
      image: image(row.image),
      quantity: number(row.quantity, 1, 1000000, "Quantité"),
      bonus: number(row.bonus, 0, 1000000, "Bonus"),
      priceCents: number(row.priceCents, 50, 1000000, "Prix en centimes"),
      position: number(row.position, 0, 10000, "Ordre"),
      enabled: row.enabled === true,
      methods: [
        ...new Set(
          (row.methods ?? []).filter((value) =>
            ["stripe", "discord"].includes(value),
          ),
        ),
      ],
      discordSkuId,
    });
  }
  if (
    result.purchasesEnabled &&
    !result.testMode &&
    (!result.legalReviewed ||
      result.billing.status !== "professional" ||
      ![
        "legalName",
        "address",
        "country",
        "registrationNumber",
        "administrativeEmail",
        "contactEmail",
        "termsUrl",
      ].every((key) => result.billing[key]))
  )
    throw Error(
      "Les ventes réelles nécessitent une activité déclarée, des coordonnées complètes et une validation juridique et fiscale.",
    );
  if (
    result.billing.termsUrl &&
    !/^https:\/\/(?:www\.)?ktga\.me\//.test(result.billing.termsUrl)
  )
    throw Error("Utilise une page de conditions KTGA en HTTPS.");
  return result;
}
export function koinAccountAllowed(
  user,
  { purchase = false, now = Date.now() } = {},
) {
  if (!user || user.guest || user.active === false || user.minor?.restricted)
    return false;
  if (!purchase) return true;
  const birth = user.profile?.birthDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth ?? "")) return false;
  const today = new Date(`${casinoDateKey(now)}T12:00:00Z`),
    dob = new Date(`${birth}T12:00:00Z`);
  if (
    !Number.isFinite(dob.getTime()) ||
    dob.toISOString().slice(0, 10) !== birth
  )
    return false;
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  if (
    today.getUTCMonth() < dob.getUTCMonth() ||
    (today.getUTCMonth() === dob.getUTCMonth() &&
      today.getUTCDate() < dob.getUTCDate())
  )
    age--;
  return age >= 18 && age <= 120;
}
