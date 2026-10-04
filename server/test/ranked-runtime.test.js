import test from "node:test";
import assert from "node:assert/strict";
import { createRankedRuntime } from "../src/services/ranked-runtime.js";
import { normalizeRankedConfig } from "../src/services/ranked.js";
import { games } from "../src/games/shared.js";

function fixture(gameId="yahtzee") {
  const config=normalizeRankedConfig().games[gameId],players=[{id:"a"},{id:"b"}],online=new Set(["a","b"]);
  const room={id:"room",gameId,players:[...players],state:{gameId,players:[...players],currentPlayerIndex:0,finished:false,finishedOrder:[]},ranked:{config:{...config,reconnectSeconds:120,afkSeconds:30},roster:[...players],forfeits:{},actionAt:1000,turnActor:"a"}};
  const db={rooms:[room],users:players.map((p)=>({...p,tokens:10000})),settings:{}};
  const runtime=createRankedRuntime({app:{get(){},post(){},put(){},delete(){}},readDb:()=>db,updateDb:(fn)=>fn(db),games:()=>games,platformSettings:()=>({}),isWatching:(_room,id)=>online.has(id),
    finishRoomIfNeeded:(room)=>{if(room.state.finished)room.finished=true;},removePlayerFromRoomState:(room,id)=>{room.state.players=room.state.players.filter((p)=>p.id!==id);room.state.currentPlayerIndex=0;},emitRoomUpdate(){},broadcastRooms(){}});
  room.ranked.actionAt=1000;room.ranked.turnActor="a";
  return {runtime,room,online};
}
test("temporary disconnect grants a fresh active turn after reconnect, prolonged absence forfeits",()=> {
  const {runtime,room,online}=fixture();online.delete("a");runtime.tick(1000);runtime.tick(61000);
  assert.equal(room.ranked.forfeits.a,undefined);
  online.add("a");runtime.tick(62000);assert.equal(room.ranked.actionAt,62000);assert.equal(room.ranked.forfeits.a,undefined);
  online.delete("a");runtime.tick(63000);runtime.tick(183000);assert.equal(room.ranked.forfeits.a,"disconnect");
});
test("AFK is charged only during playable time, not during a result pause",()=> {
  const {runtime,room}=fixture();room.pacing={type:"results"};runtime.tick(100000);assert.deepEqual(room.ranked.forfeits,{});
  room.pacing=null;runtime.tick(100001);runtime.tick(129999);assert.deepEqual(room.ranked.forfeits,{});
  runtime.tick(130001);assert.equal(room.ranked.forfeits.a,"afk");
});
test("President abandonment after earlier finishers ends the match with its full ordering",()=> {
  const {runtime,room}=fixture("president");room.state.players.unshift({id:"first"});room.state.finishedOrder=["first"];
  room.ranked.roster.unshift({id:"first"});runtime.forfeit(room,{},"a");
  assert.equal(room.finished,true);assert.deepEqual(room.state.finishedOrder,["first","b"]);assert.deepEqual(room.state.winners,["first"]);
});
