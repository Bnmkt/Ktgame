import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { API_URL } from "../../api.js";
import { defaultMidnightCardDesign, defaultMidnightCharacters, midnightFonts, normalizeMidnightArtwork } from "../../features/games/midnightDice/appearance.js";
import { midnightContractTiers, midnightExamples, midnightRuleDescription } from "../../features/games/midnightDice/contracts.js";
import { Die } from "./GamePieces.jsx";
import "./midnight-contract-card.css";

export const midnightImageSource = source => source?.startsWith("/api/") ? `${API_URL}${source}` : source;
function FittedCopy({ text, zone, padding, font }) {
  const host = useRef(null), copy = useRef(null);
  useLayoutEffect(() => {
    const node = host.current, content = copy.current;
    function fit() {
      const width = node.closest(".midnight-card").clientWidth;
      if (!width || !node.clientHeight) return;
      const fits = () => content.scrollHeight <= node.clientHeight + 1 && content.scrollWidth <= node.clientWidth + 1;
      let lower = width * zone.minFontSize / 100, upper = width * zone.fontSize / 100;
      for (let i = 0; i < 9; i++) { const size = (lower + upper) / 2; content.style.fontSize = `${size}px`; if (fits()) lower = size; else upper = size; }
      content.style.fontSize = `${lower}px`;
      node.dataset.midnightCopyFits = fits() ? "true" : "false";
    }
    const observer = new ResizeObserver(fit); observer.observe(node); fit();
    let active = true; document.fonts?.ready.then(() => { if (active) fit(); });
    return () => { active = false; observer.disconnect(); };
  }, [text, JSON.stringify(zone), padding, font]);
  return <div ref={host} className="midnight-card-copy" style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%`, color: zone.color, fontFamily: font, padding: `${padding * .1}cqw` }}><span ref={copy}>{text}</span></div>;
}

export function MidnightContractCard({ definition, design = defaultMidnightCardDesign, hidden = false, interactiveArtwork, onArtworkChange, className = "" }) {
  const { t } = useLocale();
  const cardRef = useRef(null), gesture = useRef(null);
  const [failed, setFailed] = useState("");
  const appearance = { ...defaultMidnightCardDesign, ...design, zones: { ...defaultMidnightCardDesign.zones, ...design?.zones } };
  const image = hidden ? appearance.backImage : appearance.frontImage;
  const source = image && failed !== image ? image : hidden ? defaultMidnightCardDesign.backImage : defaultMidnightCardDesign.frontImage;
  const tier = midnightContractTiers[definition?.tier] ?? midnightContractTiers.bronze;
  let artwork;
  try { artwork = normalizeMidnightArtwork(definition?.artwork ?? { image: defaultMidnightCharacters[definition?.id] ?? defaultMidnightCharacters.balance }); }
  catch { artwork = normalizeMidnightArtwork(); }
  const examples = useMemo(() => {
    if (!definition || hidden) return [];
    try { return midnightExamples(definition); } catch { return []; }
  }, [definition, hidden]);
  function begin(event, resize) {
    if (!interactiveArtwork || !onArtworkChange || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, artwork, resize, width: cardRef.current.clientWidth, height: cardRef.current.clientHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event) {
    const initial = gesture.current;
    if (!initial || initial.pointer !== event.pointerId) return;
    event.stopPropagation();
    const dx = (event.clientX - initial.x) / initial.width * 100, dy = (event.clientY - initial.y) / initial.height * 100;
    const rounded = value => Math.round(value * 100) / 100;
    onArtworkChange(initial.resize ? { ...initial.artwork, scale: rounded(Math.max(.15, Math.min(4, initial.artwork.scale + dx / 32))) } : { ...initial.artwork, x: rounded(Math.max(-100, Math.min(100, initial.artwork.x + dx))), y: rounded(Math.max(-100, Math.min(100, initial.artwork.y + dy))) });
  }
  const end = () => { gesture.current = null; };
  return <div ref={cardRef} className={`midnight-card ${hidden ? "midnight-card-covered" : ""} ${className}`} role={hidden ? "img" : "group"} aria-label={hidden ? t("Mandat secret") : `${definition?.label ?? t("Mandat")} · ${t(tier.label)} · +${tier.bonus}`} data-midnight-contract={hidden ? undefined : definition?.id}>
    <img className="midnight-card-template" src={midnightImageSource(source)} alt="" draggable={false} onError={() => setFailed(image)}/>
    {!hidden && definition && <>
      {[["title", t(definition.label)], ["tier", t(tier.label)], ["bonus", `${tier.bonus} ${t("points")}`], ["condition", definition.hint || midnightRuleDescription(definition.rule)]].map(([id, text]) => <FittedCopy key={id} text={text} zone={appearance.zones[id]} padding={appearance.padding} font={midnightFonts[id === "title" ? appearance.headingFont : appearance.bodyFont]}/>)}
      {appearance.sectionLabels && <><span className="midnight-card-section-label" style={{ left: `${appearance.zones.condition.x + appearance.zones.condition.width / 2}%`, top: `${appearance.zones.condition.y - 7}%` }}>✦ {t("Condition")} ✦</span><span className="midnight-card-section-label" style={{ left: `${appearance.zones.examples.x + appearance.zones.examples.width / 2}%`, top: `${appearance.zones.examples.y - 6}%` }}>✦ {t("Exemples")} ✦</span></>}
      <div className="midnight-card-examples" style={{ left: `${appearance.zones.examples.x}%`, top: `${appearance.zones.examples.y}%`, width: `${appearance.zones.examples.width}%`, height: `${appearance.zones.examples.height}%`, gap: `${appearance.exampleGap}%`, color: appearance.zones.examples.color, fontFamily: midnightFonts[appearance.bodyFont] }}>
        {examples.map((dice, index) => <div key={index}><div>{dice.map((value, i) => <Die value={value} inline animate={false} key={i}/>)}</div><small style={{ color: appearance.zones.examples.color }}>{dice.join(" · ")}</small></div>)}
      </div>
      {artwork.image && <div className={`midnight-card-character ${interactiveArtwork ? "midnight-character-editable" : ""}`} style={{ left: `${artwork.x}%`, top: `${artwork.y}%`, width: `${32 * artwork.scale}%`, height: `${54 * artwork.scale}%`, zIndex: artwork.layer }} onPointerDown={event => begin(event, false)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
        <img src={midnightImageSource(artwork.image)} alt="" draggable={false}/>{interactiveArtwork && <button type="button" className="midnight-character-resize" aria-label={t("Redimensionner le personnage")} onPointerDown={event => begin(event, true)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>↘</button>}
      </div>}
    </>}
  </div>;
}
