import { useState } from "react";
import { Shield } from "lucide-react";
import { DynamicIcon, iconNames } from "lucide-react/dynamic.mjs";
import { API_URL } from "../../api.js";

const names = new Set(iconNames);
export const rankDivisionNames = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function RankInsignia({ rank, className = "" }) {
  const [failed, setFailed] = useState("");
  const name = names.has(rank?.insignia) ? rank.insignia : "shield";
  const source = /^[a-f0-9]{64}$/.test(rank?.insigniaImage ?? "") ? `${API_URL}/api/ranked/insignia-images/${rank.insigniaImage}` : "";
  return <span className={`ranked-insignia ${className}`.trim()} aria-hidden="true">
    {source && source !== failed ? <img src={source} alt="" decoding="async" onError={() => setFailed(source)} /> : <DynamicIcon name={name} size={24} fallback={() => <Shield size={24} />} />}
  </span>;
}
