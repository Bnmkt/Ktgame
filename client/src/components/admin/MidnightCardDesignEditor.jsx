import { useState } from "react";
import { ImagePlus, Images, RotateCcw, ZoomIn } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { defaultMidnightCardDesign, defaultMidnightCharacters, midnightFonts, normalizeMidnightArtwork } from "../../features/games/midnightDice/appearance.js";
import { MidnightContractCard } from "../game/MidnightContractCard.jsx";
import { Dialog } from "../common/Dialog.jsx";
import { MediaPicker } from "./MediaLibrary.jsx";
import { GameImageEditor } from "./GameImageEditor.jsx";
import "./midnight-card-design-editor.css";

export function MidnightImageField({ label, value = "", onChange, character = false }) {
  const { t } = useLocale();
  const [editing, setEditing] = useState(false), [picking, setPicking] = useState(false);
  return <div className="midnight-image-setting"><label>{t(label)}<input aria-label={t(label)} maxLength={2048} value={value} placeholder="/api/media/… ou https://…" onChange={event => onChange(event.target.value)}/></label><div className="midnight-design-actions"><button type="button" className="secondary" onClick={() => setEditing(true)}><ImagePlus size={15}/>{t("Importer une image")}</button><button type="button" className="secondary" onClick={() => setPicking(true)}><Images size={15}/>{t("Médiathèque")}</button><button type="button" className="secondary" disabled={!value} onClick={() => onChange("")}>{t("Retirer l’image")}</button></div>
    {editing && <GameImageEditor gameName="Midnight Dice" imageLabel={t(label)} value={value} uploadPath="/api/admin/media" selectableFormat={character} fixedFormat={character ? undefined : { width: 880, height: 630 }} onClose={() => setEditing(false)} onApply={image => { onChange(image); setEditing(false); }}/>} {picking && <MediaPicker onClose={() => setPicking(false)} onSelect={row => { onChange(row.image); setPicking(false); }}/>}</div>;
}

function CardPreview({ definition, design, editable = false, onArtworkChange }) {
  const { t } = useLocale();
  const [back, setBack] = useState(false), [large, setLarge] = useState(false);
  return <div className="midnight-design-preview"><div className="midnight-design-actions"><button type="button" className="secondary" aria-pressed={!back} onClick={() => setBack(false)}>{t("Recto")}</button><button type="button" className="secondary" aria-pressed={back} onClick={() => setBack(true)}>{t("Verso")}</button><button type="button" className="secondary" onClick={() => setLarge(true)}><ZoomIn size={15}/>{t("Agrandir la carte")}</button></div>
    <MidnightContractCard definition={definition} design={design} hidden={back} interactiveArtwork={editable} onArtworkChange={onArtworkChange}/>
    {large && <Dialog title={t("Aperçu de la carte Mandat")} className="midnight-card-expanded" onClose={() => setLarge(false)}><MidnightContractCard definition={definition} design={design} hidden={back} interactiveArtwork={editable} onArtworkChange={onArtworkChange}/>{!back && <p>{definition?.hint}</p>}</Dialog>}
  </div>;
}

export function MidnightArtworkEditor({ definition, design, onChange }) {
  const { t } = useLocale();
  let artwork;
  artwork = { ...normalizeMidnightArtwork(), ...(definition.artwork ?? { image: defaultMidnightCharacters[definition.id] ?? defaultMidnightCharacters.balance }) };
  const update = patch => onChange({ ...artwork, ...patch });
  return <details className="midnight-artwork-settings" open><summary>{t("Personnage et aperçu du mandat")}</summary><p>{t("Déplace le personnage dans l’aperçu. Utilise sa poignée pour changer son échelle.")}</p>
    <MidnightImageField label="Illustration du personnage" value={artwork.image} character onChange={image => update({ image })}/>
    <div className="midnight-design-grid">{[["x", "Position horizontale (%)", -100, 100, .01], ["y", "Position verticale (%)", -100, 100, .01], ["scale", "Échelle du personnage", .15, 4, .01], ["layer", "Ordre de superposition", 0, 10, 1]].map(([key, label, min, max, step]) => <label key={key}>{t(label)}<input aria-label={t(label)} type="number" min={min} max={max} step={step} value={artwork[key]} onChange={event => update({ [key]: event.target.value === "" ? "" : Number(event.target.value) })}/></label>)}</div>
    <button type="button" className="secondary" onClick={() => onChange({ ...normalizeMidnightArtwork(), image: artwork.image })}><RotateCcw size={15}/>{t("Réinitialiser le positionnement")}</button>
    <CardPreview definition={definition} design={design} editable onArtworkChange={onChange}/>
  </details>;
}

