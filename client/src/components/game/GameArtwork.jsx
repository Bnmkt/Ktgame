import { useState } from "react";
import { gameImageUrl } from "../../features/games/presentation.js";
import "./game-artwork.css";

export function GameArtwork({ source, fallback = null, backdrop = false, eager = false }) {
  const url = gameImageUrl(source);
  const [failed, setFailed] = useState("");
  if (!url || failed === url) return fallback;
  return <span className={backdrop ? "game-artwork-backdrop" : "game-artwork-media"}>
    <img src={url} alt="" loading={eager ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(url)} />
  </span>;
}
