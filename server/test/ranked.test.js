import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RANKS, RANKED_GAMES, balancedBeloteSeats, competitiveFor, competitivePositions, eloChanges, equippedRankedBadge, matchQueue, normalizeRankedConfig, publicRanked, queueGroupFor, rankFor, rankProgress, rankedResultFor, rankedTurnTiming, searchRange, settleRanked, validateRankedAction } from "../src/services/ranked.js";
import { awardGameXp, gameProgress, equippedGameTitle, normalizeProgressionConfig, romanMastery } from "../src/services/game-progression.js";
import { createGameState, applyAction } from "../src/games/engines.js";
import { yahtzeeBotAction } from "../src/games/engines/yahtzee.js";
import { presidentBotAction } from "../src/games/engines/president.js";
import { liarsDiceBotAction } from "../src/games/engines/liars-dice.js";
import { velvetRuseBotAction } from "../src/games/engines/velvet-ruse.js";
import { beloteBotAction } from "../src/games/engines/belote.js";
import { tickPokerState } from "../src/games/engines/texas-holdem.js";
import { midnightContractOffers, midnightDiceBotAction, resumeMidnightAfterDeparture } from "../src/games/engines/midnight-dice.js";

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
test("ranked defaults preserve seven game limits and validate presets",()=> {
  const config=normalizeRankedConfig();assert.deepEqual(Object.keys(config.games),RANKED_GAMES);
  assert.equal(config.games.belote.players,4);assert.equal(config.games.yahtzee.players,2);assert.equal(config.games.belote.preset.gameModifiers.frenchRules,false);
  assert.equal(config.games.yahtzee.preset.stake,0);
  for(const input of [{k:-1},{maximumWindow:1},{initialWindow:4},{windowStep:3},{readyWaitSeconds:29},{readyWaitSeconds:90,readyTimeoutSeconds:90},{games:{belote:{players:3}}},{games:{yahtzee:{players:7}}},{games:{"texas-holdem":{preset:{bigBlind:99}}}},{games:{yahtzee:{preset:{gameModifiers:{rollsPerTurn:999}}}}}]) assert.throws(()=>normalizeRankedConfig(input));
});
test("variable-sized matchmaking prefers full groups, then falls back after the fill delay",()=> {
  const rules={...normalizeRankedConfig().games.yahtzee,players:2,maximumPlayers:4,fillWaitSeconds:60};
  const entries=["a","b","c","d"].map((userId)=>({userId,elo:1000,joinedAt:0,fillStartedAt:1000}));
  assert.equal(matchQueue(entries.slice(0,2),rules,60999).length,0);
  assert.equal(matchQueue(entries.slice(0,3),rules,61000).length,3);
  assert.equal(matchQueue(entries,rules,1000).length,4);
  assert.equal(matchQueue(entries.slice(0,2),{...rules,fillWaitSeconds:0},1000).length,2);
  const distant=entries.map((row,index)=>({...row,userId:`far-${index}`,elo:2600,joinedAt:50000,fillStartedAt:50000}));
  const chosen=matchQueue([...entries.slice(0,2),...distant],rules,61000);
  assert.equal(chosen.length,4);assert.ok(chosen.every((row)=>row.userId.startsWith("far-")));
});

test("matchmaking respects both players' expanding ranges, FIFO and fixed sizes",()=> {
  const config={...normalizeRankedConfig().games.yahtzee,players:2};
  const a={userId:"a",elo:1000,joinedAt:0},b={userId:"b",elo:1250,joinedAt:0};
  assert.equal(matchQueue([a,b],config,0).length,0);assert.equal(matchQueue([a,b],config,30000).length,2);
  assert.equal(matchQueue([a,{...b,joinedAt:30000}],config,30000).length,0);
  assert.equal(searchRange(a,config,999999),4);
  assert.equal(matchQueue([a,b,{userId:"c",elo:1020,joinedAt:0}],config,0)[1].userId,"c");
  assert.deepEqual(balancedBeloteSeats([1000,1100,1200,1300].map((elo,i)=>({userId:String(i),elo}))),["3","2","0","1"]);
});

