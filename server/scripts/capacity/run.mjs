import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { setMaxListeners } from "node:events";
import { games } from "../../src/games/shared.js";
import { defaultCommunityEvent } from "../../src/services/community-events.js";
import { PRIVACY_VERSION } from "../../src/services/site-achievements.js";
import { actionFor, actorFor } from "./actions.mjs";
import { argumentsFor, assertTarget, Histogram } from "./common.mjs";

// Reuse the Socket.IO client already installed by the frontend.
const { io } = createRequire(new URL("../../../client/package.json", import.meta.url))("socket.io-client");
const args = argumentsFor(process.argv.slice(2));
if (!args.manifest || !args.output) throw new Error("Required: --manifest FILE --output REPORT.json");
const manifest = JSON.parse(fs.readFileSync(args.manifest,"utf8"));
const target = assertTarget(args.target || `http://127.0.0.1:${manifest.port}`, manifest);
const targets = args.targets ? args.targets.split(",").map((value) => assertTarget(value, manifest)) : [target];
const count = Number(args.clients || 10), seconds = Number(args.seconds || 90), rampMs = Number(args["ramp-ms"] || 150);
const roomRampMs=Number(args["room-ramp-ms"] || 500);
const actionMs = Number(args["action-ms"] || 250), browseMs = Number(args["browse-ms"] || 5000);
const routinePolls = args["routine-polls"] === "true";
const liveState = args["live-state"] === "true";
const chatEnabled = args.chat !== "false", eventsEnabled = args.events !== "false", reconnectEnabled = args.reconnect !== "false";
const loopLimitMs = Number(args["loop-limit-ms"] || 500), freeMemoryMb = Number(args["free-memory-mb"] || 150), errorLimit = Number(args["error-limit"] || 10);
if (!Number.isFinite(loopLimitMs) || loopLimitMs < 100 || !Number.isFinite(freeMemoryMb) || freeMemoryMb < 150 || !Number.isFinite(errorLimit) || errorLimit < 1) throw new Error("Invalid safety thresholds.");
const setupConcurrency = Number(args["setup-concurrency"] || 1);
if (!Number.isInteger(setupConcurrency) || setupConcurrency < 1 || setupConcurrency > 16) throw new Error("Setup concurrency: 1..16.");
if (!Number.isFinite(actionMs) || actionMs < 250 || !Number.isFinite(browseMs) || browseMs < 5000) throw new Error("Minimum cadence: 250ms/action, 5000ms/browse.");
if (!Number.isInteger(count) || count < 2 || count > Math.min(2000,manifest.users.length) || !Number.isInteger(seconds) || seconds < 10 || seconds > 1800 || !Number.isFinite(rampMs) || rampMs < 50 || !Number.isFinite(roomRampMs) || roomRampMs<80) throw new Error("Invalid client count, duration or ramp (minimum 50ms/client, 80ms/table).");
if(manifest.expiresAt && Date.parse(manifest.expiresAt)-Date.now()<seconds*1000+count*(rampMs+300)+Math.ceil(count/2)*roomRampMs+180000)throw new Error("Fixture expires too soon for setup, load and cleanup. Start a new instance with a longer TTL.");
const selectedGames = args.games && args.games !== "all" ? args.games.split(",") : games.map((game) => game.id);
if (!selectedGames.length || selectedGames.some((id) => !games.some((game) => game.id === id))) throw new Error("Unknown game.");
const configResponse = await fetch(`${target}/api/config`, {signal:AbortSignal.timeout(5000)});
const config = await configResponse.json();
if (config.siteName !== manifest.runId || config.emailVerificationAvailable) throw new Error("Safety check failed: instance marker mismatch or email delivery enabled. No mutation sent.");
for (const endpoint of new Set(targets)) {
  const response = await fetch(`${endpoint}/api/config`, { signal: AbortSignal.timeout(5000) });
  const marker = await response.json();
  if (marker.siteName !== manifest.runId || marker.emailVerificationAvailable) throw new Error("Safety check failed: tunnel points to a different instance.");
}

