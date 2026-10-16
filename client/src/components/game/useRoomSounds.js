import { useEffect, useMemo, useRef } from "react";
import { playGameSound } from "../../utils/game-sounds.js";
import { roomSoundEvent, roomSoundSnapshot } from "./room-sound-events.js";

export function useRoomSounds(room, surface, active = true) {
  const previous = useRef(null);
  const key = useRef(room?.code);
  const visible = () => active && (!surface || Boolean(surface.current?.getClientRects().length));
  useEffect(() => {
    if (!room) return;
    if (key.current !== room.code) { key.current = room.code; previous.current = null; }
    const cue = roomSoundEvent(previous.current, room);
    previous.current = roomSoundSnapshot(room);
    if (cue && visible()) playGameSound(cue);
  }, [room, active]);
  const turn = room?.ranked?.turn;
  const offset = useMemo(() => turn?.serverTime ? turn.serverTime - Date.now() : 0, [turn?.serverTime, turn?.deadline]);
  const deadline = !active ? null : room?.pacing?.endsAt ?? (room?.state?.finished ? null : room?.state?.nextHandAt ??
    (turn?.deadline ? turn.deadline - offset : room?.state?.turnDeadline ?? room?.state?.resolutionEndsAt));
  const latest = useRef(visible); latest.current = visible;
  useEffect(() => {
    const remaining = Number(deadline) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 86400000) return;
    const timers = [];
    const play = kind => { if (latest.current()) playGameSound(kind); };
    if (remaining > 5000) timers.push(setTimeout(() => play("warning"), remaining - 5000));
    timers.push(setTimeout(() => play("limit"), remaining));
    return () => timers.forEach(clearTimeout);
  }, [deadline]);
}
