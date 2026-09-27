import { useMemo, useState } from "react";
import { AlertTriangle, Coins, Gift, Landmark, Plus, Save, ShieldCheck, Trash2, TrendingUp, Users } from "lucide-react";
import { CosmeticIcon } from "../cosmetics/Cosmetics.jsx";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { CompactNumber, formatCompactNumber } from "../../utils/presentation.jsx";
import { bonusProgression, bonusRuleEffect, normalizeBonusSettings } from "../../features/bonus/config.js";

const operationLabels = { add: "Ajouter", multiply: "Multiplier", set: "Définir" };

function BonusChart({ settings }) {
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
    <header><div><span className="eyebrow">Simulation</span><h3>Évolution des versements</h3><p>Projection pour une série sans journée manquée.</p></div><div className="segmented-tabs bonus-range-tabs">{[[30, "30 j"], [90, "3 mois"], [180, "6 mois"], [365, "1 an"]].map(([value, label]) => <button type="button" key={value} className={days === value ? "active" : ""} onClick={() => setDays(value)}>{label}</button>)}</div></header>
    <div className="bonus-chart-summary"><span><small>Premier versement</small><strong><CompactNumber value={rows[0]?.amount ?? 0} /></strong><b>×{rows[0]?.multiplier ?? 0}</b></span><span><small>Au jour {last?.streak}</small><strong><CompactNumber value={last?.amount ?? 0} /></strong><b>×{last?.multiplier ?? 0}</b></span><span><small>Plafond atteint</small><strong>{capDay ? `Jour ${capDay}` : "Après la période"}</strong><b>Maximum ×{normalizeBonusSettings(settings).maxMultiplier}</b></span></div>
    <div className="bonus-line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Évolution du bonus quotidien sur ${days} jours`}>
        {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={padding.left} x2={width - padding.right} y1={padding.top + chartHeight * ratio} y2={padding.top + chartHeight * ratio} /><text x={padding.left - 10} y={padding.top + chartHeight * ratio + 4}>{formatCompactNumber(maximum * (1 - ratio))}</text></g>)}
        <polyline points={points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} />
        {points.map(({ x, y }, index) => <circle key={rows[index].streak} className={rows[index].appliedRules.length ? "tier-point" : ""} cx={x} cy={y} r={rows[index].appliedRules.length ? 3.5 : 1.5}><title>Jour {rows[index].streak} · {rows[index].amount.toLocaleString("fr-FR")} jetons · ×{rows[index].multiplier}{rows[index].appliedRules.length ? ` · ${rows[index].appliedRules.map((rule) => rule.label).join(", ")}` : ""}</title></circle>)}
        <text className="bonus-chart-day" x={padding.left} y={height - 8}>Jour 1</text><text className="bonus-chart-day" textAnchor="end" x={width - padding.right} y={height - 8}>Jour {last?.streak}</text>
      </svg>
    </div>
  </section>;
}

