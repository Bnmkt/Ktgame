import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerRoomEntry } from "../src/services/room-entry.js";

test("anonymous table preview exposes only entry metadata, never secrets or game state", async () => {
  const app = express();
  const db = {
    rooms: [{ code: "ABC123", ownerId: "owner", passwordHash: "secret", state: { deck: "private" }, name: "Private room" }, { code: "AAA111", finished: true }],
    users: [{ id: "owner", email: "private@example.com", profile: { displayName: "Bnmkt" } }]
  };
  registerRoomEntry({ app, limiter: (_req, _res, next) => next(), readDb: () => db, displayNameFor: (user) => user.profile.displayName });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${url}/api/table-entry/abc123`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { code: "ABC123", hostName: "Bnmkt", requiresPassword: true, ranked: false });
    assert.equal(db.rooms[0].players, undefined, "Preview must not join a room");
    for (const code of ["AAA111", "999999", "invalid-code"]) assert.equal((await fetch(`${url}/api/table-entry/${code}`)).status, 404);
    db.rooms[0].ranked = { privateConfig: "secret" };
    db.users = [];
    const ranked = await (await fetch(`${url}/api/table-entry/ABC123`)).json();
    assert.equal(ranked.ranked, true);
    assert.equal(ranked.hostName, "");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
