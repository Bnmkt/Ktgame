import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { games } from "../src/games/shared.js";
import { normalizeAchievementDefinition } from "../src/services/achievement-rules.js";
import { normalizeAchievementRewards, normalizeProgressionConfig } from "../src/services/game-progression.js";

const baseXp = { easy: 30, medium: 50, hard: 100, veryHard: 300 };
const challengeDifficulty = {
  "421-nenette": "medium", "421-perfect": "hard", "421-triple": "medium",
  "accordion-low": "hard", "accordion-one-pile": "veryHard",
  "bataille-sweep": "easy", "bataille-war": "easy",
  "blackjack-21": "easy", "blackjack-dealer-bust": "easy", "blackjack-five-card-hand": "hard",
  "blackjack-natural": "medium", "blackjack-push": "hard",
  "cul-343": "hard", "cul-chouette-velute": "hard", "cul-cul-de-chouette": "medium",
  "farkle-hot-dice": "medium", "farkle-one-shot-10000": "veryHard", "farkle-roll-1000": "easy",
  "farkle-roll-3000": "hard", "farkle-straight": "hard", "farkle-target": "medium",
  "farkle-three-pairs": "medium", "farkle-two-triplets": "hard",
  "golf-clear": "veryHard", "golf-low": "hard",
  "liars-dice-good-call": "easy", "liars-dice-last-die": "medium",
  "midnight-all-contracts": "veryHard", "midnight-diamond-contract": "veryHard",
  "midnight-flawless-contracts": "veryHard", "midnight-market-shaker": "easy", "midnight-perfect-contract": "hard",
  "president-first-out": "medium", "president-pair-master": "medium", "president-revolution": "hard",
  "shut-low": "medium", "shut-zero": "hard",
  "velvet-bluff-caught": "easy", "velvet-three-catches": "hard",
  "yahtzee-clean-card": "veryHard", "yahtzee-first-yahtzee": "hard", "yahtzee-full-house": "easy",
  "yahtzee-large-straight": "medium", "yahtzee-perfect": "veryHard", "yahtzee-score-250": "hard",
  "yahtzee-score-300": "veryHard", "yahtzee-three-zeroes": "easy", "yahtzee-upper-bonus": "medium",
  "custom-achievement-124cf6b5-4f44-4c4f-bc17-41612f20aca7": "veryHard",
  "custom-achievement-95841830-1729-4267-8ebf-dfc801ce567e": "easy",
  "custom-achievement-d1a578fe-5cf2-495b-a15d-04eef7739181": "medium"
};

export function achievementXp(entry, difficulty) {
  if (!Object.hasOwn(baseXp, difficulty)) throw new Error(`Unknown difficulty: ${difficulty}`);
  return baseXp[difficulty] + (entry.milestone ? 200 : 0) + (entry.secret ? 500 : 0);
}

export function activeAchievementCatalog(catalog, settings) {
  const custom = new Map((settings.customAchievements ?? []).map((entry) => [entry.id, entry]));
  const active = catalog.filter((entry) => entry.builtIn || custom.has(entry.id)).map((entry) => {
    const current = { ...entry, ...(entry.builtIn ? settings.achievementOverrides?.[entry.id] : custom.get(entry.id)), id: entry.id, builtIn: !!entry.builtIn };
    if (!current.builtIn) current.categories = [...new Set([current.group, current.type === "games" || current.gameId ? "Jeux" : "Progression", current.secret ? "Secrets" : null, current.milestone || current.secret ? "Milestones" : null].filter(Boolean))];
    return current;
  });
  for (const id of custom.keys()) if (!active.some((entry) => entry.id === id)) throw new Error(`Custom definition missing from catalog: ${id}`);
  return active;
}

function achievementGame(entry, availableGames) {
  const metricGame = /^(?:gameWins|gameLevel|gameXp)\.(.+)$/.exec(entry.rule?.metric ?? "")?.[1];
  return availableGames.find((game) => game.id === (entry.gameId || entry.rule?.gameId || metricGame));
}

