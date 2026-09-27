import { Plus, X } from "lucide-react";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { Die } from "../game/GamePieces.jsx";
import { combinationCondition } from "../../features/events/effect-rules.js";

const diceConditions = [["containsValues", "Contient ces valeurs"], ["customValues", "Tirage exact"], ["double", "Double"], ["triple", "Triple"], ["straight", "Suite"], ["tripleValue", "Triple d’une valeur"], ["minTotal", "Somme minimale"], ["maxTotal", "Somme maximale"]];
const cardConditions = [["containsCards", "Contient ces cartes"], ["exactCards", "Tirage exact"]];
const suits = [["any", "Toute enseigne", ""], ["hearts", "Cœur", "♥"], ["diamonds", "Carreau", "♦"], ["clubs", "Trèfle", "♣"], ["spades", "Pique", "♠"]];
const ranks = [...Array.from({ length: 9 }, (_, i) => [String(i + 2), String(i + 2)]), ["J", "Valet"], ["Q", "Dame"], ["K", "Roi"], ["A", "As"]];

function cardSelectionError(selected, config) {
  if (!config.jokers && selected.some((card) => card.rank === "JOKER")) return "Les jokers sont désactivés dans cet événement.";
  for (const card of selected) {
    const sameRank = selected.filter((candidate) => candidate.rank === card.rank);
    const available = config.decks * (card.rank === "JOKER" ? 2 : 4);
    if (sameRank.length > available || (card.rank !== "JOKER" && card.suit !== "any" && sameRank.filter((candidate) => candidate.suit === card.suit).length > config.decks)) return "Le paquet ne contient pas assez d’exemplaires de ces cartes.";
  }
  return "";
}

