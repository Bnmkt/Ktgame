import { useLocale } from "../../locales/LocaleProvider.jsx";
import { PlayingCard } from "./GamePieces.jsx";
import { CardStock } from "./CardStock.jsx";
import { accordionPlayable, golfPlayable } from "./GameSupport.jsx";

export function SolitaireTable({ state, skin, onAction, selected, onSelect }) {
  const { t } = useLocale();
  if (state.gameId === "golf-solitaire") return <section className="solo-card-table golf-card-table">
    <div className="golf-tableau" aria-label={t("Tableau de sept colonnes")}>{state.tableau.map((column, columnIndex) => <article className="golf-fairway" key={columnIndex}>
      <small>{t("Colonne")} {columnIndex + 1}</small><div className="golf-card-stack">{column.map((card, cardIndex) => {
        const playable = cardIndex === column.length - 1 && golfPlayable(card, state.waste, state.modifiers);
        return <button key={`${card.suit}-${card.rank}`} data-table-deal-slot={`column-${columnIndex}:${cardIndex}`} className={playable ? "playable-card" : ""} disabled={!playable} aria-label={t("Jouer la carte de la colonne {value0}", { value0: columnIndex + 1 })} onClick={() => onAction({ type: "play", column: columnIndex })}><PlayingCard card={card} skin={skin}/></button>;
      })}{!column.length && <div className="empty-card-slot">{t("Libre")}</div>}</div>
    </article>)}</div>
    <div className="golf-draw-zone">
      <CardStock id="golf-stock" count={state.stock.length} skin={skin} onDraw={() => onAction({ type: "draw" })}/>
      <div className="golf-direction">± 1<small>{t(state.modifiers?.wrapRanks ? "Roi ↔ As actif" : "sans boucle Roi–As")}</small></div>
      <div className="card-station active-waste" data-card-draw-source="golf-stock" data-table-deal-slot="waste:0"><span>{t("Carte active")}</span><PlayingCard card={state.waste} skin={skin}/></div>
    </div>
  </section>;
  return <section className="solo-card-table accordion-card-table">
    <div className="accordion-guide"><span className="guide-source">{t("1. Choisis une pile")}</span><span>→</span><span className="guide-target">{t("2. Choisis une cible éclairée")}</span><strong>{state.piles.length} / 52</strong></div>
    <div className="accordion-line">{state.piles.map((pile, index) => {
      const target = selected !== null && accordionPlayable(state.piles, selected, index, state.modifiers);
      return <button key={`${index}-${pile.length}`} data-table-deal-slot={`ribbon:${index}`} className={`${selected === index ? "selected" : ""} ${target ? "target" : ""}`} aria-pressed={selected === index} aria-label={`${t("Pile")} ${index + 1} · ${pile.length}`} onClick={() => {
        if (target) onAction({ type: "move", from: selected, to: index }); else onSelect(selected === index ? null : index);
      }}><span className="accordion-index">{index + 1}</span><PlayingCard card={pile.at(-1)} skin={skin}/><small>{pile.length} {t("cartes")}</small></button>;
    })}</div>
    <details className="table-inline-help"><summary>{t("Règles principales")}</summary><p>{t("Déplace sur une carte de même rang ou de même couleur,")} {state.modifiers?.allowOneApart !== false && state.modifiers?.allowThreeApart !== false ? t("une ou trois piles") : state.modifiers?.allowOneApart !== false ? t("une pile") : t("trois piles")} {t("plus à gauche.")}</p></details>
  </section>;
}
