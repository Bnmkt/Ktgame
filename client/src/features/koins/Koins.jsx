import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Coins, Download, Gift, RefreshCw, ShoppingBag } from "lucide-react";
import { api, API_URL, getToken } from "../../api.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { Dialog } from "../../components/common/Dialog.jsx";
import { isDiscordActivityLocation } from "../discord/context.js";
import { connectActivity } from "../discord/runtime.js";
import "./koins.css";
import { CompactNumber } from "../../utils/presentation.jsx";
import { koinsVisible } from "../../navigation/header-layout.js";
import { validProviderInvoiceLink } from "./document-template.js";
import {
  koinStatusLabel,
  koinDocumentLabel,
  koinTransactionLabel,
} from "./labels.js";

export const notifyKoins = () =>
  window.dispatchEvent(new Event("ktga-koins-updated"));
let iconImage = "";
const emptyWallet = {
  balance: 0,
  blocked: false,
  transactions: [],
  orders: [],
  documents: [],
  purchaseAllowed: false,
};
const iconListeners = new Set();
const subscribeIcon = (listener) => {
  iconListeners.add(listener);
  return () => iconListeners.delete(listener);
};
function updateIcon(value) {
  if (iconImage === (value || "")) return;
  iconImage = value || "";
  iconListeners.forEach((listener) => listener());
}
export function KoinIcon({ size = 18, image }) {
  const configured = useSyncExternalStore(
    subscribeIcon,
    () => iconImage,
    () => "",
  );
  const source = image ?? configured;
  return source ? (
    <img
      className="koin-symbol koin-custom-symbol"
      src={`${API_URL}${source}`}
      width={size}
      height={size}
      alt=""
    />
  ) : (
    <Coins size={size} className="koin-symbol" aria-hidden="true" />
  );
}
export function useKoins(user) {
  const identity = useRef(user?.id);
  identity.current = user?.id;
  const [state, setState] = useState({
      balance: 0,
      config: {
        shopEnabled: false,
        purchasesEnabled: false,
        codesEnabled: false,
        offers: [],
      },
    }),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!user || user.guest || user.minor?.restricted) return;
    try {
      const [config, wallet] = await Promise.all([
        api("/api/koins/config", { background: true }),
        api("/api/me/koins", { background: true }),
      ]);
      if (identity.current !== user.id) return;
      updateIcon(config.iconImage);
      setState({ ...wallet, config, ownerId: user.id });
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }, [user?.id, user?.guest, user?.minor?.restricted]);
  useEffect(() => {
    refresh();
    window.addEventListener("ktga-koins-updated", refresh);
    return () => window.removeEventListener("ktga-koins-updated", refresh);
  }, [refresh]);
  return {
    ...state,
    ...(state.ownerId !== user?.id ? emptyWallet : {}),
    error,
    refresh,
  };
}
export async function downloadKoinDocument(id, admin = false) {
  const response = await fetch(
    `${API_URL}/api/${admin ? "admin/monetization" : "me/koins"}/documents/${encodeURIComponent(id)}`,
    {
      credentials: "include",
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    },
  );
  if (!response.ok) throw Error("Document indisponible.");
  const url = URL.createObjectURL(await response.blob()),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `KTGA-${id}.pdf`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function CurrencyBalances({ user, allowKoins = true }) {
  const state = useKoins(user),
    [open, setOpen] = useState(false);
  const { t } = useLocale();
  const enabled =
    allowKoins &&
    !user.guest &&
    !user.minor?.restricted &&
    koinsVisible(state.config);
  return (
    <>
      <div className="casino-balance-group" aria-label={t("Portefeuilles")}>
        <span className="casino-currency-row">
          <Coins size={16} />
          <CompactNumber value={user.tokens} label={t("Solde exact")} />
          <small>{t("Jetons")}</small>
        </span>
        {enabled && (
          <button
            type="button"
            className="casino-currency-row casino-currency-koins"
            onClick={() => setOpen(true)}
            title={t("Mon portefeuille Koins")}
          >
            <KoinIcon />
            <CompactNumber value={state.balance} label={t("Solde exact")} />
            <small>Koins</small>
          </button>
        )}
      </div>
      {open && enabled && (
        <Dialog
          title={t("Mes Koins")}
          className="koin-wallet-dialog"
          onClose={() => setOpen(false)}
        >
          <KoinWallet user={user} />
        </Dialog>
      )}
    </>
  );
}
export function KoinWallet({ user }) {
  const { t } = useLocale(),
    state = useKoins(user);
  const [tab, setTab] = useState("offers"),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [accepted, setAccepted] = useState(false);
  const discord = isDiscordActivityLocation();
  const returnQuery = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  const returnedOrder = state.orders?.find(
    (order) => order.id === returnQuery.get("koinsOrder"),
  );
  const waitingForPayment =
    returnQuery.get("koins") === "confirmation" &&
    returnedOrder?.status === "pending";
  useEffect(() => {
    if (!waitingForPayment) return;
    let tries = 0;
    const timer = setInterval(() => {
      notifyKoins();
      if (++tries >= 24) clearInterval(timer);
    }, 5000);
    return () => clearInterval(timer);
  }, [waitingForPayment]);
  const cursor = useRef(null),
    syncing = useRef(false);
  const [older, setOlder] = useState({
      transactions: [],
      orders: [],
      documents: [],
    }),
    [exhausted, setExhausted] = useState({});
  useEffect(() => {
    setOlder({ transactions: [], orders: [], documents: [] });
    setExhausted({});
  }, [state.transactions, state.orders, state.documents]);
  async function loadMore(kind) {
    setBusy(true);
    setError("");
    try {
      const rows = await api(
        `/api/me/koins/history?${new URLSearchParams({ kind, offset: String((state[kind]?.length ?? 0) + older[kind].length) })}`,
      );
      setOlder((current) => ({
        ...current,
        [kind]: [
          ...new Map(
            [...current[kind], ...rows].map((row) => [row.id, row]),
          ).values(),
        ],
      }));
      if (rows.length < 50)
        setExhausted((current) => ({ ...current, [kind]: true }));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const moreButton = (kind) =>
    (state[kind]?.length ?? 0) >= 50 &&
    !exhausted[kind] && (
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => loadMore(kind)}
      >
        {t("Afficher la suite")}
      </button>
    );
  const syncDiscord = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      for (let page = 0; page < 5; page++) {
        const result = await api("/api/me/koins/discord/sync", {
          method: "POST",
          body: JSON.stringify({ after: cursor.current }),
          background: true,
          deduplicate: false,
        });
        cursor.current = result.nextCursor;
        if (!cursor.current) break;
      }
      notifyKoins();
    } finally {
      syncing.current = false;
    }
  }, []);
  useEffect(() => {
    if (!discord) return;
    let sdk,
      closed = false;
    const callback = () => {
      void syncDiscord().catch((failure) => setError(failure.message));
    };
    connectActivity()
      .then(async (client) => {
        if (closed) return;
        sdk = client;
        await sdk.subscribe("ENTITLEMENT_CREATE", callback);
      })
      .catch(() => {});
    return () => {
      closed = true;
      sdk?.unsubscribe("ENTITLEMENT_CREATE", callback).catch(() => {});
    };
  }, [discord, syncDiscord]);
  async function action(fn) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      notifyKoins();
      await state.refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function buy(offer, provider) {
    await action(async () => {
      const result = await api("/api/me/koins/checkout", {
        method: "POST",
        body: JSON.stringify({
          offerId: offer.id,
          provider,
          acceptedTerms: accepted,
        }),
        deduplicate: false,
      });
      if (provider === "stripe") {
        const url = new URL(result.url);
        if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
          throw Error("Adresse de paiement invalide.");
        window.location.assign(url.href);
        return;
      }
      const sdk = await connectActivity();
      const { code: authorization } = await sdk.commands.authorize({
        client_id: sdk.clientId,
        response_type: "code",
        state: crypto.randomUUID(),
        prompt: "none",
        scope: ["identify", "applications.entitlements"],
      });
      const credentials = await api("/api/me/koins/discord/authorize", {
        method: "POST",
        body: JSON.stringify({ code: authorization }),
      });
      await sdk.commands.authenticate({
        access_token: credentials.accessToken,
      });
      await sdk.commands.startPurchase({ sku_id: result.skuId });
      await syncDiscord();
      setMessage(
        t("Le paiement sera crédité après vérification du fournisseur."),
      );
    });
  }
  return (
    <section className="koin-workspace">
      <header className="koin-wallet-heading">
        <div>
          <KoinIcon size={30} />
          <h2>{t("Mes Koins")}</h2>
          <strong>{state.balance.toLocaleString()} Koins</strong>
        </div>
        <button
          type="button"
          className="secondary icon-toggle"
          title={t("Actualiser")}
          aria-label={t("Actualiser")}
          onClick={notifyKoins}
        >
          <RefreshCw size={18} />
        </button>
      </header>
      <p>
        {t(
          "Uniquement pour les cosmétiques. Aucun échange avec les Jetons, aucune mise ni conversion en argent.",
        )}
      </p>
      {state.blocked && (
        <p className="error" role="alert">
          {t(
            "Portefeuille suspendu pendant l’examen d’un paiement. Contacte le support si nécessaire.",
          )}
        </p>
      )}
      {state.balance < 0 && (
        <p className="error">
          {t(
            "Des Koins ont été retirés après un remboursement. Les achats cosmétiques restent indisponibles tant que le solde est insuffisant.",
          )}
        </p>
      )}
      {state.config.testMode && (
        <p className="koin-test-mode">{t("Mode test · aucun achat réel")}</p>
      )}
      {(error || state.error) && (
        <p className="error" role="alert">
          {t(error || state.error)}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("koins") ===
          "confirmation" && (
          <p role="status">
            {t(
              returnedOrder?.status === "delivered"
                ? "Paiement confirmé. Tes Koins ont été crédités."
                : "Paiement en cours de vérification. Le solde est crédité uniquement après confirmation du fournisseur.",
            )}
          </p>
        )}
      {typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("koins") ===
          "annulation" && (
          <p role="status">
            {t(
              "Paiement interrompu. Aucun crédit n’est accordé sans confirmation du fournisseur.",
            )}
          </p>
        )}
      <nav className="segmented-tabs">
        {[
          ["offers", "Offres"],
          ["code", "Utiliser un code"],
          ["history", "Historique et documents"],
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
      {tab === "offers" && (
        <>
          {!state.config.purchasesEnabled ? (
            <p>{t("Les achats de Koins ne sont pas encore ouverts.")}</p>
          ) : (
            <>
              {!state.purchaseAllowed && (
                <p>
                  {t(
                    "Les achats payants sont réservés aux personnes majeures.",
                  )}
                </p>
              )}
              <label className="koin-terms">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                />
                {t("J’accepte les conditions d’achat.")}
                {state.config.termsUrl && (
                  <a
                    href={state.config.termsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("Consulter")}
                  </a>
                )}
              </label>
              <div className="koin-offers">
                {state.config.offers.map((offer) => (
                  <article key={offer.id}>
                    {offer.image ? (
                      <img
                        className="koin-offer-artwork"
                        src={`${API_URL}${offer.image}`}
                        alt=""
                      />
                    ) : (
                      <KoinIcon size={28} />
                    )}
                    <h3>{offer.name}</h3>
                    {offer.description && (
                      <p className="koin-offer-description">
                        {offer.description}
                      </p>
                    )}
                    <strong>{offer.quantity + offer.bonus} Koins</strong>
                    {offer.bonus > 0 && (
                      <small>
                        +{offer.bonus} {t("bonus")}
                      </small>
                    )}
                    <span>
                      {new Intl.NumberFormat("fr-BE", {
                        style: "currency",
                        currency: "EUR",
                      }).format(offer.priceCents / 100)}
                      {discord && (
                        <small>
                          {t(
                            "Tarif indicatif · le prix local est confirmé par Discord",
                          )}
                        </small>
                      )}
                    </span>
                    {offer.methods
                      .filter((method) =>
                        discord ? method === "discord" : method === "stripe",
                      )
                      .map((provider) => (
                        <button
                          type="button"
                          key={provider}
                          disabled={
                            busy ||
                            !accepted ||
                            !state.purchaseAllowed ||
                            state.blocked
                          }
                          onClick={() => buy(offer, provider)}
                        >
                          <ShoppingBag size={17} />
                          {provider === "discord"
                            ? t("Acheter sur Discord")
                            : t("Acheter")}
                        </button>
                      ))}
                  </article>
                ))}
              </div>
            </>
          )}
          {discord && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => action(syncDiscord)}
            >
              <RefreshCw size={17} />
              {t("Récupérer mes achats Discord")}
            </button>
          )}
        </>
      )}
      {tab === "code" && (
        <form
          className="koin-code-form"
          onSubmit={(event) => {
            event.preventDefault();
            action(async () => {
              const result = await api("/api/me/koins/redeem", {
                method: "POST",
                body: JSON.stringify({ code }),
                deduplicate: false,
              });
              setCode("");
              setMessage(
                t("{value0} Koins ajoutés.", { value0: result.order.koins }),
              );
            });
          }}
        >
          <label>
            {t("Code à usage unique")}
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              maxLength={100}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !code.trim() || !state.config.codesEnabled}
          >
            <Gift size={18} />
            {t("Utiliser le code")}
          </button>
          {!state.config.codesEnabled && (
            <p>{t("Les codes sont désactivés.")}</p>
          )}
        </form>
      )}
      {tab === "history" && (
        <>
          <h3>{t("Transactions")}</h3>
          <div className="koin-records">
            {[...(state.transactions ?? []), ...older.transactions].map(
              (row) => (
                <article key={row.id}>
                  <time>{new Date(row.created_at).toLocaleString()}</time>
                  <span>{t(koinTransactionLabel(row.reason))}</span>
                  <strong>
                    {row.delta > 0 ? "+" : ""}
                    {row.delta} Koins
                  </strong>
                </article>
              ),
            )}
          </div>
          {moreButton("transactions")}
          <h3>{t("Commandes")}</h3>
          <div className="koin-records">
            {[...(state.orders ?? []), ...older.orders].map((row) => (
              <article key={row.id}>
                <span>{row.offerName}</span>
                <span>
                  {t(koinStatusLabel(row.status))} · {row.koins} Koins
                </span>
                <time>{new Date(row.createdAt).toLocaleString()}</time>
              </article>
            ))}
          </div>
          {moreButton("orders")}
          <h3>{t("Documents")}</h3>
          <div className="koin-records">
            {[...(state.documents ?? []), ...older.documents].map((row) => (
              <article key={row.id}>
                <span>{row.providerNumber || row.number}</span>
                <span>{t(koinDocumentLabel(row.kind))}</span>
                {validProviderInvoiceLink(row.providerUrl) && (
                  <a href={row.providerUrl} target="_blank" rel="noreferrer">
                    {t("Document officiel du fournisseur")}
                  </a>
                )}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => action(() => downloadKoinDocument(row.id))}
                >
                  <Download size={17} />
                  {t("Télécharger le PDF")}
                </button>
              </article>
            ))}
          </div>
          {moreButton("documents")}
        </>
      )}
    </section>
  );
}
