import { useState } from "react";
import { Boxes, Check, Coins, Eye, RotateCcw, Search, ShoppingBag, Trophy, X } from "lucide-react";
import { CosmeticIcon, CosmeticPreview, DisplayName, ProfileCosmeticShell, cosmeticCssRules, previewUserForItem, shopTypeLabel } from "../cosmetics/Cosmetics.jsx";
import { Die, PlayingCard } from "../game/GamePieces.jsx";
import { Pagination } from "../feedback/Feedback.jsx";
import { usePagination } from "../common/usePagination.js";
import { CompactNumber, shopCategoryLabel } from "../../utils/presentation.jsx";
import { shopPackDefinitions } from "../../utils/shop-packs.js";
import { defaultCatalogFilters, filterShopItems, ownsShopItem, pricePack } from "../../features/shop/catalog.js";
import "./catalog.css";

const types = ["icons", "nameEffects", "memberCards", "profileBanners", "profileFrames", "profileEffects", "diceSkins", "cardSkins"];
const categories = ["classic", "premium", "premiumShape", "premiumAnimated"];

function ItemVisual({ item, user }) {
  const preview = previewUserForItem(user, item);
  return <div className={`catalog-visual catalog-visual-${item.type}`} aria-hidden="true">
    {(item.design || item.motion || item.css) && <style>{cosmeticCssRules([item])}</style>}
    {item.type === "icons" ? <CosmeticIcon value={item.value} source={item.icon} /> :
      item.type === "diceSkins" ? <>{[2, 4, 6].map((value) => <Die key={value} value={value} skin={item.value} animate={false} />)}</> :
      item.type === "cardSkins" ? <><PlayingCard hidden skin={item.value} animate={false} /><PlayingCard card={{ rank: "A", suit: "H" }} skin={item.value} animate={false} /></> :
      item.type === "nameEffects" ? <DisplayName user={preview} /> :
      <ProfileCosmeticShell user={preview} className="catalog-swatch-shell"><div className={`catalog-swatch member-swatch member-${preview.cosmetics?.equipped?.memberCard ?? "default"}`}><DisplayName user={preview} /><span>Carte membre</span></div></ProfileCosmeticShell>}
  </div>;
}

