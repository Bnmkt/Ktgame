import { useRef } from "react";
import { createOverlayClickGuard } from "./overlay-click.js";

export function ModalBackdrop({ children, onClick, ...props }) {
  const guard = useRef(null);
  if (!guard.current) guard.current = createOverlayClickGuard();
  return <div {...props} onPointerDownCapture={(event) => guard.current.down(event)} onPointerMoveCapture={(event) => guard.current.move(event)} onPointerUpCapture={(event) => guard.current.up(event)} onPointerCancelCapture={() => guard.current.cancel()} onClick={(event) => {
    event.stopPropagation();
    if (guard.current.click(event)) onClick?.(event);
  }}>{children}</div>;
}
