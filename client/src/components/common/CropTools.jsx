import { FlipHorizontal2, FlipVertical2, Focus, Grid3X3, RotateCcw, RotateCw, Undo2 } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { imageTransform } from "../../features/games/image-transform.js";
import "./crop-tools.css";

export function CropTools({ crop, onChange, onReset, disabled, grid, onGridChange }) {
  const { t } = useLocale();
  const current = imageTransform(crop);
  const actions = [
    [RotateCcw, "Tourner de 90° à gauche", () => onChange({ rotation: current.rotation - 90 })],
    [RotateCw, "Tourner de 90° à droite", () => onChange({ rotation: current.rotation + 90 })],
    [FlipHorizontal2, "Retourner horizontalement", () => onChange({ flipX: !current.flipX }), current.flipX],
    [FlipVertical2, "Retourner verticalement", () => onChange({ flipY: !current.flipY }), current.flipY],
    [Focus, "Recentrer", () => onChange({ x: 0.5, y: 0.5 })],
    [Grid3X3, "Grille de cadrage", () => onGridChange(!grid), grid],
    [Undo2, "Réinitialiser le cadrage", onReset]
  ];
  return <div className="crop-tools">
    <div className="crop-tool-actions" role="group" aria-label={t("Outils de recadrage")}>
      {actions.map(([Icon, label, action, pressed]) => <button key={label} type="button" className="secondary" title={t(label)} aria-label={t(label)} aria-pressed={pressed} disabled={disabled} onClick={action}><Icon size={18}/></button>)}
    </div>
    <label className="crop-angle-control">{t("Rotation")}<input aria-label={t("Rotation en degrés")} type="number" min={-180} max={180} step={1} value={current.rotation} disabled={disabled} onChange={event => onChange({ rotation: Math.max(-180, Math.min(180, Number(event.target.value) || 0)) })}/><span>°</span><input aria-label={t("Ajuster la rotation")} type="range" min={-180} max={180} step={1} value={current.rotation} disabled={disabled} onChange={event => onChange({ rotation: Number(event.target.value) })}/></label>
  </div>;
}
