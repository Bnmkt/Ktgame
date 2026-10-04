import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CalendarClock, CircleDollarSign, Clock3, Coins, Copy, Dice5, Eye, Gift, Layers3, Plus, Save, Search, Sparkles, Swords, Trash2, Users, X } from "lucide-react";
import { api } from "../../api.js";
import { ConfirmActionButton, ConfirmDialog } from "../common/ConfirmAction.jsx";
import { Die, PlayingCard } from "../game/GamePieces.jsx";
import { CompactNumber } from "../../utils/presentation.jsx";
import { EventCombinationsEditor } from "./EventCombinationsEditor.jsx";
import { DateTimeInput } from "../common/DateTimeInput.jsx";
import { browserTimeZone } from "../../utils/dates.js";

const labels = { draft: "Brouillon", scheduled: "Planifié", active: "En cours", finished: "Terminé", cancelled: "Annulé" };
const editorTabs = [["general", "Général"], ["objective", "Objectif"], ["game", "Jeu & effets"], ["actions", "Actions"], ["rewards", "Pot & gains"], ["appearance", "Apparence"], ["monitoring", "Suivi"]];
const effectTypes = [["none", "Aucun"], ["damageFixed", "Dégâts fixes"], ["damageBonus", "Bonus de dégâts"], ["damageMultiplier", "Multiplicateur de dégâts"], ["contribution", "Contribution"], ["pot", "Ajouter au pot"], ["tokens", "Gain immédiat"], ["extraAction", "Action supplémentaire"], ["personalMultiplier", "Multiplicateur personnel"], ["communityMultiplier", "Multiplicateur communautaire"], ["temporaryBonus", "Bonus temporaire"], ["temporaryMalus", "Malus temporaire"], ["special", "Effet spécial"]];
const cardSuits = [["hearts", "Cœur", "♥"], ["diamonds", "Carreau", "♦"], ["clubs", "Trèfle", "♣"], ["spades", "Pique", "♠"]];
const cardRanks = [["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"], ["7", "7"], ["8", "8"], ["9", "9"], ["10", "10"], ["J", "Valet"], ["Q", "Dame"], ["K", "Roi"], ["A", "As"]];
const cardScopeLabels = { suitEffects: "Famille", valueEffects: "Valeur", specificEffects: "Carte précise" };
const clone = (value) => structuredClone(value);

function deepSet(source, path, value) {
  const result = clone(source);
  const keys = path.split(".");
  let target = result;
  keys.slice(0, -1).forEach((key) => { target[key] ??= {}; target = target[key]; });
  target[keys.at(-1)] = value;
  return result;
}

function Field({ label, hint, children }) { return <label>{label}{children}{hint && <small>{hint}</small>}</label>; }
function Toggle({ checked, onChange, title, text }) { return <label className="event-admin-toggle"><span><strong>{title}</strong><small>{text}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>; }

