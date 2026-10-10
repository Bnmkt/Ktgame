import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import jwt from "jsonwebtoken";

const directory=fs.mkdtempSync(path.join(os.tmpdir(),"ktga-ranked-api-")),filename=path.join(directory,"test.sqlite"),secret="isolated-ranked-test-secret";
let processHandle,url,output="";
const inspection=()=>new DatabaseSync(filename);
const token=(id)=>jwt.sign({id,guest:id==="guest",sessionVersion:0},secret,{expiresIn:"1h"});
async function request(id,route,method="GET",body) {
  const response=await fetch(`${url}${route}`,{method,headers:{Authorization:`Bearer ${token(id)}`,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,data:await response.json()};
}
async function confirmedMatch(ids,gameId) {
  for(const id of ids) assert.equal((await request(id,"/api/ranked/queue","POST",{gameId})).status,200);
  const queued=(await request(ids[0],"/api/ranked")).data;
  assert.equal(queued.match,null);assert.equal(queued.proposal.players.length,ids.length);
  assert.ok(queued.proposal.startsAfter-queued.serverTime>=29000);
  assert.equal((await request("guest","/api/ranked/ready","POST",{proposalId:queued.proposal.id})).status,409);
  for(const id of ids) assert.equal((await request(id,"/api/ranked/ready","POST",{proposalId:queued.proposal.id})).status,200);
  const ready=(await request(ids[0],"/api/ranked")).data;
  assert.equal(ready.match,null);assert.ok(ready.proposal.players.every((player)=>player.ready));
  await new Promise((resolve)=>setTimeout(resolve,Math.max(0,queued.proposal.startsAfter-Date.now())+2100));
  const started=(await request(ids[0],"/api/ranked")).data;
  assert.ok(started.match);return started.match.code;
}
before(async()=> {
  const db=inspection();
  db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER)");
  for(const id of ["a","b","c","d","admin","guest"]) {
    const user={id,pseudo:id,email:`${id}@example.com`,emailVerifiedAt:new Date().toISOString(),active:true,admin:id==="admin",guest:id==="guest",tokens:10000,passwordHash:"unused-test-hash",profile:{birthDate:"1990-01-01"},createdAt:new Date().toISOString()};
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(id,JSON.stringify(user),id,user.email,Number(user.guest));
  }
  db.prepare("INSERT INTO meta VALUES('admin-settings',?)").run(JSON.stringify({ranked:{placementGames:0},platform:{roundResultsSeconds:0,turnEndDelaySeconds:1}}));db.close();
  const listener=net.createServer();await new Promise((resolve)=>listener.listen(0,"127.0.0.1",resolve));const port=listener.address().port;await new Promise((resolve)=>listener.close(resolve));
  url=`http://127.0.0.1:${port}/ktga`;
  processHandle=spawn(process.execPath,["src/index.js"],{cwd:new URL("../",import.meta.url),windowsHide:true,env:{...process.env,SQLITE_PATH:filename,PORT:String(port),HOST:"127.0.0.1",NODE_ENV:"test",JWT_SECRET:secret,APP_BASE_PATH:"/ktga",HTTPS_KEY_PATH:"",HTTPS_CERT_PATH:"",HTTPS_PFX_PATH:"",SMTP_HOST:"",SMTP_USER:"",SMTP_PASS:"",EMAIL_FROM:"",CLIENT_DIST:"",CLIENT_ORIGIN:new URL(url).origin,PUBLIC_APP_URL:`${url}/api/health`,CONTACT_EMAIL:"contact@example.com",
    ...Object.fromEntries(["PARENTAL_DB_PATH","TRIBUNAL_DB_PATH","CHAT_DB_PATH","STATUS_DB_PATH","REQUEST_LOG_PATH","HELP_DB_PATH","DATA_REQUEST_DB_PATH","BUG_REPORT_DB_PATH","PATCHNOTES_DB_PATH","CONTACT_NOTICE_DB_PATH"].map((key)=>[key,path.join(directory,`${key}.sqlite`)])),
    PATCHNOTES_UPLOAD_DIR:path.join(directory,"note-images"),BUG_REPORT_UPLOAD_DIR:path.join(directory,"bug-images"),RANK_INSIGNIA_UPLOAD_DIR:path.join(directory,"rank-images")
  },stdio:["ignore","pipe","pipe"]});
  processHandle.stdout.on("data",(data)=>output+=data);processHandle.stderr.on("data",(data)=>output+=data);
  for(let i=0;i<100;i++) {try{const response=await fetch(`${url}/api/health`);if(response.ok)return;}catch{}await new Promise((resolve)=>setTimeout(resolve,100));}
  throw new Error(`Isolated server failed to start: ${output}`);
});
after(async()=> {
  if(processHandle?.exitCode===null){const exit=new Promise((resolve)=>processHandle.once("exit",resolve));processHandle.kill();await exit;}
  assert.ok(directory.startsWith(path.join(os.tmpdir(),"ktga-ranked-api-")));
  fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});
});
test("public rank artwork is available without authentication or private rating data",async()=> {
  const response=await fetch(`${url}/api/ranked/ranks`);
  assert.equal(response.status,200);
  const {ranks}=await response.json();
  assert.ok(ranks.length>0);
  for(const rank of ranks) {
    assert.deepEqual(Object.keys(rank).sort(),["divisionInsignia","divisions","id","insignia","insigniaImage","name"].sort());
    assert.equal(rank.minimum,undefined);assert.equal(rank.elo,undefined);
  }
});

