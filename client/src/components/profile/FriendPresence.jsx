import { DisplayName } from "../cosmetics/Cosmetics.jsx";

export function PresenceDot({ online }) {
  return <span className={`friend-presence-dot ${online ? "is-online" : ""}`} role="img" aria-label={online ? "En ligne" : "Hors ligne"} title={online ? "En ligne" : "Hors ligne"} />;
}

export function FriendIdentity({ friend }) {
  return <div className="friend-identity"><DisplayName user={friend} /><small className="friend-presence-label"><PresenceDot online={friend.online} />{friend.online ? "En ligne" : "Hors ligne"}</small></div>;
}
