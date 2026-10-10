import test from "node:test";
import assert from "node:assert/strict";
import { calculateElo, coefficientFor, normalizeEloConfig } from "../src/services/ranked-elo.js";
import { normalizeRankedConfig, settleRanked } from "../src/services/ranked.js";

const stable = { provisional: [] };
const duel = (opponent=1000) => [{id:"a",elo:1000,position:1,games:30},{id:"b",elo:opponent,position:2,games:30}];
const conserved = (rows) => assert.equal(rows.reduce((sum,row)=>sum+Math.round(row.delta*100),0),0);

test("classical duels reward upsets and discount expected victories",()=> {
  assert.deepEqual(calculateElo(duel(),stable).map((row)=>row.delta),[16,-16]);
  const strong=calculateElo(duel(1400),stable),weak=calculateElo(duel(600),stable);
  assert.equal(strong[0].delta,29.09);assert.equal(weak[0].delta,2.91);
  conserved(strong);conserved(weak);
  assert.ok(calculateElo(duel(1400),{...stable,d:800})[0].delta<strong[0].delta);
});
test("provisional thresholds use the upcoming match and mixed K is conserved",()=> {
  const config=normalizeEloConfig();
  for (const [games,k] of [[0,48],[9,48],[10,40],[24,40],[25,32],[100,32]]) assert.equal(coefficientFor(games,config),k);
  assert.deepEqual(calculateElo(duel().map((row)=>({...row,games:0}))).map((row)=>row.delta),[24,-24]);
  const mixed=calculateElo(duel().map((row,index)=>({...row,games:index?30:0})));
  assert.deepEqual(mixed.map((row)=>row.delta),[20,-20]);conserved(mixed);
  assert.equal(coefficientFor(0,normalizeEloConfig({provisional:[],k:20})),20);
});
test("multiplayer uses the configured gamma, ties and a balanced cent rounding",()=> {
  const players=[1,2,3,4].map((position)=>({id:String(position),elo:1000,position,games:30}));
  const rows=calculateElo(players,stable);
  assert.deepEqual(rows.map((row)=>row.delta),[21.06,7.02,-7.02,-21.06]);conserved(rows);
  assert.deepEqual(calculateElo(players,{...stable,gamma:1}).map((row)=>row.delta),[16,5.33,-5.33,-16]);
  assert.deepEqual(calculateElo(duel(1400).map((row)=>({...row,position:1})),{...stable,ties:"ignore"}).map((row)=>row.delta),[0,0]);
  const tie=calculateElo(duel(1400).map((row)=>({...row,position:1})),stable);
  assert.equal(tie[0].delta,13.09);conserved(tie);
  const winner=calculateElo(players,{...stable,calculation:"winner-all"});
  assert.equal(winner[1].delta,winner[3].delta);conserved(winner);
});
test("team expectations use team average and never compare teammates",()=> {
  const players=[{id:"a",elo:800,team:0,position:1},{id:"b",elo:1200,team:0,position:1},{id:"c",elo:1000,team:1,position:3},{id:"d",elo:1000,team:1,position:3}];
  const rows=calculateElo(players,{...stable,calculation:"teams"});
  assert.deepEqual(rows.map((row)=>row.delta),[14.04,14.04,-14.04,-14.04]);conserved(rows);
  assert.deepEqual(calculateElo(players,{...stable,calculation:"auto"},"belote").map((row)=>row.delta),rows.map((row)=>row.delta));
  assert.ok(calculateElo(players.map((row)=>({...row,elo:row.team?1400:row.elo})),{...stable,calculation:"teams"})[0].delta>rows[0].delta);
  assert.throws(()=>calculateElo(players.map((row,index)=>index?row:{...row,position:2}),{calculation:"teams"}));
});
test("caps, floors and exit policies do not create or destroy Elo",()=> {
  const abandoned=duel().map((row,index)=>index?row:{...row,position:2,reason:"abandon"});abandoned[1].position=1;
  const penalty=calculateElo(abandoned,stable);assert.deepEqual(penalty.map((row)=>row.delta),[-36,36]);conserved(penalty);
  assert.deepEqual(calculateElo(abandoned,{...stable,abandonPolicy:"rank"}).map((row)=>row.delta),[-16,16]);
  const cancelled=calculateElo(abandoned,{abandonPolicy:"cancel"});assert.ok(cancelled.every((row)=>row.cancelled&&row.delta===0));
  const capped=calculateElo(abandoned,{maximumVariation:10});assert.deepEqual(capped.map((row)=>row.delta),[-10,10]);conserved(capped);
  const floor=calculateElo(abandoned,{minimumElo:995});assert.deepEqual(floor.map((row)=>row.delta),[-5,5]);conserved(floor);
  const disconnect=calculateElo(abandoned.map((row)=>({...row,reason:row.reason?"disconnect":"result"})),{...stable,disconnectPolicy:"cancel"});assert.ok(disconnect.every((row)=>row.cancelled));
  assert.deepEqual(calculateElo(abandoned.map((row,index)=>({...row,elo:index?1000:400})),{minimumElo:500}).map((row)=>row.delta),[0,0]);
});
test("many mixed, tied and bounded rooms remain finite and zero-sum",()=> {
  for(let n=2;n<=30;n++) for(let seed=0;seed<12;seed++) {
    const rows=calculateElo(Array.from({length:n},(_,i)=>({id:String(i),elo:500+(i*237+seed*41)%2400,games:i*3,position:1+(i*7+seed)%n})),{maximumVariation:17.13,minimumElo:490});
    conserved(rows);assert.ok(rows.every((row)=>Number.isFinite(row.delta)&&Math.abs(row.delta)<=17.13&&row.after>=490));
  }
});
test("invalid formulas and injected client rating fields are not trusted",()=> {
  for (const input of [{d:0},{gamma:NaN},{calculation:"javascript"},{minimumElo:2000},{provisional:[{through:25,k:40},{through:10,k:48}]},{maximumVariation:-1},{ties:"win"}]) assert.throws(()=>normalizeEloConfig(input));
  assert.throws(()=>calculateElo([...duel(),duel()[0]]));
  assert.throws(()=>calculateElo(duel().map((row)=>({...row,elo:Infinity}))));
  const injected=calculateElo(duel().map((row)=>({...row,delta:999999,after:999999})),stable);
  assert.equal(injected[0].delta,16);assert.equal(injected[0].after,1016);
  assert.equal(normalizeRankedConfig({d:800,gamma:.5,provisional:[]}).games.yahtzee.d,800);
  assert.equal(normalizeRankedConfig({d:800,games:{yahtzee:{d:200}}}).games.yahtzee.d,200);
});
test("a persistent receipt prevents replay even when room flags are lost",()=> {
  const users=[{id:"a"},{id:"b"}],room={gameId:"yahtzee",state:{finished:true,scores:{a:{chance:30},b:{chance:5}}},ranked:{matchId:"match-1",roster:[{id:"a"},{id:"b"}],config:normalizeRankedConfig().games.yahtzee}},history={finishedAt:"2026-10-05T10:00:00Z"};
  const results=settleRanked(room,users,history);assert.equal(results[0].playerCount,2);assert.equal(results[0].averageElo,1000);assert.equal(results[0].matchId,"match-1");
  const snapshot=structuredClone(users);delete room.ranked.settled;delete room.ranked.results;
  assert.deepEqual(settleRanked(room,users,{}, {results}),[]);assert.deepEqual(users,snapshot);assert.deepEqual(room.ranked.results,results);
});
