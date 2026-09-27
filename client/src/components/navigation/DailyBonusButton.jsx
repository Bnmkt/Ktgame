import { useRef, useState } from "react";
import { Coins } from "lucide-react";
import { api } from "../../api.js";
import { CompactNumber, canClaimDaily, formatExactNumber } from "../../utils/presentation.jsx";

export function DailyBonusButton({ user, setUser, settings, onAchievements, onFeedback }) {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function claim() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    onFeedback(null);
    try {
      const result = await api("/api/me/daily-claim", { method: "POST" });
      setUser(result.user ?? result);
      onAchievements?.(result.achievementUnlocks ?? []);
      const award = result.award;
      if (award) {
        const milestone = award.tiers?.length ? ` Palier atteint : ${award.tiers.map((tier) => tier.label).join(", ")} !${award.capped ? " Plafond maximal atteint." : ""}` : "";
        onFeedback({ message: `+${formatExactNumber(award.amount)} jetons · série de ${award.streak} jour${award.streak > 1 ? "s" : ""} · multiplicateur ×${award.multiplier.toLocaleString("fr-FR")}.${milestone}` });
      }
    } catch (err) { onFeedback({ error: true, message: err.message }); }
    finally { pending.current = false; setBusy(false); }
  }
  if (!canClaimDaily(user)) return null;
  return <button type="button" className="daily-bonus-button" disabled={busy} onClick={claim} title={`Série en cours : ${user.dailyBonus?.streak ?? 0} jour(s). Prochain bonus : ${formatExactNumber(user.dailyBonus?.nextReward ?? settings.dailyTokens)} jetons. La série repart au jour 1 après un jour manqué.`}>
    <Coins size={18} /><span>{busy ? "Récupération…" : "Bonus"}<small>×{(user.dailyBonus?.nextMultiplier ?? 1).toLocaleString("fr-FR")} · <CompactNumber value={user.dailyBonus?.nextReward ?? settings.dailyTokens} /></small></span>
  </button>;
}
