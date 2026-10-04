import { ModalBackdrop } from "../common/ModalBackdrop.jsx";
import { useMemo, useState } from "react";
import { BadgeCheck, Braces, Copy, Plus, Save, Search, Trash2, X } from "lucide-react";
import { api } from "../../api.js";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { AchievementWizard } from "./AchievementWizard.jsx";
import { describeAchievementRule } from "./achievement-guide.js";
import { Pagination } from "../feedback/Feedback.jsx";
import { usePagination } from "../common/usePagination.js";
import { AchievementValuePicker, itemChoices } from "./AchievementValuePicker.jsx";

const operatorLabels = {
  eq: "est égal à", neq: "est différent de", gt: "est supérieur à", gte: "est supérieur ou égal à",
  lt: "est inférieur à", lte: "est inférieur ou égal à", in: "appartient à", notIn: "n'appartient pas à",
  contains: "contient", containsAny: "contient au moins une valeur", containsAll: "contient toutes les valeurs",
  exists: "existe", startsWith: "commence par", endsWith: "se termine par"
};
const aggregateLabels = { match: "Validation immédiate", count: "Nombre d'occurrences", sum: "Somme", max: "Valeur maximale", distinct: "Valeurs distinctes", streak: "Série consécutive" };
const scopeLabels = { event: "Un seul événement", game: "Une partie", career: "Toute la carrière" };

function firstField(eventSchema) {
  return eventSchema?.fields?.[0]?.field ?? "gameId";
}

function defaultCondition(eventSchema) {
  return { all: [{ field: firstField(eventSchema), operator: "exists", value: true }] };
}

function displayValue(value) {
  return Array.isArray(value) ? value.join(", ") : value === true ? "true" : value === false ? "false" : value ?? "";
}

function parseValue(value, operator) {
  if (["in", "notIn", "containsAny", "containsAll"].includes(operator)) return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (value === "true") return true;
  if (value === "false") return false;
  if (value !== "" && Number.isFinite(Number(value))) return Number(value);
  return value;
}

