import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, Check, Coins, Dice5, Flame, Gamepad2, Gift, Save, Settings2, ShoppingBag, Target, Trophy, X } from "lucide-react";
import { achievementGoals, buildGuidedAchievement, gameFeats } from "./achievement-guide.js";

const icons = { trophy: Trophy, gamepad: Gamepad2, flame: Flame, coins: Coins, target: Target, dice: Dice5, badge: BadgeCheck, calendar: CalendarDays, gift: Gift, shop: ShoppingBag };

export function AchievementWizard({ games, achievements, shop = [], saving, error, onSave, onAdvanced, onClose }) {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState({ gameId: "", objective: "wins", amount: 10, repetitions: 1, featId: "" });
  const [title, setTitle] = useState("");
  const [customDescription, setCustomDescription] = useState(null);
  const [secret, setSecret] = useState(false);
  const [milestone, setMilestone] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const scrollRef = useRef(null);
  useLayoutEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [step]);
  const goals = achievementGoals(config.gameId).filter((goal) => goal.id !== "feat" || gameFeats(achievements, config.gameId).length);
  const goal = goals.find((item) => item.id === config.objective);
  const feats = gameFeats(achievements, config.gameId);
  let generated, problem;
  try { generated = buildGuidedAchievement(config, games, achievements); } catch (err) { problem = err.message; }
  const draft = { ...generated, title, description: customDescription ?? generated?.description ?? "", secret, milestone, enabled };
  const valid = !!generated;
  const choose = (objective, gameId = config.gameId) => {
    const next = achievementGoals(gameId).find((item) => item.id === objective);
    setConfig({ gameId, objective, amount: next?.amount ?? 1, repetitions: 1, featId: gameFeats(achievements, gameId)[0]?.id ?? "", ownedItem: shop[0]?.id ?? "" });
  };
  const change = (field, value) => setConfig((current) => ({ ...current, [field]: value }));
  const titleFallback = goal?.label ?? "Nouveau succès";

  return <div className="modal-backdrop" onClick={() => !saving && onClose()}><form className="modal admin-editor achievement-rule-editor achievement-wizard" role="dialog" aria-modal="true" aria-labelledby="achievement-wizard-title" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape" && !saving) onClose(); }} onSubmit={(event) => { event.preventDefault(); if (step < 2) { if (valid) setStep(step + 1); } else if (valid && title.trim()) onSave(draft); }}>
    <div className="modal-title-row"><div><span className="eyebrow">Nouveau succès</span><h2 id="achievement-wizard-title">{["Quel défi proposer ?", "Définir le défi", "Prêt à être débloqué"][step]}</h2></div><button type="button" className="secondary icon-toggle" disabled={saving} onClick={onClose} aria-label="Fermer"><X size={18} /></button></div>
    <div className="achievement-editor-scroll" ref={scrollRef}>
      <nav className="achievement-wizard-steps" aria-label="Étapes de création">{["Objectif", "Conditions", "Présentation"].map((label, index) => <button type="button" key={label} aria-current={step === index ? "step" : undefined} disabled={saving || (index > step && !valid)} onClick={() => setStep(index)}><span>{index < step ? <Check size={15} /> : index + 1}</span>{label}</button>)}</nav>
      <div className="achievement-wizard-layout">
        <section className="achievement-wizard-fields">
          {step === 0 && <>
            <label>Jeu concerné<select autoFocus value={config.gameId} onChange={(event) => choose("wins", event.target.value)}><option value="">Casino · tous les jeux</option>{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select></label>
            <fieldset className="achievement-goals"><legend>Le joueur doit…</legend>{goals.map((item) => { const Icon = icons[item.icon]; return <label key={item.id} className={config.objective === item.id ? "selected" : ""}><input type="radio" name="achievement-goal" value={item.id} checked={config.objective === item.id} onChange={() => choose(item.id)} /><Icon size={20} /><span><strong>{item.label}</strong><small>{item.example}</small></span></label>; })}</fieldset>
          </>}
          {step === 1 && <>
            <h3>{goal.label}</h3>
            {goal.id === "siteVisit" && <>
              <label>Page a visiter<select value={config.page || "lobby"} onChange={(event) => change("page", event.target.value)}>{Object.entries({ lobby: "Accueil", profile: "Profil", shop: "Boutique", leaderboard: "Classements", room: "Table", spectator: "Spectateur", event: "Evenement", admin: "Administration" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Objet a porter<select value={config.equippedItem || ""} onChange={(event) => change("equippedItem", event.target.value)}><option value="">Aucune condition d'equipement</option>{shop.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Navigateur<select value={config.browser || ""} onChange={(event) => change("browser", event.target.value)}><option value="">Tous</option>{["firefox", "edge", "chrome", "safari", "other"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label>Type d'indice dans le lien<select value={config.markerKey || "secret"} onChange={(event) => change("markerKey", event.target.value)}><option value="secret">Secret</option><option value="challenge">Defi</option></select></label>
              <label>Indice dans le lien (facultatif)<input maxLength={48} value={config.marker || ""} placeholder="answer-42" onChange={(event) => change("marker", event.target.value)} /></label>
              {config.marker && <p className="achievement-rule-note">Lien : ?{config.markerKey || "secret"}={config.marker}</p>}
            </>}
            {goal.id === "ownItem" && <label>Objet a posseder<select value={config.ownedItem || ""} onChange={(event) => change("ownedItem", event.target.value)}><option value="">Choisir un objet</option>{shop.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
            {["siteVisit", "activeTime", "visitDays"].includes(goal.id) && <p className="achievement-rule-note">Requiert le suivi facultatif des succes de navigation. Aucun gain de jetons ni avantage de jeu ne doit dependre de ce choix.</p>}
            {goal.amount && <label>{goal.unit}<input autoFocus type="number" min="1" max="1000000000" step="1" value={config.amount} onChange={(event) => change("amount", event.target.value)} required /></label>}
            {goal.id === "feat" && <><label>Exploit<select value={config.featId} onChange={(event) => change("featId", event.target.value)}>{feats.map((feat) => <option key={feat.id} value={feat.id}>{feat.title}</option>)}</select></label><p>{feats.find((feat) => feat.id === config.featId)?.description}</p></>}
            {goal.repeatable && <label>Nombre de parties où réussir ce défi<input type="number" min="1" max="1000000000" step="1" required value={config.repetitions} onChange={(event) => change("repetitions", event.target.value)} /></label>}
            {goal.id === "streak" && <p className="achievement-rule-note">Une partie sans victoire{config.gameId ? " dans ce jeu" : ""} remet la série à zéro.</p>}
            {goal.id === "dailyStreak" && <p className="achievement-rule-note">Un jour sans récupération du bonus remet la série à zéro.</p>}
            {goal.repeatable && <p className="achievement-rule-note">Vérifié à la fin de chaque partie. Une partie réussie compte une seule fois.</p>}
            {problem && <p className="error" role="alert">{problem}</p>}
          </>}
          {step === 2 && <>
            <label>Nom du succès<input autoFocus required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={titleFallback} /></label>
            <label>Description pour les joueurs<textarea required maxLength={300} value={draft.description} onChange={(event) => setCustomDescription(event.target.value)} /></label>
            <div className="achievement-publication-options">
              <label><input type="checkbox" checked={milestone} onChange={(event) => setMilestone(event.target.checked)} /><span><strong>Milestone</strong><small>Peut être affiché sur la member card.</small></span></label>
              <label><input type="checkbox" checked={secret} onChange={(event) => setSecret(event.target.checked)} /><span><strong>Succès secret</strong><small>Masqué jusqu'à son obtention.</small></span></label>
              <label><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span><strong>Activer dès l'enregistrement</strong><small>{enabled ? "Les joueurs pourront le débloquer." : "Conservé en brouillon."}</small></span></label>
            </div>
          </>}
        </section>
        <aside className="achievement-wizard-preview" aria-label="Aperçu du succès" aria-live="polite">
          <span className="eyebrow">{generated?.group ?? "Succès"}</span><BadgeCheck size={30} /><h3>{title || titleFallback}</h3>
          <p>{draft.description || "Choisis les conditions du défi."}</p>
          {customDescription !== null && customDescription !== generated?.description && <div className="achievement-preview-rule"><strong>Condition réelle</strong><p>{generated?.description}</p></div>}
          <div className="achievement-preview-tags"><span>{secret ? "Secret" : "Visible"}</span>{milestone && <span>Milestone</span>}<span>{enabled ? "Actif" : "Brouillon"}</span></div>
        </aside>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
    <footer className="achievement-wizard-footer"><button type="button" className="secondary" disabled={!valid || saving} onClick={() => onAdvanced({ ...draft, title: title || titleFallback })} title="Ouvrir toutes les conditions et comparaisons"><Settings2 size={16} /><span>Personnaliser la règle</span></button><div className="actions">{step > 0 && <button type="button" className="secondary" disabled={saving} onClick={() => setStep(step - 1)}><ArrowLeft size={16} />Retour</button>}<button type="submit" disabled={!valid || saving || (step === 2 && !title.trim())}>{step === 2 ? <Save size={17} /> : <ArrowRight size={17} />}{saving ? "Enregistrement…" : step === 2 ? "Enregistrer" : "Continuer"}</button></div></footer>
  </form></div>;
}
