import { Activity, Code2, Coins, Copy, Palette, Save, Settings, ShoppingBag, Trash2, X } from "lucide-react";
import {
  CosmeticPreview,
  LucideIconPicker,
  MotionDesigner,
  VisualDesigner,
  cosmeticMotionCssRules,
  shopTypeLabel,
  visualDesignCssRules
} from "../cosmetics/Cosmetics.jsx";
import { CompactNumber, shopCategoryLabel } from "../../utils/presentation.jsx";
import { shopPackDefinitions } from "../../utils/shop-packs.js";

export const SHOP_STUDIO_SECTIONS = [
  { id: "details", label: "Fiche", description: "Informations et prix", icon: ShoppingBag },
  { id: "appearance", label: "Apparence", description: "Forme et couleurs", icon: Palette },
  { id: "motion", label: "Animation", description: "Mouvement et rythme", icon: Activity },
  { id: "advanced", label: "Avancé", description: "CSS et suppression", icon: Code2 }
];

function updateCssProperty(source, property, value) {
  if (typeof document === "undefined") return source;
  const style = document.createElement("span").style;
  style.cssText = String(source ?? "");
  if (value === "") style.removeProperty(property);
  else style.setProperty(property, value);
  return style.cssText;
}

function cssProperty(source, property, fallback = "") {
  if (typeof document === "undefined") return fallback;
  const style = document.createElement("span").style;
  style.cssText = String(source ?? "");
  return style.getPropertyValue(property).trim() || fallback;
}

function GuidedCssEditor({ value, onChange }) {
  const set = (property, next) => onChange(updateCssProperty(value, property, next));
  const color = (property, fallback) => {
    const current = cssProperty(value, property, fallback);
    return /^#[0-9a-f]{6}$/i.test(current) ? current : fallback;
  };
  return <div className="guided-css-editor">
    <div><strong>Édition visuelle des surcharges</strong><small>Ces contrôles modifient le CSS ci-dessous et l’aperçu en direct.</small></div>
    <div className="guided-css-grid">
      <label>Texte<input type="color" value={color("color", "#ffe28a")} onChange={(event) => set("color", event.target.value)} /></label>
      <label>Fond<input type="color" value={color("background-color", "#171919")} onChange={(event) => set("background-color", event.target.value)} /></label>
      <label>Bordure<input type="color" value={color("border-color", "#d6ad45")} onChange={(event) => set("border-color", event.target.value)} /></label>
      <label>Arrondi<input type="range" min="0" max="40" value={Number.parseFloat(cssProperty(value, "border-radius", "8")) || 0} onChange={(event) => set("border-radius", `${event.target.value}px`)} /><output>{cssProperty(value, "border-radius", "8px")}</output></label>
      <label>Opacité<input type="range" min="0.1" max="1" step="0.05" value={Number.parseFloat(cssProperty(value, "opacity", "1")) || 1} onChange={(event) => set("opacity", event.target.value)} /><output>{cssProperty(value, "opacity", "1")}</output></label>
      <label className="guided-css-wide">Fond avancé<input value={cssProperty(value, "background", "")} onChange={(event) => set("background", event.target.value)} placeholder="linear-gradient(...), #171919, ..." /></label>
      <label className="guided-css-wide">Ombre<input value={cssProperty(value, "box-shadow", "")} onChange={(event) => set("box-shadow", event.target.value)} placeholder="0 12px 30px rgba(0, 0, 0, .35)" /></label>
    </div>
  </div>;
}

