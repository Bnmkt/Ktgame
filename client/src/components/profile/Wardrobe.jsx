import { useState } from "react";
import { Check, ChevronRight, Search, ShoppingBag } from "lucide-react";
import { api } from "../../api.js";
import { cardSkinOptions, diceSkinOptions, iconOptions, memberCardOptions, nameEffectOptions } from "../../config/site.js";
import { shopCategoryLabel } from "../../utils/presentation.jsx";
import { CosmeticIcon, ProfileCosmeticShell } from "../cosmetics/Cosmetics.jsx";
import { Die, PlayingCard } from "../game/GamePieces.jsx";
import { Dialog } from "../common/Dialog.jsx";

const categories = [
  { type: "icons", key: "icon", title: "Icône", action: "Choisir une icône", fallback: "chip", names: iconOptions },
  { type: "nameEffects", key: "nameEffect", title: "Effet de pseudo", action: "Choisir un effet de pseudo", fallback: "none", names: nameEffectOptions },
  { type: "memberCards", key: "memberCard", title: "Member card", action: "Choisir une member card", fallback: "default", names: memberCardOptions },
  { type: "profileBanners", key: "profileBanner", title: "Bannière de profil", action: "Choisir une bannière de profil", fallback: "default" },
  { type: "profileFrames", key: "profileFrame", title: "Cadre de profil", action: "Choisir un cadre de profil", fallback: "none" },
  { type: "profileEffects", key: "profileEffect", title: "Effet de profil", action: "Choisir un effet de profil", fallback: "none" },
  { type: "diceSkins", key: "diceSkin", title: "Dés", action: "Choisir un skin de dés", fallback: "default", names: diceSkinOptions },
  { type: "cardSkins", key: "cardSkin", title: "Cartes", action: "Choisir un skin de cartes", fallback: "default", names: cardSkinOptions }
];

function ItemVisual({ category, value, user }) {
  if (category.type === "icons") return <CosmeticIcon value={value} />;
  if (category.type === "nameEffects") return <span className={`display-name name-${value}`}><span className="display-name-text">{user.pseudo}</span></span>;
  if (category.type === "diceSkins") return <Die value={5} skin={value} animate={false} />;
  if (category.type === "cardSkins") return <div className="wardrobe-card-pair"><PlayingCard card={{ rank: "A", suit: "H" }} skin={value} animate={false} /><PlayingCard hidden skin={value} animate={false} /></div>;
  if (category.type === "memberCards") return <div className={`vip-card wardrobe-member member-${value}`}><span className="vip-label">KTGA.ME</span><strong>{user.pseudo}</strong></div>;
  const previewUser = { ...user, cosmetics: { ...user.cosmetics, equipped: { ...user.cosmetics?.equipped, profileBanner: "default", profileFrame: "none", profileEffect: "none", [category.key]: value } } };
  return <ProfileCosmeticShell user={previewUser} className="wardrobe-profile-sample"><span>{user.pseudo}</span></ProfileCosmeticShell>;
}

export function Wardrobe({ user, setUser, catalog, onOpenShop }) {
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const itemFor = (category, value) => catalog.find((item) => item.type === category.type && item.value === value);
  const nameFor = (category, value) => itemFor(category, value)?.name ?? category.names?.[value] ?? (value === "none" ? "Aucun" : value === "default" ? "Classique" : value);
  const ownedValues = (category) => [...new Set([category.fallback, ...(user.cosmetics?.[category.type] ?? [])])];
  const items = selected ? ownedValues(selected).map((value) => ({ value, name: nameFor(selected, value), category: itemFor(selected, value)?.category ?? "classic" })) : [];
  const filters = [...new Set(items.map((item) => item.category))];
  const visible = items.filter((item) => (filter === "all" || item.category === filter) && item.name.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr")));
  async function equip(value) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const updated = await api("/api/me/cosmetics", { method: "PATCH", body: JSON.stringify({ [selected.key]: value }) });
      setUser(updated);
      setSelected(null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <>
    <div className="wardrobe-heading"><h2>Style</h2><button type="button" className="secondary" onClick={onOpenShop}><ShoppingBag size={17} /> Boutique</button></div>
    {user.guest ? <p>La personnalisation est réservée aux comptes enregistrés.</p> : <div className="wardrobe-grid">{categories.map((category) => {
      const value = user.cosmetics?.equipped?.[category.key] ?? category.fallback;
      return <section className="wardrobe-slot" key={category.key}>
        <button type="button" className="secondary wardrobe-open" aria-haspopup="dialog" onClick={() => { setSelected(category); setQuery(""); setFilter("all"); setError(""); }}><span>{category.action}</span><ChevronRight size={17} /></button>
        <div className={`wardrobe-current wardrobe-visual-${category.type}`}><ItemVisual category={category} value={value} user={user} /></div>
        <div className="wardrobe-current-label"><strong>{nameFor(category, value)}</strong><small><Check size={13} /> Équipé · {ownedValues(category).length} disponible(s)</small></div>
      </section>;
    })}</div>}
    {selected && <Dialog title={selected.action} className="wardrobe-modal" onClose={() => setSelected(null)} dismissible={!busy}>
      <label className="connections-search"><Search size={18} /><span className="sr-only">Rechercher dans la collection</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans ma collection" /></label>
      {filters.length > 1 && <nav className="shop-subselector" aria-label="Catégorie de personnalisation"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Tous</button>{filters.map((category) => <button key={category} className={filter === category ? "active" : ""} onClick={() => setFilter(category)}>{shopCategoryLabel(category)}</button>)}</nav>}
      {error && <div className="error" role="alert">{error}</div>}
      <div className="wardrobe-choices">{visible.map((item) => {
        const equipped = item.value === (user.cosmetics?.equipped?.[selected.key] ?? selected.fallback);
        return <button type="button" className={`wardrobe-choice ${equipped ? "active" : ""}`} key={item.value} disabled={busy} aria-pressed={equipped} onClick={() => equip(item.value)}><span className={`wardrobe-current wardrobe-visual-${selected.type}`}><ItemVisual category={selected} value={item.value} user={user} /></span><strong>{item.name}</strong><small>{equipped ? <><Check size={13} /> Équipé</> : shopCategoryLabel(item.category)}</small></button>;
      })}{!visible.length && <p className="empty-state">Aucun élément ne correspond à la recherche.</p>}</div>
      <div className="wardrobe-footer"><small>{visible.length} élément(s)</small><button type="button" className="secondary" disabled={busy} onClick={() => { setSelected(null); onOpenShop(); }}><ShoppingBag size={17} /> Découvrir la boutique</button></div>
    </Dialog>}
  </>;
}