const latency = new Histogram(), byRoute = new Map(), byPhase = new Map(), statuses = {}, failures = {}, health = [], coverage = {};
const counters = { requests:0, errors:0, cancelledAtStop:0, connections:0, disconnects:0, reconnects:0, roomUpdates:0, chatMessages:0, started:0, completed:0, actions:0, expectedDenials:0, checks:0 };
const clients = [], cohorts = [], workers = [], claimedRankedRooms = new Set(), loop = monitorEventLoopDelay({resolution:20}); loop.enable();
let stop = false, stopReason = "duration", phase = "setup", deadline = Infinity, eventId = "";
let beginLoad, loadStartedAt, loadEndTimer;
const loadGate = new Promise((resolve) => { beginLoad = resolve; });
const startedAt = new Date().toISOString(), cpuStart = process.cpuUsage();
const loadAbort = new AbortController();
setMaxListeners(0, loadAbort.signal);
const sleep = (ms) => new Promise((resolve) => {
  if (loadAbort.signal.aborted) return resolve();
  const done = () => { clearTimeout(timer); loadAbort.signal.removeEventListener("abort", done); resolve(); };
  const timer = setTimeout(done, ms);
  loadAbort.signal.addEventListener("abort", done, {once:true});
});
function fail(reason) { if(!failures[reason])console.log(JSON.stringify({failure:reason}));failures[reason] = (failures[reason] ?? 0)+1; }
function stopRun(reason) { if (!stop) {stop=true;stopReason=reason;loadAbort.abort();console.log(JSON.stringify({stopping:reason}));} }
process.on("SIGINT",()=>stopRun("interrupted")); process.on("SIGTERM",()=>stopRun("interrupted"));
process.on("disconnect",()=>stopRun("interrupted"));
process.stdin.on("data", (value) => { if (String(value).trim() === "stop") stopRun("interrupted"); });
process.stdin.unref?.();
async function request(client, route, method="GET", body, allowed=[], expectedStatus=null) {
  const start=performance.now(), requestPhase=phase, key=`${method} ${route.replace(/\/rooms\/[^/?]+/g,"/rooms/:code").replace(/\/community-events\/[^/?]+/g,"/community-events/:id").split("?")[0]}`;
  let status="NETWORK", data;
  try {
    const timeout = AbortSignal.timeout(8000);
    const signal = requestPhase === "cleanup" ? timeout : AbortSignal.any([timeout, loadAbort.signal]);
    const response=await fetch(`${client?.target || target}${route}`, {method,signal,headers:{"Content-Type":"application/json",...(client?.token?{Authorization:`Bearer ${client.token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    status=response.status;
    const text=await response.text();
    try {data=JSON.parse(text);} catch {data={error:"Non-JSON response"};}
    if(expectedStatus!==null && status!==expectedStatus)throw new Error(`Expected HTTP ${expectedStatus}, received ${status}`);
    if (!response.ok && !allowed.includes(status)) throw new Error(`${status}: ${data.error || "HTTP failure"}`);
    if (allowed.includes(status)) counters.expectedDenials++;
    return data;
  } catch(error) {
    if (requestPhase !== "cleanup" && loadAbort.signal.aborted) { counters.cancelledAtStop++; throw error; }
    const cause = error.cause?.code || error.cause?.name;
    counters.errors++; fail(`${key}: ${error.message.slice(0,160)}${cause ? ` (${cause})` : ""}`);
    throw error;
  } finally {
    const elapsed=performance.now()-start;latency.add(elapsed);const histogram=byRoute.get(key)??new Histogram();histogram.add(elapsed);byRoute.set(key,histogram);
    const phaseHistogram=byPhase.get(requestPhase)??new Histogram();phaseHistogram.add(elapsed);byPhase.set(requestPhase,phaseHistogram);
    statuses[status]=(statuses[status]??0)+1;counters.requests++;
  }
}
const monitor={token:manifest.monitorToken};
async function connect(client) {
  const socket=io(client.target || target,{auth:{token:client.token,stream:client.stream,lobbyDeltas:true},transports:["websocket"],forceNew:true,reconnection:true,reconnectionDelay:1000,timeout:8000,autoConnect:false});
  client.socket=socket;
  socket.on("room",(room)=>{counters.roomUpdates++;client.liveRoom=room;});socket.on("chat-message",()=>counters.chatMessages++);
  socket.on("room-error",()=>fail("WebSocket room subscription rejected"));
  socket.on("connect",()=>{counters.connections++;if(client.room)socket.emit("watch-room",{roomId:client.room.id,spectator:client.spectator===true});});
  socket.on("disconnect",(reason)=>{if(phase!=="cleanup" && reason!=="io client disconnect")counters.disconnects++;});
  socket.on("connect_error",()=>fail("WebSocket connect_error"));
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error("WebSocket connection timeout")),10000);socket.once("connect",()=>{clearTimeout(timeout);resolve();});socket.once("connect_error",()=>{clearTimeout(timeout);reject(new Error("WebSocket connection failed"));});socket.connect();});
}
function watch(client,room,spectator=false) {client.room=room;client.spectator=spectator;client.socket.emit("watch-room",{roomId:room.id,spectator});(client.inboxSocket ?? client.socket).emit("chat-subscribe",{roomCode:room.code});}
async function classic(group,gameId) {
  const owner=group[0],room=await request(owner,"/api/rooms","POST",{gameId,name:`Capacity ${gameId}`,isPublic:true,stake:1000});
  for(const client of group.slice(1)){await request(client,`/api/rooms/${room.code}/join`,"POST",{});await request(client,`/api/rooms/${room.code}/ready`,"POST",{});}
  for(const client of group)watch(client,room);
  const started=await request(owner,`/api/rooms/${room.code}/start`,"POST",{});
  return started;
}
async function ranked(group,gameId) {
  for(const client of group)await request(client,"/api/ranked/queue","POST",{gameId});
  const limit=Date.now()+90000;
  while(!stop && Date.now()<limit){
    for(const client of group){
      const status=await request(client,"/api/ranked");
      if(status.proposal && !status.proposal.accepted)await request(client,"/api/ranked/ready","POST",{proposalId:status.proposal.id});
      if(status.match){const room=await request(client,`/api/rooms/${status.match.code}`);watch(client,room);}
    }
    if(group.every((client)=>client.room))return request(group[0],`/api/rooms/${group[0].room.code}`);
    await sleep(1500);
  }
  if(!stop)throw new Error("Ranked matchmaking did not start within 90 seconds.");
  return null;
}
async function play(cohort) {
  let {group,gameId}=cohort;
  try {
    let room=cohort.ranked?await ranked(group,gameId):await classic(group,gameId);
    if(!room)return;
    if(cohort.ranked){
      if(claimedRankedRooms.has(room.code))return;
      claimedRankedRooms.add(room.code);
      group=room.players.map((player)=>clients.find((client)=>client.id===player.id));cohort.group=group;
    }
    cohort.room=room;counters.started++;coverage[gameId]??={started:0,actions:0,completed:0};coverage[gameId].started++;
    cohort.preparedResolve();
    await loadGate;
    if (routinePolls) await sleep(Math.random()*actionMs);
    let lastActivity=Date.now(), steps=0;
    while(!stop && Date.now()<deadline){
      if (liveState && group[0].liveRoom?.id === room.id && group[0].liveRoom.state) room=group[0].liveRoom;
      if(room.finished || room.state?.finished){
        counters.completed++;coverage[gameId].completed++;
        await request(group[0],`/api/rooms/${room.code}/action`,"POST",{type:"capacity-finished-check"},[404],404);counters.checks++;
        if(cohort.ranked || Date.now()+15000>=deadline)break;
        if(!cohort.ranked)await request(group[0],`/api/rooms/${room.code}`,"DELETE");
        for(const client of group)client.room=null;
        room=cohort.ranked?await ranked(group,gameId):await classic(group,gameId);
        if(!room)break;
        cohort.room=room;counters.started++;coverage[gameId].started++;lastActivity=Date.now();continue;
      }
      if(room.pacing){room=await request(group[0],`/api/rooms/${room.code}/pacing/skip`,"POST",{pacingId:room.pacing.id},[404,409]);if(!room.state)room=await request(group[0],`/api/rooms/${cohort.room.code}`);continue;}
      const actorId=actorFor(room.state),actor=clients.find((client)=>client.id===actorId);
      if(!actor){throw new Error(`Unexpected actor in ${gameId}`);}
      const own=liveState && actor.liveRoom?.id === room.id && actor.liveRoom.state && actorFor(actor.liveRoom.state) === actorId
        ? actor.liveRoom : await request(actor,`/api/rooms/${room.code}`);
      const action=actionFor(own.state,actorId);
      if(action){
        const rollWait=Math.max(0,(own.state.rollAvailableAt?.[actorId]??0)-Date.now());
        if(action.type==="roll" && rollWait)await sleep(rollWait+25);
        const result=await request(actor,`/api/rooms/${room.code}/action`,"POST",action,[409]);
        if(result.state){room=result;actor.liveRoom=result;counters.actions++;coverage[gameId].actions++;steps++;lastActivity=Date.now();}
        else room=await request(actor,`/api/rooms/${room.code}`);
      } else {await sleep(400);room=await request(actor,`/api/rooms/${room.code}`);}
      if(Date.now()-lastActivity>30000)throw new Error(`No playable action for 30 seconds: ${gameId}`);
      await sleep(actionMs+Math.random()*actionMs);
    }
    cohort.steps=steps;
  } catch(error){if (!loadAbort.signal.aborted) fail(`Game worker: ${gameId}: ${error.message.slice(0,180)}`);}
  finally { cohort.preparedResolve(); }
}
async function browse(client,index) {
  const routes=["/api/me","/api/friends","/api/shop","/api/achievements","/api/rooms","/api/history?paged=1","/api/transactions?paged=1","/api/leaderboards?period=all","/api/me/statistics?days=30","/api/chat/unread","/api/chat/messages?channelType=global","/api/community-events/featured"];
  let cycle=0;
  await sleep(routinePolls ? 1500+Math.random()*browseMs : 1500+(index%20)*250);
  while(!stop && Date.now()<deadline){
    try {
      await request(client,routes[(index+cycle)%routes.length]);
      if(chatEnabled && index%10===0 && cycle%3===0 && client.room){const channelType=cycle%2?"room":"direct";await request(client,"/api/chat/messages","POST",{channelType,roomCode:client.room.code,friendId:manifest.users[index%2===0?index+1:index-1]?.id,content:`Capacity message ${cycle}`});}
      if(chatEnabled && index%40===0 && cycle%6===0){await sleep(1100);await request(client,"/api/chat/messages","POST",{channelType:"global",content:`Capacity global ${cycle}`});}
      if(index<2 && eventId && cycle%3===0){
        const idempotency=randomUUID();const event=await request(client,`/api/community-events/${eventId}/actions`,"POST",{requestId:idempotency});
        const duplicate=await request(client,`/api/community-events/${eventId}/actions`,"POST",{requestId:idempotency});
        if(event.action?.id!==duplicate.action?.id)throw new Error("Community action idempotency failed");counters.checks++;
      }
      if(reconnectEnabled && index%20===0 && cycle===3){client.socket.disconnect();await sleep(500);client.socket.connect();counters.reconnects++;}
    } catch(error){if(error.message.includes("idempotency"))stopRun(error.message);}
    cycle++;await sleep(browseMs+Math.random()*browseMs*.6);
  }
}
async function sample() {
  let consecutive=0, before=counters.errors;
  while(!stop && Date.now()<deadline){
    try {
      const h=await request(monitor,"/api/admin/health?points=30");
      health.push(healthSnapshot(h));
      if (health.length > 720) health.splice(1, 1);
      const delta=counters.errors-before;before=counters.errors;
      consecutive = Math.max(h.eventLoop.p95Ms,h.processes?.accounts?.eventLoopP95??0,...(h.gameWorkers?.workers ?? []).map((row)=>row.eventLoopP95??0))>loopLimitMs || h.system.freeMemory<freeMemoryMb*1024*1024 || delta>errorLimit ? consecutive+1 : 0;
      if(consecutive>=3)stopRun("Safety threshold exceeded for 3 consecutive samples");
    }catch{consecutive++;if(consecutive>=3)stopRun("Health unavailable for 3 consecutive samples");}
    console.log(JSON.stringify({at:new Date().toISOString(),phase,loadStartedAt,health:health.at(-1),clients:clients.length,connected:clients.filter((c)=>c.socket?.connected).length,requests:counters.requests,errors:counters.errors,actions:counters.actions,completed:counters.completed,p95Ms:latency.percentile(.95)}));
    await sleep(5000);
  }
}
function healthSnapshot(h) {
  return {at:new Date().toISOString(),cpu:h.processTotals?.cpuPercent??h.process.cpuPercent,siteCpu:h.process.cpuPercent,accountsCpu:h.processes?.accounts?.cpuPercent??null,systemCpu:h.system.cpuPercent,cpuCount:h.system.cpuCount,rss:h.processTotals?.memoryRss??h.process.memory.rss,siteRss:h.process.memory.rss,accountsRss:h.processes?.accounts?.memoryRss??null,heapUsed:h.process.memory.heapUsed,loopP95:h.eventLoop.p95Ms,loopMax:h.eventLoop.maxMs,accountsLoopP95:h.processes?.accounts?.eventLoopP95??null,rps:h.traffic.requestsPerSecond,sockets:h.realtime.sockets,rooms:h.realtime.playingRooms,systemFreeMemory:h.system.freeMemory,workers:h.workers,services:h.services,caches:h.caches,processes:h.processes,gameWorkers:h.gameWorkers};
}
async function routine(client) {
  const tasks = [
    { interval:10000, route:"/api/notifications", method:"GET" },
    { interval:60000, route:"/api/chat/unread", method:"GET" },
    { interval:30000, route:"/api/me/activity", method:"POST" }
  ].map((row)=>({...row,next:Date.now()+Math.random()*row.interval}));
  while (!stop && Date.now()<deadline) {
    for (const task of tasks) {
      if (stop || Date.now()<task.next) continue;
      task.next=Date.now()+task.interval;
      try { await request(client,task.route,task.method,task.method==="POST" ? {page:client.room?"room":"lobby",roomCode:client.room?.code} : undefined); } catch {}
    }
    await sleep(1000);
  }
}
try {
  // Community events retain their production-specific IP limiter; only two participants act slowly.
  if (eventsEnabled) {
  const event=defaultCommunityEvent();event.name=`Capacity ${manifest.runId}`;event.slug=`${manifest.runId}-${randomUUID().slice(0,6)}`;
  event.startsAt=new Date(Date.now()-60000).toISOString();event.endsAt=new Date(Date.now()+3600000).toISOString();
  event.actions.freeCount=100;event.objective.max=10000000;event.objective.startValue=10000000;
  const created=await request(monitor,"/api/admin/community-events","POST",event);eventId=created.event.id;
  await request(monitor,`/api/admin/community-events/${eventId}/status`,"POST",{status:"active"});
  }
  workers.push(sample());
  async function setupClient(i) {
    const endpoint = targets[i % targets.length];
    const fixture=manifest.users[i],login=await request({target:endpoint},"/api/auth/login","POST",{login:fixture.login,password:manifest.password});
    if(!login.token)throw new Error("Real password login did not return a session.");
    const client={id:fixture.id,token:login.token,target:endpoint,fixtureIndex:i,stream:routinePolls ? "lobby" : undefined};clients.push(client);await connect(client);
    if (routinePolls) {
      const inbox = { id:client.id, token:client.token, target:endpoint, stream:"conversation" };
      await connect(inbox); client.inboxSocket=inbox.socket;
      await request(client,"/api/me/privacy","POST",{version:PRIVACY_VERSION,enabled:true,ageConfirmed:true,chosenAt:Date.now()});
    }
    if(i<2 && eventId)await request(client,`/api/community-events/${eventId}/join`,"POST",{requestId:randomUUID()});
    await sleep(rampMs);
  }
  let setupCursor = 0;
  const setupJobs = Array.from({ length:setupConcurrency }, async () => {
    while (setupCursor < count && !stop) {
      const index = setupCursor++;
      try { await setupClient(index); } catch (error) { stopRun("setup failed"); throw error; }
    }
  });
  const setupResults = await Promise.allSettled(setupJobs);
  const setupError = setupResults.find((result) => result.status === "rejected");
  if (setupError) throw setupError.reason;
  clients.sort((a,b) => a.fixtureIndex-b.fixtureIndex);
  phase="preparation";
  let cursor=0, gameIndex=0;
  while(cursor<clients.length && !stop){
    const gameId=selectedGames[gameIndex%selectedGames.length],game=games.find((row)=>row.id===gameId);
    const rankedMode=args.ranked==="true" && gameIndex%5===0 && ["yahtzee","421","midnight-dice","president","belote"].includes(gameId);
    const size=rankedMode?Math.max(2,game.minPlayers):Math.min(game.maxPlayers,Math.max(game.minPlayers,2));
    if(cursor+size>clients.length)break;
    const group=clients.slice(cursor,cursor+size),cohort={group,gameId,ranked:rankedMode};cohorts.push(cohort);
    cohort.prepared = new Promise((resolve) => { cohort.preparedResolve = resolve; });
    workers.push(play(cohort));cursor+=size;gameIndex++;await sleep(roomRampMs);
  }
  await Promise.all(cohorts.map((cohort) => cohort.prepared));
  if (Object.keys(failures).length) stopRun("preparation failed");
  phase="load";loadStartedAt=new Date().toISOString();deadline=Date.now()+seconds*1000;
  loadEndTimer = setTimeout(() => stopRun("duration"), seconds*1000);
  beginLoad();
  for(const [index,client] of clients.entries()) {
    workers.push(browse(client,index));
    if (routinePolls) workers.push(routine(client));
  }
  // Unseated clients inspect live games as spectators and verify mutation is denied.
  for(const client of clients.slice(cursor)) {
    const room=cohorts.find((c)=>c.room)?.room;
    if(room){await request(client,`/api/rooms/${room.code}/join`,"POST",{});watch(client,room,true);await request(client,`/api/rooms/${room.code}/action`,"POST",{type:"roll"},[403],403);counters.checks++;}
  }
  await Promise.allSettled(workers);
} catch(error){fail(`Setup: ${error.message.slice(0,180)}`);stopRun("setup failed");}
finally {
  stop=true;phase="cleanup";
  console.log(JSON.stringify({at:new Date().toISOString(),phase,loadStartedAt,clients:clients.length,connected:clients.filter((c)=>c.socket?.connected).length,requests:counters.requests,errors:counters.errors,actions:counters.actions,completed:counters.completed,p95Ms:latency.percentile(.95)}));
  clearTimeout(loadEndTimer);
  loadAbort.abort();
  beginLoad();
  await Promise.allSettled(workers);
  const cleanupUntil=Date.now()+Math.max(60000,count*200);
  // End fictitious tables through the real leave/delete APIs, never direct DB mutation.
  for(const c of cohorts.filter((c)=>c.room)){
    if(Date.now()>cleanupUntil)break;
    // Keep the host seated until last: Belote transfers ownership on host departure.
    for(const client of [...c.group].reverse()){try{await request(client,`/api/rooms/${c.room.code}/leave`,"POST",{},[404]);}catch{}}
    if(!c.ranked){try{await request(c.group[0],`/api/rooms/${c.room.code}`,"DELETE",undefined,[404]);}catch{}}
  }
  for(const client of clients){
    if(args.ranked==="true" && Date.now()<cleanupUntil){try{await request(client,"/api/ranked/queue","DELETE");}catch{}}
    client.socket?.disconnect();
    client.inboxSocket?.disconnect();
  }
  try { health.push(healthSnapshot(await request(monitor,"/api/admin/health?points=1"))); } catch {}
  loop.disable();
  const report={runId:manifest.runId,target,targets,startedAt,loadStartedAt,finishedAt:new Date().toISOString(),clients:clients.length,seated:cohorts.filter((c)=>c.room).reduce((sum,c)=>sum+c.group.length,0),seconds,rampMs,roomRampMs,setupConcurrency,actionMs,browseMs,routinePolls,liveState,stopReason,rateLimits:manifest.rateLimits,
    credentialWorkFactor:manifest.passwordRounds ?? 10, architecture:manifest.architecture,
    scenario:"Real password logins; independent WebSockets; legal public-state game actions; pacing skip; browsing, chat, events, reconnects, ranked when requested. No production data, SMTP or browser analytics.",
    counters,statuses,latency:latency.summary(),phases:Object.fromEntries([...byPhase].map(([key,value])=>[key,value.summary()])),routes:Object.fromEntries([...byRoute].map(([key,value])=>[key,value.summary()])),coverage,failures,health,
    generator:{cpu:process.cpuUsage(cpuStart),rss:process.memoryUsage().rss,eventLoopP95Ms:Number(loop.percentile(95)/1e6).toFixed(1),eventLoopMaxMs:Number(loop.max/1e6).toFixed(1)},
    passed:stopReason==="duration" && counters.errors===0 && Object.keys(failures).length===0 && counters.actions>0 && counters.roomUpdates>0 && clients.length===count};
  fs.mkdirSync(path.dirname(path.resolve(args.output)),{recursive:true});fs.writeFileSync(args.output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({report:path.resolve(args.output),passed:report.passed,...counters,coverage,failures}));
  process.exitCode=report.passed?0:1;
  if (process.connected) process.disconnect();
}
