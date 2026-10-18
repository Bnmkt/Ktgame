import { mascotAsset } from "../../features/mascots/catalog.js";
import "./mascot.css";
export { gameMascot } from "../../features/mascots/catalog.js";

export function Mascot({ character = "lucky", pose = "welcome", className = "", size = "small", priority = false }) {
  const base = import.meta.env.BASE_URL;
  return <span className={`ktga-mascot mascot-size-${size} ${className}`} aria-hidden="true">
    <img src={`${base}${mascotAsset(character, pose)}`} srcSet={`${base}${mascotAsset(character, pose)} 360w, ${base}${mascotAsset(character, pose, 720)} 720w`} sizes={size === "large" ? "(max-width: 760px) 100px, 300px" : "(max-width: 600px) 64px, 112px"} alt="" width={360} height={360} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" draggable={false}/>
  </span>;
}
