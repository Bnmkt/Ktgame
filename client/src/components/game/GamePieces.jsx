import React from "react";
import { suits } from "../../features/games/config.js";

export function PlayingCard({ card, hidden = false, skin = "default", style, animate = true, inline = false }) {
  const CardElement = inline ? "span" : "div";
  if (!card || hidden) return <CardElement className={`playing-card card-back ${animate ? "deal-card" : ""} card-skin-${skin}`} style={style}><span>?</span></CardElement>;
  const suit = suits[card.suit] ?? suits.S;
  return (
    <CardElement className={`playing-card ${animate ? "deal-card flip-card" : ""} card-skin-${skin} ${suit.red ? "red-suit" : ""}`} style={style} title={`${card.rank} de ${suit.name}`}>
      <strong>{card.rank}</strong>
      <span>{suit.symbol}</span>
    </CardElement>
  );
}

export function Die({ value, kept, onClick, skin = "default", animate = true, selectionLabel = "Gardé", style, inline = false }) {
  const faces = {
    1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9]
  };
  const pips = faces[value] ?? [];
  const DieElement = onClick ? "button" : inline ? "span" : "div";
  return (
    <DieElement className={`die die-skin-${skin} ${value && animate ? "roll-in" : ""} ${kept ? "kept" : ""} ${kept && selectionLabel === "À relancer" ? "selected-reroll" : ""}`} style={style} onClick={onClick} disabled={onClick ? !value : undefined} title={onClick ? (kept ? selectionLabel : `Cliquer pour marquer comme « ${selectionLabel.toLowerCase()} »`) : undefined}>
      {pips.map((dot) => <span key={dot} className="pip" data-pip={dot} />)}
      {kept && <span className="kept-label">{selectionLabel}</span>}
    </DieElement>
  );
}

const diceRestingPositions = [
  { x: -7, y: 3, rotation: -5, throwX: -92, throwY: -42, throwRotation: -230 },
  { x: 4, y: -5, rotation: 7, throwX: 78, throwY: -56, throwRotation: 260 },
  { x: -2, y: 6, rotation: -2, throwX: -64, throwY: -68, throwRotation: -310 },
  { x: 8, y: 2, rotation: 4, throwX: 96, throwY: -38, throwRotation: 290 },
  { x: -5, y: -3, rotation: -7, throwX: -84, throwY: -52, throwRotation: -270 },
  { x: 3, y: 5, rotation: 3, throwX: 72, throwY: -72, throwRotation: 330 },
  { x: -9, y: -1, rotation: 6, throwX: -104, throwY: -46, throwRotation: -300 },
  { x: 6, y: -4, rotation: -4, throwX: 88, throwY: -64, throwRotation: 240 }
];

export function DiceThrowTray({ children, label = "Piste de lancer", caption = "Zone de jeu", className = "", compact = false }) {
  return (
    <section className={`dice-throw-tray ${compact ? "compact" : ""} ${className}`.trim()}>
      <header className="dice-throw-tray-label"><span aria-hidden="true" /><strong>{label}</strong><small>{caption}</small></header>
      <div className="dice-throw-surface">
        <div className="dice-row">
          {React.Children.map(children, (child, index) => {
            const position = diceRestingPositions[index % diceRestingPositions.length];
            const rolling = Boolean(child?.props?.value) && child?.props?.animate !== false;
            return <span className={`dice-throw-slot ${rolling ? "is-rolling" : ""}`} key={child?.key ?? index} style={{ "--die-x": `${position.x}px`, "--die-y": `${position.y}px`, "--die-rotation": `${position.rotation}deg`, "--die-throw-x": `${position.throwX}px`, "--die-throw-y": `${position.throwY}px`, "--die-throw-rotation": `${position.throwRotation}deg`, "--die-delay": `${index * 34}ms` }}>{child}</span>;
          })}
        </div>
      </div>
    </section>
  );
}

export function DiceSelectionMode({ selectToKeep, onChange, disabled = false }) {
  return (
    <label className={`dice-mode-toggle ${disabled ? "disabled" : ""}`}>
      <span><strong>Mode de sélection</strong><small>{selectToKeep ? "Clique les dés à garder" : "Clique les dés à relancer"}</small></span>
      <span className="dice-mode-choice"><small>À relancer</small><input type="checkbox" checked={selectToKeep} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><i aria-hidden="true" /><small>À garder</small></span>
    </label>
  );
}
