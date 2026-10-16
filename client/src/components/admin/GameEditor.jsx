import { useId, useRef, useState } from "react";
import { BookOpen, Check, Coins, Dices, Eye, Gamepad2, ImagePlus, Layers, LayoutGrid, Monitor, Save, Settings, Spade, Users, X } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { gameImageUrl } from "../../features/games/presentation.js";
import { gameAudienceLabel, gameCategoryLabel, gameComplexityLabel, CompactNumber } from "../../utils/presentation.jsx";
import { Dialog } from "../common/Dialog.jsx";
import { GameArtwork } from "../game/GameArtwork.jsx";
import { Die, PlayingCard } from "../game/GamePieces.jsx";
import { GameDefaults } from "./GameDefaults.jsx";
import "./game-editor.css";

const sections = [["presentation", "Présentation", BookOpen], ["rules", "Règles", Settings], ["images", "Visuels", ImagePlus], ["economy", "Économie", Coins], ["publication", "Publication", Eye]];
const views = [["catalogue", "Catalogue", LayoutGrid], ["featured", "À l’affiche", Monitor], ["discord", "Discord", Gamepad2]];
const shortLabels = { presentation: "Fiche", rules: "Règles", images: "Visuels", economy: "Jetons", publication: "Publier" };
const imageFields = [["descriptiveImage", "Image descriptive", "Fond du cadre de sélection.", "catalogue"], ["coverImage", "Bannière", "Jeu à l’affiche et catalogue public.", "featured"], ["discordIconImage", "Icône Discord", "Petite icône dans la présence Discord.", "discord"]];

function GamePreview({ game, view }) {
  const { t } = useLocale();
  const Kind = game.type === "dice" ? Dices : Spade;
  const pieces = <div className="game-settings-pieces" aria-hidden="true">{game.type === "dice" ? [4, 2, 1].map(value => <Die key={value} value={value} animate={false} />) : ["S", "H"].map(suit => <PlayingCard key={suit} card={{ rank: "A", suit }} animate={false} />)}</div>;
  const players = game.minPlayers === game.maxPlayers ? game.maxPlayers : `${game.minPlayers}–${game.maxPlayers}`;
  if (view === "discord") { const icon = gameImageUrl(game.discordIconImage) || "/pwa/icon-512.png"; return <div className="game-settings-presence"><div className="game-settings-presence-art"><GameArtwork source={gameImageUrl(game.coverImage) || gameImageUrl(game.descriptiveImage) || icon} /><GameArtwork source={icon} /></div><div><strong>KTGA.ME</strong><b>{game.name}</b><span>{t("En salle d’attente")} · {t("Classique")}</span><small>1 / {game.maxPlayers} {t("joueurs")}</small><span className="game-settings-presence-action">{t("Rejoindre la table")}</span></div></div>; }
  return <article className={`game-settings-sample ${game.type === "dice" ? "is-dice" : "is-cards"} ${view === "featured" ? "is-featured" : ""}`}>
    <div className="game-settings-sample-meta"><span><Kind size={18} />{t(game.type === "dice" ? "Dés" : "Cartes")}</span><span><Users size={16} />{players}</span></div>
    {view === "catalogue" && <GameArtwork source={game.coverImage} fallback={pieces} />}
    <div className="game-settings-sample-content">{view === "featured" && <GameArtwork source={game.coverImage} backdrop />}{view === "catalogue" && <GameArtwork source={game.descriptiveImage} backdrop />}
      <h3>{game.name || t("Nom du jeu")}</h3><p>{game.description}</p><div className="game-settings-sample-tags"><span>{t(gameCategoryLabel(game.category))}</span><span>{t(gameComplexityLabel(game.complexity))}</span></div><span className="game-settings-sample-action"><Gamepad2 size={17} />{t("Créer une table")}</span>
    </div>
  </article>;
}

