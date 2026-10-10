import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { desktopHealth, desktopMetrics, registerDesktopSupervision } from "../src/services/desktop-supervision.js";

test("desktop snapshots explicitly exclude private information and cap technical history", () => {
  const value = desktopHealth({ status:"healthy", secret:"private", process:{pid:100,uptimeSeconds:30,memory:{rss:100}}, system:{hostname:"private",cpuPercent:10}, database:{path:"private",fileBytes:55}, traffic:{routes:["private"],requestsPerSecond:1}, services:{rooms:{name:"Tables",completed:3,private:"private",processing:{p95Ms:2,stack:"private"}}}, history:Array.from({length:800},(_,i)=>({at:i,private:"private",services:{rooms:{completed:i,private:"private"}}})) });
  assert.equal(value.history.length, 720); assert.equal(value.history[0].at, 80);
  assert.equal(value.process.memory.rss, 100); assert.equal(value.services.rooms.processing.p95Ms, 2);
  assert.ok(!JSON.stringify(value).includes("private"));
  const metrics = desktopMetrics({ days:30,summary:{accounts:5,secret:"private"},users:{topWealth:[{email:"private"}]},games:[{id:"yahtzee",games:2,players:["private"]}],communityEvents:{summary:{actions:3},topParticipants:["private"]},achievements:{unlocked:9,users:["private"]} });
  assert.equal(metrics.summary.accounts,5); assert.equal(metrics.games[0].games,2);
  assert.equal(metrics.achievements.unlocked,9); assert.ok(!JSON.stringify(metrics).includes("private"));
});

test("aggregate cache is bounded by period and authorization is rechecked before cached responses", async () => {
  const app = express(); let allowed=true, calls=0;
  registerDesktopSupervision({app,auth:(req,res,next)=>req.headers.authorization?next():res.sendStatus(401), requireBackOffice:(req,res,next)=>{if(!allowed)return res.sendStatus(403); req.backOfficeUser={pseudo:"Fixture",editor:true}; next();},health:()=>({process:{}}),metrics:(days)=>{calls++;return {days,summary:{accounts:5}};},status:()=>({components:[]}),version:()=>"test",viewerName:u=>u.pseudo,connectedUsers:()=>0});
  const server=app.listen(0,"127.0.0.1"); await new Promise(resolve=>server.once("listening",resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const get=(suffix)=>fetch(base+suffix,{headers:{Authorization:"fixture"}});
  try {
    assert.equal((await fetch(base+"/api/desktop/metrics")).status,401);
    for(const days of [30,30,90,365,365]) assert.equal((await get(`/api/desktop/metrics?days=${days}`)).status,200);
    assert.equal(calls,3);
    allowed=false; assert.equal((await get("/api/desktop/metrics?days=30")).status,403); assert.equal(calls,3);
    assert.equal((await get("/api/desktop/overview")).status,403);
  } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});

test("desktop exports retain both process measurements without PIDs, paths or cache identities", () => {
  const data = desktopHealth({ processTotals: { cpuPercent: 130, memoryRss: 300, secret: "private" },
    processes: { site: { role: "site", pid: 100, cpuPercent: 80, memoryRss: 200 },
      accounts: { role: "accounts", pid: 101, cpuPercent: 50, memoryRss: 100, queued: 2, caches: { ids: ["private"] } } },
    history: [{ at: "test", accountsCpu: 50, accountsRss: 100, accountsLoopP95: 20, accountsQueued: 2 }] });
  assert.equal(data.processes.accounts.cpuPercent, 50); assert.equal(data.processes.accounts.queued, 2);
  assert.equal(data.processTotals.cpuPercent, 130); assert.equal(data.history[0].accountsCpu, 50);
  assert.ok(!/"pid"|private|"caches"/.test(JSON.stringify(data.processes)));
});