test("ranked metrics are admin-only, aggregate-only and validate filters",async()=> {
  assert.equal((await request("a","/api/admin/ranked/metrics")).status,403);
  const response=await request("admin","/api/admin/ranked/metrics?period=7");
  assert.equal(response.status,200);assert.equal(response.data.series.length,7);
  assert.equal(response.data.summary.matches,0);assert.equal(response.data.population.medianElo,null);
  assert.equal(response.data.live.length,7);
  assert.equal((await request("admin","/api/admin/ranked/metrics?gameId=blackjack")).status,400);
  assert.equal((await request("admin","/api/admin/ranked/metrics?period=50000")).status,400);
});

test("Elo simulation is administrative, configurable and never changes accounts",async()=> {
  const before=(await request("a","/api/me")).data;
  const body={gameId:"yahtzee",settings:{d:400,gamma:.75,provisional:[]},players:[{elo:1000,games:30,position:1},{elo:1400,games:30,position:2}]};
  assert.equal((await request("a","/api/admin/ranked/simulate","POST",body)).status,403);
  const simulation=await request("admin","/api/admin/ranked/simulate","POST",body);
  assert.equal(simulation.status,200);assert.equal(simulation.data.results[0].delta,29.09);assert.equal(simulation.data.results[1].delta,-29.09);
  assert.deepEqual((await request("a","/api/me")).data.gameElo,before.gameElo);
  assert.equal((await request("admin","/api/admin/ranked/simulate","POST",{...body,settings:{d:0}})).status,400);
});

test("real placement queues accept wider ranks and relocate without exposing or rewriting Elo",async()=> {
  const original=(await request("admin","/api/admin/ranked")).data.settings;
  const settings=structuredClone(original);
  Object.assign(settings.games.yahtzee,{placementGames:5,wideningSeconds:5});
  assert.equal((await request("admin","/api/admin/ranked","PUT",settings)).status,200);
  try {
    assert.equal((await request("admin","/api/admin/users/d","PATCH",{gameElo:{yahtzee:1250},progressionExpected:{gameElo:{yahtzee:1000}}})).status,200);
    await request("c","/api/ranked/queue","POST",{gameId:"yahtzee"});
    let offered=(await request("d","/api/ranked/queue","POST",{gameId:"yahtzee"})).data;
    assert.equal(offered.proposal.players.length,2);
    assert.ok(offered.proposal.players.every((row)=>row.rank.id==="unranked"));
    for(const id of ["c","d"])await request(id,"/api/ranked/queue","DELETE");
    assert.equal((await request("admin","/api/admin/users/d","PATCH",{gameElo:{yahtzee:2600},progressionExpected:{gameElo:{yahtzee:1250}}})).status,200);
    await request("c","/api/ranked/queue","POST",{gameId:"yahtzee"});
    offered=(await request("d","/api/ranked/queue","POST",{gameId:"yahtzee"})).data;
    assert.equal(offered.proposal,null);assert.equal(offered.queue.range,4);assert.equal(offered.queue.elo,undefined);
    await new Promise((resolve)=>setTimeout(resolve,7100));
    const response=await request("c","/api/ranked");assert.equal(response.status,200);offered=response.data;
    assert.equal(offered.proposal.players.length,2);assert.equal(offered.match,null);
    assert.equal(offered.queue.elo,undefined);assert.ok(offered.proposal.players.every((row)=>!row.ready));
    const db=inspection();
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM rooms").get().n,0);
    assert.equal(db.prepare("SELECT elo FROM user_game_elo WHERE user_id='d' AND game_id='yahtzee'").get().elo,2600);
    db.close();
  } finally {
    for(const id of ["c","d"])await request(id,"/api/ranked/queue","DELETE");
    const previous=(await request("admin","/api/admin/users/d")).data.user.gameElo.yahtzee;
    assert.equal((await request("admin","/api/admin/users/d","PATCH",{gameElo:{yahtzee:1000},progressionExpected:{gameElo:{yahtzee:previous}}})).status,200);
    await request("admin","/api/admin/ranked","PUT",original);
  }
});

