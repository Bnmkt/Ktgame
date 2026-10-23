import { useLocale } from "../../locales/LocaleProvider.jsx";
import { CodeEditor } from "../common/CodeEditor.jsx";
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
import { ShopArtworkEditor } from "./ShopArtworkEditor.jsx";

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
  const { t: localeText } = useLocale();
  const set = (property, next) => onChange(updateCssProperty(value, property, next));
  const color = (property, fallback) => {
    const current = cssProperty(value, property, fallback);
    return /^#[0-9a-f]{6}$/i.test(current) ? current : fallback;
  };
  return <div className="guided-css-editor">
    <div><strong>{localeText("Édition visuelle des surcharges")}</strong><small>{localeText("Ces contrôles modifient le CSS ci-dessous et l’aperçu en direct.")}</small></div>
    <div className="guided-css-grid">
      <label>{localeText("Texte")}<input type="color" value={color("color", "#ffe28a")} onChange={(event) => set("color", event.target.value)} /></label>
      <label>{localeText("Fond")}<input type="color" value={color("background-color", "#171919")} onChange={(event) => set("background-color", event.target.value)} /></label>
      <label>{localeText("Bordure")}<input type="color" value={color("border-color", "#d6ad45")} onChange={(event) => set("border-color", event.target.value)} /></label>
      <label>{localeText("Arrondi")}<input type="range" min="0" max="40" value={Number.parseFloat(cssProperty(value, "border-radius", "8")) || 0} onChange={(event) => set("border-radius", `${event.target.value}px`)} /><output>{cssProperty(value, "border-radius", "8px")}</output></label>
      <label>{localeText("Opacité")}<input type="range" min="0.1" max="1" step="0.05" value={Number.parseFloat(cssProperty(value, "opacity", "1")) || 1} onChange={(event) => set("opacity", event.target.value)} /><output>{cssProperty(value, "opacity", "1")}</output></label>
      <label className="guided-css-wide">{localeText("Fond avancé")}<input value={cssProperty(value, "background", "")} onChange={(event) => set("background", event.target.value)} placeholder={localeText("linear-gradient(...), #171919, ...")} /></label>
      <label className="guided-css-wide">{localeText("Ombre")}<input value={cssProperty(value, "box-shadow", "")} onChange={(event) => set("box-shadow", event.target.value)} placeholder={localeText("0 12px 30px rgba(0, 0, 0, .35)")} /></label>
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
  const { t: localeText } = useLocale();
  return <>
    <nav className="shop-studio-tabs" aria-label={localeText("Sections du studio boutique")} role="tablist">
      {SHOP_STUDIO_SECTIONS.map(({ id, label, description, icon: Icon }) => <button type="button" role="tab" key={id} className={section === id ? "active" : ""} aria-selected={section === id} onClick={() => onSectionChange(id)}><Icon className="shop-studio-tab-icon" size={18} /><span><strong>{localeText(label)}</strong><small>{description}</small></span></button>)}
    </nav>

    <div className="admin-editor-layout shop-studio-layout">
      <div className="admin-editor-fields shop-editor-panel">
        {section === "details" && <section className="admin-form-section shop-studio-section"><div className="admin-form-section-title"><ShoppingBag /><div><h3>{localeText("Fiche boutique")}</h3><p>{localeText("Nom, classement et tarif visibles avant l’achat.")}</p></div></div><label>{localeText("Nom de l’élément")}<input required value={item.name} onChange={(event) => onUpdate("name", event.target.value)} /></label><label>{localeText("Description")}<textarea required value={item.description ?? ""} onChange={(event) => onUpdate("description", event.target.value)} maxLength={240} /><small>{item.description?.length ?? 0}{localeText("/240 caractères")}</small></label><div className="admin-field-grid"><label>{localeText("Type")}<select value={item.type} onChange={(event) => onUpdate("type", event.target.value)}>{["icons", "nameEffects", "memberCards", "profileBanners", "profileFrames", "profileEffects", "diceSkins", "cardSkins"].map((type) => <option key={type} value={type}>{localeText(shopTypeLabel(type))}</option>)}</select></label><label>{localeText("Collection")}<select value={item.category} onChange={(event) => onUpdate("category", event.target.value)}>{["classic", "premium", "premiumShape", "premiumAnimated"].map((category) => <option key={category} value={category}>{localeText(shopCategoryLabel(category))}</option>)}</select></label><label>{localeText("Coût")}<input type="number" min={isAdministrator ? 0 : pricingGuide?.allowedMin ?? 0} max={isAdministrator ? undefined : pricingGuide?.allowedMax} value={item.price ?? 0} onChange={(event) => onUpdate("price", Number(event.target.value))} /></label><label>{localeText("Pack")}<input value={item.packName ?? ""} list="shop-pack-names" maxLength={80} placeholder={localeText("Aucun pack")} onChange={(event) => onUpdate("packName", event.target.value)} /><small className="field-help">{localeText("Écris un nom existant ou un nouveau nom pour créer le pack.")}</small></label></div><datalist id="shop-pack-names">{Object.values(shopPackDefinitions(shop)).map((pack) => <option key={pack.name} value={pack.name} />)}</datalist>{pricingGuide && <div className="shop-pricing-guide"><div><Coins size={19} /><span><strong>{localeText("Référence tarifaire")}</strong><small><CompactNumber value={pricingGuide.count} suffix={localeText(" objet{value0}", { value0: pricingGuide.count > 1 ? "s" : "" })} />{" " + localeText("comparable")}{pricingGuide.count > 1 ? localeText("s") : ""}{" " + localeText("· de") + " "}<CompactNumber value={pricingGuide.min} label={localeText("Prix minimum exact")} />{" " + localeText("à") + " "}<CompactNumber value={pricingGuide.max} label={localeText("Prix maximum exact")} /></small></span></div><div className="shop-pricing-recommendation"><span>{localeText("Prix conseillé")}<strong><CompactNumber value={pricingGuide.recommended} label={localeText("Prix conseillé exact")} /></strong></span><button type="button" className="secondary" onClick={() => onUpdate("price", pricingGuide.recommended)}>{localeText("Appliquer")}</button></div>{!isAdministrator && <small className="shop-pricing-limit">{localeText("Plage éditeur autorisée :") + " "}<CompactNumber value={pricingGuide.allowedMin} />{" " + localeText("à") + " "}<CompactNumber value={pricingGuide.allowedMax} suffix={localeText(" jetons")} />.</small>}</div>}</section>}

        {section === "appearance" && <>
          {item.type === "icons" && <label className="branding-logo-frame"><input type="checkbox" checked={item.iconFramed !== false} onChange={event => onUpdate("iconFramed", event.target.checked)} disabled={saving}/>{localeText("Afficher un cercle autour de l’icône")}</label>}
          <ShopArtworkEditor key={item.type} item={item} onUpdate={onUpdate} disabled={saving} fields={item.type === "diceSkins" ? ["surfaceImage"] : undefined}/>
          {item.type === "icons" && <section className="admin-form-section admin-icon-editor shop-studio-section"><div className="admin-form-section-title"><Palette /><div><h3>{localeText("Icône")}</h3><p>{localeText("Sélectionne une icône Lucide ou colle un SVG personnalisé.")}</p></div></div><label>{localeText("Nom Lucide ou code SVG")}<CodeEditor language="svg" label={localeText("Nom Lucide ou code SVG")} maxLength={6000} height={220} value={item.icon ?? ""} onChange={value => onUpdate("icon", value)}/></label><LucideIconPicker value={item.icon} onChange={(name) => onUpdate("icon", name)} /></section>}
          <VisualDesigner type={item.type} design={item.design} onChange={(design) => onUpdate("design", design)} onActivate={onActivateVisualDesigner} onDisable={onDisableVisualDesigner} oneFaceArtwork={item.type === "diceSkins" ? <ShopArtworkEditor item={item} onUpdate={onUpdate} disabled={saving} fields={["oneImage"]}/> : undefined}/>
        </>}

        {section === "motion" && <MotionDesigner motion={item.motion} onChange={(motion) => onUpdate("motion", motion)} />}

        {section === "advanced" && <>
          <section className="admin-form-section shop-studio-section shop-css-section"><div className="admin-form-section-title"><Settings /><div><h3>{localeText("CSS avancé")}</h3><p>{localeText("Déclarations supplémentaires limitées à cet objet.")}</p></div></div><GuidedCssEditor value={item.css ?? ""} onChange={(css) => onUpdate("css", css)} />{(item.design || item.motion) && <details className="generated-css-panel"><summary>{localeText("Voir le CSS généré par les studios")}</summary><CodeEditor language="css" label={localeText("CSS généré")} height={320} readOnly value={[visualDesignCssRules(item.value ? item : { ...item, value: "admin-preview" }), cosmeticMotionCssRules(item.value ? item : { ...item, value: "admin-preview" })].filter(Boolean).join("\n")}/></details>}<label>{item.design ? localeText("Surcharges CSS") : localeText("CSS de l’élément")}<CodeEditor language="css-declarations" label={localeText("CSS de l’élément")} height={380} value={item.css ?? ""} onChange={value => onUpdate("css", value)}/></label></section>
        </>}
      </div>
      <aside className="shop-studio-preview-column">
        <div className="shop-studio-controls" aria-label={localeText("Actions de l’objet")}>
          <button type="submit" disabled={saving}><Save size={18} /> {saving ? localeText("Enregistrement…") : localeText("Enregistrer")}</button>
          {kind === "shop" && <button type="button" className="secondary" onClick={onDuplicate}><Copy size={18} />{" " + localeText("Dupliquer")}</button>}
          {kind === "shop" && <button type="button" className="danger-button" onClick={onDelete}><Trash2 size={18} />{" " + localeText("Supprimer")}</button>}
          <button type="button" className="secondary" onClick={onCancel}><X size={18} />{" " + localeText("Annuler")}</button>
        </div>
        <CosmeticPreview user={user} item={item} />
      </aside>
    </div>
  </>;
}
