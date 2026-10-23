import { useEffect, useRef } from "react";
import "./dice-solid.css";

export function DieSolid({ value, animate, skin, faceStyle, rollKey, showcase }) {
  const host = useRef(null);
  const view = useRef(null);
  const latest = useRef({ value, animate, skin, faceStyle, rollKey, showcase });
  latest.current = { value, animate, skin, faceStyle, rollKey, showcase };
  useEffect(() => {
    let disposed = false;
    import("./dice-solid-renderer.js").then(({ mountDie }) => {
      if (!disposed) view.current = mountDie(host.current, latest.current);
    }).catch(() => { /* Keep the readable CSS die when 3D is unavailable. */ });
    return () => { disposed = true; view.current?.destroy(); view.current = null; };
  }, []);
  useEffect(() => { view.current?.update(latest.current); }, [value, skin, faceStyle, rollKey, showcase]);
  return <span ref={host} className="dice-solid-scene" aria-hidden="true" />;
}
