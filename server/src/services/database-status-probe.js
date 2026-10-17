export function databaseHealthProbe(health, latencyMs) {
  const oversizedWal = health.walBytes > Math.max(64 * 1024 * 1024, health.fileBytes * 2);
  const slow = latencyMs > 500;
  // Free pages are reusable capacity, not an availability or integrity failure.
  return {
    id: "database", status: slow || oversizedWal ? "degraded" : "operational", latencyMs,
    message: slow ? "Les lectures du stockage sont ralenties." : oversizedWal ? "Le journal du stockage est anormalement volumineux." : "Le stockage répond normalement.",
    diagnostic: slow || oversizedWal ? `Lecture : ${Math.round(latencyMs)} ms ; journal WAL : ${Math.round(health.walBytes / 1048576)} Mio.` : ""
  };
}