export function EventCombinationsEditor({ game, onChange, renderEffects }) {
  const isDice = game.type === "dice";
  const config = game[game.type];
  const rows = config.combinations ?? [];
  const options = isDice ? diceConditions : cardConditions;
  const baseCount = isDice ? config.count : config.cardsPerAction;
  const drawLengths = [];
  if (!game.critical?.enabled || game.critical.chancePercent < 100) drawLengths.push(baseCount);
  if (game.critical?.enabled && game.critical.chancePercent > 0) drawLengths.push(baseCount + game.critical.extraDraws);
  function update(index, change) {
    const next = structuredClone(rows);
    change(next[index]);
    onChange(next);
  }
  return <section className="admin-form-section event-combinations">
    <div className="admin-form-heading"><h3>Combinaisons</h3><button type="button" className="secondary" disabled={rows.length >= 30} onClick={() => onChange([...rows, { id: crypto.randomUUID(), name: "Nouvelle combinaison", condition: isDice ? { type: "containsValues", values: [1], value: 0 } : { type: "containsCards", cards: [{ rank: "A", suit: "any" }] }, effects: [] }])}><Plus size={17} /> Combinaison</button></div>
    {rows.map((row, index) => {
      const condition = row.condition;
      const listMode = !isDice || ["customValues", "containsValues"].includes(condition.type);
      const field = isDice ? "values" : "cards";
      const selected = condition[field] ?? [];
      const exact = ["customValues", "exactCards"].includes(condition.type);
      const invalidCount = !selected.length || (exact ? !drawLengths.includes(selected.length) : selected.length > Math.max(...drawLengths));
      const invalidValue = isDice && selected.some((value) => !Number.isInteger(value) || value < 1 || value > config.faces);
      const cardError = isDice ? "" : cardSelectionError(selected, config);
      return <details className="event-config-row event-combination" key={row.id} open>
        <summary><strong>{row.name}</strong><span>{options.find(([key]) => key === condition.type)?.[1]}</span></summary>
        <div className="admin-field-grid">
          <label>Nom<input value={row.name} onChange={(event) => update(index, (item) => { item.name = event.target.value; })} /></label>
          <label>Condition<select aria-label="Condition" value={condition.type} onChange={(event) => update(index, (item) => { item.condition.type = event.target.value; })}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {isDice && ["tripleValue", "minTotal", "maxTotal"].includes(condition.type) && <label>{condition.type === "tripleValue" ? "Valeur du dé" : "Somme"}<input type="number" min={condition.type === "tripleValue" ? 1 : 0} max={condition.type === "tripleValue" ? config.faces : undefined} value={condition.value ?? 0} onChange={(event) => update(index, (item) => { item.condition.value = Number(event.target.value); })} /></label>}
        </div>
        {listMode && <>
          <div className={`combination-values ${isDice ? "combination-dice" : "combination-cards"}`}>
            {selected.map((value, position) => {
              const changeValue = (nextValue) => update(index, (item) => { item.condition[field][position] = nextValue; });
              const joker = !isDice && value.rank === "JOKER";
              const cardRanks = config.jokers || joker ? [...ranks, ["JOKER", "Joker"]] : ranks;
              return <div className="combination-value" key={position}>
                {isDice ? <>
                  <div className="combination-value-preview">{value >= 1 && value <= 6 ? <Die value={value} animate={false} /> : <strong>{value}</strong>}</div>
                  <label>Dé {position + 1}<select aria-label={`Dé ${position + 1}`} value={value} onChange={(event) => changeValue(Number(event.target.value))}>{(value < 1 || value > config.faces) && <option value={value}>{value} (invalide)</option>}{Array.from({ length: config.faces }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
                </> : <>
                  <div className={`combination-card-preview ${["hearts", "diamonds"].includes(value.suit) ? "red" : ""}`}><strong>{joker ? "★" : value.rank}</strong><span>{joker ? "Joker" : suits.find(([key]) => key === value.suit)?.[2] || "Toute enseigne"}</span></div>
                  <div className="combination-card-fields"><label>Valeur {position + 1}<select aria-label={`Valeur ${position + 1}`} value={value.rank} onChange={(event) => changeValue({ rank: event.target.value, suit: event.target.value === "JOKER" ? "joker" : joker ? "any" : value.suit })}>{cardRanks.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                    <label>Enseigne {position + 1}<select aria-label={`Enseigne ${position + 1}`} value={joker ? "joker" : value.suit} disabled={joker} onChange={(event) => changeValue({ ...value, suit: event.target.value })}>{joker ? <option value="joker">Joker</option> : suits.map(([key, label, symbol]) => <option key={key} value={key}>{symbol} {label}</option>)}</select></label></div>
                </>}
                <button type="button" className="secondary icon-toggle" title={`Retirer ${isDice ? "le dé" : "la carte"} ${position + 1}`} aria-label={`Retirer ${isDice ? "le dé" : "la carte"} ${position + 1}`} onClick={() => update(index, (item) => { item.condition[field].splice(position, 1); })}><X size={15} /></button>
              </div>;
            })}
          </div>
          <button type="button" className="secondary combination-add-value" disabled={selected.length >= 40} onClick={() => update(index, (item) => { item.condition[field] = [...selected, isDice ? 1 : { rank: "A", suit: "any" }]; })}><Plus size={16} />{isDice ? "Ajouter un dé" : "Ajouter une carte"}</button>
          {(invalidCount || invalidValue || cardError) && <p className="error" role="alert">{cardError || (invalidValue ? `Les valeurs doivent être comprises entre 1 et ${config.faces}.` : !selected.length ? "Ajoute au moins une valeur." : `Combinaison impossible avec ${drawLengths.join(" ou ")} ${isDice ? "dés" : "cartes"} par tirage.`)}</p>}
        </>}
        <p className="combination-summary">{combinationCondition(condition)}{listMode && " · Chaque valeur demandée correspond à un élément distinct du tirage."}</p>
        {renderEffects(row.effects, (effects) => update(index, (item) => { item.effects = effects; }))}
        <ConfirmActionButton className="text-danger" dialogTitle="Supprimer cette combinaison ?" message={`« ${row.name} » et ses effets seront retirés de cet événement.`} confirmLabel="Supprimer" danger onConfirm={() => onChange(rows.filter((_, i) => i !== index))}>Supprimer</ConfirmActionButton>
      </details>;
    })}
  </section>;
}
