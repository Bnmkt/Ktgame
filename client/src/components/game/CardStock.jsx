import { useLocale } from "../../locales/LocaleProvider.jsx";
import { PlayingCard } from "./GamePieces.jsx";

// Every visible layer is the existing solid card, with the equipped material.
export function CardStock({ id, count, skin = "default", onDraw, disabled = false, label = "Pioche", slot }) {
  const { t } = useLocale();
  const Element = onDraw ? "button" : "div";
  return <Element className="table-card-stock" type={onDraw ? "button" : undefined} disabled={onDraw ? disabled || !count : undefined} onClick={onDraw} aria-label={t(label) + (count === undefined ? "" : ` · ${count}`)} data-table-deal-slot={slot}>
    {count === 0 ? <span className="table-stock-empty">{t("Vide")}</span> : <span className="table-stock-layers" data-card-stock={id}>{[0, 1, 2].map(layer => <PlayingCard key={layer} hidden skin={skin} animate={false}/>)}</span>}
    <span className="table-stock-readout">{t(label)}{count !== undefined && <strong>{count}</strong>}</span>
  </Element>;
}
