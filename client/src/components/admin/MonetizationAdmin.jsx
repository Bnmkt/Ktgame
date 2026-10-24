import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  ImagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { api, API_URL } from "../../api.js";
import { GameImageEditor } from "./GameImageEditor.jsx";
import { KoinDocumentEditor } from "./KoinDocumentEditor.jsx";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { DateTimeInput } from "../common/DateTimeInput.jsx";
import {
  KoinIcon,
  downloadKoinDocument,
  notifyKoins,
} from "../../features/koins/Koins.jsx";
import "../../features/koins/koins.css";
import {
  koinStatusLabel as statusLabel,
  koinDocumentLabel,
} from "../../features/koins/labels.js";

const money = (value) =>
  value == null
    ? "Montant fournisseur"
    : new Intl.NumberFormat("fr-BE", {
        style: "currency",
        currency: "EUR",
      }).format(value / 100);
const billingFields = [
  ["legalName", "Nom légal"],
  ["address", "Adresse de facturation"],
  ["country", "Pays"],
  ["registrationNumber", "Numéro d’entreprise"],
  ["vatId", "Numéro TVA / régime applicable"],
  ["administrativeEmail", "Email administratif"],
  ["contactEmail", "Email de contact"],
  ["termsUrl", "URL des conditions d’achat"],
  ["termsVersion", "Version des conditions"],
];

