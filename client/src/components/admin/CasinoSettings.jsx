import { useLocale } from "../../locales/LocaleProvider.jsx";
import { useMemo, useState } from "react";
import { AlertTriangle, Bot, Clock3, Coins, Gift, Landmark, Mail, Megaphone, Plus, Save, ShieldCheck, Trash2, TrendingUp, Trophy, Users } from "lucide-react";
import { CosmeticIcon } from "../cosmetics/Cosmetics.jsx";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { CompactNumber, formatCompactNumber } from "../../utils/presentation.jsx";
import { bonusProgression, bonusRuleEffect, normalizeBonusSettings } from "../../features/bonus/config.js";
import { ProgressionSettings } from "./ProgressionSettings.jsx";
import { MarkdownContent } from "../patchnotes/MarkdownContent.jsx";
import "../navigation/lobby-notice.css";

const operationLabels = { add: "Ajouter", multiply: "Multiplier", set: "Définir" };

function BonusChart({ settings }) {
  const { t: localeText } = useLocale();
  const [days, setDays] = useState(90);
  const rows = useMemo(() => bonusProgression(settings, days), [settings, days]);
  const width = 960;
  const height = 300;
  const padding = { left: 72, right: 24, top: 24, bottom: 38 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maximum = Math.max(1, ...rows.map((row) => row.amount));
  const point = (row, index) => ({
    x: padding.left + (rows.length === 1 ? 0 : index * chartWidth / (rows.length - 1)),
    y: padding.top + chartHeight - row.amount / maximum * chartHeight
  });
  const points = rows.map((row, index) => point(row, index));
  const capDay = rows.find((row) => row.capped)?.streak;
  const last = rows.at(-1);
  return <section className="bonus-chart-panel">
    <header><div><span className="eyebrow">{localeText("Simulation")}</span><h3>{localeText("Évolution des versements")}</h3><p>{localeText("Projection pour une série sans journée manquée.")}</p></div><div className="segmented-tabs bonus-range-tabs">{[[30, "30 j"], [90, "3 mois"], [180, "6 mois"], [365, "1 an"]].map(([value, label]) => <button type="button" key={value} className={days === value ? "active" : ""} onClick={() => setDays(value)}>{localeText(label)}</button>)}</div></header>
    <div className="bonus-chart-summary"><span><small>{localeText("Premier versement")}</small><strong><CompactNumber value={rows[0]?.amount ?? 0} /></strong><b>×{rows[0]?.multiplier ?? 0}</b></span><span><small>{localeText("Au jour") + " "}{last?.streak}</small><strong><CompactNumber value={last?.amount ?? 0} /></strong><b>×{last?.multiplier ?? 0}</b></span><span><small>{localeText("Plafond atteint")}</small><strong>{capDay ? localeText("Jour {value0}", { value0: capDay }) : localeText("Après la période")}</strong><b>{localeText("Maximum ×")}{normalizeBonusSettings(settings).maxMultiplier}</b></span></div>
    <div className="bonus-line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={localeText("Évolution du bonus quotidien sur {value0} jours", { value0: days })}>
        {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={padding.left} x2={width - padding.right} y1={padding.top + chartHeight * ratio} y2={padding.top + chartHeight * ratio} /><text x={padding.left - 10} y={padding.top + chartHeight * ratio + 4}>{formatCompactNumber(maximum * (1 - ratio))}</text></g>)}
        <polyline points={points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} />
        {points.map(({ x, y }, index) => <circle key={rows[index].streak} className={rows[index].appliedRules.length ? "tier-point" : ""} cx={x} cy={y} r={rows[index].appliedRules.length ? 3.5 : 1.5}><title>{localeText("Jour") + " "}{rows[index].streak} · {rows[index].amount.toLocaleString("fr-FR")}{" " + localeText("jetons · ×")}{rows[index].multiplier}{rows[index].appliedRules.length ? ` · ${rows[index].appliedRules.map((rule) => rule.label).join(", ")}` : ""}</title></circle>)}
        <text className="bonus-chart-day" x={padding.left} y={height - 8}>{localeText("Jour 1")}</text><text className="bonus-chart-day" textAnchor="end" x={width - padding.right} y={height - 8}>{localeText("Jour") + " "}{last?.streak}</text>
      </svg>
    </div>
  </section>;
}

