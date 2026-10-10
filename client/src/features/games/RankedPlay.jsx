import { useEffect, useRef, useState } from "react";
import { Check, Clock3, LogOut, Swords, UserRound } from "lucide-react";
import { RankInsignia } from "./RankInsignia.jsx";
import { rankedPreparation } from "./ranked-queue-state.js";
import { api } from "../../api.js";
import { appPath } from "../../navigation/routes.js";
import { gameTitle, gameModifierDefinitions } from "./config.js";
import { Dialog } from "../../components/common/Dialog.jsx";
import "./ranked.css";

export const rankedGames = ["belote","texas-holdem","president","liars-dice","velvet-ruse","yahtzee","midnight-dice"];
function useRanked(userId, interval=5000) {
  const [data,setData]=useState(null),[error,setError]=useState("");
  useEffect(()=> {
    let active=true;
    const refresh=()=>api("/api/ranked",{background:true}).then((result)=>{if(active){setData(result);setError("");}}).catch((err)=>{if(active)setError(err.message);});
    refresh();const timer=setInterval(refresh,data?.queue?2000:interval);window.addEventListener("ktga-ranked-updated",refresh);
    return()=>{active=false;clearInterval(timer);window.removeEventListener("ktga-ranked-updated",refresh);};
  },[userId,interval,Boolean(data?.queue)]);
  return {data,setData,error,setError};
}
const duration=(time)=>`${Math.floor(time/60)}:${String(time%60).padStart(2,"0")}`;
function RankedRules({entry,gameId}) {
  if(!entry)return null;
  const fields=gameModifierDefinitions[gameId] ?? [];
  return <details className="ranked-rules-summary"><summary>Règles et délais classés</summary><dl>
    {fields.map((field)=>{const value=entry.preset.gameModifiers[field.key];return <div key={field.key}><dt>{field.label}</dt><dd>{field.type==="toggle" ? value?"Activé":"Désactivé" : field.options?.find(([key])=>key===value)?.[1] ?? String(value)}</dd></div>;})}
    {gameId==="texas-holdem" && <><div><dt>Blindes</dt><dd>{entry.preset.bigBlind/2} / {entry.preset.bigBlind}</dd></div><div><dt>Plafond de mise</dt><dd>{entry.preset.maximumBet}</dd></div><div><dt>Temps par tour</dt><dd>{entry.preset.turnSeconds} s</dd></div></>}
    <div><dt>Inactivité pendant son tour</dt><dd>{entry.limits.afkSeconds} s</dd></div><div><dt>Délai de reconnexion</dt><dd>{entry.limits.reconnectSeconds} s</dd></div><div><dt>Abandon</dt><dd>{entry.limits.abandonPolicy==="cancel"?"Attribution Elo annulée":entry.limits.abandonPolicy==="rank"?"Dernière place sans pénalité":`Dernière place et jusqu’à −${entry.limits.abandonPenalty} Elo supplémentaires`}</dd></div><div><dt>AFK</dt><dd>{entry.limits.abandonPolicy==="cancel"?"Attribution Elo annulée":entry.limits.abandonPolicy==="rank"?"Dernière place sans pénalité":`Jusqu’à −${entry.limits.afkPenalty} Elo supplémentaires`}</dd></div><div><dt>Déconnexion prolongée</dt><dd>{entry.limits.disconnectPolicy==="cancel"?"Attribution Elo annulée":entry.limits.disconnectPolicy==="rank"?"Dernière place sans pénalité":`Dernière place et jusqu’à −${entry.limits.abandonPenalty} Elo supplémentaires`}</dd></div>
  </dl></details>;
}
function QueueDetails({queue,serverTime}) {
  const [now,setNow]=useState(Date.now());
  const offset=useRef(serverTime-Date.now());
  useEffect(()=>{offset.current=serverTime-Date.now();},[serverTime]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const elapsed=Math.max(0,Math.floor((now+offset.current-queue.joinedAt)/1000));
  const remaining=queue.remaining ?? Math.max(0,queue.players-queue.waiting);
  const fillRemaining=queue.fillDeadline ? Math.max(0,Math.ceil((queue.fillDeadline-now-offset.current)/1000)) : null;
  return <div className="ranked-search-progress"><span className="ranked-large-clock" aria-label="Temps de recherche">{duration(elapsed)}</span><strong>Recherche de {queue.players} joueurs</strong><p role="status">{remaining ? `Encore ${remaining} joueur${remaining>1?"s":""} à trouver` : "Préparation de la partie…"}</p>{fillRemaining!==null && <small>{fillRemaining>0 ? `Complétion du groupe · ${duration(fillRemaining)}` : "Préparation du groupe disponible…"}</small>}<div className="ranked-search-seats" aria-label={`${queue.players-remaining} joueurs sur ${queue.players}`}>{Array.from({length:queue.players},(_,index)=><UserRound key={index} size={26} className={index<queue.players-remaining?"is-found":""}/>)}</div></div>;
}
function QueueHeading({gameId,rank}) {
  return <header className="ranked-queue-heading"><Swords size={28}/><h3>Classé {gameTitle(gameId)}</h3><RankBadge rank={rank}/>{rank?.id==="unranked" && <small>{rank.placementGames ?? 0} / {rank.placementRequired ?? 5} placements</small>}</header>;
}
export function RankedTurnTimer({turn,paused=false}) {
  const [now,setNow]=useState(Date.now());
  const offset=useRef((turn?.serverTime ?? Date.now())-Date.now());
  useEffect(()=>{offset.current=(turn?.serverTime ?? Date.now())-Date.now();setNow(Date.now());},[turn?.serverTime,turn?.deadline]);
  useEffect(()=>{if(!turn || paused)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[Boolean(turn),paused]);
  if (!turn || paused) return <span className="ranked-turn-timer"><Clock3 size={17}/><span>Chrono en pause</span></span>;
  const remaining=Math.max(0,Math.ceil((turn.deadline-now-offset.current)/1000));
  return <span className={`ranked-turn-timer ${remaining<=15?"is-urgent":""}`} role="timer" aria-label={turn.type==="reconnect"?"Temps de reconnexion":"Temps de tour restant"}><Clock3 size={17}/><span>{turn.type==="reconnect"?"Reconnexion":"Tour"}</span><strong>{duration(remaining)}</strong></span>;
}
export function RankBadge({rank,showInsignia=true}) {
  if(!rank)return null;
  return <span className="ranked-rank-badge" data-rank-tier={rank.id}>{showInsignia && <RankInsignia rank={rank}/>}<span>{rank.label}</span></span>;
}
export function RankedResult({result,autoScroll=true}) {
  const panel=useRef(null);
  useEffect(()=>{if(autoScroll)panel.current?.scrollIntoView({block:"center",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});},[result?.userId,result?.after,autoScroll]);
  if(!result)return null;
  if(result.placement) return <section ref={panel} className="ranked-result" aria-label="Tes parties de placement"><span className="eyebrow">{result.cancelled ? "Partie annulée" : result.placement.completed ? "Placement terminé" : "Parties de placement"}</span><div><RankBadge rank={result.afterRank}/>{result.placement.completed && <strong>{result.after} Elo</strong>}</div><progress max={result.placement.required} value={result.placement.games} aria-label="Parties de placement terminées"/><p>{result.placement.games} / {result.placement.required} parties</p><small>{result.placement.wins} victoire(s) · {result.placement.losses} défaite(s) · {result.placement.draws} égalité(s)</small></section>;
  return <section ref={panel} className="ranked-result" aria-label="Ta progression classée"><span className="eyebrow">Ta progression</span><div><RankBadge rank={result.beforeRank}/><span>→</span><RankBadge rank={result.afterRank}/><strong className={result.delta<0?"ranked-loss":"ranked-gain"}>{result.delta>0?"+":""}{Number(result.delta.toFixed(2))} Elo</strong></div><p>{result.before} → {result.after} Elo</p>{result.progression && <><progress max={100} value={result.progression.progress} aria-label="Progression vers la division suivante"/><small>{result.progression.next ? `Prochain rang : ${result.progression.next}` : "Rang le plus élevé"}</small></>}</section>;
}
function ReadyMatch({proposal,serverTime,userId,busy,error,onReady,onDecline}) {
  const [now,setNow]=useState(Date.now());
  const offset=useRef(serverTime-Date.now());
  useEffect(()=>{offset.current=serverTime-Date.now();},[serverTime]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const corrected=now+offset.current;
  const {phase,startsIn:start,expiresIn:expires,remaining}=rankedPreparation(proposal,corrected);
  return <Dialog title="Partie classée trouvée" hideTitle className="ranked-ready-dialog" dismissible={false} onClose={()=>{}}>
    <QueueHeading gameId={proposal.gameId} rank={proposal.players.find((player)=>player.id===userId)?.rank}/>
    <div className="ranked-search-progress">{phase==="preparing" ? <><span className="ranked-large-clock">{duration(start)}</span><strong>Préparation de la partie</strong><p>{remaining ? `${remaining} confirmation(s) restante(s)` : "Tous les joueurs sont prêts"}</p></> : <strong className="ranked-transition-label" role="status">{phase==="creating" ? "Création de la table…" : phase==="expired" ? "Retour dans la file…" : "Confirmation des joueurs"}</strong>}{phase==="confirming" && <p>{remaining} confirmation(s) restante(s)</p>}{(phase==="preparing" || phase==="confirming") && <small>Confirmation avant {duration(expires)}</small>}</div>
    <div className="ranked-ready-seats" aria-label="Confirmations des joueurs">{proposal.players.map((player,index)=><div key={player.id} className={player.ready?"is-ready":""} aria-label={`Joueur ${index+1}${player.id===userId?", toi":""} : ${player.ready?"prêt":"en attente"}`}><span className="ranked-ready-avatar"><UserRound size={28}/>{player.ready && <Check size={15}/>}</span><strong>{player.id===userId?"Toi":`Joueur ${index+1}`}</strong><small>{player.ready?"Prêt":"En attente"}</small></div>)}</div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="ranked-queue-actions"><button type="button" disabled={busy || proposal.accepted || expires===0} onClick={onReady}><Check size={18}/>{proposal.accepted?"Tu es prêt":"Accepter et rejoindre"}</button><button type="button" className="danger" disabled={busy} onClick={onDecline}><LogOut size={18}/>Quitter la file</button></div>
  </Dialog>;
}
export function RankedQueue({game,user,onQueued}) {
  const {data,setData,error,setError}=useRanked(user.id);
  const [busy,setBusy]=useState(false);
  const entry=data?.games.find((row)=>row.id===game.id), queue=data?.queue;
  async function change(method) {
    setBusy(true);setError("");
    try {setData(await api("/api/ranked/queue",{method,...(method==="POST"?{body:JSON.stringify({gameId:game.id})}:{})}));window.dispatchEvent(new Event("ktga-ranked-updated"));if(method==="POST")onQueued?.();}
    catch(err){setError(err.message);}finally{setBusy(false);}
  }
  return <section className="ranked-queue-surface"><QueueHeading gameId={game.id} rank={entry?.rank}/>
    {queue ? <><QueueDetails queue={queue} serverTime={data.serverTime}/><div className="ranked-queue-actions"><button type="button" className="danger" disabled={busy} onClick={()=>change("DELETE")}><LogOut size={18}/>Quitter la file</button></div></> : <><p className="ranked-entry-summary">{entry ? entry.maximumPlayers>entry.players ? `${entry.players} à ${entry.maximumPlayers}` : entry.players : "…"} joueurs{game.id==="texas-holdem"?` · Cave fixe : ${entry?.preset.stake.toLocaleString("fr-FR") ?? "…"}`:""}</p><button type="button" disabled={busy || !entry?.enabled || user.guest || Boolean(data?.match)} onClick={()=>change("POST")}><Swords size={18}/>{user.guest ? "Compte enregistré requis" : entry?.enabled === false ? "Classé indisponible" : "Rejoindre la file"}</button></>}
    <RankedRules entry={entry} gameId={game.id}/>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
export function RankedCoordinator({user,onOpenRoom}) {
  const {data,setData,setError,error}=useRanked(user.id,5000);
  const [busy,setBusy]=useState(false);
  const [waitingOpen,setWaitingOpen]=useState(true);
  useEffect(()=>{setWaitingOpen(true);},[data?.queue?.joinedAt]);
  const seen=useRef(new Set()), open=useRef(onOpenRoom);open.current=onOpenRoom;
  useEffect(()=>{if(data?.match && !seen.current.has(data.match.code)){seen.current.add(data.match.code);open.current(data.match.code);}},[data?.match?.code]);
  async function respond(ready) {
    setBusy(true);setError("");
    try{setData(await api(ready?"/api/ranked/ready":"/api/ranked/queue",{method:ready?"POST":"DELETE",...(ready?{body:JSON.stringify({proposalId:data.proposal.id})}:{})}));window.dispatchEvent(new Event("ktga-ranked-updated"));}
    catch(err){setError(err.message);}finally{setBusy(false);}
  }
  if (!data?.queue) return null;
  return <>
    {!waitingOpen && !data.proposal && <aside className="ranked-waiting-indicator" aria-label="File classée"><button type="button" className="secondary" onClick={()=>setWaitingOpen(true)}><Swords size={18}/>{gameTitle(data.queue.gameId)} · recherche en cours</button><button type="button" className="danger icon-toggle" title="Quitter la file classée" aria-label="Quitter la file classée" disabled={busy} onClick={()=>respond(false)}><LogOut size={17}/></button></aside>}
    {data.proposal ? <ReadyMatch key={data.proposal.id} proposal={data.proposal} serverTime={data.serverTime} userId={user.id} busy={busy} error={error} onReady={()=>respond(true)} onDecline={()=>respond(false)}/> : waitingOpen && <Dialog title="Recherche classée" hideTitle className="ranked-ready-dialog" onClose={()=>setWaitingOpen(false)}><QueueHeading gameId={data.queue.gameId} rank={data.games.find((row)=>row.id===data.queue.gameId)?.rank}/><QueueDetails queue={data.queue} serverTime={data.serverTime}/>{error && <p className="error" role="alert">{error}</p>}<div className="ranked-queue-actions"><button type="button" className="danger" disabled={busy} onClick={()=>respond(false)}><LogOut size={18}/>Quitter la file</button></div></Dialog>}
  </>;
}
export function RankedProfile({rows=[]}) {
  const entries=rows.filter((row)=>row.competitive);
  if(!entries.length)return null;
  return <section className="ranked-profile"><h3><Swords size={20}/>Carrière classée</h3><div>{entries.map((row)=><a className="ranked-profile-entry" href={`${appPath("leaderboard")}?elo=${row.gameId}`} key={row.gameId} data-rank-tier={row.competitive.rank.id}><RankInsignia rank={row.competitive.rank} className="ranked-profile-insignia"/><div className="ranked-profile-statistics"><strong>{row.gameName}</strong><RankBadge rank={row.competitive.rank} showInsignia={false}/>{row.competitive.placement && !row.competitive.placement.completed ? <small>{row.competitive.placement.games} / {row.competitive.placement.required} placements</small> : row.competitive.elo!==undefined && <small>{row.competitive.elo} Elo · privé</small>}<small>{row.competitive.games} parties · {row.competitive.wins} premières places</small></div></a>)}</div></section>;
}
export function RankedHistory() {
  const [data,setData]=useState(null),[error,setError]=useState("");
  useEffect(()=>{let active=true;api("/api/ranked/history").then((data)=>{if(active)setData(data);}).catch((error)=>{if(active)setError(error.message);});return()=>{active=false;};},[]);
  return <section className="ranked-profile"><h3>Évolution récente de l’Elo</h3>{error && <p className="error">{error}</p>}{data?.rows.length===0 && <p>Aucune partie classée terminée.</p>}<div className="ranked-history">{data?.rows.map((row)=><article key={row.matchId}><strong>{gameTitle(row.gameId)}</strong><time>{new Date(row.finishedAt).toLocaleString("fr-BE")}</time>{row.placement ? <><span>Placement {row.placement.games} / {row.placement.required}</span><b>{row.placement.completed ? `${row.afterRank.label} · ${row.after} Elo` : "Non classé"}</b></> : <><span>{row.before} → {row.after} Elo</span><b className={row.delta<0 ? "ranked-loss" : "ranked-gain"}>{row.delta>0?"+":""}{Math.round(row.delta*100)/100}</b></>}<small>Position {row.position}{row.penalty ? ` · pénalité ${row.penalty} (${row.reason})` : ""}</small></article>)}</div></section>;
}
