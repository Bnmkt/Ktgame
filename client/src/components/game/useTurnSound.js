import { useEffect, useRef } from "react";
import { createNotificationSound } from "../../utils/notification-sound.js";

export function useTurnSound(expected, sessionKey) {
  const sound = useRef(null);
  const previouslyExpected = useRef(false);
  const pending = useRef(false);
  const isExpected = useRef(expected);
  isExpected.current = expected;
  const attempt = () => {
    const cue = sound.current;
    if (!cue || !isExpected.current || !pending.current) return;
    cue.play().then((played) => { if (sound.current === cue && isExpected.current) pending.current = !played; });
  };
  const latestAttempt = useRef(attempt);
  latestAttempt.current = attempt;
  useEffect(() => {
    previouslyExpected.current = false;
    pending.current = false;
    const cue = createNotificationSound({ tones: [[659.25, 0, .15, "sine"], [783.99, .11, .12, "triangle"]] });
    sound.current = cue;
    const retry = () => latestAttempt.current();
    window.addEventListener("pointerdown", retry);
    window.addEventListener("keydown", retry);
    return () => {
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
      cue.close();
      sound.current = null;
    };
  }, [sessionKey]);
  useEffect(() => {
    const wasExpected = previouslyExpected.current;
    previouslyExpected.current = expected;
    if (!expected) pending.current = false;
    else if (!wasExpected) { pending.current = true; latestAttempt.current(); }
  }, [expected, sessionKey]);
}
