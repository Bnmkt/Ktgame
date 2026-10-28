import assert from "node:assert/strict";
import test from "node:test";
import { circularDistance, circularIndex, gameViewStorageKey, orbitDestination, preferredGameView, publicGameTableCount, randomAvailableGame, selectedGameArtwork } from "../src/features/games/selector.js";

test("game view preference defaults to immersive and restores classic safely", () => {
  assert.equal(preferredGameView(null), "immersive");
  assert.equal(preferredGameView({ getItem: () => { throw Error('disabled'); } }), "immersive");
  assert.equal(preferredGameView({ getItem: key => key === gameViewStorageKey ? 'classic' : null }), 'classic');
});
test("the selected game reuses its Discord icon, then the existing cover", () => {
  assert.equal(selectedGameArtwork({discordIconImage:'/icon.png',coverImage:'/cover.png'}),'/icon.png');
  assert.equal(selectedGameArtwork({discordIconImage:'javascript:bad',coverImage:'/cover.png'}),'/cover.png');
  assert.equal(selectedGameArtwork({}), '');
});
test("orbit navigation crosses the first and last seats continuously", () => {
  assert.equal(circularIndex(-1,15),14); assert.equal(circularIndex(15,15),0);
  assert.equal(circularDistance(14,0,15),-1);
  assert.equal(orbitDestination(0,14,15,-1),-24);
  assert.equal(orbitDestination(336,0,15,1),360);
  assert.equal(orbitDestination(360,14,15),336);
});
test("a direct click uses the shortest circular path and random adds full turns", () => {
  assert.equal(orbitDestination(0,13,15),-48);
  assert.equal(orbitDestination(0,13,15,1,2),1032);
  for(const count of [1,3,7,15])for(let index=0;index<count;index++) {
    const destination=orbitDestination(-720,index,count,1,2);
    assert.equal(circularIndex(Math.round(destination/(360/count)),count), index);
    assert.ok(destination >= 0);
  }
});
test("random selection excludes disabled games and respects the caller's filtered pool", () => {
  const games=[{id:'a',enabled:false},{id:'b'},{id:'c'}];
  assert.equal(randomAvailableGame(games, game=>game.id!=='b',()=>0).id,'c');
  assert.equal(randomAvailableGame(games,()=>false),null);
  assert.equal(randomAvailableGame([],()=>true),null);
  assert.equal(randomAvailableGame(games,()=>true,()=>.999).id,'c');
});
test("public table counts use the existing classic room feed", () => {
  const rooms=[{gameId:'a'},{gameId:'a',finished:true},{gameId:'a',isPublic:false},{gameId:'a',ranked:{}},{gameId:'b'}];
  assert.equal(publicGameTableCount(rooms,'a'),1);
});
