import { useLocale } from "../../locales/LocaleProvider.jsx";
import { useRef, useState } from "react";
import { Bell, Check, X } from "lucide-react";
import { Dialog } from "../common/Dialog.jsx";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";
import { CompactNumber } from "../../utils/presentation.jsx";
import { pokerAllInDecision } from "../../features/games/poker-notice.js";
import "./poker-decision.css";

export function PokerAllInNotice({ state, userId, expected, onAction }) {
  const { t: localeText } = useLocale();
  const [dismissed, setDismissed] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const decision = pokerAllInDecision(state, userId, expected);
  if (!decision) return null;
  const choose = async (type) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try { const result = await onAction({ type }); if (result) setDismissed(decision.key); }
    finally { pending.current = false; setBusy(false); }
  };
  return <>
    <button className="secondary poker-decision-notice" onClick={() => setDismissed("")}><Bell size={17} />{localeText("Tapis adverse ·") + " "}<CompactNumber value={decision.amount} />{" " + localeText("à suivre")}</button>
    {dismissed !== decision.key && <Dialog title={localeText("Un adversaire fait tapis")} className="poker-decision-dialog" onClose={() => setDismissed(decision.key)} dismissible={!busy}>
      <div className="poker-decision-opponents">{decision.opponents.map((player) => <DisplayName key={player.id} user={player} />)}</div>
      <p>{localeText("À toi de décider : suivre pour") + " "}<strong><CompactNumber value={decision.amount} />{" " + localeText("jetons")}</strong>{" " + localeText("ou te coucher.")}</p>
      {decision.ownAllIn && <p className="action-hint">{localeText("Suivre engage tout ton tapis restant.")}</p>}
      <div className="actions"><button disabled={busy} onClick={() => choose("call")}><Check size={17} />{localeText("Suivre") + " "}<CompactNumber value={decision.amount} /></button><button className="danger-button" disabled={busy} onClick={() => choose("fold")}><X size={17} />{localeText("Se coucher")}</button><button className="secondary" disabled={busy} onClick={() => setDismissed(decision.key)}>{localeText("Voir la table")}</button></div>
    </Dialog>}
  </>;
}
