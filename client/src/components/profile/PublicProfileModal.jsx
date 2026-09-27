import { DailyActivityChart } from "./DailyActivityChart.jsx";
import { BadgeCheck, X } from "lucide-react";
import { Die, PlayingCard } from "../game/GamePieces.jsx";
import { DisplayName, FriendCode, ProfileCosmeticEffect, ProfileCosmeticFrame, profileCosmeticClassName } from "../cosmetics/Cosmetics.jsx";
import { memberCardOptions, publicProfileStatOptions } from "../../config/site.js";
import { gameTitle } from "../../features/games/config.js";
import { CompactNumber, formatExactNumber } from "../../utils/presentation.jsx";

function shortStatLabel(label) {
  const normalized = String(label ?? "").toLowerCase();
  if (normalized.includes("win")) return "Winrate";
  if (normalized.includes("succ")) return "Succès";
  if (normalized.includes("milestone")) return "Milestone";
  if (normalized.includes("aujourd")) return "Aujourd'hui";
  if (normalized.includes("partie")) return "Parties";
  return String(label ?? "Stat");
}


export function PublicProfileModal({ profile, currentUser, onClose, onFriendRequest }) {
  const favoriteGames = profile.profile?.favoriteGames ?? [];
  const hasBio = Boolean(profile.profile?.bio?.trim());
  const hasDetails = hasBio || favoriteGames.length > 0;
  const visibleStatKeys = new Set(profile.profileStats?.visibleProfileStats ?? publicProfileStatOptions.map(([key]) => key));
  const publicStats = [
    profile.age ? ["age", "Âge", profile.age] : null,
    profile.profile?.gender ? ["gender", "Genre", profile.profile.gender] : null,
    ["friends", "Amis", <CompactNumber value={profile.friendCount} label="Nombre exact d’amis" />],
    ["gamesPlayed", "Parties", <CompactNumber value={profile.stats?.gamesPlayed} label="Nombre exact de parties" />],
    ["wins", "Victoires", <CompactNumber value={profile.stats?.wins} label="Nombre exact de victoires" />],
    ["winRate", "Winrate", `${profile.stats?.winRate ?? 0}%`],
    ["achievements", "Succès", <span title={`${formatExactNumber(profile.stats?.achievementsUnlocked)} succès sur ${formatExactNumber(profile.stats?.achievementsTotal)}`}><CompactNumber value={profile.stats?.achievementsUnlocked} /> / <CompactNumber value={profile.stats?.achievementsTotal} /></span>]
  ].filter((entry) => entry && visibleStatKeys.has(entry[0]));
  return <div className="modal-backdrop" onClick={onClose}>
    <div className={profileCosmeticClassName(profile, "modal public-profile-modal")} onClick={(event) => event.stopPropagation()}>
      <ProfileCosmeticEffect user={profile} />
      <ProfileCosmeticFrame user={profile} />
      <div className="public-profile-scroll"><div className="modal-title-row"><div><h2>Profil de {profile.pseudo}</h2></div><div className="modal-title-actions">{currentUser && !currentUser.guest && !profile.relationship?.self && <button className="secondary" disabled={profile.relationship?.isFriend || profile.relationship?.requested} onClick={() => onFriendRequest?.(profile.id)}>{profile.relationship?.isFriend ? "Ami" : profile.relationship?.requested ? "Demande envoyée" : "Ajouter en ami"}</button>}<button className="secondary icon-toggle" onClick={onClose}><X size={18} /></button></div></div>
      <div className={`public-profile-layout ${hasDetails ? "" : "public-profile-layout-solo"}`}><aside><div className={`vip-card member-${profile.cosmetics?.equipped?.memberCard ?? "default"}`}><span className="vip-label">{memberCardOptions[profile.cosmetics?.equipped?.memberCard ?? "default"]} · Profil public</span><strong><DisplayName user={profile} /></strong><FriendCode code={profile.friendCode} /><div className="vip-stats">{(profile.profileStats?.publicStats ?? []).map((stat, index) => <div className="vip-ratio" key={`${stat.key}-${index}`}><BadgeCheck size={16} /><span title={stat.label}>{shortStatLabel(stat.label)}</span><strong title={String(stat.value)}>{stat.value}</strong></div>)}</div></div>{publicStats.length > 0 && <div className="public-profile-grid">{publicStats.map(([key, label, value]) => <div key={key}><span>{label}</span><strong>{value}</strong></div>)}</div>}<div className="profile-cosmetics-preview" aria-label="Dés et cartes équipés"><div><span>Dés</span><Die value={5} kept={false} skin={profile.cosmetics?.equipped?.diceSkin} /></div><div><span>Cartes</span><div className="skin-preview-row"><PlayingCard card={{ rank: "A", suit: "S" }} skin={profile.cosmetics?.equipped?.cardSkin} /><PlayingCard hidden skin={profile.cosmetics?.equipped?.cardSkin} /></div></div></div></aside>
        {hasDetails && <section className="public-profile-side">{hasBio && <div className="settings-card"><div className="panel-heading"><span>Bio</span><small>Présentation publique</small></div><p>{profile.profile.bio}</p></div>}{favoriteGames.length > 0 && <div className="settings-card"><div className="panel-heading"><span>Jeux favoris</span><small>{favoriteGames.length} / 5</small></div><div className="favorite-game-grid">{favoriteGames.map((id) => <span className="favorite-game active" key={id}>{gameTitle(id)}</span>)}</div></div>}</section>}
      </div><DailyActivityChart activity={profile.activity ?? []} /></div>
    </div>
  </div>;
}
