import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BadgeCheck, Check, Coins, History, KeyRound, LogOut, Mail, Package, Save, Scale, Search, Shield, ShieldCheck, Trash2, User, UserCheck, Users, WalletCards, X } from "lucide-react";
import { api } from "../../api.js";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { shopTypeLabel } from "../cosmetics/Cosmetics.jsx";
import { CompactNumber, transactionLabel } from "../../utils/presentation.jsx";
import { bonusProgression, bonusRuleEffect } from "../../features/bonus/config.js";

const equippedKeys = { icons: "icon", nameEffects: "nameEffect", memberCards: "memberCard", profileBanners: "profileBanner", profileFrames: "profileFrame", profileEffects: "profileEffect", diceSkins: "diceSkin", cardSkins: "cardSkin" };
const inventoryTypes = Object.keys(equippedKeys);
const publicStatOptions = [["age", "Âge"], ["gender", "Genre"], ["friends", "Amis"], ["gamesPlayed", "Parties"], ["wins", "Victoires"], ["winRate", "Winrate"], ["achievements", "Succès"]];
const memberCardStatOptions = [["winRate", "Winrate"], ["wins", "Victoires"], ["gamesPlayed", "Parties"], ["achievementsUnlocked", "Succès obtenus"], ["customAchievement", "Succès personnalisé"], ["hidden", "Masqué"]];

function PlayerChip({ player }) {
  return <span className={`admin-player-chip ${player.won ? "winner" : ""} ${player.isBot ? "bot" : ""}`} title={`${player.pseudo}${player.isBot ? " · IA" : ""}${player.won ? " · vainqueur" : ""}`}><i>{player.isBot ? "IA" : player.pseudo?.slice(0, 1)?.toUpperCase()}</i><b>{player.pseudo}</b>{player.won && <em>Gagnant</em>}</span>;
}

function ParticipantList({ players = [] }) {
  const visible = players.slice(0, 4);
  const remaining = players.slice(4);
  return <div className="admin-participants"><span className="admin-participants-label">{players.length} participant{players.length > 1 ? "s" : ""}</span><div className="admin-participant-preview">{visible.map((player) => <PlayerChip key={player.id} player={player} />)}{remaining.length > 0 && <details><summary>+{remaining.length}</summary><div>{remaining.map((player) => <PlayerChip key={player.id} player={player} />)}</div></details>}</div></div>;
}

