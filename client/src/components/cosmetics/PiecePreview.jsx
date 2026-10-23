import { useEffect, useRef } from "react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { Die, PlayingCard } from "../game/GamePieces.jsx";
import "./piece-preview.css";

export function PiecePreview({ type, skin = "default" }) {
  const { t } = useLocale();
  const turn = useRef(null);
  useEffect(() => {
    if (type !== "cardSkins" || !turn.current?.animate) return;
    const node = turn.current;
    const animation = node.animate([
      { transform: "rotateX(7deg) rotateY(0deg)" },
      { transform: "rotateX(7deg) rotateY(360deg)" }
    ], { duration: 12000, iterations: Infinity, easing: "linear" });
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const sync = () => {
      const active = visible && !document.hidden && !motion.matches;
      if (active) animation.play();
      else animation.pause();
      if (motion.matches) animation.currentTime = 0;
      node.dataset.pieceMotion = active ? "rotating" : "paused";
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(node);
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    sync();
    return () => { animation.cancel(); observer.disconnect(); document.removeEventListener("visibilitychange", sync); motion.removeEventListener("change", sync); };
  }, [type]);
  return <div className="piece-preview" data-piece-preview={type} role="img" aria-label={t(type === "cardSkins" ? "Cartes" : "Dés")}>
    {type === "diceSkins" ? <Die value={5} skin={skin} animate={false} showcase/> : <div className="piece-preview-card-turn" ref={turn} aria-hidden="true">
      <div className="piece-preview-card-face"><PlayingCard card={{ rank: "A", suit: "H" }} skin={skin} animate={false}/></div>
      <div className="piece-preview-card-face piece-preview-card-reverse"><PlayingCard hidden skin={skin} animate={false}/></div>
    </div>}
  </div>;
}
