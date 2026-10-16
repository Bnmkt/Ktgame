import { useLocale } from "../locales/LocaleProvider.jsx";
import { ModalBackdrop } from "../components/common/ModalBackdrop.jsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { bugDiagnostics } from "../features/bugs/diagnostics.js";
import { useBugGameContext } from "../features/bugs/BugReportProvider.jsx";
import { Activity, ArrowLeft, CheckCircle2, Clock3, Coins, Crown, Dice5, Gift, HelpCircle, LogOut, Minus, Plus, ShieldCheck, Sparkles, Swords, Ticket, Trophy, Users, X, Zap } from "lucide-react";
import { SOCKET_PATH, SOCKET_URL, api } from "../api.js";
import { EventEffectRules } from "../components/game/EventEffectRules.jsx";
import { eventEffectDescription } from "../features/events/effect-rules.js";
import { DiceThrowTray, Die, PlayingCard } from "../components/game/GamePieces.jsx";
import { CompactNumber } from "../utils/presentation.jsx";
import { eventProgressDisplay } from "../features/events/progress.js";
import { playGameSound } from "../utils/game-sounds.js";

const suitCodes = { hearts: "H", diamonds: "D", clubs: "C", spades: "S" };
const statusLabels = { scheduled: "À venir", active: "En cours", finished: "Terminé", cancelled: "Annulé" };
const makeRequestId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function formatCountdown(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const rest = seconds % 60;
  return `${days ? `${days}j ` : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function EventDie({ value, skin }) { return value <= 6 ? <Die value={value} skin={skin} /> : <div className="event-poly-die"><Dice5 /><strong>{value}</strong></div>; }

function EventResult({ action, game, user }) {
  const { t: localeText } = useLocale();
  const result = action?.result;
  const equipped = user.cosmetics?.equipped ?? {};
  const stage = game.type === "dice"
    ? <DiceThrowTray label={localeText("Piste de l’événement")} caption={localeText("Dés")}>{result?.dice?.length ? result.dice.map((value, index) => <EventDie key={index} value={value} skin={equipped.diceSkin} />) : <span className="event-table-empty">{localeText("En attente du lancer")}</span>}</DiceThrowTray>
    : <div className="event-card-table" aria-label={localeText("Tapis de cartes")}><div className="event-card-felt">{result?.cards?.length ? result.cards.map((card, index) => <PlayingCard key={index} card={{ ...card, suit: suitCodes[card.suit] ?? card.suit }} skin={equipped.cardSkin} />) : <span className="event-table-empty">{localeText("En attente du tirage")}</span>}</div></div>;
  if (!result) return stage;
  return <div className="community-event-result" key={action.id}>
    {result.critical && <div className="event-critical-badge"><Zap /> <strong>{result.criticalLabel || localeText("Action critique")}</strong><span>+{result.extraDraws} {result.type === "dice" ? localeText("dé") : localeText("carte")}{result.extraDraws > 1 ? localeText("s") : ""}</span></div>}
    {stage}
    <div className="event-draw-scores">{(result.dice ?? result.cards ?? []).map((item, index) => {
      const score = result.itemEffectiveScores?.[index] ?? { damage: result.itemScores?.[index] ?? 0, contribution: 0 };
      return <div key={index}><strong>{typeof item === "number" ? localeText("Dé {value0} · {value1}", { value0: index + 1, value1: item }) : localeText("Carte {value0} · {value1}", { value0: index + 1, value1: item.rank })}</strong><span>{localeText("Dégâts") + " "}<CompactNumber value={score.damage} prefix="−" /></span><span>{localeText("Contribution") + " "}<CompactNumber value={score.contribution} prefix="+" /></span></div>;
    })}</div>
    <div className="community-event-impact"><strong><CompactNumber value={result.damage} prefix="−" suffix={localeText(" dégâts")} label={localeText("Dégâts exacts")} /></strong><span><CompactNumber value={result.contribution} prefix="+" suffix={localeText(" contribution")} label={localeText("Contribution exacte")} /></span>{result.potAdded > 0 && <span><CompactNumber value={result.potAdded} prefix="+" suffix={localeText(" au pot")} label={localeText("Ajout exact au pot")} /></span>}{result.tokensWon > 0 && <span><CompactNumber value={result.tokensWon} prefix="+" suffix={localeText(" jetons")} label={localeText("Gain exact")} /></span>}</div>
    {!!result.combinations?.length && <div className="event-trigger-list">{result.combinations.map((label) => <b key={label}>{localeText(label)}</b>)}</div>}
    {!!result.triggered?.length && <div className="event-trigger-list">{result.triggered.map((label, index) => <span key={`${label}-${index}`}>{localeText(label)}</span>)}</div>}
  </div>;
}

export function CommunityEventPage({ slug, user, setUser, onBack, onLogout }) {
  const { t: localeText } = useLocale();
  const [data, setData] = useState(null);
  useBugGameContext("event", slug, data?.event?.game?.id, data?.event?.id);
  const [lastAction, setLastAction] = useState(null);
  const [ranking, setRanking] = useState("contribution");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [purchaseCount, setPurchaseCount] = useState(1);
  const [purchaseQuote, setPurchaseQuote] = useState(null);
  const [milestonesOpen, setMilestonesOpen] = useState(false);
  const [calculationOpen, setCalculationOpen] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setError("");
    try { setData(await api(`/api/community-events/${slug}`)); }
    catch (requestError) { setError(requestError.message); }
  }, [slug]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const socket = io(SOCKET_URL, { path: SOCKET_PATH, auth: { stream: "event" } });
    const disposeDiagnostics = bugDiagnostics.registerSocket(socket);
    let refreshTimer;
    socket.on("community-event-update", (update) => {
      if (update.slug !== slug && update.id !== data?.event?.id) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => load(true), 180);
    });
    return () => { clearInterval(timer); clearTimeout(refreshTimer); disposeDiagnostics(); socket.disconnect(); };
  }, [slug, data?.event?.id, load]);

  useEffect(() => {
    if (!data?.participant || !data.event?.actions.allowPurchase || data.event.status !== "active") {
      setPurchaseQuote(null);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await api(`/api/community-events/${data.event.id}/actions/quote`, { method: "POST", body: JSON.stringify({ count: purchaseCount }) });
        if (!cancelled) setPurchaseQuote(result.quote);
      } catch {
        if (!cancelled) setPurchaseQuote(null);
      }
    }, 160);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [data?.event?.id, data?.event?.status, data?.event?.actions.allowPurchase, data?.participant?.purchasesTotal, data?.participant?.availability?.purchasedToday, purchaseCount]);

  const rechargeDeadline = (() => {
    const event = data?.event;
    const participant = data?.participant;
    const availability = participant?.availability;
    if (event?.status !== "active" || event.actions?.mode !== "recharge" || !availability || availability.total > 0) return null;
    if (Number(participant.actions) >= Number(event.limits?.maximumActionsPerUser)) return null;
    if (!availability.nextRechargeAt) return null;
    const timestamp = new Date(availability.nextRechargeAt).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  })();

  useEffect(() => {
    if (!rechargeDeadline) return undefined;
    let timer;
    const refreshWhenReady = () => {
      const remaining = rechargeDeadline - Date.now();
      if (remaining <= 0) {
        load(true);
        return;
      }
      timer = window.setTimeout(refreshWhenReady, Math.min(remaining + 100, 2_000_000_000));
    };
    refreshWhenReady();
    return () => window.clearTimeout(timer);
  }, [rechargeDeadline, load]);

  async function mutate(path, body, mode) {
    setBusy(mode);
    setError("");
    try {
      const result = await api(path, { method: "POST", body: JSON.stringify(body) });
      setData(result);
      if (result.user) setUser(result.user);
      if (result.action) { setLastAction(result.action); playGameSound(result.action.result?.type === "dice" ? "dice" : "card"); }
    } catch (requestError) {
      setError(requestError.message);
    } finally { setBusy(""); }
  }

  const event = data?.event;
  const orderedRanking = useMemo(() => [...(data?.leaderboard ?? [])].sort((left, right) => Number(right[ranking] ?? 0) - Number(left[ranking] ?? 0)), [data?.leaderboard, ranking]);
  if (!event) return <main className="app-shell community-event-shell"><header className="page-heading"><div><h1>{localeText("Événement communautaire")}</h1><span>{localeText("Chargement de la configuration…")}</span></div><button className="secondary" onClick={onBack}><ArrowLeft size={18} />{" " + localeText("Casino")}</button></header>{error && <div className="error">{localeText(error)}</div>}</main>;

  const beginsIn = new Date(event.startsAt).getTime() - now;
  const endsIn = new Date(event.endsAt).getTime() - now;
  const objectiveCurrent = event.runtime.currentValue ?? event.objective.startValue;
  const objectiveReached = objectiveCurrent <= event.objective.minimum;
  const entryRefund = data.reward?.detail?.outcome === "entry-refund";
  const refundPreview = data.potentialReward?.detail?.outcome === "entry-refund";
  const progressDisplay = eventProgressDisplay(event, data.progress);
  const rankingOptions = [["contribution", "Contribution"], ["damage", "Dégâts"], ["actions", "Actions"], ["communityEffects", "Effets"], ["potAdded", "Pot"], ["bestAction", "Meilleure action"]].filter(([value]) => event.rankings[value] !== false);
  const backgroundImage = String(event.theme.backgroundImage ?? "").trim();
  const theme = { "--event-primary": event.theme.primary, "--event-secondary": event.theme.secondary, "--event-accent": event.theme.accent, ...(backgroundImage ? { "--event-background": `url(${JSON.stringify(backgroundImage)})` } : {}) };
  const reachedMilestoneIds = new Set(event.runtime.reachedMilestones ?? []);
  const reachedMilestones = event.objective.milestones.filter((milestone) => reachedMilestoneIds.has(milestone.id));
  const visibleMilestones = user.admin ? event.objective.milestones : reachedMilestones;
  const effectIsActive = (effect) => !effect.expiresAt || new Date(effect.expiresAt).getTime() > now;
  const communityActiveEffects = (event.runtime.activeEffects ?? []).filter(effectIsActive);
  const activeEffects = [...communityActiveEffects, ...(data.participant?.activeEffects ?? []).filter(effectIsActive)];
  const effectsForMilestone = (milestone) => {
    const sourceIds = new Set((milestone.effects ?? []).map((effect) => effect.id));
    return activeEffects.filter((effect) => effect.milestoneId === milestone.id || sourceIds.has(effect.sourceEffectId));
  };
  const individualTiers = [...(event.rewards.tiers ?? [])].sort((left, right) => left.score - right.score);
  const personalContribution = Number(data.participant?.contribution) || 0;
  const currentIndividualTier = individualTiers.filter((tier) => tier.score <= personalContribution).at(-1) ?? null;
  const nextIndividualTier = individualTiers.find((tier) => tier.score > personalContribution) ?? null;
  return <main className="app-shell community-event-shell" style={theme}>
    <header className="topbar">
      <div><span className="eyebrow">{localeText("Événement temporaire")}</span><h1>{event.theme.title || event.name}</h1><span>{event.theme.subtitle}</span></div>

    </header>
    {error && <div className="error">{localeText(error)}</div>}

    <section className="community-event-hero">
      {event.theme.heroImage && <div className="community-event-hero-image"><img src={event.theme.heroImage} alt="" style={{ objectPosition: `${event.theme.heroPositionX ?? 50}% ${event.theme.heroPositionY ?? 50}%`, transform: `scale(${(event.theme.heroScale ?? 100) / 100})`, transformOrigin: `${event.theme.heroPositionX ?? 50}% ${event.theme.heroPositionY ?? 50}%` }} /></div>}
      <div className="event-hero-copy"><span className={`event-status status-${event.status}`}>{statusLabels[event.status] ?? event.status}</span><h2>{event.name}</h2><p>{event.shortDescription}</p><div className="event-countdown"><Clock3 /><span>{event.status === "scheduled" ? localeText("Début dans") : event.status === "active" ? localeText("Fin dans") : localeText("Clôturé")}</span><strong>{event.status === "scheduled" ? formatCountdown(beginsIn) : event.status === "active" ? formatCountdown(endsIn) : "—"}</strong></div></div>
      <div className="event-hero-stats"><article><Users /><strong><CompactNumber value={event.runtime.participantCount} label={localeText("Nombre exact de participants")} /></strong><span>{localeText("participants")}</span></article><article><Activity /><strong><CompactNumber value={event.runtime.actionCount} label={localeText("Nombre exact d’actions")} /></strong><span>{localeText("actions")}</span></article><article><Coins /><strong><CompactNumber value={event.runtime.pot} label={localeText("Pot exact")} /></strong><span>{localeText("dans le pot")}</span></article></div>
    </section>

    <section className="community-objective card">
      <div className="community-objective-heading"><div><span className="eyebrow">{localeText("Objectif commun")}</span><h2>{event.objective.name}</h2><p>{event.objective.description}</p>{data.nextMilestone && data.nextMilestone.percent <= 100 && <small className="event-next-milestone">{localeText("Prochain palier ·") + " "}{localeText(data.nextMilestone.label)}{" " + localeText("à") + " "}{data.nextMilestone.percent}%</small>}</div><div className="objective-value"><strong><CompactNumber value={Math.max(event.objective.minimum, objectiveCurrent)} label={localeText("Progression exacte")} /> / <CompactNumber value={event.objective.max} label={localeText("Objectif exact")} /></strong><span>{event.theme.healthUnit}{" " + localeText("restants")}</span>{objectiveCurrent < event.objective.minimum && <small>{localeText("Objectif dépassé de") + " "}<CompactNumber value={event.objective.minimum - objectiveCurrent} suffix={` ${event.theme.healthUnit}`} label={localeText("Dépassement exact")} /></small>}</div></div>
      <div className={`event-progress ${progressDisplay.hasHiddenBonus ? "has-undiscovered-bonus" : ""}`} role="img" aria-label={localeText("Progression : {value0} %{value1}", { value0: Math.round(data.progress), value1: progressDisplay.hasHiddenBonus ? ". D’autres bonus restent à découvrir." : "" })}><i style={{ width: `${progressDisplay.fill}%` }} />{progressDisplay.hasHiddenBonus && <b className="event-progress-reserve" title={localeText("D’autres bonus restent à découvrir")} aria-hidden="true" />}<span>{Math.round(data.progress)} %</span></div>
      <div className="event-milestones">{progressDisplay.visible.map((milestone) => <div key={milestone.id} className={progressDisplay.isReached(milestone) ? "reached" : ""} style={{ left: `${milestone.percent / progressDisplay.scale * 100}%` }} title={`${milestone.label} · ${milestone.percent}%`}><i /><small>{milestone.percent}%</small></div>)}</div>
      <div className="event-objective-actions">
        <button className="secondary" disabled={!user.admin && !reachedMilestones.length} onClick={() => setMilestonesOpen(true)}><Trophy size={17} /> {user.admin ? localeText("Voir tous les paliers ({value0})", { value0: event.objective.milestones.length }) : reachedMilestones.length ? localeText("Voir les {value0} paliers débloqués", { value0: reachedMilestones.length }) : localeText("Aucun palier débloqué")}</button>
        <button className="secondary" onClick={() => setCalculationOpen(true)}><HelpCircle size={17} />{" " + localeText("Règles de calcul")}</button>
      </div>
    </section>

    <div className="community-event-layout">
      <section className="community-event-main">
        <article className="card event-action-card">
          <div className="event-section-heading"><div><span className="eyebrow">{localeText("Action personnelle")}</span><h2>{event.theme.actionName}</h2></div>{data.participant && <span className="event-action-stock">{data.participant.availability.total > 1000000 ? "∞" : data.participant.availability.total}{" " + localeText("disponible(s)")}</span>}</div>
          {!data.participant ? <div className="event-join-panel"><ShieldCheck /><div><strong>{localeText("Prendre part à l’événement")}</strong><p>{event.texts.beforeJoin}</p><small>{localeText("Entrée :") + " "}<CompactNumber value={event.participation.entryCost} suffix={localeText(" jetons")} label={localeText("Coût exact")} /></small></div><button disabled={busy || event.status !== "active"} onClick={() => mutate(`/api/community-events/${event.id}/join`, { requestId: makeRequestId() }, "join")}>{busy === "join" ? localeText("Inscription…") : localeText("Participer")}</button></div> : <>
            <p className="event-after-join">{event.texts.afterJoin}</p>
            <div className="event-action-buttons">
              <button className={`event-primary-action ${rechargeDeadline ? "recharge-waiting" : ""}`} disabled={busy || event.status !== "active" || data.participant.availability.total < 1} onClick={() => mutate(`/api/community-events/${event.id}/actions`, { requestId: makeRequestId() }, "action")}>
                {busy === "action" ? <><Swords />{" " + localeText("Résolution…")}</> : rechargeDeadline ? <><Clock3 /><span className="event-recharge-label"><small>{localeText("Prochain ticket dans")}</small><strong>{formatCountdown(rechargeDeadline - now)}</strong></span></> : <><Swords />{event.theme.actionName}</>}
              </button>
            </div>
            <EventResult key={lastAction?.id ?? "empty"} action={lastAction} game={event.game} user={user} />
            {event.actions.allowPurchase && <div className="event-ticket-shop"><div className="event-ticket-shop-head"><span><Ticket /><strong>{localeText("Actions supplémentaires")}</strong></span><div><b><CompactNumber value={data.participant.availability.purchasedToday} /> / <CompactNumber value={data.participant.availability.purchaseMaxDaily} /></b><small>{localeText("achetées aujourd’hui au quota normal")}</small></div><div><b><CompactNumber value={data.participant.availability.purchasedTotal} /> / <CompactNumber value={data.participant.availability.purchaseMaxTotal} /></b><small>{localeText("quota normal total")}</small></div></div><div className="event-ticket-purchase"><div className="event-quantity-control"><button type="button" className="secondary icon-toggle" disabled={purchaseCount <= 1} onClick={() => setPurchaseCount((value) => Math.max(1, value - 1))} aria-label={localeText("Retirer une action")}><Minus /></button><label><span>{localeText("Quantité")}</span><input type="number" min="1" max="100" value={purchaseCount} onChange={(event) => setPurchaseCount(Math.max(1, Math.min(100, Math.trunc(Number(event.target.value) || 1))))} /></label><button type="button" className="secondary icon-toggle" disabled={purchaseCount >= 100} onClick={() => setPurchaseCount((value) => Math.min(100, value + 1))} aria-label={localeText("Ajouter une action")}><Plus /></button></div><div className="event-ticket-shortcuts">{[1, 5, 10].map((count) => <button type="button" className={purchaseCount === count ? "active" : "secondary"} key={count} onClick={() => setPurchaseCount(count)}>×{count}</button>)}</div><button disabled={busy || event.status !== "active" || !purchaseQuote || purchaseQuote.total > user.tokens} onClick={async () => { await mutate(`/api/community-events/${event.id}/actions/purchase`, { count: purchaseCount, requestId: makeRequestId() }, "purchase"); setPurchaseCount(1); }}><Coins /> {busy === "purchase" ? localeText("Achat…") : <>{localeText("Acheter ·") + " "}{purchaseQuote ? <CompactNumber value={purchaseQuote.total} label={localeText("Prix exact")} /> : "…"}</>}</button></div>{purchaseQuote?.overflowCount > 0 && <div className="event-overflow-price"><Zap /><span><strong>{purchaseQuote.overflowCount}{" " + localeText("ticket(s) hors quota")}</strong><small>{localeText("Tarif ×")}{event.actions.overflowPriceMultiplier}{localeText(", puis progression exponentielle ×")}{event.actions.overflowExponentBase}{" " + localeText("par ticket hors quota déjà acheté.")}</small></span></div>}</div>}
          </>}
        </article>

        <article className="card event-rules-card"><div className="event-section-heading"><div><span className="eyebrow">{localeText("Fonctionnement")}</span><h2>{localeText("Règles de l’événement")}</h2></div><button className="secondary" onClick={() => setCalculationOpen(true)}><HelpCircle size={17} />{" " + localeText("Voir les calculs")}</button></div><p>{event.description}</p><div className="event-rule-grid"><div><strong>{event.game.type === "dice" ? localeText("Lancer") : localeText("Pioche")}</strong><span>{event.game.type === "dice" ? localeText("{value0} dé(s) à {value1} faces par action", { value0: event.game.dice.count, value1: event.game.dice.faces }) : localeText("{value0} carte(s) par action · {value1} paquet(s)", { value0: event.game.cards.cardsPerAction, value1: event.game.cards.decks })}</span></div><div><strong>{localeText("Actions")}</strong><span>{event.actions.mode === "unlimited" ? localeText("Illimitées") : localeText("{value0} gratuites · mode {value1}", { value0: event.actions.freeCount, value1: event.actions.mode })}</span></div>{event.actions.allowPurchase && <div><strong><Ticket />{" " + localeText("Tickets quotidiens")}</strong><span>{event.actions.purchaseMaxDaily}{" " + localeText("au tarif normal ·") + " "}{event.actions.purchaseMaxTotal}{" " + localeText("sur l’événement")}</span></div>}{event.game.critical.enabled && <div><strong><Zap /> {localeText(event.game.critical.label)}</strong><span>{event.game.critical.chancePercent}% · +{event.game.critical.extraDraws} {event.game.type === "dice" ? localeText("dé") : localeText("carte")}{event.game.critical.extraDraws > 1 ? localeText("s") : ""}</span></div>}<div><strong>{localeText("Contribution minimale")}</strong><span><CompactNumber value={event.limits.minimumContribution} label={localeText("Contribution minimale exacte")} /></span></div><div><strong>{localeText("Récompense de participation")}</strong><span><CompactNumber value={event.rewards.participationReward} suffix={localeText(" jetons")} label={localeText("Récompense exacte")} /></span></div></div><EventEffectRules game={event.game} /></article>
      </section>

      <aside className="community-event-sidebar">
        {data.participant && <article className="card event-personal-stats"><span className="eyebrow">{localeText("Ma participation · rang #")}{data.personalRank}</span><h2><CompactNumber value={data.participant.contribution} suffix={localeText(" pts")} label={localeText("Contribution exacte")} /></h2><div><span>{localeText("Dégâts")}<strong><CompactNumber value={data.participant.damage} label={localeText("Dégâts exacts")} /></strong></span><span>{localeText("Actions")}<strong><CompactNumber value={data.participant.actions} label={localeText("Nombre exact d’actions")} /></strong></span><span>{localeText("Pot ajouté")}<strong><CompactNumber value={data.participant.potAdded} label={localeText("Ajout exact au pot")} /></strong></span><span>{localeText("Meilleure action")}<strong><CompactNumber value={data.participant.bestAction} label={localeText("Meilleure action exacte")} /></strong></span></div>{individualTiers.length > 0 && <div className="event-individual-tier"><Trophy /><span><small>{localeText("Palier individuel · contribution personnelle")}</small><strong>{currentIndividualTier?.name ?? localeText("Aucun palier")}</strong>{nextIndividualTier ? <b>{localeText("Encore") + " "}<CompactNumber value={nextIndividualTier.score - personalContribution} />{" " + localeText("pts pour") + " "}{nextIndividualTier.name}</b> : <b>{localeText("Palier maximal atteint")}</b>}</span></div>}{!data.reward && <div className="event-potential-reward"><Gift /><span>{refundPreview ? localeText("Remboursement si l'objectif reste inachevé") : localeText("Gain potentiel actuel")}<strong><CompactNumber value={data.potentialReward?.amount ?? 0} suffix={localeText(" jetons")} label={localeText("Gain potentiel exact")} /></strong><small>{refundPreview ? localeText("Frais d'entrée uniquement. La cagnotte se débloque à 100 %.") : data.potentialReward?.eligible ? data.potentialReward.detail?.tier : localeText("Effectue une action pour devenir éligible")}</small></span></div>}</article>}
        {data.reward && <article className="card event-reward-card"><Gift /><div><span>{entryRefund ? localeText("Remboursement effectué") : localeText("Récompense distribuée")}</span><strong><CompactNumber value={data.reward.amount} suffix={localeText(" jetons")} label={localeText("Montant exact")} /></strong><small>{data.reward.rank ? localeText("Rang #{value0} · ", { value0: data.reward.rank }) : ""}{data.reward.detail?.tier}</small></div></article>}
        {!!communityActiveEffects.length && <article className="card event-active-effects"><span className="eyebrow">{localeText("Effets actifs")}</span><h2>{localeText("Communauté")}</h2>{communityActiveEffects.map((effect) => <div key={effect.id}><Sparkles /><span><strong>{effect.label || effect.type}</strong><small title={effect.expiresAt ? localeText("Fin prévue : {value0}", { value0: new Date(effect.expiresAt).toLocaleString("fr-BE") }) : undefined}>{effect.expiresAt ? <>{localeText("Temps restant") + " "}<b>{formatCountdown(new Date(effect.expiresAt).getTime() - now)}</b></> : localeText("Prochaine action")}</small></span></div>)}</article>}
        <article className="card event-ranking-card"><div className="event-section-heading"><div><span className="eyebrow">{localeText("Classement")}</span><h2>{localeText("Communauté")}</h2></div><Trophy /></div><div className="event-ranking-tabs">{rankingOptions.map(([value, label]) => <button key={value} className={ranking === value ? "active" : ""} onClick={() => setRanking(value)}>{localeText(label)}</button>)}</div><div className="event-ranking-list">{orderedRanking.slice(0, event.rankings.limit).map((row, index) => <div key={row.userId} className={row.userId === user.id ? "me" : ""}><b>{index < 3 ? <Crown size={15} /> : `#${index + 1}`}</b><span>{row.pseudo}</span><strong><CompactNumber value={row[ranking] ?? 0} label={localeText("Valeur exacte")} /></strong></div>)}{!orderedRanking.length && <p>{localeText("Aucune contribution pour le moment.")}</p>}</div>{data.personalRank > event.rankings.limit && <div className="event-ranking-own-position">{localeText("Ta position actuelle :") + " "}<strong>#{data.personalRank}</strong></div>}</article>
        <article className="card event-feed"><div className="event-section-heading"><div><span className="eyebrow">{localeText("Direct")}</span><h2>{localeText("Activité récente")}</h2></div><Activity /></div>{data.recentActions.slice(0, 10).map((action) => <div key={action.id}><span><strong>{action.pseudo}</strong> · {action.result?.damage ?? 0}{" " + localeText("dégâts")}</span><small>{new Date(action.createdAt).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}</small></div>)}{!data.recentActions.length && <p>{localeText("La communauté n’a pas encore agi.")}</p>}</article>
      </aside>
    </div>
    {event.status === "finished" && data.participant && <section className="card event-final-summary">
      <div><span className="eyebrow">{localeText("Résultat final")}</span><h2>{objectiveReached ? event.texts.completed : localeText("Objectif non atteint")}</h2><p>{Math.floor(data.progress * 100) / 100}{localeText("% atteints ·") + " "}<CompactNumber value={event.runtime.participantCount} suffix={localeText(" participants")} />{" " + localeText("· pot final") + " "}<CompactNumber value={event.runtime.finalPot ?? 0} label={localeText("Pot final exact")} /></p></div>
      <div className="event-final-reward"><Gift /><span><small>{entryRefund ? localeText("Ton remboursement") : localeText("Ta récompense")}</small><strong><CompactNumber value={data.reward?.amount ?? 0} suffix={localeText(" jetons")} label={localeText("Montant exact")} /></strong><b>{data.reward?.detail?.tier ?? localeText("Non éligible")}</b></span></div>
      {entryRefund && <p>{localeText("Seuls les frais d'entrée ont été remboursés. Les achats d'actions ne sont pas remboursés; aucune part de cagnotte ni récompense de palier n'est attribuée.")}</p>}
      {data.reward?.detail && !entryRefund && <div className="event-reward-breakdown"><span>{localeText("Base")}<strong><CompactNumber value={data.reward.detail.participation} /></strong></span><span>{localeText("Bonus de palier")}<strong><CompactNumber value={data.reward.detail.tierFixed} /></strong></span><span>{localeText("Parts de cagnotte")}<strong><CompactNumber value={data.reward.detail.equalShare + data.reward.detail.proportionalShare + data.reward.detail.tierShare + data.reward.detail.rankingShare} /></strong></span><span>{localeText("Multiplicateurs")}<strong>×{data.reward.detail.tierMultiplier} · ×{data.reward.detail.communityMultiplier}</strong></span>{data.reward.detail.bonus && <span>{localeText("Bonus")}<strong>{data.reward.detail.bonus}</strong></span>}</div>}
      <details><summary>{localeText("Voir mes") + " "}{data.personalActions.length}{" " + localeText("action(s)")}</summary>{data.personalActions.map((action) => <div key={action.id}><span>{new Date(action.createdAt).toLocaleString("fr-BE")}</span><strong><CompactNumber value={action.result.damage} suffix={localeText(" dégâts")} /></strong><b><CompactNumber value={action.result.contribution} prefix="+" suffix={localeText(" pts")} /></b></div>)}</details>
    </section>}

    {milestonesOpen && <ModalBackdrop className="modal-backdrop" onClick={() => setMilestonesOpen(false)}><div className="modal event-information-modal" onClick={(eventClick) => eventClick.stopPropagation()}><div className="modal-title-row"><div><span className="eyebrow">{localeText("Progression communautaire")}</span><h2>{user.admin ? localeText("Tous les paliers configurés") : localeText("Paliers débloqués")}</h2><p>{user.admin ? localeText("Vue administrateur : seuils, états et effets de toute la progression.") : localeText("Ces paliers dépendent de l’avancée globale de toute la communauté.")}</p></div><button className="secondary icon-toggle" onClick={() => setMilestonesOpen(false)}><X size={18} /></button></div><div className="event-modal-list">{visibleMilestones.map((milestone) => {
      const reached = reachedMilestoneIds.has(milestone.id);
      const activeMilestoneEffects = effectsForMilestone(milestone);
      return <article className={reached ? "is-reached" : "is-locked"} key={milestone.id}><header>{reached ? <CheckCircle2 /> : <Trophy />}<span><strong>{localeText(milestone.label)}</strong><small>{reached ? localeText("Débloqué") : localeText("À débloquer")}{" " + localeText("à") + " "}{milestone.percent}{" " + localeText("% de progression communautaire")}</small></span></header>{milestone.effects?.length ? <div className="event-milestone-effects">{milestone.effects.map((effect) => {
        const active = activeMilestoneEffects.find((entry) => entry.sourceEffectId === effect.id || entry.id === effect.id);
        return <div key={effect.id}><Sparkles /><span><strong>{effect.label || effect.type}</strong><small>{eventEffectDescription(effect)}</small></span><b>{!reached ? localeText("Configuré") : active?.expiresAt ? formatCountdown(new Date(active.expiresAt).getTime() - now) : active || !effect.duration ? localeText("Appliqué") : localeText("Terminé")}</b></div>;
      })}</div> : <p>{localeText("Ce palier est honorifique et ne déclenche aucun effet automatique.")}</p>}</article>;
    })}</div><div className="modal-action-bar"><button onClick={() => setMilestonesOpen(false)}>{localeText("Fermer")}</button></div></div></ModalBackdrop>}

    {calculationOpen && <ModalBackdrop className="modal-backdrop" onClick={() => setCalculationOpen(false)}><div className="modal event-information-modal event-calculation-modal" onClick={(eventClick) => eventClick.stopPropagation()}><div className="modal-title-row"><div><span className="eyebrow">{localeText("Transparence")}</span><h2>{localeText("Règles de calcul")}</h2><p>{localeText("Ordre exact utilisé par le serveur pour résoudre une action et les récompenses.")}</p></div><button className="secondary icon-toggle" onClick={() => setCalculationOpen(false)}><X size={18} /></button></div><div className="event-calculation-steps">
      <section><b>01</b><div><h3>{event.game.type === "dice" ? localeText("Lancer des dés") : localeText("Pioche des cartes")}</h3><p>{event.game.type === "dice" ? localeText("{value0} dé(s) à {value1} faces. Dégâts de base : {value2}, multipliés par {value3}.", { value0: event.game.dice.count, value1: event.game.dice.faces, value2: event.game.dice.baseDamageMode === "sum" ? "somme des dés" : event.game.dice.baseDamageMode === "count" ? "nombre de dés" : "aucun", value3: event.game.dice.baseDamageMultiplier }) : localeText("{value0} carte(s), depuis {value1} paquet(s). Dégâts de base : {value2}, multipliés par {value3}.", { value0: event.game.cards.cardsPerAction, value1: event.game.cards.decks, value2: event.game.cards.baseDamageMode === "values" ? "somme des valeurs" : event.game.cards.baseDamageMode === "count" ? "nombre de cartes" : "aucun", value3: event.game.cards.baseDamageMultiplier })}</p></div></section>
      <section><b>02</b><div><h3>{localeText("Effets et combinaisons")}</h3><p>{event.game.type === "dice" ? localeText("Les effets de face sont appliqués pour chaque dé concerné, puis les {value0} combinaison(s) configurée(s) sont évaluées.", { value0: event.game.dice.combinations?.length ?? 0 }) : localeText("Les effets d’enseigne, de valeur et de carte précise sont cumulés lorsqu’ils sont activés.")}{" " + localeText("Les bonus fixes précèdent les multiplicateurs.")}</p><EventEffectRules game={event.game} /></div></section>
      <section><b>03</b><div><h3>{localeText("Action critique")}</h3><p>{event.game.critical.enabled ? localeText("{value0} % de chance : {value1} tirage(s) supplémentaire(s), dégâts ×{value2} et +{value3} contribution.", { value0: event.game.critical.chancePercent, value1: event.game.critical.extraDraws, value2: event.game.critical.damageMultiplier, value3: event.game.critical.contributionBonus }) : localeText("Les actions critiques sont désactivées pour cet événement.")}</p></div></section>
      <section><b>04</b><div><h3>{localeText("Contribution personnelle")}</h3><p>{localeText("Contribution de l’action = effets de contribution + dégâts finaux ×") + " "}{event.contribution.damageRatio}{event.contribution.dailyParticipation ? localeText(" + {value0} pour la première action du jour", { value0: event.contribution.dailyParticipation }) : ""}{event.contribution.communityEffect ? localeText(" + {value0} par effet communautaire", { value0: event.contribution.communityEffect }) : ""}{event.contribution.rareEvent ? localeText(" + {value0} par effet rare", { value0: event.contribution.rareEvent }) : ""}{localeText(". Cette valeur est ajoutée uniquement au total personnel du joueur.")}</p></div></section>
      <section><b>05</b><div><h3>{localeText("Progression communautaire")}</h3><p>{localeText("Progression = (maximum − valeur actuelle) ÷ (maximum − minimum) × 100. Si « Fin à zéro » est désactivé et « Continuer après réussite » activé, les actions continuent à augmenter la progression au-delà de 100 % jusqu’à l’échéance. Les paliers communautaires sont franchis par les dégâts cumulés de tous les participants.")}</p></div></section>
      <section><b>06</b><div><h3>{localeText("Paliers individuels et gain")}</h3><p>{localeText("Si l'événement se termine sous 100 %, seuls les frais d'entrée réellement payés sont remboursés, sans les achats d'actions. À partir de 100 %, les participants éligibles reçoivent la base, les bonus de palier, leurs multiplicateurs et les parts de cagnotte. Chaque palier individuel dépend de ta contribution personnelle.")}</p><div className="event-tier-scale">{individualTiers.map((tier) => <span className={tier.score <= personalContribution ? "reached" : ""} key={tier.id}><strong>{tier.name}</strong><small><CompactNumber value={tier.score} suffix={localeText(" pts personnels")} label={localeText("Contribution requise exacte")} /></small></span>)}</div></div></section>
    </div><div className="modal-action-bar"><button onClick={() => setCalculationOpen(false)}>{localeText("J’ai compris")}</button></div></div></ModalBackdrop>}
  </main>;
}
