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
before(async()=> {
  const db=inspection();
  db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER)");
  for(const id of ["a","b","c","d","admin","guest"]) {
    const user={id,pseudo:id,email:`${id}@example.com`,emailVerifiedAt:new Date().toISOString(),active:true,admin:id==="admin",guest:id==="guest",tokens:10000,passwordHash:"unused-test-hash",profile:{birthDate:"1990-01-01"},createdAt:new Date().toISOString()};
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(id,JSON.stringify(user),id,user.email,Number(user.guest));
  }
  db.prepare("INSERT INTO meta VALUES('admin-settings',?)").run(JSON.stringify({platform:{roundResultsSeconds:0,turnEndDelaySeconds:1}}));db.close();
  const listener=net.createServer();await new Promise((resolve)=>listener.listen(0,"127.0.0.1",resolve));const port=listener.address().port;await new Promise((resolve)=>listener.close(resolve));
  url=`http://127.0.0.1:${port}/ktga`;
  processHandle=spawn(process.execPath,["src/index.js"],{cwd:new URL("../",import.meta.url),windowsHide:true,env:{...process.env,SQLITE_PATH:filename,PORT:String(port),NODE_ENV:"test",JWT_SECRET:secret,APP_BASE_PATH:"/ktga",HTTPS_KEY_PATH:"",HTTPS_CERT_PATH:"",HTTPS_PFX_PATH:"",SMTP_HOST:"",EMAIL_FROM:"",CLIENT_DIST:""},stdio:["ignore","pipe","pipe"]});
  processHandle.stdout.on("data",(data)=>output+=data);processHandle.stderr.on("data",(data)=>output+=data);
  for(let i=0;i<100;i++) {try{const response=await fetch(`${url}/api/health`);if(response.ok)return;}catch{}await new Promise((resolve)=>setTimeout(resolve,100));}
  throw new Error(`Isolated server failed to start: ${output}`);
});
after(async()=> {
  if(processHandle?.exitCode===null){const exit=new Promise((resolve)=>processHandle.once("exit",resolve));processHandle.kill();await exit;}
  assert.ok(directory.startsWith(path.join(os.tmpdir(),"ktga-ranked-api-")));
  fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});
});
test("real ranked API matches, locks settings, rejects guests, settles once and persists Elo",async()=> {
  assert.equal((await request("guest","/api/ranked/queue","POST",{gameId:"yahtzee"})).status,403);
  assert.equal((await request("a","/api/ranked/queue","POST",{gameId:"blackjack"})).status,403);
  assert.equal((await request("a","/api/rooms","POST",{gameId:"yahtzee",ranked:true})).status,403);
  const admin=await request("admin","/api/admin/ranked");assert.equal(admin.status,200);
  const settings=admin.data.settings;settings.minimumGames=0;for(const row of Object.values(settings.games))row.minimumGames=0;
  assert.equal((await request("admin","/api/admin/ranked","PUT",settings)).status,200);
  const first=await request("a","/api/ranked/queue","POST",{gameId:"yahtzee",elo:99999});assert.equal(first.status,200);assert.equal(first.data.queue.elo,1000);
  const second=await request("b","/api/ranked/queue","POST",{gameId:"yahtzee"});assert.equal(second.status,200);assert.ok(second.data.match);
  const code=second.data.match.code,table=(await request("a",`/api/rooms/${code}`)).data;
  assert.equal(table.ownerId,"ranked-server");assert.equal(table.players.length,2);assert.ok(table.state);assert.equal(table.gameModifiers.rollsPerTurn,3);
  assert.equal((await request("a",`/api/rooms/${code}/game-settings`,"POST",{rollsPerTurn:5})).status,404);
  assert.equal((await request("a",`/api/rooms/${code}/bot`,"POST")).status,404);
  assert.equal((await request("c",`/api/rooms/${code}/action`,"POST",{type:"roll"})).status,403);
  assert.equal((await request("a",`/api/rooms/${code}/action`,"POST",{type:"score",category:"injected"})).status,400);
  assert.equal((await request("a",`/api/rooms/${code}/leave`,"POST")).status,200);
  const results=await request("a","/api/ranked/history");assert.equal(results.status,200);assert.equal(results.data.rows.length,1);assert.equal(results.data.rows[0].delta,-36);assert.equal(results.data.rows[0].after,964);
  const board=(await request("a","/api/ranked/leaderboard/yahtzee")).data;assert.equal(board.rows.length,2);assert.equal(board.rows[0].id,"b");assert.equal(board.rows[0].elo,1016);assert.equal(board.rows[0].games,1);
  await request("a",`/api/rooms/${code}/leave`,"POST");
  const db=inspection();assert.equal(db.prepare("SELECT COUNT(*) n FROM ranked_results").get().n,2);assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");db.close();
});
test("Belote abandonment ends the team match without ever inserting a replacement bot",async()=> {
  for(const id of ["a","b","c","d"])assert.equal((await request(id,"/api/ranked/queue","POST",{gameId:"belote"})).status,200);
  const code=(await request("a","/api/ranked")).data.match.code;
  assert.equal((await request("a",`/api/rooms/${code}/leave`,"POST")).status,200);
  const table=(await request("b",`/api/rooms/${code}`)).data;assert.equal(table.finished,true);assert.equal(table.players.length,4);assert.ok(table.players.every((p)=>!p.isBot));
  assert.equal(table.ranked.results.length,4);assert.equal(table.state.winners.length,2);
});
test("technical cancellation refunds exactly once and never grants Elo or XP",async()=> {
  const before=(await request("c","/api/me")).data.tokens;
  for(const id of ["c","d"])assert.equal((await request(id,"/api/ranked/queue","POST",{gameId:"yahtzee"})).status,200);
  const code=(await request("c","/api/ranked")).data.match.code;
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
  for(const id of ["c","d"])assert.equal((await request(id,"/api/ranked/queue","POST",{gameId:"yahtzee"})).status,200);
  const code=(await request("c","/api/ranked")).data.match.code;
  assert.equal((await request("a",`/api/rooms/${code}`)).status,403);
  assert.equal((await request("a",`/api/rooms/${code}/join`,"POST",{})).status,403);
  assert.equal((await request("a",`/api/rooms/${code}/spectate`,"POST",{})).status,403);
  assert.equal((await request("c",`/api/rooms/${code}`)).status,200);
  assert.equal((await request("c",`/api/rooms/${code}/level-settings`,"POST",{minLevel:90})).status,404);
  assert.equal((await request("admin",`/api/admin/ranked/${code}/cancel`,"POST",{reason:"Fin du test de confidentialité"})).status,200);
});