export function GameEditor({ game, games, saving, error, onChange, onSave, onClose, onEditImage }) {
  const { t } = useLocale();
  const id = useId(), form = useRef(null), fields = useRef(null);
  const [section, setSection] = useState("presentation"), [view, setView] = useState("catalogue"), [mobilePreview, setMobilePreview] = useState(false), [validation, setValidation] = useState("");
  const categories = [...new Set([game.category ?? "score", ...games.map(entry => entry.category).filter(Boolean)])];
  const switchSection = next => { setSection(next); setMobilePreview(false); setValidation(""); if (fields.current) fields.current.scrollTop = 0; };
  function submit(event) {
    event.preventDefault();
    if (saving) return;
    // All panels stay mounted so validation covers fields outside the active tab.
    const invalid = [...form.current.elements].find(element => element.willValidate && (!element.checkValidity() || element.required && typeof element.value === "string" && !element.value.trim()));
    if (invalid) {
      setSection(invalid.closest("[data-game-section]").dataset.gameSection); setMobilePreview(false); setValidation(t("Vérifie le champ indiqué avant d’enregistrer."));
      requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity(); }); return;
    }
    if (game.id === "blackjack" && Number(game.defaultModifiers?.maximumBet ?? 100) < Number(game.defaultModifiers?.minimumBet ?? 50)) {
      setSection("rules"); setMobilePreview(false); setValidation(t("La mise maximale doit être supérieure ou égale à la mise minimale.")); return;
    }
    setValidation(""); onSave();
  }
  return <Dialog title={`${t("Paramètres du jeu")} · ${game.name}`} className="game-settings-dialog" onClose={onClose} dismissible={!saving}>
    <form ref={form} className="game-settings-form" onSubmit={submit} noValidate>
      <footer className="game-settings-actions"><span>{game.id}</span><div><button type="button" className="secondary" onClick={onClose} disabled={saving}><X size={17} />{t("Annuler")}</button><button type="submit" disabled={saving}><Save size={17} />{t(saving ? "Enregistrement…" : "Enregistrer")}</button></div></footer>

      <nav className="game-settings-tabs" role="tablist" aria-label={t("Réglages du jeu")}>{sections.map(([key, label, Icon], index) => <button type="button" role="tab" aria-label={t(label)} id={`${id}-${key}`} tabIndex={section === key ? 0 : -1} aria-controls={`${id}-${key}-panel`} aria-selected={section === key} key={key} disabled={saving} className={section === key ? "active" : ""} onClick={() => switchSection(key)} onKeyDown={event => { const next = event.key === "ArrowRight" ? (index + 1) % sections.length : event.key === "ArrowLeft" ? (index + sections.length - 1) % sections.length : event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : null; if (next === null) return; event.preventDefault(); switchSection(sections[next][0]); document.getElementById(`${id}-${sections[next][0]}`)?.focus(); }}><Icon size={18} /><span className="game-settings-tab-name">{t(label)}</span><span className="game-settings-tab-short">{t(shortLabels[key])}</span></button>)}</nav>
      <button type="button" className="secondary game-settings-mobile-view" onClick={() => setMobilePreview(value => !value)} aria-expanded={mobilePreview}><Eye size={17} />{t(mobilePreview ? "Revenir aux réglages" : "Voir l’aperçu")}</button>
      {(validation || error) && <p className="error game-settings-error" role="alert">{validation || t(error)}</p>}
      <div className={`game-settings-workspace${mobilePreview ? " show-preview" : ""}`}>
        <fieldset ref={fields} disabled={saving} className="game-settings-fields">
          {sections.map(([key, label]) => <section className="game-settings-panel" data-game-section={key} key={key} hidden={section !== key} role="tabpanel" id={`${id}-${key}-panel`} aria-labelledby={`${id}-${key}`}>
            <header><span className="eyebrow">{game.id}</span><h3>{t(label)}</h3></header>
            {key === "presentation" && <><label>{t("Nom du jeu")}<input required maxLength={60} value={game.name ?? ""} onChange={event => onChange("name", event.target.value)} autoComplete="off" /></label><label>{t("Description publique")}<textarea required value={game.description ?? ""} maxLength={240} onChange={event => onChange("description", event.target.value)} /><small>{game.description?.length ?? 0} / 240</small></label><div className="game-settings-grid"><label>{t("Catégorie")}<select value={game.category ?? "score"} onChange={event => onChange("category", event.target.value)}>{categories.map(value => <option key={value} value={value}>{t(gameCategoryLabel(value))}</option>)}</select></label><label>{t("Public")}<select value={game.audience ?? "multi"} onChange={event => onChange("audience", event.target.value)}>{[["solo", "Solo"], ["multi", "Multijoueur"], ["solo-multi", "Solo et multijoueur"]].map(([value, title]) => <option value={value} key={value}>{t(title)}</option>)}</select></label><label>{t("Complexité")}<select value={game.complexity ?? "intermediate"} onChange={event => onChange("complexity", event.target.value)}>{[["easy", "Accessible"], ["intermediate", "Intermédiaire"], ["advanced", "Avancé"]].map(([value, title]) => <option value={value} key={value}>{t(title)}</option>)}</select></label></div><dl className="game-settings-facts"><div><dt>{t("Type")}</dt><dd>{t(game.type === "dice" ? "Dés" : "Cartes")}</dd></div><div><dt>{t("Joueurs")}</dt><dd>{game.minPlayers}–{game.maxPlayers}</dd></div></dl></>}
            {key === "rules" && <GameDefaults game={game} onChange={value => onChange("defaultModifiers", value)} emptyMessage={t("Aucun paramètre de règle disponible pour ce jeu.")} />}
            {key === "images" && <div className="game-media-fields">{imageFields.map(([field, title, help, preview]) => <div className={`game-media-field${field === "discordIconImage" ? " game-media-square" : ""}`} key={field}><strong>{t(title)}</strong><GameArtwork source={game[field]} fallback={<span className="game-settings-media-empty" aria-hidden="true"><ImagePlus size={25} /></span>} /><small>{t(help)}</small><div className="game-media-actions"><button type="button" className="secondary" onClick={() => { setView(preview); onEditImage(field); }}><ImagePlus size={16} />{t(game[field] ? "Modifier / recadrer" : "Ajouter une image")}</button><button type="button" className="secondary icon-toggle" title={t("Retirer : {value0}", { value0: t(title) })} aria-label={t("Retirer : {value0}", { value0: t(title) })} disabled={!game[field]} onClick={() => { onChange(field, ""); setView(preview); }}><X size={16} /></button></div></div>)}</div>}
            {key === "economy" && <><label>{t("Pot d’entrée")}<input required type="number" min={0} step={1} value={game.entryPot ?? 0} onChange={event => onChange("entryPot", event.target.value === "" ? "" : Number(event.target.value))} /></label>{game.id === "texas-holdem" && <><div className="game-settings-grid"><label>{t("Cave minimale")}<input required type="number" min={1000} max={10000000} step={1} value={game.minPokerBuyIn ?? ""} onChange={event => onChange("minPokerBuyIn", event.target.value === "" ? "" : Number(event.target.value))} /></label><label>{t("Grosse blinde par défaut")}<input required type="number" min={2} max={game.minPokerBuyIn} step={2} value={game.pokerDefaultBigBlind ?? ""} onChange={event => onChange("pokerDefaultBigBlind", event.target.value === "" ? "" : Number(event.target.value))} /></label><label>{t("Temps par tour (secondes)")}<input required type="number" min={30} max={600} step={1} value={game.pokerTurnSeconds ?? ""} onChange={event => onChange("pokerTurnSeconds", event.target.value === "" ? "" : Number(event.target.value))} /></label></div><div className="blind-ratio settings-blind-preview"><span>{t("Petite blinde")}<strong>{Math.floor((Number(game.pokerDefaultBigBlind) || 2) / 2)}</strong></span><b>½</b><span>{t("Grosse blinde")}<strong>{game.pokerDefaultBigBlind}</strong></span></div></>}</>}
            {key === "publication" && <><label className="game-settings-switch"><span>{t("Jeu publié sur l’accueil")}</span><input type="checkbox" checked={game.enabled !== false} onChange={event => onChange("enabled", event.target.checked)} /></label><label>{t("Position sur l’accueil")}<input required type="number" min={1} max={Math.max(games.length, Number(game.position) || 1)} step={1} value={game.position ?? 1} onChange={event => onChange("position", event.target.value === "" ? "" : Number(event.target.value))} /></label><dl className="game-settings-facts"><div><dt>{t("Catégorie")}</dt><dd>{t(gameCategoryLabel(game.category))}</dd></div><div><dt>{t("Public")}</dt><dd>{t(gameAudienceLabel(game.audience))}</dd></div></dl></>}
          </section>)}
        </fieldset>
        <aside className="game-settings-preview" aria-label={t("Aperçu du jeu")}>
          <header><span className="eyebrow">{t("Aperçu")}</span><span className={`game-settings-state ${game.enabled !== false ? "is-enabled" : ""}`}><Check size={13} />{t(game.enabled !== false ? "Publié" : "Masqué")}</span></header>
          <div className="game-settings-preview-views" role="group" aria-label={t("Type d’aperçu")}>{views.map(([key, label, Icon]) => <button type="button" className={view === key ? "active" : ""} key={key} aria-pressed={view === key} onClick={() => setView(key)}><Icon size={15} />{t(label)}</button>)}</div>
          <div className="game-settings-preview-scroll"><GamePreview game={game} view={view} /><div className="game-settings-preview-summary"><span><Layers size={16} />{t("Position sur l’accueil")}<b>{game.position ?? 1}</b></span><span><Coins size={16} />{t("Pot d’entrée")}<b><CompactNumber value={game.entryPot ?? 0} /></b></span></div></div>
        </aside>
      </div>
    </form>
  </Dialog>;
}