export function ShopCatalog({ user, items, stats, onPurchaseItem, onPurchasePack }) {
  const [mode, setMode] = useState("items");
  const [filters, setFilters] = useState({ ...defaultCatalogFilters });
  const [theme, setTheme] = useState("");
  const [selection, setSelection] = useState([]);
  const [previewId, setPreviewId] = useState("");
  const change = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const definitions = shopPackDefinitions(items);
  const filtered = filterShopItems(items, user, filters, definitions);
  const themes = Object.keys(definitions).filter((id) => filtered.some((item) => item.packs?.includes(id)));
  const effectiveTheme = themes.includes(theme) ? theme : themes[0];
  const matching = mode === "items" ? filtered : filtered.filter((item) => item.packs?.includes(effectiveTheme));
  const pages = usePagination(matching, JSON.stringify([mode, filters, effectiveTheme]), 12);
  const selected = items.filter((item) => item.packs?.includes(effectiveTheme) && selection.includes(item.id) && !item.rewardOnly && !ownsShopItem(user, item));
  const pricing = pricePack(selected);
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
    <nav className="catalog-mode" aria-label="Catalogue"><button className={mode === "items" ? "active" : ""} type="button" onClick={() => setMode("items")} aria-pressed={mode === "items"}><ShoppingBag size={18} />Objets</button><button className={mode === "packs" ? "active" : ""} type="button" onClick={() => setMode("packs")} aria-pressed={mode === "packs"}><Boxes size={18} />Packs</button></nav>
    <div className="catalog-filters">
      <label className="catalog-search"><span>Recherche</span><div><Search size={17} /><input type="search" value={filters.search} onChange={(event) => change("search", event.target.value)} placeholder="Nom, collection…" /></div></label>
      <label>Type<select aria-label="Type" value={filters.type} onChange={(event) => change("type", event.target.value)}><option value="all">Tous les types</option>{types.map((value) => <option value={value} key={value}>{shopTypeLabel(value)}</option>)}</select></label>
      <label>Gamme<select aria-label="Gamme" value={filters.category} onChange={(event) => change("category", event.target.value)}><option value="all">Toutes les gammes</option>{categories.map((value) => <option value={value} key={value}>{shopCategoryLabel(value)}</option>)}</select></label>
      <label>Inventaire<select aria-label="Inventaire" value={filters.ownership} onChange={(event) => change("ownership", event.target.value)}><option value="unowned">Non acquis</option><option value="owned">Déjà acquis</option><option value="all">Tout afficher</option></select></label>
      <label>Tri<select aria-label="Tri" value={filters.sort} onChange={(event) => change("sort", event.target.value)}><option value="price-asc">Prix croissant</option><option value="price-desc">Prix décroissant</option><option value="name">Nom A → Z</option></select></label>
      <label>Prix maximum<input type="number" min={0} value={filters.maxPrice} onChange={(event) => change("maxPrice", event.target.value)} placeholder="Sans limite" /></label>
      <div className="catalog-filter-actions"><label className="catalog-budget"><input type="checkbox" checked={filters.affordable} onChange={(event) => change("affordable", event.target.checked)} />Dans mon solde</label>
      <button type="button" className="secondary catalog-reset" data-request-feedback="state" title="Réinitialiser les filtres" aria-label="Réinitialiser les filtres" onClick={() => setFilters({ ...defaultCatalogFilters })}><RotateCcw size={18} /></button></div>
    </div>
    <div className="catalog-layout">
      <div className="catalog-main" ref={pages.anchor}>
        {mode === "packs" && <><label className="catalog-collection-picker">Collection<select aria-label="Collection" value={effectiveTheme ?? ""} onChange={(event) => chooseTheme(event.target.value)}>{!themes.length && <option value="">Aucune collection</option>}{themes.map((id) => <option key={id} value={id}>{definitions[id].name}</option>)}</select></label>{effectiveTheme && <header className="catalog-collection-heading"><div><span className="eyebrow">Pack personnalisable</span><h2>{definitions[effectiveTheme].name}</h2><p>{definitions[effectiveTheme].description}</p></div><span>{pricing.discount}%<small>de remise</small></span></header>}</>}
        <div className="catalog-results"><span>{matching.length} objet{matching.length > 1 ? "s" : ""}</span>{mode === "packs" && effectiveTheme && <div><button className="secondary" type="button" onClick={() => { setTheme(effectiveTheme); setSelection((previous) => [...new Set([...(theme === effectiveTheme ? previous : []), ...pages.rows.filter((item) => !ownsShopItem(user, item) && !item.rewardOnly).map((item) => item.id)])]); }}>Sélectionner cette page</button><button type="button" className="secondary" disabled={!selected.length} onClick={() => setSelection([])} title="Vider la sélection" aria-label="Vider la sélection"><X size={17} /></button></div>}</div>
        <div className="catalog-items">{pages.rows.map((item) => {
          const owned = ownsShopItem(user, item);
          const checked = selected.some((entry) => entry.id === item.id);
          return <article className={`catalog-item ${preview?.id === item.id ? "is-previewed" : ""} ${checked ? "is-selected" : ""}`} key={item.id}>
            <button type="button" className="catalog-preview-action" title={`Aperçu : ${item.name}`} aria-label={`Aperçu : ${item.name}`} onClick={() => setPreviewId(item.id)}><ItemVisual item={item} user={user} /><span><Eye size={14} />Aperçu</span></button>
            <div className="catalog-item-description"><small>{shopTypeLabel(item.type)} · {shopCategoryLabel(item.category)}</small><h3>{item.name}</h3><p>{item.description}</p></div>
            <div className="catalog-item-purchase"><span>{item.rewardOnly ? <><Trophy size={16} />Succès requis</> : <><CompactNumber value={item.price} label="Prix exact" /><Coins size={16} /></>}</span>{mode === "packs" ? <label className="catalog-item-check"><input type="checkbox" checked={checked} disabled={owned || item.rewardOnly} onChange={() => toggle(item)} /><span>{owned ? "Acquis" : item.rewardOnly ? "Récompense" : "Choisir"}</span></label> : <button type="button" disabled={owned || item.rewardOnly || Number(item.price) > Number(user.tokens)} className={owned || item.rewardOnly ? "secondary" : ""} onClick={() => onPurchaseItem(item)}>{owned ? <Check size={16} /> : <ShoppingBag size={16} />}{owned ? "Acquis" : item.rewardOnly ? "Récompense" : "Acheter"}</button>}</div>
          </article>;
        })}</div>
        {!matching.length && <div className="catalog-empty"><ShoppingBag size={24} /><h3>Aucun objet dans cette sélection</h3><button type="button" className="secondary" onClick={() => setFilters({ ...defaultCatalogFilters, ownership: "all" })}>Afficher tout le catalogue</button></div>}
        {matching.length > 0 && <Pagination {...pages} pageSizes={[12, 24, 48]} label="Pages du catalogue" />}
        {mode === "packs" && <section className="catalog-checkout"><div><span>{selected.length} objet{selected.length > 1 ? "s" : ""} sélectionné{selected.length > 1 ? "s" : ""}</span>{pricing.discount > 0 && <del><CompactNumber value={pricing.subtotal} /></del>}<strong><CompactNumber value={pricing.total} label="Total exact" /><Coins size={18} /></strong></div><button type="button" disabled={!selected.length || pricing.total > Number(user.tokens)} onClick={() => onPurchasePack({ ...pricing, packId: effectiveTheme, name: definitions[effectiveTheme]?.name, itemIds: selected.map((item) => item.id), count: selected.length })}><ShoppingBag size={17} />Acheter la sélection</button></section>}
      </div>
      <aside className="catalog-preview">{preview ? <><CosmeticPreview user={user} item={preview} stats={stats} /><h3>{preview.name}</h3><span>{shopTypeLabel(preview.type)} · {shopCategoryLabel(preview.category)}</span></> : <span>Aucun aperçu</span>}</aside>
    </div>
  </div>;
}
