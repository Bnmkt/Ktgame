import { useEffect, useRef, useState } from "react";
import { Check, Image as ImageIcon, RotateCcw, Upload } from "lucide-react";
import { api, API_URL } from "../../api.js";
import { Dialog } from "../common/Dialog.jsx";
import { artworkCropBounds, encodeArtworkCrop, gameArtworkFormats } from "../../features/games/artwork-crop.js";
import { gameImageUrl } from "../../features/games/presentation.js";
import "./game-image-editor.css";

const centered = { zoom: 1, x: 0.5, y: 0.5 };

export function GameImageEditor({ gameId, gameName, field, value, onApply, onClose }) {
  const format = gameArtworkFormats[field];
  const [source, setSource] = useState(null), [crop, setCrop] = useState(centered);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const input = useRef(null), sourceUrl = useRef(""), generation = useRef(0), drag = useRef(null);
  useEffect(() => () => { generation.current++; if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current); }, []);

  async function loadSource(file, request) {
    if (!file) return;
    request ??= ++generation.current;
    setError(""); setLoading(false);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError("Choisis une image PNG, JPEG ou WebP de 10 Mo maximum."); return;
    }
    setLoading(true);
    const url = URL.createObjectURL(file), image = new window.Image();
    try {
      image.src = url; await image.decode();
      if (image.naturalWidth * image.naturalHeight > 32000000 || Math.max(image.naturalWidth, image.naturalHeight) > 8192) throw new Error("L’image dépasse 32 millions de pixels ou 8 192 pixels de côté.");
      if (request !== generation.current) { URL.revokeObjectURL(url); return; }
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
      sourceUrl.current = url;
      setSource({ url, image, width: image.naturalWidth, height: image.naturalHeight }); setCrop(centered);
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
  }, [value]);

  const bounds = source ? artworkCropBounds(source.width, source.height, crop, format.width / format.height) : null;
  const imageStyle = bounds ? {
    width: `${source.width / bounds.width * 100}%`, height: `${source.height / bounds.height * 100}%`,
    left: `${50 - bounds.x * source.width / bounds.width * 100}%`, top: `${50 - bounds.y * source.height / bounds.height * 100}%`
  } : null;
  const update = (next) => setCrop((previous) => ({ ...previous, ...next }));
  function move(event) {
    if (!drag.current || busy || loading) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
    drag.current = { x: event.clientX, y: event.clientY };
    setCrop((previous) => {
      const current = artworkCropBounds(source.width, source.height, previous, format.width / format.height);
      return { ...current, x: current.x - dx / rect.width * current.width / source.width, y: current.y - dy / rect.height * current.height / source.height };
    });
  }
  function nudge(event) {
    const direction = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
    if (!direction || busy || loading) return;
    event.preventDefault();
    update({ x: bounds.x + direction[0] * bounds.width / source.width * 0.02, y: bounds.y + direction[1] * bounds.height / source.height * 0.02 });
  }
  async function apply() {
    if (!source || busy || loading) return;
    setBusy(true); setError("");
    try {
      const blob = await encodeArtworkCrop(source.image, crop, format);
      const result = await api(`/api/admin/games/${encodeURIComponent(gameId)}/images/${field}`, { method: "POST", body: blob, headers: { "Content-Type": "image/png" }, deduplicate: false });
      onApply(result.image);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <Dialog title={`${format.label} · ${gameName}`} className="game-art-editor" layerClassName="game-art-layer" onClose={onClose} dismissible={!busy}>
    <div className="game-art-editor-body">
      <input ref={input} className="game-art-file" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Importer une image du jeu" disabled={busy} onChange={(event) => { loadSource(event.target.files?.[0]); event.target.value = ""; }} />
      <div className="game-art-tools"><button type="button" className="secondary" disabled={busy} onClick={() => input.current.click()}><Upload size={18} />{source ? "Changer l’image" : "Importer une image"}</button><span>{format.width} × {format.height} px</span></div>
      {loading && <p role="status">Chargement de l’image…</p>}
      {source ? <div className="game-art-workspace">
        <div>
          <div className="game-art-crop" style={{ aspectRatio: `${format.width} / ${format.height}` }} tabIndex={0} role="group" aria-label="Zone de recadrage" onKeyDown={nudge} onPointerDown={(event) => {
            if (busy || loading || event.button !== 0) return;
            event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY };
          }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
            <img src={source.url} alt="Image à recadrer" draggable={false} style={imageStyle} />
          </div>
          <label className="game-art-zoom">Zoom <output>{bounds.zoom.toFixed(2)} ×</output><input type="range" min={1} max={5} step={0.01} value={bounds.zoom} aria-label="Zoom du recadrage" disabled={busy || loading} onChange={(event) => update({ ...bounds, zoom: Number(event.target.value) })} /></label>
          <button type="button" className="secondary" disabled={busy || loading} onClick={() => setCrop(centered)}><RotateCcw size={17} />Réinitialiser le cadrage</button>
        </div>
        <aside className="game-art-preview"><span className="eyebrow">Aperçu</span><div style={{ aspectRatio: `${format.width} / ${format.height}` }}><img src={source.url} alt="Aperçu du recadrage" style={imageStyle} /></div><strong>{gameName}</strong></aside>
      </div> : !loading && <div className="game-art-empty"><ImageIcon size={44} /><span>{format.label}</span></div>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
    <div className="game-art-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Annuler</button><button type="button" disabled={!source || busy || loading} onClick={apply}><Check size={17} />{busy ? "Enregistrement…" : "Appliquer le recadrage"}</button></div>
  </Dialog>;
}
