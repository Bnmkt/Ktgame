export function overviewData(days = 7) {
  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(2026, 9, 22 - days + 1 + index)).toISOString().slice(0, 10);
    return { date, games: index % 5 + 1, players: index % 3 + 1, signups: 0 };
  });
  return {
    generatedAt: "2026-10-22T12:00:00Z", period: { days, from: daily[0].date, to: "2026-10-22", timeZone: "Europe/Brussels" },
    users: { total: 11, active: 10, inactive: 1, online: 3, newInPeriod: 0, unknownRegistrationDates: 4, pendingVerification: 2, legacyLogins: 1, dataRequests: { pending: 1, overdue: 0 } },
    health: { status: "healthy", cpuPercent: 12, eventLoopP95: 4 },
    rooms: { active: 2, playing: 1, waiting: 1, seatedPlayers: 3, seatedGuests: 1, seatedBots: 2 },
    economy: { circulatingTokens: 154000, credits: 3100, debits: 2500, transactions: 24 },
    activity: { games: daily.reduce((sum, row) => sum + row.games, 0), rankedGames: 3, uniquePlayers: 8, cancelled: 1, daily,
      topGames: [{ id: "yahtzee", games: 7, players: 4 }, { id: "midnight-dice", games: 5, players: 6 }, { id: "belote", games: 3, players: 4 }] },
    detectedIncidents: { pending: 2, ongoing: 0 }, pendingWork: { parental: { pending: 1 }, tribunal: { pendingReports: 1, awaitingEnforcement: 1 }, bugs: { pending: 3 } },
    catalog: { enabledGames: 15, games: 15, achievements: 280, shopItems: 320 }, events: { active: 1 },
    activeRooms: [{ id: "one", code: "ABC123", name: "La table des chouettes", gameId: "yahtzee", players: 3, playing: true }, { id: "two", code: "DEF456", name: "La revanche", gameId: "belote", players: 2, playing: false }],
    recentUsers: [{ id: "one", displayName: "Bnmkt", createdAt: "2026-01-04T15:00:00Z", emailVerified: true }, { id: "two", displayName: "JoueurAuPseudoParticulièrementLong", createdAt: "2025-12-14T10:00:00Z", emailVerified: false }]
  };
}
