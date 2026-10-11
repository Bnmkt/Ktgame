import { useLocale } from "../../locales/LocaleProvider.jsx";
import { Plus, Trash2 } from "lucide-react";

const emptyChallenge = () => ({ question: "", options: [{ id: "1", text: "" }, { id: "2", text: "" }], answerId: "1", explanation: "" });

export function GuideInteractionEditor({ entry, onChange }) {
  const { t: localeText } = useLocale();
  const challenge = entry.challenge;
  const change = (fields) => onChange({ challenge: { ...challenge, ...fields } });
  return <section className="player-help-interaction-editor">
    <header><h3>{localeText("Une petite mise en situation")}</h3><label><input type="checkbox" checked={Boolean(challenge)} onChange={(event) => onChange({ challenge: event.target.checked ? emptyChallenge() : null })} />{localeText("Question facultative")}</label></header>
    {challenge && <><label>{localeText("Question aux joueurs")}<input value={challenge.question} maxLength={240} onChange={(event) => change({ question: event.target.value })} /></label><fieldset className="player-help-choice-editor"><legend>{localeText("Réponses proposées")}</legend>{challenge.options.map((option, index) => <div key={option.id}><label className="player-help-correct-choice"><input type="radio" name={`help-answer-${entry.id}`} checked={challenge.answerId === option.id} onChange={() => change({ answerId: option.id })} aria-label={localeText("Définir la réponse {value0} comme correcte", { value0: index + 1 })} /></label><label><span className="sr-only">{localeText("Réponse") + " "}{index + 1}</span><input value={option.text} maxLength={160} onChange={(event) => change({ options: challenge.options.map((row) => row.id === option.id ? { ...row, text: event.target.value } : row) })} /></label><button type="button" className="secondary icon-toggle" title={localeText("Retirer la réponse {value0}", { value0: index + 1 })} aria-label={localeText("Retirer la réponse {value0}", { value0: index + 1 })} disabled={challenge.options.length <= 2} onClick={() => { const options = challenge.options.filter((row) => row.id !== option.id); change({ options, answerId: challenge.answerId === option.id ? options[0].id : challenge.answerId }); }}><Trash2 size={16} /></button></div>)}</fieldset><button type="button" className="secondary" disabled={challenge.options.length >= 4} onClick={() => change({ options: [...challenge.options, { id: crypto.randomUUID(), text: "" }] })}><Plus size={16} />{localeText("Ajouter une réponse")}</button><label>{localeText("Explication après le choix")}<textarea aria-label={localeText("Explication après le choix")} className="player-help-short-input" value={challenge.explanation} maxLength={800} onChange={(event) => change({ explanation: event.target.value })} /></label></>}
  </section>;
}
