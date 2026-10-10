import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { ConfigurationCache } from "../src/services/configuration-cache.js";
import { PlayerProgressCache } from "../src/services/player-progress-cache.js";
import { createLobbyBroadcast } from "../src/services/lobby-broadcast.js";
import { createPasswordWork } from "../src/services/password-work.js";
import { roomWriteScope } from "../src/storage/room-write-scope.js";
import { selectedCollectionRows } from "../src/storage/selected-rows.js";

test("scoped row indexes notice removals, replacements and reordering", () => {
  const a = { id: "a" }, b = { id: "b" }, rows = [a, b];
  const select = (...ids) => selectedCollectionRows(rows, new Set(ids));
  assert.deepEqual(select("b"), [b]);
  rows[1] = { id: "c" }; assert.deepEqual(select("b"), []); assert.deepEqual(select("c"), [rows[1]]);
  rows.reverse(); assert.deepEqual(select("a"), [a]);
  rows.push(b); assert.deepEqual(select("b"), [b]);
  rows.splice(rows.indexOf(a), 1); assert.deepEqual(select("a"), []);
  assert.deepEqual(select(), []);
});

test("player progress cache notices player mutations, archive revisions and admin catalog changes", () => {
  const cache = new PlayerProgressCache(2), references = [{}, {}, {}], input = { xp: 0, achievements: [] };
  let builds = 0;
  const get = (id = "a") => cache.get(id, references, input, () => ({ value: ++builds }));
  const first = get(); assert.equal(get(), first); assert.ok(Object.isFrozen(first));
  input.xp = 50; assert.notEqual(get(), first); assert.equal(builds, 2);
  for (let i = 0; i < references.length; i++) { references[i] = {}; get(); }
  assert.equal(builds, 5);
  input.achievements.push("reward"); get(); assert.equal(builds, 6);
  get("b"); get("c"); assert.equal(cache.entries.size, 2); assert.ok(!cache.entries.has("a"));
  assert.throws(() => new PlayerProgressCache(0));
});

test("configuration cache notices in-place edits and never freezes the source", () => {
  const cache = new ConfigurationCache(), input = { rules: [{ value: 1 }] };
  let builds = 0;
  const get = () => cache.get("rules", input, () => { builds++; return input; });
  const first = get();
  assert.equal(first, get()); assert.equal(builds, 1);
  assert.throws(() => { first.rules[0].value = 9; }, TypeError);
  input.rules[0].value = 2;
  assert.equal(get().rules[0].value, 2); assert.equal(builds, 2);
});

test("empty configuration builds defaults before reusing the cached value", () => {
  const cache = new ConfigurationCache();
  const first = cache.get("missing", undefined, () => ({ enabled: true }));
  assert.deepEqual(first, { enabled: true });
  assert.equal(cache.get("missing", undefined, () => { throw new Error("not cached"); }), first);
});

test("committed revisions skip fingerprints only inside readonly configuration scopes", () => {
  let revision = 0, fingerprints = 0;
  const cache = new ConfigurationCache({ revision: () => revision });
  const input = { value: 1, toJSON() { fingerprints++; return { value: this.value }; } };
  const get = () => cache.get("settings", input, () => ({ value: input.value }));
  cache.read(() => assert.equal(get().value, 1));
  for (let i = 0; i < 100; i++) cache.read(() => assert.equal(get().value, 1));
  assert.equal(fingerprints, 1);
  input.value = 2; assert.equal(get().value, 2);
  assert.equal(fingerprints, 2);
  revision++; cache.read(() => assert.equal(get().value, 2));
  assert.equal(fingerprints, 3);
  cache.read(() => get()); assert.equal(fingerprints, 3);
  input.value = 1; revision++;
  cache.read(() => assert.equal(get().value, 1));
  assert.equal(fingerprints, 4);
  assert.throws(() => new ConfigurationCache({ revision: 1 }));
});

test("readonly scopes retain committed snapshots across account-only mutations", () => {
  let revision = 0, mutating = false, fingerprints = 0;
  const cache = new ConfigurationCache({ revision: () => mutating ? undefined : revision });
  const input = { value: 1, toJSON() { fingerprints++; return { value: this.value }; } };
  const get = () => cache.get("settings", input, () => ({ value: input.value }));
  get();
  for (let i = 0; i < 10; i++) cache.read(() => {
    mutating = true;
    try { assert.equal(get().value, 1); } finally { mutating = false; }
  });
  assert.equal(fingerprints, 1);
  mutating = true; get(); mutating = false;
  cache.read(() => get()); assert.equal(fingerprints, 2);
  mutating = true; input.value = 2;
  cache.read(() => assert.equal(get().value, 2));
  mutating = false; revision++;
  cache.read(() => assert.equal(get().value, 2));
  assert.equal(fingerprints, 4);
});