export function MonetizationAdmin() {
  const { t } = useLocale();
  const [data, setData] = useState(null),
    [draft, setDraft] = useState(null),
    [tab, setTab] = useState("settings");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [codes, setCodes] = useState([]);
  const [generation, setGeneration] = useState({
    amount: 25,
    count: 1,
    label: "",
    expiresAt: "",
  });
  const [editingImage, setEditingImage] = useState(null);
  const [historyEnded, setHistoryEnded] = useState({});
  const [filters, setFilters] = useState({
    userId: "",
    provider: "",
    status: "",
  });
  async function load(reset = false, page = offset) {
    const result = await api(
      `/api/admin/monetization?${new URLSearchParams({ ...filters, search, offset: String(page) })}`,
    );
    setData(result);
    setHistoryEnded({});
    if (reset) setDraft(result.config);
  }
  useEffect(() => {
    load(true).catch((failure) => setError(failure.message));
  }, []);
  async function action(fn, refresh = true) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      if (refresh) await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const moreHistory = (kind) =>
    !historyEnded[kind] &&
    data[kind].length > 0 &&
    data[kind].length % 100 === 0 && (
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() =>
          action(async () => {
            const rows = await api(
              `/api/admin/monetization/history?${new URLSearchParams({ kind, offset: String(data[kind].length) })}`,
            );
            setData((current) => ({
              ...current,
              [kind]: [
                ...new Map(
                  [...current[kind], ...rows].map((row) => [row.id, row]),
                ).values(),
              ],
            }));
            if (rows.length < 100)
              setHistoryEnded((current) => ({ ...current, [kind]: true }));
          }, false)
        }
      >
        {t("Afficher la suite")}
      </button>
    );
  const toggle = (key) => (
    <label key={key}>
      <input
        type="checkbox"
        checked={draft[key]}
        onChange={(event) =>
          setDraft({ ...draft, [key]: event.target.checked })
        }
      />
      {t(
        {
          purchasesEnabled: "Achats payants",
          shopEnabled: "Dépenses en boutique",
          codesEnabled: "Codes gratuits",
          testMode: "Mode test",
          legalReviewed:
            "Cadre juridique, fiscal et conditions de vente validés",
        }[key],
      )}
    </label>
  );
  const offerUpdate = (id, key, value) =>
    setDraft((current) => ({
      ...current,
      offers: current.offers.map((offer) =>
        offer.id === id ? { ...offer, [key]: value } : offer,
      ),
    }));
  function move(id, direction) {
    setDraft((current) => {
      const offers = [...current.offers].sort(
          (a, b) => a.position - b.position,
        ),
        index = offers.findIndex((offer) => offer.id === id),
        next = index + direction;
      if (next < 0 || next >= offers.length) return current;
      [offers[index], offers[next]] = [offers[next], offers[index]];
      return {
        ...current,
        offers: offers.map((offer, position) => ({ ...offer, position })),
      };
    });
  }
  if (!data || !draft) return <p role="status">{error || t("Chargement…")}</p>;
  return (
    <section className="card admin-section koin-workspace">
      <header className="koin-wallet-heading">
        <div>
          <KoinIcon size={26} />
          <h2>{t("Monétisation")}</h2>
        </div>
        <div className="koin-admin-controls">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              action(async () => {
                const saved = await api("/api/admin/monetization", {
                  method: "PUT",
                  body: JSON.stringify(draft),
                });
                setDraft(saved);
                notifyKoins();
                setMessage(t("Paramètres enregistrés."));
              })
            }
          >
            <Save size={17} />
            {t("Enregistrer")}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setDraft(structuredClone(data.config))}
          >
            <RotateCcw size={17} />
            {t("Annuler")}
          </button>
          <button
            type="button"
            className="secondary"
            title={t("Actualiser les données")}
            aria-label={t("Actualiser les données")}
            onClick={() => action(() => load())}
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <nav className="segmented-tabs koin-admin-tabs">
        {[
          ["settings", "Activation et facturation"],
          ["offers", "Offres"],
          ["appearance", "Personnalisation"],
          ["documents", "Modèle des factures"],
          ["codes", "Codes"],
          ["orders", "Achats et documents"],
          ["delivery", "Livraisons et emails"],
        ].map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {t(label)}
          </button>
        ))}
      </nav>
      {tab === "settings" && (
        <>
          <h3>{t("Disponibilité")}</h3>
          <div className="koin-admin-controls">
            {[
              "purchasesEnabled",
              "shopEnabled",
              "codesEnabled",
              "testMode",
            ].map(toggle)}
          </div>
          <p className="koin-test-mode">
            {t(
              "Les achats payants sont interdits aux moins de 18 ans. Les Koins ne servent jamais aux mises, à l’XP ou aux récompenses de jeu.",
            )}
          </p>
          <p>
            {t("Stripe")} :{" "}
            {data.providers.stripe ? t("Configuré") : t("Non configuré")} ·
            Discord :{" "}
            {data.providers.discord ? t("Configuré") : t("Non configuré")}
          </p>
          <h3>{t("Émetteur et conditions de vente")}</h3>
          <div className="koin-admin-fields">
            <label>
              {t("Statut")}
              <select
                value={draft.billing.status}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    billing: { ...draft.billing, status: event.target.value },
                  })
                }
              >
                <option value="individual">
                  {t("Particulier · ventes réelles verrouillées")}
                </option>
                <option value="professional">{t("Activité déclarée")}</option>
              </select>
            </label>
            {billingFields.map(([key, label]) => (
              <label key={key}>
                {t(label)}
                <input
                  type={key.endsWith("Email") ? "email" : "text"}
                  value={draft.billing[key]}
                  maxLength={key === "address" ? 600 : 200}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      billing: { ...draft.billing, [key]: event.target.value },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <div className="koin-admin-controls">{toggle("legalReviewed")}</div>
          <p>
            {t(
              "Les seuils DAC7 ne dispensent pas des obligations liées à une activité commerciale. La validation ne remplace pas un avis juridique ou comptable.",
            )}
          </p>
        </>
      )}
      {tab === "offers" && (
        <>
          <div className="koin-admin-controls">
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setDraft({
                  ...draft,
                  offers: [
                    ...draft.offers,
                    {
                      id: `koins-${crypto.randomUUID()}`,
                      name: "Nouvelle offre",
                      quantity: 25,
                      bonus: 0,
                      priceCents: 100,
                      position: draft.offers.length,
                      enabled: false,
                      methods: ["stripe", "discord"],
                      discordSkuId: "",
                    },
                  ],
                })
              }
            >
              <Plus size={17} />
              {t("Ajouter une offre")}
            </button>
          </div>
          {[...draft.offers]
            .sort((a, b) => a.position - b.position)
            .map((offer) => (
              <section key={offer.id} className="koin-admin-offer">
                <h3>{offer.name}</h3>
                <div className="koin-admin-controls">
                  <label>
                    <input
                      type="checkbox"
                      checked={offer.enabled}
                      onChange={(event) =>
                        offerUpdate(offer.id, "enabled", event.target.checked)
                      }
                    />
                    {t("Disponible")}
                  </label>
                  {["stripe", "discord"].map((provider) => (
                    <label key={provider}>
                      <input
                        type="checkbox"
                        checked={offer.methods.includes(provider)}
                        onChange={(event) =>
                          offerUpdate(
                            offer.id,
                            "methods",
                            event.target.checked
                              ? [...offer.methods, provider]
                              : offer.methods.filter(
                                  (value) => value !== provider,
                                ),
                          )
                        }
                      />
                      {provider}
                    </label>
                  ))}
                  <button
                    type="button"
                    className="secondary"
                    title={t("Monter")}
                    onClick={() => move(offer.id, -1)}
                  >
                    <ArrowUp size={17} />
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    title={t("Descendre")}
                    onClick={() => move(offer.id, 1)}
                  >
                    <ArrowDown size={17} />
                  </button>
                  <button
                    type="button"
                    className="danger"
                    title={t("Supprimer l’offre")}
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            "Supprimer cette offre ? Les achats et SKU historiques seront conservés.",
                          ),
                        )
                      )
                        setDraft({
                          ...draft,
                          offers: draft.offers.filter(
                            (row) => row.id !== offer.id,
                          ),
                        });
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                <div className="koin-admin-fields">
                  <label>
                    {t("Nom")}
                    <input
                      value={offer.name}
                      onChange={(event) =>
                        offerUpdate(offer.id, "name", event.target.value)
                      }
                    />
                  </label>
                  {[
                    ["quantity", "Koins", 1],
                    ["bonus", "Bonus", 0],
                    ["priceCents", "Prix TTC en centimes EUR", 50],
                  ].map(([key, label, min]) => (
                    <label key={key}>
                      {t(label)}
                      <input
                        type="number"
                        min={min}
                        max={1000000}
                        step={1}
                        value={offer[key]}
                        onChange={(event) =>
                          offerUpdate(offer.id, key, Number(event.target.value))
                        }
                      />
                    </label>
                  ))}
                  <label>
                    Discord SKU ID
                    <input
                      value={offer.discordSkuId}
                      maxLength={22}
                      inputMode="numeric"
                      onChange={(event) =>
                        offerUpdate(
                          offer.id,
                          "discordSkuId",
                          event.target.value,
                        )
                      }
                    />
                  </label>
                </div>
              </section>
            ))}
          <p>
            {t(
              "Crée les SKU Consumable dans le portail Discord. Un SKU déjà utilisé conserve sa quantité : crée un nouveau SKU pour la modifier. Les tarifs Discord localisés sont configurés chez Discord, pas ici.",
            )}
          </p>
        </>
      )}
      {tab === "codes" && (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              action(async () => {
                const result = await api("/api/admin/monetization/codes", {
                  method: "POST",
                  body: JSON.stringify(generation),
                });
                setCodes(result.codes);
                setMessage(
                  t(
                    "Codes générés. Conserve-les maintenant : ils ne seront plus affichés.",
                  ),
                );
              });
            }}
          >
            <div className="koin-admin-fields">
              <label>
                Koins
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  required
                  value={generation.amount}
                  onChange={(event) =>
                    setGeneration({
                      ...generation,
                      amount: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                {t("Nombre de codes")}
                <input
                  type="number"
                  min={1}
                  max={500}
                  required
                  value={generation.count}
                  onChange={(event) =>
                    setGeneration({
                      ...generation,
                      count: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                {t("Campagne")}
                <input
                  value={generation.label}
                  maxLength={120}
                  onChange={(event) =>
                    setGeneration({ ...generation, label: event.target.value })
                  }
                />
              </label>
              <label>
                {t("Expiration facultative")}
                <DateTimeInput
                  value={generation.expiresAt}
                  onValueChange={(expiresAt) =>
                    setGeneration({ ...generation, expiresAt })
                  }
                />
              </label>
            </div>
            <div className="koin-admin-controls">
              <button disabled={busy} type="submit">
                <Plus size={17} />
                {t("Générer")}
              </button>
            </div>
          </form>
          {codes.length > 0 && (
            <>
              <textarea
                className="koin-generated-codes"
                readOnly
                aria-label={t("Codes générés")}
                value={codes.join("\n")}
              />
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([codes.join("\n")], { type: "text/plain" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "ktga-codes.txt";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 10000);
                }}
              >
                <Download size={17} />
                {t("Télécharger les codes")}
              </button>
            </>
          )}
          <h3>{t("Campagnes")}</h3>
          <div className="koin-records">
            {data.batches.map((batch) => (
              <article key={batch.batch}>
                <span>{batch.label || batch.batch}</span>
                <span>{batch.amount} Koins</span>
                <span>
                  {batch.used}/{batch.count} {t("utilisés")}
                </span>
                <time>
                  {batch.expiresAt
                    ? new Date(batch.expiresAt).toLocaleString()
                    : t("Sans expiration")}
                </time>
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "orders" && (
        <>
          <h3>{t("Statistiques")}</h3>
          <div className="koin-records">
            {data.statistics.map((row, index) => (
              <article key={index}>
                <span>
                  {row.test ? "TEST · " : ""}
                  {row.provider} · {t(statusLabel(row.status))}
                </span>
                <strong>{row.count}</strong>
                <span>
                  {money(row.cents)}
                  {row.refundedCents > 0
                    ? ` · ${money(row.refundedCents)} remboursés`
                    : ""}
                </span>
              </article>
            ))}
          </div>
          <form
            className="koin-admin-controls"
            onSubmit={(event) => {
              event.preventDefault();
              setOffset(0);
              action(() => load(false, 0), false);
            }}
          >
            <input
              type="search"
              placeholder={t("Compte, référence, offre…")}
              aria-label={t("Rechercher les achats")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit" className="secondary">
              {t("Rechercher")}
            </button>
          </form>
          <div className="koin-records">
            {data.orders.map((order) => (
              <article key={order.id}>
                <div>
                  <strong>{order.customer?.name || order.userId}</strong>
                  <small>{order.id}</small>
                </div>
                <span>
                  {order.provider} · {order.test ? "TEST · " : ""}
                  {order.koins} Koins
                </span>
                <span>
                  {t(statusLabel(order.status))} ·{" "}
                  {money(
                    order.amountKnown === false ? null : order.amountCents,
                  )}
                </span>
                <time>{new Date(order.createdAt).toLocaleString()}</time>
                {order.provider === "stripe" &&
                  order.credited &&
                  order.status !== "refunded" && (
                    <button
                      type="button"
                      className="danger"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            t(
                              "Demander le remboursement du paiement Stripe ? Les Koins correspondants seront retirés après confirmation.",
                            ),
                          )
                        )
                          action(async () => {
                            await api(
                              `/api/admin/monetization/orders/${order.id}/refund`,
                              { method: "POST", body: "{}" },
                            );
                            setMessage(
                              t("Remboursement demandé au fournisseur."),
                            );
                          });
                      }}
                    >
                      {t("Rembourser")}
                    </button>
                  )}
              </article>
            ))}
          </div>
          <div className="koin-admin-controls">
            <button
              className="secondary"
              type="button"
              disabled={!offset || busy}
              onClick={() => {
                setOffset(offset - 50);
                action(() => load(false, offset - 50), false);
              }}
            >
              {t("Précédent")}
            </button>
            <button
              className="secondary"
              type="button"
              disabled={
                Math.max(
                  data.orders.length,
                  data.documents.length,
                  data.transactions?.length ?? 0,
                ) < 50 || busy
              }
              onClick={() => {
                setOffset(offset + 50);
                action(() => load(false, offset + 50), false);
              }}
            >
              {t("Suivant")}
            </button>
          </div>
          <h3>{t("Documents")}</h3>
          <div className="koin-admin-fields">
            <label>
              {t("Identifiant du compte")}
              <input
                value={filters.userId}
                onChange={(event) =>
                  setFilters({ ...filters, userId: event.target.value })
                }
              />
            </label>
            <label>
              {t("Fournisseur")}
              <select
                value={filters.provider}
                onChange={(event) =>
                  setFilters({ ...filters, provider: event.target.value })
                }
              >
                <option value="">{t("Tous")}</option>
                {["stripe", "discord", "code"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              {t("Statut")}
              <select
                value={filters.status}
                onChange={(event) =>
                  setFilters({ ...filters, status: event.target.value })
                }
              >
                <option value="">{t("Tous")}</option>
                {[
                  "pending",
                  "delivered",
                  "cancelled",
                  "failed",
                  "partially_refunded",
                  "refunded",
                ].map((value) => (
                  <option key={value} value={value}>
                    {t(statusLabel(value))}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setOffset(0);
                action(() => load(false, 0), false);
              }}
            >
              {t("Appliquer les filtres")}
            </button>
          </div>
          <div className="koin-records">
            {data.documents.map((document) => (
              <article key={document.id}>
                <span>{document.providerNumber || document.number}</span>
                <span>
                  {document.customer?.name} ·{" "}
                  {t(koinDocumentLabel(document.kind))}
                </span>
                <div className="koin-admin-controls">
                  <button
                    className="secondary"
                    type="button"
                    title={t("Télécharger")}
                    onClick={() =>
                      action(() => downloadKoinDocument(document.id, true))
                    }
                  >
                    <Download size={17} />
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    title={t("Renvoyer par email")}
                    onClick={() =>
                      action(() =>
                        api(
                          `/api/admin/monetization/documents/${document.id}/resend`,
                          { method: "POST", body: "{}" },
                        ),
                      )
                    }
                  >
                    <Send size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <h3>{t("Transactions Koins")}</h3>
          <div className="koin-records">
            {(data.transactions ?? []).map((row) => (
              <article key={row.id}>
                <span>{row.user_id}</span>
                <time>{new Date(row.created_at).toLocaleString()}</time>
                <span>{row.reason}</span>
                <strong>
                  {row.delta > 0 ? "+" : ""}
                  {row.delta} Koins
                </strong>
                <span>
                  {t("Solde")} : {row.balance}
                </span>
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "delivery" && (
        <>
          <h3>{t("Traitements et erreurs")}</h3>
          <div className="koin-records">
            {data.jobs.map((job) => (
              <article key={job.id}>
                <div>
                  <strong>{job.kind}</strong>
                  <small>{job.order_id}</small>
                </div>
                <span>
                  {t(statusLabel(job.state))} · {job.attempts} {t("tentatives")}
                </span>
                {job.last_error && <p className="error">{job.last_error}</p>}
                {job.state !== "done" && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      action(() =>
                        api(
                          `/api/admin/monetization/jobs/${encodeURIComponent(job.id)}/retry`,
                          { method: "POST", body: "{}" },
                        ),
                      )
                    }
                  >
                    <RefreshCw size={17} />
                    {t("Réessayer")}
                  </button>
                )}
              </article>
            ))}
          </div>
          {moreHistory("jobs")}
          <h3>{t("Envois email")}</h3>
          <div className="koin-records">
            {data.mailLog.map((row) => (
              <article key={row.id}>
                <time>{new Date(row.created_at).toLocaleString()}</time>
                <span>{row.status}</span>
                <span>{row.message || row.job_id}</span>
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "delivery" && moreHistory("mailLog")}
      {tab === "documents" && <KoinDocumentEditor value={draft.documents} issuer={draft.billing} onChange={documents=>setDraft({...draft,documents})}/>}
      {tab === "appearance" && (
        <>
          <h3>{t("Icône des Koins")}</h3>
          <div className="koin-admin-controls">
            <KoinIcon size={64} image={draft.iconImage || ""} />
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setEditingImage({
                  name: "Koins",
                  image: draft.iconImage,
                  icon: true,
                })
              }
            >
              <ImagePlus size={17} />
              {t("Importer / recadrer")}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!draft.iconImage}
              onClick={() => setDraft({ ...draft, iconImage: "" })}
            >
              <RotateCcw size={17} />
              {t("Rétablir")}
            </button>
          </div>
          <h3>{t("Présentation des offres")}</h3>
          {draft.offers.map((offer) => (
            <section className="koin-admin-offer" key={offer.id}>
              <h3>{offer.name}</h3>
              <div className="koin-admin-fields">
                <label>
                  {t("Description")}
                  <textarea
                    rows={5}
                    maxLength={1500}
                    value={offer.description || ""}
                    onChange={(event) =>
                      offerUpdate(offer.id, "description", event.target.value)
                    }
                  />
                </label>
                <div>
                  {offer.image && (
                    <img
                      className="koin-offer-artwork"
                      src={`${API_URL}${offer.image}`}
                      alt=""
                    />
                  )}
                  <div className="koin-admin-controls">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setEditingImage({
                          name: offer.name,
                          image: offer.image,
                          id: offer.id,
                        })
                      }
                    >
                      <ImagePlus size={17} />
                      {t("Importer / recadrer")}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={!offer.image}
                      onClick={() => offerUpdate(offer.id, "image", "")}
                    >
                      <Trash2 size={17} />
                      {t("Retirer l’image")}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ))}
        </>
      )}
      {editingImage && (
        <GameImageEditor
          gameName={editingImage.name}
          imageLabel={
            editingImage.icon ? t("Icône des Koins") : t("Image de l’offre")
          }
          value={editingImage.image}
          uploadPath="/api/admin/media"
          selectableFormat={!editingImage.icon}
          fixedFormat={
            editingImage.icon ? { width: 256, height: 256 } : undefined
          }
          onClose={() => setEditingImage(null)}
          onApply={(image) => {
            if (editingImage.icon)
              setDraft((current) => ({ ...current, iconImage: image }));
            else offerUpdate(editingImage.id, "image", image);
            setEditingImage(null);
          }}
        />
      )}
    </section>
  );
}
