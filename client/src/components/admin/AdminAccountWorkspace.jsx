import { useRef, useState } from "react";
import { Activity, BadgeCheck, CalendarDays, Eye, FileArchive, KeyRound, LogOut, Mail, Scale, Shield, ShieldCheck, Star, UserRound } from "lucide-react";
import { DataRequestPanel } from "../profile/DataRequestPanel.jsx";
import { DisplayName, FriendCode } from "../cosmetics/Cosmetics.jsx";
import { ConfirmActionButton } from "../common/ConfirmAction.jsx";
import { PasswordField } from "../common/PasswordField.jsx";
import { DateTimeInput } from "../common/DateTimeInput.jsx";
import { publicProfileStatOptions } from "../../config/site.js";
import { ageFromBirthDate, memberCardStats, memberStatOptions } from "../../utils/presentation.jsx";
import { browserTimeZone, localDate } from "../../utils/dates.js";
import "./admin-account.css";

const sections = [["identity", "Identité et favoris", UserRound], ["visibility", "Carte et confidentialité", Eye], ["security", "Connexion et sécurité", KeyRound], ["access", "Droits et accès", ShieldCheck], ["moderation", "Modération", Scale], ["data", "Demandes de données", FileArchive], ["sensitive", "Actions sensibles", Shield]];
const genders = ["", "Homme", "Femme", "Non-binaire", "Autre", "Préfère ne pas dire"];
const dateLabel = (value) => value ? new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Non renseigné";

function Section({ icon: Icon, title, tag, children }) {
  return <section className="account-admin-section"><header><Icon size={19} /><h3>{title}</h3>{tag && <span>{tag}</span>}</header>{children}</section>;
}
function Field({ label, hint, children }) {
  return <div className="account-admin-field"><div><span>{label}</span>{hint && <small>{hint}</small>}</div><div>{children}</div></div>;
}
function Toggle({ label, hint, checked, onChange, disabled }) {
  return <label className="account-admin-toggle"><span><strong>{label}</strong>{hint && <small>{hint}</small>}</span><input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} disabled={disabled} /></label>;
}

