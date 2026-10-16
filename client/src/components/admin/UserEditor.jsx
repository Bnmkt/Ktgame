import { useLocale } from "../../locales/LocaleProvider.jsx";
import { ModalBackdrop } from "../common/ModalBackdrop.jsx";
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BadgeCheck, Check, Coins, History, KeyRound, LogOut, Mail, Package, Save, Scale, Search, Shield, ShieldCheck, Trash2, User, UserCheck, Users, WalletCards, X } from "lucide-react";
import { api } from "../../api.js";
import { ConfirmActionButton, ConfirmDialog } from "../common/ConfirmAction.jsx";
import { shopTypeLabel } from "../cosmetics/Cosmetics.jsx";
import { CompactNumber, transactionLabel } from "../../utils/presentation.jsx";
import { bonusProgression, bonusRuleEffect } from "../../features/bonus/config.js";
import { AdminAccountWorkspace } from "./AdminAccountWorkspace.jsx";
import { accountDraftError } from "../../features/accounts/admin-profile.js";

const equippedKeys = { icons: "icon", nameEffects: "nameEffect", memberCards: "memberCard", profileBanners: "profileBanner", profileFrames: "profileFrame", profileEffects: "profileEffect", diceSkins: "diceSkin", cardSkins: "cardSkin" };
const inventoryTypes = Object.keys(equippedKeys);

function PlayerChip({ player }) {
  const { t: localeText } = useLocale();
  return <span className={`admin-player-chip ${player.won ? "winner" : ""} ${player.isBot ? "bot" : ""}`} title={`${player.pseudo}${player.isBot ? " · IA" : ""}${player.won ? " · vainqueur" : ""}`}><i>{player.isBot ? localeText("IA") : player.pseudo?.slice(0, 1)?.toUpperCase()}</i><b>{player.pseudo}</b>{player.won && <em>{localeText("Gagnant")}</em>}</span>;
}

function ParticipantList({ players = [] }) {
  const { t: localeText } = useLocale();
  const visible = players.slice(0, 4);
  const remaining = players.slice(4);
  return <div className="admin-participants"><span className="admin-participants-label">{players.length}{" " + localeText("participant")}{players.length > 1 ? localeText("s") : ""}</span><div className="admin-participant-preview">{visible.map((player) => <PlayerChip key={player.id} player={player} />)}{remaining.length > 0 && <details><summary>+{remaining.length}</summary><div>{remaining.map((player) => <PlayerChip key={player.id} player={player} />)}</div></details>}</div></div>;
}

