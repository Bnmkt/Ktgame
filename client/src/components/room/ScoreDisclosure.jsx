import { useState } from "react";
import { ChevronDown, Trophy } from "lucide-react";
import { useCompactLayout } from "../common/useCompactLayout.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";

export function ScoreDisclosure({ children, className = "" }) {
  const { t } = useLocale();
  const compact = useCompactLayout();
  const [expanded, setExpanded] = useState(false);
  return <details className={`room-score-disclosure ${className}`} open={!compact || expanded} onToggle={event => { if (compact) setExpanded(event.currentTarget.open); }}><summary><Trophy size={18}/><span>{t("Scores")}</span><ChevronDown size={16}/></summary><div className="room-score-scroll">{children}</div></details>;
}
