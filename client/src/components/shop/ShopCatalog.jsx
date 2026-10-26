import { useLocale } from "../../locales/LocaleProvider.jsx";
import { useState } from "react";
import { Boxes, Check, Coins, Eye, RotateCcw, Search, ShoppingBag, Trophy, X } from "lucide-react";
import { CosmeticIcon, CosmeticPreview, DisplayName, ProfileCosmeticShell, cosmeticCssRules, previewUserForItem, shopTypeLabel } from "../cosmetics/Cosmetics.jsx";
import { PiecePreview } from "../cosmetics/PiecePreview.jsx";
import { Pagination } from "../feedback/Feedback.jsx";
import { usePagination } from "../common/usePagination.js";
import { CompactNumber, shopCategoryLabel } from "../../utils/presentation.jsx";
import { shopPackDefinitions } from "../../utils/shop-packs.js";
import { defaultCatalogFilters, filterShopItems, ownsShopItem } from "../../features/shop/catalog.js";
import { itemPurchaseOptions, packPurchaseOptions } from "../../features/shop/purchase-options.js";
import { KoinIcon, KoinWallet, useKoins } from "../../features/koins/Koins.jsx";
import { koinsVisible } from "../../navigation/header-layout.js";
import { Mascot } from "../mascots/Mascot.jsx";
import "./catalog.css";

const types = ["icons", "nameEffects", "memberCards", "profileBanners", "profileFrames", "profileEffects", "diceSkins", "cardSkins"];
const categories = ["classic", "premium", "premiumShape", "premiumAnimated"];

function ItemVisual({ item, user }) {
  const { t: localeText } = useLocale();
  const preview = previewUserForItem(user, item);
  return <div className={`catalog-visual catalog-visual-${item.type}`} aria-hidden="true">
    {(item.design || item.motion || item.css) && <style>{cosmeticCssRules([item])}</style>}
    {item.type === "icons" ? <CosmeticIcon value={item.value} source={item.icon} framed={item.iconFramed}/> :
      ["diceSkins", "cardSkins"].includes(item.type) ? <PiecePreview type={item.type} skin={item.value}/> :
      item.type === "nameEffects" ? <DisplayName user={preview} interactive={false} /> :
      <ProfileCosmeticShell user={preview} className="catalog-swatch-shell"><div className={`catalog-swatch member-swatch member-${preview.cosmetics?.equipped?.memberCard ?? "default"}`}><DisplayName user={preview} interactive={false} /><span>{localeText("Carte membre")}</span></div></ProfileCosmeticShell>}
  </div>;
}

