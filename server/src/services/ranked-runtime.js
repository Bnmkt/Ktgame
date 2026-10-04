import { randomUUID } from "node:crypto";
import { RANKED_GAMES, balancedBeloteSeats, eloFor, matchQueue, normalizeRankedConfig, searchRange } from "./ranked.js";
import { gameProgress } from "./game-progression.js";

export function createRankedRuntime({ app, auth, requireAdmin, readDb, updateDb, rankedRows, rankedRecent, games, platformSettings,
  userFeatureAccess, roomCode, roomPlayerFor, startRoomRound, finishRoomIfNeeded, removePlayerFromRoomState, cashOutPokerPlayer,
  addTokens, sanitizeFriendUser, emitRoomUpdate, broadcastRooms, io, isWatching }) {
  const queue = new Map();
  const config = (db = readDb()) => normalizeRankedConfig(db.settings?.ranked, games(db), platformSettings(db));
  function activeMatch(db, userId) { return db.rooms.find((r)=>r.ranked && !r.finished && r.ranked.roster.some((p)=>p.id===userId && !r.ranked.forfeits?.[userId])); }
  function eligibility(db,user,gameId) {
    const settings=config(db), rules=settings.games[gameId];
    if (!user || user.guest || user.isBot || user.active === false) return "Un compte enregistré est nécessaire.";
    if (!settings.enabled || !rules?.enabled) return "Le classé est indisponible pour ce jeu.";
    for (const feature of ["rooms:join",`game:${gameId}`]) { const access=userFeatureAccess(user,feature,db); if (!access.allowed) return access.message || access.reason || "Accès classé restreint."; }
    if (user.tokens < rules.preset.stake) return "Jetons insuffisants pour la mise classée.";
    if (db.rooms.some((r)=>r.state && !r.finished && r.players.some((p)=>p.id===user.id))) return "Termine ta partie avant de rejoindre une file.";
    return "";
  }
  function status(db,userId) {
    const settings=config(db), user=db.users.find((u)=>u.id===userId), entry=queue.get(userId), match=activeMatch(db,userId), now=Date.now();
    return { games:RANKED_GAMES.map((id)=>({id,name:games(db).find((g)=>g.id===id)?.name, ...eloFor(user,id,settings.games[id]),enabled:settings.enabled && settings.games[id].enabled,players:settings.games[id].players,maximumPlayers:settings.games[id].maximumPlayers,preset:settings.games[id].preset,
      limits:{afkSeconds:settings.games[id].afkSeconds,reconnectSeconds:settings.games[id].reconnectSeconds,abandonPenalty:settings.games[id].abandonPenalty,afkPenalty:settings.games[id].afkPenalty}})),
      queue:entry ? {gameId:entry.gameId,elo:entry.elo,joinedAt:entry.joinedAt,range:searchRange(entry,settings.games[entry.gameId],now),players:settings.games[entry.gameId].players,
        waiting:[...queue.values()].filter((r)=>r.gameId===entry.gameId).length} : null,
      match:match ? {code:match.code,gameId:match.gameId} : null, serverTime:now };
  }
  function match(now=Date.now()) {
    const db=readDb(), settings=config(db);
    for (const entry of queue.values()) {
      const user=db.users.find((u)=>u.id===entry.userId), rules=settings.games[entry.gameId];
      if (now-entry.heartbeat>120000 || eligibility(db,user,entry.gameId) || rules.queueSeconds && now-entry.joinedAt>rules.queueSeconds*1000) queue.delete(entry.userId);
    }
    for (const gameId of RANKED_GAMES) {
      const rules=settings.games[gameId];
      if (!settings.enabled || !rules.enabled) continue;
      let group;
      while ((group=matchQueue([...queue.values()].filter((r)=>r.gameId===gameId),rules,now)).length) {
        const room=updateDb((current)=> {
          // No await between eligibility checks, room creation and its atomic commit.
          for (const entry of group) { const error=eligibility(current,current.users.find((u)=>u.id===entry.userId),gameId); if (error) throw new Error(error); }
          const seats=gameId === "belote" ? balancedBeloteSeats(group) : group.map((r)=>r.userId);
          const preset=rules.preset;
          const created={id:randomUUID(),code:roomCode(),gameId,name:`${games(current).find((g)=>g.id===gameId).name} · Classé`,ownerId:"ranked-server",isPublic:rules.spectators,stake:preset.stake,
            minLevel:1,maxLevel:null,players:seats.map((id)=>roomPlayerFor(current.users.find((u)=>u.id===id))),gameModifiers:preset.gameModifiers,readyPlayerIds:seats,finished:false,createdAt:new Date(now).toISOString(),
            ...(gameId === "belote" ? {beloteSeats:seats} : {}),
            ...(gameId === "texas-holdem" ? {pokerBlinds:{smallBlind:preset.bigBlind/2,bigBlind:preset.bigBlind,maximumBet:preset.maximumBet},pokerTurnSeconds:preset.turnSeconds} : {}),
            ranked:{matchId:randomUUID(),config:structuredClone(rules),roster:seats.map((id,index)=>({id,pseudo:roomPlayerFor(current.users.find((u)=>u.id===id)).pseudo,...(gameId === "belote" ? {team:index%2} : {})})),forfeits:{},actionAt:now,startedAt:now}};
          current.rooms.push(created);
          const error=startRoomRound(created,current); if (error) throw new Error(error);
          return created;
        });
        for (const entry of group) { queue.delete(entry.userId); io.to(`account:${entry.userId}`).emit("ranked-match",{code:room.code,gameId}); }
        emitRoomUpdate(room); broadcastRooms();
      }
    }
  }
  function stillPlaying(room,id) {
    if (room.ranked.forfeits[id] || !room.state.players.some((p)=>p.id===id)) return false;
    if (room.gameId === "president" && room.state.finishedOrder.includes(id)) return false;
    if (room.gameId === "liars-dice" && !(room.state.diceCounts[id]>0)) return false;
    if (room.gameId === "texas-holdem" && !(room.state.stacks[id]>0) && !room.state.allInPlayerIds?.includes(id)) return false;
    return true;
  }
  function forfeit(room,db,id,reason="abandon") {
    if (!room.ranked || room.finished || room.ranked.forfeits[id]) return false;
    if (!stillPlaying(room,id)) return false;
    room.ranked.forfeits[id]=reason;
    if (room.gameId === "belote") {
      const team=room.ranked.roster.find((p)=>p.id===id).team;
      room.state.finished=true; room.state.winners=room.ranked.roster.filter((p)=>p.team!==team).map((p)=>p.id);
    } else if (room.gameId === "texas-holdem") cashOutPokerPlayer(room,db,id,"ranked-abandon-cash-out");
    else {
      room.players=room.players.filter((p)=>p.id!==id); removePlayerFromRoomState(room,id);
      if (room.gameId === "president") {
        const remaining=room.state.players.filter((p)=>!room.state.finishedOrder.includes(p.id));
        if (remaining.length<=1) {
          if (remaining.length) room.state.finishedOrder.push(remaining[0].id);
          room.state.finished=true;room.state.winners=room.state.finishedOrder.slice(0,1);
        } else if (!remaining.some((p)=>p.id===room.state.players[room.state.currentPlayerIndex]?.id)) {
          room.state.currentPlayerIndex=room.state.players.findIndex((p)=>p.id===remaining[0].id);
        }
      }
    }
    room.pacing=null;
    room.ranked.actionAt=Date.now(); room.ranked.turnActor=null;
    finishRoomIfNeeded(room,db);
    return true;
  }
  function tick(now=Date.now()) {
    match(now);
    if (!readDb().rooms.some((r)=>r.ranked && r.state && !r.finished)) return;
    const changed=[];
    updateDb((db)=> {
      for (const room of db.rooms.filter((r)=>r.ranked && r.state && !r.finished)) {
        const rules=room.ranked.config;
        room.ranked.offline ??= {};
        for (const player of room.ranked.roster) {
          if (!stillPlaying(room,player.id) || room.finished) continue;
          if (isWatching(room.id,player.id)) {
            if (room.ranked.offline[player.id] !== undefined && room.state.players[room.state.currentPlayerIndex]?.id === player.id) {
              room.ranked.actionAt=now;
              if (room.gameId === "texas-holdem") room.state.turnDeadline=now+room.state.turnDurationMs;
            }
            delete room.ranked.offline[player.id];
          }
          else room.ranked.offline[player.id] ??= now;
          if (room.ranked.offline[player.id] && now-room.ranked.offline[player.id]>=rules.reconnectSeconds*1000) {
            if (forfeit(room,db,player.id,"disconnect")) changed.push(room);
          }
        }
        if (room.finished || room.pacing || room.state.nextHandAt) { room.ranked.paused=true; continue; }
        if (room.ranked.paused) {room.ranked.paused=false;room.ranked.actionAt=now;}
        const actor=room.state.players[room.state.currentPlayerIndex]?.id;
        if (room.ranked.turnActor!==actor) {room.ranked.turnActor=actor;room.ranked.actionAt=now;}
        const deadline=Math.min(room.ranked.actionAt+rules.afkSeconds*1000,room.gameId === "texas-holdem" ? room.state.turnDeadline ?? Infinity : Infinity);
        if (actor && !room.ranked.offline[actor] && now>=deadline && forfeit(room,db,actor,"afk")) changed.push(room);
      }
    });
    for (const room of new Set(changed)) emitRoomUpdate(room);
    if (changed.length) broadcastRooms();
  }
  app.get("/api/ranked",auth,(req,res)=> {
    const entry=queue.get(req.auth.id); if (entry) entry.heartbeat=Date.now();
    res.setHeader("Cache-Control","no-store");res.json(status(readDb(),req.auth.id));
  });
  app.post("/api/ranked/queue",auth,(req,res)=> {
    try {
      const db=readDb(),user=db.users.find((u)=>u.id===req.auth.id), gameId=String(req.body.gameId ?? "");
      const error=eligibility(db,user,gameId);if(error) return res.status(403).json({error});
      const existing=queue.get(user.id); if(existing && existing.gameId!==gameId) return res.status(409).json({error:"Quitte d'abord ta file actuelle."});
      const now=Date.now(); if (!existing) queue.set(user.id,{userId:user.id,gameId,elo:eloFor(user,gameId,config(db).games[gameId]).elo,joinedAt:now,heartbeat:now});
      match(now);res.json(status(readDb(),user.id));
    } catch(error) {res.status(400).json({error:error.message});}
  });
  app.delete("/api/ranked/queue",auth,(req,res)=>{queue.delete(req.auth.id);res.json(status(readDb(),req.auth.id));});
  app.get("/api/ranked/leaderboard/:gameId",auth,(req,res)=> {
    const db=readDb(),id=req.params.gameId;if(!RANKED_GAMES.includes(id)) return res.status(404).json({error:"Jeu classé introuvable."});
    const rules=config(db).games[id];
    res.json({gameId:id,minimumGames:rules.minimumGames,rows:rankedRows(id,rules.minimumGames).map((row,index)=> {
      const user=db.users.find((u)=>u.id===row.id),progress=gameProgress(user,id,platformSettings(db).gameProgression);
      return {...row,rank:index+1,level:progress.level,mastery:progress.mastery,user:sanitizeFriendUser(user,db)};
    })});
  });
  app.get("/api/ranked/history",auth,(req,res)=>res.json({rows:rankedRecent(req.auth.id)}));
  app.get("/api/admin/ranked",auth,requireAdmin,(_req,res)=>res.json({settings:config(),games:games(),queues:RANKED_GAMES.map((id)=>({gameId:id,count:[...queue.values()].filter((r)=>r.gameId===id).length})),matches:readDb().rooms.filter((r)=>r.ranked && !r.finished).map((r)=>({code:r.code,name:r.name}))}));
  app.put("/api/admin/ranked",auth,requireAdmin,(req,res)=> {
    try {const next=normalizeRankedConfig(req.body,games(),platformSettings());updateDb((db)=>{db.settings.ranked=next;});res.json(next);} catch(error){res.status(400).json({error:error.message});}
  });
  app.post("/api/admin/ranked/:code/cancel",auth,requireAdmin,(req,res)=> {
    const reason=String(req.body.reason??"").trim().slice(0,1000);if(!reason)return res.status(400).json({error:"Indique la raison technique de l'annulation."});
    const room=updateDb((db)=> {
      const room=db.rooms.find((r)=>r.code===req.params.code && r.ranked && !r.finished);if(!room)return null;
      room.ranked.cancelled={reason,by:req.auth.id,at:new Date().toISOString()};
      for(const player of room.ranked.roster) addTokens(db,player.id,room.stake-(room.state.departedPayouts?.[player.id] ?? 0),{gameId:room.gameId,roomId:room.id,reason:"ranked-technical-refund"});
      room.state.finished=true;room.state.winners=[];room.pacing=null;finishRoomIfNeeded(room,db);return room;
    });
    if(!room)return res.status(404).json({error:"Partie classée introuvable."});emitRoomUpdate(room);broadcastRooms();res.json({ok:true});
  });
  // Restart grace: existing matches survive without charging downtime as AFK.
  for(const room of readDb().rooms.filter((r)=>r.ranked && !r.finished)) {room.ranked.actionAt=Date.now();room.ranked.offline={};room.ranked.turnActor=null;if(room.state?.turnDeadline)room.state.turnDeadline=Date.now()+room.ranked.config.reconnectSeconds*1000;}
  return { config, forfeit, tick, action(room) {if(room.ranked){room.ranked.actionAt=Date.now();room.ranked.turnActor=room.state.players[room.state.currentPlayerIndex]?.id;}}, status };
}