test("ranks cover exact tier and division boundaries, private Elo and custom tiers",()=> {
  for(const [elo,name] of [[-50,"Bois"],[499.99,"Bois"],[500,"Cuivre"],[600,"Bronze"],[800,"Argent"],[1100,"Or"],[1400,"Platine"],[1700,"Diamant"],[2000,"Maître"],[2300,"Grand Maître"],[2600,"Légende"]]) assert.equal(rankFor(elo).name,name);
  assert.equal(rankFor(1100).label,"Or I");assert.equal(rankFor(1200).label,"Or II");assert.equal(rankFor(1300).label,"Or III");
  assert.equal(rankFor(600+200/3).label,"Bronze II");assert.equal(rankFor(2300).division,"");assert.equal(rankFor(2600).division,"");
  assert.equal(rankProgress(1250).progress,50);assert.equal(rankProgress(1250).next,"Or III");assert.equal(rankProgress(1399).next,"Platine I");assert.equal(rankProgress(3000).maximum,null);
  const config=normalizeRankedConfig().games.yahtzee;
  assert.equal(competitiveFor({gameElo:{yahtzee:{elo:1250,games:5,wins:1}}},"yahtzee",config).elo,undefined);
  assert.equal(competitiveFor({gameElo:{yahtzee:{elo:1250,games:5,wins:1}}},"yahtzee",config,true).elo,1250);
  const ranks=DEFAULT_RANKS.map((row)=>row.id==="platinum"?{...row,name:"Émeraude"}:row);
  assert.equal(rankFor(1400,normalizeRankedConfig({ranks}).ranks).name,"Émeraude");
  for(const input of [[],[{id:"a",name:"A",minimum:1,divisions:3},{id:"b",name:"B",minimum:2,divisions:1}],DEFAULT_RANKS.map((row)=>({...row,id:"same"})),DEFAULT_RANKS.map((row)=>row.id==="legend"?{...row,divisions:3}:row)])assert.throws(()=>normalizeRankedConfig({ranks:input}));
});

test("nine-division window is centered, expands gradually and favors close ranks",()=> {
  const config=normalizeRankedConfig().games.yahtzee,a={userId:"a",elo:1250,joinedAt:0};
  const near={userId:"near",elo:1260,joinedAt:0},edge={userId:"edge",elo:1650,joinedAt:0},outside={userId:"outside",elo:1750,joinedAt:0};
  assert.equal(searchRange(a,config,0),1);assert.equal(searchRange(a,config,90000),4);
  assert.equal(matchQueue([a,edge],config,0).length,0);assert.equal(matchQueue([a,edge],config,90000).length,2);
  assert.equal(matchQueue([a,outside],config,90000).length,0);
  assert.equal(matchQueue([a,edge,near],config,90000)[1].userId,"near");
});

test("placements use the maximum window immediately, even against a narrower ranked search",()=> {
  const config=normalizeRankedConfig().games.yahtzee;
  const placement={userId:"placement",elo:1000,joinedAt:0,placementPending:true};
  const ranked={userId:"ranked",elo:1250,joinedAt:0};
  assert.equal(searchRange(placement,config,0),4);assert.equal(searchRange(ranked,config,0),1);
  assert.equal(matchQueue([placement,ranked],config,0).length,2);
  assert.equal(matchQueue([{...placement,placementPending:false},ranked],config,0).length,0);
  assert.equal(matchQueue([placement,{...ranked,placementPending:true}],config,0).length,2);
});

test("placements can relocate after the widening delay without changing their estimated Elo",()=> {
  const config=normalizeRankedConfig().games.yahtzee;
  const placement={userId:"placement",elo:1000,joinedAt:0,placementPending:true};
  const ranked={userId:"ranked",elo:2600,joinedAt:0};
  assert.equal(matchQueue([placement,ranked],config,29999).length,0);
  assert.deepEqual(matchQueue([placement,ranked],config,30000).map((row)=>row.userId),["placement","ranked"]);
  assert.equal(placement.elo,1000);
  assert.equal(matchQueue([ranked,{...placement,joinedAt:30000}],config,30000).length,0);
  assert.equal(matchQueue([{...placement,placementPending:false},ranked],config,90000).length,0);
  assert.equal(matchQueue([placement,{...ranked,placementPending:true}],config,30000).length,2);
  assert.equal(matchQueue([placement,ranked],{...config,wideningSeconds:60},59999).length,0);
  assert.equal(matchQueue([placement,ranked],{...config,wideningSeconds:60},60000).length,2);
});

