import { useRef, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { Dialog } from "./Dialog.jsx";

export function ConfirmDialog({ title, message, confirmLabel = "Confirmer", danger = false, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function confirm() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err.message || "L'opération a échoué. Réessaie.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return <Dialog title={title} onClose={onClose} dismissible={!busy} className="action-confirm-modal" layerClassName="action-confirm-layer">
    <p className="action-confirm-message">{danger && <AlertTriangle size={20} />}{message}</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="action-confirm-buttons">
      <button type="button" className="secondary" disabled={busy} onClick={onClose}><X size={17} /> Annuler</button>
      <button type="button" className={danger ? "danger-button" : ""} disabled={busy} onClick={confirm}><Check size={17} />{busy ? "Traitement…" : confirmLabel}</button>
    </div>
  </Dialog>;
}

export function ConfirmActionButton({ dialogTitle, message, confirmLabel, danger = false, onConfirm, children, ...buttonProps }) {
  const [open, setOpen] = useState(false);
  return <>
    <button {...buttonProps} type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>{children}</button>
    {open && <ConfirmDialog title={dialogTitle} message={message} confirmLabel={confirmLabel} danger={danger} onConfirm={onConfirm} onClose={() => setOpen(false)} />}
  </>;
}
