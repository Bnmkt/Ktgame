import { useLocale } from "../../locales/LocaleProvider.jsx";
import { useEffect, useRef, useState } from "react";
import { Bot, Check, Clock3, LogOut, Swords, UserRound } from "lucide-react";
import { RankInsignia } from "./RankInsignia.jsx";
import { rankedPreparation } from "./ranked-queue-state.js";
import { api } from "../../api.js";
import { gameTitle, gameModifierDefinitions } from "./config.js";
import { Dialog } from "../../components/common/Dialog.jsx";
import { ConfirmActionButton } from "../../components/common/ConfirmAction.jsx";
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
  const { t: localeText } = useLocale();
  if(!entry)return null;
  const fields=gameModifierDefinitions[gameId] ?? [];
  return <details className="ranked-rules-summary"><summary>{localeText("Règles et délais classés")}</summary><dl>
    {fields.map((field)=>{const value=entry.preset.gameModifiers[field.key];return <div key={field.key}><dt>{localeText(field.label)}</dt><dd>{field.type==="toggle" ? value?localeText("Activé"):localeText("Désactivé") : field.options?.find(([key])=>key===value)?.[1] ?? String(value)}</dd></div>;})}
    {gameId==="texas-holdem" && <><div><dt>{localeText("Blindes")}</dt><dd>{entry.preset.bigBlind/2} / {entry.preset.bigBlind}</dd></div><div><dt>{localeText("Plafond de mise")}</dt><dd>{entry.preset.maximumBet}</dd></div><div><dt>{localeText("Temps par tour")}</dt><dd>{entry.preset.turnSeconds}{" " + localeText("s")}</dd></div></>}
    <div><dt>{localeText("Inactivité pendant son tour")}</dt><dd>{entry.limits.afkSeconds}{" " + localeText("s")}</dd></div><div><dt>{localeText("Délai de reconnexion")}</dt><dd>{entry.limits.reconnectSeconds}{" " + localeText("s")}</dd></div><div><dt>{localeText("Abandon")}</dt><dd>{entry.limits.abandonPolicy==="cancel"?localeText("Attribution Elo annulée"):entry.limits.abandonPolicy==="rank"?localeText("Dernière place sans pénalité"):localeText("Dernière place et jusqu’à −{value0} Elo supplémentaires", { value0: entry.limits.abandonPenalty })}</dd></div><div><dt>{localeText("AFK")}</dt><dd>{entry.limits.abandonPolicy==="cancel"?localeText("Attribution Elo annulée"):entry.limits.abandonPolicy==="rank"?localeText("Dernière place sans pénalité"):localeText("Jusqu’à −{value0} Elo supplémentaires", { value0: entry.limits.afkPenalty })}</dd></div><div><dt>{localeText("Déconnexion prolongée")}</dt><dd>{entry.limits.disconnectPolicy==="cancel"?localeText("Attribution Elo annulée"):entry.limits.disconnectPolicy==="rank"?localeText("Dernière place sans pénalité"):localeText("Dernière place et jusqu’à −{value0} Elo supplémentaires", { value0: entry.limits.abandonPenalty })}</dd></div>
  </dl></details>;
}
function QueueDetails({queue,serverTime}) {
  const { t: localeText } = useLocale();
  const [now,setNow]=useState(Date.now());
  const offset=useRef(serverTime-Date.now());
  useEffect(()=>{offset.current=serverTime-Date.now();},[serverTime]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const elapsed=Math.max(0,Math.floor((now+offset.current-queue.joinedAt)/1000));
  const remaining=queue.remaining ?? Math.max(0,queue.players-queue.waiting);
  const fillRemaining=queue.fillDeadline ? Math.max(0,Math.ceil((queue.fillDeadline-now-offset.current)/1000)) : null;
  return <div className="ranked-search-progress"><span className="ranked-large-clock" aria-label={localeText("Temps de recherche")}>{duration(elapsed)}</span><strong>{localeText("Recherche de") + " "}{queue.players}{" " + localeText("joueurs")}</strong><p role="status">{remaining ? localeText("Encore {value0} joueur{value1} à trouver", { value0: remaining, value1: remaining>1?"s":"" }) : localeText("Préparation de la partie…")}</p>{fillRemaining!==null && <small>{fillRemaining>0 ? localeText("Complétion du groupe · {value0}", { value0: duration(fillRemaining) }) : localeText("Préparation du groupe disponible…")}</small>}<div className="ranked-search-seats" aria-label={localeText("{value0} joueurs sur {value1}", { value0: queue.players-remaining, value1: queue.players })}>{Array.from({length:queue.players},(_,index)=><UserRound key={index} size={26} className={index<queue.players-remaining?"is-found":""}/>)}</div></div>;
}
function QueueHeading({gameId,rank}) {
  const { t: localeText } = useLocale();
  return <header className="ranked-queue-heading"><Swords size={28}/><h3>{localeText("Classé") + " "}{localeText(gameTitle(gameId))}</h3><RankBadge rank={rank}/>{rank?.id==="unranked" && <small>{rank.placementGames ?? 0} / {rank.placementRequired ?? 5}{" " + localeText("placements")}</small>}</header>;
}
export function RankedTurnTimer({turn,paused=false}) {
  const { t: localeText } = useLocale();
  const [now,setNow]=useState(Date.now());
  const offset=useRef((turn?.serverTime ?? Date.now())-Date.now());
  useEffect(()=>{offset.current=(turn?.serverTime ?? Date.now())-Date.now();setNow(Date.now());},[turn?.serverTime,turn?.deadline]);
  useEffect(()=>{if(!turn || paused)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[Boolean(turn),paused]);
  if (!turn || paused) return <span className="ranked-turn-timer"><Clock3 size={17}/><span>{localeText("Chrono en pause")}</span></span>;
  const remaining=Math.max(0,Math.ceil((turn.deadline-now-offset.current)/1000));
  return <span className={`ranked-turn-timer ${remaining<=15?"is-urgent":""}`} role="timer" aria-label={turn.type==="reconnect"?localeText("Temps de reconnexion"):localeText("Temps de tour restant")}><Clock3 size={17}/><span>{turn.type==="reconnect"?localeText("Reconnexion"):localeText("Tour")}</span><strong>{duration(remaining)}</strong></span>;
}
export function RankBadge({rank,showInsignia=true}) {
  const { t: localeText } = useLocale();
  if(!rank)return null;
  const label = rank.name ? `${localeText(`rank::${rank.name}`)}${rank.division ? ` ${rank.division}` : ""}` : localeText(rank.label);
  return <span className="ranked-rank-badge" data-rank-tier={rank.id}>{showInsignia && <RankInsignia rank={rank}/>}<span>{localeText(label)}</span></span>;
}
export function RankedResult({result,autoScroll=true}) {
  const { t: localeText } = useLocale();
  const panel=useRef(null);
  useEffect(()=>{if(autoScroll)panel.current?.scrollIntoView({block:"center",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});},[result?.userId,result?.after,autoScroll]);
  if(!result)return null;
  if(result.placement) return <section ref={panel} className="ranked-result" aria-label={localeText("Tes parties de placement")}><span className="eyebrow">{result.cancelled ? localeText("Partie annulée") : result.placement.completed ? localeText("Placement terminé") : localeText("Parties de placement")}</span><div><RankBadge rank={result.afterRank}/>{result.placement.completed && <strong>{result.after}{" " + localeText("Elo")}</strong>}</div><progress max={result.placement.required} value={result.placement.games} aria-label={localeText("Parties de placement terminées")}/><p>{result.placement.games} / {result.placement.required}{" " + localeText("parties")}</p><small>{result.placement.wins}{" " + localeText("victoire(s) ·") + " "}{result.placement.losses}{" " + localeText("défaite(s) ·") + " "}{result.placement.draws}{" " + localeText("égalité(s)")}</small></section>;
  return <section ref={panel} className="ranked-result" aria-label={localeText("Ta progression classée")}><span className="eyebrow">{localeText("Ta progression")}</span><div><RankBadge rank={result.beforeRank}/><span>→</span><RankBadge rank={result.afterRank}/><strong className={result.delta<0?"ranked-loss":"ranked-gain"}>{result.delta>0?"+":""}{Number(result.delta.toFixed(2))}{" " + localeText("Elo")}</strong></div><p>{result.before} → {result.after}{" " + localeText("Elo")}</p>{result.progression && <><progress max={100} value={result.progression.progress} aria-label={localeText("Progression vers la division suivante")}/><small>{result.progression.next ? localeText("Prochain rang : {value0}", { value0: result.progression.next }) : localeText("Rang le plus élevé")}</small></>}</section>;
}
function FillRankedBots({allowed,onData,onError}) {
  const {t}=useLocale();
  const [busy,setBusy]=useState(false);
  if (!allowed) return null;
  return <ConfirmActionButton className="secondary ranked-fill-bots" disabled={busy} dialogTitle={t("Compléter la classée avec des bots ?")} message={t("Les places libres seront occupées par des bots. Cette partie comptera pour l’Elo et les placements. Tous les joueurs humains devront confirmer à nouveau.")} confirmLabel={t("Compléter avec des bots")} onConfirm={async()=>{
    setBusy(true);onError("");
    try {onData(await api("/api/ranked/queue/fill-bots",{method:"POST"}));window.dispatchEvent(new Event("ktga-ranked-updated"));}
    catch(error){onError(error.message);}finally{setBusy(false);}
  }}><Bot size={18}/>{t("Compléter avec des bots")}</ConfirmActionButton>;
}
function ReadyMatch({proposal,serverTime,userId,busy,error,onReady,onDecline,fillControl}) {
  const { t: localeText } = useLocale();
  const [now,setNow]=useState(Date.now());
  const offset=useRef(serverTime-Date.now());
  useEffect(()=>{offset.current=serverTime-Date.now();},[serverTime]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const corrected=now+offset.current;
  const {phase,startsIn:start,expiresIn:expires,remaining}=rankedPreparation(proposal,corrected);
  return <Dialog title={localeText("Partie classée trouvée")} hideTitle className="ranked-ready-dialog" dismissible={false} onClose={()=>{}}>
    <QueueHeading gameId={proposal.gameId} rank={proposal.players.find((player)=>player.id===userId)?.rank}/>
    <div className="ranked-search-progress">{phase==="preparing" ? <><span className="ranked-large-clock">{duration(start)}</span><strong>{localeText("Préparation de la partie")}</strong><p>{remaining ? localeText("{value0} confirmation(s) restante(s)", { value0: remaining }) : localeText("Tous les joueurs sont prêts")}</p></> : <strong className="ranked-transition-label" role="status">{phase==="creating" ? localeText("Création de la table…") : phase==="expired" ? localeText("Retour dans la file…") : localeText("Confirmation des joueurs")}</strong>}{phase==="confirming" && <p>{remaining}{" " + localeText("confirmation(s) restante(s)")}</p>}{(phase==="preparing" || phase==="confirming") && <small>{localeText("Confirmation avant") + " "}{duration(expires)}</small>}</div>
    <div className="ranked-ready-seats" aria-label={localeText("Confirmations des joueurs")}>{proposal.players.map((player,index)=><div key={player.id} className={player.ready?"is-ready":""} aria-label={localeText("Joueur {value0}{value1} : {value2}", { value0: index+1, value1: player.id===userId?", toi":"", value2: player.ready?"prêt":"en attente" })}><span className="ranked-ready-avatar">{player.isBot ? <Bot size={28}/> : <UserRound size={28}/>}{player.ready && <Check size={15}/>}</span><strong>{player.isBot ? localeText("Bot {number}",{number:index+1}) : player.id===userId?localeText("Toi"):localeText("Joueur {value0}", { value0: index+1 })}</strong><small>{player.ready?localeText("Prêt"):localeText("En attente")}</small></div>)}</div>
    {error && <p className="error" role="alert">{localeText(error)}</p>}
    {fillControl}
    <div className="ranked-queue-actions"><button type="button" disabled={busy || proposal.accepted || expires===0} onClick={onReady}><Check size={18}/>{proposal.accepted?localeText("Tu es prêt"):localeText("Accepter et rejoindre")}</button><button type="button" className="danger" disabled={busy} onClick={onDecline}><LogOut size={18}/>{localeText("Quitter la file")}</button></div>
  </Dialog>;
}
export function RankedQueue({game,user,onQueued}) {
  const { t: localeText } = useLocale();
  const {data,setData,error,setError}=useRanked(user.id);
  const [busy,setBusy]=useState(false);
  const entry=data?.games.find((row)=>row.id===game.id), queue=data?.queue;
  async function change(method) {
    setBusy(true);setError("");
    try {setData(await api("/api/ranked/queue",{method,...(method==="POST"?{body:JSON.stringify({gameId:game.id})}:{})}));window.dispatchEvent(new Event("ktga-ranked-updated"));if(method==="POST")onQueued?.();}
    catch(err){setError(err.message);}finally{setBusy(false);}
  }
  return <section className="ranked-queue-surface"><QueueHeading gameId={game.id} rank={entry?.rank}/>
    {queue ? <><QueueDetails queue={queue} serverTime={data.serverTime}/><div className="ranked-queue-actions"><button type="button" className="danger" disabled={busy} onClick={()=>change("DELETE")}><LogOut size={18}/>{localeText("Quitter la file")}</button></div></> : <><p className="ranked-entry-summary">{entry ? entry.maximumPlayers>entry.players ? localeText("{value0} à {value1}", { value0: entry.players, value1: entry.maximumPlayers }) : entry.players : "…"}{" " + localeText("joueurs")}{game.id==="texas-holdem"?localeText(" · Cave fixe : {value0}", { value0: entry?.preset.stake.toLocaleString("fr-FR") ?? "…" }):""}</p><button type="button" disabled={busy || !entry?.enabled || user.guest || Boolean(data?.match)} onClick={()=>change("POST")}><Swords size={18}/>{user.guest ? localeText("Compte enregistré requis") : entry?.enabled === false ? localeText("Classé indisponible") : localeText("Rejoindre la file")}</button></>}
    <RankedRules entry={entry} gameId={game.id}/>
    <FillRankedBots allowed={user.admin && queue?.canFillBots} onData={setData} onError={setError}/>
    {error && <p className="error" role="alert">{localeText(error)}</p>}
  </section>;
}
export function RankedCoordinator({user,onOpenRoom}) {
  const { t: localeText } = useLocale();
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
    {!waitingOpen && !data.proposal && <aside className="ranked-waiting-indicator" aria-label={localeText("File classée")}><button type="button" className="secondary" onClick={()=>setWaitingOpen(true)}><Swords size={18}/>{localeText(gameTitle(data.queue.gameId))}{" " + localeText("· recherche en cours")}</button><button type="button" className="danger icon-toggle" title={localeText("Quitter la file classée")} aria-label={localeText("Quitter la file classée")} disabled={busy} onClick={()=>respond(false)}><LogOut size={17}/></button></aside>}
    {data.proposal ? <ReadyMatch key={data.proposal.id} proposal={data.proposal} serverTime={data.serverTime} userId={user.id} busy={busy} error={error} onReady={()=>respond(true)} onDecline={()=>respond(false)} fillControl={<FillRankedBots allowed={user.admin && data.queue.canFillBots} onData={setData} onError={setError}/>}/> : waitingOpen && <Dialog title={localeText("Recherche classée")} hideTitle className="ranked-ready-dialog" onClose={()=>setWaitingOpen(false)}><QueueHeading gameId={data.queue.gameId} rank={data.games.find((row)=>row.id===data.queue.gameId)?.rank}/><QueueDetails queue={data.queue} serverTime={data.serverTime}/>{error && <p className="error" role="alert">{localeText(error)}</p>}<FillRankedBots allowed={user.admin && data.queue.canFillBots} onData={setData} onError={setError}/><div className="ranked-queue-actions"><button type="button" className="danger" disabled={busy} onClick={()=>respond(false)}><LogOut size={18}/>{localeText("Quitter la file")}</button></div></Dialog>}
  </>;
}
export function RankedProfile({rows=[], publicView=false}) {
  const { t: localeText } = useLocale();
  const entries=rows.filter((row)=>row.competitive);
  if(!entries.length)return null;
  return <section className="ranked-profile"><h3><Swords size={20}/>{localeText("Carrière classée")}</h3><div>{entries.map((row)=><div className="ranked-profile-entry" key={row.gameId} data-rank-tier={row.competitive.rank.id}><RankInsignia rank={row.competitive.rank} className="ranked-profile-insignia"/><div className="ranked-profile-statistics"><strong>{row.gameName}</strong><RankBadge rank={row.competitive.rank} showInsignia={false}/>{row.competitive.placement && !row.competitive.placement.completed ? <small>{row.competitive.placement.games} / {row.competitive.placement.required}{" " + localeText("placements")}</small> : !publicView && row.competitive.elo!==undefined && <small>{row.competitive.elo}{" " + localeText("Elo · privé")}</small>}<small>{row.competitive.games}{" " + localeText("parties ·") + " "}{row.competitive.wins}{" " + localeText("premières places")}</small></div></div>)}</div></section>;
}
export function RankedHistory() {
  const { t: localeText } = useLocale();
  const [data,setData]=useState(null),[error,setError]=useState("");
  useEffect(()=>{let active=true;api("/api/ranked/history").then((data)=>{if(active)setData(data);}).catch((error)=>{if(active)setError(error.message);});return()=>{active=false;};},[]);
  return <section className="ranked-profile"><h3>{localeText("Évolution récente de l’Elo")}</h3>{error && <p className="error">{localeText(error)}</p>}{data?.rows.length===0 && <p>{localeText("Aucune partie classée terminée.")}</p>}<div className="ranked-history">{data?.rows.map((row)=><article key={row.matchId}><strong>{localeText(gameTitle(row.gameId))}</strong><time>{new Date(row.finishedAt).toLocaleString("fr-BE")}</time>{row.placement ? <><span>{localeText("Placement") + " "}{row.placement.games} / {row.placement.required}</span><b>{row.placement.completed ? localeText("{value0} · {value1} Elo", { value0: row.afterRank.label, value1: row.after }) : localeText("Non classé")}</b></> : <><span>{row.before} → {row.after}{" " + localeText("Elo")}</span><b className={row.delta<0 ? "ranked-loss" : "ranked-gain"}>{row.delta>0?"+":""}{Math.round(row.delta*100)/100}</b></>}<small>{localeText("Position") + " "}{row.position}{row.penalty ? localeText(" · pénalité {value0} ({value1})", { value0: row.penalty, value1: row.reason }) : ""}</small></article>)}</div></section>;
}
