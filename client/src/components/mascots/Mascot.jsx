import { useEffect, useRef, useState } from "react";
import { mascotAsset, mascotCycles } from "../../features/mascots/catalog.js";
import "./mascot.css";
export { gameMascot } from "../../features/mascots/catalog.js";

export function Mascot({ character = "lucky", pose = "welcome", className = "", size = "small", priority = false, cycle = "", flip = false, tilt = 0, docked = false }) {
  const base = import.meta.env.BASE_URL;
  const root = useRef(null);
  const [active, setActive] = useState(0);
  const frames = Object.hasOwn(mascotCycles, cycle) ? mascotCycles[cycle] : null;
  useEffect(() => {
    setActive(0);
    if (!frames || frames.length < 2) return undefined;
    const element = root.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer;
    let visible = false;
    const schedule = () => {
      clearTimeout(timer);
      if (!visible || document.hidden || motion.matches) return;
      timer = setTimeout(() => {
        if (!visible || document.hidden || motion.matches) return;
        const images = [...element.querySelectorAll("img")];
        setActive((current) => {
          for (let offset = 1; offset < frames.length; offset += 1) {
            const next = (current + offset) % frames.length;
            if (images[next]?.complete && images[next].naturalWidth) return next;
          }
          return current;
        });
        schedule();
      }, 18000 + Math.random() * 10000);
    };
    const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      schedule();
    }) : null;
    if (observer) observer.observe(element);
    else { visible = true; schedule(); }
    document.addEventListener("visibilitychange", schedule);
    motion.addEventListener("change", schedule);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", schedule);
      motion.removeEventListener("change", schedule);
    };
  }, [frames]);
  return <span ref={root} className={`ktga-mascot mascot-size-${size} ${frames ? "mascot-cycling" : ""} ${docked ? "mascot-docked" : ""} ${className}`} aria-hidden="true">
    {(frames ?? [{ character, pose, flip, tilt }]).map((frame, index) => <img key={`${frame.character}:${frame.pose}`} className={index === active || !frames ? "mascot-visible" : ""} style={{ "--mascot-facing": frame.flip ? -1 : 1, "--mascot-tilt": `${Math.max(-12, Math.min(12, Number(frame.tilt) || 0))}deg` }} src={`${base}${mascotAsset(frame.character, frame.pose)}`} srcSet={`${base}${mascotAsset(frame.character, frame.pose)} 360w, ${base}${mascotAsset(frame.character, frame.pose, 720)} 720w`} sizes={size === "large" ? "(max-width: 760px) 100px, 300px" : "(max-width: 600px) 64px, 160px"} alt="" width={360} height={360} loading={priority && index === 0 ? "eager" : "lazy"} fetchPriority={priority && index === 0 ? "high" : "auto"} decoding="async" draggable={false}/>)}
  </span>;
}