test("variable queue reserves no room before its fill deadline and confirms the available roster",async()=> {
  const original=(await request("admin","/api/admin/ranked")).data.settings;
  const settings=structuredClone(original);Object.assign(settings.games.yahtzee,{players:2,maximumPlayers:4,fillWaitSeconds:1});
  assert.equal((await request("admin","/api/admin/ranked","PUT",settings)).status,200);
  try {
    await request("a","/api/ranked/queue","POST",{gameId:"yahtzee"});
    const waiting=(await request("b","/api/ranked/queue","POST",{gameId:"yahtzee"})).data;
    assert.equal(waiting.proposal,null);assert.equal(waiting.queue.players,4);assert.equal(waiting.queue.remaining,2);
    assert.equal(waiting.queue.stage,"filling");assert.ok(waiting.queue.fillDeadline>waiting.serverTime);
    assert.equal((await request("admin","/api/admin/ranked")).data.matches.length,0);
    await request("c","/api/ranked/queue","POST",{gameId:"yahtzee"});
    await new Promise((resolve)=>setTimeout(resolve,3100));
    const offered=(await request("a","/api/ranked")).data;
    assert.equal(offered.proposal.players.length,3);assert.equal(offered.match,null);
    assert.ok(offered.proposal.players.every((row)=>!row.ready));
    const db=inspection();assert.equal(db.prepare("SELECT COUNT(*) AS n FROM rooms").get().n,0);db.close();
  } finally {
    for(const id of ["a","b","c"])await request(id,"/api/ranked/queue","DELETE");
    await request("admin","/api/admin/ranked","PUT",original);
  }
});

