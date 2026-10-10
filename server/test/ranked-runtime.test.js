import test from "node:test";
import assert from "node:assert/strict";
import { createRankedRuntime } from "../src/services/ranked-runtime.js";
import { normalizeRankedConfig } from "../src/services/ranked.js";
import { games } from "../src/games/shared.js";

function fixture(gameId="yahtzee") {
  const emissions=[];
  const config=normalizeRankedConfig().games[gameId],players=[{id:"a"},{id:"b"}],online=new Set(["a","b"]);
  const room={id:"room",gameId,players:[...players],state:{gameId,players:[...players],currentPlayerIndex:0,finished:false,finishedOrder:[]},ranked:{config:{...config,reconnectSeconds:120,afkSeconds:30},roster:[...players],forfeits:{},actionAt:1000,turnActor:"a"}};
  const db={rooms:[room],users:players.map((p)=>({...p,tokens:10000})),settings:{}};
  const runtime=createRankedRuntime({app:{get(){},post(){},put(){},delete(){}},readDb:()=>db,updateDb:(fn)=>fn(db),games:()=>games,platformSettings:()=>({}),isWatching:(_room,id)=>online.has(id),
    finishRoomIfNeeded:(room)=>{if(room.state.finished)room.finished=true;},removePlayerFromRoomState:(room,id)=>{room.state.players=room.state.players.filter((p)=>p.id!==id);room.state.currentPlayerIndex=0;},emitRoomUpdate(room){emissions.push(structuredClone(room));},broadcastRooms(){}});
  room.ranked.actionAt=1000;room.ranked.turnActor="a";
  return {runtime,room,online,emissions};
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
test("clock changes are emitted once and stable ticks do not flood the table",()=>{
  const {runtime,room,online,emissions}=fixture();runtime.tick(1000);emissions.length=0;
  runtime.tick(2000);assert.equal(emissions.length,0);
  online.delete("a");runtime.tick(3000);assert.equal(emissions.length,1);
  runtime.tick(4000);assert.equal(emissions.length,1);
  online.add("a");runtime.tick(5000);assert.equal(emissions.length,2);assert.equal(room.ranked.actionAt,5000);
  room.pacing={kind:"round-results"};runtime.tick(6000);assert.equal(emissions.length,3);
  room.pacing=null;runtime.tick(7000);assert.equal(emissions.length,4);assert.equal(room.ranked.actionAt,7000);
});
test("President abandonment after earlier finishers ends the match with its full ordering",()=> {
  const {runtime,room}=fixture("president");room.state.players.unshift({id:"first"});room.state.finishedOrder=["first"];
  room.ranked.roster.unshift({id:"first"});runtime.forfeit(room,{},"a");
  assert.equal(room.finished,true);assert.deepEqual(room.state.finishedOrder,["first","b"]);assert.deepEqual(room.state.winners,["first"]);
});

function queueFixture(settings={}) {
  const routes=new Map(),db={rooms:[],users:["a","b","c","d","e","f"].map((id)=>({id,pseudo:id,tokens:0})),settings:{...settings,ranked:{placementGames:0,...settings.ranked}}};
  const app=Object.fromEntries(["get","post","put","delete"].map((method)=>[method,(route,...handlers)=>routes.set(`${method}:${route}`,handlers.at(-1))]));
  const runtime=createRankedRuntime({app,readDb:()=>db,updateDb:(fn)=>fn(db),games:()=>games,platformSettings:()=>({}),userFeatureAccess:()=>({allowed:true}),
    roomCode:()=>`TEST${db.rooms.length}`,roomPlayerFor:(user)=>({id:user.id,pseudo:user.pseudo}),startRoomRound:(room)=>{room.state={players:[...room.players],gameId:room.gameId,currentPlayerIndex:0,finished:false};},
    io:{to:()=>({emit(){}})},emitRoomUpdate(){},broadcastRooms(){},isWatching:()=>true,finishRoomIfNeeded(){}});
  function call(method,route,id,body={}) {
    let result,code=200;const res={setHeader(){},status(n){code=n;return this;},json(value){result=value;return this;}};
    routes.get(`${method}:${route}`)({auth:{id},body},res);return {code,data:result};
  }
  return {db,runtime,call};
}

test("filled queues require every acceptance and at least thirty seconds, exactly once",(t)=> {
  let now=1000;t.mock.method(Date,"now",()=>now);
  const {db,runtime,call}=queueFixture();
  call("post","/api/ranked/queue","a",{gameId:"yahtzee"});
  const offer=call("post","/api/ranked/queue","b",{gameId:"yahtzee"}).data.proposal;
  assert.equal(offer.startsAfter,31000);assert.ok(offer.players.every((player)=>!player.ready));assert.equal(db.rooms.length,0);
  assert.equal(call("post","/api/ranked/ready","c",{proposalId:offer.id}).code,409);
  assert.equal(call("post","/api/ranked/ready","a",{proposalId:"wrong"}).code,409);
  call("post","/api/ranked/ready","a",{proposalId:offer.id});call("post","/api/ranked/ready","b",{proposalId:offer.id});
  runtime.tick(30999);assert.equal(db.rooms.length,0);
  now=31000;runtime.tick(now);assert.equal(db.rooms.length,1);assert.equal(db.rooms[0].stake,0);
  assert.equal(call("post","/api/ranked/ready","b",{proposalId:offer.id}).code,409);
  runtime.tick(now+1);assert.equal(db.rooms.length,1);
});

test("placement queues widen immediately then relocate while retaining confirmation and privacy",(t)=> {
  let now=1000;t.mock.method(Date,"now",()=>now);
  const {db,runtime,call}=queueFixture({ranked:{placementGames:5}});
  db.users.find((user)=>user.id==="b").gameElo={yahtzee:{elo:1250,games:30,wins:10}};
  const queued=call("post","/api/ranked/queue","a",{gameId:"yahtzee"}).data;
  assert.equal(queued.queue.range,4);assert.equal(queued.queue.elo,undefined);
  assert.equal(queued.games.find((row)=>row.id==="yahtzee").rank.id,"unranked");
  let offered=call("post","/api/ranked/queue","b",{gameId:"yahtzee"}).data;
  assert.equal(offered.proposal.players.length,2);assert.equal(db.rooms.length,0);
  for(const id of ["a","b"])call("delete","/api/ranked/queue",id);
  db.users.find((user)=>user.id==="b").gameElo.yahtzee.elo=2600;
  for(const id of ["a","b"])call("post","/api/ranked/queue",id,{gameId:"yahtzee"});
  now=30999;runtime.tick(now);assert.equal(call("get","/api/ranked","a").data.proposal,null);
  now=31000;runtime.tick(now);offered=call("get","/api/ranked","a").data;
  assert.equal(offered.proposal.players.length,2);assert.equal(offered.proposal.startsAfter,61000);
  assert.equal(offered.queue.elo,undefined);assert.equal(db.users[0].gameElo,undefined);
  assert.equal(offered.proposal.players.find((row)=>row.id==="a").rank.id,"unranked");
  for(const id of ["a","b"])call("post","/api/ranked/ready",id,{proposalId:offered.proposal.id});
  runtime.tick(60999);assert.equal(db.rooms.length,0);
  now=61000;runtime.tick(now);assert.equal(db.rooms.length,1);
  assert.deepEqual(db.rooms[0].players.map((row)=>row.id),["a","b"]);
});

test("refusal and confirmation timeout requeue the other players without fees or sanctions",(t)=> {
  let now=1000;t.mock.method(Date,"now",()=>now);
  const {db,runtime,call}=queueFixture();
  call("post","/api/ranked/queue","a",{gameId:"yahtzee"});
  let offer=call("post","/api/ranked/queue","b",{gameId:"yahtzee"}).data.proposal;
  call("post","/api/ranked/ready","a",{proposalId:offer.id});call("delete","/api/ranked/queue","b");
  assert.equal(call("get","/api/ranked","a").data.proposal,null);
  assert.equal(call("get","/api/ranked","a").data.queue.joinedAt,1000);
  assert.equal(call("get","/api/ranked","b").data.queue,null);
  offer=call("post","/api/ranked/queue","c",{gameId:"yahtzee"}).data.proposal;
  assert.notEqual(offer.id,undefined);assert.equal(offer.accepted,false);
  call("post","/api/ranked/ready","a",{proposalId:offer.id});
  now=offer.expiresAt;runtime.tick(now);
  assert.equal(call("get","/api/ranked","a").data.queue.joinedAt,1000);
  assert.equal(call("get","/api/ranked","c").data.queue,null);assert.equal(db.rooms.length,0);
  assert.ok(db.users.every((user)=>user.tokens===0 && !user.gameElo));
});

test("eligibility is rechecked during preparation and pending players cannot queue elsewhere",(t)=> {
  let now=1000;t.mock.method(Date,"now",()=>now);
  const {db,runtime,call}=queueFixture();call("post","/api/ranked/queue","a",{gameId:"yahtzee"});
  const offer=call("post","/api/ranked/queue","b",{gameId:"yahtzee"}).data.proposal;
  assert.equal(call("post","/api/ranked/queue","a",{gameId:"president"}).code,409);
  call("post","/api/ranked/ready","a",{proposalId:offer.id});call("post","/api/ranked/ready","b",{proposalId:offer.id});
  db.users.find((user)=>user.id==="b").active=false;
  now=31000;runtime.tick(now);assert.equal(db.rooms.length,0);
  assert.equal(call("get","/api/ranked","a").data.proposal,null);assert.equal(call("get","/api/ranked","b").data.queue,null);
});

test("entry pools seek maximum capacity before reserving seats and require fresh confirmations",(t)=> {
  let now=1000;t.mock.method(Date,"now",()=>now);
  const {db,runtime,call}=queueFixture({ranked:{games:{yahtzee:{players:2,maximumPlayers:4,fillWaitSeconds:60}}}});
  call("post","/api/ranked/queue","a",{gameId:"yahtzee"});
  let status=call("post","/api/ranked/queue","b",{gameId:"yahtzee"}).data;
  assert.equal(status.proposal,null);assert.equal(status.queue.stage,"filling");assert.equal(status.queue.players,4);
  assert.equal(status.queue.remaining,2);assert.equal(status.queue.fillDeadline,61000);assert.equal(db.rooms.length,0);
  now=20000;status=call("post","/api/ranked/queue","c",{gameId:"yahtzee"}).data;
  assert.equal(status.proposal,null);assert.equal(status.queue.remaining,1);
  now=25000;status=call("post","/api/ranked/queue","d",{gameId:"yahtzee"}).data;
  assert.equal(status.proposal.players.length,4);assert.equal(status.proposal.startsAfter,55000);
  assert.equal(db.rooms.length,0);assert.ok(db.users.every((user)=>user.tokens===0));
  call("post","/api/ranked/queue","e",{gameId:"yahtzee"});
  assert.equal(call("get","/api/ranked","e").data.proposal,null);
  for(const id of ["a","b","c"])call("post","/api/ranked/ready",id,{proposalId:status.proposal.id});
  now=55000;runtime.tick(now);assert.equal(db.rooms.length,0);
  call("post","/api/ranked/ready","d",{proposalId:status.proposal.id});
  assert.equal(db.rooms.length,1);assert.deepEqual(db.rooms[0].players.map((row)=>row.id),["a","b","c","d"]);
  assert.equal(call("get","/api/ranked","e").data.queue.stage,"searching");runtime.tick(now+1);assert.equal(db.rooms.length,1);
});

test("fallback delay starts with a compatible minimum, not time spent waiting alone",(t)=> {
  let now=1000;t.mock.method(Date,"now",()=>now);
  const {db,runtime,call}=queueFixture({ranked:{games:{yahtzee:{players:2,maximumPlayers:4,fillWaitSeconds:60}}}});
  call("post","/api/ranked/queue","a",{gameId:"yahtzee"});
  now=100000;call("get","/api/ranked","a");
  let status=call("post","/api/ranked/queue","b",{gameId:"yahtzee"}).data;
  assert.equal(status.proposal,null);assert.equal(status.queue.fillDeadline,160000);
  now=140000;call("get","/api/ranked","a");status=call("post","/api/ranked/queue","c",{gameId:"yahtzee"}).data;
  assert.equal(status.proposal,null);assert.equal(db.rooms.length,0);
  now=159999;runtime.tick(now);assert.equal(call("get","/api/ranked","a").data.proposal,null);
  now=160000;runtime.tick(now);status=call("get","/api/ranked","a").data;
  assert.equal(status.proposal.players.length,3);assert.equal(status.proposal.startsAfter,190000);
  assert.equal(db.rooms.length,0);for(const id of ["a","b","c"])call("post","/api/ranked/ready",id,{proposalId:status.proposal.id});
  now=190000;runtime.tick(now);assert.equal(db.rooms[0].players.length,3);
});

test("falling below minimum resets the pool clock and unrelated ranks cannot fill it",(t)=> {
  let now=1000;t.mock.method(Date,"now",()=>now);
  const {runtime,call,db}=queueFixture({ranked:{games:{yahtzee:{players:2,maximumPlayers:4,fillWaitSeconds:60}}}});
  db.users.find((user)=>user.id==="d").gameElo={yahtzee:{elo:2600,games:30,wins:10}};
  for(const id of ["a","b","d"])call("post","/api/ranked/queue",id,{gameId:"yahtzee"});
  assert.equal(call("get","/api/ranked","a").data.queue.waiting,2);
  now=40000;call("delete","/api/ranked/queue","b");
  assert.equal(call("get","/api/ranked","a").data.queue.fillDeadline,null);
  now=50000;call("post","/api/ranked/queue","c",{gameId:"yahtzee"});
  assert.equal(call("get","/api/ranked","a").data.queue.fillDeadline,110000);
  now=70000;runtime.tick(now);assert.equal(call("get","/api/ranked","a").data.proposal,null);
  now=110000;runtime.tick(now);assert.equal(call("get","/api/ranked","a").data.proposal.players.length,2);
  assert.equal(call("get","/api/ranked","d").data.proposal,null);
});

test("pool membership is not reserved: departures and setting changes are reflected before offering",(t)=> {
  let now=1000;t.mock.method(Date,"now",()=>now);
  const {db,runtime,call}=queueFixture({ranked:{games:{yahtzee:{players:2,maximumPlayers:4,fillWaitSeconds:60}}}});
  for(const id of ["a","b","c"])call("post","/api/ranked/queue",id,{gameId:"yahtzee"});
  now=30000;call("delete","/api/ranked/queue","c");
  assert.equal(call("get","/api/ranked","a").data.queue.waiting,2);
  db.settings.ranked.games.yahtzee.fillWaitSeconds=90;runtime.tick(now);
  assert.equal(call("get","/api/ranked","a").data.queue.fillDeadline,120000);
  now=61000;runtime.tick(now);assert.equal(call("get","/api/ranked","a").data.proposal,null);
  now=120000;runtime.tick(now);assert.equal(call("get","/api/ranked","a").data.proposal.players.length,2);
});
