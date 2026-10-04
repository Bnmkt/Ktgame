import { useId, useState } from "react";
import { CheckCircle2, Lightbulb, RotateCcw } from "lucide-react";

export function GuideChallenge({ challenge }) {
  const group = useId();
  const [answer, setAnswer] = useState("");
  const correct = answer === challenge.answerId;
  return <fieldset className="player-help-scenario">
    <legend><Lightbulb size={18} />À ton avis ?<small>Facultatif</small></legend>
    <p>{challenge.question}</p>
    <div className="player-help-scenario-options">{challenge.options.map((option) => <label key={option.id} className={answer === option.id ? correct ? "is-correct" : "is-chosen" : ""}><input type="radio" name={group} value={option.id} checked={answer === option.id} onChange={() => setAnswer(option.id)} /><span>{option.text}</span>{answer === option.id && correct && <CheckCircle2 size={18} aria-hidden="true" />}</label>)}</div>
    {answer && <div className={`player-help-scenario-feedback ${correct ? "is-correct" : ""}`} role="status"><strong>{correct ? "Bien vu !" : "Pas dans ce cas."}</strong><p>{challenge.explanation}</p><button type="button" className="secondary" title="Réessayer la question" aria-label="Réessayer la question" data-request-feedback="state" onClick={() => setAnswer("")}><RotateCcw size={16} /></button></div>}
  </fieldset>;
}
