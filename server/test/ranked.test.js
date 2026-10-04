import test from "node:test";
import assert from "node:assert/strict";
import { RANKED_GAMES, balancedBeloteSeats, competitivePositions, eloChanges, matchQueue, normalizeRankedConfig, searchRange, settleRanked, validateRankedAction } from "../src/services/ranked.js";
import { awardGameXp, gameProgress, equippedGameTitle, normalizeProgressionConfig, romanMastery } from "../src/services/game-progression.js";
import { createGameState, applyAction } from "../src/games/engines.js";
import { yahtzeeBotAction } from "../src/games/engines/yahtzee.js";
import { presidentBotAction } from "../src/games/engines/president.js";
import { liarsDiceBotAction } from "../src/games/engines/liars-dice.js";
import { velvetRuseBotAction } from "../src/games/engines/velvet-ruse.js";
import { beloteBotAction } from "../src/games/engines/belote.js";
import { tickPokerState } from "../src/games/engines/texas-holdem.js";

test("mastery resets at 101, scales costs, preserves cumulative XP and unlocks",()=> {
  const config=normalizeProgressionConfig({formula:"10*N",maxLevel:101},["yahtzee"]),user={gameXp:{yahtzee:50499},profile:{titleGameId:"yahtzee",titleLevel:100}};
  assert.equal(gameProgress(user,"yahtzee",config).level,100);
  const first=awardGameXp(user,"yahtzee",1,config);
  assert.equal(first.mastery,1);assert.equal(first.level,1);assert.equal(first.levelXp,0);assert.equal(first.highestLevel,101);assert.equal(first.nextXp,20);
  assert.equal(first.previousMastery,0);assert.equal(user.gameXp.yahtzee,50500);
  assert.equal(equippedGameTitle(user,config,["yahtzee"]).title,"Yahtzee I");
  user.gameXp.yahtzee=50500*10+450*5;
  const fourth=gameProgress(user,"yahtzee",config);
  assert.equal(fourth.mastery,4);assert.equal(fourth.level,10);assert.equal(fourth.title,"Brelan IV");assert.equal(fourth.nextXp,500);
  user.gameXp.yahtzee=1000000000000;assert.ok(gameProgress(user,"yahtzee",config).nextXp>0);
  assert.equal(romanMastery(0),"");assert.equal(romanMastery(1),"I");assert.equal(romanMastery(4),"IV");assert.equal(romanMastery(101),"CI");
});
test("ranked defaults preserve six game limits and validate presets",()=> {
  const config=normalizeRankedConfig();assert.deepEqual(Object.keys(config.games),RANKED_GAMES);
  assert.equal(config.games.belote.players,4);assert.equal(config.games.yahtzee.players,2);assert.equal(config.games.belote.preset.gameModifiers.frenchRules,false);
  for(const input of [{k:-1},{maximumRange:50},{games:{belote:{players:3}}},{games:{yahtzee:{players:7}}},{games:{"texas-holdem":{preset:{bigBlind:99}}}},{games:{yahtzee:{preset:{gameModifiers:{rollsPerTurn:999}}}}}]) assert.throws(()=>normalizeRankedConfig(input));
});
test("matchmaking respects both players' expanding ranges, FIFO and fixed sizes",()=> {
  const config={...normalizeRankedConfig().games.yahtzee,players:2};
  const a={userId:"a",elo:1000,joinedAt:0},b={userId:"b",elo:1150,joinedAt:0};
  assert.equal(matchQueue([a,b],config,0).length,0);assert.equal(matchQueue([a,b],config,30000).length,2);
  assert.equal(matchQueue([a,{...b,joinedAt:30000}],config,30000).length,0);
  assert.equal(searchRange(a,config,999999),300);
  assert.equal(matchQueue([a,b,{userId:"c",elo:1020,joinedAt:0}],config,0)[1].userId,"c");
  assert.deepEqual(balancedBeloteSeats([1000,1100,1200,1300].map((elo,i)=>({userId:String(i),elo}))),["3","2","0","1"]);
});
test("Elo uses pairwise mean, exact ties and average team ratings",()=> {
  const duel=eloChanges([{id:"a",elo:1000,position:1},{id:"b",elo:1000,position:2}],32);
  assert.deepEqual(duel.map((r)=>r.delta),[16,-16]);
  assert.deepEqual(eloChanges([{id:"a",elo:1000,position:1},{id:"b",elo:1000,position:1}],32).map((r)=>r.delta),[0,0]);
  const multi=eloChanges([1,2,3,4].map((position)=>({id:String(position),elo:1000,position})),32);
  assert.deepEqual(multi.map((r)=>r.delta),[16,5.33,-5.33,-16]);
  const team=eloChanges([{id:"a",elo:800,team:0,position:1},{id:"b",elo:1200,team:0,position:1},{id:"c",elo:1000,team:1,position:3},{id:"d",elo:1000,team:1,position:3}],32,true);
  assert.deepEqual(team.map((r)=>r.delta),[16,16,-16,-16]);
});
test("settlement is one-time, durable-ready, independent of XP and penalizes only offenders",()=> {
  const users=[{id:"a",gameXp:{yahtzee:900}},{id:"b",gameXp:{yahtzee:100}}];
  const room={gameId:"yahtzee",state:{finished:true,scores:{a:{chance:30},b:{chance:30}}},ranked:{matchId:"m",roster:[{id:"a"},{id:"b"}],config:normalizeRankedConfig().games.yahtzee,forfeits:{}}},history={};
  const rewards=settleRanked(room,users,history);assert.deepEqual(rewards.map((r)=>r.delta),[0,0]);assert.equal(users[0].gameElo.yahtzee.wins,1);
  assert.equal(users[0].gameXp.yahtzee,900);assert.equal(history.ranked.matchId,"m");assert.equal(history.ranked.participants.length,2);
  assert.deepEqual(settleRanked(room,users,history),[]);assert.equal(users[0].gameElo.yahtzee.games,1);
  const abandoned=structuredClone(room);abandoned.ranked.settled=false;abandoned.ranked.forfeits={a:"afk"};
  const rows=settleRanked(abandoned,users,{});assert.equal(rows[0].delta,-31);assert.equal(rows[0].penalty,15);assert.equal(rows[1].delta,16);
  const cancelled=structuredClone(room);cancelled.ranked.settled=false;cancelled.ranked.cancelled=true;assert.deepEqual(settleRanked(cancelled,users,{}),[]);
});
test("competitive rankings preserve eliminated players and simultaneous poker ties",()=> {
  const roster=["a","b","c","d"].map((id)=>({id}));
  const liar={gameId:"liars-dice",state:{finished:true,diceCounts:{a:0,b:1,c:0,d:0},eliminationOrder:["c","a","d"]},ranked:{roster,forfeits:{}}};
  assert.deepEqual(competitivePositions(liar).map((r)=>r.position),[3,1,4,2]);
  const poker={gameId:"texas-holdem",state:{finished:true,stacks:{a:0,b:4000,c:0,d:0},eliminationGroups:[["a","c"],["d"]]},ranked:{roster,forfeits:{}}};
  assert.deepEqual(competitivePositions(poker).map((r)=>r.position),[3,1,3,2]);
});
test("ranked action validation rejects fabricated categories and malformed bets",()=> {
  const state=createGameState("yahtzee",[{id:"a"},{id:"b"}]);
  assert.throws(()=>validateRankedAction(state,"a",{type:"score",category:"extra"}));
  assert.throws(()=>validateRankedAction(state,"a",{type:"roll",keepIndexes:[99]}));
  assert.throws(()=>validateRankedAction(state,"a",{type:"roll",automatic:true}));
  assert.throws(()=>validateRankedAction({gameId:"liars-dice"},"a",{type:"bid",quantity:Infinity,face:6}));
  validateRankedAction(state,"a",{type:"roll",keepIndexes:[]});
});

