import { useEffect, useState } from "react";
import { Check, ChevronRight, Gift, RotateCcw, SkipForward } from "lucide-react";
import { Dialog } from "../common/Dialog.jsx";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { CosmeticItemVisual, cosmeticCssRules, shopTypeLabel } from "./Cosmetics.jsx";
import "../../features/games/ranked-completion.css";
import "./cosmetic-reward-reveal.css";

export function CosmeticRewardReveal({ pack, user, onClose }) {
  const { t } = useLocale();
  const [index, setIndex] = useState(0), [phase, setPhase] = useState("intro");
  const [reduce, setReduce] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [visible, setVisible] = useState(() => !document.hidden);
  const item = pack.items[index];
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduce(media.matches), visibility = () => setVisible(!document.hidden);
    media.addEventListener("change", motion); document.addEventListener("visibilitychange", visibility);
    return () => { media.removeEventListener("change", motion); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    setPhase(reduce ? "settled" : "intro");
    if (!item || reduce || !visible) return;
    const burst = setTimeout(() => setPhase("transform"), 180);
    const settle = setTimeout(() => setPhase("settled"), 1350);
    const next = setTimeout(() => setIndex((value) => value + 1), 3700);
    return () => { clearTimeout(burst); clearTimeout(settle); clearTimeout(next); };
  }, [index, reduce, visible, item]);
  return <Dialog title={t(item ? "Nouvel objet débloqué !" : "Ta collection est prête !")} className="cosmetic-receipt-dialog" onClose={onClose}>
    <style>{cosmeticCssRules(pack.items)}</style>
    <header className="cosmetic-receipt-heading"><Gift size={23}/><strong>{pack.name}</strong><span>{item ? `${index + 1} / ${pack.items.length}` : t("Pack complet")}</span></header>
    {item ? <>
      <div key={item.id} className={`cosmetic-receipt-stage recap-promotion recap-${phase}`} style={{ "--recap-accent":"#e8c777", "--recap-glow":"#e8c77766" }}>
        <div className="ranked-recap-rays" aria-hidden="true">{Array.from({ length:18 }, (_, n) => <i key={n} style={{ "--ray":`${n * 20}deg`, "--delay":`${n % 3 * 60}ms` }}/>)}</div>
        <div className="ranked-recap-emblem"><CosmeticItemVisual user={user} item={item}/></div>
      </div>
      <div className="cosmetic-receipt-caption" aria-live="polite"><span className="eyebrow">{t(shopTypeLabel(item.type))}</span><h2>{item.name}</h2><span><Check size={15}/>{t("Ajouté à ton inventaire")}</span></div>
      <footer className="cosmetic-receipt-actions"><button type="button" className="secondary" onClick={() => setIndex(pack.items.length)}><SkipForward size={17}/>{t("Tout afficher")}</button><button type="button" onClick={() => setIndex((value) => value + 1)}>{t("Suivant")}<ChevronRight size={18}/></button></footer>
    </> : <>
      <div className="cosmetic-receipt-grid">{pack.items.map((entry, n) => <button type="button" className="secondary" key={entry.id} onClick={() => setIndex(n)} aria-label={t("Revoir {value0}", { value0:entry.name })}><CosmeticItemVisual user={user} item={entry} compact/><strong>{entry.name}</strong><small>{t(shopTypeLabel(entry.type))}</small></button>)}</div>
      <p>{t("Les futurs objets de cette collection seront ajoutés gratuitement à ton inventaire.")}</p>
      <footer className="cosmetic-receipt-actions"><button type="button" className="secondary" onClick={() => setIndex(0)}><RotateCcw size={17}/>{t("Revoir l’animation")}</button><button type="button" onClick={onClose}><Check size={18}/>{t("Terminer")}</button></footer>
    </>}
  </Dialog>;
}