export function CasinoSettings({ draft, setDraft, onSubmit, saving, games = [] }) {
  const { t: localeText } = useLocale();
  const [section, setSection] = useState("identity");
  const [noticePreview, setNoticePreview] = useState(false);
  const notice = draft.lobbyNotice ?? { enabled: false, title: "", content: "", updatedAt: "" };
  const updateNotice = (key, value) => setDraft((current) => ({ ...current, lobbyNotice: { ...(current.lobbyNotice ?? notice), [key]: value } }));
  const config = normalizeBonusSettings(draft);
  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const updateRule = (id, field, value) => update("dailyBonusRules", config.rules.map((rule) => rule.id === id ? { ...rule, [field]: value } : rule));
  const removeRule = (id) => update("dailyBonusRules", config.rules.filter((rule) => rule.id !== id));
  const addRule = () => update("dailyBonusRules", [...config.rules, { id: `bonus-rule-${Date.now()}`, label: "Nouveau palier", day: 7, operation: "add", value: 0.5, repeat: false }]);

  return <form className="admin-settings casino-settings" onSubmit={onSubmit}>
    <header className="casino-settings-heading"><div><span className="eyebrow">{localeText("Configuration générale")}</span><h2>{localeText("Paramètres du casino")}</h2><p>{localeText("Identité, économie et rythme des parties appliqués par le serveur.")}</p></div><button type="submit" disabled={saving}><Save size={18} />{saving ? localeText("Enregistrement…") : localeText("Enregistrer")}</button></header>
    <nav className="segmented-tabs casino-settings-tabs" aria-label={localeText("Catégories des paramètres")}>
      <button type="button" className={section === "identity" ? "active" : ""} onClick={() => setSection("identity")}><Landmark size={17} />{localeText("Identité et accès")}</button>
      <button type="button" className={section === "economy" ? "active" : ""} onClick={() => setSection("economy")}><Coins size={17} />{localeText("Économie et bonus")}</button>
      <button type="button" className={section === "pacing" ? "active" : ""} onClick={() => setSection("pacing")}><Clock3 size={17} />{localeText("Rythme des parties")}</button>
      <button type="button" className={section === "progression" ? "active" : ""} onClick={() => setSection("progression")}><TrendingUp size={17} />{localeText("XP et titres")}</button>
      <button type="button" className={section === "notice" ? "active" : ""} onClick={() => setSection("notice")}><Megaphone size={17}/>{localeText("Annonce")}</button>
    </nav>

    {section === "identity" && <div className="casino-settings-panel identity-access-panel">
      <section className="settings-group settings-identity-group">
        <div className="settings-group-heading"><Landmark /><div><h3>{localeText("Identité publique")}</h3><p>{localeText("Ces éléments sont visibles à la connexion et dans la navigation du casino.")}</p></div></div>
        <div className="settings-field-grid identity-settings-fields">
          <label className="admin-site-icon-field">{localeText("Icône du site")}<span><span className="admin-site-icon-preview"><CosmeticIcon value="site" source={draft.siteIcon} /></span><input maxLength="6000" value={draft.siteIcon ?? ""} onChange={(event) => update("siteIcon", event.target.value)} placeholder={localeText("landmark, crown ou SVG")} /></span><small>{localeText("Nom d’une icône Lucide ou SVG personnalisé.")}</small></label>
          <label>{localeText("Nom du casino")}<input required maxLength="36" value={draft.siteName} onChange={(event) => update("siteName", event.target.value)} /></label>
          <label className="settings-field-wide">{localeText("Jeux à l’affiche")}<select value={draft.featuredGameId ?? ""} onChange={(event) => update("featuredGameId", event.target.value)}><option value="">{localeText("Premier jeu disponible")}</option>{games.filter((game) => game.enabled !== false).map((game) => <option value={game.id} key={game.id}>{localeText(game.name)}</option>)}</select></label>
          <label className="settings-field-wide">{localeText("Sous-titre")}<input required maxLength="120" value={draft.siteSubtitle} onChange={(event) => update("siteSubtitle", event.target.value)} /><small>{draft.siteSubtitle?.length ?? 0}{localeText("/120 caractères")}</small></label>
          <label className="settings-field-wide"><span><Mail size={16} />{" " + localeText("Email de contact")}</span><input required type="email" maxLength="254" autoComplete="off" value={draft.contactEmail ?? draft.supportEmail ?? ""} onChange={(event) => update("contactEmail", event.target.value)} /><small>{localeText("Contact public, recours, alertes de bugs, demandes de données et inscriptions parentales. L’expéditeur et la connexion SMTP restent configurés sur le serveur.")}</small></label>
        </div>
      </section>
      <section className="settings-group settings-access-group">
        <div className="settings-group-heading"><Users /><div><h3>{localeText("Accès au casino")}</h3><p>{localeText("Contrôle les modes de connexion proposés aux visiteurs.")}</p></div></div>
        <div className="settings-access-options">
          <label><span><ShieldCheck /><b>{localeText("Inscriptions")}</b><small>{localeText("Autoriser la création de nouveaux comptes persistants.")}</small></span><input type="checkbox" checked={draft.registrationsEnabled} onChange={(event) => update("registrationsEnabled", event.target.checked)} /></label>
          <label title={!draft.emailVerificationAvailable ? localeText("Configure le serveur SMTP pour activer cette option.") : ""}><span><ShieldCheck /><b>{localeText("Validation par email")}</b><small>{draft.emailVerificationAvailable ? localeText("Exiger la validation de l’adresse avant l’accès au casino.") : localeText("Indisponible tant que le serveur SMTP n’est pas configuré.")}</small></span><input type="checkbox" disabled={!draft.emailVerificationAvailable} checked={draft.emailVerificationRequired === true} onChange={(event) => update("emailVerificationRequired", event.target.checked)} /></label>
          <label><span><Users /><b>{localeText("Comptes invités")}</b><small>{localeText("Autoriser une session temporaire sans inscription.")}</small></span><input type="checkbox" checked={draft.guestAccessEnabled} onChange={(event) => update("guestAccessEnabled", event.target.checked)} /></label>
        </div>
      </section>
    </div>}

    {section === "notice" && <section className="settings-group lobby-notice-editor">
      <div className="settings-group-heading"><Megaphone/><div><h3>{localeText("Annonce du casino")}</h3></div></div>
      <label className="lobby-notice-visibility"><strong>{localeText("Afficher l’annonce")}</strong><input type="checkbox" checked={notice.enabled} onChange={(event) => updateNotice("enabled", event.target.checked)}/></label>
      <label>{localeText("Titre de l’annonce")}<input maxLength={100} value={notice.title} onChange={(event) => updateNotice("title", event.target.value)}/></label>
      <div className="segmented-tabs lobby-notice-preview"><button type="button" className={!noticePreview ? "active" : ""} onClick={() => setNoticePreview(false)}>{localeText("Rédaction")}</button><button type="button" className={noticePreview ? "active" : ""} onClick={() => setNoticePreview(true)}>{localeText("Aperçu")}</button></div>
      {!noticePreview ? <label>{localeText("Contenu de l’annonce (Markdown)")}<textarea required={notice.enabled} maxLength={20000} value={notice.content} onChange={(event) => updateNotice("content", event.target.value)}/></label> : <div className="lobby-notice-preview"><h4>{notice.title || localeText("Annonce")}</h4><MarkdownContent>{notice.content}</MarkdownContent></div>}
    </section>}

    {section === "economy" && <div className="casino-settings-panel economy-bonus-panel">
      <section className="settings-group economy-settings-group">
        <div className="settings-group-heading"><Coins /><div><h3>{localeText("Économie générale")}</h3><p>{localeText("Soldes initiaux et limite minimale des nouvelles tables.")}</p></div></div>
        <div className="settings-field-grid economy-settings-fields"><label>{localeText("Jetons à l’inscription")}<input type="number" min="0" max="10000000" value={draft.signupTokens} onChange={(event) => update("signupTokens", Number(event.target.value))} /></label><label>{localeText("Mise minimale")}<input type="number" min="1" max="1000000" value={draft.minRoomStake} onChange={(event) => update("minRoomStake", Number(event.target.value))} /></label></div>
      </section>
      <section className="settings-group bonus-settings-group">
        <div className="settings-group-heading"><Gift /><div><h3>{localeText("Bonus quotidien")}</h3><p>{localeText("Le plafond est appliqué après chaque règle et ne peut jamais être dépassé.")}</p></div></div>
        <div className="settings-field-grid bonus-core-fields">
          <label>{localeText("Jetons bonus de base")}<input type="number" min="0" max="1000000" value={draft.dailyTokens} onChange={(event) => update("dailyTokens", Number(event.target.value))} /><small>{localeText("Montant multiplié lors du versement.")}</small></label>
          <label>{localeText("Multiplicateur par défaut")}<input type="number" min="0.1" max="1000000" step="0.1" value={draft.dailyBonusDefaultMultiplier ?? 1} onChange={(event) => update("dailyBonusDefaultMultiplier", Number(event.target.value))} /><small>{localeText("Valeur au début d’une nouvelle série.")}</small></label>
          <label>{localeText("Multiplicateur maximal")}<input type="number" min={draft.dailyBonusDefaultMultiplier ?? 1} max="1000000" step="0.1" value={draft.dailyBonusMaxMultiplier ?? 100} onChange={(event) => update("dailyBonusMaxMultiplier", Number(event.target.value))} /><small>{localeText("Limite absolue de tous les paliers.")}</small></label>
        </div>
        <div className="bonus-rule-heading"><div><TrendingUp /><span><strong>{localeText("Paliers de progression")}</strong><small>{localeText("Les règles d’un même jour sont appliquées dans l’ordre affiché.")}</small></span></div><button type="button" className="secondary" onClick={addRule}><Plus size={16} />{localeText("Ajouter un palier")}</button></div>
        <div className="bonus-rule-list">
          {config.rules.map((rule, index) => <article key={rule.id}>
            <span className="bonus-rule-index">{index + 1}</span>
            <label>{localeText("Nom")}<input maxLength="60" value={rule.label} onChange={(event) => updateRule(rule.id, "label", event.target.value)} /></label>
            <label>{localeText("Jour")}<input type="number" min="1" max="3650" value={rule.day} onChange={(event) => updateRule(rule.id, "day", Number(event.target.value))} /></label>
            <label>{localeText("Fréquence")}<select value={rule.repeat ? "repeat" : "once"} onChange={(event) => updateRule(rule.id, "repeat", event.target.value === "repeat")}><option value="once">{localeText("Une fois")}</option><option value="repeat">{localeText("Tous les N jours")}</option></select></label>
            <label>{localeText("Effet")}<select value={rule.operation} onChange={(event) => updateRule(rule.id, "operation", event.target.value)}>{Object.entries(operationLabels).map(([value, label]) => <option key={value} value={value}>{localeText(label)}</option>)}</select></label>
            <label>{localeText("Valeur")}<input type="number" min="0" max="1000000" step="0.1" value={rule.value} onChange={(event) => updateRule(rule.id, "value", Number(event.target.value))} /></label>
            <span className="bonus-rule-readout">{localeText("Jour") + " "}{rule.day}{rule.repeat ? localeText(" puis tous les {value0} jours", { value0: rule.day }) : localeText(" uniquement")}<b>{bonusRuleEffect(rule)}</b></span>
            <ConfirmActionButton className="secondary icon-toggle danger-icon" title={localeText("Supprimer ce palier")} dialogTitle={localeText("Supprimer ce palier ?")} message={localeText("La règle « {value0} » sera retirée de la progression du bonus.", { value0: rule.label })} confirmLabel={localeText("Supprimer le palier")} danger onConfirm={() => removeRule(rule.id)}><Trash2 size={17} /></ConfirmActionButton>
          </article>)}
          {!config.rules.length && <div className="empty-state">{localeText("Aucun palier : le multiplicateur par défaut restera constant.")}</div>}
        </div>
      </section>
      <BonusChart settings={draft} />
    </div>}

    {section === "progression" && <ProgressionSettings value={draft.gameProgression} onChange={(value) => update("gameProgression", value)} games={games} />}
    {section === "pacing" && <div className="casino-settings-panel pacing-settings-panel">
      <section className="settings-group pacing-settings-group">
        <div className="settings-group-heading"><Clock3 /><div><h3>{localeText("Temporisations de table")}</h3><p>{localeText("Ces durées sont copiées dans une partie lorsqu’elle démarre et restent stables jusqu’à son terme.")}</p></div></div>
        <div className="pacing-setting-list">
          <label className="pacing-setting-card"><span className="pacing-setting-icon"><Bot /></span><span className="pacing-setting-copy"><b>{localeText("Réflexion de l’IA")}</b><small>{localeText("Délai avant que le bot effectue son action.")}</small></span><span className="pacing-setting-input"><input type="number" min="0" max="30" step="1" value={draft.botThinkingSeconds ?? 1} onChange={(event) => update("botThinkingSeconds", Number(event.target.value))} /><i>{localeText("secondes")}</i></span></label>
          <label className="pacing-setting-card"><span className="pacing-setting-icon"><Clock3 /></span><span className="pacing-setting-copy"><b>{localeText("Lecture de fin de tour")}</b><small>{localeText("Maintient le plateau visible avant le joueur suivant.")}</small></span><span className="pacing-setting-input"><input type="number" min="1" max="60" step="1" value={draft.turnEndDelaySeconds ?? 5} onChange={(event) => update("turnEndDelaySeconds", Number(event.target.value))} /><i>{localeText("secondes")}</i></span></label>
          <label className="pacing-setting-card"><span className="pacing-setting-icon"><Trophy /></span><span className="pacing-setting-copy"><b>{localeText("Récapitulatif de manche")}</b><small>{localeText("Durée du classement affiché entre deux manches. Une valeur de 0 le désactive.")}</small></span><span className="pacing-setting-input"><input type="number" min="0" max="120" step="1" value={draft.roundResultsSeconds ?? 30} onChange={(event) => update("roundResultsSeconds", Number(event.target.value))} /><i>{localeText("secondes")}</i></span></label>
        </div>
        <div className="pacing-sequence" aria-label={localeText("Ordre des temporisations")}><span><b>1</b>{localeText("Action")}</span><span><b>2</b>{localeText("Lecture de fin de tour")}</span><span><b>3</b>{localeText("Réflexion de l’IA suivante")}</span><span><b>4</b>{localeText("Récapitulatif si la manche se termine")}</span></div>
      </section>
    </div>}

    <footer className="admin-settings-footer"><div><AlertTriangle size={18} /><span>{localeText("Les paramètres économiques s’appliquent aux nouvelles opérations. Les temporisations sont figées au lancement de chaque partie.")}</span></div><button type="submit" disabled={saving}><Save size={17} />{saving ? localeText("Enregistrement…") : localeText("Enregistrer les paramètres")}</button></footer>
  </form>;
}