test("all six real engines produce a complete competitive ranking without bot seats",()=> {
  const actions={yahtzee:yahtzeeBotAction,president:presidentBotAction,"liars-dice":liarsDiceBotAction,"velvet-ruse":velvetRuseBotAction,belote:beloteBotAction};
  for (const gameId of RANKED_GAMES) {
    const config=normalizeRankedConfig().games[gameId],users=Array.from({length:config.players},(_,i)=>({id:`player-${i}`,pseudo:`Player ${i}`}));
    const state=createGameState(gameId,users,{gameModifiers:config.preset.gameModifiers,stake:config.preset.stake,pokerBlinds:{bigBlind:100,smallBlind:50,maximumBet:1000}});
    let turns=0;
    while (!state.finished && turns++<20000) {
      if (gameId==="texas-holdem" && state.nextHandAt) {tickPokerState(state,state.nextHandAt+1);continue;}
      const actor=state.players[state.currentPlayerIndex];
      const action=gameId==="texas-holdem" ? {type:"all-in"} : actions[gameId](state,actor);
      validateRankedAction(state,actor.id,action);applyAction(state,actor.id,action);
    }
    assert.equal(state.finished,true,gameId);
    const room={gameId,state,ranked:{matchId:gameId,config,roster:users.map((p,i)=>({...p,...(gameId==="belote"?{team:i%2}:{})})),forfeits:{}}};
    const result=settleRanked(room,users,{});
    assert.equal(result.length,config.players,gameId);assert.ok(result.every((r)=>Number.isFinite(r.delta)&&r.position>=1&&r.position<=config.players),gameId);
    for (const winner of state.winners) assert.equal(result.find((r)=>r.userId===winner).position,1,gameId);
  }
});
