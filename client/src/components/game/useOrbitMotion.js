import { useEffect, useLayoutEffect, useRef } from "react";

// One CSS variable drives the circular transforms. No layout reads or React
// renders are needed on animation frames, including when all 15 games are shown.
export function useOrbitMotion(surface, target, onRest) {
  const state = useRef({ position: target, velocity: 0, frame: 0 });
  const settled = useRef(onRest); settled.current = onRest;
  const reduced = useRef(false);
  const paint = position => surface.current?.style.setProperty("--orbit-turn", `${position}deg`);
  useLayoutEffect(() => { paint(state.current.position); }, [surface]);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { reduced.current = motion.matches; };
    sync(); motion.addEventListener("change", sync);
    return () => { motion.removeEventListener("change", sync); cancelAnimationFrame(state.current.frame); };
  }, []);
  useEffect(() => {
    const current = state.current;
    cancelAnimationFrame(current.frame);
    let previous = performance.now();
    const finish = () => { current.position = target; current.velocity = 0; paint(target); settled.current?.(); };
    const step = now => {
      if (reduced.current || document.hidden) { finish(); return; }
      const dt = Math.min(.032, Math.max(.001, (now - previous) / 1000)); previous = now;
      current.velocity += ((target - current.position) * 100 - current.velocity * 19) * dt;
      current.velocity = Math.max(-850, Math.min(850, current.velocity));
      current.position += current.velocity * dt; paint(current.position);
      if (Math.abs(target - current.position) < .04 && Math.abs(current.velocity) < .1) finish();
      else current.frame = requestAnimationFrame(step);
    };
    if (reduced.current || Math.abs(target - current.position) < .01) finish();
    else current.frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(current.frame);
  }, [target, surface]);
  return {
    position: () => state.current.position,
    scrub: position => { cancelAnimationFrame(state.current.frame); state.current.position = position; state.current.velocity = 0; paint(position); }
  };
}
