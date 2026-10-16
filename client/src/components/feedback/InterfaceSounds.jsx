import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { acquireGameSounds, gameSoundsEnabled, playGameSound, setGameSoundsEnabled } from "../../utils/game-sounds.js";

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
  const [enabled, setEnabled] = useState(gameSoundsEnabled);
  useEffect(() => {
    const update = () => setEnabled(gameSoundsEnabled());
    window.addEventListener("ktga-sounds-updated", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("ktga-sounds-updated", update); window.removeEventListener("storage", update); };
  }, []);
  const label = t(enabled ? "Couper les effets sonores" : "Activer les effets sonores");
  return <button type="button" className="secondary icon-toggle game-sound-control" title={label} aria-label={label} aria-pressed={enabled} onClick={() => setGameSoundsEnabled(!enabled)}>{enabled ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button>;
}
