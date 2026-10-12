import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createLeaderboardSeasons } from "../src/storage/leaderboard-seasons.js";

const before = new Date("2026-09-30T21:59:59Z"), after = new Date("2026-09-30T22:00:00Z");
function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("CREATE TABLE meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)");
  const data = { users: Array.from({ length: 105 }, (_, i) => ({ id: `p${String(i).padStart(3, "0")}`, tokens: 5000 - i, createdAt: "2026-09-01T10:00:00Z" })),
    history: [{ id: "match", gameId: "yahtzee", finishedAt: before.toISOString(), players: [{ id: "p000" }], winners: ["p000"], payouts: { p000: 500 }, ranking: [{ id: "p000", score: 310 }] }], transactions: [] };
  let calls = 0;
  const load = () => { calls++; return structuredClone(data); };
  return { sql, data, load, calls: () => calls, store: createLeaderboardSeasons(sql, ["yahtzee"], load) };
}

test("season rollover freezes all ranks and balances before the next season, including self outside top 100", () => {
  const f = fixture();
  try {
    f.store.synchronize(before);
    assert.equal(f.store.read({ period: "season" }, "p104", before), null);
    f.store.synchronize(after);
    f.data.users[0].tokens = 1;
    f.data.users[1].active = false;
    f.data.users.splice(2, 1);
    f.data.history.length = 0;
    const result = f.store.read({ season: "2026-Q3" }, "p104", after);
    assert.equal(result.total, 105);
    assert.equal(result.rows.length, 100);
    assert.deepEqual(result.rows.slice(0, 3).map(row => row.value), [5000, 4999, 4998]);
    assert.equal(result.self.rank, 105);
    assert.equal(result.snapshotSource, "closing");
    assert.equal(f.store.read({ season: "2026-Q3", game: "yahtzee", metric: "score" }, "p000", after).rows[0].value, 310);
    assert.equal(f.store.read({ season: "2026-Q3", metric: "wins" }, "p000", after).rows[0].value, 1);
    const restart = createLeaderboardSeasons(f.sql, ["yahtzee"], f.load);
    assert.deepEqual(restart.read({ season: "2026-Q3" }, "p104", after).rows, result.rows);
    const reads = f.calls();
    restart.synchronize(new Date("2026-10-12T12:00:00Z"));
    assert.equal(f.calls(), reads, "Live reads do not rebuild snapshots");
  } finally { f.sql.close(); }
});

test("legacy seasons use their ledger and preserve archived games of deactivated or deleted players", () => {
  const f = fixture();
  try {
    f.data.users[0].active = false;
    f.data.users[0].tokens = 999999;
    f.data.history[0].players.push({ id: "removed" });
    f.data.history[0].winners.push("removed");
    f.data.transactions.push({ userId: "p000", balance: 700, amount: 500, createdAt: "2026-10-01T00:00:00Z" });
    f.store.synchronize(after);
    const wealth = f.store.read({ season: "2026-Q3" }, "p000", after);
    assert.equal(wealth.self.value, 200, "Infer the closing balance from the first following ledger entry, not today's balance");
    assert.equal(wealth.snapshotSource, "reconstructed");
    const wins = f.store.read({ season: "2026-Q3", metric: "wins" }, "removed", after);
    assert.equal(wins.self.value, 1);
    assert.equal(wins.rows.find(row => row.id === "p000").value, 1);
    f.data.transactions.length = 0;
    assert.equal(f.store.read({ season: "2026-Q3" }, "p000", after).self.value, 200);
  } finally { f.sql.close(); }
});

test("failed closure is rolled back and can be retried without duplicate entries", () => {
  const f = fixture();
  try {
    f.store.synchronize(before);
    f.sql.exec("CREATE TRIGGER fail_freeze BEFORE INSERT ON leaderboard_entries BEGIN SELECT RAISE(ABORT,'test failure'); END");
    assert.throws(() => f.store.synchronize(after), /test failure/);
    assert.equal(f.sql.prepare("SELECT count(*) AS count FROM leaderboard_boards").get().count, 0);
    f.sql.exec("DROP TRIGGER fail_freeze");
    f.store.synchronize(after);
    const count = f.sql.prepare("SELECT count(*) AS count FROM leaderboard_entries").get().count;
    f.store.synchronize(after);
    assert.equal(f.sql.prepare("SELECT count(*) AS count FROM leaderboard_entries").get().count, count);
  } finally { f.sql.close(); }
});
