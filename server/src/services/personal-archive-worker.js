import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { ZipFile } from "yazl";
import { removePersonalSecrets, personalGame } from "./personal-archive-data.js";
import { directChannelId } from "./chat.js";

const { userId, paths, requestId, contactEmail, maxBytes } = workerData;
const databases = [];
const counts = {};
const open = (key) => {
  const db = new DatabaseSync(paths[key], { readOnly: true });
  db.exec("PRAGMA busy_timeout=5000; BEGIN");
  databases.push(db);
  return db;
};
try {
  const main = open("main"), chat = open("chat"), parental = open("parental"), tribunal = open("tribunal"), logs = open("logs"), notes = open("notes"), help = open("help"), requests = open("requests");
  const userRow = main.prepare("SELECT data FROM users WHERE id=? AND guest=0").get(userId);
  if (!userRow) throw new Error("Compte introuvable.");
  const user = JSON.parse(userRow.data);
  const zip = new ZipFile();
  const json = (name, data) => zip.addBuffer(Buffer.from(JSON.stringify(data, null, 2)), name, { compressionLevel: 6 });
  const rows = (name, db, sql, params = [userId], transform = (row) => row) => {
    const statement = db.prepare(sql);
    zip.addReadStreamLazy(`${name}.jsonl`, (callback) => callback(null, Readable.from((function* () {
      let count = 0;
      for (const row of statement.iterate(...params)) { count++; yield JSON.stringify(removePersonalSecrets(transform(row))) + "\n"; }
      counts[name] = count;
    })())));
  };
  const security = { hasPassword: Boolean(user.passwordHash), totpEnabled: Boolean(user.mfa?.totpSecret), emailMfaEnabled: Boolean(user.mfa?.emailEnabled), administratorMfaRequired: Boolean(user.admin), recoveryCodesRemaining: user.mfa?.recoveryCodeHashes?.length ?? 0 };
  const account = removePersonalSecrets(user);
  account.mfa = security;
  json("compte.json", account);
  rows("inventaire", main, "SELECT i.type,i.item_id,c.data AS definition FROM user_inventory i LEFT JOIN item_catalog c ON c.type=i.type AND c.id=i.item_id WHERE i.user_id=? ORDER BY i.type,i.position", [userId], (row) => ({ ...row, definition: row.definition ? JSON.parse(row.definition) : null }));
  rows("succes", main, "SELECT a.achievement_id,a.unlocked,a.suppressed,a.unlocked_at,c.data AS definition FROM user_achievements a LEFT JOIN achievement_catalog c ON c.id=a.achievement_id WHERE a.user_id=?", [userId], (row) => ({ ...row, definition: row.definition ? JSON.parse(row.definition) : null }));
  rows("progression-succes", main, "SELECT achievement_id,value,data,updated_at FROM achievement_progress WHERE user_id=?", [userId], (row) => ({ ...row, data: row.data ? JSON.parse(row.data) : null }));
  rows("progression-jeux", main, "SELECT game_id,xp FROM user_game_xp WHERE user_id=? ORDER BY game_id", [userId]);
  for (const [name,table,sql] of [["classements-elo","user_game_elo","SELECT game_id,elo,games,wins FROM user_game_elo WHERE user_id=? ORDER BY game_id"],["historique-elo","ranked_results","SELECT history_id,match_id,game_id,finished_at,data FROM ranked_results WHERE user_id=? ORDER BY finished_at"]]) {
    if (main.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) rows(name,main,sql,[userId],(row)=>({...row,...(row.data ? {data:JSON.parse(row.data)} : {})}));
  }
  rows("recompenses-succes", main, "SELECT achievement_id FROM achievement_reward_receipts WHERE user_id=? ORDER BY achievement_id", [userId]);
  rows("parties", main, "SELECT h.data,m.player,m.score,m.gain,m.won,(SELECT COUNT(*) FROM history_members all_members WHERE all_members.history_id=h.id) AS participantCount FROM history h JOIN history_members m ON m.history_id=h.id WHERE m.user_id=? ORDER BY h.finished_at", [userId], (row) => ({ ...personalGame({ ...JSON.parse(row.data), players: row.player ? [JSON.parse(row.player)] : [], participantCount: row.participantCount }, userId), score: row.score, gain: row.gain, won: Boolean(row.won) }));
  rows("transactions", main, "SELECT data FROM transactions WHERE user_id=? ORDER BY created_at", [userId], (row) => JSON.parse(row.data));
  for (const [name, table] of [["evenements-participation", "community_event_participants"], ["evenements-actions", "community_event_actions"], ["evenements-recompenses", "community_event_rewards"], ["evenements-effets", "community_event_effects"]]) rows(name, main, `SELECT data FROM ${table} WHERE user_id=?`, [userId], (row) => JSON.parse(row.data));
  rows("messages-envoyes", chat, "SELECT id,channel_type,channel_id,content,created_at FROM chat_messages WHERE sender_id=? ORDER BY created_at");
  // Recover memberships for conversations written before explicit participant storage existed.
  const directIds = new Set(chat.prepare("SELECT channel_id FROM chat_direct_members WHERE user_id=? UNION SELECT channel_id FROM chat_reads WHERE user_id=? AND channel_type='direct' UNION SELECT channel_id FROM chat_messages WHERE sender_id=? AND channel_type='direct'").all(userId, userId, userId).map((row) => row.channel_id));
  const peers = new Set([...main.prepare("SELECT id FROM users WHERE id!=?").all(userId).map((row) => row.id), ...chat.prepare("SELECT DISTINCT sender_id FROM chat_messages WHERE channel_type='direct' AND sender_id!=?").all(userId).map((row) => row.sender_id)]);
  for (const id of peers) directIds.add(directChannelId(userId, id));
  const incoming = chat.prepare("SELECT id,channel_id,content,created_at FROM chat_messages WHERE channel_type='direct' AND channel_id=? AND sender_id!=? ORDER BY created_at");
  zip.addReadStreamLazy("messages-prives-recus.jsonl", (callback) => callback(null, Readable.from((function* () {
    let count = 0;
    for (const id of directIds) for (const row of incoming.iterate(id, userId)) { count++; yield JSON.stringify(row) + "\n"; }
    counts["messages-prives-recus"] = count;
  })())));
  rows("conversations-lues", chat, "SELECT channel_type,channel_id,read_at FROM chat_reads WHERE user_id=?");
  rows("activite-parentale", parental, "SELECT day,category,label,count,duration_seconds,first_at,last_at FROM parental_activity WHERE user_id=? ORDER BY day");
  rows("dossier-parental", parental, "SELECT code,child_email,child_pseudo,child_birth_date,status,created_at,parent_verified_at,parent_consent_at,reviewed_at,rejection_reason FROM parental_requests WHERE user_id=?");
  rows("courriers-parentaux", parental, "SELECT kind,day,sent_at FROM parental_mail_log WHERE user_id=?");
  rows("comportement", tribunal, "SELECT score,cases,sanctions,updated_at FROM tribunal_behavior WHERE user_id=?");
  rows("dossiers-tribunal", tribunal, "SELECT public_code,title,summary,status,source,report_count,starts_at,ends_at,raw_score,final_score,behavior_before,behavior_after,outcome,resolved_at,sanction_applied,hard_ban_days,social_ban_days,created_at FROM tribunal_cases WHERE accused_id=?");
  rows("signalements-recus", tribunal, "SELECT category,status,created_at,reviewed_at FROM tribunal_reports WHERE accused_id=?");
  rows("signalements-envoyes", tribunal, "SELECT category,description,status,created_at,reviewed_at FROM tribunal_reports WHERE reporter_id=?");
  rows("votes-tribunal", tribunal, "SELECT case_id,score,rationale,reward,reward_paid,created_at FROM tribunal_votes WHERE juror_id=?");
  rows("assignations-tribunal", tribunal, "SELECT case_id,assigned_at,status FROM tribunal_assignments WHERE juror_id=?");
  rows("journaux-techniques", logs, "SELECT at,level,category,method,route,status,duration,request_id,origin,browser,message FROM request_logs WHERE user_id=? ORDER BY at");
  rows("reactions-patchnotes", notes, "SELECT patchnote_id,value,updated_at FROM patchnote_reactions WHERE user_id=?");
  rows("patchnotes-redigees", notes, "SELECT id,version,version_group,title,summary,status,published_at,created_at,updated_at FROM patchnotes WHERE author_id=?");
  rows("patchnotes-blocs-rediges", notes, "SELECT b.* FROM patchnote_blocks b JOIN patchnotes n ON n.id=b.patchnote_id WHERE n.author_id=? ORDER BY b.patchnote_id,b.position");
  rows("patchnotes-pieces-jointes", notes, "SELECT a.* FROM patchnote_attachments a JOIN patchnotes n ON n.id=a.patchnote_id WHERE n.author_id=?");
  if (paths.noteImages) for (const attachment of notes.prepare("SELECT a.id,a.filename FROM patchnote_attachments a JOIN patchnotes n ON n.id=a.patchnote_id WHERE n.author_id=?").iterate(userId)) {
    if (path.basename(attachment.filename) !== attachment.filename) throw new Error("Chemin de pièce jointe invalide : revue manuelle nécessaire.");
    const filename = path.join(paths.noteImages, attachment.filename);
    if (!fs.existsSync(filename)) throw new Error("Pièce jointe personnelle manquante : revue manuelle nécessaire.");
    zip.addFile(filename, `pieces-jointes/${attachment.filename}`);
  }
  const settings = JSON.parse(main.prepare("SELECT value FROM meta WHERE key='admin-settings'").get()?.value ?? "{}");
  json("contributions-catalogue.json", removePersonalSecrets({ shop: (settings.customShopItems ?? []).filter((entry) => entry.createdById === userId), achievements: (settings.customAchievements ?? []).filter((entry) => entry.createdById === userId) }));
  rows("evenements-rediges", main, "SELECT data FROM community_events WHERE json_extract(data,'$.createdById')=?", [userId], (row) => {
    const event = JSON.parse(row.data);
    return { id: event.id, name: event.name, description: event.description, shortDescription: event.shortDescription, slug: event.slug, status: event.status, startsAt: event.startsAt, endsAt: event.endsAt, createdAt: event.createdAt, updatedAt: event.updatedAt };
  });
  rows("tables-actuelles", main, "SELECT data FROM rooms WHERE json_extract(data,'$.ownerId')=? OR EXISTS(SELECT 1 FROM json_each(json_extract(data,'$.players')) p WHERE json_extract(p.value,'$.id')=?)", [userId, userId], (row) => {
    const room = JSON.parse(row.data);
    const player = room.players?.find((entry) => entry.id === userId);
    const playerState = Object.fromEntries(["hands", "scores", "stacks", "bets", "payouts", "lastDiceByPlayer", "diceCounts", "trays", "prestige", "piles", "contracts"].filter((key) => room.state?.[key]?.[userId] !== undefined).map((key) => [key, room.state[key][userId]]));
    return { id: room.id, name: room.name, gameId: room.gameId, createdAt: room.createdAt, owner: room.ownerId === userId, finished: room.finished, stake: room.stake, player: player ? { id: player.id, pseudo: player.pseudo, ready: player.ready } : null, playerState };
  });
  rows("lecture-guide", help, "SELECT revision,dismissed_at FROM help_reads WHERE user_id=?");
  rows("demandes-de-donnees", requests, "SELECT id,email,status,requested_at,due_at,approved_at,sent_at,extension_reason,extended_at,attempts FROM data_requests WHERE user_id=?");
  if (paths.bugs) {
    const bugs = open("bugs");
    rows("bugs-signales", bugs, "SELECT id,title,category,description,expected,actual,steps,frequency,impact,status,priority,context,diagnostics,consent_at,created_at,updated_at FROM bug_reports WHERE reporter_id=?", [userId], (row) => ({ ...row, context: JSON.parse(row.context), diagnostics: row.diagnostics ? JSON.parse(row.diagnostics) : null }));
    rows("bugs-commentaires-envoyes", bugs, "SELECT bug_id,body,visible,created_at FROM bug_comments WHERE author_id=? AND kind!='internal'");
    rows("bugs-reponses-equipe", bugs, "SELECT c.bug_id,c.body,c.created_at FROM bug_comments c JOIN bug_reports b ON b.id=c.bug_id WHERE b.reporter_id=? AND c.kind='staff'");
    if (paths.bugImages) {
      const attachments = bugs.prepare("SELECT i.filename FROM bug_images i JOIN bug_reports b ON b.id=i.bug_id WHERE b.reporter_id=?");
      for (const attachment of attachments.iterate(userId)) {
        if (path.basename(attachment.filename) !== attachment.filename) throw new Error("Capture invalide : revue manuelle nécessaire.");
        const filename = path.join(paths.bugImages, attachment.filename);
        if (!fs.existsSync(filename)) throw new Error("Capture personnelle manquante : revue manuelle nécessaire.");
        zip.addFile(filename, `captures-bugs/${attachment.filename}`);
      }
    }
  }
  json("informations.json", { generatedAt: new Date().toISOString(), requestId, userId, contactEmail, format: "JSON et JSONL : une entrée JSON par ligne", purposes: ["Gestion du compte et protections liées à l’âge", "Fonctionnement des jeux et économie exclusivement virtuelle", "Personnalisation et succès", "Communications demandées et modération", "Sécurité et diagnostic des services"], excluded: ["Secrets d’authentification, codes, empreintes de mots de passe et liens d’accès", "Données privées des autres joueurs, identité des jurés et des auteurs de signalements, coordonnées parentales", "Données déjà supprimées selon les durées de conservation"], manualReview: ["Journaux d’hébergement, correspondance externe et documents de vérification", "Copies de sauvegarde non restaurées et données mixtes nécessitant une revue des droits des tiers"], contact: "Pour compléter ou contester cette copie, contactez le responsable via l’adresse indiquée." });
  zip.addBuffer(Buffer.from("TES DONNEES PERSONNELLES\n\nOuvre compte.json pour ton profil. Les fichiers .jsonl contiennent une entrée JSON par ligne : aucun historique n’est limité aux dernières pages affichées sur le site.\n\nLes secrets de connexion et les données privées des tiers sont exclus. La génération se fait sur des instantanés en lecture seule des bases, au moment de l’approbation.\n\nPour le détail des finalités, de tes droits, des durées et du contact, consulte informations.json et la page Confidentialité du site.\n\nConserve cette archive dans un endroit privé.\n"), "LIRE-MOI.txt");
  const chunks = [];
  let size = 0;
  zip.on("error", (error) => zip.outputStream.destroy(error));
  zip.end();
  for await (const chunk of zip.outputStream) { size += chunk.length; if (size > maxBytes) throw new Error("L’archive complète dépasse la limite d’envoi email. Organise une remise sécurisée ; aucune donnée n’a été tronquée."); chunks.push(chunk); }
  parentPort.postMessage({ content: Buffer.concat(chunks), counts });
} catch (error) { parentPort.postMessage({ error: error.message }); }
finally { for (const db of databases) db.close(); }