export function ShopStudio({
  item,
  kind,
  user,
  shop,
  pricingGuide,
  isAdministrator,
  section,
  onSectionChange,
  onUpdate,
  onActivateVisualDesigner,
  onDisableVisualDesigner,
  onDuplicate,
  saving,
  onDelete,
  onCancel
}) {
  return <>
    <nav className="shop-studio-tabs" aria-label="Sections du studio boutique" role="tablist">
      {SHOP_STUDIO_SECTIONS.map(({ id, label, description, icon: Icon }) => <button type="button" role="tab" key={id} className={section === id ? "active" : ""} aria-selected={section === id} onClick={() => onSectionChange(id)}><Icon className="shop-studio-tab-icon" size={18} /><span><strong>{label}</strong><small>{description}</small></span></button>)}
    </nav>

    <div className="admin-editor-layout shop-studio-layout">
      <div className="admin-editor-fields shop-editor-panel">
        {section === "details" && <section className="admin-form-section shop-studio-section"><div className="admin-form-section-title"><ShoppingBag /><div><h3>Fiche boutique</h3><p>Nom, classement et tarif visibles avant l’achat.</p></div></div><label>Nom de l’élément<input required value={item.name} onChange={(event) => onUpdate("name", event.target.value)} /></label><label>Description<textarea required value={item.description ?? ""} onChange={(event) => onUpdate("description", event.target.value)} maxLength={240} /><small>{item.description?.length ?? 0}/240 caractères</small></label><div className="admin-field-grid"><label>Type<select value={item.type} onChange={(event) => onUpdate("type", event.target.value)}>{["icons", "nameEffects", "memberCards", "profileBanners", "profileFrames", "profileEffects", "diceSkins", "cardSkins"].map((type) => <option key={type} value={type}>{shopTypeLabel(type)}</option>)}</select></label><label>Collection<select value={item.category} onChange={(event) => onUpdate("category", event.target.value)}>{["classic", "premium", "premiumShape", "premiumAnimated"].map((category) => <option key={category} value={category}>{shopCategoryLabel(category)}</option>)}</select></label><label>Coût<input type="number" min={isAdministrator ? 0 : pricingGuide?.allowedMin ?? 0} max={isAdministrator ? undefined : pricingGuide?.allowedMax} value={item.price ?? 0} onChange={(event) => onUpdate("price", Number(event.target.value))} /></label><label>Pack<input value={item.packName ?? ""} list="shop-pack-names" maxLength={80} placeholder="Aucun pack" onChange={(event) => onUpdate("packName", event.target.value)} /><small className="field-help">Écris un nom existant ou un nouveau nom pour créer le pack.</small></label></div><datalist id="shop-pack-names">{Object.values(shopPackDefinitions(shop)).map((pack) => <option key={pack.name} value={pack.name} />)}</datalist>{pricingGuide && <div className="shop-pricing-guide"><div><Coins size={19} /><span><strong>Référence tarifaire</strong><small><CompactNumber value={pricingGuide.count} suffix={` objet${pricingGuide.count > 1 ? "s" : ""}`} /> comparable{pricingGuide.count > 1 ? "s" : ""} · de <CompactNumber value={pricingGuide.min} label="Prix minimum exact" /> à <CompactNumber value={pricingGuide.max} label="Prix maximum exact" /></small></span></div><div className="shop-pricing-recommendation"><span>Prix conseillé<strong><CompactNumber value={pricingGuide.recommended} label="Prix conseillé exact" /></strong></span><button type="button" className="secondary" onClick={() => onUpdate("price", pricingGuide.recommended)}>Appliquer</button></div>{!isAdministrator && <small className="shop-pricing-limit">Plage éditeur autorisée : <CompactNumber value={pricingGuide.allowedMin} /> à <CompactNumber value={pricingGuide.allowedMax} suffix=" jetons" />.</small>}</div>}</section>}

        {section === "appearance" && <>
          {item.type === "icons" && <section className="admin-form-section admin-icon-editor shop-studio-section"><div className="admin-form-section-title"><Palette /><div><h3>Icône</h3><p>Sélectionne une icône Lucide ou colle un SVG personnalisé.</p></div></div><label>Nom Lucide ou code SVG<textarea className="icon-source-editor" value={item.icon ?? ""} onChange={(event) => onUpdate("icon", event.target.value)} spellCheck="false" placeholder={'Exemple : crown ou <svg viewBox="0 0 24 24">…</svg>'} /></label><LucideIconPicker value={item.icon} onChange={(name) => onUpdate("icon", name)} /></section>}
          <VisualDesigner type={item.type} design={item.design} onChange={(design) => onUpdate("design", design)} onActivate={onActivateVisualDesigner} onDisable={onDisableVisualDesigner} />
        </>}

        {section === "motion" && <MotionDesigner motion={item.motion} onChange={(motion) => onUpdate("motion", motion)} />}

        {section === "advanced" && <>
          <section className="admin-form-section shop-studio-section shop-css-section"><div className="admin-form-section-title"><Settings /><div><h3>CSS avancé</h3><p>Déclarations supplémentaires limitées à cet objet.</p></div></div><GuidedCssEditor value={item.css ?? ""} onChange={(css) => onUpdate("css", css)} />{(item.design || item.motion) && <details className="generated-css-panel"><summary>Voir le CSS généré par les studios</summary><textarea className="css-editor" readOnly value={[visualDesignCssRules(item.value ? item : { ...item, value: "admin-preview" }), cosmeticMotionCssRules(item.value ? item : { ...item, value: "admin-preview" })].filter(Boolean).join("\n")} /></details>}<label>{item.design ? "Surcharges CSS" : "CSS de l’élément"}<textarea className="css-editor" value={item.css ?? ""} onChange={(event) => onUpdate("css", event.target.value)} spellCheck="false" placeholder={"color: #ffe28a;\nbackground: linear-gradient(...);\nborder-color: #d6ad45;"} /></label></section>
        </>}
      </div>
      <aside className="shop-studio-preview-column">
        <CosmeticPreview user={user} item={item} />
        <div className="shop-studio-controls" aria-label="Actions de l’objet">
          <button type="submit" disabled={saving}><Save size={18} /> {saving ? "Enregistrement…" : "Enregistrer"}</button>
          {kind === "shop" && <button type="button" className="secondary" onClick={onDuplicate}><Copy size={18} /> Dupliquer</button>}
          {kind === "shop" && <button type="button" className="danger-button" onClick={onDelete}><Trash2 size={18} /> Supprimer</button>}
          <button type="button" className="secondary" onClick={onCancel}><X size={18} /> Annuler</button>
        </div>
      </aside>
    </div>
  </>;
}
