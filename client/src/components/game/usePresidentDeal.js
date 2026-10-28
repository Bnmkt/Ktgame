import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { presidentDealSequence } from "../../features/games/president.js";
import { playGameSound } from "../../utils/game-sounds.js";

// An optional visual timeline. It never sends actions or holds server updates.
export function usePresidentDeal(root, state, dealKey) {
  const cancel = useRef(() => {}), speed = useRef(1), activeFlights = useRef(new Set());
  const [dealing, setDealing] = useState(false);
  const stateRef = useRef(state); stateRef.current = state;
  const initialVersion = useRef("");
  const version = `${state.logs?.length}:${state.currentPlayerIndex}:${state.finished}:${Object.values(state.hands).map((cards) => cards.length).join(",")}`;
  useLayoutEffect(() => {
    if (!dealKey || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const seenKey = `ktga-president-dealt:${dealKey}`;
    try { if (sessionStorage.getItem(seenKey)) return; sessionStorage.setItem(seenKey, "1"); } catch { /* Still safe for this mount. */ }
    const surface = root.current, snapshot = stateRef.current;
    if (!surface || snapshot.finished || snapshot.logs?.length) return;
    const sequence = presidentDealSequence(snapshot);
    const slots = [...surface.querySelectorAll("[data-president-deal-slot]")];
    const flights = new Set();
    let timer, frame, stopped = false, position = 0;
    initialVersion.current = `${snapshot.logs?.length}:${snapshot.currentPlayerIndex}:${snapshot.finished}:${Object.values(snapshot.hands).map((cards) => cards.length).join(",")}`;
    speed.current = 1;
    setDealing(true);
    for (const slot of slots) slot.style.visibility = "hidden";
    const finish = () => {
      if (stopped) return;
      stopped = true; clearTimeout(timer); cancelAnimationFrame(frame);
      for (const { animation, node } of flights) { animation.cancel(); node.remove(); }
      flights.clear();
      for (const slot of slots) slot.style.visibility = "";
      setDealing(false);
    };
    cancel.current = finish;
    const launch = () => {
      if (stopped) return;
      if (position >= sequence.length) { if (!flights.size) finish(); return; }
      const { playerId, index } = sequence[position++];
      const target = slots.find((slot) => slot.dataset.presidentDealSlot === `${playerId}:${index}`);
      const source = surface.querySelector(".president-deal-origin .playing-card");
      if (!target || !source) { finish(); return; }
      const destination = target.getBoundingClientRect(), origin = source.getBoundingClientRect();
      const node = document.createElement("div"), card = source.cloneNode(true);
      card.className = target.querySelector(".playing-card").className;
      // The flight always uses a covered piece, including the local player's cards.
      card.classList.remove("flip-card", "deal-card", "red-suit"); card.classList.add("card-back");
      card.removeAttribute("data-card-face"); card.setAttribute("data-card-covered", "");
      node.className = "president-flight"; node.setAttribute("aria-hidden", "true");
      node.dataset.presidentFlight = playerId;
      Object.assign(node.style, { left: `${destination.x}px`, top: `${destination.y}px`, width: `${destination.width}px`, height: `${destination.height}px` });
      node.append(card); surface.append(node);
      const x = origin.x - destination.x, y = origin.y - destination.y;
      const animation = node.animate([
        { transform: `translate(${x}px,${y}px) rotate(-12deg) scale(.7)`, opacity: 1 },
        { transform: `translate(${x * .45}px,${y * .45 - 28}px) rotate(5deg) scale(.9)`, opacity: 1, offset: .5 },
        { transform: "translate(0,0) rotate(0deg) scale(1)", opacity: 1 }
      ], { duration: 420, easing: "cubic-bezier(.2,.65,.3,1)", fill: "both" });
      animation.playbackRate = speed.current;
      const flight = { node, animation }; flights.add(flight);
      animation.finished.then(() => {
        target.style.visibility = ""; node.remove(); flights.delete(flight);
        if (position === sequence.length && !flights.size) finish();
      }, () => {});
      if (position % snapshot.players.length === 1) playGameSound("card");
      timer = setTimeout(launch, 36 / speed.current);
    };
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(launch); });
    // Resizing, fullscreen and leaving the tab restore the authoritative state.
    window.addEventListener("resize", finish);
    document.addEventListener("fullscreenchange", finish);
    const hidden = () => { if (document.hidden) finish(); };
    document.addEventListener("visibilitychange", hidden);
    activeFlights.current = flights;
    return () => {
      finish(); window.removeEventListener("resize", finish);
      document.removeEventListener("fullscreenchange", finish);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [dealKey, root]);
  useEffect(() => { if (initialVersion.current && version !== initialVersion.current) cancel.current(); }, [version]);
  return { dealing, skip: () => cancel.current(), accelerate: () => {
    speed.current = 3;
    for (const flight of activeFlights.current) flight.animation.playbackRate = 3;
  } };
}
