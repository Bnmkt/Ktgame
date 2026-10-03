import { useEffect, useRef } from "react";
import { createNotificationSound } from "../../utils/notification-sound.js";

export function useTurnSound(expected, sessionKey, turnKey = "") {
  const sound = useRef(null);
  const previouslyExpected = useRef(false);
  const previousTurn = useRef(turnKey);
  const pending = useRef(false);
  const isExpected = useRef(expected);
  isExpected.current = expected;
  const activeTurn = useRef(turnKey);
  activeTurn.current = turnKey;
  const attempt = () => {
    const cue = sound.current;
    if (!cue || !isExpected.current || !pending.current) return;
    const turn = activeTurn.current;
    const stillExpected = () => sound.current === cue && isExpected.current && activeTurn.current === turn;
    cue.play(stillExpected).then((played) => { if (stillExpected()) pending.current = !played; });
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
    window.addEventListener("focus", retry);
    const onVisibility = () => { if (document.visibilityState === "visible") retry(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
      window.removeEventListener("focus", retry);
      document.removeEventListener("visibilitychange", onVisibility);
      cue.close();
      sound.current = null;
    };
  }, [sessionKey]);
  useEffect(() => {
    const wasExpected = previouslyExpected.current;
    const wasTurn = previousTurn.current;
    previouslyExpected.current = expected;
    previousTurn.current = turnKey;
    if (!expected) pending.current = false;
    else if (!wasExpected || wasTurn !== turnKey) { pending.current = true; latestAttempt.current(); }
  }, [expected, sessionKey, turnKey]);
}
