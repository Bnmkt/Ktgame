import { useEffect, useState } from "react";
import { Plus, Save, Swords, Trash2 } from "lucide-react";
import { api } from "../../api.js";
import { GameDefaults } from "./GameDefaults.jsx";
import { Dialog } from "../common/Dialog.jsx";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { RankInsignia, rankDivisionNames } from "../../features/games/RankInsignia.jsx";
import { RankInsigniaEditor } from "./RankInsigniaEditor.jsx";
import { RankedEloSettings } from "./RankedEloSettings.jsx";
import { RankedMetrics } from "./RankedMetrics.jsx";

const fields = {
  search: [["initialWindow","Fenêtre initiale (divisions, joueur inclus)",1,101],["windowStep","Divisions ajoutées à chaque élargissement",2,100],["wideningSeconds","Intervalle d’élargissement (s)",5,600],["maximumWindow","Fenêtre maximale (divisions, joueur inclus)",1,101],["fillWaitSeconds","Délai pour remplir la table (s, 0 = immédiat)",0,600],["readyWaitSeconds","Préparation minimale après remplissage (s)",30,300],["readyTimeoutSeconds","Délai de confirmation (s)",45,600],["queueSeconds","Attente maximale (s, 0 = illimitée)",0,7200],["reconnectSeconds","Délai de reconnexion (s)",15,1800],["afkSeconds","Inactivité pendant son tour (s)",30,1800]]
};
export function RankedAdmin() {
  const [data,setData]=useState(null),[draft,setDraft]=useState(null),[gameId,setGameId]=useState(""),[tab,setTab]=useState("elo"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [cancel,setCancel]=useState(null),[reason,setReason]=useState("");
  const [insigniaEdit,setInsigniaEdit]=useState(null);
  const load=()=>api("/api/admin/ranked").then((result)=>{setData(result);setDraft(result.settings);}).catch((err)=>setError(err.message));
  useEffect(()=>{load();},[]);
  if(!draft)return <section className="panel"><h2>Mode classé</h2><p role={error?"alert":"status"}>{error || "Chargement…"}</p></section>;
  const current=gameId ? draft.games[gameId] : draft;
  function change(key,value) {
    setDraft((prev)=>gameId ? {...prev,games:{...prev.games,[gameId]:{...prev.games[gameId],[key]:value}}} : {...prev,[key]:value,games:Object.fromEntries(Object.entries(prev.games).map(([id,row])=>[id,{...row,...(JSON.stringify(row[key])===JSON.stringify(prev[key]) ? {[key]:value} : {})}]))});
  }
  function preset(key,value) {change("preset",{...current.preset,[key]:value});}
  function resetCalculation() {
    const keys=["initialElo","placementGames","k","d","gamma","provisional","calculation","maximumVariation","minimumElo","ties","abandonPolicy","disconnectPolicy","abandonPenalty","afkPenalty","minimumGames"];
    setDraft((prev)=>({...prev,games:{...prev.games,[gameId]:{...prev.games[gameId],...Object.fromEntries(keys.map((key)=>[key,structuredClone(prev[key])]))}}}));
  }
  function changeRank(id,patch) {setDraft((prev)=>({...prev,ranks:prev.ranks.map((rank)=>rank.id===id?{...rank,...patch}:rank)}));}
  function changeInsignia(patch) {
    if (!insigniaEdit.editingDivision) changeRank(insigniaEdit.id,patch);
    else {
      const rank=draft.ranks.find((row)=>row.id===insigniaEdit.id),divisionInsignia={...rank.divisionInsignia};
      if (patch) divisionInsignia[insigniaEdit.editingDivision]=patch;
      else delete divisionInsignia[insigniaEdit.editingDivision];
      changeRank(rank.id,{divisionInsignia});
    }
    setInsigniaEdit(null);
  }
  function addRank(index) {
    setDraft((prev)=> {
      const next=prev.ranks[index+1],minimum=next ? Math.floor((prev.ranks[index].minimum+next.minimum)/2) : prev.ranks[index].minimum+300;
      const rank={id:`rank-${Date.now()}`,name:"Nouveau rang",minimum,divisions:next?3:1,insignia:"shield"};
      return {...prev,ranks:[...prev.ranks.slice(0,index+1),rank,...prev.ranks.slice(index+1)]};
    });
  }
  function removeRank(id) {setDraft((prev)=>({...prev,ranks:prev.ranks.filter((row)=>row.id!==id).map((row,index,rows)=>index===rows.length-1?{...row,divisions:1,divisionInsignia:{}}:row)}));}
  async function save(event) {event.preventDefault();setBusy(true);setError("");setMessage("");try{setDraft(await api("/api/admin/ranked",{method:"PUT",body:JSON.stringify(draft)}));setMessage("Paramètres classés enregistrés. Les parties en cours conservent leurs règles.");}catch(err){setError(err.message);}finally{setBusy(false);}}
  async function cancelMatch(event) {event.preventDefault();setBusy(true);setError("");try{await api(`/api/admin/ranked/${cancel.code}/cancel`,{method:"POST",body:JSON.stringify({reason})});setCancel(null);await load();}catch(err){setError(err.message);}finally{setBusy(false);}}
  return <section className="card ranked-admin"><form onSubmit={save}><header className="admin-section-heading"><div><span className="eyebrow">Compétition</span><h2><Swords/>Mode classé</h2></div>{tab!=="metrics" && <button disabled={busy}><Save size={17}/>Enregistrer</button>}</header>
    {tab!=="metrics" && <div className="admin-field-grid"><label>Configuration<select aria-label="Configuration classée" value={gameId} onChange={(event)=>setGameId(event.target.value)}><option value="">Valeurs communes</option>{Object.keys(draft.games).map((id)=><option key={id} value={id}>{data.games.find((g)=>g.id===id)?.name ?? id}</option>)}</select></label><label className="xp-title-override"><input type="checkbox" checked={current.enabled} onChange={(event)=>change("enabled",event.target.checked)}/>Classé activé{gameId?" pour ce jeu":" sur le site"}</label><label className="xp-title-override"><input type="checkbox" checked={current.spectators} onChange={(event)=>change("spectators",event.target.checked)}/>Autoriser les spectateurs</label></div>}
    <div className="ranked-mode-tabs" role="group" aria-label="Paramètres classés">{[["metrics","Métriques"],["ranks","Rangs et divisions"],["elo","Elo et sanctions"],["search","Matchmaking"],["preset","Règles de partie"]].map(([id,label])=><button key={id} type="button" aria-pressed={tab===id} className={tab===id?"active":"secondary"} onClick={()=>setTab(id)}>{label}</button>)}</div>
    {tab==="metrics" && <RankedMetrics gameId={gameId} onGameChange={setGameId} games={Object.keys(draft.games).map((id)=>data.games.find((row)=>row.id===id))}/>}
    {tab==="ranks" && <section className="ranked-tier-settings">
      <h3>Rangs communs à tous les jeux</h3><p>Seuils Elo croissants. Les divisions progressent de I à II puis III pour trois divisions ; le dernier rang reste sans division.</p>
      <div className="ranked-tier-table"><table><thead><tr><th>Rang</th><th>Insigne</th><th>Elo minimum</th><th>Divisions</th><th></th></tr></thead><tbody>{draft.ranks.map((rank,index)=><tr key={rank.id}>
        <td><input aria-label={`Nom du rang ${index+1}`} required maxLength={40} value={rank.name} onChange={(event)=>changeRank(rank.id,{name:event.target.value})}/></td>
        <td><div className="ranked-tier-insignias"><button type="button" className="secondary icon-toggle ranked-tier-insignia" title={`Insigne commun · ${rank.name}`} aria-label={`Choisir l’insigne ${rank.name}`} onClick={()=>setInsigniaEdit({...rank})}><RankInsignia rank={rank}/></button>{rank.divisions>1 && <div className="ranked-division-insignias">{rankDivisionNames.slice(0,rank.divisions).map((division)=>{
          const override=rank.divisionInsignia?.[division];
          return <button key={division} type="button" className={`secondary ranked-division-insignia ${override?"is-custom":""}`} title={`${rank.name} ${division} · ${override?"Personnalisé":"Insigne commun"}`} aria-label={`Choisir l’insigne ${rank.name} ${division}`} onClick={()=>setInsigniaEdit({...rank,...override,editingDivision:division})}><RankInsignia rank={override??rank}/><span>{division}</span></button>;
        })}</div>}</div></td>
        <td><input aria-label={`Seuil du rang ${index+1}`} type="number" required min={0} max={100000} readOnly={index===0} value={rank.minimum} onChange={(event)=>changeRank(rank.id,{minimum:Number(event.target.value)})}/></td>
        <td><select aria-label={`Divisions du rang ${index+1}`} value={rank.divisions} disabled={index===draft.ranks.length-1} onChange={(event)=>{const divisions=Number(event.target.value);changeRank(rank.id,{divisions,divisionInsignia:Object.fromEntries(Object.entries(rank.divisionInsignia??{}).filter(([division])=>divisions>1 && rankDivisionNames.slice(0,divisions).includes(division)))});}}>{Array.from({length:10},(_,n)=><option key={n+1} value={n+1}>{n+1===1?"Sans division":n+1}</option>)}</select></td>
        <td><div className="ranked-tier-tools"><button type="button" className="secondary icon-toggle" title={`Ajouter un rang après ${rank.name}`} aria-label={`Ajouter un rang après ${rank.name}`} disabled={draft.ranks.length>=30 || draft.ranks[index+1]?.minimum-rank.minimum<=1} onClick={()=>addRank(index)}><Plus size={17}/></button><ConfirmActionButton className="secondary icon-toggle" title="Retirer ce rang" aria-label={`Retirer ${rank.name}`} disabled={index===0 || draft.ranks.length<=2} dialogTitle={`Retirer le rang ${rank.name} ?`} message="Les rangs seront recalculés après l'enregistrement. L'Elo des joueurs et les anciens résultats seront conservés." confirmLabel="Retirer le rang" danger onConfirm={()=>removeRank(rank.id)}><Trash2 size={17}/></ConfirmActionButton></div></td>
      </tr>)}</tbody></table></div>
      <button type="button" className="secondary" disabled={draft.ranks.length>=30} onClick={()=>addRank(draft.ranks.length-1)}><Plus size={17}/>Ajouter un rang</button>
    </section>}
    {tab==="elo" && <RankedEloSettings current={current} gameId={gameId} change={change} reset={resetCalculation}/>}
    {tab==="search" && <><div className="admin-field-grid">{fields.search.map(([key,label,min,max])=><label key={key}>{label}<input type="number" min={min} max={max} step={["initialWindow","maximumWindow","windowStep"].includes(key)?2:1} required value={current[key]} onChange={(event)=>change(key,Number(event.target.value))}/></label>)}</div><p>Une fenêtre de 9 divisions inclut le joueur et jusqu’à 4 divisions de chaque côté. Le délai de remplissage commence lorsque le minimum de joueurs compatibles est atteint. Une table pleine est prioritaire ; à l’expiration, le groupe disponible est proposé s’il atteint le minimum. La création de la table exige ensuite toutes les confirmations et au moins 30 secondes de préparation.</p></>}
    {tab==="preset" && (gameId ? <><div className="admin-field-grid"><label>Joueurs minimum<input type="number" min={Math.max(2,data.games.find((g)=>g.id===gameId).minPlayers)} max={data.games.find((g)=>g.id===gameId).maxPlayers} value={current.players} onChange={(event)=>change("players",Number(event.target.value))}/></label><label>Joueurs maximum<input type="number" min={current.players} max={data.games.find((g)=>g.id===gameId).maxPlayers} value={current.maximumPlayers} onChange={(event)=>change("maximumPlayers",Number(event.target.value))}/></label>{gameId==="texas-holdem" && <label>Cave fixe<input type="number" min={1000} max={10000000} value={current.preset.stake} onChange={(event)=>preset("stake",Number(event.target.value))}/></label>}{gameId==="texas-holdem" && [["bigBlind","Grosse blinde",2,current.preset.stake],["maximumBet","Plafond de mise",current.preset.bigBlind,current.preset.stake],["turnSeconds","Temps par tour (s)",30,600]].map(([key,label,min,max])=><label key={key}>{label}<input type="number" min={min} max={max} value={current.preset[key]} onChange={(event)=>preset(key,Number(event.target.value))}/></label>)}</div><GameDefaults competitive game={{id:gameId,defaultModifiers:current.preset.gameModifiers}} onChange={(value)=>preset("gameModifiers",value)}/></> : <p>Sélectionne un jeu pour définir son preset et sa taille de partie. Minimum et maximum identiques donnent une taille fixe.</p>)}
    {error && <p className="error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </form>{tab!=="metrics" && <section className="ranked-profile"><h3>Parties classées en cours</h3>{data.matches.length===0 ? <p>Aucune partie.</p> : data.matches.map((match)=><div key={match.code}><strong>{match.name} · {match.code}</strong><button type="button" className="danger-button" onClick={()=>{setCancel(match);setReason("");}}>Annuler pour incident technique</button></div>)}</section>}
    {insigniaEdit && <RankInsigniaEditor rank={insigniaEdit} division={insigniaEdit.editingDivision} references={rankDivisionNames.slice(0,insigniaEdit.divisions>1?insigniaEdit.divisions:0).filter((division)=>division!==insigniaEdit.editingDivision).map((division)=>{const rank=draft.ranks.find((row)=>row.id===insigniaEdit.id);return {division,rank:rank.divisionInsignia?.[division]??rank};})} onClose={()=>setInsigniaEdit(null)} onApply={changeInsignia} onInherit={()=>changeInsignia(null)}/>}
    {cancel && <Dialog title="Annuler cette partie classée ?" onClose={()=>!busy && setCancel(null)} dismissible={!busy}><form onSubmit={cancelMatch}><p>Aucun Elo ni XP ne sera attribué. Les mises seront remboursées et le motif sera conservé.</p><label>Motif technique<textarea required value={reason} maxLength={1000} onChange={(event)=>setReason(event.target.value)}/></label>{error && <p className="error">{error}</p>}<button className="danger-button" disabled={busy || !reason.trim()}>Confirmer l’annulation</button></form></Dialog>}
  </section>;
}
