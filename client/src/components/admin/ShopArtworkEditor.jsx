import { useState } from "react";
import { ImagePlus, Images, Pencil, Trash2 } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { API_URL } from "../../api.js";
import { cosmeticImage } from "../../utils/cosmetic-images.js";
import { defaultVisualDesign, visualDesignerTypes } from "../cosmetics/Cosmetics.jsx";
import { GameImageEditor } from "./GameImageEditor.jsx";
import { MediaPicker } from "./MediaLibrary.jsx";
import "./shop-artwork-editor.css";

export function ShopArtworkEditor({ item, onUpdate, disabled, fields }) {
  const { t } = useLocale();
  const [editing, setEditing] = useState(null), [picking, setPicking] = useState(null);
  const supported = item.type === "icons" || visualDesignerTypes.has(item.type);
  if (!supported) return null;
  const icon = item.type === "icons";
  const design = { ...defaultVisualDesign(item.type), ...item.design };
  const availableSlots = icon ? [["icon", "Image de l’icône"]] : item.type === "cardSkins" ? [["faceImage", "Face des cartes"], ["backImage", "Dos des cartes"]] : [["surfaceImage", "Image de fond"], ...(item.type === "diceSkins" && design.oneEnabled ? [["oneImage", "Image de la face 1"]] : [])];
  const slots = fields ? availableSlots.filter(([field]) => fields.includes(field)) : availableSlots;
  function setImage(field, image) {
    if (icon) onUpdate("icon", image);
    else {
      if (image && item.css && field !== "oneImage") {
        const style = document.createElement("span").style;
        style.cssText = item.css;
        for (const property of ["background-image", "background-size", "background-position", "background-repeat"]) style.removeProperty(property);
        onUpdate("css", style.cssText);
      }
      onUpdate("design", { ...design, [field]: image });
    }
  }
  return <section className="admin-form-section shop-artwork-editor">
    <div className="admin-form-section-title"><Images/><div><h3>{t("Images et textures")}</h3></div></div>
    <div className="shop-artwork-slots">{slots.map(([field, label]) => {
      const image = cosmeticImage(icon ? item.icon : design[field]);
      return <div key={field} className="shop-artwork-slot"><strong>{t(label)}</strong><div className="shop-artwork-sample">{image ? <img src={`${API_URL}${image}`} alt={t(label)} style={{ objectFit: icon ? "contain" : design.imageFit, objectPosition: `${design.imagePositionX}% ${design.imagePositionY}%` }}/> : <ImagePlus size={32}/>}</div><div className="shop-artwork-actions"><button type="button" className="secondary" disabled={disabled} onClick={() => setEditing({ field, label, image })}><ImagePlus size={17}/>{t("Importer une image")}</button><button type="button" className="secondary" disabled={disabled} onClick={() => setPicking(field)} title={t("Médiathèque")} aria-label={`${t("Médiathèque")} · ${t(label)}`}><Images size={17}/></button>{image && <><button type="button" className="secondary" disabled={disabled} title={t("Recadrer")} aria-label={`${t("Recadrer")} · ${t(label)}`} onClick={() => setEditing({ field, label, image })}><Pencil size={17}/></button><button type="button" className="secondary danger-icon" disabled={disabled} title={t("Retirer l’image")} aria-label={`${t("Retirer l’image")} · ${t(label)}`} onClick={() => setImage(field, "")}><Trash2 size={17}/></button></>}</div></div>;
    })}</div>
    {!icon && slots.some(([field]) => cosmeticImage(design[field])) && <div className="admin-field-grid"><label>{t("Affichage de l’image")}<select disabled={disabled} value={design.imageFit} onChange={event => onUpdate("design", { ...design, imageFit: event.target.value })}><option value="cover">{t("Remplir")}</option><option value="contain">{t("Image entière")}</option></select></label>{["X", "Y"].map(axis => <label key={axis}>{t(axis === "X" ? "Position horizontale" : "Position verticale")}<input type="range" min={0} max={100} value={design[`imagePosition${axis}`]} disabled={disabled} onChange={event => onUpdate("design", { ...design, [`imagePosition${axis}`]: Number(event.target.value) })}/></label>)}</div>}
    {editing && <GameImageEditor gameName={item.name || t("Nouvel élément")} imageLabel={t(editing.label)} value={editing.image} selectableFormat uploadPath="/api/admin/media" onClose={() => setEditing(null)} onApply={image => { setImage(editing.field, image); setEditing(null); }} />}
    {picking && <MediaPicker onClose={() => setPicking(null)} onSelect={row => { setImage(picking, row.image); setPicking(null); }} />}
  </section>;
}