test("real ranked API matches, locks settings, rejects guests, settles once and persists Elo",async()=> {
  assert.equal((await request("guest","/api/ranked/queue","POST",{gameId:"yahtzee"})).status,403);
  assert.equal((await request("a","/api/ranked/queue","POST",{gameId:"blackjack"})).status,403);
  assert.equal((await request("a","/api/rooms","POST",{gameId:"yahtzee",ranked:true})).status,403);
  const admin=await request("admin","/api/admin/ranked");assert.equal(admin.status,200);
  const settings=admin.data.settings;settings.minimumGames=0;for(const row of Object.values(settings.games))row.minimumGames=0;
  assert.equal((await request("admin","/api/admin/ranked","PUT",settings)).status,200);
  const first=await request("a","/api/ranked/queue","POST",{gameId:"yahtzee",elo:99999});assert.equal(first.status,200);assert.equal(first.data.queue.elo,1000);
  assert.equal(first.data.queue.remaining,1);
  assert.equal((await request("b","/api/me","PATCH",{rankedBadgeGameId:"yahtzee"})).data.rankedBadge.rank.label,"Argent III");
  const beforeTokens=(await request("a","/api/me")).data.tokens;
  const code=await confirmedMatch(["a","b"],"yahtzee"),table=(await request("a",`/api/rooms/${code}`)).data;
  assert.equal((await request("admin","/api/admin/users/a","PATCH",{gameElo:{yahtzee:1100},progressionExpected:{gameElo:{yahtzee:1000}}})).status,409);
  assert.equal((await request("admin","/api/admin/users/a","PATCH",{gameXp:{yahtzee:500},progressionExpected:{gameXp:{yahtzee:0}}})).status,409);
  assert.equal(table.ownerId,"ranked-server");assert.equal(table.players.length,2);assert.ok(table.state);assert.equal(table.gameModifiers.rollsPerTurn,3);
  assert.equal(table.stake,0);assert.equal((await request("a","/api/me")).data.tokens,beforeTokens);assert.equal(table.ranked.roster[0].rank.label,"Argent III");
  assert.ok(table.ranked.turn.deadline>table.ranked.turn.serverTime);
  assert.ok(table.ranked.turn.actorId);
  assert.equal(table.players.find((row)=>row.id==="b").rankedBadge.rank.label,"Argent III");
  assert.equal(table.players.find((row)=>row.id==="b").rankedBadge.rank.elo,undefined);
  assert.equal((await request("a",`/api/rooms/${code}/game-settings`,"POST",{rollsPerTurn:5})).status,404);
  assert.equal((await request("a",`/api/rooms/${code}/bot`,"POST")).status,404);
  assert.equal((await request("c",`/api/rooms/${code}/action`,"POST",{type:"roll"})).status,403);
  assert.equal((await request("a",`/api/rooms/${code}/action`,"POST",{type:"score",category:"injected"})).status,400);
  assert.equal((await request("a",`/api/rooms/${code}/leave`,"POST")).status,200);
  const results=await request("a","/api/ranked/history");assert.equal(results.status,200);assert.equal(results.data.rows.length,1);assert.equal(results.data.rows[0].delta,-44);assert.equal(results.data.rows[0].after,956);assert.equal(results.data.rows[0].averageElo,undefined);assert.equal(results.data.rows[0].playerCount,2);
  // minimumGames=0 also admits profiles initialized by the earlier queue/admin scenarios.
  const board=(await request("a","/api/ranked/leaderboard/yahtzee")).data;assert.equal(board.rows.filter((row)=>row.games>0).length,2);assert.equal(board.rows[0].id,"b");assert.equal(board.rows[0].elo,undefined);assert.equal(board.rows[0].ratingRank.label,"Argent III");assert.equal(board.rows[0].games,1);
  assert.equal(board.rows.find((row)=>row.id==="a").elo,956);
  const profile=(await request("a","/api/users/b/public")).data;
  assert.ok(profile.ranked.every((row)=>row.elo===undefined));assert.ok(profile.gameProgression.every((row)=>!row.competitive || row.competitive.elo===undefined));
  const ownRoom=(await request("a",`/api/rooms/${code}`)).data, spectator=(await request("c",`/api/rooms/${code}`)).data;
  assert.equal(ownRoom.ranked.results.find((row)=>row.userId==="a").after,956);
  assert.equal(ownRoom.ranked.results.find((row)=>row.userId==="b").after,undefined);
  assert.ok(spectator.ranked.results.every((row)=>row.after===undefined && row.delta===undefined));
  const classicHistory=(await request("a","/api/history")).data;
  assert.equal(classicHistory[0].ranked.results.find((row)=>row.userId==="b").after,undefined);
  await request("a",`/api/rooms/${code}/leave`,"POST");
  const db=inspection();assert.equal(db.prepare("SELECT COUNT(*) n FROM ranked_results").get().n,2);assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");db.close();
  const metrics=(await request("admin","/api/admin/ranked/metrics?gameId=yahtzee&period=7")).data;
  assert.equal(metrics.summary.matches,1);assert.equal(metrics.summary.wins,1);assert.equal(metrics.summary.losses,1);
  assert.equal(metrics.summary.abandons,1);assert.equal(metrics.summary.winRate,50);
  assert.equal(metrics.population.profiles,2);assert.equal(metrics.population.averageElo,1000);assert.equal(metrics.population.medianElo,1000);
  assert.equal(metrics.live[0].playing,0);assert.ok(!JSON.stringify(metrics).includes('"userId"'));
  const beforeCorrection=(await request("admin","/api/admin/users/b")).data;
  const beforeElo=beforeCorrection.user.gameElo.yahtzee;
  const historyBefore=(await request("b","/api/ranked/history")).data;
  assert.equal((await request("admin","/api/admin/users/b","PATCH",{gameElo:{yahtzee:beforeElo+10},progressionExpected:{gameElo:{yahtzee:beforeElo}}})).status,200);
  const afterCorrection=(await request("admin","/api/admin/users/b")).data.progression.find((row)=>row.gameId==='yahtzee');
  assert.equal(afterCorrection.competitive.games,1);assert.equal(afterCorrection.competitive.wins,1);
  assert.deepEqual((await request("b","/api/ranked/history")).data,historyBefore);
  assert.equal((await request("admin","/api/admin/users/b","PATCH",{gameElo:{yahtzee:beforeElo},progressionExpected:{gameElo:{yahtzee:beforeElo+10}}})).status,200);
});