export function CasinoSettings({ draft, setDraft, onSubmit, saving }) {
  const [section, setSection] = useState("identity");
  const config = normalizeBonusSettings(draft);
  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const updateRule = (id, field, value) => update("dailyBonusRules", config.rules.map((rule) => rule.id === id ? { ...rule, [field]: value } : rule));
  const removeRule = (id) => update("dailyBonusRules", config.rules.filter((rule) => rule.id !== id));
  const addRule = () => update("dailyBonusRules", [...config.rules, { id: `bonus-rule-${Date.now()}`, label: "Nouveau palier", day: 7, operation: "add", value: 0.5, repeat: false }]);

  return <form className="admin-settings casino-settings" onSubmit={onSubmit}>
    <header className="casino-settings-heading"><div><span className="eyebrow">Configuration générale</span><h2>Paramètres du casino</h2><p>Identité, accès et règles économiques appliquées par le serveur.</p></div><button type="submit" disabled={saving}><Save size={18} />{saving ? "Enregistrement…" : "Enregistrer"}</button></header>
    <nav className="segmented-tabs casino-settings-tabs" aria-label="Catégories des paramètres">
      <button type="button" className={section === "identity" ? "active" : ""} onClick={() => setSection("identity")}><Landmark size={17} />Identité et accès</button>
      <button type="button" className={section === "economy" ? "active" : ""} onClick={() => setSection("economy")}><Coins size={17} />Économie et bonus</button>
    </nav>

    {section === "identity" && <div className="casino-settings-panel identity-access-panel">
      <section className="settings-group settings-identity-group">
        <div className="settings-group-heading"><Landmark /><div><h3>Identité publique</h3><p>Ces éléments sont visibles à la connexion et dans la navigation du casino.</p></div></div>
        <div className="settings-field-grid identity-settings-fields">
          <label className="admin-site-icon-field">Icône du site<span><span className="admin-site-icon-preview"><CosmeticIcon value="site" source={draft.siteIcon} /></span><input maxLength="6000" value={draft.siteIcon ?? ""} onChange={(event) => update("siteIcon", event.target.value)} placeholder="landmark, crown ou SVG" /></span><small>Nom d’une icône Lucide ou SVG personnalisé.</small></label>
          <label>Nom du casino<input required maxLength="36" value={draft.siteName} onChange={(event) => update("siteName", event.target.value)} /></label>
          <label className="settings-field-wide">Sous-titre<input required maxLength="120" value={draft.siteSubtitle} onChange={(event) => update("siteSubtitle", event.target.value)} /><small>{draft.siteSubtitle?.length ?? 0}/120 caractères</small></label>
        </div>
      </section>
      <section className="settings-group settings-access-group">
        <div className="settings-group-heading"><Users /><div><h3>Accès au casino</h3><p>Contrôle les modes de connexion proposés aux visiteurs.</p></div></div>
        <div className="settings-access-options">
          <label><span><ShieldCheck /><b>Inscriptions</b><small>Autoriser la création de nouveaux comptes persistants.</small></span><input type="checkbox" checked={draft.registrationsEnabled} onChange={(event) => update("registrationsEnabled", event.target.checked)} /></label>
          <label><span><Users /><b>Comptes invités</b><small>Autoriser une session temporaire sans inscription.</small></span><input type="checkbox" checked={draft.guestAccessEnabled} onChange={(event) => update("guestAccessEnabled", event.target.checked)} /></label>
        </div>
      </section>
    </div>}

    {section === "economy" && <div className="casino-settings-panel economy-bonus-panel">
      <section className="settings-group economy-settings-group">
        <div className="settings-group-heading"><Coins /><div><h3>Économie générale</h3><p>Soldes initiaux et limite minimale des nouvelles tables.</p></div></div>
        <div className="settings-field-grid economy-settings-fields"><label>Jetons à l’inscription<input type="number" min="0" max="10000000" value={draft.signupTokens} onChange={(event) => update("signupTokens", Number(event.target.value))} /></label><label>Mise minimale<input type="number" min="1" max="1000000" value={draft.minRoomStake} onChange={(event) => update("minRoomStake", Number(event.target.value))} /></label></div>
      </section>
      <section className="settings-group bonus-settings-group">
        <div className="settings-group-heading"><Gift /><div><h3>Bonus quotidien</h3><p>Le plafond est appliqué après chaque règle et ne peut jamais être dépassé.</p></div></div>
        <div className="settings-field-grid bonus-core-fields">
          <label>Jetons bonus de base<input type="number" min="0" max="1000000" value={draft.dailyTokens} onChange={(event) => update("dailyTokens", Number(event.target.value))} /><small>Montant multiplié lors du versement.</small></label>
          <label>Multiplicateur par défaut<input type="number" min="0.1" max="1000000" step="0.1" value={draft.dailyBonusDefaultMultiplier ?? 1} onChange={(event) => update("dailyBonusDefaultMultiplier", Number(event.target.value))} /><small>Valeur au début d’une nouvelle série.</small></label>
          <label>Multiplicateur maximal<input type="number" min={draft.dailyBonusDefaultMultiplier ?? 1} max="1000000" step="0.1" value={draft.dailyBonusMaxMultiplier ?? 100} onChange={(event) => update("dailyBonusMaxMultiplier", Number(event.target.value))} /><small>Limite absolue de tous les paliers.</small></label>
        </div>
        <div className="bonus-rule-heading"><div><TrendingUp /><span><strong>Paliers de progression</strong><small>Les règles d’un même jour sont appliquées dans l’ordre affiché.</small></span></div><button type="button" className="secondary" onClick={addRule}><Plus size={16} />Ajouter un palier</button></div>
        <div className="bonus-rule-list">
          {config.rules.map((rule, index) => <article key={rule.id}>
            <span className="bonus-rule-index">{index + 1}</span>
            <label>Nom<input maxLength="60" value={rule.label} onChange={(event) => updateRule(rule.id, "label", event.target.value)} /></label>
            <label>Jour<input type="number" min="1" max="3650" value={rule.day} onChange={(event) => updateRule(rule.id, "day", Number(event.target.value))} /></label>
            <label>Fréquence<select value={rule.repeat ? "repeat" : "once"} onChange={(event) => updateRule(rule.id, "repeat", event.target.value === "repeat")}><option value="once">Une fois</option><option value="repeat">Tous les N jours</option></select></label>
            <label>Effet<select value={rule.operation} onChange={(event) => updateRule(rule.id, "operation", event.target.value)}>{Object.entries(operationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Valeur<input type="number" min="0" max="1000000" step="0.1" value={rule.value} onChange={(event) => updateRule(rule.id, "value", Number(event.target.value))} /></label>
            <span className="bonus-rule-readout">Jour {rule.day}{rule.repeat ? ` puis tous les ${rule.day} jours` : " uniquement"}<b>{bonusRuleEffect(rule)}</b></span>
            <ConfirmActionButton className="secondary icon-toggle danger-icon" title="Supprimer ce palier" dialogTitle="Supprimer ce palier ?" message={`La règle « ${rule.label} » sera retirée de la progression du bonus.`} confirmLabel="Supprimer le palier" danger onConfirm={() => removeRule(rule.id)}><Trash2 size={17} /></ConfirmActionButton>
          </article>)}
          {!config.rules.length && <div className="empty-state">Aucun palier : le multiplicateur par défaut restera constant.</div>}
        </div>
      </section>
      <BonusChart settings={draft} />
    </div>}

    <footer className="admin-settings-footer"><div><AlertTriangle size={18} /><span>Les changements s’appliquent aux prochaines inscriptions, récupérations de bonus et créations de table.</span></div><button type="submit" disabled={saving}><Save size={17} />{saving ? "Enregistrement…" : "Enregistrer les paramètres"}</button></footer>
  </form>;
}
