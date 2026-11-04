import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { Die, DiceThrowTray } from "../game/GamePieces.jsx";
import { defaultMidnightContracts, midnightCatalogLimits, midnightContractTiers, midnightSpecialConditions, normalizeMidnightRule, midnightRuleDescription, midnightExample, evaluateMidnightDefinition } from "../../features/games/midnightDice/contracts.js";
import "./midnight-contract-editor.css";

const newRule = type => type === "ordered" || type === "unordered" ? { type, values: [4, 2, 1] } : type === "sum" ? { type, comparison: "eq", value: 10 } : { type: "special", condition: "sum-two" };
const numberValue = event => event.target.value === "" ? "" : Number(event.target.value);
export function MidnightContractsEditor({ value, onChange }) {
  const { t } = useLocale();
  const entries = value ?? defaultMidnightContracts;
  const [selectedId, setSelectedId] = useState(entries[0]?.id), [testDice, setTestDice] = useState([1, 2, 3]);
  const selected = entries.find(entry => entry.id === selectedId) ?? entries[0];
  const ruleSignature = JSON.stringify(selected?.rule);
  useEffect(() => {
    if (!selected) return;
    try { setTestDice(midnightExample({ ...selected, rule: normalizeMidnightRule(selected.rule) })); } catch { setTestDice([1, 2, 3]); }
  }, [selected?.id, ruleSignature]);
  const change = patch => onChange(entries.map(entry => entry.id === selected.id ? { ...entry, ...patch } : entry));
  const changeRule = rule => change({ rule, hint: "", example: undefined });
  function add() {
    const entry = { id: `mandat-${crypto.randomUUID()}`, label: "Nouveau mandat", hint: "", tier: "bronze", rule: newRule("ordered") };
    onChange([...entries, entry]); setSelectedId(entry.id);
  }
  function remove() {
    const remaining = entries.filter(entry => entry.id !== selected.id);
    onChange(remaining); setSelectedId(remaining[0]?.id);
  }
  let preview, previewError = "", description = "";
  try { const rule = normalizeMidnightRule(selected?.rule); preview = evaluateMidnightDefinition({ ...selected, rule }, testDice); description = midnightRuleDescription(rule); }
  catch (error) { previewError = error.message; }
  const rule = selected?.rule ?? newRule("ordered"), tier = midnightContractTiers[selected?.tier] ?? midnightContractTiers.bronze;
  const diceFields = (values, prefix, update) => <div className="midnight-config-dice">{values.map((die, index) => <label key={index}>{t(prefix, { number: index + 1 })}<select aria-label={t(prefix, { number: index + 1 })} value={die} onChange={event => update(values.map((value, i) => i === index ? Number(event.target.value) : value))}>{[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}</option>)}</select></label>)}</div>;
  return <section className="midnight-config" aria-label={t("Gestion des mandats")}>
    <header><div><h3>{t("Mandats des Dés de Minuit")}</h3><p>{t("Crée, modifie ou supprime les mandats, puis enregistre les paramètres du jeu.")}</p></div><button type="button" className="secondary" onClick={add} disabled={entries.length >= midnightCatalogLimits.maximum}><Plus size={16}/>{t("Créer un mandat")}</button></header>
    <p className="midnight-config-note">{t("Les parties commencées conservent leurs mandats. Le catalogue doit contenir entre 6 et 24 mandats pour préserver les rotations et les propositions distinctes.")}</p>
    <div className="midnight-config-workspace">
      <div className="midnight-config-list" role="group" aria-label={t("Mandats disponibles")}>{entries.map(entry => <button type="button" className={entry.id === selected?.id ? "active" : "secondary"} aria-pressed={entry.id === selected?.id} key={entry.id} onClick={() => setSelectedId(entry.id)}><strong>{entry.label || t("Sans nom")}</strong><small>{t(midnightContractTiers[entry.tier]?.label)} · +{midnightContractTiers[entry.tier]?.bonus} {t("pts")}</small></button>)}</div>
      {selected && <div className="midnight-config-fields">
        <div className="midnight-config-title"><small>{selected.id}</small><ConfirmActionButton className="secondary" disabled={entries.length <= midnightCatalogLimits.minimum} danger dialogTitle={t("Supprimer ce mandat ?")} message={t("Ce mandat sera retiré du catalogue à l’enregistrement. Les parties déjà commencées le conserveront.")} confirmLabel={t("Supprimer le mandat")} onConfirm={remove}><Trash2 size={15}/>{t("Supprimer le mandat")}</ConfirmActionButton></div>
        <label>{t("Nom du mandat")}<input required aria-label={t("Nom du mandat")} maxLength={60} value={selected.label} onChange={event => change({ label: event.target.value })}/></label>
        <div className="midnight-config-grid"><label>{t("Palier du mandat")}<select aria-label={t("Palier du mandat")} value={selected.tier} onChange={event => change({ tier: event.target.value })}>{Object.entries(midnightContractTiers).map(([id, info]) => <option key={id} value={id}>{t(info.label)} · +{info.bonus} {t("pts")}</option>)}</select></label>
          <label>{t("Type de condition")}<select aria-label={t("Type de condition")} value={rule.type} onChange={event => changeRule(newRule(event.target.value))}>{[["ordered", "Dés fixes — ordre de prise imposé"], ["unordered", "Dés variables — ordre libre"], ["sum", "Condition sur la somme"], ["special", "Condition spéciale"]].map(([id, label]) => <option value={id} key={id}>{t(label)}</option>)}</select></label></div>
        {["ordered", "unordered"].includes(rule.type) && diceFields(rule.values, "Dé requis {number}", values => changeRule({ ...rule, values }))}
        {rule.type === "sum" && <div className="midnight-config-grid"><label>{t("Comparaison de la somme")}<select aria-label={t("Comparaison de la somme")} value={rule.comparison} onChange={event => changeRule({ ...rule, comparison: event.target.value, ...(event.target.value === "between" ? { maximum: rule.maximum ?? 18 } : {}) })}>{[["eq", "Égale à"], ["gte", "Au moins"], ["lte", "Au plus"], ["between", "Entre deux valeurs"]].map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}</select></label><label>{t("Somme cible ou minimum")}<input required aria-label={t("Somme cible ou minimum")} type="number" min={3} max={18} value={rule.value} onChange={event => changeRule({ ...rule, value: numberValue(event) })}/></label>{rule.comparison === "between" && <label>{t("Somme maximum")}<input required aria-label={t("Somme maximum")} type="number" min={3} max={18} value={rule.maximum} onChange={event => changeRule({ ...rule, maximum: numberValue(event) })}/></label>}</div>}
        {rule.type === "special" && <><label>{t("Condition spéciale")}<select aria-label={t("Condition spéciale")} value={rule.condition} onChange={event => changeRule({ type: "special", condition: event.target.value, ...(event.target.value === "contains" ? { values: [1, 6] } : event.target.value === "range" ? { minimum: 1, maximum: 6 } : {}) })}>{Object.entries(midnightSpecialConditions).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}</select></label>
          {rule.condition === "contains" && <><label>{t("Nombre de valeurs requises")}<select aria-label={t("Nombre de valeurs requises")} value={rule.values.length} onChange={event => changeRule({ ...rule, values: Array.from({ length: Number(event.target.value) }, (_, i) => rule.values[i] ?? 1) })}>{[1, 2, 3].map(value => <option key={value}>{value}</option>)}</select></label>{diceFields(rule.values, "Dé requis {number}", values => changeRule({ ...rule, values }))}</>}
          {rule.condition === "range" && <div className="midnight-config-grid">{["minimum", "maximum"].map(field => <label key={field}>{t(field === "minimum" ? "Valeur minimum du dé" : "Valeur maximum du dé")}<input required aria-label={t(field === "minimum" ? "Valeur minimum du dé" : "Valeur maximum du dé")} type="number" min={1} max={6} value={rule[field]} onChange={event => changeRule({ ...rule, [field]: numberValue(event) })}/></label>)}</div>}</>}
        <label>{t("Texte d’aide facultatif")}<input aria-label={t("Texte d’aide facultatif")} maxLength={200} placeholder={description} value={selected.hint ?? ""} onChange={event => change({ hint: event.target.value })}/><small>{t("Laisse vide pour décrire automatiquement la condition.")}</small></label>
        <div className="midnight-config-preview" style={{ "--contract-accent": tier.accent }}><h4>{t("Tester une combinaison")}</h4><p>{description}</p>{diceFields(testDice, "Dé test {number}", setTestDice)}<DiceThrowTray compact label={t("Aperçu des dés")} caption={t(tier.label)}>{testDice.map((die, index) => <Die key={index} value={die} animate={false}/>)}</DiceThrowTray>{previewError ? <p role="alert" className="error">{t(previewError)}</p> : <p role="status"><strong>{t(preview?.achieved ? "Mandat réussi" : "Mandat non réalisé")}</strong> · {preview?.base} + {preview?.bonus} = {preview?.points} {t("points")}</p>}</div>
      </div>}
    </div>
  </section>;
}