export function MidnightCardDesignEditor({ value, definitions, onChange }) {
  const { t } = useLocale();
  const design = { ...defaultMidnightCardDesign, ...value, zones: { ...defaultMidnightCardDesign.zones, ...value?.zones } };
  const [selected, setSelected] = useState(definitions[0]?.id), [zoneId, setZoneId] = useState("title");
  const definition = definitions.find(entry => entry.id === selected) ?? definitions[0], zone = design.zones[zoneId];
  const update = patch => onChange({ ...design, ...patch });
  const updateZone = patch => update({ zones: { ...design.zones, [zoneId]: { ...zone, ...patch } } });
  const labels = { title: "Nom du mandat", tier: "Palier du mandat", bonus: "Prime du mandat", condition: "Condition", examples: "Exemples" };
  return <section className="midnight-design-settings"><header><h3>{t("Apparence des cartes Mandat")}</h3><p>{t("Les modèles d’image contiennent les cadres. Ces réglages positionnent uniquement les textes et les exemples.")}</p></header>
    <MidnightImageField label="Modèle du recto des mandats" value={design.frontImage} onChange={frontImage => update({ frontImage, sectionLabels: !frontImage || frontImage === defaultMidnightCardDesign.frontImage })}/><MidnightImageField label="Verso commun des mandats" value={design.backImage} onChange={backImage => update({ backImage })}/>
    <label className="midnight-design-label-toggle"><input type="checkbox" checked={design.sectionLabels} onChange={event => update({ sectionLabels: event.target.checked })}/>{t("Afficher les libellés Condition et Exemples (si absents du modèle)")}</label>
    <div className="midnight-design-grid">{[["headingFont", "Police des titres"], ["bodyFont", "Police des conditions"]].map(([key, label]) => <label key={key}>{t(label)}<select aria-label={t(label)} value={design[key]} onChange={event => update({ [key]: event.target.value })}>{Object.entries(midnightFonts).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>)}<label>{t("Marge intérieure du texte")}<input aria-label={t("Marge intérieure du texte")} type="number" min={0} max={10} step={.5} value={design.padding} onChange={event => update({ padding: Number(event.target.value) })}/></label><label>{t("Espacement des exemples (%)")}<input aria-label={t("Espacement des exemples (%)")} type="number" min={0} max={15} step={.5} value={design.exampleGap} onChange={event => update({ exampleGap: Number(event.target.value) })}/></label></div>
    <label>{t("Zone de la carte")}<select aria-label={t("Zone de la carte")} value={zoneId} onChange={event => setZoneId(event.target.value)}>{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}</select></label>
    <div className="midnight-design-grid">{[["x", "Position X (%)"], ["y", "Position Y (%)"], ["width", "Largeur maximale (%)"], ["height", "Hauteur maximale (%)"], ["fontSize", "Police maximale (% de la largeur)"], ["minFontSize", "Police minimale (% de la largeur)"]].map(([key, label]) => <label key={key}>{t(label)}<input aria-label={t(label)} type="number" min={0} max={100} step={.1} value={zone[key]} onChange={event => updateZone({ [key]: Number(event.target.value) })}/></label>)}<label>{t("Couleur du texte")}<input aria-label={t("Couleur du texte")} type="color" value={zone.color} onChange={event => updateZone({ color: event.target.value })}/></label></div>
    <label>{t("Mandat de l’aperçu")}<select aria-label={t("Mandat de l’aperçu")} value={definition?.id} onChange={event => setSelected(event.target.value)}>{definitions.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label><CardPreview definition={definition} design={design}/>
  </section>;
}
