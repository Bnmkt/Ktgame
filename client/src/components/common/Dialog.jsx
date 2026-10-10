import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ModalBackdrop } from "./ModalBackdrop.jsx";

export function Dialog({ title, onClose, children, className = "", layerClassName = "", dismissible = true, hideTitle = false }) {
  const titleId = useId();
  const panel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  function onKeyDown(event) {
    if (event.key === "Escape" && dismissible) { event.stopPropagation(); onClose(); }
    if (event.key !== "Tab") return;
    const targets = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter((element) => element.getClientRects().length);
    const first = targets[0];
    const last = targets.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
  }
  return createPortal(<ModalBackdrop className={`modal-backdrop casino-dialog-layer ${layerClassName}`} onClick={() => { if (dismissible) onClose(); }}>
    <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`modal casino-dialog ${className}`} onKeyDown={onKeyDown} onClick={(event) => event.stopPropagation()}>
      {hideTitle ? <><h2 id={titleId} className="sr-only">{title}</h2>{dismissible && <button type="button" className="secondary icon-toggle dialog-corner-close" onClick={onClose} title="Fermer" aria-label="Fermer"><X size={18}/></button>}</> : <div className="modal-title-row"><h2 id={titleId}>{title}</h2><button type="button" className="secondary icon-toggle" disabled={!dismissible} onClick={onClose} title="Fermer" aria-label="Fermer"><X size={18} /></button></div>}
      {children}
    </section>
  </ModalBackdrop>, document.fullscreenElement ?? document.body);
}
