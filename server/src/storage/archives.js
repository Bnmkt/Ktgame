import { casinoDateKey } from "../services/time.js";

// Immutable journals stay on disk. Only uncommitted inserts are held in memory.
// The iterable methods preserve the engines' existing collection contract.
export class Archive {
  constructor(sqlite, table, decode, columns = {}) {
    this.sqlite = sqlite;
    this.table = table;
    this.decode = decode;
    this.columns = columns;
    this.pending = [];
    this.revision = 0;
    this.userRevisions = new Map();
    this.userRevisionEpoch = 0;
    this.persistedCount = Number(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n);
    this.iteratorStatement = sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`);
  }

  get length() { return this.persistedCount + this.pending.length; }
  touchUsers(rows) {
    for (const row of rows) {
      const ids = new Set([row.userId, ...(row.players ?? []).map((player) => player.id), ...(row.winners ?? [])].filter(Boolean));
      for (const id of ids) {
        if (!this.userRevisions.has(id) && this.userRevisions.size >= 4096) { this.userRevisions.clear(); this.userRevisionEpoch++; }
        this.userRevisions.set(id, (this.userRevisions.get(id) ?? 0) + 1);
      }
    }
  }
  revisionFor(userId) { return `${this.userRevisionEpoch}:${this.userRevisions.get(userId) ?? 0}`; }
  push(...rows) { this.pending.push(...rows); this.revision++; this.touchUsers(rows); return this.length; }
  committed() {
    if (this.pending.length) {
      this.persistedCount += this.pending.length;
      this.touchUsers(this.pending);
      this.pending = [];
      this.revision++;
    }
  }
  *[Symbol.iterator]() {
    for (const row of this.iteratorStatement.iterate()) yield this.decode(row);
    yield* this.pending;
  }
  filter(predicate) { const rows = []; for (const row of this) if (predicate(row)) rows.push(row); return rows; }
  map(callback) { return Array.from(this, callback); }
  find(predicate) { for (const row of this) if (predicate(row)) return row; }
  some(predicate) { return this.find(predicate) !== undefined; }
  at(index) {
    const offset = index < 0 ? this.length + index : index;
    if (offset < 0 || offset >= this.length) return undefined;
    const persisted = this.length - this.pending.length;
    if (offset >= persisted) return this.pending[offset - persisted];
    const row = this.sqlite.prepare(`SELECT * FROM ${this.table} ORDER BY rowid LIMIT 1 OFFSET ?`).get(offset);
    return row ? this.decode(row) : undefined;
  }

  select(filters = {}, { limit, offset = 0, descending = false } = {}) {
    const clauses = [], params = [];
    for (const [key, value] of Object.entries(filters)) {
      if (!this.columns[key]) throw new Error(`Unsupported archive filter: ${key}`);
      clauses.push(key === "memberId" ? "id IN (SELECT history_id FROM history_members WHERE user_id = ?)" : `${this.columns[key]} = ?`);
      params.push(value);
    }
    const date = this.table === "history" ? "finished_at" : "created_at";
    const order = descending ? `${date} DESC, rowid DESC` : "rowid";
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    // Pending rows are visible to achievement and reward calculations before commit.
    if (this.pending.length) {
      const persisted = this.sqlite.prepare(`SELECT * FROM ${this.table}${where} ORDER BY ${order}`).all(...params).map(this.decode);
      const matches = this.pending.filter((row) => Object.entries(filters).every(([key, value]) => key === "memberId"
        ? row.players?.some((player) => player.id === value) || row.winners?.includes(value)
        : row[key] === value));
      const rows = [...persisted, ...matches];
      if (descending) rows.sort((a, b) => String(b.finishedAt ?? b.createdAt).localeCompare(String(a.finishedAt ?? a.createdAt)));
      return rows.slice(offset, limit === undefined ? undefined : offset + limit);
    }
    const pagination = limit === undefined ? "" : " LIMIT ? OFFSET ?";
    return this.sqlite.prepare(`SELECT * FROM ${this.table}${where} ORDER BY ${order}${pagination}`)
      .all(...params, ...(limit === undefined ? [] : [limit, offset])).map(this.decode);
  }
}

export function archiveRows(collection, filters, options) {
  if (collection instanceof Archive) return collection.select(filters, options);
  let rows = collection.filter((row) => Object.entries(filters).every(([key, value]) => key === "memberId"
    ? row.players?.some((player) => player.id === value) || row.winners?.includes(value)
    : row[key] === value));
  if (options?.descending) rows = rows.sort((a, b) => String(b.finishedAt ?? b.createdAt).localeCompare(String(a.finishedAt ?? a.createdAt)));
  const offset = options?.offset ?? 0;
  return rows.slice(offset, options?.limit === undefined ? undefined : offset + options.limit);
}

export function archiveDays(collection, start, end) {
  if (!(collection instanceof Archive) || !collection.columns.day) return collection.filter((row) => {
    const day = casinoDateKey(row.finishedAt ?? row.createdAt);
    return day >= start && day <= end;
  });
  const persisted = collection.sqlite.prepare(`SELECT * FROM ${collection.table} WHERE ${collection.columns.day} >= ? AND ${collection.columns.day} <= ? ORDER BY ${collection.columns.day}, rowid`).all(start, end).map(collection.decode);
  const pending = collection.pending.filter((row) => {
    const day = casinoDateKey(row.finishedAt ?? row.createdAt);
    return day >= start && day <= end;
  });
  return [...persisted, ...pending];
}
