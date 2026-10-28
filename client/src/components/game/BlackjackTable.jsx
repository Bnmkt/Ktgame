import { Coins, Eye, Hand, Plus, Spade, UserRoundPlus } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";
import { CompactNumber } from "../../utils/presentation.jsx";
import { AnimatedDealerHand, blackjackDealerDisplay, blackjackTotal, StepperBet } from "./GameSupport.jsx";
import { PlayingCard } from "./GamePieces.jsx";
import { TableActionBar } from "../room/TableInterface.jsx";

// Only presentation: the original Room action handler and server settle every bet.
export function BlackjackTable({ room, state, user, bet, onBetChange, onAction, onRevealComplete, showResults, hasBet, allBetsPlaced, handDone, handShown, minimumBet, maximumBet, canDouble, onReplay, onWaiting, onLeave, isOwner }) {
  const { t } = useLocale();
  const players = state.players.filter((player) => !player.isBot);
  const hand = state.hands[user.id] ?? [];
  const skin = user.cosmetics?.equipped?.cardSkin ?? "default";
  const limit = Math.min(maximumBet, Math.max(minimumBet, Number(user.tokens) || 0));
  const amount = Math.min(limit, Math.max(minimumBet, Number(bet) || minimumBet));
  const available = Math.max(0, (room.maxPlayers ?? players.length) - players.length);
  const canDecide = hasBet && allBetsPlaced && !handDone && !state.finished;
  const dealer = blackjackDealerDisplay(state);
  const resultFor = (id, cards) => {
    const total = blackjackTotal(cards);
    if (state.foldedPlayerIds?.includes(id)) return "Couché";
    if (total > 21) return "Dépassement de 21";
    if (state.winners.includes(id)) return total === 21 && cards.length === 2 ? "Blackjack" : "Victoire";
    return total === blackjackTotal(state.dealer) ? "Égalité" : "Défaite";
  };
  return <section className="blackjack-stage" aria-label={t("Plateau de Blackjack")}>
    <div className="blackjack-playfield" style={{ "--blackjack-player-count": players.length, "--blackjack-card-size": players.length > 3 ? "72px" : "100px" }}>
      <section className="blackjack-dealer" data-card-owner="dealer"><header><Spade size={18}/><strong>{t("Croupier")}</strong><span className="blackjack-hand-total">{state.dealer.length ? dealer.score : "—"}{!state.finished && state.dealer.length > 1 ? " + ?" : ""}</span></header><AnimatedDealerHand state={state} skin={skin} onRevealComplete={onRevealComplete}/>{!state.dealer.length && <span className="blackjack-empty-hand">{t("Attend les mises")}</span>}</section>
      <div className="blackjack-table-print" aria-hidden="true"><strong>BLACKJACK</strong><span>{t("Contre le croupier")}</span><small>{t(state.modifiers?.dealerMode === "classic-17" ? "Le croupier tire jusqu’à 17" : "Le croupier vise au moins 17 et la meilleure main")}</small></div>
      <div className="blackjack-places">
        {available > 0 && players.length < 4 && <div className="blackjack-empty-place"><UserRoundPlus size={30}/><span>{t("Place disponible")}</span></div>}
        {players.map((player) => {
          const mine = player.id === user.id;
          const shown = mine || state.shownPlayerIds?.includes(player.id);
          const cards = state.hands[player.id] ?? [];
          const done = state.completedPlayerIds?.includes(player.id);
          const result = state.finished && showResults && cards.length && shown ? resultFor(player.id, cards) : null;
          return <article className={`blackjack-place ${mine ? "blackjack-place-self" : ""} ${mine && canDecide ? "blackjack-place-current" : ""} ${result ? "blackjack-place-resolved" : ""}`} key={player.id} data-card-owner={player.id} style={{ "--blackjack-hand-count": Math.max(2, cards.length) }}>
            <div className="blackjack-player-cards card-row">{cards.map((card, index) => <PlayingCard key={index} card={shown ? card : null} hidden={!shown} skin={player.cosmetics?.equipped?.cardSkin ?? skin}/>)}{!cards.length && <span className="blackjack-empty-hand">{t("Place ta mise")}</span>}</div>
            {cards.length > 0 && <span className="blackjack-hand-total">{shown ? blackjackTotal(cards) : "?"}</span>}
            <div className="blackjack-place-identity"><DisplayName user={player}/><strong><Coins size={15}/><CompactNumber value={state.bets[player.id] ?? 0}/></strong></div>
            <small className={result ? `blackjack-result ${["Défaite", "Dépassement de 21", "Couché"].includes(result) ? "blackjack-result-loss" : result === "Égalité" ? "blackjack-result-tie" : "blackjack-result-win"}` : "blackjack-player-state"}>{t(result || (done ? "Main terminée" : !state.bets[player.id] ? "Mise à placer" : !allBetsPlaced ? "Mise placée" : mine ? "À toi de jouer" : "En jeu"))}</small>
          </article>;
        })}
        {available > 1 && players.length < 4 && <div className="blackjack-empty-place"><UserRoundPlus size={30}/><span>{available > 2 ? t("{value0} places disponibles", { value0: available - 1 }) : t("Place disponible")}</span></div>}
      </div>
    </div>
    <div className="blackjack-command-dock">
      {!state.finished && !hasBet ? <><section className="blackjack-bet-choice"><StepperBet compact value={amount} onChange={onBetChange} min={minimumBet} max={limit} label={t("Mise Blackjack")}/><div className="blackjack-bet-presets">{[50, 100, 200, 500, 1000].filter((value) => value >= minimumBet && value <= limit).map((value) => <button type="button" className={amount === value ? "blackjack-preset-current" : "secondary"} key={value} onClick={() => onBetChange(value)}>{value}</button>)}</div></section><TableActionBar><button className="table-command-main" disabled={Number(user.tokens) < minimumBet} onClick={() => onAction({ type: "bet", amount })}><Coins size={24}/><span>{t("Miser")}<small><CompactNumber value={amount} suffix={t(" jetons")}/></small></span></button></TableActionBar></> : !state.finished ? <><div className="blackjack-bet-readout"><Coins size={23}/><span>{t("Mise placée")}<strong><CompactNumber value={state.bets[user.id] ?? 0}/></strong></span></div><TableActionBar>{canDecide ? <><button className="table-command-main" onClick={() => onAction({ type: "hit" })}><Plus size={24}/><span>{t("Tirer")}<small>{t("Recevoir une carte")}</small></span></button><button className="secondary table-command-hold" onClick={() => onAction({ type: "stand" })}><Hand size={23}/><span>{t("Rester")}<small>{t("Conserver la main")}</small></span></button>{hand.length === 2 && blackjackTotal(hand) !== 21 && <button className="secondary table-command-gold" disabled={!canDouble} title={canDouble ? t("Une seule carte sera distribuée") : t("Solde insuffisant pour doubler")} onClick={() => onAction({ type: "double" })}><span aria-hidden="true">×2</span><span>{t("Doubler")}<small>+<CompactNumber value={state.bets[user.id]}/></small></span></button>}</> : <p className="blackjack-waiting" role="status">{t(!allBetsPlaced ? "En attente des autres mises." : "Main terminée. En attente des autres joueurs.")}</p>}</TableActionBar><details className="blackjack-extra-actions"><summary>{t("Autres actions")}</summary>{canDecide && <button className="danger-button" onClick={() => onAction({ type: "fold" })}>{t("Se coucher")}</button>}{hasBet && !handShown && <button className="secondary" onClick={() => onAction({ type: "show" })}><Eye size={16}/>{t("Montrer ma main")}</button>}</details></> : <TableActionBar>{isOwner && <><button className="table-command-main" onClick={onReplay}>{t("Rejouer maintenant")}</button><button className="secondary" onClick={onWaiting}>{t("Retour à la salle d'attente")}</button></>}<button className="secondary" onClick={onLeave}>{t("Quitter la table")}</button></TableActionBar>}
    </div>
  </section>;
}
