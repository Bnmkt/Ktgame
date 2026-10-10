import test from "node:test";
import assert from "node:assert/strict";
import { competitiveFor, matchmakingElo, normalizeRankedConfig, rankedResultFor, settleRanked } from "../src/services/ranked.js";
import { placementElo, placementEvidence, placementStatus } from "../src/services/ranked-placement.js";
import { createRankedRuntime } from "../src/services/ranked-runtime.js";
import { games } from "../src/games/shared.js";

const config=normalizeRankedConfig().games.yahtzee;
function play(user,index,{won=true,tied=false,opponentElo=1200,reason, cancelled=false}={}) {
  const opponent={id:'opponent',gameElo:{yahtzee:{elo:opponentElo,games:30,wins:10}}};
  const room={gameId:'yahtzee',state:{finished:true,scores:{player:{chance:won?30:5},opponent:{chance:tied?30:won?5:30}}},ranked:{matchId:`placement-${index}`,roster:[{id:'player'},{id:'opponent'}],config,forfeits:reason?{player:reason}:{},cancelled}};
  const history={finishedAt:'2026-10-06T12:00:00Z'};
  return {room,history,results:settleRanked(room,[user,opponent],history)};
}

test('five placements freeze official Elo, adapt hidden matching and reveal the final rank once',()=> {
  const user={id:'player'};
  assert.equal(competitiveFor(user,'yahtzee',config,true).rank.id,'unranked');
  assert.equal(competitiveFor(user,'yahtzee',config,true).elo,undefined);
  for(let n=1;n<=4;n++) {
    const {results}=play(user,n);
    assert.equal(user.gameElo.yahtzee.elo,1000);assert.equal(results[0].delta,0);
    assert.equal(results[0].placement.games,n);assert.equal(results[0].afterRank.id,'unranked');
    const projection=rankedResultFor(results[0],'player',config.ranks);
    assert.equal(projection.before,undefined);assert.equal(projection.after,undefined);
    assert.equal(competitiveFor(user,'yahtzee',config,true).elo,undefined);
  }
  assert.ok(matchmakingElo(user,'yahtzee',config)>1000);
  const {room,history,results}=play(user,5);
  assert.equal(results[0].placement.completed,true);assert.equal(user.gameElo.yahtzee.games,5);
  assert.equal(user.gameElo.yahtzee.elo,1616.56);assert.equal(results[0].afterRank.id,'platinum');
  const before=structuredClone(user);assert.deepEqual(settleRanked(room,[user],history),[]);assert.deepEqual(user,before);
  assert.equal(competitiveFor(user,'yahtzee',config,true).elo,1616.56);
  assert.equal(competitiveFor(user,'president',normalizeRankedConfig().games.president,true).placement.games,0);
});

test('losses, ties, opponent strength and floors affect the final placement, not intermediate Elo',()=> {
  const lost={id:'player'};
  for(let n=1;n<=5;n++){play(lost,n,{won:false});if(n<5)assert.equal(lost.gameElo.yahtzee.elo,1000);}
  assert.equal(lost.gameElo.yahtzee.elo,783.44);
  const ties={id:'player'};for(let n=1;n<=5;n++)play(ties,n,{tied:true});
  assert.equal(ties.gameElo.yahtzee.elo,1200);assert.equal(ties.gameElo.yahtzee.placement.draws,5);
  assert.equal(placementElo({games:5,score:0,opponentElo:3000},{...config,minimumElo:800}),800);
  assert.ok(placementElo({games:5,score:4,opponentElo:7500},config)>placementElo({games:5,score:4,opponentElo:3500},config));
});

test('forfeits count as losses without Elo penalties; cancelled games and durable duplicates do not count',()=> {
  const user={id:'player'},row=play(user,1,{reason:'afk'}).results[0];
  assert.equal(row.delta,0);assert.equal(row.penalty,0);assert.equal(row.placement.losses,1);
  const before=structuredClone(user);assert.deepEqual(play(user,2,{cancelled:true}).results,[]);assert.deepEqual(user,before);
  const replay=play({id:'player'},3),room={...replay.room,ranked:{...replay.room.ranked,settled:false}};
  assert.deepEqual(settleRanked(room,[user],{}, {results:replay.results}),[]);assert.deepEqual(user,before);
  assert.equal(placementStatus({games:30},config).completed,true);
  assert.equal(placementStatus({games:0},{...config,placementGames:0}).completed,true);
});

test('multiplayer and team placements use final ordering and exclude teammates from opponents',()=> {
  const players=[{id:'a',elo:1000,position:1,team:0,reason:'result'},{id:'b',elo:3000,position:1,team:0},{id:'c',elo:1400,position:3,team:1},{id:'d',elo:1800,position:3,team:1}];
  assert.equal(placementEvidence(players[0],players,'teams',config).score,1);
  assert.equal(placementEvidence(players[0],players,'teams',config).opponentElo,1600);
  assert.equal(placementEvidence({...players[0],position:2},players,'ranking',config).score,2/3);
  assert.equal(placementEvidence({...players[0],reason:'abandon'},players,'teams',config).score,0);
});

test('cancelled settlements do not reveal or advance a first placement',()=> {
  const user={id:'player'},other={id:'opponent'};
  const room={gameId:'yahtzee',state:{finished:true,scores:{player:{chance:5},opponent:{chance:30}}},ranked:{matchId:'cancelled-placement',roster:[{id:'player'},{id:'opponent'}],config:{...config,abandonPolicy:'cancel'},forfeits:{player:'abandon'}}};
  const results=settleRanked(room,[user,other],{});
  assert.equal(user.gameElo,undefined);assert.equal(other.gameElo,undefined);
  for(const row of results) {
    const projection=rankedResultFor(row,row.userId,config.ranks);
    assert.equal(projection.cancelled,true);assert.equal(projection.placement.games,0);
    assert.equal(projection.placement.completed,false);assert.equal(projection.afterRank.id,'unranked');
    assert.equal(projection.after,undefined);assert.equal(projection.delta,undefined);
  }
});

test('old unfinished placements recover actual ledger results without rewinding stored Elo',()=> {
  const db={users:[{id:'player',gameElo:{yahtzee:{elo:950,games:2,wins:1}}}],rooms:[],settings:{}};
  const rows=[{matchId:'old-2',gameId:'yahtzee',format:'ranking'},{matchId:'old-1',gameId:'yahtzee',format:'ranking'}];
  createRankedRuntime({app:{get(){},post(){},put(){},delete(){}},readDb:()=>db,updateDb:(fn)=>fn(db),games:()=>games,platformSettings:()=>({}),rankedRecent:()=>rows,
    rankedSettlement:(id)=>({results:[{userId:'player',before:1000,position:id==='old-1'?1:2},{userId:'opponent',before:1400,position:id==='old-1'?2:1}]})});
  assert.equal(db.users[0].gameElo.yahtzee.elo,950);
  assert.equal(db.users[0].gameElo.yahtzee.placement.games,2);
  assert.equal(db.users[0].gameElo.yahtzee.placement.opponentElo,2800);
  assert.equal(db.users[0].gameElo.yahtzee.placement.score,1);
});
