import { useMemo, useState } from "react";
import { BadgeCheck, Check, Gamepad2, Package, Search } from "lucide-react";
import { Dialog } from "../common/Dialog.jsx";
import { Pagination } from "../feedback/Feedback.jsx";
import { usePagination } from "../common/usePagination.js";
import { CosmeticIcon, CosmeticPreview, shopTypeLabel } from "../cosmetics/Cosmetics.jsx";
import "./achievement-picker.css";

const previewUser = { pseudo: "Joueur", profile: {}, cosmetics: { equipped: {} } };

export function itemChoices(shop) {
  return shop.map((item) => ({ value: item.id, label: item.name, description: item.description, category: shopTypeLabel(item.type), item }));
}

function ChoiceIcon({ choice }) {
  if (choice.item?.type === "icons") return <CosmeticIcon value={choice.item.value} source={choice.item.icon} />;
  const Icon = choice.item ? Package : choice.kind === "achievement" ? BadgeCheck : Gamepad2;
  return <Icon size={22} />;
}

export function AchievementValuePicker({ choices, value, multiple = false, onChange, label = "Choisir les elements", allowEmpty = false }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [focused, setFocused] = useState(null);
  const selected = (Array.isArray(value) ? value : value ? [value] : []).map(String);
  const options = useMemo(() => {
    const missing = [...new Set([...selected, ...draft])].filter((id) => !choices.some((choice) => choice.value === id));
    return [...choices, ...missing.map((id) => ({ value: id, label: id, category: "Hors catalogue" }))];
  }, [choices, value, draft]);
  const categories = [...new Set(options.map((option) => option.category).filter(Boolean))];
  const rows = options.filter((option) => (!category || option.category === category) && `${option.label} ${option.description ?? ""} ${option.value}`.toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr")));
  const pages = usePagination(rows, `${search}:${category}`, 12);
  const preview = options.find((choice) => choice.value === focused);
  const names = selected.map((id) => options.find((option) => option.value === id)?.label ?? id);
  function toggle(id) {
    setFocused(id);
    setDraft((current) => current.includes(id) ? current.filter((entry) => entry !== id) : multiple ? [...current, id] : [id]);
  }
  return <>
    <button type="button" className="secondary achievement-picker-trigger" aria-label={label} onClick={() => { setDraft(multiple ? selected : selected.slice(0, 1)); setFocused(selected[0] ?? null); setSearch(""); setCategory(""); setOpen(true); }}>
      <Search size={16} /><span>{names.length ? names.slice(0, 2).join(", ") + (names.length > 2 ? ` (+${names.length - 2})` : "") : label}</span>
    </button>
    {open && <Dialog title={label} className="achievement-picker" layerClassName="achievement-picker-layer" onClose={() => setOpen(false)}>
      <div className="achievement-picker-filters"><label>Rechercher<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, description ou identifiant" /></label><label>Categorie<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Toutes</option>{categories.map((name) => <option key={name}>{name}</option>)}</select></label></div>
      <div className="achievement-picker-body">
        <div ref={pages.anchor}>
          <div className="achievement-picker-grid">{pages.rows.map((choice) => <button key={choice.value} type="button" className={`secondary achievement-picker-option ${draft.includes(choice.value) ? "selected" : ""}`} aria-pressed={draft.includes(choice.value)} onClick={() => toggle(choice.value)}>
            <span className="achievement-picker-symbol"><ChoiceIcon choice={choice} />{draft.includes(choice.value) && <Check size={17} />}</span><strong>{choice.label}</strong><small>{choice.category}</small>{choice.description && <span className="achievement-picker-description">{choice.description}</span>}
          </button>)}</div>
          <Pagination {...pages} pageSizes={[12, 24, 48]} label="Pages des elements a choisir" />
        </div>
        {preview && <aside className="achievement-picker-preview">{preview.item ? <CosmeticPreview user={previewUser} item={preview.item} /> : <><ChoiceIcon choice={preview} /><h3>{preview.label}</h3><p>{preview.description}</p><small>{preview.category}</small></>}</aside>}
      </div>
      <footer className="achievement-picker-footer"><span role="status">{draft.length} selectionne{draft.length > 1 ? "s" : ""}</span><div className="actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Annuler</button>{allowEmpty && <button type="button" className="secondary" onClick={() => setDraft([])}>Aucune condition</button>}<button type="button" disabled={!allowEmpty && !draft.length} onClick={() => { onChange(multiple ? draft : draft[0] ?? ""); setOpen(false); }}><Check size={16} /> Appliquer la selection</button></div></footer>
    </Dialog>}
  </>;
}