function ConditionValue({ node, fields, onChange }) {
  const field = fields.find((entry) => entry.field === node.field);
  const choices = field?.choices;
  const multiple = ["containsAny", "containsAll", "in", "notIn"].includes(node.operator);
  if (field?.visual && ["eq", "neq", "contains", "containsAny", "containsAll", "in", "notIn"].includes(node.operator)) {
    return <AchievementValuePicker choices={choices ?? []} value={node.value} multiple={multiple} label={field.label} onChange={(value) => onChange({ ...node, value })} />;
  }
  if (choices?.length && ["eq", "neq", "contains", "containsAny", "containsAll", "in", "notIn"].includes(node.operator)) {
    const selected = multiple ? (Array.isArray(node.value) ? node.value : node.value ? [node.value] : []) : String(node.value ?? "");
    const missing = (multiple ? selected : [selected]).filter((value) => value && !choices.some((choice) => choice.value === value));
    return <select aria-label="Valeur" multiple={multiple} value={selected} onChange={(event) => onChange({ ...node, value: multiple ? [...event.target.selectedOptions].map((option) => option.value) : event.target.value })}>{!multiple && <option value="">Choisir</option>}{missing.map((value) => <option key={value} value={value}>{value} (hors catalogue)</option>)}{choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>;
  }
  return <input aria-label="Valeur" value={displayValue(node.value)} placeholder={node.field === "markers" ? "secret:answer-42" : "Valeur ou liste séparée par des virgules"} onChange={(event) => onChange({ ...node, value: parseValue(event.target.value, node.operator) })} />;
}

function ConditionEditor({ node, fields, onChange, onRemove, depth = 0 }) {
  const groupMode = Array.isArray(node?.all) ? "all" : Array.isArray(node?.any) ? "any" : node?.not ? "not" : null;
  if (groupMode) {
    const rows = groupMode === "not" ? [node.not] : node[groupMode];
    const groupNode = (mode, nextRows) => mode === "not" ? { not: nextRows[0] } : { [mode]: nextRows };
    const updateRow = (index, next) => onChange(groupNode(groupMode, rows.map((row, rowIndex) => rowIndex === index ? next : row)));
    return <div className={`achievement-condition-group depth-${depth}`}>
      <div className="achievement-condition-toolbar">
        <select aria-label="Opérateur du groupe" value={groupMode} onChange={(event) => onChange(groupNode(event.target.value, rows))}><option value="all">Toutes les conditions (ET)</option><option value="any">Au moins une condition (OU)</option><option value="not">Condition inversée (NON)</option></select>
        {onRemove && <button type="button" className="secondary icon-toggle" onClick={onRemove} title="Supprimer le groupe"><Trash2 size={15} /></button>}
      </div>
      <div className="achievement-condition-rows">{rows.map((row, index) => <ConditionEditor key={index} node={row} fields={fields} depth={depth + 1} onChange={(next) => updateRow(index, next)} onRemove={groupMode !== "not" && rows.length > 1 ? () => onChange(groupNode(groupMode, rows.filter((_, rowIndex) => rowIndex !== index))) : null} />)}</div>
      {groupMode !== "not" && <div className="actions">
        <button type="button" className="secondary compact" onClick={() => onChange(groupNode(groupMode, [...rows, { field: fields[0]?.field ?? "gameId", operator: "eq", value: "" }]))}><Plus size={14} /> Condition</button>
        {depth < 3 && <button type="button" className="secondary compact" onClick={() => onChange(groupNode(groupMode, [...rows, { all: [{ field: fields[0]?.field ?? "gameId", operator: "eq", value: "" }] }]))}><Braces size={14} /> Groupe</button>}
      </div>}
    </div>;
  }
  return <div className="achievement-condition-row">
    <select aria-label="Champ" value={node.field ?? ""} onChange={(event) => onChange({ ...node, field: event.target.value, valueField: undefined, value: node.operator === "exists" ? true : "" })}>{fields.map((entry) => <option key={entry.field} value={entry.field}>{entry.label}</option>)}</select>
    <select aria-label="Comparaison" value={node.operator ?? "eq"} onChange={(event) => { const operator = event.target.value; const multi = ["containsAny", "containsAll", "in", "notIn"].includes(operator); const value = node.operator === "exists" ? "" : node.value; onChange({ ...node, operator, value: operator === "exists" ? true : multi ? Array.isArray(value) ? value : value ? [value] : [] : Array.isArray(value) ? value[0] ?? "" : value }); }}>{Object.entries(operatorLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    {node.operator === "exists" ? <select aria-label="Présence" value={String(node.value !== false)} onChange={(event) => onChange({ ...node, value: event.target.value === "true" })}><option value="true">Oui</option><option value="false">Non</option></select> : <><select aria-label="Source de comparaison" value={node.valueField ? "field" : "literal"} onChange={(event) => onChange(event.target.value === "field" ? { ...node, valueField: fields[0]?.field, value: undefined } : { ...node, valueField: undefined, value: "" })}><option value="literal">Valeur fixe</option><option value="field">Autre champ</option></select>{node.valueField ? <select aria-label="Champ comparé" value={node.valueField} onChange={(event) => onChange({ ...node, valueField: event.target.value })}>{fields.map((entry) => <option key={entry.field} value={entry.field}>{entry.label}</option>)}</select> : <ConditionValue node={node} fields={fields} onChange={onChange} />}</>}
    {onRemove && <button type="button" className="secondary icon-toggle" onClick={onRemove} title="Supprimer"><X size={15} /></button>}
  </div>;
}

function newAchievement(schemas) {
  const event = schemas?.events?.[0];
  return {
    id: "", title: "", description: "", group: "Personnalisés", type: "site", target: 1,
    milestone: false, secret: false, enabled: false, gameId: null,
    rule: { source: "event", event: event?.id ?? "game.action", scope: "event", aggregate: "match", condition: defaultCondition(event) }
  };
}

export function AchievementsAdmin({ achievements = [], schemas, games = [], shop = [], reload, reportError, notifySuccess }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [guided, setGuided] = useState(false);
  const [editorError, setEditorError] = useState("");
  const rows = useMemo(() => achievements
    .filter((entry) => filter === "all" || (filter === "enabled" ? entry.enabled !== false : filter === "disabled" ? entry.enabled === false : entry.builtIn === (filter === "built-in")))
    .filter((entry) => `${entry.title} ${entry.description} ${entry.group} ${entry.gameId ?? ""} ${entry.id}`.toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr"))), [achievements, filter, search]);
  const eventSchema = schemas?.events?.find((entry) => entry.id === editing?.rule?.event) ?? schemas?.events?.[0];
  const conditionFields = useMemo(() => {
    const items = itemChoices(shop);
    const unlocked = achievements.map((entry) => ({ value: entry.id, label: entry.title, description: entry.description, category: entry.group, kind: "achievement" }));
    const gameChoices = games.map((game) => ({ value: game.id, label: game.name, category: "Jeux", kind: "game" }));
    const catalogs = { "player.ownedItemIds": items, "player.equippedItemIds": items, itemId: items, "player.achievementIds": unlocked, achievementId: unlocked, "player.favoriteGameIds": gameChoices, gameId: gameChoices };
    return (eventSchema?.fields ?? []).map((field) => catalogs[field.field] ? { ...field, visual: true, choices: catalogs[field.field] } : field);
  }, [eventSchema, shop, achievements, games]);
  const pages = usePagination(rows, `${filter}:${search}`, 12);

  function update(field, value) {
    setEditing((current) => ({ ...current, [field]: value }));
  }

  function updateRule(field, value) {
    setEditing((current) => {
      const rule = { ...current.rule, [field]: value };
      if (field === "source") return { ...current, rule: value === "metric" ? { source: "metric", metric: schemas.metrics[0]?.id ?? "gamesPlayed" } : { source: "event", event: schemas.events[0]?.id ?? "game.action", scope: "event", aggregate: "match", condition: defaultCondition(schemas.events[0]) } };
      if (field === "event") {
        const nextSchema = schemas.events.find((entry) => entry.id === value);
        rule.condition = defaultCondition(nextSchema);
        rule.valueField = ["sum", "max", "distinct"].includes(rule.aggregate) ? firstField(nextSchema) : undefined;
      }
      if (field === "aggregate" && ["sum", "max", "distinct"].includes(value) && !rule.valueField) rule.valueField = firstField(eventSchema);
      return { ...current, rule };
    });
  }

  async function save(event, draft = editing) {
    event?.preventDefault();
    if (saving) return;
    setEditorError("");
    setSaving(true);
    try {
      const path = draft.builtIn || draft.persisted ? `/api/admin/achievements/${draft.id}` : "/api/admin/achievements";
      const method = draft.builtIn || draft.persisted ? "PATCH" : "POST";
      await api(path, { method, body: JSON.stringify(draft) });
      setEditing(null);
      await reload(false);
      notifySuccess("Succès enregistré.");
    } catch (error) { setEditorError(error.message); } finally { setSaving(false); }
  }

  async function duplicate(row) {
    try {
      const copy = await api(`/api/admin/achievements/${row.id}/duplicate`, { method: "POST" });
      await reload(false);
      setGuided(false);
      setEditorError("");
      setEditing({ ...copy, persisted: true });
      notifySuccess("Copie créée en brouillon.");
    } catch (error) { reportError(error.message); }
  }

  async function remove(row) {
    try {
      await api(`/api/admin/achievements/${row.id}`, { method: "DELETE" });
      await reload(false);
      notifySuccess(row.builtIn ? "Succès intégré désactivé." : "Succès supprimé.");
    } catch (error) { reportError(error.message); }
  }

  return <>
    <section className="card admin-list achievement-admin-list" ref={pages.anchor}>
      <div className="admin-section-heading"><div><span className="eyebrow">Défis du casino</span><h2>Succès</h2><small>{rows.length} succès affiché(s) sur {achievements.length}</small></div><button type="button" onClick={() => { setEditorError(""); setGuided(true); setEditing(newAchievement(schemas)); }}><Plus size={17} /> Créer un succès</button></div>
      <div className="admin-filters"><label className="admin-search-field">Rechercher<span><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, identifiant, jeu ou groupe" /></span></label><label>État<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Tous</option><option value="enabled">Actifs</option><option value="disabled">Désactivés</option><option value="built-in">Intégrés</option><option value="custom">Personnalisés</option></select></label></div>
      <div className="achievement-admin-grid">{pages.rows.map((row) => <article key={row.id} className={row.enabled === false ? "disabled" : ""}>
        <div className="achievement-admin-summary"><span className="eyebrow">{row.group} · {row.builtIn ? "Intégré" : "Personnalisé"}</span><strong>{row.title}</strong><p>{row.description}</p><small>{describeAchievementRule(row, schemas, games, achievements)}</small></div>
        <div className="admin-row-actions"><button type="button" className="secondary" onClick={() => { setGuided(false); setEditorError(""); setEditing({ ...structuredClone(row), persisted: true }); }}>Modifier</button><button type="button" className="secondary icon-toggle" title="Dupliquer" onClick={() => duplicate(row)}><Copy size={16} /></button><ConfirmActionButton className="danger-button icon-toggle" title={row.builtIn ? "Désactiver" : "Supprimer"} dialogTitle={row.builtIn ? "Désactiver ce succès ?" : "Supprimer ce succès ?"} message={row.builtIn ? "Il disparaîtra du catalogue public, mais les déblocages existants seront conservés." : "Sa définition et ses progressions seront supprimées. Les déblocages historiques restent conservés."} confirmLabel={row.builtIn ? "Désactiver" : "Supprimer"} onConfirm={() => remove(row)}><Trash2 size={16} /></ConfirmActionButton></div>
      </article>)}</div>
      <Pagination {...pages} pageSizes={[12, 24, 48]} label="Pages des succès admin" />
    </section>

    {editing && guided && <AchievementWizard games={games} shop={shop} achievements={achievements} saving={saving} error={editorError} onSave={(draft) => save(null, draft)} onClose={() => setEditing(null)} onAdvanced={(draft) => { setEditing({ ...draft, id: "" }); setGuided(false); setEditorError(""); }} />}
    {editing && !guided && <ModalBackdrop className="modal-backdrop" onClick={() => !saving && setEditing(null)}><form className="modal admin-editor achievement-rule-editor" onSubmit={save} onClick={(event) => event.stopPropagation()}>
      <div className="modal-title-row"><div><span className="eyebrow">Éditeur de succès</span><h2>{editing.title || "Nouveau succès"}</h2><small>{editing.id || "L'identifiant sera créé à l'enregistrement"}</small></div><button type="button" className="secondary icon-toggle" onClick={() => setEditing(null)} aria-label="Fermer"><X size={18} /></button></div>
      <div className="achievement-editor-scroll">
        <div className="achievement-readable-rule"><strong>Condition d'obtention</strong><p>{describeAchievementRule(editing, schemas, games, achievements)}</p></div>
        {editorError && <p className="error" role="alert">{editorError}</p>}
        <section className="admin-form-section"><div className="admin-form-section-title"><BadgeCheck /><div><h3>Présentation</h3><p>Informations affichées aux joueurs et classement dans le catalogue.</p></div></div>
          {!editing.builtIn && !editing.persisted && <details><summary>Identifiant personnalisé (facultatif)</summary><label>Identifiant technique<input value={editing.id} onChange={(event) => update("id", event.target.value)} placeholder="Créé automatiquement" /></label></details>}
          <div className="admin-field-grid"><label>Nom<input required value={editing.title} onChange={(event) => update("title", event.target.value)} /></label><label>Groupe<input required value={editing.group} onChange={(event) => update("group", event.target.value)} /></label></div>
          <label>Description<textarea required value={editing.description} onChange={(event) => update("description", event.target.value)} /></label>
          <div className="admin-field-grid"><label>Type<select value={editing.type} onChange={(event) => update("type", event.target.value)}><option value="site">Site</option><option value="games">Jeux</option><option value="milestone">Milestone</option></select></label><label>Jeu<select value={editing.gameId ?? ""} onChange={(event) => update("gameId", event.target.value || null)}><option value="">Tous les jeux</option>{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select></label><label>Cible<input type="number" min="1" max="1000000000" value={editing.target} onChange={(event) => update("target", Number(event.target.value))} /></label></div>
          <div className="admin-choice-grid"><label className={editing.enabled !== false ? "selected" : ""}><input type="checkbox" checked={editing.enabled !== false} onChange={(event) => update("enabled", event.target.checked)} /><span>Publié</span></label><label className={editing.milestone ? "selected" : ""}><input type="checkbox" checked={editing.milestone} onChange={(event) => update("milestone", event.target.checked)} /><span>Milestone</span></label><label className={editing.secret ? "selected" : ""}><input type="checkbox" checked={editing.secret} onChange={(event) => update("secret", event.target.checked)} /><span>Secret</span></label></div>
        </section>
        <section className="admin-form-section"><div className="admin-form-section-title"><Braces /><div><h3>Méthode d'obtention</h3><p>La règle est validée côté serveur et ne peut accéder qu'aux champs proposés.</p></div></div>
          <div className="admin-field-grid"><label>Source<select aria-label="Source" value={editing.rule?.source ?? "event"} onChange={(event) => updateRule("source", event.target.value)}><option value="event">Événement temps réel</option><option value="metric">Métrique calculée</option></select></label>
          {editing.rule?.source === "metric" ? <label>Métrique<select value={editing.rule.metric} onChange={(event) => updateRule("metric", event.target.value)}>{schemas.metrics.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label> : <><label>Événement<select aria-label="Événement" value={editing.rule.event} onChange={(event) => updateRule("event", event.target.value)}>{schemas.events.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label><label>Portée<select value={editing.rule.scope} onChange={(event) => updateRule("scope", event.target.value)}>{Object.entries(scopeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></>}</div>
          {editing.rule?.source === "event" && <><div className="admin-field-grid"><label>Agrégat<select value={editing.rule.aggregate} onChange={(event) => updateRule("aggregate", event.target.value)}>{Object.entries(aggregateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{["sum", "max", "distinct"].includes(editing.rule.aggregate) && <label>Champ agrégé<select value={editing.rule.valueField ?? firstField(eventSchema)} onChange={(event) => updateRule("valueField", event.target.value)}>{eventSchema.fields.map((entry) => <option key={entry.field} value={entry.field}>{entry.label}</option>)}</select></label>}</div><div className="achievement-condition-heading"><strong>Conditions</strong><small>Les groupes peuvent être imbriqués sur quatre niveaux.</small></div><ConditionEditor node={editing.rule.condition} fields={conditionFields} onChange={(condition) => updateRule("condition", condition)} /></>}
        </section>
      </div>
      <footer className="admin-user-editor-footer"><small>Les changements sont appliqués aux prochains événements. Les succès déjà obtenus ne sont jamais retirés automatiquement.</small><div className="actions"><button type="submit" disabled={saving}><Save size={17} />{saving ? "Enregistrement…" : "Enregistrer"}</button><button type="button" className="secondary" onClick={() => setEditing(null)}>Annuler</button></div></footer>
    </form></ModalBackdrop>}
  </>;
}
