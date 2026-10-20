import { useLocale } from "../../locales/LocaleProvider.jsx";
import { useEffect, useRef, useState } from "react";
import { Check, Image as ImageIcon, Upload } from "lucide-react";
import { CropTools } from "../common/CropTools.jsx";
import { cropImageStyle, transformedImageSize } from "../../features/games/image-transform.js";
import { api, API_URL } from "../../api.js";
import { Dialog } from "../common/Dialog.jsx";
import { artworkCropBounds, encodeArtworkCrop, gameArtworkFormats } from "../../features/games/artwork-crop.js";
import { gameImageUrl } from "../../features/games/presentation.js";
import "./game-image-editor.css";
import { MediaPicker } from "./MediaLibrary.jsx";

const centered = { zoom: 1, x: 0.5, y: 0.5 };

export function GameImageEditor({ gameId, gameName, field, value, onApply, onClose, uploadPath, imageLabel, selectableFormat = false, fixedFormat, allowAnimation = true }) {
  const { t: localeText } = useLocale();
  const [size, setSize] = useState({ width: 1024, height: 1024 }), [mime, setMime] = useState("image/png"), [libraryOpen, setLibraryOpen] = useState(false);
  const format = fixedFormat ? { ...fixedFormat, label: imageLabel || "Image" } : selectableFormat ? { ...size, label: imageLabel || "Image" } : imageLabel ? { ...gameArtworkFormats[field], label: imageLabel } : gameArtworkFormats[field];
  const [source, setSource] = useState(null), [crop, setCrop] = useState(centered);
  const [grid, setGrid] = useState(true);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const mediaUpload = uploadPath === "/api/admin/media";
  const [mediaMaxMb, setMediaMaxMb] = useState(null);
  const awaitingMediaLimit = mediaUpload && mediaMaxMb === null;
  useEffect(() => {
    if (!mediaUpload) return;
    let active = true;
    api("/api/admin/media/limits").then(result => { if (active) setMediaMaxMb(result.maxMb); }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [mediaUpload]);
  const input = useRef(null), sourceUrl = useRef(""), generation = useRef(0), drag = useRef(null);
  useEffect(() => () => { generation.current++; if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current); }, []);

  async function loadSource(file, request) {
    if (!file) return;
    if (awaitingMediaLimit) { setLoading(false); return; }
    if (!allowAnimation && file.type === "image/gif") { setError("Choisis une image fixe pour cette icône."); setLoading(false); return; }
    request ??= ++generation.current;
    setError(""); setLoading(false);
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > (mediaUpload ? mediaMaxMb : file.type === "image/gif" ? 3 : 10) * 1024 * 1024) {
      setError(mediaUpload ? localeText("PNG, JPEG, WebP ou GIF : {value0} Mo maximum.", { value0: mediaMaxMb }) : "PNG, JPEG ou WebP : 10 Mo maximum. GIF animé : 3 Mo maximum."); return;
    }
    setLoading(true);
    const url = URL.createObjectURL(file), image = new window.Image();
    try {
      image.src = url; await image.decode();
      if (image.naturalWidth * image.naturalHeight > 32000000 || Math.max(image.naturalWidth, image.naturalHeight) > 8192) throw new Error("L’image dépasse 32 millions de pixels ou 8 192 pixels de côté.");
      if (request !== generation.current) { URL.revokeObjectURL(url); return; }
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
      sourceUrl.current = url;
      setSource({ url, image, file, animated: file.type === "image/gif", width: image.naturalWidth, height: image.naturalHeight }); setCrop(centered);
      if (selectableFormat) { const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight)); setSize({ width: Math.max(1, Math.round(image.naturalWidth * scale)), height: Math.max(1, Math.round(image.naturalHeight * scale)) }); }
    } catch (failure) {
      URL.revokeObjectURL(url);
      if (request === generation.current) setError(failure.message || "L’image ne peut pas être ouverte.");
    } finally { if (request === generation.current) setLoading(false); }
  }

  useEffect(() => {
    const url = gameImageUrl(value);
    if (!url) return;
    const request = ++generation.current;
    const controller = new AbortController();
    setLoading(true);
    fetch(url.startsWith("/api/") ? `${API_URL}${url}` : url, { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer" })
      .then(async (response) => { if (!response.ok) throw new Error("Image indisponible."); const blob = await response.blob(); if (request === generation.current) await loadSource(blob, request); })
      .catch(() => { if (request === generation.current) setError("L’image actuelle n’est pas accessible au recadrage. Importe le fichier depuis ton appareil."); })
      .finally(() => { if (request === generation.current) setLoading(false); });
    return () => controller.abort();
  }, [value, mediaMaxMb]);

  const bounds = source ? artworkCropBounds(source.width, source.height, crop, format.width / format.height) : null;
  const imageStyle = bounds ? cropImageStyle(source.width, source.height, crop, bounds) : null;
  const transformedSize = source ? transformedImageSize(source.width, source.height, crop) : null;
  const update = (next) => setCrop((previous) => ({ ...previous, ...next }));
  function move(event) {
    if (!drag.current || busy || loading || source?.animated) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
    drag.current = { x: event.clientX, y: event.clientY };
    setCrop((previous) => {
      const current = artworkCropBounds(source.width, source.height, previous, format.width / format.height);
      return { ...previous, ...current, x: current.x - dx / rect.width * current.width / transformedSize.width, y: current.y - dy / rect.height * current.height / transformedSize.height };
    });
  }
  function nudge(event) {
    const direction = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
    if (!direction || busy || loading || source?.animated) return;
    event.preventDefault();
    update({ x: bounds.x + direction[0] * bounds.width / transformedSize.width * 0.02, y: bounds.y + direction[1] * bounds.height / transformedSize.height * 0.02 });
  }
  async function apply() {
    if (!source || busy || loading || mediaUpload && mediaMaxMb === null) return;
    setBusy(true); setError("");
    try {
      const blob = source.animated ? source.file : await encodeArtworkCrop(source.image, crop, format, selectableFormat ? mime : "image/png", (mediaUpload ? mediaMaxMb : 3) * 1024 * 1024);
      if (mediaUpload && blob.size > mediaMaxMb * 1024 * 1024) throw new Error(localeText("L’image recadrée dépasse {value0} Mo. Réduis ses dimensions ou change son format.", { value0: mediaMaxMb }));
      const result = await api(uploadPath ?? `/api/admin/games/${encodeURIComponent(gameId)}/images/${field}`, { method: "POST", body: blob, headers: { "Content-Type": blob.type }, deduplicate: false });
      onApply(result.image);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <Dialog title={`${localeText(format.label)} · ${gameName}`} className="game-art-editor" layerClassName="game-art-layer" onClose={onClose} dismissible={!busy}>
    <div className="game-art-editor-body">
      <input ref={input} className="game-art-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label={imageLabel ? localeText("Importer une image") : localeText("Importer une image du jeu")} disabled={busy || mediaUpload && mediaMaxMb === null} onChange={(event) => { loadSource(event.target.files?.[0]); event.target.value = ""; }} />
      {mediaUpload && <p className="muted" role="status">{mediaMaxMb === null ? localeText("Chargement…") : localeText("PNG, JPEG, WebP ou GIF : {value0} Mo maximum.", { value0: mediaMaxMb })}</p>}
      <div className="game-art-tools"><button type="button" className="secondary" disabled={busy || awaitingMediaLimit} onClick={() => input.current.click()}><Upload size={18} />{source ? localeText("Changer l’image") : localeText("Importer une image")}</button><button type="button" className="secondary" disabled={busy || awaitingMediaLimit} onClick={() => setLibraryOpen(true)}><ImageIcon size={18}/>{localeText("Médiathèque")}</button><span>{format.width} × {format.height}{" " + localeText("px")}</span></div>
      {selectableFormat && <div className="media-crop-options"><label>{localeText("Proportions")}<select disabled={busy || source?.animated} value="" onChange={event => { const [width, height] = event.target.value.split(":").map(Number); if (width && height) setSize({ width: 1200, height: Math.round(1200 * height / width) }); }}><option value="">{localeText("Personnalisées")}</option>{["1:1", "4:3", "16:9", "16:7", "3:4", "2:3"].map(ratio => <option key={ratio}>{ratio}</option>)}</select></label>{["width", "height"].map(key => <label key={key}>{localeText(key === "width" ? "Largeur" : "Hauteur")}<input type="number" min={1} max={4096} disabled={busy || source?.animated} value={size[key]} onChange={event => setSize(current => ({ ...current, [key]: Math.max(1, Math.min(4096, Number(event.target.value) || 1)) }))}/></label>)}<label>{localeText("Format du fichier")}<select disabled={busy || source?.animated} value={mime} onChange={event => setMime(event.target.value)}><option value="image/png">PNG</option><option value="image/webp">WebP</option><option value="image/jpeg">JPEG</option></select></label></div>}
      {source?.animated ? <p className="muted">{localeText("Le GIF est conservé avec son animation, ses dimensions et ses éventuelles métadonnées.")}</p> : <p className="muted">{localeText(mime === "image/jpeg" && selectableFormat ? "JPEG : la transparence est remplacée par un fond blanc." : "PNG et WebP conservent la transparence.")}</p>}
      {loading && <p role="status">{localeText("Chargement de l’image…")}</p>}
      {source ? <div className="game-art-workspace">
        <div>
          <div className="game-art-crop" style={{ aspectRatio: `${format.width} / ${format.height}` }} tabIndex={0} role="group" aria-label={localeText("Zone de recadrage")} onKeyDown={nudge} onPointerDown={(event) => {
            if (busy || loading || source.animated || event.button !== 0) return;
            event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY };
          }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
            <img src={source.url} alt="Image à recadrer" draggable={false} style={imageStyle} />
            {grid && !source.animated && <span className="crop-grid-overlay"/>}
          </div>
          <label className="game-art-zoom">{localeText("Zoom") + " "}<output>{bounds.zoom.toFixed(2)} ×</output><input type="range" min={0.5} max={5} step={0.01} value={bounds.zoom} aria-label={localeText("Zoom du recadrage")} disabled={busy || loading || source.animated} onChange={(event) => update({ ...bounds, zoom: Number(event.target.value) })} /></label>
          {!source.animated && <CropTools crop={crop} onChange={update} onReset={() => setCrop(centered)} disabled={busy || loading} grid={grid} onGridChange={setGrid}/>}
        </div>
        <aside className="game-art-preview"><span className="eyebrow">{localeText("Aperçu")}</span><div style={{ aspectRatio: `${format.width} / ${format.height}` }}><img src={source.url} alt="Aperçu du recadrage" style={imageStyle} /></div><strong>{gameName}</strong></aside>
      </div> : !loading && <div className="game-art-empty"><ImageIcon size={44} /><span>{localeText(format.label)}</span></div>}
      {error && <p className="error" role="alert">{localeText(error)}</p>}
    </div>
    <div className="game-art-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>{localeText("Annuler")}</button><button type="button" disabled={!source || busy || loading} onClick={apply}><Check size={17} />{busy ? localeText("Enregistrement…") : source?.animated ? localeText("Importer le GIF animé") : localeText("Appliquer le recadrage")}</button></div>
    {libraryOpen && <MediaPicker onClose={() => setLibraryOpen(false)} onSelect={async row => { setLibraryOpen(false); const request = ++generation.current; setLoading(true); try { const response = await fetch(`${API_URL}${row.image}`, { credentials: "omit" }); if (!response.ok) throw new Error("Image indisponible."); await loadSource(await response.blob(), request); } catch (failure) { if (request === generation.current) { setError(failure.message); setLoading(false); } } }}/>}
  </Dialog>;
}