function formatDate(value) {
  if (!value) return "Non disponible";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function UserEditor({ row, currentUser, games, settings, onClose, onSaved, notifySuccess, reportError: reportParentError }) {
  const [detail, setDetail] = useState(null);
  const [draft, setDraft] = useState(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [inventoryType, setInventoryType] = useState("icons");
  const [inventorySearch, setInventorySearch] = useState("");
  const [achievementFilter, setAchievementFilter] = useState("all");
  const [achievementSearch, setAchievementSearch] = useState("");
  const [achievementChanges, setAchievementChanges] = useState({});
  const [adjustment, setAdjustment] = useState({ amount: 0, note: "" });
  const [bonusMode, setBonusMode] = useState("current");
  const [localError, setLocalError] = useState("");
  const [historyFilters, setHistoryFilters] = useState({ search: "", game: "all", result: "all" });
  const [transactionFilters, setTransactionFilters] = useState({ search: "", game: "all", event: "all", direction: "all" });
  const [historyLimit, setHistoryLimit] = useState(40);
  const [transactionLimit, setTransactionLimit] = useState(60);

  function reportError(message) {
    setLocalError(message);
    reportParentError?.(message);
  }

  async function loadDetail() {
    setLoading(true);
    reportError("");
    try {
      const next = await api(`/api/admin/users/${row.id}`);
      setDetail(next);
      setDraft({ ...next.user, password: "" });
      setAchievementChanges({});
    } catch (error) {
      reportError(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDetail(); }, [row.id]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateProfileStats(recipe) {
    setDraft((current) => ({ ...current, profileStats: recipe(current.profileStats ?? {}) }));
  }

  function updateCosmetics(recipe) {
    setDetail((current) => ({ ...current, inventory: { ...current.inventory, cosmetics: recipe(current.inventory.cosmetics) } }));
  }

  function toggleOwned(item) {
    updateCosmetics((cosmetics) => {
      const values = cosmetics[item.type] ?? [];
      const owned = values.includes(item.value);
      const defaults = { icons: "chip", nameEffects: "none", memberCards: "default", profileBanners: "default", profileFrames: "none", profileEffects: "none", diceSkins: "default", cardSkins: "default" };
      if (owned && item.value === defaults[item.type]) return cosmetics;
      const nextValues = owned ? values.filter((value) => value !== item.value) : [...values, item.value];
      const equippedKey = equippedKeys[item.type];
      const equipped = { ...cosmetics.equipped };
      if (owned && equipped[equippedKey] === item.value) equipped[equippedKey] = defaults[item.type];
      return { ...cosmetics, [item.type]: nextValues, equipped };
    });
  }

  function equipItem(item) {
    updateCosmetics((cosmetics) => ({ ...cosmetics, equipped: { ...cosmetics.equipped, [equippedKeys[item.type]]: item.value } }));
  }

  async function saveAll() {
    if (!draft.login?.trim() || !draft.displayName?.trim()) return reportError("L’adresse email et le pseudo affiché sont requis.");
    setSaving("all");
    reportError("");
    try {
      await api(`/api/admin/users/${row.id}`, { method: "PATCH", body: JSON.stringify(draft) });
      await api(`/api/admin/users/${row.id}/inventory`, { method: "PUT", body: JSON.stringify({ cosmetics: detail.inventory.cosmetics }) });
      if (Object.keys(achievementChanges).length) await api(`/api/admin/users/${row.id}/achievements`, { method: "PATCH", body: JSON.stringify({ states: achievementChanges }) });
      notifySuccess("Fiche joueur enregistrée.");
      await onSaved();
      await loadDetail();
    } catch (error) {
      reportError(error.message);
    } finally {
      setSaving("");
    }
  }

  async function runAccountAction(path, message, { method = "POST", body, close = false, propagate = false } = {}) {
    setSaving("account-action");
    reportError("");
    try {
      await api(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      notifySuccess(message);
      await onSaved();
      if (close) onClose();
      else await loadDetail();
    } catch (error) {
      reportError(error.message);
      if (propagate) throw error;
    } finally {
      setSaving("");
    }
  }

  async function applyAdjustment() {
    const amount = Math.trunc(Number(adjustment.amount));
    if (!amount) return reportError("Saisis un ajustement différent de zéro.");
    setSaving("transaction");
    reportError("");
    try {
      const result = await api(`/api/admin/users/${row.id}/transactions`, { method: "POST", body: JSON.stringify({ amount, note: adjustment.note }) });
      setAdjustment({ amount: 0, note: "" });
      setDraft((current) => ({ ...current, tokens: result.balance }));
      setDetail((current) => ({ ...current, user: { ...current.user, tokens: result.balance }, transactions: [result.transaction, ...current.transactions] }));
      notifySuccess("Ajustement enregistré dans les transactions.");
    } catch (error) {
      reportError(error.message);
    } finally {
      setSaving("");
    }
  }

  const displayedAchievements = useMemo(() => (detail?.achievements ?? []).map((achievement) => ({ ...achievement, unlocked: achievementChanges[achievement.id] ?? achievement.unlocked })), [detail, achievementChanges]);
  const filteredAchievements = displayedAchievements.filter((entry) => achievementFilter === "all" || (achievementFilter === "unlocked" ? entry.unlocked : !entry.unlocked)).filter((entry) => `${entry.title} ${entry.description} ${entry.group} ${entry.gameId ?? ""}`.toLowerCase().includes(achievementSearch.trim().toLowerCase()));
  const filteredInventory = (detail?.inventory?.catalog ?? []).filter((item) => item.type === inventoryType).filter((item) => `${item.name} ${item.value} ${item.category}`.toLowerCase().includes(inventorySearch.trim().toLowerCase()));
  const historyGameIds = [...new Set((detail?.history ?? []).map((entry) => entry.gameId).filter(Boolean))];
  const filteredHistory = (detail?.history ?? []).filter((entry) => historyFilters.game === "all" || entry.gameId === historyFilters.game).filter((entry) => historyFilters.result === "all" || (historyFilters.result === "won" ? entry.won : !entry.won)).filter((entry) => `${entry.name} ${entry.code} ${entry.gameId} ${(entry.players ?? []).map((player) => player.pseudo).join(" ")}`.toLowerCase().includes(historyFilters.search.trim().toLowerCase()));
  const transactionGameIds = [...new Set((detail?.transactions ?? []).map((entry) => entry.gameId).filter(Boolean))];
  const transactionEvents = [...new Set((detail?.transactions ?? []).map((entry) => entry.reason).filter(Boolean))].sort((a, b) => transactionLabel(a).localeCompare(transactionLabel(b), "fr"));
  const filteredTransactions = (detail?.transactions ?? []).filter((entry) => transactionFilters.game === "all" || (transactionFilters.game === "global" ? !entry.gameId : entry.gameId === transactionFilters.game)).filter((entry) => transactionFilters.event === "all" || entry.reason === transactionFilters.event).filter((entry) => transactionFilters.direction === "all" || (transactionFilters.direction === "credit" ? entry.amount >= 0 : entry.amount < 0)).filter((entry) => `${transactionLabel(entry.reason)} ${entry.note ?? ""} ${entry.gameId ?? ""} ${entry.roomId ?? ""} ${entry.eventId ?? ""}`.toLowerCase().includes(transactionFilters.search.trim().toLowerCase()));
  const bonusTransactionCount = (detail?.transactions ?? []).filter((entry) => entry.reason === "daily-claim").length;
  const bonusStatus = detail?.bonus?.status ?? {};
  const bonusRows = bonusProgression(settings, 30, bonusMode === "current" ? bonusStatus.multiplier : settings.dailyBonusDefaultMultiplier, bonusMode === "current" ? bonusStatus.streak : 0);
  const transactionBalance = Number(detail?.user?.tokens) || 0;
  const projectedBalance = transactionBalance + (Number(adjustment.amount) || 0);
  const tabs = [
    ["overview", "Vue d’ensemble", Activity], ["public", "Profil public", User], ["private", "Compte privé", Shield], ["inventory", "Inventaire", Package],
    ["history", "Historique", History], ["transactions", "Transactions", WalletCards], ["achievements", "Succès", BadgeCheck], ["bonus", "Bonus", Activity]
  ];

  return <div className="modal-backdrop" onClick={onClose}>
    <section className="modal admin-user-editor" onClick={(event) => event.stopPropagation()}>
      <div className="modal-title-row admin-user-editor-title">
        <div><span className="eyebrow">Fiche joueur complète</span><h2>{draft?.displayName ?? row.displayName}</h2><small>{draft?.login ?? row.login} · {row.id}</small></div>
        <button type="button" className="secondary icon-toggle" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
      </div>
      <nav className="admin-user-tabs" aria-label="Sections de la fiche joueur">
        {tabs.map(([value, label, Icon]) => <button type="button" key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}><Icon size={16} />{label}</button>)}
      </nav>
      {localError && <div className="error admin-user-editor-error"><AlertTriangle size={17} /><span>{localError}</span><button type="button" className="secondary icon-toggle" onClick={() => reportError("")} aria-label="Fermer"><X size={15} /></button></div>}
      {loading || !draft || !detail ? <div className="admin-user-loading"><Activity className="spinning" /><strong>Chargement de la fiche…</strong></div> : <div className="admin-user-editor-body">
        {tab === "overview" && <div className="admin-user-overview">
          <section className="admin-user-overview-hero">
            <div className="admin-user-overview-identity"><span className="eyebrow">État du compte</span><h3>{draft.displayName}</h3><p>{draft.login}</p><div className="admin-account-badges"><span className={`status-badge ${draft.active ? "status-active" : "status-inactive"}`}>{draft.active ? "Compte actif" : "Compte désactivé"}</span><span className={`status-badge ${draft.emailVerified ? "status-active" : "status-waiting"}`}>{draft.legacyLogin ? "Ancien identifiant" : draft.emailVerified ? "Email validé" : "Validation en attente"}</span>{draft.admin && <span className="status-badge status-custom">Administrateur</span>}{draft.editor && <span className="status-badge status-custom">Éditeur</span>}</div></div>
            <div className="admin-user-overview-actions">
              {!draft.legacyLogin && !draft.emailVerified && <button type="button" disabled={saving === "account-action"} onClick={() => runAccountAction(`/api/admin/users/${draft.id}/email-validation`, "Adresse email validée.", { body: { verified: true } })}><ShieldCheck size={17} /> Valider l’email</button>}
              {!draft.legacyLogin && !draft.emailVerified && <button type="button" className="secondary" disabled={saving === "account-action" || !settings.emailVerificationAvailable} title={!settings.emailVerificationAvailable ? "Service email indisponible" : ""} onClick={() => runAccountAction(`/api/admin/users/${draft.id}/send-verification`, "Email de validation envoyé.")}><Mail size={17} /> Envoyer une validation</button>}
              {draft.id !== currentUser.id && <ConfirmActionButton className="secondary" disabled={saving === "account-action"} dialogTitle="Fermer toutes les sessions ?" message={`Toutes les sessions ouvertes de ${draft.displayName} seront invalidées. Le joueur devra se reconnecter.`} confirmLabel="Révoquer les sessions" danger onConfirm={() => runAccountAction(`/api/admin/users/${draft.id}/revoke-sessions`, "Sessions du joueur révoquées.", { propagate: true })}><LogOut size={17} /> Révoquer les sessions</ConfirmActionButton>}
            </div>
          </section>
          <section className="admin-user-kpi-grid" aria-label="Statistiques du joueur">
            <article><Activity /><span>Parties</span><strong><CompactNumber value={detail.statistics.gamesPlayed} /></strong><small>{detail.statistics.wins} victoire(s) · {detail.statistics.winRate}%</small></article>
            <article><WalletCards /><span>Transactions</span><strong><CompactNumber value={detail.statistics.transactions} /></strong><small><CompactNumber value={detail.statistics.credits} prefix="+" /> / <CompactNumber value={detail.statistics.debits} prefix="−" /></small></article>
            <article><Coins /><span>Solde</span><strong><CompactNumber value={draft.tokens} label="Solde exact" /></strong><small><CompactNumber value={detail.statistics.staked} suffix=" misés" /></small></article>
            <article><BadgeCheck /><span>Succès</span><strong>{displayedAchievements.filter((entry) => entry.unlocked).length}/{displayedAchievements.length}</strong><small>{detail.statistics.shopPurchases} achat(s) boutique</small></article>
            <article><Scale /><span>Comportement</span><strong>{detail.tribunal.behavior.score}/100</strong><small>{detail.tribunal.reports.total} signalement(s) · {detail.tribunal.behavior.sanctions} sanction(s)</small></article>
          </section>
          <div className="admin-user-overview-columns">
            <section className="admin-form-section"><div className="admin-form-section-title"><UserCheck /><div><h3>Activité et sécurité</h3><p>Repères utiles pour diagnostiquer l’accès au compte.</p></div></div><div className="admin-account-facts"><span>Création<strong>{formatDate(draft.createdAt)}</strong></span><span>Dernière connexion<strong>{formatDate(draft.lastLoginAt)}</strong></span><span>Dernier bonus<strong>{draft.lastDailyClaim || "Jamais"}</strong></span><span>Réinitialisation demandée<strong>{detail.security.passwordResetPending ? formatDate(detail.security.passwordResetSentAt) : "Non"}</strong></span><span>Validation envoyée<strong>{detail.security.emailVerificationPending ? formatDate(detail.security.emailVerificationSentAt) : "Non"}</strong></span><span>Version des sessions<strong>{detail.security.sessionVersion}</strong></span></div></section>
            <section className="admin-form-section"><div className="admin-form-section-title"><Users /><div><h3>Relations</h3><p>Amis et demandes associées à ce compte.</p></div></div><div className="admin-relation-summary"><span><strong>{detail.relationships.friends.length}</strong> ami(s)</span><span><strong>{detail.relationships.incoming.length}</strong> reçue(s)</span><span><strong>{detail.relationships.outgoing.length}</strong> envoyée(s)</span></div><div className="admin-relation-list">{detail.relationships.friends.slice(0, 12).map((friend) => <span key={friend.id} className={friend.active ? "" : "inactive"}><i>{friend.displayName.slice(0, 1).toUpperCase()}</i>{friend.displayName}</span>)}{!detail.relationships.friends.length && <small>Aucun ami.</small>}</div></section>
            <section className="admin-form-section admin-user-active-rooms"><div className="admin-form-section-title"><Activity /><div><h3>Tables actives</h3><p>Une suppression reste bloquée tant que le joueur occupe une table.</p></div></div>{detail.activeRooms.map((room) => <article key={room.id}><div><strong>{room.name}</strong><small>{games.find((game) => game.id === room.gameId)?.name ?? room.gameId} · code {room.code}</small></div><span className={`status-badge ${room.playing ? "status-live" : "status-waiting"}`}>{room.playing ? "En jeu" : "En attente"}</span>{room.owner && <b>Maître</b>}</article>)}{!detail.activeRooms.length && <div className="empty-state">Aucune table active.</div>}</section>
          </div>
        </div>}
        {tab === "public" && <div className="admin-user-panel-grid">
          <section className="admin-form-section"><div className="admin-form-section-title"><User /><div><h3>Identité publique</h3><p>Ces informations sont visibles par les autres joueurs.</p></div></div><div className="admin-field-grid"><label>Pseudo affiché<input required maxLength="32" value={draft.displayName} onChange={(event) => updateDraft("displayName", event.target.value)} /></label><label>Genre<input maxLength="32" value={draft.gender ?? ""} onChange={(event) => updateDraft("gender", event.target.value)} placeholder="Non renseigné" /></label><label>Date de naissance<input type="date" value={draft.birthDate ?? ""} onChange={(event) => updateDraft("birthDate", event.target.value)} /></label></div><label>Biographie<textarea maxLength="180" value={draft.bio ?? ""} onChange={(event) => updateDraft("bio", event.target.value)} /><small>{draft.bio?.length ?? 0}/180 caractères · texte brut uniquement</small></label></section>
          <section className="admin-form-section"><div className="admin-form-section-title"><BadgeCheck /><div><h3>Jeux favoris</h3><p>Jusqu’à cinq jeux affichés sur le profil public.</p></div></div><div className="admin-choice-grid">{games.map((game) => { const checked = draft.favoriteGames?.includes(game.id); return <label key={game.id} className={checked ? "selected" : ""}><input type="checkbox" checked={checked} disabled={!checked && (draft.favoriteGames?.length ?? 0) >= 5} onChange={() => updateDraft("favoriteGames", checked ? draft.favoriteGames.filter((id) => id !== game.id) : [...(draft.favoriteGames ?? []), game.id])} /><span>{game.name}</span></label>; })}</div></section>
          <section className="admin-form-section"><div className="admin-form-section-title"><Activity /><div><h3>Statistiques publiques</h3><p>Contrôle les blocs visibles sur le profil et les deux champs de la member card.</p></div></div><div className="admin-choice-grid">{publicStatOptions.map(([value, label]) => { const checked = draft.profileStats?.visibleProfileStats?.includes(value); return <label key={value} className={checked ? "selected" : ""}><input type="checkbox" checked={checked} onChange={() => updateProfileStats((stats) => ({ ...stats, visibleProfileStats: checked ? stats.visibleProfileStats.filter((entry) => entry !== value) : [...(stats.visibleProfileStats ?? []), value] }))} /><span>{label}</span></label>; })}</div><div className="admin-field-grid">{[0, 1].map((index) => <label key={index}>Champ {index + 1} de la member card<select value={draft.profileStats?.memberCardStats?.[index] ?? (index ? "achievementsUnlocked" : "winRate")} onChange={(event) => updateProfileStats((stats) => { const values = [...(stats.memberCardStats ?? ["winRate", "achievementsUnlocked"])]; values[index] = event.target.value; return { ...stats, memberCardStats: values }; })}>{memberCardStatOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{draft.profileStats?.memberCardStats?.[index] === "customAchievement" && <select aria-label={`Succès personnalisé ${index + 1}`} value={draft.profileStats?.customAchievementIds?.[index] ?? ""} onChange={(event) => updateProfileStats((stats) => { const values = [...(stats.customAchievementIds ?? ["", ""])]; values[index] = event.target.value; return { ...stats, customAchievementIds: values }; })}><option value="">Aucun succès</option>{displayedAchievements.filter((entry) => entry.unlocked).map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select>}</label>)}</div></section>
        </div>}

        {tab === "private" && <div className="admin-user-panel-grid">
          <section className="admin-form-section"><div className="admin-form-section-title"><KeyRound /><div><h3>Connexion et sécurité</h3><p>Le mot de passe actuel n’est jamais exposé. Toute modification de l’email ou du mot de passe invalide les anciennes sessions.</p></div></div><div className="admin-field-grid"><label>Adresse email<input required type="email" maxLength="254" value={draft.login} onChange={(event) => updateDraft("login", event.target.value)} /></label><label>Nouveau mot de passe<input type="password" minLength="10" maxLength="128" value={draft.password ?? ""} onChange={(event) => updateDraft("password", event.target.value)} placeholder="10 caractères et 3 types minimum" /></label><label>Dernier bonus quotidien<input type="date" value={draft.lastDailyClaim ?? ""} onChange={(event) => updateDraft("lastDailyClaim", event.target.value)} /></label></div><div className="admin-toggle-stack"><label><span><strong>Email validé</strong><small>Permet l’accès lorsque la validation des comptes est obligatoire.</small></span><input type="checkbox" checked={draft.emailVerified === true} onChange={(event) => updateDraft("emailVerified", event.target.checked)} /></label></div><div className="admin-private-summary"><span>Code ami<strong>{draft.friendCode}</strong></span><span>Création<strong>{formatDate(draft.createdAt)}</strong></span><span>Dernière connexion<strong>{formatDate(draft.lastLoginAt)}</strong></span><span>Mot de passe<strong>{draft.hasPassword ? "Configuré" : "Absent"}</strong></span></div></section>
          <section className="admin-form-section"><div className="admin-form-section-title"><Coins /><div><h3>Compte et autorisations</h3><p>Une modification du solde crée automatiquement une trace administrative.</p></div></div><label>Solde de jetons<input type="number" min="0" max="100000000" value={draft.tokens} onChange={(event) => updateDraft("tokens", Number(event.target.value))} /></label><div className="admin-toggle-stack"><label><span><strong>Compte actif</strong><small>Autorise les nouvelles connexions.</small></span><input type="checkbox" checked={draft.active} onChange={(event) => updateDraft("active", event.target.checked)} /></label><label title={draft.id === currentUser.id ? "Ton propre rôle est protégé." : ""}><span><strong>Administrateur</strong><small>Accès complet au back-office.</small></span><input type="checkbox" disabled={draft.id === currentUser.id} checked={draft.admin} onChange={(event) => updateDraft("admin", event.target.checked)} /></label><label title={draft.id === currentUser.id ? "Ton propre rôle est protégé." : ""}><span><strong>Éditeur boutique</strong><small>Accès limité aux créations personnalisées.</small></span><input type="checkbox" disabled={draft.id === currentUser.id} checked={draft.editor} onChange={(event) => updateDraft("editor", event.target.checked)} /></label></div></section>
          <section className="admin-form-section admin-moderation-section"><div className="admin-form-section-title"><Shield /><div><h3>Sanctions temporaires</h3><p>Le softban limite les interactions. Le hardban ferme les sessions et bloque toute connexion.</p></div></div>{[["softBan", "Softban", "Événements, salons rejoints et interactions sociales sont bloqués."], ["hardBan", "Hardban", "Le compte devient entièrement inaccessible jusqu’à l’échéance."]].map(([type, label, help]) => { const entry = draft.moderation?.[type] ?? {}; return <div className={`admin-moderation-row ${entry.active ? "active" : ""}`} key={type}><label className="admin-moderation-switch"><span><strong>{label}</strong><small>{help}</small></span><input type="checkbox" disabled={draft.id === currentUser.id} checked={entry.active === true} onChange={(event) => updateDraft("moderation", { ...draft.moderation, [type]: { ...entry, active: event.target.checked } })} /></label><div className="admin-field-grid"><label>Motif<input maxLength="240" disabled={!entry.active || draft.id === currentUser.id} value={entry.reason ?? ""} onChange={(event) => updateDraft("moderation", { ...draft.moderation, [type]: { ...entry, reason: event.target.value } })} placeholder="Motif affiché au joueur" /></label><label>Fin de la sanction<input type="datetime-local" disabled={!entry.active || draft.id === currentUser.id} value={entry.endsAt ? new Date(entry.endsAt).toISOString().slice(0, 16) : ""} onChange={(event) => updateDraft("moderation", { ...draft.moderation, [type]: { ...entry, endsAt: event.target.value ? new Date(event.target.value).toISOString() : "" } })} /><small>Laisser vide pour une durée indéterminée.</small></label></div></div>; })}</section>
          <div className="admin-danger-zone admin-user-danger"><strong><AlertTriangle size={16} /> Zone sensible</strong><p>Les réinitialisations conservent les journaux. La suppression retire définitivement le compte et ses données de profil, mais conserve les écritures financières et les parties déjà archivées.</p><div className="actions"><ConfirmActionButton className="danger-button" dialogTitle="Réinitialiser les succès ?" message={`Tous les succès de ${draft.displayName} seront supprimés. Les parties et transactions resteront intactes.`} confirmLabel="Réinitialiser les succès" danger onConfirm={() => runAccountAction(`/api/admin/users/${draft.id}/reset-achievements`, "Succès du joueur réinitialisés.", { propagate: true })}><BadgeCheck size={16} /> Réinitialiser les succès</ConfirmActionButton><ConfirmActionButton className="danger-button" dialogTitle="Réinitialiser le compte ?" message={`Le profil, les cosmétiques, les succès et le solde de ${draft.displayName} seront remis à zéro. Les sessions seront fermées.`} confirmLabel="Réinitialiser le compte" danger onConfirm={() => runAccountAction(`/api/admin/users/${draft.id}/reset-account`, "Compte joueur réinitialisé.", { propagate: true })}><KeyRound size={16} /> Réinitialiser le compte</ConfirmActionButton>{draft.id !== currentUser.id && <ConfirmActionButton className="danger-button admin-delete-user" dialogTitle="Supprimer définitivement ce compte ?" message={`Le compte de ${draft.displayName} sera supprimé. Cette opération est irréversible. Les écritures financières et les parties archivées seront conservées pour l’audit.`} confirmLabel="Supprimer le compte" danger onConfirm={() => runAccountAction(`/api/admin/users/${draft.id}`, "Compte joueur supprimé.", { method: "DELETE", close: true, propagate: true })}><Trash2 size={16} /> Supprimer le compte</ConfirmActionButton>}</div></div>
        </div>}

        {tab === "inventory" && <section className="admin-user-catalog"><div className="admin-user-tools"><label>Catégorie<select value={inventoryType} onChange={(event) => setInventoryType(event.target.value)}>{inventoryTypes.map((type) => <option key={type} value={type}>{shopTypeLabel(type)}</option>)}</select></label><label className="admin-search-field">Rechercher<span><Search size={16} /><input value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} placeholder="Nom ou identifiant" /></span></label></div><div className="admin-inventory-grid">{filteredInventory.map((item) => { const owned = detail.inventory.cosmetics[item.type]?.includes(item.value); const equipped = detail.inventory.cosmetics.equipped[equippedKeys[item.type]] === item.value; return <article key={item.id} className={`${owned ? "owned" : ""} ${equipped ? "equipped" : ""}`}><div><strong>{item.name}</strong><small>{item.category} · {item.value}</small></div>{item.rewardOnly && <span className="status-badge status-custom">Récompense</span>}<label className="admin-owned-toggle"><input type="checkbox" checked={owned} onChange={() => toggleOwned(item)} /><span>{owned ? "Possédé" : "Non possédé"}</span></label><button type="button" className={equipped ? "" : "secondary"} disabled={!owned || equipped} onClick={() => equipItem(item)}>{equipped ? <><Check size={15} /> Équipé</> : "Équiper"}</button></article>; })}</div>{!filteredInventory.length && <div className="empty-state">Aucun objet dans cette catégorie.</div>}</section>}

        {tab === "history" && <section className="admin-user-ledger admin-history-panel">
          <div className="admin-form-section-title"><History /><div><h3>Historique des parties</h3><p>Jusqu’aux 250 dernières parties, avec leurs participants et leur résultat.</p></div></div>
          <div className="admin-ledger-filters">
            <label className="admin-search-field">Rechercher<span><Search size={16} /><input value={historyFilters.search} onChange={(event) => { setHistoryFilters({ ...historyFilters, search: event.target.value }); setHistoryLimit(40); }} placeholder="Table, code ou joueur" /></span></label>
            <label>Jeu<select value={historyFilters.game} onChange={(event) => { setHistoryFilters({ ...historyFilters, game: event.target.value }); setHistoryLimit(40); }}><option value="all">Tous les jeux</option>{historyGameIds.map((gameId) => <option key={gameId} value={gameId}>{games.find((game) => game.id === gameId)?.name ?? gameId}</option>)}</select></label>
            <label>Événement<select value={historyFilters.result} onChange={(event) => { setHistoryFilters({ ...historyFilters, result: event.target.value }); setHistoryLimit(40); }}><option value="all">Toutes les parties</option><option value="won">Victoires</option><option value="played">Autres résultats</option></select></label>
            <div className="admin-filter-result"><strong>{filteredHistory.length}</strong><small>partie{filteredHistory.length > 1 ? "s" : ""}</small></div>
          </div>
          <div className="admin-history-list">{filteredHistory.slice(0, historyLimit).map((entry) => <article key={entry.id} className={entry.won ? "won" : ""}>
            <header><div><span className="eyebrow">{games.find((game) => game.id === entry.gameId)?.name ?? entry.gameId}</span><strong>{entry.name || `Table ${entry.code || "sans nom"}`}</strong><small>{formatDate(entry.finishedAt)}{entry.code ? ` · code ${entry.code}` : ""}</small></div><span className={`status-badge ${entry.won ? "status-active" : "status-inactive"}`}>{entry.won ? "Victoire" : "Participation"}</span></header>
            <div className="admin-history-metrics"><span><small>Score</small><strong>{entry.score == null ? "—" : <CompactNumber value={entry.score} label="Score exact" />}</strong></span><span><small>Pot</small><strong><CompactNumber value={entry.pot} label="Pot exact" /></strong></span><span><small>Vainqueur(s)</small><strong>{entry.winners?.length ? entry.winners.join(", ") : "Aucun"}</strong></span></div>
            <ParticipantList players={entry.players} />
          </article>)}</div>
          {!filteredHistory.length && <div className="empty-state">Aucune partie ne correspond aux filtres.</div>}
          {filteredHistory.length > historyLimit && <button type="button" className="secondary admin-load-more" onClick={() => setHistoryLimit((value) => value + 40)}>Afficher 40 parties supplémentaires</button>}
        </section>}

        {tab === "transactions" && <div className="admin-transactions-layout">
          <section className="admin-form-section admin-adjustment"><div className="admin-form-section-title"><Coins /><div><h3>Nouvel ajustement</h3><p>Prévisualise puis crédite ou débite le compte. La correction reste traçable.</p></div></div><div className="admin-field-grid"><label>Montant signé<input type="number" min="-10000000" max="10000000" value={adjustment.amount} onChange={(event) => setAdjustment({ ...adjustment, amount: Number(event.target.value) })} /></label><label>Motif<input maxLength="160" value={adjustment.note} onChange={(event) => setAdjustment({ ...adjustment, note: event.target.value })} placeholder="Ex. correction d’un gain" /></label></div><div className={`transaction-preview ${projectedBalance < 0 ? "invalid" : ""}`}><span>Solde actuel<strong><CompactNumber value={transactionBalance} label="Solde actuel exact" /></strong></span><b>{Number(adjustment.amount) >= 0 ? "+" : "−"}</b><span>Ajustement<strong><CompactNumber value={Math.abs(Number(adjustment.amount) || 0)} label="Ajustement exact" /></strong></span><b>=</b><span>Solde après opération<strong><CompactNumber value={projectedBalance} label="Nouveau solde exact" /></strong></span></div><button type="button" disabled={saving === "transaction" || !Number(adjustment.amount) || projectedBalance < 0} onClick={applyAdjustment}>{saving === "transaction" ? "Application…" : "Appliquer l’ajustement"}</button></section>
          <section className="admin-user-ledger admin-transaction-panel">
            <div className="admin-form-section-title"><WalletCards /><div><h3>Journal des transactions</h3><p>Les écritures récentes et jusqu’à 365 bonus quotidiens restent consultables.</p></div></div>
            <div className="admin-transaction-summary"><button type="button" className={transactionFilters.event === "all" ? "active" : ""} onClick={() => { setTransactionFilters({ ...transactionFilters, event: "all" }); setTransactionLimit(60); }}><span>Toutes</span><strong><CompactNumber value={detail.transactions.length} /></strong></button><button type="button" className={transactionFilters.event === "daily-claim" ? "active bonus" : "bonus"} onClick={() => { setTransactionFilters({ ...transactionFilters, event: "daily-claim" }); setTransactionLimit(60); }}><span>Bonus quotidiens</span><strong><CompactNumber value={bonusTransactionCount} /></strong></button><div><span>Crédits affichés</span><strong className="positive-amount"><CompactNumber value={filteredTransactions.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0)} prefix="+" label="Total exact des crédits" /></strong></div><div><span>Débits affichés</span><strong className="negative-amount"><CompactNumber value={Math.abs(filteredTransactions.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0))} prefix="−" label="Total exact des débits" /></strong></div></div>
            <div className="admin-ledger-filters admin-transaction-filters">
              <label className="admin-search-field">Rechercher<span><Search size={16} /><input value={transactionFilters.search} onChange={(event) => { setTransactionFilters({ ...transactionFilters, search: event.target.value }); setTransactionLimit(60); }} placeholder="Opération, motif ou table" /></span></label>
              <label>Jeu<select value={transactionFilters.game} onChange={(event) => { setTransactionFilters({ ...transactionFilters, game: event.target.value }); setTransactionLimit(60); }}><option value="all">Tous les jeux</option><option value="global">Casino / sans jeu</option>{transactionGameIds.map((gameId) => <option key={gameId} value={gameId}>{games.find((game) => game.id === gameId)?.name ?? gameId}</option>)}</select></label>
              <label>Événement<select value={transactionFilters.event} onChange={(event) => { setTransactionFilters({ ...transactionFilters, event: event.target.value }); setTransactionLimit(60); }}><option value="all">Tous les événements</option>{transactionEvents.map((reason) => <option key={reason} value={reason}>{transactionLabel(reason)}</option>)}</select></label>
              <label>Sens<select value={transactionFilters.direction} onChange={(event) => { setTransactionFilters({ ...transactionFilters, direction: event.target.value }); setTransactionLimit(60); }}><option value="all">Crédits et débits</option><option value="credit">Crédits uniquement</option><option value="debit">Débits uniquement</option></select></label>
            </div>
            <div className="admin-transaction-list">{filteredTransactions.slice(0, transactionLimit).map((entry) => <article key={entry.id} className={`${entry.amount >= 0 ? "credit" : "debit"} ${entry.reason === "daily-claim" ? "daily-bonus" : ""}`}><div className="admin-transaction-icon">{entry.reason === "daily-claim" ? <Activity size={18} /> : <Coins size={18} />}</div><div className="admin-transaction-main"><span className="eyebrow">{entry.gameId ? games.find((game) => game.id === entry.gameId)?.name ?? entry.gameId : "Casino"}{entry.reason === "daily-claim" ? " · Bonus" : ""}</span><strong>{transactionLabel(entry.reason)}</strong><small>{formatDate(entry.createdAt)}{entry.note ? ` · ${entry.note}` : ""}</small>{entry.roomId && <small>Table : {entry.roomId}</small>}</div>{entry.reason === "daily-claim" && <div className="admin-bonus-tags"><span>×{Number(entry.dailyBonusMultiplier ?? 1).toLocaleString("fr-FR")}</span>{entry.dailyBonusStreak ? <span>{entry.dailyBonusStreak} j consécutifs</span> : entry.dailyBonusClaims ? <span>Bonus n°{entry.dailyBonusClaims}</span> : null}</div>}<div className="admin-transaction-amount"><strong className={entry.amount >= 0 ? "positive-amount" : "negative-amount"}><CompactNumber value={Math.abs(entry.amount)} prefix={entry.amount >= 0 ? "+" : "−"} label="Montant exact" /></strong><small>Solde : <CompactNumber value={entry.balance} label="Solde exact" /></small></div></article>)}</div>
            {!filteredTransactions.length && <div className="empty-state">Aucune transaction ne correspond aux filtres.</div>}
            {filteredTransactions.length > transactionLimit && <button type="button" className="secondary admin-load-more" onClick={() => setTransactionLimit((value) => value + 60)}>Afficher 60 transactions supplémentaires</button>}
          </section>
        </div>}

        {tab === "achievements" && <section className="admin-user-catalog"><div className="admin-user-tools"><label>État<select value={achievementFilter} onChange={(event) => setAchievementFilter(event.target.value)}><option value="all">Tous les succès</option><option value="unlocked">Obtenus</option><option value="locked">Non obtenus</option></select></label><label className="admin-search-field">Rechercher<span><Search size={16} /><input value={achievementSearch} onChange={(event) => setAchievementSearch(event.target.value)} placeholder="Nom, jeu ou description" /></span></label><div className="admin-achievement-count"><strong>{displayedAchievements.filter((entry) => entry.unlocked).length}/{displayedAchievements.length}</strong><small>succès obtenus</small></div></div><div className="admin-achievement-grid">{filteredAchievements.map((entry) => <article key={entry.id} className={entry.unlocked ? "unlocked" : "locked"}><div><span className="eyebrow">{entry.group}{entry.secret ? " · Secret" : ""}</span><strong>{entry.title}</strong><p>{entry.description}</p><small>Progression : {entry.progress}/{entry.target}{entry.unlockedAt ? ` · obtenu ${formatDate(entry.unlockedAt)}` : ""}</small></div><button type="button" className={entry.unlocked ? "danger-button" : ""} onClick={() => setAchievementChanges((current) => ({ ...current, [entry.id]: !entry.unlocked }))}>{entry.unlocked ? "Marquer non obtenu" : "Marquer obtenu"}</button></article>)}</div></section>}

        {tab === "bonus" && <section className="admin-form-section admin-bonus-preview">
          <div className="admin-form-section-title"><Activity /><div><h3>Prévisualiseur du bonus de {draft.displayName}</h3><p>Simulation basée sur les paliers configurés dans les paramètres du casino. Un jour manqué remet la progression au multiplicateur par défaut.</p></div></div>
          <div className="bonus-preview-toolbar"><div className="segmented-tabs bonus-preview-mode"><button type="button" className={bonusMode === "current" ? "active" : ""} onClick={() => setBonusMode("current")}>Progression actuelle</button><button type="button" className={bonusMode === "fresh" ? "active" : ""} onClick={() => setBonusMode("fresh")}>Depuis zéro</button></div><small>Série en cours : <strong>{bonusStatus.streak ?? 0} j</strong> · total réclamé : <strong>{bonusStatus.claims ?? 0} bonus</strong> · multiplicateur <strong>×{Number(bonusStatus.multiplier ?? 1).toLocaleString("fr-FR")}</strong>{bonusStatus.claimedToday ? " · déjà récupéré aujourd’hui" : ""}</small></div>
          <div className="bonus-preview-metrics"><span><small>Base configurée</small><strong><CompactNumber value={settings.dailyTokens} label="Base exacte" /></strong></span><span><small>Prochain bonus</small><strong><CompactNumber value={bonusRows[0]?.amount} label="Prochain bonus exact" /></strong><b>×{bonusRows[0]?.multiplier.toLocaleString("fr-FR")}</b></span><span><small>Après 30 récupérations consécutives</small><strong><CompactNumber value={bonusRows.at(-1)?.amount} label="Bonus exact après 30 récupérations consécutives" /></strong><b>×{bonusRows.at(-1)?.multiplier.toLocaleString("fr-FR")}</b></span></div>
          <div className="bonus-preview-columns"><div className="bonus-preview-table"><div className="bonus-preview-table-head"><span>Dans</span><span>Jour de série</span><span>Évolution</span><span>Multiplicateur</span><span>Versement</span></div>{bonusRows.map((entry) => <div className={entry.appliedRules.length > 1 ? "monthly-step" : entry.appliedRules.length ? "weekly-step" : ""} key={entry.day}><span>+{entry.day} bonus</span><span>{entry.streak}</span><span>{entry.appliedRules.length ? entry.appliedRules.map(bonusRuleEffect).join(" · ") : "Aucun palier"}</span><strong>×{entry.multiplier.toLocaleString("fr-FR")}</strong><b><CompactNumber value={entry.amount} label="Versement exact" /></b></div>)}</div><aside className="bonus-claim-audit"><div><strong>Versements réels</strong><small>Les 30 derniers bonus de ce joueur</small></div>{detail.bonus.recentClaims.map((claim) => <article key={claim.id}><time>{formatDate(claim.createdAt)}</time><strong><CompactNumber value={claim.amount} suffix=" jetons" label="Versement exact" /></strong><small>{claim.dailyBonusMultiplier ? `×${Number(claim.dailyBonusMultiplier).toLocaleString("fr-FR")}` : "Multiplicateur historique non enregistré"}{claim.dailyBonusStreak ? ` · série ${claim.dailyBonusStreak} j` : ""}{claim.dailyBonusClaims ? ` · bonus n°${claim.dailyBonusClaims}` : ""}</small></article>)}{!detail.bonus.recentClaims.length && <div className="empty-state">Aucun bonus récupéré.</div>}</aside></div>
        </section>}
      </div>}
      <footer className="admin-user-editor-footer"><small>Les changements du profil, du compte, de l’inventaire et des succès sont enregistrés ensemble sans fermer la fiche.</small><div className="actions"><button type="button" disabled={Boolean(saving) || loading} onClick={saveAll}><Save size={17} />{saving === "all" ? "Enregistrement…" : "Enregistrer la fiche"}</button><button type="button" className="secondary" onClick={onClose}>Fermer</button></div></footer>
    </section>
  </div>;
}
