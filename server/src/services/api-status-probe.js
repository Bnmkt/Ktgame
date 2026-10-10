export function apiHealthProbe({ rows = [], listening = true }) {
  if (!listening) return { id: "api", status: "outage", message: "L'API n'accepte plus les connexions.", diagnostic: "Serveur HTTP non disponible." };
  const count = rows.reduce((sum, row) => sum + (Number(row.requestCount) || 0), 0);
  const latencyMs = count ? rows.reduce((sum, row) => sum + (Number(row.requestLatencyAverage) || 0) * (Number(row.requestCount) || 0), 0) / count : null;
  const errors = rows.reduce((sum, row) => sum + (Number(row.requestServerErrors) || 0), 0);
  const p95 = Math.max(0, ...rows.map((row) => Number(row.eventLoopP95) || 0));
  const reasons = [];
  if (errors >= 5 && errors / Math.max(1, count) >= .05) reasons.push(`${errors} erreurs serveur sur ${count} requetes.`);
  if (latencyMs > 750) reasons.push(`Temps de reponse moyen : ${Math.round(latencyMs)} ms.`);
  const slowLoop = rows.filter((row) => Number(row.eventLoopP95) > 150 || Number(row.eventLoopUtilization) > 99);
  const highCpu = rows.filter((row) => Number(row.cpuProcess) > 90);
  if (slowLoop.length >= 3) reasons.push(`Boucle evenementielle ralentie : P95 maximal ${Math.round(p95)} ms, ${slowLoop.length} releves concernes.`);
  if (highCpu.length >= 3) reasons.push(`Charge CPU elevee sur ${highCpu.length} releves consecutifs ou rapproches.`);
  return { id: "api", status: reasons.length ? "degraded" : "operational", latencyMs, message: reasons.length ? "L'API presente des erreurs serveur ou un ralentissement confirme." : "L'API repond normalement.", diagnostic: reasons.join(" ") };
}
