import { useEffect, useRef, useState } from "react";
import { Check, Image as ImageIcon, RotateCcw, Upload } from "lucide-react";
import { api, API_URL } from "../../api.js";
import { Dialog } from "../common/Dialog.jsx";
import { LucideIconPicker } from "../cosmetics/Cosmetics.jsx";
import { RankInsignia } from "../../features/games/RankInsignia.jsx";
import { encodeInsigniaCrop, insigniaCropBounds } from "../../features/games/insignia-crop.js";

const centered = { zoom: 1, x: 0.5, y: 0.5 };

export function RankInsigniaEditor({ rank, division = "", references = [], onApply, onClose, onInherit }) {
  const [tab, setTab] = useState("image");
  const [icon, setIcon] = useState(rank.insignia || "shield");
  const [source, setSource] = useState(null);
  const [crop, setCrop] = useState(centered);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hiddenReferences, setHiddenReferences] = useState([]);
  const input = useRef(null), drag = useRef(null), generation = useRef(0), sourceUrl = useRef("");
  useEffect(() => () => { generation.current++; if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current); }, []);

  async function loadSource(file) {
    if (!file) return;
    const request = ++generation.current;
    setError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError("Choisis une image PNG, JPEG ou WebP de 10 Mo maximum.");
      return;
    }
    setLoading(true);
    const url = URL.createObjectURL(file), image = new window.Image();
    try {
      image.src = url;
      await image.decode();
      if (image.naturalWidth * image.naturalHeight > 32000000 || Math.max(image.naturalWidth, image.naturalHeight) > 8192) throw new Error("L’image dépasse 32 millions de pixels ou 8 192 pixels de côté.");
      if (request !== generation.current) { URL.revokeObjectURL(url); return; }
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
      sourceUrl.current = url;
      setSource({ url, image, width: image.naturalWidth, height: image.naturalHeight });
      setCrop(centered);
    } catch (failure) {
      URL.revokeObjectURL(url);
      if (request === generation.current) setError(failure.message || "L’image ne peut pas être ouverte.");
    } finally { if (request === generation.current) setLoading(false); }
  }

  async function editExisting() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API_URL}/api/ranked/insignia-images/${rank.insigniaImage}`);
      if (!response.ok) throw new Error("L’image de l’insigne est introuvable.");
      await loadSource(await response.blob());
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }

  const bounds = source ? insigniaCropBounds(source.width, source.height, crop) : null;
  const imageStyle = bounds ? {
    width: `${source.width / bounds.side * 100}%`, height: `${source.height / bounds.side * 100}%`,
    left: `${50 - bounds.x * source.width / bounds.side * 100}%`, top: `${50 - bounds.y * source.height / bounds.side * 100}%`
  } : null;
  function updateCrop(next) {
    setCrop((previous) => insigniaCropBounds(source.width, source.height, { ...previous, ...next }));
  }
  function move(event) {
    if (!drag.current || busy) return;
    const width = event.currentTarget.getBoundingClientRect().width;
    const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
    drag.current = { x: event.clientX, y: event.clientY };
    setCrop((previous) => {
      const current = insigniaCropBounds(source.width, source.height, previous);
      return insigniaCropBounds(source.width, source.height, { ...current, x: current.x - dx / width * current.side / source.width, y: current.y - dy / width * current.side / source.height });
    });
  }
  function nudge(event) {
    if (busy) return;
    const directions = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    updateCrop({ x: bounds.x + direction[0] * bounds.side / source.width * 0.02, y: bounds.y + direction[1] * bounds.side / source.height * 0.02 });
  }
  async function apply() {
    setBusy(true); setError("");
    try {
      let insigniaImage = tab === "image" ? rank.insigniaImage || "" : "";
      if (tab === "image" && source) {
        const blob = await encodeInsigniaCrop(source.image, crop);
        const result = await api("/api/admin/ranked/insignia-images", { method: "POST", body: blob, headers: { "Content-Type": "image/png" }, deduplicate: false });
        insigniaImage = result.id;
      }
      onApply({ insignia: icon, insigniaImage });
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <Dialog title={`Insigne · ${rank.name}${division ? ` ${division}` : ""}`} className="ranked-insignia-dialog" onClose={onClose} dismissible={!busy && !loading}>
    {division && <button type="button" className="secondary ranked-inherit-insignia" disabled={busy || loading} onClick={onInherit}><RotateCcw size={17}/>Utiliser l’insigne commun</button>}
    <div className="ranked-mode-tabs" role="group" aria-label="Type d’insigne">{[["image", "Image"], ["icon", "Icône"]].map(([id, label]) => <button key={id} type="button" className={tab === id ? "active" : "secondary"} aria-pressed={tab === id} disabled={busy || loading} onClick={() => { setTab(id); setError(""); }}>{label}</button>)}</div>
    {tab === "image" ? <>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Image de l’insigne" className="ranked-image-input" disabled={busy || loading} onChange={(event) => { loadSource(event.target.files?.[0]); event.target.value = ""; }} />
      <div className="ranked-image-tools"><button type="button" className="secondary" disabled={busy || loading} onClick={() => input.current.click()}><Upload size={18}/>{source || rank.insigniaImage ? "Remplacer l’image" : "Importer une image"}</button>{rank.insigniaImage && !source && <button type="button" className="secondary" disabled={busy || loading} onClick={editExisting}><ImageIcon size={18}/>Recadrer</button>}</div>
      {loading && <p role="status">Chargement de l’image…</p>}
      <div className="ranked-image-workspace">
        {source ? <div>
          <div className="ranked-crop-stage" tabIndex={0} role="group" aria-label="Zone de recadrage" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" onKeyDown={nudge} onPointerDown={(event) => {
            if (busy || event.button !== 0) return;
            event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY };
          }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
            <img src={source.url} alt="Image à recadrer" draggable={false} style={imageStyle}/>
            {references.filter((reference)=>!hiddenReferences.includes(reference.division)).map((reference)=><div key={reference.division} className="ranked-crop-reference"><RankInsignia rank={reference.rank}/></div>)}
          </div>
          <label className="ranked-crop-zoom">Zoom <output>{bounds.zoom.toFixed(2)} ×</output><input type="range" min={0.25} max={5} step={0.05} value={bounds.zoom} aria-label="Zoom du recadrage" disabled={busy} onChange={(event) => updateCrop({ zoom: Number(event.target.value) })}/></label>
          <button type="button" className="secondary" disabled={busy} onClick={() => updateCrop({ x: 0.5, y: 0.5 })}><RotateCcw size={17}/>Recentrer</button>
        </div> : <div className="ranked-image-empty">{rank.insigniaImage ? <RankInsignia rank={rank}/> : <ImageIcon size={64}/>}</div>}
        <div className="ranked-image-preview"><span className="eyebrow">Aperçu</span>{source ? <div className="ranked-crop-thumbnail"><img src={source.url} alt="Aperçu de l’insigne recadré" style={imageStyle}/></div> : <RankInsignia rank={rank}/>}<div><strong>{rank.name}</strong><small>{division ? `Division ${division}` : "Insigne commun"}</small></div></div>
      </div>
      {source && references.length>0 && <fieldset className="ranked-crop-references"><legend>Repères de division</legend>{references.map((reference)=><label key={reference.division}><input type="checkbox" disabled={busy} checked={!hiddenReferences.includes(reference.division)} onChange={(event)=>setHiddenReferences((previous)=>event.target.checked?previous.filter((value)=>value!==reference.division):[...previous,reference.division])}/><RankInsignia rank={reference.rank}/>{rank.name} {reference.division}</label>)}</fieldset>}
    </> : <><div className="ranked-insignia-preview"><RankInsignia rank={{ ...rank, insignia: icon, insigniaImage: "" }}/><strong>{rank.name}</strong></div><LucideIconPicker value={icon} onChange={setIcon}/></>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="ranked-insignia-actions"><button type="button" className="secondary" disabled={busy || loading} onClick={onClose}>Annuler</button><button type="button" disabled={busy || loading || tab === "image" && !source && !rank.insigniaImage} onClick={apply}><Check size={17}/>{busy ? "Enregistrement…" : "Appliquer"}</button></div>
  </Dialog>;
}
