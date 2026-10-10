import { createRankedRoomRuntime } from "./ranked-room-runtime.js";
import { randomUUID } from "node:crypto";
import { RANKED_GAMES, balancedBeloteSeats, competitiveFor, eloFor, matchmakingElo, matchQueue, normalizeRankedConfig, queueGroupFor, rankFor, rankProgress, rankedResultFor, searchRange } from "./ranked.js";
import { gameProgress } from "./game-progression.js";
import { calculateElo } from "./ranked-elo.js";
import { placementEvidence, recordPlacement } from "./ranked-placement.js";
import { roomWriteScope } from "../storage/room-write-scope.js";

export function createRankedRuntime({ app, auth, requireAdmin, readDb, updateDb, rankedRows, rankedRecent, rankedSettlement, rankedMetrics, games, platformSettings,
  userFeatureAccess, roomCode, roomPlayerFor, startRoomRound, finishRoomIfNeeded, removePlayerFromRoomState, cashOutPokerPlayer,
  addTokens, sanitizeFriendUser, emitRoomUpdate, broadcastRooms, io, isWatching, insigniaStore, rankedConfig, roomDriver }) {
  const { stillPlaying, forfeit } = createRankedRoomRuntime({ cashOutPokerPlayer, removePlayerFromRoomState, finishRoomIfNeeded });
  const queue = new Map();
  const offers = new Map();
  const config = (db = readDb()) => rankedConfig ? rankedConfig(db) : normalizeRankedConfig(db.settings?.ranked, games(db), platformSettings(db));
  // Recover unfinished placements from the existing ledger, once, without rewriting old Elo.
  if (rankedRecent && rankedSettlement) {
    const settings=config(), pending=readDb().users.filter((user)=>Object.entries(user.gameElo ?? {}).some(([id,rating])=>settings.games[id]?.placementGames>rating.games && rating.games>0 && !rating.placement));
    if (pending.length) updateDb((db)=> {
      for (const target of pending) {
        const user=db.users.find((row)=>row.id===target.id), history=rankedRecent(user.id,200).reverse();
        for (const [id,rating] of Object.entries(user.gameElo)) {
          const rules=settings.games[id];
          if (!rules || rating.placement || !rating.games || rating.games>=rules.placementGames) continue;
          const rows=history.filter((row)=>row.gameId===id && !row.cancelled).slice(-rating.games);
          if (rows.length!==rating.games) continue;
          let evidence;
          for (const row of rows) {
            const participants=(rankedSettlement(row.matchId)?.results ?? []).map((result)=>({id:result.userId,elo:result.before,position:result.position,team:result.team,reason:result.reason ?? "result"}));
            const own=participants.find((player)=>player.id===user.id);
            if (!own || participants.length<2) {evidence=null;break;}
            evidence=recordPlacement(evidence,placementEvidence(own,participants,row.format ?? (id==="belote"?"teams":"ranking"),rules),rules);
          }
          if (evidence) rating.placement=evidence;
        }
      }
    });
  }
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
    const offer=entry?.offerId ? offers.get(entry.offerId) : null;
    const queueRules=entry && settings.games[entry.gameId];
    const available=entry ? queueGroupFor(entry,[...queue.values()].filter((row)=>row.gameId===entry.gameId && !row.offerId),queueRules,now).length : 0;
    return { games:RANKED_GAMES.map((id)=>({id,name:games(db).find((g)=>g.id===id)?.name, ...competitiveFor(user,id,settings.games[id],true),enabled:settings.enabled && settings.games[id].enabled,players:settings.games[id].players,maximumPlayers:settings.games[id].maximumPlayers,preset:settings.games[id].preset,
      limits:{afkSeconds:settings.games[id].afkSeconds,reconnectSeconds:settings.games[id].reconnectSeconds,abandonPenalty:settings.games[id].abandonPenalty,afkPenalty:settings.games[id].afkPenalty,abandonPolicy:settings.games[id].abandonPolicy,disconnectPolicy:settings.games[id].disconnectPolicy}})),
      queue:entry ? {gameId:entry.gameId,...(competitiveFor(user,entry.gameId,queueRules).placement.completed ? {elo:entry.elo} : {}),joinedAt:entry.joinedAt,range:searchRange(entry,queueRules,now),players:offer?.group.length ?? queueRules.maximumPlayers,
        minimumPlayers:queueRules.players,maximumPlayers:queueRules.maximumPlayers,
        stage:offer?"confirming":available>=queueRules.players?"filling":"searching",
        fillDeadline:!offer && queueRules.maximumPlayers>queueRules.players && entry.fillStartedAt!==undefined ? entry.fillStartedAt+queueRules.fillWaitSeconds*1000 : null,
        waiting:offer?.group.length ?? available,remaining:Math.max(0,(offer?.group.length ?? queueRules.maximumPlayers)-(offer?.group.length ?? available))} : null,
      proposal:offer ? {id:offer.id,gameId:offer.gameId,startsAfter:offer.startsAfter,expiresAt:offer.expiresAt,
        accepted:offer.ready.has(userId),players:offer.group.map((row)=>({id:row.userId,rank:competitiveFor(db.users.find((user)=>user.id===row.userId),offer.gameId,offer.rules).rank,ready:offer.ready.has(row.userId)}))} : null,
      match:match ? {code:match.code,gameId:match.gameId} : null, serverTime:now };
  }
  function notify(entries) {
    for (const row of entries) io.to(`account:${row.userId}`).emit("ranked-queue-updated");
  }
  function cancelOffer(offer, removed = new Set()) {
    offers.delete(offer.id);
    for (const row of offer.group) {
      if (removed.has(row.userId)) queue.delete(row.userId);
      else { const entry=queue.get(row.userId); if(entry) delete entry.offerId; }
    }
    notify(offer.group);
  }
  function leaveQueue(userId) {
    const entry=queue.get(userId),offer=offers.get(entry?.offerId);
    if (offer?.starting) return;
    if(offer) cancelOffer(offer,new Set([userId]));
    else queue.delete(userId);
  }
  function startMatch(offer, now) {
    if (offer.starting) return;
    const {group,gameId,rules}=offer;
    function buildRoom(current) {
      // Confirm eligibility again before any stake is charged.
      for (const entry of group) { const error=eligibility(current,current.users.find((u)=>u.id===entry.userId),gameId); if (error) throw new Error(error); }
      const seats=gameId === "belote" ? balancedBeloteSeats(group) : group.map((r)=>r.userId);
      const preset=rules.preset;
      const created={id:randomUUID(),code:roomCode(),gameId,name:`${games(current).find((g)=>g.id===gameId).name} · Classé`,ownerId:"ranked-server",isPublic:rules.spectators,stake:preset.stake,
        minLevel:1,maxLevel:null,players:seats.map((id)=>roomPlayerFor(current.users.find((u)=>u.id===id))),gameModifiers:preset.gameModifiers,readyPlayerIds:seats,finished:false,createdAt:new Date(now).toISOString(),
        ...(gameId === "belote" ? {beloteSeats:seats} : {}),
        ...(gameId === "texas-holdem" ? {pokerBlinds:{smallBlind:preset.bigBlind/2,bigBlind:preset.bigBlind,maximumBet:preset.maximumBet},pokerTurnSeconds:preset.turnSeconds} : {}),
        ranked:{matchId:randomUUID(),config:structuredClone(rules),roster:seats.map((id,index)=>({id,pseudo:roomPlayerFor(current.users.find((u)=>u.id===id)).pseudo,rank:competitiveFor(current.users.find((u)=>u.id===id),gameId,rules).rank,...(gameId === "belote" ? {team:index%2} : {})})),forfeits:{},actionAt:now,startedAt:now}};
      return created;
    }
    function announce(room) {
      offers.delete(offer.id);
      for (const entry of group) { queue.delete(entry.userId); io.to(`account:${entry.userId}`).emit("ranked-match",{code:room.code,gameId}); }
      emitRoomUpdate(room); broadcastRooms();
    }
    if (roomDriver) {
      offer.starting = true;
      try {
        const room = buildRoom(readDb());
        roomDriver.start(room).then(() => announce(readDb().rooms.find((target) => target.id === room.id)), () => { offer.starting = false; cancelOffer(offer); });
      } catch { offer.starting = false; cancelOffer(offer); }
      return;
    }
    const room = updateDb((current) => {
      const created = buildRoom(current);
      current.rooms.push(created);
      const error = startRoomRound(created, current); if (error) throw new Error(error);
      return created;
    }, (db, room) => roomWriteScope(db, [room]));
    announce(room);
  }
  function match(now=Date.now()) {
    const db=readDb(), settings=config(db);
    for (const entry of queue.values()) {
      const user=db.users.find((u)=>u.id===entry.userId), rules=settings.games[entry.gameId];
      entry.placementPending=!competitiveFor(user,entry.gameId,rules).placement.completed;
      if (now-entry.heartbeat>120000 || eligibility(db,user,entry.gameId) || !entry.offerId && rules.queueSeconds && now-entry.joinedAt>rules.queueSeconds*1000) leaveQueue(entry.userId);
    }
    for (const offer of [...offers.values()]) {
      if (offer.starting) continue;
      if (offer.group.some((row)=>!queue.has(row.userId))) {cancelOffer(offer);continue;}
      if (now>=offer.startsAfter && offer.ready.size===offer.group.length) {startMatch(offer,now);continue;}
      if (now>=offer.expiresAt) cancelOffer(offer,new Set(offer.group.filter((row)=>!offer.ready.has(row.userId)).map((row)=>row.userId)));
    }
    for (const gameId of RANKED_GAMES) {
      const rules=settings.games[gameId];
      if (!settings.enabled || !rules.enabled) continue;
      let group;
      while (true) {
        const entries=[...queue.values()].filter((row)=>row.gameId===gameId && !row.offerId);
        // The pool has no seats or fees. Its fill clock starts only once a compatible minimum exists.
        const fillRules=`${rules.players}:${rules.maximumPlayers}:${rules.fillWaitSeconds}`;
        group=matchQueue(entries,rules,now,(entry,candidates)=> {
          if (rules.maximumPlayers>rules.players && candidates.length>=rules.players) {
            if (entry.fillRules!==fillRules) entry.fillStartedAt=now;
            entry.fillRules=fillRules;entry.fillStartedAt ??= now;
          } else {delete entry.fillStartedAt;delete entry.fillRules;}
        });
        if (!group.length) break;
        const offer={id:randomUUID(),gameId,group,rules:structuredClone(rules),ready:new Set(),startsAfter:now+rules.readyWaitSeconds*1000,expiresAt:now+rules.readyTimeoutSeconds*1000};
        offers.set(offer.id,offer);
        for(const row of group) row.offerId=offer.id;
        notify(group);
      }
    }
  }
  function tick(now=Date.now()) {
    match(now);
    if (roomDriver) return;
    if (!readDb().rooms.some((r)=>r.ranked && r.state && !r.finished)) return;
    const changed=[];
    updateDb((db)=> {
      for (const room of db.rooms.filter((r)=>r.ranked && r.state && !r.finished)) {
        const rules=room.ranked.config;
        const clockBefore=JSON.stringify([room.ranked.actionAt,room.ranked.turnActor,room.ranked.paused,room.ranked.offline]);
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
        if (room.finished || room.pacing || room.state.nextHandAt) { room.ranked.paused=true; if (clockBefore!==JSON.stringify([room.ranked.actionAt,room.ranked.turnActor,room.ranked.paused,room.ranked.offline])) changed.push(room); continue; }
        if (room.ranked.paused) {room.ranked.paused=false;room.ranked.actionAt=now;}
        const actor=room.state.players[room.state.currentPlayerIndex]?.id;
        if (room.ranked.turnActor!==actor) {room.ranked.turnActor=actor;room.ranked.actionAt=now;}
        const deadline=Math.min(room.ranked.actionAt+rules.afkSeconds*1000,room.gameId === "texas-holdem" ? room.state.turnDeadline ?? Infinity : Infinity);
        if (actor && !room.ranked.offline[actor] && now>=deadline && forfeit(room,db,actor,"afk")) changed.push(room);
        if (clockBefore!==JSON.stringify([room.ranked.actionAt,room.ranked.turnActor,room.ranked.paused,room.ranked.offline])) changed.push(room);
      }
    }, (db) => roomWriteScope(db, [...new Set(changed)]));
    for (const room of new Set(changed)) emitRoomUpdate(room);
    if (changed.length) broadcastRooms();
  }
  app.get("/api/ranked/ranks",(_req,res)=> {
    res.json({ ranks: config().ranks.map(({ id, name, divisions, insignia, insigniaImage, divisionInsignia }) => ({ id, name, divisions, insignia, insigniaImage, divisionInsignia })) });
  });
  app.get("/api/ranked",auth,(req,res)=> {
    const entry=queue.get(req.auth.id); if (entry) entry.heartbeat=Date.now();
    res.setHeader("Cache-Control","no-store");res.json(status(readDb(),req.auth.id));
  });
  app.post("/api/ranked/queue",auth,(req,res)=> {
    try {
      const db=readDb(),user=db.users.find((u)=>u.id===req.auth.id), gameId=String(req.body.gameId ?? "");
      const error=eligibility(db,user,gameId);if(error) return res.status(403).json({error});
      const existing=queue.get(user.id); if(existing && existing.gameId!==gameId) return res.status(409).json({error:"Quitte d'abord ta file actuelle."});
      const rules=config(db).games[gameId],now=Date.now(); if (!existing) queue.set(user.id,{userId:user.id,gameId,elo:matchmakingElo(user,gameId,rules),placementPending:!competitiveFor(user,gameId,rules).placement.completed,joinedAt:now,heartbeat:now});
      match(now);res.json(status(readDb(),user.id));
    } catch(error) {res.status(400).json({error:error.message});}
  });
  app.delete("/api/ranked/queue",auth,(req,res)=>{leaveQueue(req.auth.id);match();res.json(status(readDb(),req.auth.id));});
  app.post("/api/ranked/ready",auth,(req,res)=> {
    const entry=queue.get(req.auth.id),offer=offers.get(entry?.offerId),now=Date.now();
    if(!offer || offer.id!==req.body.proposalId || now>=offer.expiresAt) return res.status(409).json({error:"Cette proposition de partie a expiré."});
    entry.heartbeat=now;offer.ready.add(req.auth.id);notify(offer.group);
    match(now);res.json(status(readDb(),req.auth.id));
  });
  app.get("/api/ranked/leaderboard/:gameId",auth,(req,res)=> {
    const db=readDb(),id=req.params.gameId;if(!RANKED_GAMES.includes(id)) return res.status(404).json({error:"Jeu classé introuvable."});
    const rules=config(db).games[id];
    res.json({gameId:id,minimumGames:Math.max(rules.minimumGames,rules.placementGames),rows:rankedRows(id,rules.minimumGames,100,rules.placementGames).map((row,index)=> {
      const user=db.users.find((u)=>u.id===row.id),progress=gameProgress(user,id,platformSettings(db).gameProgression);
      const {elo,...publicRow}=row;
      return {...publicRow,...(row.id===req.auth.id ? {elo} : {}),ratingRank:rankFor(elo,rules.ranks),rank:index+1,level:progress.level,mastery:progress.mastery,user:sanitizeFriendUser(user,db)};
    })});
  });
  app.get("/api/ranked/history",auth,(req,res)=>res.json({rows:rankedRecent(req.auth.id).map((row)=>{const ranks=config().games[row.gameId].ranks;const {beforeRank,afterRank,...projection}=rankedResultFor(row,req.auth.id,ranks);return {matchId:row.matchId,gameId:row.gameId,finishedAt:row.finishedAt,playerCount:row.playerCount,...projection,beforeRank,afterRank};})}));
  app.post("/api/admin/ranked/simulate",auth,requireAdmin,(req,res)=> {
    try {
      const gameId=req.body.gameId ?? "";
      if (gameId && !RANKED_GAMES.includes(gameId)) throw new Error("Jeu classé introuvable.");
      if (!Array.isArray(req.body.players) || req.body.players.length>100) throw new Error("Joueurs invalides.");
      const players=req.body.players.map((row,index)=>({id:String(index),elo:row.elo,position:row.position,games:row.games,team:row.team,reason:row.reason}));
      if (players.some((row)=>![undefined,"result","abandon","disconnect","afk"].includes(row.reason))) throw new Error("Motif de sortie invalide.");
      res.json({results:calculateElo(players,req.body.settings,gameId)});
    } catch(error){res.status(400).json({error:error.message});}
  });
  app.get("/api/admin/ranked",auth,requireAdmin,(_req,res)=>res.json({settings:config(),games:games(),queues:RANKED_GAMES.map((id)=>({gameId:id,count:[...queue.values()].filter((r)=>r.gameId===id).length})),matches:readDb().rooms.filter((r)=>r.ranked && !r.finished).map((r)=>({code:r.code,name:r.name}))}));
  app.get("/api/admin/ranked/metrics",auth,requireAdmin,(req,res)=> {
    try {
      const db=readDb(), gameId=req.query.gameId ?? "", metrics=rankedMetrics(config(db),{gameId,period:req.query.period ?? "30"});
      const active=RANKED_GAMES.filter((id)=>!gameId || id===gameId).map((id)=>({gameId:id,name:games(db).find((g)=>g.id===id)?.name ?? id,
        queued:[...queue.values()].filter((row)=>row.gameId===id && !row.offerId).length,
        preparing:[...offers.values()].filter((offer)=>offer.gameId===id).length,
        playing:db.rooms.filter((room)=>room.ranked && room.gameId===id && !room.finished).length}));
      res.setHeader("Cache-Control","no-store");res.json({...metrics,games:metrics.games.map((row)=>({...row,name:active.find((g)=>g.gameId===row.gameId)?.name ?? row.gameId})),live:active});
    } catch(error){res.status(400).json({error:error.message});}
  });
  app.put("/api/admin/ranked",auth,requireAdmin,(req,res)=> {
    try {
      const next=normalizeRankedConfig(req.body,games(),platformSettings());
      if (next.ranks.flatMap((rank)=>[rank,...Object.values(rank.divisionInsignia)]).some((insignia)=>insignia.insigniaImage && !insigniaStore?.has(insignia.insigniaImage))) throw new Error("Une image d’insigne est introuvable. Importe-la à nouveau.");
      updateDb((db)=>{db.settings.ranked=next;});res.json(next);
    } catch(error){res.status(400).json({error:error.message});}
  });
  app.post("/api/admin/ranked/:code/cancel",auth,requireAdmin,async (req,res,next)=> {
    const reason=String(req.body.reason??"").trim().slice(0,1000);if(!reason)return res.status(400).json({error:"Indique la raison technique de l'annulation."});
    if (roomDriver) {
      const room = readDb().rooms.find((target) => target.code === req.params.code && target.ranked && !target.finished);
      if (!room) return res.status(404).json({error:"Partie classée introuvable."});
      try { await roomDriver.cancel(room, reason, req.auth); return res.json({ok:true}); } catch (error) { return next(error); }
    }
    const room=updateDb((db)=> {
      const room=db.rooms.find((r)=>r.code===req.params.code && r.ranked && !r.finished);if(!room)return null;
      room.ranked.cancelled={reason,by:req.auth.id,at:new Date().toISOString()};
      for(const player of room.ranked.roster) {const refund=room.stake-(room.state.departedPayouts?.[player.id] ?? 0);if(refund>0)addTokens(db,player.id,refund,{gameId:room.gameId,roomId:room.id,reason:"ranked-technical-refund"});}
      room.state.finished=true;room.state.winners=[];room.pacing=null;finishRoomIfNeeded(room,db);return room;
    });
    if(!room)return res.status(404).json({error:"Partie classée introuvable."});emitRoomUpdate(room);broadcastRooms();res.json({ok:true});
  });
  // Restart grace: existing matches survive without charging downtime as AFK.
  if (!roomDriver) for(const room of readDb().rooms.filter((r)=>r.ranked && !r.finished)) {room.ranked.actionAt=Date.now();room.ranked.offline={};room.ranked.turnActor=null;if(room.state?.turnDeadline)room.state.turnDeadline=Date.now()+room.ranked.config.reconnectSeconds*1000;}
  return { config, forfeit, tick, ratingLocked(db,userId,gameId) {return queue.get(userId)?.gameId===gameId || db.rooms.some((room)=>room.gameId===gameId && room.ranked && !room.finished && room.ranked.roster.some((player)=>player.id===userId));}, action(room) {if(room.ranked){room.ranked.actionAt=Date.now();room.ranked.turnActor=room.state.players[room.state.currentPlayerIndex]?.id;}}, status };
}