test("placement fallback favors close opponents and never bypasses limits between ranked players",()=> {
  const config=normalizeRankedConfig().games.yahtzee;
  const placement={userId:"placement",elo:1000,joinedAt:0,placementPending:true};
  const near={userId:"near",elo:1250,joinedAt:0},far={userId:"far",elo:2600,joinedAt:0};
  assert.deepEqual(queueGroupFor(placement,[placement,far,near],{...config,maximumPlayers:3},90000).map((row)=>row.userId),["placement","near"]);
  const distant={userId:"distant",elo:2000,joinedAt:0};
  assert.equal(matchQueue([placement,far,distant],{...config,players:3,maximumPlayers:3},30000).length,0);
  const closeToFar={userId:"close-to-far",elo:2620,joinedAt:0};
  assert.deepEqual(queueGroupFor(placement,[placement,far,closeToFar],{...config,players:3,maximumPlayers:3},30000).map((row)=>row.userId),["placement","far","close-to-far"]);
});

test("custom division counts progress in ascending order and lead to the next tier",()=> {
  const ranks=normalizeRankedConfig({ranks:[{id:"first",name:"Premier",minimum:0,divisions:4},{id:"top",name:"Sommet",minimum:400,divisions:1}]}).ranks;
  assert.deepEqual([0,100,200,300].map((elo)=>rankFor(elo,ranks).division),["I","II","III","IV"]);
  assert.deepEqual([0,100,200,300,400].map((elo)=>rankFor(elo,ranks).order),[0,1,2,3,4]);
  assert.equal(rankProgress(50,ranks).next,"Premier II");assert.equal(rankProgress(350,ranks).next,"Sommet");
});

test("rank insignia persist in the catalog and projections without changing ratings",()=> {
  const legacy=DEFAULT_RANKS.map(({insignia,...row})=>row);
  assert.ok(normalizeRankedConfig({ranks:legacy}).ranks.every((row)=>row.insignia==="shield"));
  const ranks=DEFAULT_RANKS.map((row)=>row.id==="silver"?{...row,insignia:"crown"}:row);
  const config=normalizeRankedConfig({ranks}).games.yahtzee;
  assert.equal(config.ranks.find((row)=>row.id==="silver").insignia,"crown");
  const user={gameElo:{yahtzee:{elo:1000,games:5,wins:2}}};
  assert.equal(competitiveFor(user,"yahtzee",config).rank.insignia,"crown");
  assert.equal(competitiveFor(user,"yahtzee",config).elo,undefined);
  assert.equal(competitiveFor(user,"yahtzee",config,true).elo,1000);
  assert.equal(rankProgress(1000,ranks).insignia,"crown");
  assert.equal(rankedResultFor({userId:"a",before:1000,after:1016},"b",ranks).afterRank.insignia,"crown");
  assert.equal(rankFor(1000,legacy).insignia,"shield");
  const imageRanks=DEFAULT_RANKS.map((row)=>({...row,insigniaImage:"a".repeat(64)}));
  assert.equal(rankFor(1000,normalizeRankedConfig({ranks:imageRanks}).ranks).insigniaImage,"a".repeat(64));
  for(const insigniaImage of ["data:image/png;base64,secret", "../file.png", "https://example.com/image.png"]) assert.throws(()=>normalizeRankedConfig({ranks:DEFAULT_RANKS.map((row)=>({...row,insigniaImage}))}),/Image d’insigne invalide/);
  for(const insignia of ["<svg onload='alert(1)'>", "javascript:alert(1)", "https://example.com/icon.svg", "x".repeat(81)]) {
    assert.throws(()=>normalizeRankedConfig({ranks:DEFAULT_RANKS.map((row)=>({...row,insignia}))}),/Insigne invalide/);
  }
});