test("equipped ranked badge is validated, persisted, projected into chat and removable",async()=>{
  assert.equal((await request("b","/api/me","PATCH",{rankedBadgeGameId:"blackjack"})).status,400);
  assert.equal((await request("b","/api/me","PATCH",{rankedBadgeGameId:{gameId:"yahtzee",elo:99999}})).status,400);
  const selected=(await request("b","/api/me","PATCH",{rankedBadgeGameId:"yahtzee"})).data;
  assert.equal(selected.profile.rankedBadgeGameId,"yahtzee");
  const other=(await request("a","/api/users/b/public")).data;
  assert.deepEqual(other.rankedBadge,selected.rankedBadge);assert.equal(other.rankedBadge.rank.elo,undefined);
  const message=await request("b","/api/chat/messages","POST",{channelType:"global",content:"Insigne de test"});
  assert.equal(message.status,201);assert.deepEqual(message.data.sender.rankedBadge,selected.rankedBadge);
  assert.equal((await request("b","/api/me","PATCH",{rankedBadgeGameId:""})).data.rankedBadge,null);
});

test("midnight ranked keeps contracts private and an abandonment cannot block the market",async()=>{
  const code=await confirmedMatch(["a","b","c","d"],"midnight-dice");
  let table=(await request("a",`/api/rooms/${code}`)).data;
  assert.equal(table.stake,0);assert.equal(table.ranked.roster.length,4);
  const offers=[];
  for(const id of ["a","b","c","d"]) {
    const view=(await request(id,`/api/rooms/${code}`)).data.state;
    assert.equal(view.privateContractOffers,undefined);assert.equal(view.contractOffers.length,4);
    offers.push([...view.contractOffers].sort().join("|"));
  }
  assert.equal(new Set(offers).size,4);
  assert.ok(table.ranked.turn.deadline>table.ranked.turn.serverTime);
  for (const id of ["a","b","c"]) {
    table=(await request(id,`/api/rooms/${code}`)).data;
    if (table.pacing) await request(id,`/api/rooms/${code}/pacing/skip`,"POST",{});
    assert.equal((await request(id,`/api/rooms/${code}/action`,"POST",{type:"choose-contract",contract:table.state.contractOffers[0]})).status,200);
  }
  const other=(await request("admin",`/api/rooms/${code}`)).data;
  assert.deepEqual(other.state.contractOffers,[]);assert.equal(other.state.privateContractOffers,undefined);
  assert.ok(Object.values(other.state.secretContracts ?? {}).every((value)=>!value));
  assert.equal((await request("d",`/api/rooms/${code}/leave`,"POST",{})).status,200);
  table=(await request("a",`/api/rooms/${code}`)).data;assert.equal(table.state.phase,"draft");assert.ok(table.state.market.length>0);
  assert.equal(table.state.players[table.state.currentPlayerIndex].id,"a");
  assert.equal((await request("admin",`/api/admin/ranked/${code}/cancel`,"POST",{reason:"Fin du test Dés de Minuit"})).status,200);
});
test("Belote abandonment ends the team match without ever inserting a replacement bot",async()=> {
  const code=await confirmedMatch(["a","b","c","d"],"belote");
  assert.equal((await request("a",`/api/rooms/${code}/leave`,"POST")).status,200);
  const table=(await request("b",`/api/rooms/${code}`)).data;assert.equal(table.finished,true);assert.equal(table.players.length,4);assert.ok(table.players.every((p)=>!p.isBot));
  assert.equal(table.ranked.results.length,4);assert.equal(table.state.winners.length,2);
});
test("technical cancellation refunds exactly once and never grants Elo or XP",async()=> {
  const before=(await request("c","/api/me")).data.tokens;
  const code=await confirmedMatch(["c","d"],"yahtzee");
  assert.equal((await request("admin",`/api/admin/ranked/${code}/cancel`,"POST",{reason:"Incident technique de test"})).status,200);
  const history=(await request("c","/api/ranked/history")).data.rows;assert.ok(history.every((row)=>row.gameId!=="yahtzee"));
  const db=inspection();const user=JSON.parse(db.prepare("SELECT data FROM users WHERE id='c'").get().data);
  const rankedCount=db.prepare("SELECT COUNT(*) n FROM user_game_elo WHERE user_id='c' AND game_id='yahtzee'").get().n;
  db.close();
  assert.equal(user.tokens,before);
  assert.equal(rankedCount,0);
});

