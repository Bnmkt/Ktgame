import { useCallback, useEffect, useRef, useState } from "react";

export function usePresidentAutoPass({ enabled, turnKey, onPass }) {
  const [deadline, setDeadline] = useState(null);
  const timer = useRef(null);
  const latest = useRef({ enabled, turnKey, onPass });
  latest.current = { enabled, turnKey, onPass };
  const cancel = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = null;
    setDeadline(null);
  }, []);
  useEffect(() => {
    if (!enabled) { cancel(); return undefined; }
    setDeadline(Date.now() + 3000);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setDeadline(null);
      if (latest.current.enabled && latest.current.turnKey === turnKey) latest.current.onPass();
    }, 3000);
    return () => window.clearTimeout(timer.current);
  }, [cancel, enabled, turnKey]);
  return { deadline, cancel };
}
