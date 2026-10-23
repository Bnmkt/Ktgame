import { useLocale } from "../../locales/LocaleProvider.jsx";
import React, { createContext, useContext } from "react";
import { suits } from "../../features/games/config.js";
import { DieSolid } from "./DieSolid.jsx";
import { diePips } from "../../features/games/dice-faces.js";
import { cardSolidStyle } from "../../features/games/card-solid.js";
import "./card-solid.css";

const DiceTrayContext = createContext(false);

export function PlayingCard({ card, hidden = false, skin = "default", style, animate = true, inline = false, playerId, motionKey }) {
  const { t: localeText } = useLocale();
  const CardElement = inline ? "span" : "div";
  const solidClass = inline ? "" : "card-solid-piece";
  const surfaceStyle = inline ? style : { ...cardSolidStyle, ...style };
  const depth = !inline && <><i className="card-solid-depth" aria-hidden="true" />{["top", "right", "bottom", "left"].map((edge) => <i className="card-solid-edge" data-card-edge={edge} key={edge} aria-hidden="true" />)}</>;
  if (!card || hidden) return <CardElement data-card-piece="" data-card-covered="" data-card-player={playerId} data-card-track={motionKey} className={`playing-card ${solidClass} card-back ${animate ? "deal-card" : ""} card-skin-${skin}`} style={surfaceStyle}><span>?</span>{depth}</CardElement>;
  const suit = suits[card.suit] ?? suits.S;
  return (
    <CardElement data-card-piece="" data-card-face={`${card.deckId ?? 0}:${card.rank}:${card.suit}`} data-card-track={motionKey} data-card-player={playerId} className={`playing-card ${solidClass} ${animate ? "deal-card flip-card" : ""} card-skin-${skin} ${suit.red ? "red-suit" : ""}`} style={surfaceStyle} title={localeText("{value0} de {value1}", { value0: card.rank, value1: suit.name })}>
      <strong>{card.rank}</strong>
      <span>{suit.symbol}</span>
      {depth}
    </CardElement>
  );
}

export function Die({ value, kept, onClick, skin = "default", animate = true, selectionLabel = "Gardé", style, inline = false, rollKey, showcase = false }) {
  const { t: localeText } = useLocale();
  const inTray = useContext(DiceTrayContext);
  const pips = diePips[value] ?? [];
  const solid = !inline && pips.length > 0 && (inTray || animate || showcase);
  const DieElement = onClick ? "button" : inline ? "span" : "div";
  return (
    <DieElement data-die-face={value || undefined} type={onClick ? "button" : undefined} role={onClick ? undefined : "img"} aria-label={value ? localeText("Dé : {value0}", { value0: value }) : localeText("Dé non lancé")} aria-pressed={onClick ? Boolean(kept) : undefined} className={`die die-skin-${skin} ${solid ? "dice-solid-control" : value && animate ? "roll-in" : ""} ${kept ? "kept" : ""} ${kept && selectionLabel === localeText("À relancer") ? "selected-reroll" : ""}`} style={style} onClick={onClick} disabled={onClick ? !value : undefined} title={onClick ? (kept ? selectionLabel : localeText("Cliquer pour marquer comme « {value0} »", { value0: selectionLabel.toLowerCase() })) : undefined}>
      {pips.map((dot) => <span aria-hidden="true" key={dot} className="pip" data-pip={dot} />)}
      {solid && <DieSolid value={Number(value)} animate={animate} skin={skin} faceStyle={style} rollKey={rollKey} showcase={showcase} />}
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
  const { t: localeText } = useLocale();
  const dice = React.Children.toArray(children);
  return (
    <section className={`dice-throw-tray ${compact ? "compact" : ""} ${className}`.trim()} style={{ "--dice-tray-columns": dice.length > 5 ? Math.ceil(dice.length / 2) : Math.max(1, dice.length) }}>
      <header className="dice-throw-tray-label"><span aria-hidden="true" /><strong>{localeText(label)}</strong><small>{caption}</small></header>
      <div className="dice-throw-surface">
        <DiceTrayContext.Provider value={true}><div className="dice-row">
          {dice.map((child, index) => {
            const position = diceRestingPositions[index % diceRestingPositions.length];
            const rolling = Boolean(child?.props?.value) && child?.props?.animate !== false;
            const piece = React.isValidElement(child) && child.type === Die
              ? React.cloneElement(child, { key: index, rollKey: child.props.rollKey ?? child.key })
              : child;
            return <span className={`dice-throw-slot ${rolling ? "is-rolling" : ""}`} key={index} style={{ "--die-x": `${position.x}px`, "--die-y": `${position.y}px`, "--die-rotation": `${position.rotation}deg`, "--die-throw-x": `${position.throwX}px`, "--die-throw-y": `${position.throwY}px`, "--die-throw-rotation": `${position.throwRotation}deg`, "--die-delay": `${index * 34}ms` }}>{piece}</span>;
          })}
        </div></DiceTrayContext.Provider>
      </div>
    </section>
  );
}

export function DiceSelectionMode({ selectToKeep, onChange, disabled = false }) {
  const { t: localeText } = useLocale();
  return (
    <label className={`dice-mode-toggle ${disabled ? "disabled" : ""}`}>
      <span><strong>{localeText("Mode de sélection")}</strong><small>{selectToKeep ? localeText("Clique les dés à garder") : localeText("Clique les dés à relancer")}</small></span>
      <span className="dice-mode-choice"><small>{localeText("À relancer")}</small><input type="checkbox" checked={selectToKeep} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><i aria-hidden="true" /><small>{localeText("À garder")}</small></span>
    </label>
  );
}
