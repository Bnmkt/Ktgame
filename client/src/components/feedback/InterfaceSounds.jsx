import { useEffect, useId, useState } from "react";
import { AudioLines, Music2, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { acquireGameSounds, playGameSound } from "../../utils/game-sounds.js";
import { audioDefaults, audioSettings, updateAudioSettings } from "../../utils/audio-settings.js";
import { Dialog } from "../common/Dialog.jsx";
import "./audio-mixer.css";

export function useInterfaceSounds() {
  useEffect(() => {
    const release = acquireGameSounds();
    const click = event => {
      const target = event.target.closest?.('button, a[href], [role="button"], input[type="submit"]');
      if (target && !target.disabled && target.getAttribute("aria-disabled") !== "true") playGameSound("click");
    };
    document.addEventListener("click", click);
    return () => { document.removeEventListener("click", click); release(); };
  }, []);
}
export function SoundControl() {
  const { t } = useLocale();
  const controlId = useId();
  const [mix, setMix] = useState(audioSettings), [open, setOpen] = useState(false);
  useEffect(() => {
    const update = () => setMix(audioSettings());
    window.addEventListener("ktga-sounds-updated", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("ktga-sounds-updated", update); window.removeEventListener("storage", update); };
  }, []);
  const muted = mix.muted || mix.master === 0;
  return <><button type="button" className="secondary icon-toggle game-sound-control" title={t("Réglages audio")} aria-label={t("Réglages audio")} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>{muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</button>
    {open && <Dialog title={t("Audio")} className="sound-mixer-modal" layerClassName="sound-mixer-layer" onClose={() => setOpen(false)}>
      <div className="sound-mixer-channels">{[["master", "audio::Maître", Volume2], ["ambience", "Ambiance", AudioLines], ["music", "Musique", Music2]].map(([key, label, Icon]) => <label className="sound-mixer-channel" key={key} htmlFor={`${controlId}-${key}`}><span><Icon size={19}/><strong>{t(label)}</strong><output>{Math.round(mix[key] * 100)} %</output></span><input id={`${controlId}-${key}`} type="range" min="0" max="100" step="1" value={Math.round(mix[key] * 100)} onChange={event => updateAudioSettings({ [key]: Number(event.target.value) / 100 })}/></label>)}</div>
      <div className="sound-mixer-footer"><button type="button" className="secondary" aria-pressed={muted} onClick={() => updateAudioSettings({ muted: !muted, ...(muted && !mix.master ? { master: audioDefaults.master } : {}) })}>{muted ? <Volume2 size={18}/> : <VolumeX size={18}/>} {t(muted ? "Réactiver le son" : "Tout couper")}</button><button type="button" className="secondary icon-toggle" title={t("Rétablir les volumes")} aria-label={t("Rétablir les volumes")} onClick={() => updateAudioSettings(audioDefaults)}><RotateCcw size={18}/></button></div>
    </Dialog>}
  </>;
}
