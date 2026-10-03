import { useEffect, useRef, useState } from "react";
import { Coins, Dice5, Landmark, Spade, Swords, Trophy, X } from "lucide-react";
import { Die, PlayingCard } from "./GamePieces.jsx";
import { gameRules, ruleDiceExamples } from "../../config/site.js";
import { gameTitle } from "../../features/games/config.js";
import { CompactNumber } from "../../utils/presentation.jsx";

export function blackjackTotal(hand = []) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === "A") {
      aces += 1;
      total += 11;
    } else if (["K", "Q", "J"].includes(card.rank)) {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

export function blackjackDealerDisplay(state) {
  if (!state?.dealer?.length) return { cards: [], score: "-" };
  if (state.finished) return { cards: state.dealer, score: blackjackTotal(state.dealer) };
  return { cards: state.dealer.map((card, index) => index === 0 ? card : null), score: blackjackTotal([state.dealer[0]]) };
}

export function AnimatedDealerHand({ state, skin, onRevealComplete }) {
  const cards = state?.dealer ?? [];
  const [visibleCount, setVisibleCount] = useState(() => Math.min(cards.length, 2));
  const completeRef = useRef(onRevealComplete);

  useEffect(() => { completeRef.current = onRevealComplete; }, [onRevealComplete]);

  useEffect(() => {
    if (!cards.length) {
      setVisibleCount(0);
      return undefined;
    }
    if (!state.finished) {
      setVisibleCount(Math.min(cards.length, 2));
      return undefined;
    }
    setVisibleCount((count) => Math.min(Math.max(count, 2), cards.length));
    if (cards.length <= 2) {
      const timeout = setTimeout(() => completeRef.current?.(), 420);
      return () => clearTimeout(timeout);
    }
    const interval = setInterval(() => {
      setVisibleCount((count) => {
        if (count >= cards.length) {
          clearInterval(interval);
          return count;
        }
        const next = count + 1;
        if (next >= cards.length) {
          clearInterval(interval);
          setTimeout(() => completeRef.current?.(), 420);
        }
        return next;
      });
    }, 420);
    return () => clearInterval(interval);
  }, [state.finished, cards.length]);

  return <div className="card-row dealer-card-row">{cards.slice(0, visibleCount).map((card, index) => <PlayingCard key={`${index}-${state.finished ? "open" : "hidden"}`} card={card} hidden={!state.finished && index > 0} skin={skin} />)}</div>;
}

export function golfPlayable(card, waste, modifiers = {}) {
  if (!card || !waste) return false;
  const value = (rank) => ({ A: 1, J: 11, Q: 12, K: 13 })[rank] ?? Number(rank);
  const difference = Math.abs(value(card.rank) - value(waste.rank));
  return difference === 1 || (modifiers.wrapRanks && difference === 12);
}

export function accordionPlayable(piles = [], from, to, modifiers = {}) {
  const distances = [modifiers.allowOneApart !== false && 1, modifiers.allowThreeApart !== false && 3].filter((value) => Number.isInteger(value));
  if (!distances.some((distance) => to === from - distance) || !piles[from] || !piles[to]) return false;
  const source = piles[from].at(-1);
  const target = piles[to].at(-1);
  return source.rank === target.rank || source.suit === target.suit;
}

export function groupedHand(hand = []) {
  const groups = {};
  for (const card of hand) {
    groups[card.rank] = [...(groups[card.rank] ?? []), card];
  }
  return Object.entries(groups).sort(([a], [b]) => {
    const value = (rank) => ({ "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14, "2": 15 })[rank] ?? 0;
    return value(a) - value(b);
  });
}

export function cardIdentity(card) {
  return card ? `${card.rank}-${card.suit}` : "";
}

export { canPlayPresidentSet, presidentCardValue } from "../../features/games/president.js";

export function yahtzeeTotal(scores = {}) {
  const upper = ["upper-1", "upper-2", "upper-3", "upper-4", "upper-5", "upper-6"].reduce((sum, key) => sum + (scores[key] ?? 0), 0);
  return Object.values(scores).reduce((sum, value) => sum + value, 0) + (upper >= 63 ? 35 : 0);
}

export function yahtzeeUpperTotal(scores = {}) {
  return ["upper-1", "upper-2", "upper-3", "upper-4", "upper-5", "upper-6"].reduce((sum, key) => sum + (scores[key] ?? 0), 0);
}

export function yahtzeePotentialScore(dice = [], category) {
  if (dice.length !== 5 || dice.some((die) => !die)) return null;
  const counts = [1, 2, 3, 4, 5, 6].map((face) => dice.filter((die) => die === face).length);
  const sum = dice.reduce((total, die) => total + die, 0);
  if (category.startsWith("upper-")) return dice.filter((die) => die === Number(category.at(-1))).reduce((total, die) => total + die, 0);
  if (category === "three-kind") return counts.some((count) => count >= 3) ? sum : 0;
  if (category === "four-kind") return counts.some((count) => count >= 4) ? sum : 0;
  if (category === "full-house") return counts.includes(3) && counts.includes(2) ? 25 : 0;
  if (category === "small-straight") return ["1234", "2345", "3456"].some((run) => [...run].every((face) => dice.includes(Number(face)))) ? 30 : 0;
  if (category === "large-straight") return ["12345", "23456"].some((run) => [...run].every((face) => dice.includes(Number(face)))) ? 40 : 0;
  if (category === "yahtzee") return counts.includes(5) ? 50 : 0;
  return sum;
}

export function StepperBet({ value, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, label = "Mise" }) {
  const finiteMax = Number.isFinite(max) && max < Number.MAX_SAFE_INTEGER;
  const clamp = (next) => Math.min(max, Math.max(min, Math.floor(Number(next) || 0)));
  const numeric = clamp(value);
  function adjust(delta) {
    onChange(clamp(numeric + delta));
  }
  const minusSteps = [-100, -10, -1];
  const plusSteps = [1, 10, 100];
  return (
    <div className="bet-stepper">
      <div className="bet-stepper-head">
        <span>{label}</span>
        <strong><CompactNumber value={numeric} label={`${label} exacte`} /></strong>
      </div>
      <div className="bet-control">
        <div className="bet-step-group negative-steps" aria-label="Réduire la mise">
          {minusSteps.map((step) => (
            <button key={step} className="chip-button" type="button" onClick={() => adjust(step)}>{step}</button>
          ))}
        </div>
        <label className="bet-value-input">
          <input
            aria-label={label}
            type="number"
            min={min}
            max={finiteMax ? max : undefined}
            value={numeric}
            onChange={(e) => onChange(clamp(e.target.value))}
          />
        </label>
        <div className="bet-step-group positive-steps" aria-label="Augmenter la mise">
          {plusSteps.map((step) => (
            <button key={step} className="chip-button" type="button" onClick={() => adjust(step)}>+{step}</button>
          ))}
        </div>
      </div>
      <div className="bet-mouse-controls" aria-label="Réglage rapide de la mise">
        <button type="button" className="secondary" onClick={() => onChange(min)}>Minimum</button>
        <button type="button" className="secondary" onClick={() => onChange(clamp(Math.max(min, Math.floor(numeric / 2))))}>÷ 2</button>
        <button type="button" className="secondary" onClick={() => onChange(clamp(numeric * 2))}>× 2</button>
        {finiteMax && <button type="button" className="secondary" onClick={() => onChange(max)}>Maximum</button>}
      </div>
      {finiteMax && max > min && <label className="bet-range-input"><span className="sr-only">{label} à la souris</span><input type="range" min={min} max={max} step={Math.max(1, Math.floor((max - min) / 100))} value={numeric} onChange={(event) => onChange(clamp(event.target.value))} /></label>}
    </div>
  );
}

export function RulesModal({ gameId, onClose }) {
  const rules = gameRules[gameId];
  if (!rules) return null;
  const examples = ruleDiceExamples[gameId] ?? [];
  const isCardGame = examples.some((example) => example.cards);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal rules-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title-row"><div><span className="eyebrow">Guide de jeu</span><h2>{gameTitle(gameId)}</h2></div><button className="secondary icon-toggle" onClick={onClose}><X size={18} /></button></div>
        <div className="rule-goal"><span>{isCardGame ? <Spade size={22} /> : <Dice5 size={22} />}</span><div><small>Objectif de la partie</small><strong>{rules.goal}</strong></div><b>{rules.sections.length} chapitres</b></div>
        <div className="rule-sections">
          {rules.sections.map((section, sectionIndex) => (
            <section className="rule-section" key={section.title}>
              <div className="rule-section-title"><span>{section.title.toLowerCase().includes("fin") || section.title.toLowerCase().includes("victoire") ? <Trophy size={20} /> : gameId === "bataille" || section.title.toLowerCase().includes("bluff") || section.title.toLowerCase().includes("stratég") ? <Swords size={20} /> : section.title.toLowerCase().includes("score") || section.title.toLowerCase().includes("point") || section.title.toLowerCase().includes("combinaison") || section.title.toLowerCase().includes("valeur") ? <Coins size={20} /> : isCardGame ? <Spade size={20} /> : <Dice5 size={20} />}</span><div><small>Chapitre {sectionIndex + 1}</small><h3>{section.title}</h3></div></div>
              <ul>
                {section.items.map((item, itemIndex) => {
                  const itemExamples = examples.filter((example) => item.startsWith(example.match));
                  return <li className={itemExamples.length ? "has-rule-example" : ""} key={item}><span className="rule-item-index">{String(itemIndex + 1).padStart(2, "0")}</span><div className="rule-item-content"><span>{item}</span>{itemExamples.map((example, exampleIndex) => <figure className="rule-combination-example" key={`${example.match}-${exampleIndex}`}>{example.dice ? <div className="rule-dice-row">{example.dice.map((value, index) => <Die key={`${example.match}-${index}`} value={value} kept={false} />)}</div> : <div className="rule-card-row">{example.cards.map((card, index) => <PlayingCard key={`${example.match}-${index}`} card={card} hidden={example.hidden || !card} />)}</div>}<figcaption><small>Exemple</small>{example.label}</figcaption></figure>)}</div></li>;
                })}
              </ul>
            </section>
          ))}
        </div>
        <div className="rules-footer"><span><Landmark size={16} /> Guide de table KTGA.ME</span><button onClick={onClose}>Fermer</button></div>
      </div>
    </div>
  );
}