test("lobby broadcasts coalesce changes, suppress identical lists and retain removals", async () => {
  let rooms = [{ id: "one" }]; const sent = [];
  const publisher = createLobbyBroadcast({ rooms: () => rooms, emit: (rows) => sent.push(rows), delayMs: 10 });
  try {
    publisher.schedule(); publisher.schedule(); rooms = [{ id: "two" }];
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(sent, [[{ id: "two" }]]);
    publisher.schedule(); await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(sent.length, 1);
    rooms = []; publisher.schedule(); await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(sent.at(-1), []);
    publisher.schedule(); publisher.close(); await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(sent.length, 2);
  } finally { publisher.close(); }
});

test("configuration read scopes are nested, synchronous and refresh between operations", () => {
  const cache = new ConfigurationCache(), input = { value: 1 };
  let reads = 0;
  input.toJSON = () => { reads++; return { value: input.value }; };
  const get = () => cache.get("settings", input, () => ({ value: input.value }));
  cache.read(() => { assert.equal(get().value, 1); cache.read(() => get()); get(); });
  assert.equal(reads, 1);
  input.value = 2;
  assert.equal(cache.read(() => get()).value, 2);
  assert.throws(() => cache.read(() => { throw new Error("failed read"); }));
  input.value = 3;
  assert.equal(get().value, 3);
});

test("room patches transmit only changed entries and removals", async () => {
  let rows = [{id:"a",players:[]},{id:"b",players:[]}];
  const patches = [];
  const publisher = createLobbyBroadcast({ rooms:()=>rows, emit:(_rows,patch)=>patches.push(patch), delayMs:10 });
  try {
    publisher.schedule(); await new Promise((resolve)=>setTimeout(resolve,30));
    assert.deepEqual(patches.at(-1), {upsert:rows,remove:[]});
    rows = [{id:"a",players:[{id:"one"}]},{id:"b",players:[]}];
    publisher.schedule(); await new Promise((resolve)=>setTimeout(resolve,30));
    assert.deepEqual(patches.at(-1), {upsert:[rows[0]],remove:[]});
    rows = [rows[1]];
    publisher.schedule(); await new Promise((resolve)=>setTimeout(resolve,30));
    assert.deepEqual(patches.at(-1), {upsert:[],remove:["a"]});
  } finally { publisher.close(); }
});

test("room write scope includes roster, departed payouts and pending history recipients", () => {
  assert.deepEqual(roomWriteScope({ transactions: { pending: [{ userId: "departed" }] }, history: { pending: [{ players: [{ id: "winner" }] }] } }, [{ id: "table", players: [{ id: "a" }, { id: "bot", isBot: true }], state: { players: [{ id: "a" }] }, ranked: { roster: [{ id: "forfeit" }] } }]), { users: ["a", "forfeit", "departed", "winner"], rooms: ["table"] });
});

test("password workers preserve bcrypt compatibility, reject invalid inputs and remain usable", async () => {
  const work = createPasswordWork({ size: 2 });
  try {
    const hash = await work.hash("Valid-Password!", 10);
    assert.equal(bcrypt.getRounds(hash), 10);
    assert.equal(await bcrypt.compare("Valid-Password!", hash), true);
    assert.deepEqual(await Promise.all([work.compare("Valid-Password!", hash), work.compare("wrong", hash)]), [true, false]);
    await assert.rejects(work.hash(null, 10));
    assert.equal(await work.compare("Valid-Password!", hash), true);
  } finally { await work.close(); }
  await assert.rejects(work.hash("closed", 10), /closed/);
});

test("password worker admission is bounded without dropping accepted requests", async () => {
  const work = createPasswordWork({ size: 1, maxPending: 1 });
  try {
    const first = work.hash("first", 4), second = work.hash("second", 4);
    await assert.rejects(work.hash("overflow", 4), { code: "PASSWORD_WORK_BUSY" });
    assert.equal((await first).length, 60); assert.equal((await second).length, 60);
  } finally { await work.close(); }
});

test("password worker limits cannot leave admitted operations stuck", () => {
  for (const limits of [{ size: 0 }, { size: 5 }, { maxPending: 0 }, { maxPending: Infinity }]) assert.throws(() => createPasswordWork(limits), /limits/);
});