test("private ranked presets reject spectators through every room entry point",async()=> {
  const settings=(await request("admin","/api/admin/ranked")).data.settings;
  settings.games.yahtzee.spectators=false;
  assert.equal((await request("admin","/api/admin/ranked","PUT",settings)).status,200);
  const code=await confirmedMatch(["c","d"],"yahtzee");
  assert.equal((await request("a",`/api/rooms/${code}`)).status,403);
  assert.equal((await request("a",`/api/rooms/${code}/join`,"POST",{})).status,403);
  assert.equal((await request("a",`/api/rooms/${code}/spectate`,"POST",{})).status,403);
  assert.equal((await request("c",`/api/rooms/${code}`)).status,200);
  assert.equal((await request("c",`/api/rooms/${code}/level-settings`,"POST",{minLevel:90})).status,404);
  assert.equal((await request("admin",`/api/admin/ranked/${code}/cancel`,"POST",{reason:"Fin du test de confidentialité"})).status,200);
});

test("admin can persist custom ranks and division windows but cannot bypass preparation",async()=> {
  const settings=(await request("admin","/api/admin/ranked")).data.settings;
  settings.ranks.find((rank)=>rank.id==="platinum").name="Émeraude";
  settings.ranks.find((rank)=>rank.id==="silver").insignia="crown";
  settings.games.yahtzee.maximumWindow=7;
  const saved=await request("admin","/api/admin/ranked","PUT",settings);assert.equal(saved.status,200);
  assert.equal((await request("admin","/api/admin/ranked")).data.settings.ranks.find((rank)=>rank.id==="platinum").name,"Émeraude");
  assert.equal(saved.data.games.yahtzee.maximumWindow,7);
  assert.equal((await request("admin","/api/admin/ranked")).data.settings.ranks.find((rank)=>rank.id==="silver").insignia,"crown");
  assert.equal((await request("a","/api/users/b/public")).data.gameProgression.find((row)=>row.gameId==="yahtzee").competitive.rank.insignia,"crown");
  assert.equal((await request("a","/api/admin/ranked","PUT",settings)).status,403);
  for(const invalid of [{...settings,ranks:[]},{...settings,games:{...settings.games,yahtzee:{...settings.games.yahtzee,readyWaitSeconds:1}}},{...settings,games:{...settings.games,yahtzee:{...settings.games.yahtzee,maximumWindow:6}}}])assert.equal((await request("admin","/api/admin/ranked","PUT",invalid)).status,400);
  const history=(await request("a","/api/ranked/history")).data.rows;
  assert.equal(history[0].beforeRank.name,"Argent");
  assert.equal(history[0].beforeRank.insignia,"shield");
  assert.equal((await request("admin","/api/admin/ranked","PUT",{...settings,ranks:settings.ranks.map((row)=>({...row,insigniaImage:"a".repeat(64)}))})).status,400);
  settings.ranks.find((rank)=>rank.id==="silver").divisionInsignia={III:{insignia:"gem"}};
  assert.equal((await request("admin","/api/admin/ranked","PUT",settings)).status,200);
  assert.equal((await request("a","/api/users/b/public")).data.gameProgression.find((row)=>row.gameId==="yahtzee").competitive.rank.insignia,"gem");
  assert.equal((await request("admin","/api/admin/ranked","PUT",{...settings,ranks:settings.ranks.map((row)=>row.id==="silver"?{...row,divisionInsignia:{I:{insigniaImage:"a".repeat(64)}}}:row)})).status,400);
});

