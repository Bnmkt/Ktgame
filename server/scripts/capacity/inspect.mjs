import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { argumentsFor } from "./common.mjs";

const args=argumentsFor(process.argv.slice(2)),manifest=JSON.parse(fs.readFileSync(args.manifest,"utf8"));
if(!/^capacity-[a-f0-9]{12}$/.test(manifest.runId) || !/^ktga-capacity-[\w-]+$/.test(path.basename(path.dirname(manifest.database))) || path.basename(manifest.database)!=="test.sqlite")throw new Error("Not an isolated capacity database.");
const db=new DatabaseSync(manifest.database,{readOnly:true});
db.exec("BEGIN");
const n=(query)=>Number(db.prepare(query).get().n);
const expectedXp=new Map();
function addXp(userId,gameId,amount){const key=`${userId}:${gameId}`;expectedXp.set(key,(expectedXp.get(key)??0)+amount);}
const historyRows = db.prepare("SELECT data FROM history"), rewardRows = db.prepare("SELECT r.user_id,c.data FROM achievement_reward_receipts r JOIN achievement_catalog c ON c.id=r.achievement_id");
for(const row of historyRows.iterate()){const history=JSON.parse(row.data);for(const [id,amount] of Object.entries(history.xpAwards??{}))addXp(id,history.gameId,amount);}
for(const row of rewardRows.iterate())for(const reward of JSON.parse(row.data??"{}").rewards?.xp??[])addXp(row.user_id,reward.gameId,reward.amount);
const actualXp=new Map(db.prepare("SELECT user_id,game_id,xp FROM user_game_xp").all().map((row)=>[`${row.user_id}:${row.game_id}`,row.xp]));
const xpDifferences=[...new Set([...expectedXp.keys(),...actualXp.keys()])].filter((key)=>(expectedXp.get(key)??0)!==(actualXp.get(key)??0));
const checks={
  integrity:db.prepare("PRAGMA quick_check").get().quick_check==="ok",
  foreignKeys:db.prepare("PRAGMA foreign_key_check").all().length===0,
  uniqueRankedResults:n("SELECT count(*) AS n FROM (SELECT match_id,user_id,count(*) AS c FROM ranked_results GROUP BY match_id,user_id HAVING c>1)")===0,
  uniqueSettlements:n("SELECT count(*) AS n FROM (SELECT match_id,count(*) AS c FROM ranked_settlements GROUP BY match_id HAVING c>1)")===0,
  uniqueGameHistories:n("SELECT count(*) AS n FROM (SELECT json_extract(data,'$.roomId') AS room,count(*) AS c FROM history GROUP BY room HAVING c>1)")===0,
  uniqueAchievementRewards:n("SELECT count(*) AS n FROM (SELECT user_id,achievement_id,count(*) AS c FROM achievement_reward_receipts GROUP BY user_id,achievement_id HAVING c>1)")===0,
  uniqueEventActions:n("SELECT count(*) AS n FROM (SELECT event_id,user_id,request_id,count(*) AS c FROM community_event_actions WHERE request_id IS NOT NULL AND request_id<>'' GROUP BY event_id,user_id,request_id HAVING c>1)")===0,
  nonnegativeXp:n("SELECT count(*) AS n FROM user_game_xp WHERE xp<0")===0,
  xpMatchesRecordedAwards:xpDifferences.length===0,
  balancesMatchTransactions:n("SELECT count(*) AS n FROM (SELECT u.id FROM users u LEFT JOIN transactions t ON t.user_id=u.id GROUP BY u.id HAVING abs(json_extract(u.data,'$.tokens')-(1000000+coalesce(sum(t.amount),0)))>.001)")===0,
  validBalances:n("SELECT count(*) AS n FROM users WHERE json_extract(data,'$.tokens')<0 OR json_type(data,'$.tokens') NOT IN ('integer','real')")===0,
  fictitiousAccounts:db.prepare("SELECT id,email FROM users").all().every((row)=>row.id.startsWith(manifest.runId) && row.email.endsWith("@loadtest.invalid"))
};
const counts=Object.fromEntries(["users","rooms","history","transactions","ranked_results","ranked_settlements","achievement_reward_receipts","community_event_actions"].map((table)=>[table,n(`SELECT count(*) AS n FROM ${table}`)]));
const xp=db.prepare("SELECT game_id AS gameId,count(*) AS players,sum(xp) AS xp FROM user_game_xp GROUP BY game_id").all();
const result={runId:manifest.runId,checks,counts,xp,xpDifferences,passed:Object.values(checks).every(Boolean)};db.exec("ROLLBACK");db.close();
if(args.output)fs.writeFileSync(args.output,JSON.stringify(result,null,2));
console.log(JSON.stringify(result));process.exitCode=result.passed?0:1;
if (process.connected) process.disconnect();