export function AdminAccountWorkspace({ draft, detail, currentUser, games, settings, achievements, updateDraft, updateProfileStats, busy, dirty, runAccountAction, sensitiveActions, initialSection = "identity", onSectionChange, onDataRequests }) {
  const [section, setSection] = useState(initialSection);
  const contentRef = useRef(null);
  function chooseSection(value) {
    setSection(value);
    onSectionChange?.(value);
    if (window.matchMedia("(max-width:650px)").matches) requestAnimationFrame(() => contentRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }
  const self = draft.id === currentUser.id;
  const changedEmail = draft.login !== detail.user.login;
  const actionsDisabled = busy || dirty;
  const mfa = detail.security.mfa ?? {};
  const lock = detail.security.loginLock ?? {};
  const parental = detail.parental ?? {};
  const favorites = draft.favoriteGames ?? [];
  const preview = { ...draft, pseudo: draft.displayName, cosmetics: detail.inventory.cosmetics, statistics: { ...detail.statistics, todayGames: detail.statistics.todayGames ?? 0 } };
  const stats = memberCardStats(preview, detail.history, achievements);
  const setModeration = (key, patch) => updateDraft("moderation", { ...draft.moderation, [key]: { ...draft.moderation?.[key], ...patch } });

  return <div className="account-admin-workspace">
    <label className="account-admin-mobile-section">Section du compte<select aria-label="Section du compte" disabled={busy} value={section} onChange={(event) => chooseSection(event.target.value)}>{sections.map(([key, title]) => <option value={key} key={key}>{title}</option>)}</select></label>
    <aside className="account-admin-sidebar">
      <div className="account-admin-preview" aria-label="Aperçu de la member card"><div className={`vip-card member-${preview.cosmetics?.equipped?.memberCard ?? "default"}`}><span className="vip-label">Aperçu du joueur</span><strong><DisplayName user={preview} interactive={false} /></strong><FriendCode code={draft.friendCode} /><div className="vip-stats">{stats.map((stat, index) => <div className="vip-ratio" key={index}><BadgeCheck size={15} /><span>{stat.label}</span><strong title={String(stat.value)}>{stat.value}</strong></div>)}</div></div></div>
      <div className="account-admin-state"><span className={`status-badge ${draft.active ? "status-active" : "status-inactive"}`}>{draft.active ? "Compte actif" : "Compte désactivé"}</span><span className={`status-badge ${draft.emailVerified && !changedEmail ? "status-active" : "status-waiting"}`}>{draft.emailVerified && !changedEmail ? "Email vérifié" : "Email à vérifier"}</span>{draft.minor && <span className="status-badge status-waiting">Accès parental</span>}</div>
      <nav aria-label="Réglages administratifs du compte">{sections.map(([key, title, Icon]) => <button type="button" disabled={busy} data-request-feedback="state" key={key} className={section === key ? "active" : ""} aria-current={section === key ? "page" : undefined} onClick={() => chooseSection(key)}><Icon size={17} /><span>{title}</span></button>)}</nav>
      <dl className="account-admin-reference"><div><dt>Création</dt><dd>{dateLabel(draft.createdAt)}</dd></div><div><dt>Dernière connexion</dt><dd>{dateLabel(draft.lastLoginAt)}</dd></div></dl>
    </aside>
    <div className="account-admin-content" ref={contentRef}>
      {section === "identity" && <>
        <Section icon={UserRound} title="Identité publique" tag="Visible par les joueurs">
          <Field label="Pseudo affiché"><input aria-label="Pseudo affiché" autoComplete="off" required maxLength={32} value={draft.displayName} onChange={(event) => updateDraft("displayName", event.target.value)} /></Field>
          <Field label="Biographie" hint={`${draft.bio?.length ?? 0} / 180 caractères`}><textarea aria-label="Biographie" maxLength={180} rows={4} value={draft.bio ?? ""} onChange={(event) => updateDraft("bio", event.target.value)} /></Field>
        </Section>
        <Section icon={CalendarDays} title="Informations personnelles" tag="Date complète privée">
          <Field label="Date de naissance" hint="Une correction peut modifier les restrictions liées à l’âge."><div className="account-admin-date"><input aria-label="Date de naissance" type="date" max={localDate()} value={draft.birthDate ?? ""} onChange={(event) => updateDraft("birthDate", event.target.value)} />{draft.birthDate && <span>{ageFromBirthDate(draft.birthDate)} ans</span>}</div></Field>
          <Field label="Genre" hint="Facultatif"><select aria-label="Genre" value={draft.gender ?? ""} onChange={(event) => updateDraft("gender", event.target.value)}>{!genders.includes(draft.gender ?? "") && <option value={draft.gender}>{draft.gender}</option>}{genders.map((value) => <option key={value} value={value}>{value || "Non renseigné"}</option>)}</select></Field>
        </Section>
        <Section icon={Star} title="Jeux favoris" tag={`${favorites.length} / 5`}><div className="account-admin-favorites">{games.map((game) => { const selected = favorites.includes(game.id); return <button type="button" data-request-feedback="state" key={game.id} className={selected ? "active" : ""} aria-pressed={selected} disabled={!selected && favorites.length >= 5} onClick={() => updateDraft("favoriteGames", selected ? favorites.filter((id) => id !== game.id) : [...favorites, game.id])}><Star size={15} />{game.name}</button>; })}</div></Section>
      </>}
      {section === "visibility" && <>
        <Section icon={BadgeCheck} title="Statistiques de la member card" tag="Deux emplacements">
          {[0, 1].map((index) => { const selected = draft.profileStats?.memberCardStats?.[index] ?? (index ? "achievementsUnlocked" : "winRate"); const normalized = selected === "overallWinRate" ? "winRate" : selected; const options = memberStatOptions(); return <Field key={index} label={`Emplacement ${index + 1}`}><select aria-label={`Emplacement ${index + 1}`} value={normalized} onChange={(event) => updateProfileStats((previous) => { const values = [...(previous.memberCardStats ?? ["winRate", "achievementsUnlocked"])]; values[index] = event.target.value; return { ...previous, memberCardStats: values }; })}>{!options.some(([key]) => key === normalized) && <option value={normalized}>Ancien réglage : {normalized}</option>}{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{normalized === "customAchievement" && <div className="account-admin-custom-stat"><label htmlFor={`account-admin-achievement-${index}`}>Succès personnalisé {index + 1}</label><select id={`account-admin-achievement-${index}`} value={draft.profileStats?.customAchievementIds?.[index] ?? ""} onChange={(event) => updateProfileStats((previous) => { const ids = [...(previous.customAchievementIds ?? ["", ""])]; ids[index] = event.target.value; return { ...previous, customAchievementIds: ids }; })}><option value="">Aucun succès</option>{achievements.filter((entry) => entry.unlocked || entry.id === draft.profileStats?.customAchievementIds?.[index]).map((entry) => <option key={entry.id} value={entry.id}>{entry.title}{!entry.unlocked ? " · non obtenu" : ""}</option>)}</select></div>}</Field>; })}
        </Section>
        <Section icon={Eye} title="Indicateurs du profil public"><div className="account-admin-visibility">{publicProfileStatOptions.map(([key, label]) => <Toggle key={key} label={label} checked={draft.profileStats?.visibleProfileStats?.includes(key)} onChange={(checked) => updateProfileStats((previous) => ({ ...previous, visibleProfileStats: checked ? [...new Set([...(previous.visibleProfileStats ?? []), key])] : (previous.visibleProfileStats ?? []).filter((entry) => entry !== key) }))} />)}</div></Section>
      </>}
      {section === "security" && <>
        <Section icon={Mail} title="Adresse de connexion" tag="Privée">
          <Field label="Adresse email" hint={draft.legacyLogin ? "Ancien identifiant : renseigner un email pour la migration." : "Une nouvelle adresse reçoit une vérification et invalide les sessions."}><input aria-label="Adresse email" type={draft.legacyLogin && !changedEmail ? "text" : "email"} autoComplete="off" maxLength={254} value={draft.login} onChange={(event) => updateDraft("login", event.target.value)} /></Field>
          <Toggle label="Email validé" hint={changedEmail ? "La nouvelle adresse devra être vérifiée après l’enregistrement." : "Validation manuelle de l’adresse actuelle."} checked={draft.emailVerified && !changedEmail} disabled={changedEmail || draft.legacyLogin} onChange={(checked) => updateDraft("emailVerified", checked)} />
          <div className="account-admin-immediate"><button type="button" className="secondary" disabled={actionsDisabled || draft.legacyLogin || !settings.emailVerificationAvailable} onClick={() => runAccountAction(`/api/admin/users/${draft.id}/send-verification`, "Email de validation envoyé.")}><Mail size={16} />Renvoyer la vérification</button></div>
          <dl className="account-admin-facts"><div><dt>Vérification envoyée</dt><dd>{dateLabel(detail.security.emailVerificationSentAt)}</dd></div><div><dt>Expiration</dt><dd>{dateLabel(detail.security.emailVerificationExpiresAt)}</dd></div></dl>
        </Section>
        <Section icon={KeyRound} title="Mot de passe et sessions">
          <Field label="Nouveau mot de passe" hint="Vide : conserver l’actuel. 10 caractères, lettre, chiffre, majuscule et symbole."><PasswordField label="Nouveau mot de passe" autoComplete="new-password" minLength={10} maxLength={128} value={draft.password ?? ""} onChange={(event) => updateDraft("password", event.target.value)} /></Field>
          <dl className="account-admin-facts"><div><dt>Mot de passe</dt><dd>{draft.hasPassword ? "Configuré" : "Absent"}</dd></div><div><dt>Réinitialisation demandée</dt><dd>{dateLabel(detail.security.passwordResetSentAt)}</dd></div><div><dt>Version des sessions</dt><dd>{detail.security.sessionVersion}</dd></div><div><dt>Tentatives échouées</dt><dd>{lock.failures ?? 0}</dd></div>{lock.locked && <div><dt>Connexion bloquée jusqu’au</dt><dd>{dateLabel(lock.lockedUntil)}</dd></div>}</dl>
          <div className="account-admin-immediate">{!self && <ConfirmActionButton className="secondary" disabled={actionsDisabled} dialogTitle="Fermer toutes les sessions ?" message={`Les sessions de ${draft.displayName} seront invalidées.`} confirmLabel="Révoquer les sessions" danger onConfirm={() => runAccountAction(`/api/admin/users/${draft.id}/revoke-sessions`, "Sessions du joueur révoquées.", { propagate: true })}><LogOut size={16} />Révoquer les sessions</ConfirmActionButton>}{lock.failures > 0 && <ConfirmActionButton className="secondary" disabled={actionsDisabled} dialogTitle="Débloquer la connexion ?" message="Les échecs de connexion sont remis à zéro. Les sanctions et les restrictions parentales restent inchangées." confirmLabel="Débloquer" onConfirm={() => runAccountAction(`/api/admin/users/${draft.id}/unlock-login`, "Blocage de connexion levé.", { propagate: true })}><KeyRound size={16} />Débloquer la connexion</ConfirmActionButton>}</div>
        </Section>
        <Section icon={ShieldCheck} title="Double authentification" tag={mfa.required ? "Obligatoire : administrateur" : "Facultative"}><dl className="account-admin-facts"><div><dt>TOTP</dt><dd>{mfa.totpEnabled ? "Activé" : "Non configuré"}</dd></div><div><dt>Code par email</dt><dd>{mfa.emailEnabled || mfa.required ? "Activé" : "Non activé"}</dd></div><div><dt>Codes de secours disponibles</dt><dd>{mfa.recoveryCodesRemaining ?? 0}</dd></div></dl></Section>
        {dirty && <p className="account-admin-notice">Enregistre ou annule les modifications avant d’utiliser les actions immédiates.</p>}
      </>}
      {section === "access" && <>
        <Section icon={ShieldCheck} title="Compte et permissions"><Toggle label="Compte actif" hint="Désactiver le compte invalide ses sessions." checked={draft.active} disabled={self} onChange={(checked) => updateDraft("active", checked)} /><Toggle label="Administrateur" hint={self ? "Ton propre rôle est protégé." : "Accès complet à l’admin. Double authentification obligatoire."} disabled={self} checked={draft.admin} onChange={(checked) => updateDraft("admin", checked)} /><Toggle label="Éditeur" hint="Boutique, événements, succès, patchnotes, FAQ et guide." disabled={self} checked={draft.editor} onChange={(checked) => updateDraft("editor", checked)} /></Section>
        <Section icon={Shield} title="Accès parental" tag={draft.minor ? "Moins de 13 ans" : "Compte standard"}><dl className="account-admin-facts"><div><dt>État</dt><dd>{parental.revokedUntil ? "Suspendu par le responsable" : parental.managed ? "Sous contrôle parental" : "Pas de contrôle parental actif"}</dd></div>{parental.parentEmail && <div><dt>Email du responsable</dt><dd>{parental.parentEmail}</dd></div>}{parental.code && <div><dt>Code parental</dt><dd>{parental.code}</dd></div>}{parental.managed && parental.turnsThirteenAt && <div><dt>Accès complet à partir du</dt><dd>{dateLabel(parental.turnsThirteenAt)}</dd></div>}{parental.revokedUntil && <div><dt>Suspension jusqu’au</dt><dd>{dateLabel(parental.revokedUntil)}</dd></div>}</dl>{parental.managed && <div className="account-admin-restrictions">{(parental.restrictions ?? []).map((key) => <span key={key}>{games.find((game) => `game:${game.id}` === key)?.name ?? ({ shop: "Boutique", chat: "Chat", friends: "Amis", rooms: "Tables", "community-events": "Événements" })[key] ?? key}</span>)}</div>}{draft.birthDate !== detail.user.birthDate && <p className="account-admin-notice">Les informations parentales seront recalculées après l’enregistrement de la date de naissance.</p>}</Section>
        <Section icon={Activity} title="Solde et bonus"><Field label="Solde de jetons" hint="La correction est inscrite dans les transactions."><input aria-label="Solde de jetons" type="number" min={0} max={100000000} step={1} value={draft.tokens} onChange={(event) => updateDraft("tokens", Number(event.target.value))} /></Field><Field label="Dernier bonus quotidien"><input aria-label="Dernier bonus quotidien" type="date" max={localDate()} value={draft.lastDailyClaim ?? ""} onChange={(event) => updateDraft("lastDailyClaim", event.target.value || null)} /></Field></Section>
      </>}
      {section === "moderation" && <>
        <Section icon={Scale} title="Comportement"><dl className="account-admin-facts"><div><dt>Score comportemental</dt><dd>{detail.tribunal.behavior.score} / 100</dd></div><div><dt>Sanctions réelles</dt><dd>{detail.tribunal.behavior.sanctions}</dd></div><div><dt>Signalements</dt><dd>{detail.tribunal.reports.total}</dd></div></dl></Section>
        <Section icon={Shield} title="Sanctions administratives" tag={browserTimeZone()}>{[["softBan", "Softban", "Bloque les interactions, les événements et les tables rejointes."], ["hardBan", "Hardban", "Ferme les sessions et bloque la connexion."]].map(([key, label, hint]) => { const sanction = draft.moderation?.[key] ?? {}; return <div className="account-admin-sanction" key={key}><Toggle label={label} hint={hint} checked={sanction.active} disabled={self} onChange={(active) => setModeration(key, { active })} /><Field label={`Motif du ${label.toLowerCase()}`}><input aria-label={`Motif du ${label.toLowerCase()}`} disabled={self || !sanction.active} required={sanction.active} maxLength={240} value={sanction.reason ?? ""} onChange={(event) => setModeration(key, { reason: event.target.value })} /></Field><Field label={`Fin du ${label.toLowerCase()}`} hint="Vide : durée indéterminée."><DateTimeInput aria-label={`Fin du ${label.toLowerCase()}`} disabled={self || !sanction.active} value={sanction.endsAt} onValueChange={(endsAt) => setModeration(key, { endsAt })} /></Field></div>; })}<p className="account-admin-notice">Les sanctions confirmées sont inscrites au tribunal selon la procédure 49,3 et diminuent le score comportemental. Un recours écrit peut être envoyé par email.</p></Section>
      </>}
      {section === "data" && <DataRequestPanel userId={draft.id} admin disabled={actionsDisabled} initialRequests={detail.dataRequests ?? []} onChange={onDataRequests} />}
      {section === "sensitive" && <>{dirty && <p className="account-admin-notice">Enregistre ou annule les modifications avant une réinitialisation ou une suppression.</p>}{sensitiveActions}</>}
    </div>
  </div>;
}