test("admin profile edits XP and Elo atomically, preserves results and rejects stale or queued changes",async()=> {
  const sqlBefore=inspection();const resultCount=sqlBefore.prepare('SELECT COUNT(*) n FROM ranked_results').get().n;sqlBefore.close();
  const detail=(await request("admin","/api/admin/users/c")).data;
  assert.equal(detail.user.gameXp.yahtzee,0);assert.equal(detail.user.gameElo.yahtzee,1000);
  const change={gameXp:{yahtzee:12345},gameElo:{yahtzee:1520.25},progressionExpected:{gameXp:{yahtzee:0},gameElo:{yahtzee:1000}}};
  assert.equal((await request("a","/api/admin/users/c","PATCH",change)).status,403);
  assert.equal((await request("admin","/api/admin/users/missing","PATCH",change)).status,404);
  for (const body of [{gameXp:null},{gameElo:[]},{...change,gameXp:{unknown:123}}, {...change,gameXp:{yahtzee:1.5}}, {...change,gameXp:{yahtzee:-1}}, {...change,gameElo:{blackjack:1000}}, {...change,gameElo:{yahtzee:1000.111}}]) assert.equal((await request("admin","/api/admin/users/c","PATCH",body)).status,400);
  assert.equal((await request("admin","/api/admin/users/c","PATCH",change)).status,200);
  const updated=(await request("admin","/api/admin/users/c")).data;
  assert.equal(updated.user.gameXp.yahtzee,12345);assert.equal(updated.user.gameElo.yahtzee,1520.25);
  assert.equal(updated.progression.find((row)=>row.gameId==='yahtzee').competitive.rank.id,'platinum');
  assert.equal(updated.progression.find((row)=>row.gameId==='yahtzee').competitive.games,0);
  assert.ok(updated.progression.find((row)=>row.gameId==='yahtzee').level>1);
  assert.equal((await request("admin","/api/admin/users/c","PATCH",{...change,displayName:"Should not apply"})).status,409);
  assert.equal((await request("admin","/api/admin/users/c")).data.user.displayName,detail.user.displayName);
  await request("c","/api/ranked/queue","POST",{gameId:"yahtzee"});
  const another={gameXp:{yahtzee:0},gameElo:{yahtzee:1000},progressionExpected:{gameXp:{yahtzee:12345},gameElo:{yahtzee:1520.25}}};
  assert.equal((await request("admin","/api/admin/users/c","PATCH",another)).status,409);
  assert.equal((await request("admin","/api/admin/users/c")).data.user.gameXp.yahtzee,12345);
  await request("c","/api/ranked/queue","DELETE");
  assert.equal((await request("admin","/api/admin/users/c","PATCH",another)).status,200);
  const rules=(await request("admin","/api/admin/ranked")).data.settings;
  const floorRules=structuredClone(rules);floorRules.games.yahtzee.minimumElo=900;
  await request("admin","/api/admin/ranked","PUT",floorRules);
  try {
    assert.equal((await request("admin","/api/admin/users/c","PATCH",{gameElo:{yahtzee:899},progressionExpected:{gameElo:{yahtzee:1000}}})).status,400);
    assert.equal((await request("admin","/api/admin/users/c")).data.user.gameElo.yahtzee,1000);
  } finally {await request("admin","/api/admin/ranked","PUT",rules);}
  const sql=inspection();assert.equal(sql.prepare('SELECT COUNT(*) n FROM ranked_results').get().n,resultCount);assert.equal(sql.prepare('SELECT games,wins FROM user_game_elo WHERE user_id=? AND game_id=?').get('c','yahtzee').games,0);sql.close();
});