function formatDate(value) {
  if (!value) return "Non disponible";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function UserEditor({ row, currentUser, games, settings, onClose, onSaved, notifySuccess, reportError: reportParentError }) {
  const { t: localeText } = useLocale();
  const [detail, setDetail] = useState(null);
  const [draft, setDraft] = useState(null);
  const [tab, setTab] = useState("overview");
  const [accountSection, setAccountSection] = useState("identity");
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
  const [snapshot, setSnapshot] = useState("");
  const [closing, setClosing] = useState(false);
  const dirty = Boolean(draft && detail && snapshot !== JSON.stringify({ draft, cosmetics: detail.inventory.cosmetics, achievementChanges }));
  function closeEditor() {
    if (saving) return;
    if (dirty) setClosing(true);
    else onClose();
  }

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
      setSnapshot(JSON.stringify({ draft: { ...next.user, password: "" }, cosmetics: next.inventory.cosmetics, achievementChanges: {} }));
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
    const error = accountDraftError(draft, detail.user);
    if (error) return reportError(error);
    const invalid = document.querySelector('.admin-user-editor-body input:invalid, .admin-user-editor-body textarea:invalid, .admin-user-editor-body select:invalid');
    if (invalid) { invalid.reportValidity(); return; }
    setSaving("all");
    reportError("");
    try {
      const original = JSON.parse(snapshot);
      const changes = Object.fromEntries(Object.entries(draft).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(original.draft[key])));
      for (const field of ["gameXp", "gameElo"]) if (changes[field]) {
        changes[field] = Object.fromEntries(Object.entries(changes[field]).filter(([gameId, value]) => value !== original.draft[field]?.[gameId]));
        changes.progressionExpected ??= {};
        changes.progressionExpected[field] = Object.fromEntries(Object.keys(changes[field]).map((gameId) => [gameId, original.draft[field][gameId]]));
      }
      if (Object.keys(changes).length) await api(`/api/admin/users/${row.id}`, { method: "PATCH", body: JSON.stringify(changes) });
      if (JSON.stringify(original.cosmetics) !== JSON.stringify(detail.inventory.cosmetics)) await api(`/api/admin/users/${row.id}/inventory`, { method: "PUT", body: JSON.stringify({ cosmetics: detail.inventory.cosmetics }) });
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
    if (dirty) {
      const error = "Enregistre ou annule les modifications avant une action immédiate.";
      reportError(error);
      if (propagate) throw new Error(error);
      return;
    }
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
    if (dirty) return reportError("Enregistre ou annule les modifications avant un ajustement immédiat.");
    const amount = Math.trunc(Number(adjustment.amount));
    if (!amount) return reportError("Saisis un ajustement différent de zéro.");
    setSaving("transaction");
    reportError("");
    try {
      const result = await api(`/api/admin/users/${row.id}/transactions`, { method: "POST", body: JSON.stringify({ amount, note: adjustment.note }) });
      setAdjustment({ amount: 0, note: "" });
      setDraft((current) => ({ ...current, tokens: result.balance }));
      setDetail((current) => ({ ...current, user: { ...current.user, tokens: result.balance }, transactions: [result.transaction, ...current.transactions] }));
      setSnapshot((current) => { const previous = JSON.parse(current); previous.draft.tokens = result.balance; return JSON.stringify(previous); });
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
    ["overview", "Vue d’ensemble", Activity], ["account", "Profil et accès", User], ["inventory", "Inventaire", Package],
    ["history", "Historique", History], ["transactions", "Transactions", WalletCards], ["achievements", "Succès", BadgeCheck], ["bonus", "Bonus", Activity]
  ];

  return <ModalBackdrop className="modal-backdrop" onClick={closeEditor}>
    <section className="modal admin-user-editor" onClick={(event) => event.stopPropagation()}>
      <div className="modal-title-row admin-user-editor-title">
        <div><span className="eyebrow">{localeText("Fiche joueur complète")}</span><h2>{draft?.displayName ?? row.displayName}</h2><small>{draft?.login ?? row.login} · {row.id}</small></div>
        <button type="button" className="secondary icon-toggle" disabled={Boolean(saving)} onClick={closeEditor} aria-label={localeText("Fermer")}><X size={18} /></button>
      </div>
      <footer className="admin-user-editor-footer"><small role="status">{dirty ? localeText("Modifications non enregistrées") : localeText("Fiche à jour")}</small><div className="actions">{dirty && <ConfirmActionButton className="secondary" disabled={Boolean(saving)} dialogTitle={localeText("Annuler les modifications ?")} message={localeText("Les modifications non enregistrées de cette fiche seront abandonnées.")} confirmLabel={localeText("Annuler les modifications")} onConfirm={loadDetail}>{localeText("Annuler les modifications")}</ConfirmActionButton>}<button type="button" disabled={Boolean(saving) || loading || !dirty} onClick={saveAll}><Save size={17} />{saving === "all" ? localeText("Enregistrement…") : localeText("Enregistrer la fiche")}</button><button type="button" className="secondary" disabled={Boolean(saving)} onClick={closeEditor}>{localeText("Fermer")}</button></div></footer>
      <nav className="admin-user-tabs" aria-label={localeText("Sections de la fiche joueur")}>
        {tabs.map(([value, label, Icon]) => <button type="button" key={value} disabled={Boolean(saving) || loading} className={tab === value ? "active" : ""} onClick={() => setTab(value)}><Icon size={16} />{localeText(label)}</button>)}
      </nav>
      {localError && <div className="error admin-user-editor-error"><AlertTriangle size={17} /><span>{localError}</span><button type="button" className="secondary icon-toggle" onClick={() => reportError("")} aria-label={localeText("Fermer")}><X size={15} /></button></div>}
      {loading || !draft || !detail ? <div className="admin-user-loading"><Activity className="spinning" /><strong>{localeText("Chargement de la fiche…")}</strong></div> : <div className="admin-user-editor-body">
        {tab === "overview" && <div className="admin-user-overview">
          {detail.dataRequests?.some((request) => request.status !== "sent") && <div className="account-admin-pending"><div><strong>{localeText("Demande de données personnelles à traiter")}</strong><p>{localeText("L’échéance et l’approbation sont disponibles dans la fiche.")}</p></div><button type="button" onClick={() => { setAccountSection("data"); setTab("account"); }}>{localeText("Consulter la demande")}</button></div>}
          <section className="admin-user-overview-hero">
            <div className="admin-user-overview-identity"><span className="eyebrow">{localeText("État du compte")}</span><h3>{draft.displayName}</h3><p>{draft.login}</p><div className="admin-account-badges"><span className={`status-badge ${draft.active ? "status-active" : "status-inactive"}`}>{draft.active ? localeText("Compte actif") : localeText("Compte désactivé")}</span><span className={`status-badge ${draft.emailVerified ? "status-active" : "status-waiting"}`}>{draft.legacyLogin ? localeText("Ancien identifiant") : draft.emailVerified ? localeText("Email validé") : localeText("Validation en attente")}</span>{draft.admin && <span className="status-badge status-custom">{localeText("Administrateur")}</span>}{draft.editor && <span className="status-badge status-custom">{localeText("Éditeur")}</span>}</div></div>
            <div className="admin-user-overview-actions">
              {!draft.legacyLogin && !draft.emailVerified && <button type="button" disabled={saving === "account-action"} onClick={() => runAccountAction(`/api/admin/users/${draft.id}/email-validation`, "Adresse email validée.", { body: { verified: true } })}><ShieldCheck size={17} />{" " + localeText("Valider l’email")}</button>}
              {!draft.legacyLogin && !draft.emailVerified && <button type="button" className="secondary" disabled={saving === "account-action" || !settings.emailVerificationAvailable} title={!settings.emailVerificationAvailable ? localeText("Service email indisponible") : ""} onClick={() => runAccountAction(`/api/admin/users/${draft.id}/send-verification`, "Email de validation envoyé.")}><Mail size={17} />{" " + localeText("Envoyer une validation")}</button>}
              {draft.id !== currentUser.id && <ConfirmActionButton className="secondary" disabled={saving === "account-action"} dialogTitle={localeText("Fermer toutes les sessions ?")} message={localeText("Toutes les sessions ouvertes de {value0} seront invalidées. Le joueur devra se reconnecter.", { value0: draft.displayName })} confirmLabel={localeText("Révoquer les sessions")} danger onConfirm={() => runAccountAction(`/api/admin/users/${draft.id}/revoke-sessions`, "Sessions du joueur révoquées.", { propagate: true })}><LogOut size={17} />{" " + localeText("Révoquer les sessions")}</ConfirmActionButton>}
            </div>
          </section>
          <section className="admin-user-kpi-grid" aria-label={localeText("Statistiques du joueur")}>
            <article><Activity /><span>{localeText("Parties")}</span><strong><CompactNumber value={detail.statistics.gamesPlayed} /></strong><small>{detail.statistics.wins}{" " + localeText("victoire(s) ·") + " "}{detail.statistics.winRate}%</small></article>
            <article><WalletCards /><span>{localeText("Transactions")}</span><strong><CompactNumber value={detail.statistics.transactions} /></strong><small><CompactNumber value={detail.statistics.credits} prefix="+" /> / <CompactNumber value={detail.statistics.debits} prefix="−" /></small></article>
            <article><Coins /><span>{localeText("Solde")}</span><strong><CompactNumber value={draft.tokens} label={localeText("Solde exact")} /></strong><small><CompactNumber value={detail.statistics.staked} suffix={localeText(" misés")} /></small></article>
            <article><BadgeCheck /><span>{localeText("Succès")}</span><strong>{displayedAchievements.filter((entry) => entry.unlocked).length}/{displayedAchievements.length}</strong><small>{detail.statistics.shopPurchases}{" " + localeText("achat(s) boutique")}</small></article>
            <article><Scale /><span>{localeText("Comportement")}</span><strong>{detail.tribunal.behavior.score}/100</strong><small>{detail.tribunal.reports.total}{" " + localeText("signalement(s) ·") + " "}{detail.tribunal.behavior.sanctions}{" " + localeText("sanction(s)")}</small></article>
          </section>
          <div className="admin-user-overview-columns">
            <section className="admin-form-section"><div className="admin-form-section-title"><UserCheck /><div><h3>{localeText("Activité et sécurité")}</h3><p>{localeText("Repères utiles pour diagnostiquer l’accès au compte.")}</p></div></div><div className="admin-account-facts"><span>{localeText("Création")}<strong>{formatDate(draft.createdAt)}</strong></span><span>{localeText("Dernière connexion")}<strong>{formatDate(draft.lastLoginAt)}</strong></span><span>{localeText("Dernier bonus")}<strong>{draft.lastDailyClaim || localeText("Jamais")}</strong></span><span>{localeText("Réinitialisation demandée")}<strong>{detail.security.passwordResetPending ? formatDate(detail.security.passwordResetSentAt) : localeText("Non")}</strong></span><span>{localeText("Validation envoyée")}<strong>{detail.security.emailVerificationPending ? formatDate(detail.security.emailVerificationSentAt) : localeText("Non")}</strong></span><span>{localeText("Version des sessions")}<strong>{detail.security.sessionVersion}</strong></span></div></section>
            <section className="admin-form-section"><div className="admin-form-section-title"><Users /><div><h3>{localeText("Relations")}</h3><p>{localeText("Amis et demandes associées à ce compte.")}</p></div></div><div className="admin-relation-summary"><span><strong>{detail.relationships.friends.length}</strong>{" " + localeText("ami(s)")}</span><span><strong>{detail.relationships.incoming.length}</strong>{" " + localeText("reçue(s)")}</span><span><strong>{detail.relationships.outgoing.length}</strong>{" " + localeText("envoyée(s)")}</span></div><div className="admin-relation-list">{detail.relationships.friends.slice(0, 12).map((friend) => <span key={friend.id} className={friend.active ? "" : "inactive"}><i>{friend.displayName.slice(0, 1).toUpperCase()}</i>{friend.displayName}</span>)}{!detail.relationships.friends.length && <small>{localeText("Aucun ami.")}</small>}</div></section>
            <section className="admin-form-section admin-user-active-rooms"><div className="admin-form-section-title"><Activity /><div><h3>{localeText("Tables actives")}</h3><p>{localeText("Une suppression reste bloquée tant que le joueur occupe une table.")}</p></div></div>{detail.activeRooms.map((room) => <article key={room.id}><div><strong>{room.name}</strong><small>{games.find((game) => game.id === room.gameId)?.name ?? room.gameId}{" " + localeText("· code") + " "}{room.code}</small></div><span className={`status-badge ${room.playing ? "status-live" : "status-waiting"}`}>{room.playing ? localeText("En jeu") : localeText("En attente")}</span>{room.owner && <b>{localeText("Maître")}</b>}</article>)}{!detail.activeRooms.length && <div className="empty-state">{localeText("Aucune table active.")}</div>}</section>
          </div>
        </div>}
        {tab === "account" && <AdminAccountWorkspace initialSection={accountSection} onSectionChange={setAccountSection} onDataRequests={(requests) => setDetail((current) => ({ ...current, dataRequests: requests }))} draft={draft} detail={detail} currentUser={currentUser} games={games} settings={settings} achievements={displayedAchievements} updateDraft={updateDraft} updateProfileStats={updateProfileStats} busy={Boolean(saving)} dirty={dirty} runAccountAction={runAccountAction} sensitiveActions={<fieldset className="account-admin-sensitive" disabled={Boolean(saving) || dirty}><div className="admin-danger-zone admin-user-danger"><strong><AlertTriangle size={16} />{" " + localeText("Zone sensible")}</strong><p>{localeText("Les réinitialisations conservent les journaux. La suppression retire définitivement le compte et ses données de profil, mais conserve les écritures financières et les parties déjà archivées.")}</p><div className="actions"><ConfirmActionButton className="danger-button" dialogTitle={localeText("Réinitialiser les succès ?")} message={localeText("Tous les succès de {value0} seront supprimés. Les parties et transactions resteront intactes.", { value0: draft.displayName })} confirmLabel={localeText("Réinitialiser les succès")} danger onConfirm={() => runAccountAction(`/api/admin/users/${draft.id}/reset-achievements`, "Succès du joueur réinitialisés.", { propagate: true })}><BadgeCheck size={16} />{" " + localeText("Réinitialiser les succès")}</ConfirmActionButton><ConfirmActionButton className="danger-button" dialogTitle={localeText("Réinitialiser le compte ?")} message={localeText("Le profil, les cosmétiques, les succès et le solde de {value0} seront remis à zéro. Les sessions seront fermées.", { value0: draft.displayName })} confirmLabel={localeText("Réinitialiser le compte")} danger onConfirm={() => runAccountAction(`/api/admin/users/${draft.id}/reset-account`, "Compte joueur réinitialisé.", { propagate: true })}><KeyRound size={16} />{" " + localeText("Réinitialiser le compte")}</ConfirmActionButton>{draft.id !== currentUser.id && <ConfirmActionButton className="danger-button admin-delete-user" dialogTitle={localeText("Supprimer définitivement ce compte ?")} message={localeText("Le compte de {value0} sera supprimé. Cette opération est irréversible. Les écritures financières et les parties archivées seront conservées pour l’audit.", { value0: draft.displayName })} confirmLabel={localeText("Supprimer le compte")} danger onConfirm={() => runAccountAction(`/api/admin/users/${draft.id}`, "Compte joueur supprimé.", { method: "DELETE", close: true, propagate: true })}><Trash2 size={16} />{" " + localeText("Supprimer le compte")}</ConfirmActionButton>}</div></div></fieldset>} />}


        {tab === "inventory" && <section className="admin-user-catalog"><div className="admin-user-tools"><label>{localeText("Catégorie")}<select value={inventoryType} onChange={(event) => setInventoryType(event.target.value)}>{inventoryTypes.map((type) => <option key={type} value={type}>{localeText(shopTypeLabel(type))}</option>)}</select></label><label className="admin-search-field">{localeText("Rechercher")}<span><Search size={16} /><input value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} placeholder={localeText("Nom ou identifiant")} /></span></label></div><div className="admin-inventory-grid">{filteredInventory.map((item) => { const owned = detail.inventory.cosmetics[item.type]?.includes(item.value); const equipped = detail.inventory.cosmetics.equipped[equippedKeys[item.type]] === item.value; return <article key={item.id} className={`${owned ? "owned" : ""} ${equipped ? "equipped" : ""}`}><div><strong>{item.name}</strong><small>{item.category} · {item.value}</small></div>{item.rewardOnly && <span className="status-badge status-custom">{localeText("Récompense")}</span>}<label className="admin-owned-toggle"><input type="checkbox" checked={owned} onChange={() => toggleOwned(item)} /><span>{owned ? localeText("Possédé") : localeText("Non possédé")}</span></label><button type="button" className={equipped ? "" : "secondary"} disabled={!owned || equipped} onClick={() => equipItem(item)}>{equipped ? <><Check size={15} />{" " + localeText("Équipé")}</> : localeText("Équiper")}</button></article>; })}</div>{!filteredInventory.length && <div className="empty-state">{localeText("Aucun objet dans cette catégorie.")}</div>}</section>}

        {tab === "history" && <section className="admin-user-ledger admin-history-panel">
          <div className="admin-form-section-title"><History /><div><h3>{localeText("Historique des parties")}</h3><p>{localeText("Jusqu’aux 250 dernières parties, avec leurs participants et leur résultat.")}</p></div></div>
          <div className="admin-ledger-filters">
            <label className="admin-search-field">{localeText("Rechercher")}<span><Search size={16} /><input value={historyFilters.search} onChange={(event) => { setHistoryFilters({ ...historyFilters, search: event.target.value }); setHistoryLimit(40); }} placeholder={localeText("Table, code ou joueur")} /></span></label>
            <label>{localeText("Jeu")}<select value={historyFilters.game} onChange={(event) => { setHistoryFilters({ ...historyFilters, game: event.target.value }); setHistoryLimit(40); }}><option value="all">{localeText("Tous les jeux")}</option>{historyGameIds.map((gameId) => <option key={gameId} value={gameId}>{games.find((game) => game.id === gameId)?.name ?? gameId}</option>)}</select></label>
            <label>{localeText("Événement")}<select value={historyFilters.result} onChange={(event) => { setHistoryFilters({ ...historyFilters, result: event.target.value }); setHistoryLimit(40); }}><option value="all">{localeText("Toutes les parties")}</option><option value="won">{localeText("Victoires")}</option><option value="played">{localeText("Autres résultats")}</option></select></label>
            <div className="admin-filter-result"><strong>{filteredHistory.length}</strong><small>{localeText("partie")}{filteredHistory.length > 1 ? localeText("s") : ""}</small></div>
          </div>
          <div className="admin-history-list">{filteredHistory.slice(0, historyLimit).map((entry) => <article key={entry.id} className={entry.won ? "won" : ""}>
            <header><div><span className="eyebrow">{games.find((game) => game.id === entry.gameId)?.name ?? entry.gameId}</span><strong>{entry.name || localeText("Table {value0}", { value0: entry.code || "sans nom" })}</strong><small>{formatDate(entry.finishedAt)}{entry.code ? localeText(" · code {value0}", { value0: entry.code }) : ""}</small></div><span className={`status-badge ${entry.won ? "status-active" : "status-inactive"}`}>{entry.won ? localeText("Victoire") : localeText("Participation")}</span></header>
            <div className="admin-history-metrics"><span><small>{localeText("Score")}</small><strong>{entry.score == null ? "—" : <CompactNumber value={entry.score} label={localeText("Score exact")} />}</strong></span><span><small>{localeText("Pot")}</small><strong><CompactNumber value={entry.pot} label={localeText("Pot exact")} /></strong></span><span><small>{localeText("Vainqueur(s)")}</small><strong>{entry.winners?.length ? entry.winners.join(", ") : localeText("Aucun")}</strong></span></div>
            <ParticipantList players={entry.players} />
          </article>)}</div>
          {!filteredHistory.length && <div className="empty-state">{localeText("Aucune partie ne correspond aux filtres.")}</div>}
          {filteredHistory.length > historyLimit && <button type="button" className="secondary admin-load-more" onClick={() => setHistoryLimit((value) => value + 40)}>{localeText("Afficher 40 parties supplémentaires")}</button>}
        </section>}

        {tab === "transactions" && <div className="admin-transactions-layout">
          <section className="admin-form-section admin-adjustment"><div className="admin-form-section-title"><Coins /><div><h3>{localeText("Nouvel ajustement")}</h3><p>{localeText("Prévisualise puis crédite ou débite le compte. La correction reste traçable.")}</p></div></div><div className="admin-field-grid"><label>{localeText("Montant signé")}<input type="number" min="-10000000" max="10000000" value={adjustment.amount} onChange={(event) => setAdjustment({ ...adjustment, amount: Number(event.target.value) })} /></label><label>{localeText("Motif")}<input maxLength="160" value={adjustment.note} onChange={(event) => setAdjustment({ ...adjustment, note: event.target.value })} placeholder={localeText("Ex. correction d’un gain")} /></label></div><div className={`transaction-preview ${projectedBalance < 0 ? "invalid" : ""}`}><span>{localeText("Solde actuel")}<strong><CompactNumber value={transactionBalance} label={localeText("Solde actuel exact")} /></strong></span><b>{Number(adjustment.amount) >= 0 ? "+" : "−"}</b><span>{localeText("Ajustement")}<strong><CompactNumber value={Math.abs(Number(adjustment.amount) || 0)} label={localeText("Ajustement exact")} /></strong></span><b>=</b><span>{localeText("Solde après opération")}<strong><CompactNumber value={projectedBalance} label={localeText("Nouveau solde exact")} /></strong></span></div><button type="button" disabled={Boolean(saving) || dirty || !Number(adjustment.amount) || projectedBalance < 0} onClick={applyAdjustment}>{saving === "transaction" ? localeText("Application…") : localeText("Appliquer l’ajustement")}</button></section>
          <section className="admin-user-ledger admin-transaction-panel">
            <div className="admin-form-section-title"><WalletCards /><div><h3>{localeText("Journal des transactions")}</h3><p>{localeText("Les écritures récentes et jusqu’à 365 bonus quotidiens restent consultables.")}</p></div></div>
            <div className="admin-transaction-summary"><button type="button" className={transactionFilters.event === "all" ? "active" : ""} onClick={() => { setTransactionFilters({ ...transactionFilters, event: "all" }); setTransactionLimit(60); }}><span>{localeText("Toutes")}</span><strong><CompactNumber value={detail.transactions.length} /></strong></button><button type="button" className={transactionFilters.event === "daily-claim" ? "active bonus" : "bonus"} onClick={() => { setTransactionFilters({ ...transactionFilters, event: "daily-claim" }); setTransactionLimit(60); }}><span>{localeText("Bonus quotidiens")}</span><strong><CompactNumber value={bonusTransactionCount} /></strong></button><div><span>{localeText("Crédits affichés")}</span><strong className="positive-amount"><CompactNumber value={filteredTransactions.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0)} prefix="+" label={localeText("Total exact des crédits")} /></strong></div><div><span>{localeText("Débits affichés")}</span><strong className="negative-amount"><CompactNumber value={Math.abs(filteredTransactions.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0))} prefix="−" label={localeText("Total exact des débits")} /></strong></div></div>
            <div className="admin-ledger-filters admin-transaction-filters">
              <label className="admin-search-field">{localeText("Rechercher")}<span><Search size={16} /><input value={transactionFilters.search} onChange={(event) => { setTransactionFilters({ ...transactionFilters, search: event.target.value }); setTransactionLimit(60); }} placeholder={localeText("Opération, motif ou table")} /></span></label>
              <label>{localeText("Jeu")}<select value={transactionFilters.game} onChange={(event) => { setTransactionFilters({ ...transactionFilters, game: event.target.value }); setTransactionLimit(60); }}><option value="all">{localeText("Tous les jeux")}</option><option value="global">{localeText("Casino / sans jeu")}</option>{transactionGameIds.map((gameId) => <option key={gameId} value={gameId}>{games.find((game) => game.id === gameId)?.name ?? gameId}</option>)}</select></label>
              <label>{localeText("Événement")}<select value={transactionFilters.event} onChange={(event) => { setTransactionFilters({ ...transactionFilters, event: event.target.value }); setTransactionLimit(60); }}><option value="all">{localeText("Tous les événements")}</option>{transactionEvents.map((reason) => <option key={reason} value={reason}>{localeText(transactionLabel(reason))}</option>)}</select></label>
              <label>{localeText("Sens")}<select value={transactionFilters.direction} onChange={(event) => { setTransactionFilters({ ...transactionFilters, direction: event.target.value }); setTransactionLimit(60); }}><option value="all">{localeText("Crédits et débits")}</option><option value="credit">{localeText("Crédits uniquement")}</option><option value="debit">{localeText("Débits uniquement")}</option></select></label>
            </div>
            <div className="admin-transaction-list">{filteredTransactions.slice(0, transactionLimit).map((entry) => <article key={entry.id} className={`${entry.amount >= 0 ? "credit" : "debit"} ${entry.reason === "daily-claim" ? "daily-bonus" : ""}`}><div className="admin-transaction-icon">{entry.reason === "daily-claim" ? <Activity size={18} /> : <Coins size={18} />}</div><div className="admin-transaction-main"><span className="eyebrow">{entry.gameId ? games.find((game) => game.id === entry.gameId)?.name ?? entry.gameId : localeText("Casino")}{entry.reason === "daily-claim" ? localeText(" · Bonus") : ""}</span><strong>{localeText(transactionLabel(entry.reason))}</strong><small>{formatDate(entry.createdAt)}{entry.note ? ` · ${entry.note}` : ""}</small>{entry.roomId && <small>{localeText("Table :") + " "}{entry.roomId}</small>}</div>{entry.reason === "daily-claim" && <div className="admin-bonus-tags"><span>×{Number(entry.dailyBonusMultiplier ?? 1).toLocaleString("fr-FR")}</span>{entry.dailyBonusStreak ? <span>{entry.dailyBonusStreak}{" " + localeText("j consécutifs")}</span> : entry.dailyBonusClaims ? <span>{localeText("Bonus n°")}{entry.dailyBonusClaims}</span> : null}</div>}<div className="admin-transaction-amount"><strong className={entry.amount >= 0 ? "positive-amount" : "negative-amount"}><CompactNumber value={Math.abs(entry.amount)} prefix={entry.amount >= 0 ? "+" : "−"} label={localeText("Montant exact")} /></strong><small>{localeText("Solde :") + " "}<CompactNumber value={entry.balance} label={localeText("Solde exact")} /></small></div></article>)}</div>
            {!filteredTransactions.length && <div className="empty-state">{localeText("Aucune transaction ne correspond aux filtres.")}</div>}
            {filteredTransactions.length > transactionLimit && <button type="button" className="secondary admin-load-more" onClick={() => setTransactionLimit((value) => value + 60)}>{localeText("Afficher 60 transactions supplémentaires")}</button>}
          </section>
        </div>}

        {tab === "achievements" && <section className="admin-user-catalog"><div className="admin-user-tools"><label>{localeText("État")}<select value={achievementFilter} onChange={(event) => setAchievementFilter(event.target.value)}><option value="all">{localeText("Tous les succès")}</option><option value="unlocked">{localeText("Obtenus")}</option><option value="locked">{localeText("Non obtenus")}</option></select></label><label className="admin-search-field">{localeText("Rechercher")}<span><Search size={16} /><input value={achievementSearch} onChange={(event) => setAchievementSearch(event.target.value)} placeholder={localeText("Nom, jeu ou description")} /></span></label><div className="admin-achievement-count"><strong>{displayedAchievements.filter((entry) => entry.unlocked).length}/{displayedAchievements.length}</strong><small>{localeText("succès obtenus")}</small></div></div><div className="admin-achievement-grid">{filteredAchievements.map((entry) => <article key={entry.id} className={entry.unlocked ? "unlocked" : "locked"}><div><span className="eyebrow">{entry.group}{entry.secret ? localeText(" · Secret") : ""}</span><strong>{entry.title}</strong><p>{entry.description}</p><small>{localeText("Progression :") + " "}{entry.progress}/{entry.target}{entry.unlockedAt ? localeText(" · obtenu {value0}", { value0: formatDate(entry.unlockedAt) }) : ""}</small></div><button type="button" className={entry.unlocked ? "danger-button" : ""} onClick={() => setAchievementChanges((current) => ({ ...current, [entry.id]: !entry.unlocked }))}>{entry.unlocked ? localeText("Marquer non obtenu") : localeText("Marquer obtenu")}</button></article>)}</div></section>}

        {tab === "bonus" && <section className="admin-form-section admin-bonus-preview">
          <div className="admin-form-section-title"><Activity /><div><h3>{localeText("Prévisualiseur du bonus de") + " "}{draft.displayName}</h3><p>{localeText("Simulation basée sur les paliers configurés dans les paramètres du casino. Un jour manqué remet la progression au multiplicateur par défaut.")}</p></div></div>
          <div className="bonus-preview-toolbar"><div className="segmented-tabs bonus-preview-mode"><button type="button" className={bonusMode === "current" ? "active" : ""} onClick={() => setBonusMode("current")}>{localeText("Progression actuelle")}</button><button type="button" className={bonusMode === "fresh" ? "active" : ""} onClick={() => setBonusMode("fresh")}>{localeText("Depuis zéro")}</button></div><small>{localeText("Série en cours :") + " "}<strong>{bonusStatus.streak ?? 0}{" " + localeText("j")}</strong>{" " + localeText("· total réclamé :") + " "}<strong>{bonusStatus.claims ?? 0}{" " + localeText("bonus")}</strong>{" " + localeText("· multiplicateur") + " "}<strong>×{Number(bonusStatus.multiplier ?? 1).toLocaleString("fr-FR")}</strong>{bonusStatus.claimedToday ? localeText(" · déjà récupéré aujourd’hui") : ""}</small></div>
          <div className="bonus-preview-metrics"><span><small>{localeText("Base configurée")}</small><strong><CompactNumber value={settings.dailyTokens} label={localeText("Base exacte")} /></strong></span><span><small>{localeText("Prochain bonus")}</small><strong><CompactNumber value={bonusRows[0]?.amount} label={localeText("Prochain bonus exact")} /></strong><b>×{bonusRows[0]?.multiplier.toLocaleString("fr-FR")}</b></span><span><small>{localeText("Après 30 récupérations consécutives")}</small><strong><CompactNumber value={bonusRows.at(-1)?.amount} label={localeText("Bonus exact après 30 récupérations consécutives")} /></strong><b>×{bonusRows.at(-1)?.multiplier.toLocaleString("fr-FR")}</b></span></div>
          <div className="bonus-preview-columns"><div className="bonus-preview-table"><div className="bonus-preview-table-head"><span>{localeText("Dans")}</span><span>{localeText("Jour de série")}</span><span>{localeText("Évolution")}</span><span>{localeText("Multiplicateur")}</span><span>{localeText("Versement")}</span></div>{bonusRows.map((entry) => <div className={entry.appliedRules.length > 1 ? "monthly-step" : entry.appliedRules.length ? "weekly-step" : ""} key={entry.day}><span>+{entry.day}{" " + localeText("bonus")}</span><span>{entry.streak}</span><span>{entry.appliedRules.length ? entry.appliedRules.map(bonusRuleEffect).join(" · ") : localeText("Aucun palier")}</span><strong>×{entry.multiplier.toLocaleString("fr-FR")}</strong><b><CompactNumber value={entry.amount} label={localeText("Versement exact")} /></b></div>)}</div><aside className="bonus-claim-audit"><div><strong>{localeText("Versements réels")}</strong><small>{localeText("Les 30 derniers bonus de ce joueur")}</small></div>{detail.bonus.recentClaims.map((claim) => <article key={claim.id}><time>{formatDate(claim.createdAt)}</time><strong><CompactNumber value={claim.amount} suffix={localeText(" jetons")} label={localeText("Versement exact")} /></strong><small>{claim.dailyBonusMultiplier ? `×${Number(claim.dailyBonusMultiplier).toLocaleString("fr-FR")}` : localeText("Multiplicateur historique non enregistré")}{claim.dailyBonusStreak ? localeText(" · série {value0} j", { value0: claim.dailyBonusStreak }) : ""}{claim.dailyBonusClaims ? localeText(" · bonus n°{value0}", { value0: claim.dailyBonusClaims }) : ""}</small></article>)}{!detail.bonus.recentClaims.length && <div className="empty-state">{localeText("Aucun bonus récupéré.")}</div>}</aside></div>
        </section>}
      </div>}
    </section>
    {closing && <ConfirmDialog title={localeText("Fermer sans enregistrer ?")} message={localeText("Les modifications de cette fiche seront abandonnées.")} confirmLabel={localeText("Fermer sans enregistrer")} onClose={() => setClosing(false)} onConfirm={onClose} />}
  </ModalBackdrop>;
}