function difficultyFor(entry) {
  if (challengeDifficulty[entry.id]) return challengeDifficulty[entry.id];
  if (entry.rule?.metric?.startsWith("gameWins.")) return entry.target <= 1 ? "easy" : entry.target <= 10 ? "medium" : entry.target <= 100 ? "hard" : "veryHard";
  if (entry.rule?.metric?.startsWith("gameLevel.") || entry.rule?.event === "game.level") return entry.target <= 5 ? "easy" : entry.target <= 10 ? "medium" : entry.target <= 50 ? "hard" : "veryHard";
  throw new Error(`Review the difficulty before applying rewards: ${entry.id} (${entry.title})`);
}

function withXp(entry, gameId, difficulty) {
  const rewards = normalizeAchievementRewards(entry.rewards ?? {});
  const xp = [...rewards.xp.filter((row) => row.gameId !== gameId), { gameId, amount: achievementXp(entry, difficulty) }];
  return { ...entry, rewards: normalizeAchievementRewards({ ...rewards, xp }) };
}

export function planGameAchievements(catalog, availableGames = games) {
  const rows = new Map(catalog.map((entry) => [entry.id, structuredClone(entry)]));
  if (rows.size !== catalog.length) throw new Error("Duplicate achievement identifiers.");
  const created = [], difficulties = new Map();
  for (const game of availableGames) for (const level of [10, 100, 101]) {
    const matching = [...rows.values()].filter((entry) => entry.rule?.source === "metric" && entry.rule.metric === `gameLevel.${game.id}` && Number(entry.target) === level);
    if (matching.length > 1) throw new Error(`Several achievements already target ${game.id} level ${level}.`);
    let entry = matching[0];
    const id = `game-${game.id}-level-${level}`;
    if (!entry) {
      if (rows.has(id)) throw new Error(`Achievement identifier already used: ${id}`);
      entry = { ...normalizeAchievementDefinition({ id, type: "games", gameId: game.id, group: game.name,
        title: level === 101 ? `Ultimate ${game.name}` : `Niveau ${level} - ${game.name}`,
        description: `Atteindre le niveau ${level} dans ${game.name}.`, target: level, milestone: true,
        secret: level === 101, enabled: true, rule: { source: "metric", metric: `gameLevel.${game.id}` }
      }), builtIn: false };
      created.push(entry.id);
    }
    entry = { ...entry, milestone: true, secret: level === 101, ...(level === 101 ? { title: `Ultimate ${game.name}` } : {}) };
    const difficulty = level === 10 ? "medium" : "veryHard";
    rows.set(entry.id, withXp(entry, game.id, difficulty));
    difficulties.set(entry.id, difficulty);
  }
  for (const [id, entry] of rows) {
    const game = achievementGame(entry, availableGames);
    if (!game || difficulties.has(id)) continue;
    const difficulty = difficultyFor(entry);
    rows.set(id, withXp(entry, game.id, difficulty));
    difficulties.set(id, difficulty);
  }
  const previous = new Map(catalog.map((entry) => [entry.id, entry]));
  const changes = [...rows.values()].filter((entry) => JSON.stringify(entry) !== JSON.stringify(previous.get(entry.id)));
  return { changes, created, audit: [...difficulties].map(([id, difficulty]) => {
    const entry = rows.get(id), game = achievementGame(entry, availableGames);
    return { id, title: entry.title, gameId: game.id, difficulty, milestone: !!entry.milestone, secret: !!entry.secret, xp: entry.rewards.xp.find((row) => row.gameId === game.id).amount };
  }) };
}