test("room and history projections never reveal another player's Elo",()=> {
  const results=[{userId:"a",before:1099,after:1115,delta:16,position:1},{userId:"b",before:1200,after:1184,delta:-16,position:2}];
  const room={ranked:{config:normalizeRankedConfig().games.yahtzee,matchId:"m",roster:[{id:"a",rank:rankFor(1099)}],results,offline:{a:1}}};
  const own=publicRanked(room,"a");assert.equal(own.results[0].delta,16);assert.equal(own.results[1].after,undefined);assert.equal(own.offline,undefined);
  assert.equal(publicRanked(room,"spectator").results[0].before,undefined);
  assert.equal(rankedResultFor(results[1],"a").delta,undefined);
});

test("division-specific insignia override the tier and fall back to the common asset",()=> {
  const common="a".repeat(64),individual="b".repeat(64);
  const ranks=normalizeRankedConfig({ranks:DEFAULT_RANKS.map((row)=>row.id==="silver"?{
    ...row,insignia:"crown",insigniaImage:common,divisionInsignia:{
      III:{insigniaImage:individual},II:{insignia:"gem"}
    }
  }:row)}).ranks;
  assert.equal(rankFor(850,ranks).division,"I");assert.equal(rankFor(850,ranks).insigniaImage,common);
  assert.equal(rankFor(950,ranks).division,"II");assert.equal(rankFor(950,ranks).insignia,"gem");assert.equal(rankFor(950,ranks).insigniaImage,"");
  assert.equal(rankFor(1000,ranks).division,"III");assert.equal(rankFor(1000,ranks).insigniaImage,individual);assert.equal(rankFor(1000,ranks).insignia,"crown");
  assert.equal(rankProgress(1000,ranks).insigniaImage,individual);
  const reset=ranks.map((row)=>row.id==="silver"?{...row,divisionInsignia:{}}:row);
  assert.equal(rankFor(1000,reset).insigniaImage,common);
  for(const divisionInsignia of [{IV:{insignia:"crown"}},{I:null},{I:{insigniaImage:"../x"}},[],{"__proto__":null,"invalid":{insignia:"shield"}}]) {
    assert.throws(()=>normalizeRankedConfig({ranks:DEFAULT_RANKS.map((row)=>row.id==="silver"?{...row,divisionInsignia}:row)}));
  }
  assert.throws(()=>normalizeRankedConfig({ranks:DEFAULT_RANKS.map((row)=>row.id==="legend"?{...row,divisionInsignia:{I:{insignia:"crown"}}}:row)}));
});
test("Elo uses pairwise mean, exact ties and average team ratings",()=> {
  const duel=eloChanges([{id:"a",elo:1000,position:1},{id:"b",elo:1000,position:2}],32);
  assert.deepEqual(duel.map((r)=>r.delta),[16,-16]);
  assert.deepEqual(eloChanges([{id:"a",elo:1000,position:1},{id:"b",elo:1000,position:1}],32).map((r)=>r.delta),[0,0]);
  const multi=eloChanges([1,2,3,4].map((position)=>({id:String(position),elo:1000,position})),32);
  assert.deepEqual(multi.map((r)=>r.delta),[16,5.33,-5.33,-16]);
  const team=eloChanges([{id:"a",elo:800,team:0,position:1},{id:"b",elo:1200,team:0,position:1},{id:"c",elo:1000,team:1,position:3},{id:"d",elo:1000,team:1,position:3}],32,true);
  assert.deepEqual(team.map((r)=>r.delta),[10.67,10.67,-10.67,-10.67]);
});
test("settlement is one-time, durable-ready, independent of XP and penalizes only offenders",()=> {
  const users=[{id:"a",gameXp:{yahtzee:900}},{id:"b",gameXp:{yahtzee:100}}];
  const room={gameId:"yahtzee",state:{finished:true,scores:{a:{chance:30},b:{chance:30}}},ranked:{matchId:"m",roster:[{id:"a"},{id:"b"}],config:normalizeRankedConfig({placementGames:0}).games.yahtzee,forfeits:{}}},history={};
  const rewards=settleRanked(room,users,history);assert.deepEqual(rewards.map((r)=>r.delta),[0,0]);assert.equal(users[0].gameElo.yahtzee.wins,1);
  assert.equal(users[0].gameXp.yahtzee,900);assert.equal(history.ranked.matchId,"m");assert.equal(history.ranked.participants.length,2);
  assert.deepEqual(settleRanked(room,users,history),[]);assert.equal(users[0].gameElo.yahtzee.games,1);
  const abandoned=structuredClone(room);abandoned.ranked.settled=false;abandoned.ranked.forfeits={a:"afk"};
  const rows=settleRanked(abandoned,users,{});assert.equal(rows[0].delta,-39);assert.equal(rows[0].penalty,15);assert.equal(rows[1].delta,39);
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

test("all seven real engines produce a complete competitive ranking without bot seats",()=> {
  const actions={yahtzee:yahtzeeBotAction,president:presidentBotAction,"liars-dice":liarsDiceBotAction,"velvet-ruse":velvetRuseBotAction,belote:beloteBotAction,"midnight-dice":midnightDiceBotAction};
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

test("equipped ranked badge follows the current division without exposing Elo",()=>{
  const config=normalizeRankedConfig(),user={profile:{rankedBadgeGameId:"yahtzee"},gameElo:{yahtzee:{elo:1250,games:5,wins:2}}};
  assert.equal(equippedRankedBadge(user,config).rank.label,"Or II");
  assert.equal(equippedRankedBadge(user,config).rank.elo,undefined);
  user.gameElo.yahtzee.elo=1350;assert.equal(equippedRankedBadge(user,config).rank.label,"Or III");
  user.profile.rankedBadgeGameId="";assert.equal(equippedRankedBadge(user,config),null);
  user.profile.rankedBadgeGameId="blackjack";assert.equal(equippedRankedBadge(user,config),null);
});
test("public turn clock follows server deadlines, reconnect grace, pauses and poker",()=>{
  const config=normalizeRankedConfig().games.yahtzee;
  const room={gameId:"yahtzee",state:{players:[{id:"a"}],currentPlayerIndex:0},ranked:{config,actionAt:1000,offline:{}}};
  assert.deepEqual(rankedTurnTiming(room,2000),{actorId:"a",deadline:181000,serverTime:2000,type:"turn"});
  room.ranked.offline.a=2000;assert.equal(rankedTurnTiming(room).deadline,122000);assert.equal(rankedTurnTiming(room).type,"reconnect");
  room.pacing={kind:"round-results"};assert.equal(rankedTurnTiming(room),null);room.pacing=null;
  room.gameId="texas-holdem";room.state.turnDeadline=5000;room.ranked.offline={};assert.equal(rankedTurnTiming(room).deadline,5000);
  room.state.nextHandAt=6000;assert.equal(rankedTurnTiming(room),null);delete room.state.nextHandAt;
  room.state.finished=true;assert.equal(rankedTurnTiming(room),null);
});
test("queue progress counts a mutually compatible group rather than every online candidate",()=>{
  const config={...normalizeRankedConfig().games.yahtzee,players:4,maximumPlayers:4,initialWindow:9};
  const entries=[{userId:"a",elo:1250,joinedAt:0},{userId:"b",elo:850,joinedAt:0},{userId:"c",elo:1650,joinedAt:0},{userId:"d",elo:2600,joinedAt:0}];
  assert.equal(queueGroupFor(entries[0],entries,config,0).length,2);
  assert.deepEqual(matchQueue(entries,config,0),[]);
});
test("midnight departure advances contract and draft phases without granting automatic moves",()=>{
  const players=["a","b","c"].map((id)=>({id,pseudo:id}));
  const state=createGameState("midnight-dice",players);
  for (const id of ["a","b"]) applyAction(state,id,{type:"choose-contract",contract:midnightContractOffers(state,id)[0]});
  state.players.pop();state.currentPlayerIndex=0;resumeMidnightAfterDeparture(state);
  assert.equal(state.phase,"draft");assert.equal(state.market.length,6+state.modifiers.marketExtra);
  state.trays={a:[1,2,3],b:[4,5,6]};resumeMidnightAfterDeparture(state);
  assert.equal(state.round,2);assert.equal(state.phase,"contract");
  validateRankedAction(state,"a",{type:"choose-contract",contract:midnightContractOffers(state,"a")[0]});
  assert.throws(()=>validateRankedAction(state,"a",{type:"choose-contract",contract:"fake"}));
  assert.throws(()=>validateRankedAction(state,"a",{type:"draft",index:-1}));
  assert.throws(()=>validateRankedAction(state,"a",{type:"draft",index:"0"}));
});