export function ShopCatalog({ user, items, stats, onPurchaseItem, onPurchasePack, onPreviewProfile }) {
  const { t: localeText } = useLocale();
  const [mode, setMode] = useState("items");
  const [filters, setFilters] = useState({ ...defaultCatalogFilters });
  const [theme, setTheme] = useState("");
  const [selection, setSelection] = useState([]);
  const [previewId, setPreviewId] = useState("");
  const koins = useKoins(user);
  const optionsFor = (item) => itemPurchaseOptions(item, user, koins);
  const change = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const definitions = shopPackDefinitions(items);
  const filtered = filterShopItems(items, user, filters, definitions, (item) => optionsFor(item).filter((option) => filters[option.currency]));
  const themes = Object.keys(definitions).filter((id) => filtered.some((item) => item.packs?.includes(id)));
  const effectiveTheme = themes.includes(theme) ? theme : themes[0];
  const matching = mode === "items" ? filtered : filtered.filter((item) => item.packs?.includes(effectiveTheme));
  const pages = usePagination(matching, JSON.stringify([mode, filters, effectiveTheme]), 12);
  const selected = items.filter((item) => item.packs?.includes(effectiveTheme) && selection.includes(item.id) && !item.rewardOnly && !ownsShopItem(user, item) && optionsFor(item).length > 0);
  const packOptions = packPurchaseOptions(selected, user, koins);
  const discount = Math.min(35, Math.max(0, selected.length - 1) * 5);
  const preview = matching.find((item) => item.id === previewId) ?? matching[0];
  const chooseTheme = (id) => { setTheme(id); setSelection([]); setPreviewId(""); };
  const toggle = (item) => {
    setPreviewId(item.id);
    if (ownsShopItem(user, item) || item.rewardOnly) return;
    // Keep selections across filters and pagination, but never mix collections.
    if (theme !== effectiveTheme) { setTheme(effectiveTheme); setSelection([item.id]); return; }
    setSelection((previous) => previous.includes(item.id) ? previous.filter((id) => id !== item.id) : [...previous, item.id]);
  };
  return <div className="catalog-workspace">
    <nav className="catalog-mode" aria-label={localeText("Catalogue")}><button className={mode === "items" ? "active" : ""} type="button" onClick={() => setMode("items")} aria-pressed={mode === "items"}><ShoppingBag size={18} />{localeText("Objets")}</button><button className={mode === "packs" ? "active" : ""} type="button" onClick={() => setMode("packs")} aria-pressed={mode === "packs"}><Boxes size={18} />{localeText("Packs")}</button>{koinsVisible(koins.config) && <button className={mode === "wallet" ? "active" : ""} type="button" onClick={() => setMode("wallet")} aria-pressed={mode === "wallet"}><KoinIcon/>Koins</button>}<Mascot cycle="collection" className="catalog-host" docked/></nav>
    {mode === "wallet" ? <KoinWallet user={user}/> : <>
    <div className="catalog-filters">
      <label className="catalog-search"><span>{localeText("Recherche")}</span><div><Search size={17} /><input type="search" value={filters.search} onChange={(event) => change("search", event.target.value)} placeholder={localeText("Nom, collection…")} /></div></label>
      <label>{localeText("Type")}<select aria-label={localeText("Type")} value={filters.type} onChange={(event) => change("type", event.target.value)}><option value="all">{localeText("Tous les types")}</option>{types.map((value) => <option value={value} key={value}>{localeText(shopTypeLabel(value))}</option>)}</select></label>
      <label>{localeText("Gamme")}<select aria-label={localeText("Gamme")} value={filters.category} onChange={(event) => change("category", event.target.value)}><option value="all">{localeText("Toutes les gammes")}</option>{categories.map((value) => <option value={value} key={value}>{localeText(shopCategoryLabel(value))}</option>)}</select></label>
      <label>{localeText("Inventaire")}<select aria-label={localeText("Inventaire")} value={filters.ownership} onChange={(event) => change("ownership", event.target.value)}><option value="unowned">{localeText("Non acquis")}</option><option value="owned">{localeText("Déjà acquis")}</option><option value="all">{localeText("Tout afficher")}</option></select></label>
      <label>{localeText("Tri")}<select aria-label={localeText("Tri")} value={filters.sort} onChange={(event) => change("sort", event.target.value)}><option value="price-asc">{localeText("Prix croissant")}</option><option value="price-desc">{localeText("Prix décroissant")}</option><option value="name">{localeText("Nom A → Z")}</option></select></label>
      <label>{localeText("Prix maximum par monnaie")}<input type="number" min={0} value={filters.maxPrice} onChange={(event) => change("maxPrice", event.target.value)} placeholder={localeText("Sans limite")} /></label>
      {koins.config.shopEnabled && <fieldset className="catalog-currency-filters"><legend>{localeText("Monnaies acceptées")}</legend><label><input type="checkbox" checked={filters.tokens} onChange={(event) => change("tokens", event.target.checked)}/><Coins size={16}/>{localeText("Jetons")}</label><label><input type="checkbox" checked={filters.koins} onChange={(event) => change("koins", event.target.checked)}/><KoinIcon size={16}/>Koins</label></fieldset>}
      <div className="catalog-filter-actions"><label className="catalog-budget"><input type="checkbox" checked={filters.affordable} onChange={(event) => change("affordable", event.target.checked)} />{localeText("Dans mon solde")}</label>
      <button type="button" className="secondary catalog-reset" data-request-feedback="state" title={localeText("Réinitialiser les filtres")} aria-label={localeText("Réinitialiser les filtres")} onClick={() => setFilters({ ...defaultCatalogFilters })}><RotateCcw size={18} /></button></div>
    </div>
    <div className="catalog-layout">
      <div className="catalog-main" ref={pages.anchor}>
        {mode === "packs" && <><label className="catalog-collection-picker">{localeText("Collection")}<select aria-label={localeText("Collection")} value={effectiveTheme ?? ""} onChange={(event) => chooseTheme(event.target.value)}>{!themes.length && <option value="">{localeText("Aucune collection")}</option>}{themes.map((id) => <option key={id} value={id}>{localeText(definitions[id].name)}</option>)}</select></label>{effectiveTheme && <header className="catalog-collection-heading"><div><span className="eyebrow">{localeText("Pack personnalisable")}</span><h2>{localeText(definitions[effectiveTheme].name)}</h2><p>{localeText(definitions[effectiveTheme].description)}</p></div><span>{discount}%<small>{localeText("de remise")}</small></span></header>}</>}
        <div className="catalog-results"><span>{matching.length}{" " + localeText("objet")}{matching.length > 1 ? localeText("s") : ""}</span>{mode === "packs" && effectiveTheme && <div><button className="secondary" type="button" onClick={() => { setTheme(effectiveTheme); setSelection((previous) => [...new Set([...(theme === effectiveTheme ? previous : []), ...pages.rows.filter((item) => !ownsShopItem(user, item) && !item.rewardOnly).map((item) => item.id)])]); }}>{localeText("Sélectionner cette page")}</button><button type="button" className="secondary" disabled={!selected.length} onClick={() => setSelection([])} title={localeText("Vider la sélection")} aria-label={localeText("Vider la sélection")}><X size={17} /></button></div>}</div>
        <div className="catalog-items">{pages.rows.map((item) => {
          const owned = ownsShopItem(user, item);
          const checked = selected.some((entry) => entry.id === item.id);
          const options = optionsFor(item);
          return <article className={`catalog-item ${preview?.id === item.id ? "is-previewed" : ""} ${checked ? "is-selected" : ""}`} key={item.id}>
            <button type="button" className="catalog-preview-action" title={localeText("Aperçu : {value0}", { value0: item.name })} aria-label={localeText("Aperçu : {value0}", { value0: item.name })} onClick={() => setPreviewId(item.id)}><ItemVisual item={item} user={user} /><span><Eye size={14} />{localeText("Aperçu")}</span></button>
            <div className="catalog-item-description"><small>{localeText(shopTypeLabel(item.type))} · {localeText(shopCategoryLabel(item.category))}</small><h3>{localeText(item.name)}</h3><p>{localeText(item.description)}</p></div>
            <div className="catalog-item-purchase">
              {owned ? <span className="catalog-owned"><Check size={16}/>{localeText("Acquis")}</span> : item.rewardOnly ? <span><Trophy size={16}/>{localeText("Succès requis")}</span> : mode === "packs" ? <div className="catalog-price-options">{options.map(({ currency, price }) => <span key={currency}><CompactNumber value={price}/>{currency === "koins" ? <KoinIcon size={16}/> : <Coins size={16}/>}<small>{currency === "koins" ? "Koins" : localeText("Jetons")}</small></span>)}</div> :
                <div className="catalog-purchase-options">{options.map(({ currency, price, purchasable }) => <button key={currency} type="button" className={`catalog-buy-${currency}`} disabled={!purchasable} title={!purchasable ? localeText(currency === "koins" && koins.blocked ? "Portefeuille suspendu" : "Solde insuffisant") : localeText("Acheter")} aria-label={`${localeText("Acheter")} ${localeText(item.name)} · ${price} ${currency === "koins" ? "Koins" : localeText("Jetons")}`} onClick={() => onPurchaseItem({ ...item, currency, price })}>{currency === "koins" ? <KoinIcon size={17}/> : <Coins size={17}/>}<CompactNumber value={price}/><small>{currency === "koins" ? "Koins" : localeText("Jetons")}</small></button>)}</div>}
              {mode === "packs" && <label className="catalog-item-check"><input type="checkbox" checked={checked} disabled={owned || item.rewardOnly || !options.length} onChange={() => toggle(item)}/><span>{localeText("Choisir")}</span></label>}
            </div>
          </article>;
        })}</div>
        {!matching.length && <div className="catalog-empty"><ShoppingBag size={24} /><h3>{localeText("Aucun objet dans cette sélection")}</h3><button type="button" className="secondary" onClick={() => setFilters({ ...defaultCatalogFilters, ownership: "all" })}>{localeText("Afficher tout le catalogue")}</button></div>}
        {matching.length > 0 && <Pagination {...pages} pageSizes={[12, 24, 48]} label={localeText("Pages du catalogue")} />}
        {mode === "packs" && <section className="catalog-checkout"><div><span>{selected.length}{" " + localeText("objet")}{selected.length > 1 ? localeText("s") : ""}{" " + localeText("sélectionné")}{selected.length > 1 ? localeText("s") : ""}</span>{discount > 0 && <span>−{discount}%</span>}</div><div className="catalog-purchase-options">{packOptions.map(({ currency, pricing, purchasable }) => <button type="button" key={currency} className={`catalog-buy-${currency}`} disabled={!purchasable} aria-label={`${localeText("Acheter la sélection")} · ${currency === "koins" ? "Koins" : localeText("Jetons")}`} title={selected.length && !pricing ? localeText("Cette monnaie n’est pas acceptée pour toute la sélection.") : localeText("Acheter la sélection")} onClick={() => onPurchasePack({ ...pricing, currency, packId: effectiveTheme, name: definitions[effectiveTheme]?.name, itemIds: selected.map((item) => item.id), count: selected.length })}>{currency === "koins" ? <KoinIcon size={18}/> : <Coins size={18}/>}<span>{pricing ? <>{pricing.discount > 0 && <del><CompactNumber value={pricing.subtotal}/></del>}<CompactNumber value={pricing.total}/></> : "—"} {currency === "koins" ? "Koins" : localeText("Jetons")}</span></button>)}</div>{selected.length > 0 && packOptions.every((option) => !option.pricing) && <p className="catalog-checkout-hint" role="status">{localeText("Choisis des objets acceptant une même monnaie pour acheter la sélection.")}</p>}</section>}
      </div>
      <aside className="catalog-preview">{preview ? <><div className="catalog-preview-heading"><Eye size={17}/><span>{localeText("Aperçu")}</span></div><button type="button" className="catalog-profile-surface" onClick={() => onPreviewProfile?.(preview)} disabled={!onPreviewProfile} aria-label={`${localeText("Profil public")} · ${localeText(preview.name)}`}><CosmeticPreview user={user} item={preview} stats={stats} /><span><Eye size={17}/>{localeText("Profil public")}</span></button><h3>{localeText(preview.name)}</h3><span>{localeText(shopTypeLabel(preview.type))} · {localeText(shopCategoryLabel(preview.category))}</span></> : <span>{localeText("Aucun aperçu")}</span>}</aside>
    </div>
    </>}
  </div>;
}
