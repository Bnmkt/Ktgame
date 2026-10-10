export function createEmailStatusProbe({ verify, onFailure = () => {} }) {
  let cached = null;
  let checkedAt = 0;
  let failures = 0;
  return async (timestamp = Date.now()) => {
    const interval = cached?.ok ? 15 * 60 * 1000 : 60 * 1000;
    if (!cached || timestamp - checkedAt >= interval) {
      cached = await verify();
      checkedAt = timestamp;
      failures = cached.ok || !cached.configured ? 0 : failures + 1;
      if (cached.configured && !cached.ok) onFailure(cached);
    }
    if (!cached.configured) return { id: "email", status: "unknown", message: "Le service email n’est pas activé." };
    if (!cached.ok && failures < 2 && cached.code !== "EAUTH") return {
      id: "email", status: "unknown", message: "Une connexion SMTP a échoué ; une nouvelle vérification est prévue dans une minute.", diagnostic: smtpDiagnostic(cached)
    };
    return {
      id: "email", status: cached.ok ? "operational" : "outage",
      message: cached.ok ? "Le serveur email accepte les connexions." : "La connexion ou l’authentification SMTP a échoué.",
      diagnostic: cached.ok ? "" : smtpDiagnostic(cached)
    };
  };
}

export function smtpDiagnostic(result) {
  const code = /^[A-Z0-9_]{1,40}$/.test(result.code ?? "") ? result.code : "non précisé";
  const command = /^[A-Z][A-Z0-9 -]{0,40}$/.test(result.command ?? "") ? result.command : "non précisée";
  const explanations = { ETIMEDOUT: "Délai de connexion dépassé", ECONNECTION: "Connexion au serveur impossible", EAUTH: "Authentification refusée", EDNS: "Résolution DNS impossible", ESOCKET: "Erreur de transport ou TLS", ETLS: "Négociation TLS impossible" };
  return `${explanations[code] ?? "Échec de vérification SMTP"} · code ${code} · étape ${command}${Number.isInteger(result.responseCode) ? ` · réponse ${result.responseCode}` : ""}.`;
}