async function assertServerStopped(serverDir) {
  const pidFile = path.join(serverDir, ".server.pid");
  if (fs.existsSync(pidFile)) {
    const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
    if (Number.isSafeInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); throw new Error("Stop the server before --apply; its settings are cached."); }
      catch (error) { if (error.code !== "ESRCH") throw error; }
    }
  }
  const listening = await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: Number(process.env.PORT || 4000) });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", (error) => { socket.destroy(); if (error.code === "ECONNREFUSED") resolve(false); else reject(error); });
    socket.setTimeout(2000, () => { socket.destroy(); reject(new Error("Cannot verify that the server is stopped.")); });
  });
  if (listening) throw new Error("Server port is still in use; stop the server before --apply.");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply")) throw new Error("Usage: node scripts/seed-game-achievements.mjs [--apply]. Default: preview only.");
  const apply = args.includes("--apply"), serverDir = fileURLToPath(new URL("../", import.meta.url));
  if (apply) await assertServerStopped(serverDir);
  const filename = path.resolve(process.env.SQLITE_PATH || path.join(serverDir, "data", "ktga.sqlite"));
  if (!fs.existsSync(filename)) throw new Error("Database not found.");
  const db = new DatabaseSync(filename, { readOnly: !apply });
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
    const rawSettings = db.prepare("SELECT value FROM meta WHERE key='admin-settings'").get()?.value ?? "{}";
    const settings = JSON.parse(rawSettings);
    const config = normalizeProgressionConfig(settings.platform?.gameProgression, games.map((game) => game.id));
    if (config.maxLevel < 101) throw new Error("Level 101 must be reachable; review the configured maximum level first.");
    const catalog = db.prepare("SELECT data FROM achievement_catalog WHERE data IS NOT NULL ORDER BY id").all().map((row) => JSON.parse(row.data));
    const activeCatalog = activeAchievementCatalog(catalog, settings);
    const plan = planGameAchievements(activeCatalog);
    let backup;
    if (apply && plan.changes.length) {
      const directory = path.join(path.dirname(filename), "backups"), stamp = new Date().toISOString().replace(/[:.]/g, "-");
      fs.mkdirSync(directory, { recursive: true });
      backup = path.join(directory, `before-game-achievements-${stamp}.sqlite`);
      db.prepare("VACUUM INTO ?").run(backup);
      const author = db.prepare("SELECT id FROM users WHERE json_extract(data,'$.admin')=1 ORDER BY id LIMIT 1").get()?.id;
      const timestamp = new Date().toISOString();
      settings.achievementOverrides ??= {}; settings.customAchievements ??= [];
      db.exec("BEGIN IMMEDIATE");
      try {
        if ((db.prepare("SELECT value FROM meta WHERE key='admin-settings'").get()?.value ?? "{}") !== rawSettings) throw new Error("Settings changed during preparation; aborting.");
        for (const change of plan.changes) {
          const next = { ...change, updatedAt: timestamp };
          if (next.builtIn) settings.achievementOverrides[next.id] = { ...(settings.achievementOverrides[next.id] ?? {}), title: next.title, rewards: next.rewards, milestone: next.milestone, secret: next.secret, updatedAt: timestamp };
          else {
            const index = settings.customAchievements.findIndex((entry) => entry.id === next.id);
            if (index >= 0) settings.customAchievements[index] = { ...settings.customAchievements[index], ...next };
            else {
              if (!plan.created.includes(next.id)) throw new Error(`Custom definition missing from settings: ${next.id}`);
              Object.assign(next, { createdAt: timestamp, ...(author ? { createdById: author } : {}) });
              settings.customAchievements.push(next);
            }
          }
          db.prepare("INSERT INTO achievement_catalog(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(next.id, JSON.stringify(next));
        }
        db.prepare("INSERT OR REPLACE INTO meta(key,value) VALUES('admin-settings',?)").run(JSON.stringify(settings));
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      fs.writeFileSync(backup.replace(/\.sqlite$/, ".json"), JSON.stringify({ appliedAt: timestamp, ...plan }, null, 2));
    }
    console.log(JSON.stringify({ applied: apply, updated: plan.changes.length - plan.created.length, created: plan.created.length, archived: catalog.length - activeCatalog.length, ...(backup ? { backup } : {}), audit: plan.audit }, null, 2));
  } finally { db.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
