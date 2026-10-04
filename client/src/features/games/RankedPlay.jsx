import { useEffect, useRef, useState } from "react";
import { Clock3, LogOut, Swords, Trophy } from "lucide-react";
import { api } from "../../api.js";
import { appPath } from "../../navigation/routes.js";
import { gameTitle, gameModifierDefinitions } from "./config.js";
import "./ranked.css";

export const rankedGames = ["belote","texas-holdem","president","liars-dice","velvet-ruse","yahtzee"];
function useRanked(userId, interval=5000) {
  const [data,setData]=useState(null),[error,setError]=useState("");
  useEffect(()=> {
    let active=true;
    const refresh=()=>api("/api/ranked",{background:true}).then((result)=>{if(active){setData(result);setError("");}}).catch((err)=>{if(active)setError(err.message);});
    refresh();const timer=setInterval(refresh,interval);window.addEventListener("ktga-ranked-updated",refresh);
    return()=>{active=false;clearInterval(timer);window.removeEventListener("ktga-ranked-updated",refresh);};
  },[userId,interval]);
  return {data,setData,error,setError};
}
const duration=(time)=>`${Math.floor(time/60)}:${String(time%60).padStart(2,"0")}`;
function RankedRules({entry,gameId}) {
  if(!entry)return null;
  const fields=gameModifierDefinitions[gameId] ?? [];
  return <details className="ranked-rules-summary"><summary>Règles et délais classés</summary><dl>
    {fields.map((field)=>{const value=entry.preset.gameModifiers[field.key];return <div key={field.key}><dt>{field.label}</dt><dd>{field.type==="toggle" ? value?"Activé":"Désactivé" : field.options?.find(([key])=>key===value)?.[1] ?? String(value)}</dd></div>;})}
    {gameId==="texas-holdem" && <><div><dt>Blindes</dt><dd>{entry.preset.bigBlind/2} / {entry.preset.bigBlind}</dd></div><div><dt>Plafond de mise</dt><dd>{entry.preset.maximumBet}</dd></div><div><dt>Temps par tour</dt><dd>{entry.preset.turnSeconds} s</dd></div></>}
    <div><dt>Inactivité pendant son tour</dt><dd>{entry.limits.afkSeconds} s</dd></div><div><dt>Délai de reconnexion</dt><dd>{entry.limits.reconnectSeconds} s</dd></div><div><dt>Pénalité d’abandon</dt><dd>−{entry.limits.abandonPenalty} Elo</dd></div><div><dt>Pénalité AFK</dt><dd>−{entry.limits.afkPenalty} Elo</dd></div>
  </dl></details>;
}
function QueueDetails({queue,serverTime}) {
  const [now,setNow]=useState(Date.now());
  const offset=useRef(serverTime-Date.now());
  useEffect(()=>{offset.current=serverTime-Date.now();},[serverTime]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const elapsed=Math.max(0,Math.floor((now+offset.current-queue.joinedAt)/1000));
  return <dl className="ranked-queue-details"><div><dt>Attente</dt><dd><Clock3 size={16}/>{duration(elapsed)}</dd></div><div><dt>Ton Elo</dt><dd>{queue.elo}</dd></div><div><dt>Recherche</dt><dd>±{queue.range} Elo</dd></div><div><dt>Joueurs nécessaires</dt><dd>{queue.players}</dd></div></dl>;
}
export function RankedQueue({game,user}) {
  const {data,setData,error,setError}=useRanked(user.id);
  const [busy,setBusy]=useState(false);
  const entry=data?.games.find((row)=>row.id===game.id), queue=data?.queue;
  async function change(method) {
    setBusy(true);setError("");
    try {setData(await api("/api/ranked/queue",{method,...(method==="POST"?{body:JSON.stringify({gameId:game.id})}:{})}));window.dispatchEvent(new Event("ktga-ranked-updated"));}
    catch(err){setError(err.message);}finally{setBusy(false);}
  }
  return <section className="ranked-queue-surface"><header><Swords size={26}/><div><span className="eyebrow">Classé</span><h3>{game.name}</h3></div><strong>{entry?.elo ?? "…"} Elo</strong></header>
    {queue ? <><h4>Recherche de {gameTitle(queue.gameId)}</h4><QueueDetails queue={queue} serverTime={data.serverTime}/><button type="button" className="secondary" disabled={busy} onClick={()=>change("DELETE")}><LogOut size={18}/>Quitter la file</button></> : <><dl className="ranked-queue-details"><div><dt>Table</dt><dd>{entry?.players ?? "…"} joueurs</dd></div><div><dt>Mise fixe</dt><dd>{entry?.preset.stake.toLocaleString("fr-FR") ?? "…"}</dd></div><div><dt>Parties classées</dt><dd>{entry?.games ?? 0}</dd></div></dl><button type="button" disabled={busy || !entry?.enabled || user.guest || Boolean(data?.match)} onClick={()=>change("POST")}><Swords size={18}/>{user.guest ? "Compte enregistré requis" : entry?.enabled === false ? "Classé indisponible" : "Rejoindre la file"}</button></>}
    <a className="ranked-board-link" href={`${appPath("leaderboard")}?elo=${game.id}`}><Trophy size={17}/>Classement Elo</a>
    <RankedRules entry={entry} gameId={game.id}/>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
export function RankedCoordinator({user,onOpenRoom}) {
  const {data,setError,error}=useRanked(user.id,10000);
  const seen=useRef(new Set()), open=useRef(onOpenRoom);open.current=onOpenRoom;
  useEffect(()=>{if(data?.match && !seen.current.has(data.match.code)){seen.current.add(data.match.code);open.current(data.match.code);}},[data?.match?.code]);
  if (!data?.queue) return null;
  return <aside className="ranked-waiting-indicator" aria-label="File classée"><Swords size={18}/><span>{gameTitle(data.queue.gameId)} · recherche ±{data.queue.range} Elo</span><button type="button" className="secondary icon-toggle" title="Quitter la file classée" aria-label="Quitter la file classée" onClick={()=>api("/api/ranked/queue",{method:"DELETE"}).then(()=>window.dispatchEvent(new Event("ktga-ranked-updated"))).catch((err)=>setError(err.message))}><LogOut size={17}/></button>{error && <span role="alert">{error}</span>}</aside>;
}
export function RankedProfile({rows=[]}) {
  const entries=rows.filter((row)=>row.competitive);
  if(!entries.length)return null;
  return <section className="ranked-profile"><h3><Swords size={20}/>Carrière classée</h3><div>{entries.map((row)=><a href={`${appPath("leaderboard")}?elo=${row.gameId}`} key={row.gameId}><strong>{row.gameName}</strong><b>{row.competitive.elo} Elo</b><small>{row.competitive.games} parties · {row.competitive.wins} premières places</small></a>)}</div></section>;
}
export function RankedHistory() {
  const [data,setData]=useState(null),[error,setError]=useState("");
  useEffect(()=>{let active=true;api("/api/ranked/history").then((data)=>{if(active)setData(data);}).catch((error)=>{if(active)setError(error.message);});return()=>{active=false;};},[]);
  return <section className="ranked-profile"><h3>Évolution récente de l’Elo</h3>{error && <p className="error">{error}</p>}{data?.rows.length===0 && <p>Aucune partie classée terminée.</p>}<div className="ranked-history">{data?.rows.map((row)=><article key={row.matchId}><strong>{gameTitle(row.gameId)}</strong><time>{new Date(row.finishedAt).toLocaleString("fr-BE")}</time><span>{row.before} → {row.after} Elo</span><b className={row.delta<0 ? "ranked-loss" : "ranked-gain"}>{row.delta>0?"+":""}{Math.round(row.delta*100)/100}</b><small>Position {row.position}{row.penalty ? ` · pénalité ${row.penalty} (${row.reason})` : ""}</small></article>)}</div></section>;
}