function EffectRows({ rows = [], onChange }) {
  function update(index, field, value) { const next = clone(rows); next[index] = { ...next[index], [field]: value }; onChange(next); }
  return <div className="event-effect-editor">
    {rows.map((effect, index) => <div className="event-effect-row" key={effect.id ?? index}>
      <select value={effect.type} onChange={(event) => update(index, "type", event.target.value)}>{effectTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <input aria-label="Valeur" type="number" step="0.01" value={effect.value ?? 0} onChange={(event) => update(index, "value", Number(event.target.value))} />
      <select aria-label="Cible" value={effect.target ?? "player"} onChange={(event) => update(index, "target", event.target.value)}><option value="player">Joueur</option><option value="community">Communauté</option><option value="objective">Objectif</option><option value="pot">Pot</option><option value="nextAction">Prochaine action</option></select>
      <select aria-label="Statistique" value={effect.stat ?? "damage"} onChange={(event) => update(index, "stat", event.target.value)}><option value="damage">Dégâts</option><option value="contribution">Contribution</option><option value="actionPrice">Prix d’action</option></select>
      <input aria-label="Durée" title="Durée" type="number" min="0" value={effect.duration ?? 0} onChange={(event) => update(index, "duration", Number(event.target.value))} />
      <select aria-label="Unité de durée" value={effect.durationUnit ?? "minutes"} onChange={(event) => update(index, "durationUnit", event.target.value)}><option value="seconds">Secondes</option><option value="minutes">Minutes</option><option value="hours">Heures</option></select>
      <input aria-label="Libellé" value={effect.label ?? ""} onChange={(event) => update(index, "label", event.target.value)} placeholder="Libellé public" />
      <ConfirmActionButton className="secondary icon-toggle" title="Supprimer cet effet" dialogTitle="Supprimer cet effet ?" message={`L’effet « ${effect.label || effectTypes.find(([type]) => type === effect.type)?.[1] || effect.type} » sera retiré de cette configuration.`} confirmLabel="Supprimer l’effet" danger onConfirm={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}><X size={15} /></ConfirmActionButton>
    </div>)}
    <button type="button" className="secondary event-add-row" onClick={() => onChange([...rows, { id: crypto.randomUUID(), type: "damageBonus", value: 1, target: "player", stat: "damage", duration: 0, durationUnit: "minutes", label: "" }])}><Plus size={16} /> Ajouter un effet</button>
  </div>;
}

function EventPreview({ event, action, onSimulate, busy }) {
  const result = action?.result;
  const rawProgress = Math.max(0, (event.objective.max - (event.runtime?.currentValue ?? event.objective.startValue)) / Math.max(1, event.objective.max - event.objective.minimum) * 100);
  const progress = event.objective.finishAtMinimum === false && event.objective.continueAfterCompletion ? rawProgress : Math.min(100, rawProgress);
  const backgroundImage = String(event.theme.backgroundImage ?? "").trim();
  const heroImage = String(event.theme.heroImage ?? "").trim();
  return <aside className="event-admin-preview" style={{ "--event-primary": event.theme.primary, "--event-secondary": event.theme.secondary, "--event-accent": event.theme.accent, ...(backgroundImage ? { backgroundImage: `linear-gradient(160deg, color-mix(in srgb, ${event.theme.primary} 30%, rgba(5,9,8,.82)), rgba(5,9,8,.88)), url(${JSON.stringify(backgroundImage)})` } : {}) }}>
    <span className="eyebrow">Prévisualisation réelle</span>
    <div className="event-admin-preview-hero">
      {heroImage && <div className="event-admin-preview-hero-image"><img src={heroImage} alt="" style={{ objectPosition: `${event.theme.heroPositionX ?? 50}% ${event.theme.heroPositionY ?? 50}%`, transform: `scale(${(event.theme.heroScale ?? 100) / 100})`, transformOrigin: `${event.theme.heroPositionX ?? 50}% ${event.theme.heroPositionY ?? 50}%` }} /></div>}
      <div><span className={`event-status status-${event.status}`}>{labels[event.status]}</span><h2>{event.theme.title || event.name}</h2><p>{event.theme.subtitle}</p></div>
    </div>
    <div className="event-preview-objective"><div><strong>{event.objective.name} · {Math.round(progress)} %</strong><span><CompactNumber value={Math.max(event.objective.minimum, event.runtime?.currentValue ?? event.objective.startValue)} suffix={` ${event.theme.healthUnit}`} label="Valeur exacte" /></span></div><i><b style={{ width: `${Math.min(100, progress)}%` }} /></i></div>
    <div className="event-preview-stats"><span>Pot<strong><CompactNumber value={event.runtime?.pot || event.pot.initial} label="Pot exact" /></strong></span><span>Entrée<strong><CompactNumber value={event.participation.entryCost} label="Coût exact" /></strong></span><span>Gain de base<strong><CompactNumber value={event.rewards.participationReward} label="Gain exact" /></strong></span></div>
    <div className="event-preview-draw">{result?.dice?.map((value, index) => value <= 6 ? <Die key={index} value={value} /> : <b key={index}>{value}</b>)}{result?.cards?.map((card, index) => <PlayingCard key={index} card={{ ...card, suit: { hearts: "H", diamonds: "D", clubs: "C", spades: "S" }[card.suit] }} />)}{!result && <span>Utilise la simulation pour vérifier les probabilités et effets.</span>}</div>
    {result?.critical && <div className="event-critical-badge"><Sparkles /> {result.criticalLabel || "Action critique"} · +{result.extraDraws} {result.type === "dice" ? "dé" : "carte"}{result.extraDraws > 1 ? "s" : ""}</div>}
    {result && <div className="event-preview-impact"><strong>-{result.damage} dégâts</strong><span>+{result.contribution} contribution</span></div>}
    {!!result?.combinations?.length && <div className="event-trigger-list">{result.combinations.map((name, index) => <b key={index}>{name}</b>)}</div>}
    <button type="button" onClick={onSimulate} disabled={busy}><Dice5 /> {busy ? "Simulation…" : "Simuler une action"}</button>
  </aside>;
}

function EventEditor({ detail, shop, onClose, onSaved, reportError }) {
  const [draft, setDraft] = useState(() => clone(detail.event));
  const [tab, setTab] = useState("general");
  const [busy, setBusy] = useState("");
  const [previewAction, setPreviewAction] = useState(null);
  const [selectedFace, setSelectedFace] = useState(() => String(Object.keys(detail.event.game?.dice?.faceEffects ?? {})[0] ?? 1));
  const [cardScope, setCardScope] = useState("suitEffects");
  const [cardKey, setCardKey] = useState("hearts");
  const finished = draft.status === "finished";
  const started = finished;
  const launched = Boolean(draft.startedAtActual) || draft.status === "active" || finished;
  const set = (path, value) => setDraft((current) => deepSet(current, path, value));

  async function save() {
    const invalid = document.querySelector(".community-event-editor input:invalid");
    if (invalid) { invalid.reportValidity(); return; }
    setBusy("save"); reportError("");
    try { const result = await api(`/api/admin/community-events/${draft.id}`, { method: "PATCH", body: JSON.stringify(draft) }); setDraft(clone(result.event)); await onSaved(); }
    catch (error) { reportError(error.message); } finally { setBusy(""); }
  }
  async function simulate() {
    setBusy("preview");
    try { const result = await api("/api/admin/community-events/preview", { method: "POST", body: JSON.stringify(draft) }); setPreviewAction(result.action); }
    catch (error) { reportError(error.message); } finally { setBusy(""); }
  }
  function addMilestone() { set("objective.milestones", [...draft.objective.milestones, { id: crypto.randomUUID(), percent: 50, label: "Nouveau palier", effects: [] }]); }
  function updateMilestone(index, field, value) { const rows = clone(draft.objective.milestones); rows[index][field] = value; set("objective.milestones", rows); }
  function addTier() { set("rewards.tiers", [...draft.rewards.tiers, { id: crypto.randomUUID(), name: "Nouveau palier", score: 0, fixed: 0, potPercent: 0, multiplier: 1, cosmeticId: "" }]); }
  function updateTier(index, field, value) { const rows = clone(draft.rewards.tiers); rows[index][field] = value; set("rewards.tiers", rows); }

  const availableCardRanks = draft.game.cards.jokers ? [...cardRanks, ["JOKER", "Joker"]] : cardRanks;
  const [specificRank = "A", specificSuit = "hearts"] = cardKey.split("-");
  const cardEffectMap = draft.game.cards[cardScope] ?? {};
  const activeCardEffects = cardEffectMap[cardKey] ?? [];
  const configuredCardTriggers = Object.entries(cardEffectMap).filter(([, effects]) => effects?.length).map(([key]) => key);
  const cardScopeEnabled = cardScope === "suitEffects" ? draft.game.cards.useSuitEffects : cardScope === "valueEffects" ? draft.game.cards.useValueEffects : draft.game.cards.useSpecificEffects;
  const cardTriggerLabel = cardScope === "suitEffects"
    ? cardSuits.find(([key]) => key === cardKey)?.[1] ?? cardKey
    : cardScope === "valueEffects"
      ? availableCardRanks.find(([key]) => key === cardKey)?.[1] ?? cardKey
      : specificRank === "JOKER" ? "Joker" : `${availableCardRanks.find(([key]) => key === specificRank)?.[1] ?? specificRank} de ${cardSuits.find(([key]) => key === specificSuit)?.[1] ?? specificSuit}`;
  const cardTriggerSymbol = cardScope === "suitEffects"
    ? cardSuits.find(([key]) => key === cardKey)?.[2] ?? "?"
    : cardScope === "valueEffects"
      ? cardKey === "JOKER" ? "★" : cardKey
      : specificRank === "JOKER" ? "★" : `${specificRank}${cardSuits.find(([key]) => key === specificSuit)?.[2] ?? ""}`;
  const cardTriggerIsRed = cardScope === "suitEffects"
    ? ["hearts", "diamonds"].includes(cardKey)
    : cardScope === "specificEffects" && ["hearts", "diamonds"].includes(specificSuit);

  function selectCardScope(scope) {
    setCardScope(scope);
    if (scope === "suitEffects") setCardKey("hearts");
    else if (scope === "valueEffects") setCardKey("A");
    else setCardKey("A-hearts");
  }

  function updateCardEffects(effects) {
    const next = { ...cardEffectMap };
    if (effects.length) next[cardKey] = effects;
    else delete next[cardKey];
    set(`game.cards.${cardScope}`, next);
  }
  const diceFaceCount = Math.max(2, Math.min(100, Number(draft.game.dice.faces) || 6));
  const activeFace = String(Math.max(1, Math.min(diceFaceCount, Number(selectedFace) || 1)));
  const faceEffects = draft.game.dice.faceEffects ?? {};
  const configuredFaces = Object.entries(faceEffects)
    .filter(([face, effects]) => Number(face) >= 1 && Number(face) <= diceFaceCount && effects?.length)
    .map(([face]) => Number(face))
    .sort((left, right) => left - right);
  const visibleFaces = diceFaceCount <= 20
    ? Array.from({ length: diceFaceCount }, (_, index) => index + 1)
    : [...new Set([Number(activeFace), ...configuredFaces])].sort((left, right) => left - right);

  function updateFaceEffects(effects) {
    const next = { ...faceEffects };
    if (effects.length) next[activeFace] = effects;
    else delete next[activeFace];
    set("game.dice.faceEffects", next);
  }

  return <div className="modal-backdrop" onClick={onClose}><div className="modal community-event-editor" onClick={(event) => event.stopPropagation()}>
    <header className="event-editor-header"><div><span className="eyebrow">Moteur événementiel</span><h2>{draft.internalName}</h2><div><span className={`event-status status-${draft.status}`}>{labels[draft.status]}</span>{draft.status === "active" && <small>Les changements s’appliquent immédiatement ; l’adresse et la date de début restent fixes.</small>}{finished && <small>Événement clôturé : configuration archivée en lecture seule.</small>}</div></div><button className="secondary icon-toggle" onClick={onClose}><X /></button></header>
    <nav className="event-editor-tabs">{editorTabs.map(([value, label]) => <button type="button" key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>
    <div className="event-editor-layout"><fieldset className="event-editor-form" disabled={finished}>
      {tab === "general" && <>
        <section className="admin-form-section"><h3>Identité et publication</h3><div className="admin-field-grid"><Field label="Nom interne"><input value={draft.internalName} onChange={(e) => set("internalName", e.target.value)} /></Field><Field label="Nom affiché"><input value={draft.name} onChange={(e) => set("name", e.target.value)} /></Field><Field label="Slug" hint={launched ? "Adresse figée depuis le lancement." : "Adresse publique de l’événement."}><input disabled={launched} value={draft.slug} onChange={(e) => set("slug", e.target.value)} /></Field></div><Field label="Résumé"><input value={draft.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} /></Field><Field label="Description complète"><textarea value={draft.description} onChange={(e) => set("description", e.target.value)} /></Field></section>
        <section className="admin-form-section"><h3>Fenêtre temporelle</h3><p>Heures locales · {browserTimeZone()}</p><div className="admin-field-grid"><Field label="Début"><DateTimeInput required disabled={launched} value={draft.startsAt} onValueChange={(value) => set("startsAt", value || null)} /></Field><Field label="Fin"><DateTimeInput required value={draft.endsAt} onValueChange={(value) => set("endsAt", value || null)} /></Field></div><div className="event-duration-readout"><Clock3 /><span>Durée calculée</span><strong>{Math.max(0, (new Date(draft.endsAt) - new Date(draft.startsAt)) / 60000).toLocaleString("fr-BE")} minutes</strong><small>10 minutes minimum · 30 jours maximum</small></div><div className="event-toggle-grid"><Toggle title="Démarrage automatique" text="Active l’événement à la date prévue." checked={draft.autoStart} onChange={(value) => set("autoStart", value)} /><Toggle title="Clôture automatique" text="Distribue les gains à l’échéance." checked={draft.autoFinish} onChange={(value) => set("autoFinish", value)} /><Toggle title="Visible avant le début" text="Affiche la promotion sur l’accueil." checked={draft.showBeforeStart} onChange={(value) => set("showBeforeStart", value)} /></div></section>
      </>}
      {tab === "objective" && <>
        <section className="admin-form-section"><h3>Objectif global</h3><div className="admin-field-grid"><Field label="Nom"><input value={draft.objective.name} onChange={(e) => set("objective.name", e.target.value)} /></Field><Field label="Maximum"><input type="number" disabled={started} value={draft.objective.max} onChange={(e) => set("objective.max", Number(e.target.value))} /></Field><Field label="Valeur de départ"><input type="number" disabled={started} value={draft.objective.startValue} onChange={(e) => set("objective.startValue", Number(e.target.value))} /></Field><Field label="Minimum"><input type="number" disabled={started} value={draft.objective.minimum} onChange={(e) => set("objective.minimum", Number(e.target.value))} /></Field></div><Field label="Description"><textarea value={draft.objective.description} onChange={(e) => set("objective.description", e.target.value)} /></Field><div className="event-toggle-grid"><Toggle title="Fin à zéro" text="Clôture dès que le minimum est atteint." checked={draft.objective.finishAtMinimum} onChange={(value) => set("objective.finishAtMinimum", value)} /><Toggle title="Continuer après réussite" text="Autorise encore les actions jusqu’à l’échéance. Avec Fin à zéro désactivé, la progression peut dépasser 100 %." checked={draft.objective.continueAfterCompletion} onChange={(value) => set("objective.continueAfterCompletion", value)} /></div></section>
        <section className="admin-form-section"><div className="admin-form-heading"><div><h3>Paliers communautaires</h3><p>Chaque palier peut déclencher plusieurs effets. Les seuils supérieurs à 100 % nécessitent Fin à zéro désactivé et Continuer après réussite activé.</p></div><button type="button" className="secondary" onClick={addMilestone}><Plus /> Palier</button></div>{draft.objective.milestones.map((row, index) => <details className="event-config-row" key={row.id} open><summary><strong>{row.label}</strong><span>{row.percent}%</span></summary><div className="admin-field-grid"><Field label="Libellé"><input value={row.label} onChange={(e) => updateMilestone(index, "label", e.target.value)} /></Field><Field label="Progression"><input type="number" min="0" value={row.percent} onChange={(e) => updateMilestone(index, "percent", Number(e.target.value))} /></Field></div><EffectRows rows={row.effects} onChange={(effects) => updateMilestone(index, "effects", effects)} /><ConfirmActionButton className="text-danger" dialogTitle="Supprimer ce palier ?" message={`« ${row.label} » et ses réglages seront retirés de cet événement.`} confirmLabel="Supprimer" danger onConfirm={() => set("objective.milestones", draft.objective.milestones.filter((_, i) => i !== index))}>Supprimer ce palier</ConfirmActionButton></details>)}</section>
      </>}
      {tab === "game" && <>
        <section className="admin-form-section"><h3>Support de jeu</h3><div className="event-segmented"><button type="button" disabled={started} className={draft.game.type === "dice" ? "active" : ""} onClick={() => set("game.type", "dice")}><Dice5 /> Dés</button><button type="button" disabled={started} className={draft.game.type === "cards" ? "active" : ""} onClick={() => set("game.type", "cards")}><Layers3 /> Cartes</button></div></section>
        {draft.game.type === "dice" ? <>
          <section className="admin-form-section"><h3>Configuration des dés</h3><div className="admin-field-grid"><Field label="Nombre de dés"><input type="number" min="1" max="20" disabled={started} value={draft.game.dice.count} onChange={(e) => set("game.dice.count", Number(e.target.value))} /></Field><Field label="Faces"><input type="number" min="2" max="100" disabled={started} value={draft.game.dice.faces} onChange={(e) => set("game.dice.faces", Number(e.target.value))} /></Field><Field label="Dégâts de base"><select disabled={started} value={draft.game.dice.baseDamageMode} onChange={(e) => set("game.dice.baseDamageMode", e.target.value)}><option value="sum">Somme des dés</option><option value="count">Nombre de dés</option><option value="none">Aucun</option></select></Field><Field label="Multiplicateur"><input type="number" min="0" step="0.1" disabled={started} value={draft.game.dice.baseDamageMultiplier} onChange={(e) => set("game.dice.baseDamageMultiplier", Number(e.target.value))} /></Field></div><Toggle title="Dés pondérés" text="Configure la fréquence de chaque face." checked={draft.game.dice.weighted} onChange={(value) => set("game.dice.weighted", value)} /></section>
          <section className="admin-form-section event-face-effects-section">
            <div className="admin-form-heading">
              <div><h3>Effets unitaires par face</h3><p>Chaque face possède sa propre liste d’effets, exécutée à chaque dé qui affiche cette valeur.</p></div>
              <span className="event-face-summary">{configuredFaces.length} / {diceFaceCount} configurée{configuredFaces.length > 1 ? "s" : ""}</span>
            </div>
            <div className="event-face-tabs" role="tablist" aria-label="Faces du dé">
              {visibleFaces.map((face) => {
                const key = String(face);
                const effectCount = faceEffects[key]?.length ?? 0;
                return <button
                  type="button"
                  role="tab"
                  aria-selected={key === activeFace}
                  className={`${key === activeFace ? "active" : ""}${effectCount ? " configured" : ""}`.trim()}
                  key={face}
                  onClick={() => setSelectedFace(key)}
                >
                  <strong>Face {face}</strong>
                  <small>{effectCount ? `${effectCount} effet${effectCount > 1 ? "s" : ""}` : "Aucun effet"}</small>
                </button>;
              })}
            </div>
            <div className="event-face-access">
              <Field label="Accéder à la face" hint={diceFaceCount > 20 ? "Les faces sans effet ne sont pas toutes affichées au-dessus." : "Tu peux aussi sélectionner une face dans la liste."}>
                <input type="number" min="1" max={diceFaceCount} value={activeFace} onChange={(event) => setSelectedFace(String(Math.max(1, Math.min(diceFaceCount, Number(event.target.value) || 1))))} />
              </Field>
            </div>
            <div className="event-face-editor-panel">
              <header>
                <span className="event-face-number">{activeFace}</span>
                <div><strong>Effets de la face {activeFace}</strong><small>{faceEffects[activeFace]?.length ? `${faceEffects[activeFace].length} effet${faceEffects[activeFace].length > 1 ? "s" : ""} seront tous appliqués.` : "Aucun effet : seuls les dégâts de base s’appliquent."}</small></div>
                {draft.game.dice.weighted && <Field label="Poids"><input type="number" min="0" step="0.1" value={draft.game.dice.weights?.[activeFace] ?? 1} onChange={(event) => set("game.dice.weights", { ...draft.game.dice.weights, [activeFace]: Number(event.target.value) })} /></Field>}
              </header>
              <EffectRows rows={faceEffects[activeFace] ?? []} onChange={updateFaceEffects} />
            </div>
            <p className="event-face-note"><Sparkles size={15} /> Exemple : avec deux dés affichant {activeFace}, tous les effets de cette face sont joués deux fois. Les effets de combinaison se cumulent ensuite.</p>
          </section>
        </> : <>
          <section className="admin-form-section"><h3>Configuration des cartes</h3><div className="admin-field-grid"><Field label="Paquets"><input type="number" min="1" max="20" disabled={started} value={draft.game.cards.decks} onChange={(e) => set("game.cards.decks", Number(e.target.value))} /></Field><Field label="Cartes par action"><input type="number" min="1" max="20" disabled={started} value={draft.game.cards.cardsPerAction} onChange={(e) => set("game.cards.cardsPerAction", Number(e.target.value))} /></Field><Field label="Mode de pioche"><select disabled={started} value={draft.game.cards.deckMode} onChange={(e) => set("game.cards.deckMode", e.target.value)}><option value="personal">Paquet personnel</option><option value="community">Paquet communautaire</option></select></Field><Field label="Dégâts de base"><select disabled={started} value={draft.game.cards.baseDamageMode} onChange={(e) => set("game.cards.baseDamageMode", e.target.value)}><option value="values">Valeur des cartes</option><option value="count">Nombre de cartes</option><option value="none">Aucun</option></select></Field><Field label="Multiplicateur"><input type="number" min="0" step="0.1" disabled={started} value={draft.game.cards.baseDamageMultiplier} onChange={(e) => set("game.cards.baseDamageMultiplier", Number(e.target.value))} /></Field></div><div className="event-toggle-grid"><Toggle title="Jokers" text="Ajoute deux jokers par paquet." checked={draft.game.cards.jokers} onChange={(value) => set("game.cards.jokers", value)} /><Toggle title="Remise en pioche" text="Les cartes reviennent après chaque action." checked={draft.game.cards.replaceAfterDraw} onChange={(value) => set("game.cards.replaceAfterDraw", value)} /><Toggle title="Effets de famille" text="Cœur, carreau, trèfle et pique." checked={draft.game.cards.useSuitEffects} onChange={(value) => set("game.cards.useSuitEffects", value)} /><Toggle title="Effets de valeur" text="De 2 à As, plus Joker." checked={draft.game.cards.useValueEffects} onChange={(value) => set("game.cards.useValueEffects", value)} /><Toggle title="Cartes spécifiques" text="Combine famille et valeur." checked={draft.game.cards.useSpecificEffects} onChange={(value) => set("game.cards.useSpecificEffects", value)} /></div></section>
          <section className="admin-form-section event-card-effects-section">
            <div className="admin-form-heading"><div><h3>Effets des cartes</h3><p>Configure plusieurs déclencheurs, chacun avec sa propre liste d’effets.</p></div><span className="event-face-summary">{configuredCardTriggers.length} configuré{configuredCardTriggers.length > 1 ? "s" : ""}</span></div>
            <div className="event-segmented event-card-scope" role="tablist" aria-label="Type de déclencheur des cartes">
              {[["suitEffects", "Familles"], ["valueEffects", "Valeurs"], ["specificEffects", "Cartes précises"]].map(([scope, label]) => <button type="button" role="tab" aria-selected={cardScope === scope} className={cardScope === scope ? "active" : ""} key={scope} onClick={() => selectCardScope(scope)}>{label}<small>{Object.values(draft.game.cards[scope] ?? {}).filter((effects) => effects?.length).length}</small></button>)}
            </div>
            <div className="event-card-draw-summary"><Layers3 /><span><strong>{draft.game.cards.cardsPerAction} carte{draft.game.cards.cardsPerAction > 1 ? "s" : ""} par action</strong><small>Chaque carte applique tous ses effets de famille, de valeur et de carte précise.</small></span></div>
            {!cardScopeEnabled && <div className="event-card-scope-warning"><AlertTriangle /> Cette famille de déclencheurs est désactivée dans la configuration des cartes. Ses réglages sont conservés mais ne seront pas appliqués.</div>}
            {cardScope === "suitEffects" && <div className="event-card-trigger-grid">{cardSuits.map(([key, label, symbol]) => {
              const effectCount = cardEffectMap[key]?.length ?? 0;
              return <button type="button" className={`${cardKey === key ? "active" : ""}${effectCount ? " configured" : ""}${["hearts", "diamonds"].includes(key) ? " red" : ""}`.trim()} key={key} onClick={() => setCardKey(key)}><b>{symbol}</b><span><strong>{label}</strong><small>{effectCount ? `${effectCount} effet${effectCount > 1 ? "s" : ""}` : "Aucun effet"}</small></span></button>;
            })}</div>}
            {cardScope === "valueEffects" && <div className="event-card-value-grid">{availableCardRanks.map(([key, label]) => {
              const effectCount = cardEffectMap[key]?.length ?? 0;
              return <button type="button" className={`${cardKey === key ? "active" : ""}${effectCount ? " configured" : ""}`.trim()} key={key} onClick={() => setCardKey(key)}><strong>{key === "JOKER" ? "★" : key}</strong><small>{effectCount ? `${effectCount} effet${effectCount > 1 ? "s" : ""}` : label}</small></button>;
            })}</div>}
            {cardScope === "specificEffects" && <>
              <div className="event-card-specific-picker">
                <Field label="Valeur"><select value={specificRank} onChange={(event) => setCardKey(event.target.value === "JOKER" ? "JOKER-joker" : `${event.target.value}-${specificSuit === "joker" ? "hearts" : specificSuit}`)}>{availableCardRanks.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
                <Field label="Famille"><select disabled={specificRank === "JOKER"} value={specificRank === "JOKER" ? "joker" : specificSuit} onChange={(event) => setCardKey(`${specificRank}-${event.target.value}`)}>{cardSuits.map(([key, label, symbol]) => <option key={key} value={key}>{symbol} {label}</option>)}{specificRank === "JOKER" && <option value="joker">Joker</option>}</select></Field>
              </div>
              {!!configuredCardTriggers.length && <div className="event-card-configured-list"><span>Cartes déjà configurées</span><div>{configuredCardTriggers.map((key) => <button type="button" className={cardKey === key ? "active" : "secondary"} key={key} onClick={() => setCardKey(key)}>{key.replace("-hearts", " ♥").replace("-diamonds", " ♦").replace("-clubs", " ♣").replace("-spades", " ♠").replace("JOKER-joker", "★ Joker")} <small>{cardEffectMap[key].length}</small></button>)}</div></div>}
            </>}
            <div className="event-card-effect-panel">
              <header><span className={`event-card-trigger-preview ${cardTriggerIsRed ? "red" : ""}`}>{cardTriggerSymbol}</span><div><small>{cardScopeLabels[cardScope]}</small><strong>{cardTriggerLabel}</strong><span>{activeCardEffects.length ? `${activeCardEffects.length} effet${activeCardEffects.length > 1 ? "s" : ""} seront tous appliqués.` : "Aucun effet configuré."}</span></div></header>
              <EffectRows rows={activeCardEffects} onChange={updateCardEffects} />
            </div>
            <p className="event-face-note"><Sparkles size={15} /> Exemple : un Roi de Cœur cumule les effets de « Cœur », de « Roi » et de « Roi de Cœur ». Ce calcul est répété pour chacune des {draft.game.cards.cardsPerAction} cartes tirées.</p>
          </section>
        </>}
        <EventCombinationsEditor game={draft.game} onChange={(rows) => set(`game.${draft.game.type}.combinations`, rows)} renderEffects={(rows, onChange) => <EffectRows rows={rows} onChange={onChange} />} />
        <section className="admin-form-section"><h3>Action critique</h3><Toggle title="Activer les critiques" text={`Ajoute automatiquement ${draft.game.type === "dice" ? "des dés" : "des cartes"} au tirage lorsque le critique se déclenche.`} checked={draft.game.critical.enabled} onChange={(value) => set("game.critical.enabled", value)} />{draft.game.critical.enabled && <><div className="admin-field-grid"><Field label="Probabilité (%)"><input type="number" min="0" max="100" step="0.1" disabled={started} value={draft.game.critical.chancePercent} onChange={(e) => set("game.critical.chancePercent", Number(e.target.value))} /></Field><Field label={draft.game.type === "dice" ? "Dés supplémentaires" : "Cartes supplémentaires"}><input type="number" min="1" max="20" disabled={started} value={draft.game.critical.extraDraws} onChange={(e) => set("game.critical.extraDraws", Number(e.target.value))} /></Field><Field label="Multiplicateur de dégâts"><input type="number" min="0" step="0.1" disabled={started} value={draft.game.critical.damageMultiplier} onChange={(e) => set("game.critical.damageMultiplier", Number(e.target.value))} /></Field><Field label="Contribution bonus"><input type="number" min="0" disabled={started} value={draft.game.critical.contributionBonus} onChange={(e) => set("game.critical.contributionBonus", Number(e.target.value))} /></Field></div><Field label="Libellé public"><input value={draft.game.critical.label} onChange={(e) => set("game.critical.label", e.target.value)} /></Field><EffectRows rows={draft.game.critical.effects ?? []} onChange={(effects) => set("game.critical.effects", effects)} /></>}</section>
      </>}
      {tab === "actions" && <>
        <section className="admin-form-section"><h3>Accès et quota</h3><div className="admin-field-grid"><Field label="Coût d’entrée"><input type="number" min="0" disabled={started} value={draft.participation.entryCost} onChange={(e) => set("participation.entryCost", Number(e.target.value))} /></Field><Field label="Versement au pot"><select disabled={started} value={draft.participation.potContributionMode} onChange={(e) => set("participation.potContributionMode", e.target.value)}><option value="fixed">Montant fixe</option><option value="percentage">Pourcentage</option></select></Field><Field label="Valeur"><input type="number" min="0" disabled={started} value={draft.participation.potContributionValue} onChange={(e) => set("participation.potContributionValue", Number(e.target.value))} /></Field></div><div className="admin-field-grid"><Field label="Mode"><select disabled={started} value={draft.actions.mode} onChange={(e) => set("actions.mode", e.target.value)}><option value="total">Total événement</option><option value="daily">Quotidien</option><option value="period">Par période</option><option value="recharge">Recharge progressive</option><option value="unlimited">Illimité</option></select></Field><Field label="Actions gratuites"><input type="number" min="0" disabled={started} value={draft.actions.freeCount} onChange={(e) => set("actions.freeCount", Number(e.target.value))} /></Field><Field label="Période / recharge (minutes)"><input type="number" min="1" disabled={started} value={draft.actions.periodMinutes} onChange={(e) => set("actions.periodMinutes", Number(e.target.value))} /></Field><Field label="Maximum par joueur"><input type="number" min="1" value={draft.limits.maximumActionsPerUser} onChange={(e) => set("limits.maximumActionsPerUser", Number(e.target.value))} /></Field></div></section>
        <section className="admin-form-section"><h3>Achat d’actions</h3><Toggle title="Autoriser les achats" text="Les joueurs peuvent acheter plusieurs actions supplémentaires en une seule opération." checked={draft.actions.allowPurchase} onChange={(value) => set("actions.allowPurchase", value)} /><div className="admin-field-grid"><Field label="Prix unitaire"><input type="number" min="0" disabled={started} value={draft.actions.purchasePrice} onChange={(e) => set("actions.purchasePrice", Number(e.target.value))} /></Field><Field label="Quota normal total"><input type="number" min="0" disabled={started} value={draft.actions.purchaseMaxTotal} onChange={(e) => set("actions.purchaseMaxTotal", Number(e.target.value))} /></Field><Field label="Quota normal quotidien"><input type="number" min="0" disabled={started} value={draft.actions.purchaseMaxDaily} onChange={(e) => set("actions.purchaseMaxDaily", Number(e.target.value))} /></Field><Field label="Part au pot"><input type="number" min="0" disabled={started} value={draft.actions.purchasePotContributionValue} onChange={(e) => set("actions.purchasePotContributionValue", Number(e.target.value))} /></Field></div><Toggle title="Achats hors quota" text="Après le quota normal, le premier ticket coûte le multiplicateur indiqué puis le prix progresse exponentiellement." checked={draft.actions.allowOverflowPurchase} onChange={(value) => set("actions.allowOverflowPurchase", value)} />{draft.actions.allowOverflowPurchase && <div className="admin-field-grid"><Field label="Multiplicateur hors quota"><input type="number" min="1" step="0.5" disabled={started} value={draft.actions.overflowPriceMultiplier} onChange={(e) => set("actions.overflowPriceMultiplier", Number(e.target.value))} /></Field><Field label="Facteur exponentiel"><input type="number" min="1" max="10" step="0.05" disabled={started} value={draft.actions.overflowExponentBase} onChange={(e) => set("actions.overflowExponentBase", Number(e.target.value))} /></Field></div>}</section>
        <section className="admin-form-section"><h3>Calcul de contribution</h3><div className="admin-field-grid"><Field label="Ratio dégâts → contribution"><input type="number" min="0" step="0.1" disabled={started} value={draft.contribution.damageRatio} onChange={(e) => set("contribution.damageRatio", Number(e.target.value))} /></Field><Field label="Bonus participation quotidienne"><input type="number" disabled={started} value={draft.contribution.dailyParticipation} onChange={(e) => set("contribution.dailyParticipation", Number(e.target.value))} /></Field><Field label="Bonus effet communautaire"><input type="number" disabled={started} value={draft.contribution.communityEffect} onChange={(e) => set("contribution.communityEffect", Number(e.target.value))} /></Field><Field label="Contribution minimale"><input type="number" min="0" value={draft.limits.minimumContribution} onChange={(e) => set("limits.minimumContribution", Number(e.target.value))} /></Field></div></section>
        <section className="admin-form-section"><h3>Progression et classements</h3><div className="event-toggle-grid">{[["contribution", "Contribution totale"], ["damage", "Dégâts"], ["actions", "Nombre d’actions"], ["communityEffects", "Effets communautaires"], ["potAdded", "Jetons ajoutés"], ["bestAction", "Meilleure action"]].map(([key, label]) => <Toggle key={key} title={label} text="Visible sur la page publique." checked={draft.rankings[key] !== false} onChange={(value) => set(`rankings.${key}`, value)} />)}</div><Field label="Nombre de joueurs affichés"><input type="number" min="1" max="100" value={draft.rankings.limit} onChange={(e) => set("rankings.limit", Number(e.target.value))} /></Field></section>
      </>}
      {tab === "rewards" && <>
        <section className="admin-form-section"><h3>Pot événementiel</h3><div className="admin-field-grid"><Field label="Pot initial"><input type="number" min="0" disabled={started} value={draft.pot.initial} onChange={(e) => set("pot.initial", Number(e.target.value))} /></Field><Field label="Reliquat"><select disabled={started} value={draft.pot.remainderRule} onChange={(e) => set("pot.remainderRule", e.target.value)}><option value="top">Premier du classement</option><option value="equal">Répartition égale</option><option value="disappear">Supprimé</option><option value="rollover">Reporté</option></select></Field><Field label="ID événement de report"><input disabled={started || draft.pot.remainderRule !== "rollover"} value={draft.pot.rolloverTargetEventId} onChange={(e) => set("pot.rolloverTargetEventId", e.target.value)} /></Field></div></section>
        <section className="admin-form-section"><h3>Répartition du pot</h3><div className="admin-field-grid"><Field label="Part égale (%)"><input type="number" min="0" max="100" disabled={started} value={draft.rewards.distribution.equalPercent} onChange={(e) => set("rewards.distribution.equalPercent", Number(e.target.value))} /></Field><Field label="Proportionnelle (%)"><input type="number" min="0" max="100" disabled={started} value={draft.rewards.distribution.proportionalPercent} onChange={(e) => set("rewards.distribution.proportionalPercent", Number(e.target.value))} /></Field><Field label="Selon palier (%)"><input type="number" min="0" max="100" disabled={started} value={draft.rewards.distribution.tierPercent} onChange={(e) => set("rewards.distribution.tierPercent", Number(e.target.value))} /></Field><Field label="Classement (%)"><input type="number" min="0" max="100" disabled={started} value={draft.rewards.distribution.rankingPercent} onChange={(e) => set("rewards.distribution.rankingPercent", Number(e.target.value))} /></Field></div><div className={`event-distribution-total ${Object.values(draft.rewards.distribution).filter(Number.isFinite).slice(0, 4).reduce((sum, value) => sum + value, 0) === 100 ? "valid" : "invalid"}`}>Total configuré : {draft.rewards.distribution.equalPercent + draft.rewards.distribution.proportionalPercent + draft.rewards.distribution.tierPercent + draft.rewards.distribution.rankingPercent} %</div></section>
        <section className="admin-form-section"><div className="admin-form-heading"><div><h3>Paliers individuels</h3><p>Chaque seuil se base exclusivement sur la contribution personnelle du joueur.</p></div><button type="button" className="secondary" onClick={addTier}><Plus /> Palier</button></div><Field label="Gain de participation"><input type="number" min="0" disabled={started} value={draft.rewards.participationReward} onChange={(e) => set("rewards.participationReward", Number(e.target.value))} /></Field>{draft.rewards.tiers.map((tier, index) => <details className="event-config-row" key={tier.id}><summary><strong>{tier.name}</strong><span><CompactNumber value={tier.score} suffix=" pts personnels" label="Contribution requise exacte" /></span></summary><div className="admin-field-grid"><Field label="Nom"><input value={tier.name} onChange={(e) => updateTier(index, "name", e.target.value)} /></Field><Field label="Contribution requise"><input type="number" min="0" value={tier.score} onChange={(e) => updateTier(index, "score", Number(e.target.value))} /></Field><Field label="Gain fixe"><input type="number" min="0" value={tier.fixed} onChange={(e) => updateTier(index, "fixed", Number(e.target.value))} /></Field><Field label="Poids du pot (%)"><input type="number" min="0" max="100" value={tier.potPercent} onChange={(e) => updateTier(index, "potPercent", Number(e.target.value))} /></Field><Field label="Multiplicateur"><input type="number" min="0" step="0.05" value={tier.multiplier} onChange={(e) => updateTier(index, "multiplier", Number(e.target.value))} /></Field><Field label="Cosmétique"><select value={tier.cosmeticId} onChange={(e) => updateTier(index, "cosmeticId", e.target.value)}><option value="">Aucun cosmétique</option>{shop.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div><Field label="Bonus supplémentaire"><input value={tier.bonus ?? ""} onChange={(e) => updateTier(index, "bonus", e.target.value)} placeholder="Texte ou référence du bonus" /></Field><ConfirmActionButton className="text-danger" dialogTitle="Supprimer ce palier ?" message={`« ${tier.name} » et ses réglages seront retirés de cet événement.`} confirmLabel="Supprimer" danger onConfirm={() => set("rewards.tiers", draft.rewards.tiers.filter((_, i) => i !== index))}>Supprimer ce palier</ConfirmActionButton></details>)}</section>
        <section className="admin-form-section"><h3>Réussite communautaire</h3><Toggle title="Multiplicateur communautaire" text="Adapte les gains fixes à la progression globale." checked={draft.rewards.communityMultiplierEnabled} onChange={(value) => set("rewards.communityMultiplierEnabled", value)} />{draft.rewards.communityMultiplierEnabled && <div className="event-multiplier-editor">{draft.rewards.communityMultipliers.map((row, index) => <div key={index}><Field label="Progression minimale (%)"><input type="number" min="0" value={row.minPercent} onChange={(e) => { const rows = clone(draft.rewards.communityMultipliers); rows[index].minPercent = Number(e.target.value); set("rewards.communityMultipliers", rows); }} /></Field><Field label="Multiplicateur"><input type="number" min="0" step="0.05" value={row.multiplier} onChange={(e) => { const rows = clone(draft.rewards.communityMultipliers); rows[index].multiplier = Number(e.target.value); set("rewards.communityMultipliers", rows); }} /></Field><ConfirmActionButton className="secondary icon-toggle" title="Supprimer cette tranche" dialogTitle="Supprimer cette tranche ?" message={`Le multiplicateur ×${row.multiplier} à partir de ${row.minPercent} % sera retiré.`} confirmLabel="Supprimer" danger onConfirm={() => set("rewards.communityMultipliers", draft.rewards.communityMultipliers.filter((_, i) => i !== index))}><X /></ConfirmActionButton></div>)}<button type="button" className="secondary" onClick={() => set("rewards.communityMultipliers", [...draft.rewards.communityMultipliers, { minPercent: 100, multiplier: 1 }])}><Plus /> Ajouter une tranche</button></div>}</section>
      </>}
      {tab === "appearance" && <>
        <section className="admin-form-section"><h3>Thème visuel</h3><div className="admin-field-grid"><Field label="Titre"><input value={draft.theme.title} onChange={(e) => set("theme.title", e.target.value)} /></Field><Field label="Sous-titre"><input value={draft.theme.subtitle} onChange={(e) => set("theme.subtitle", e.target.value)} /></Field><Field label="Icône Lucide / SVG"><input value={draft.theme.icon} onChange={(e) => set("theme.icon", e.target.value)} /></Field><Field label="Nom de l’action"><input value={draft.theme.actionName} onChange={(e) => set("theme.actionName", e.target.value)} /></Field><Field label="Unité de l’objectif"><input value={draft.theme.healthUnit} onChange={(e) => set("theme.healthUnit", e.target.value)} /></Field></div><div className="event-color-grid"><Field label="Primaire"><input type="color" value={draft.theme.primary} onChange={(e) => set("theme.primary", e.target.value)} /></Field><Field label="Secondaire"><input type="color" value={draft.theme.secondary} onChange={(e) => set("theme.secondary", e.target.value)} /></Field><Field label="Accent"><input type="color" value={draft.theme.accent} onChange={(e) => set("theme.accent", e.target.value)} /></Field></div><Field label="Image principale (URL)" hint="Illustration du grand bandeau de l’événement."><input value={draft.theme.heroImage} onChange={(e) => set("theme.heroImage", e.target.value)} /></Field>{draft.theme.heroImage && <div className="event-banner-controls"><Field label={`Position horizontale · ${draft.theme.heroPositionX ?? 50} %`}><input type="range" min="0" max="100" value={draft.theme.heroPositionX ?? 50} onChange={(e) => set("theme.heroPositionX", Number(e.target.value))} /></Field><Field label={`Position verticale · ${draft.theme.heroPositionY ?? 50} %`}><input type="range" min="0" max="100" value={draft.theme.heroPositionY ?? 50} onChange={(e) => set("theme.heroPositionY", Number(e.target.value))} /></Field><Field label={`Zoom · ${draft.theme.heroScale ?? 100} %`}><input type="range" min="100" max="250" value={draft.theme.heroScale ?? 100} onChange={(e) => set("theme.heroScale", Number(e.target.value))} /></Field></div>}<Field label="Arrière-plan (URL)" hint="Fond plein écran derrière toute la page de l’événement."><input value={draft.theme.backgroundImage} onChange={(e) => set("theme.backgroundImage", e.target.value)} /></Field></section>
        <section className="admin-form-section"><h3>Textes contextuels</h3>{Object.entries(draft.texts).map(([key, value]) => <Field key={key} label={key}><textarea value={value} onChange={(e) => set(`texts.${key}`, e.target.value)} /></Field>)}</section>
      </>}
      {tab === "monitoring" && <>
        <section className="event-admin-metrics">{[[Users, "Participants", detail.metrics.participants], [Activity, "Actions", detail.metrics.actions], [Swords, "Dégâts", detail.metrics.damage], [Coins, "Pot", detail.metrics.pot]].map(([Icon, label, value]) => <article key={label}><Icon /><span>{label}</span><strong><CompactNumber value={value} label={`${label} exact`} /></strong></article>)}</section>
        {!!detail.validation.length && <div className="error"><AlertTriangle /> {detail.validation.join(" ")}</div>}
        <section className="admin-form-section"><h3>Journal du pot</h3><div className="event-admin-ledger">{detail.potEntries.slice(0, 40).map((entry) => <div key={entry.id}><span>{entry.reason}<small>{new Date(entry.createdAt).toLocaleString("fr-BE")}</small></span><strong className={entry.amount >= 0 ? "positive" : "negative"}><CompactNumber value={Math.abs(entry.amount)} prefix={entry.amount >= 0 ? "+" : "−"} label="Mouvement exact" /></strong><b><CompactNumber value={entry.balance} label="Solde exact du pot" /></b></div>)}{!detail.potEntries.length && <p>Aucun mouvement.</p>}</div></section>
        <section className="admin-form-section"><h3>Participants</h3><div className="event-admin-ledger">{detail.participants.slice(0, 50).map((row) => <div key={row.id}><span>#{row.rank} {row.pseudo}<small><CompactNumber value={row.actions} suffix=" actions" /></small></span><strong><CompactNumber value={row.contribution} suffix=" pts" label="Contribution exacte" /></strong><b><CompactNumber value={row.damage} suffix=" dégâts" label="Dégâts exacts" /></b></div>)}{!detail.participants.length && <p>Aucun participant.</p>}</div></section>
      </>}
    </fieldset><EventPreview event={draft} action={previewAction} onSimulate={simulate} busy={busy === "preview"} /></div>
    <footer className="event-editor-footer"><div><small>{finished ? "Configuration archivée après clôture" : draft.status === "active" ? "Les changements enregistrés s’appliquent immédiatement à l’événement actif" : "Les changements restent en brouillon jusqu’à la planification"}</small></div><button className="secondary" onClick={onClose}>Fermer</button><button onClick={save} disabled={finished || busy === "save"}><Save /> {busy === "save" ? "Enregistrement…" : "Enregistrer"}</button></footer>
  </div></div>;
}

export function CommunityEventsAdmin({ shop = [], canOperate = false, reportError = () => {} }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [potAdjust, setPotAdjust] = useState(null);
  const load = useCallback(async () => { try { setRows(await api("/api/admin/community-events")); } catch (error) { reportError(error.message); } }, [reportError]);
  useEffect(() => { load(); }, [load]);
  const visible = useMemo(() => rows.filter((row) => filter === "all" || row.event.status === filter).filter((row) => !search.trim() || `${row.event.internalName} ${row.event.name} ${row.event.slug}`.toLowerCase().includes(search.toLowerCase())), [rows, filter, search]);

  async function create() { setBusy("create"); try { const result = await api("/api/admin/community-events", { method: "POST", body: "{}" }); await load(); setEditing(result); } catch (error) { reportError(error.message); } finally { setBusy(""); } }
  async function duplicate(id) { setBusy(id); try { await api(`/api/admin/community-events/${id}/duplicate`, { method: "POST" }); await load(); } finally { setBusy(""); } }
  async function changeStatus(id, status) { setBusy(id); try { await api(`/api/admin/community-events/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }); await load(); } finally { setBusy(""); } }
  async function remove(id) { setBusy(id); try { await api(`/api/admin/community-events/${id}`, { method: "DELETE" }); await load(); } finally { setBusy(""); } }
  async function adjustPot(event) { event.preventDefault(); const amount = Number(potAdjust.amount); if (!amount) return reportError("Saisis un montant différent de zéro."); setBusy("pot"); try { await api(`/api/admin/community-events/${potAdjust.id}/pot`, { method: "POST", body: JSON.stringify({ amount, note: potAdjust.note }) }); setPotAdjust(null); await load(); } catch (error) { reportError(error.message); } finally { setBusy(""); } }

  return <section className="community-events-admin">
    <div className="admin-section-heading"><div><span className="eyebrow">Animation communautaire</span><h2>Événements temporaires</h2><small>Crée, programme, simule et supervise des événements sans déploiement.</small></div><button onClick={create} disabled={busy === "create"}><Plus /> Nouvel événement</button></div>
    {!canOperate && <div className="editor-scope-notice"><Sparkles /><div><strong>Périmètre éditeur</strong><span>Tu peux créer, modifier, prévisualiser et dupliquer les événements. La planification, le lancement, la cagnotte, la clôture et la suppression restent réservés aux administrateurs.</span></div></div>}
    <div className="event-admin-toolbar"><label><Search /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, slug…" /></label><div>{["all", "draft", "scheduled", "active", "finished", "cancelled"].map((status) => <button key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status === "all" ? "Tous" : labels[status]}<b>{status === "all" ? rows.length : rows.filter((row) => row.event.status === status).length}</b></button>)}</div></div>
    <div className="event-admin-grid">{visible.map((row) => <article className={`event-admin-card status-${row.event.status}`} key={row.event.id} style={{ "--event-accent": row.event.theme.accent, "--event-primary": row.event.theme.primary }}>
      <div className="event-admin-card-head"><span className={`event-status status-${row.event.status}`}>{labels[row.event.status]}</span><small>{row.event.slug}</small></div><h3>{row.event.internalName}</h3><p>{row.event.name} · {row.event.game.type === "dice" ? "Dés" : "Cartes"}</p>
      <div className="event-card-progress"><i><b style={{ width: `${Math.min(100, row.metrics.progress)}%` }} /></i><span>{Math.round(row.metrics.progress)} %</span></div>
      <div className="event-card-metrics"><span><Users /> <strong><CompactNumber value={row.metrics.participants} /></strong> participants</span><span><Activity /> <strong><CompactNumber value={row.metrics.actions} /></strong> actions</span><span><Coins /> <strong><CompactNumber value={row.metrics.pot} label="Pot exact" /></strong> pot</span></div>
      <div className="event-card-dates"><Clock3 /><span>{new Date(row.event.startsAt).toLocaleString("fr-BE")}<small>au {new Date(row.event.endsAt).toLocaleString("fr-BE")}</small></span></div>
      {!!row.validation.length && <div className="event-card-warning"><AlertTriangle /> {row.validation.length} point(s) à corriger</div>}
      <div className="event-card-actions"><button onClick={() => setEditing(row)}><Eye /> {row.event.status === "finished" ? "Consulter" : "Configurer"}</button><ConfirmActionButton className="secondary icon-toggle" title="Dupliquer" disabled={Boolean(busy)} dialogTitle="Dupliquer cet événement ?" message={`Une copie de « ${row.event.internalName} » sera créée en brouillon.`} confirmLabel="Dupliquer l’événement" onConfirm={() => duplicate(row.event.id)}><Copy /></ConfirmActionButton>{canOperate && <><button className="secondary icon-toggle" onClick={() => setPotAdjust({ id: row.event.id, name: row.event.internalName, amount: "", note: "" })} title="Ajuster le pot"><CircleDollarSign /></button>{row.event.status === "draft" && <button className="secondary" onClick={() => setConfirm({ id: row.event.id, status: "scheduled", title: "Planifier cet événement ?", message: "Il sera visible et démarrera selon sa programmation." })}><CalendarClock /> Planifier</button>}{["draft", "scheduled"].includes(row.event.status) && <button onClick={() => setConfirm({ id: row.event.id, status: "active", title: "Lancer maintenant ?", message: "L’événement démarre immédiatement et restera ajustable jusqu’à sa clôture." })}><Swords /> Lancer</button>}{row.event.status === "scheduled" && <button className="secondary" onClick={() => setConfirm({ id: row.event.id, status: "cancelled", title: "Annuler la programmation ?", message: "L’événement ne démarrera pas et restera archivé comme annulé." })}><X /> Annuler</button>}{row.event.status === "active" && <button className="danger-button" onClick={() => setConfirm({ id: row.event.id, status: "finished", title: "Clôturer et distribuer ?", message: "Le classement sera figé et les récompenses versées une seule fois." })}><Gift /> Clôturer</button>}{["draft", "scheduled", "cancelled"].includes(row.event.status) && <button className="secondary icon-toggle" title="Supprimer l’événement" onClick={() => setConfirm({ id: row.event.id, remove: true, title: "Supprimer l’événement ?", message: "Cette opération supprime sa configuration et ses données préparatoires." })}><Trash2 /></button>}</>}</div>
    </article>)}</div>
    {!visible.length && <div className="empty-state"><Sparkles /><strong>Aucun événement dans cette vue.</strong><span>Crée un brouillon ou modifie les filtres.</span></div>}
    {editing && <EventEditor detail={editing} shop={shop} onClose={() => setEditing(null)} onSaved={async () => { const refreshed = await api(`/api/admin/community-events/${editing.event.id}`); setEditing(refreshed); await load(); }} reportError={reportError} />}
    {potAdjust && <div className="modal-backdrop admin-confirm-layer" onClick={() => setPotAdjust(null)}><form className="modal event-pot-modal" onSubmit={adjustPot} onClick={(event) => event.stopPropagation()}><div className="modal-title-row"><div><span className="eyebrow">Journal de cagnotte</span><h2>Ajuster le pot</h2><small>{potAdjust.name}</small></div><button type="button" className="secondary icon-toggle" onClick={() => setPotAdjust(null)}><X /></button></div><Field label="Montant"><input autoFocus type="number" value={potAdjust.amount} onChange={(event) => setPotAdjust({ ...potAdjust, amount: event.target.value })} placeholder="Ex. 500 ou -100" /></Field><Field label="Motif obligatoire"><textarea required maxLength="160" value={potAdjust.note} onChange={(event) => setPotAdjust({ ...potAdjust, note: event.target.value })} placeholder="Pourquoi cette correction est-elle effectuée ?" /></Field><div className="actions"><button type="submit" disabled={busy === "pot"}><CircleDollarSign /> {busy === "pot" ? "Écriture…" : "Inscrire le mouvement"}</button><button type="button" className="secondary" onClick={() => setPotAdjust(null)}>Annuler</button></div></form></div>}
    {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.remove ? "Supprimer l’événement" : "Confirmer"} danger={confirm.status === "finished" || confirm.remove} onConfirm={() => confirm.remove ? remove(confirm.id) : changeStatus(confirm.id, confirm.status)} onClose={() => setConfirm(null)} />}
  </section>;
}
