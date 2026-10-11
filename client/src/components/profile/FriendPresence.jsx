import { useLocale } from "../../locales/LocaleProvider.jsx";
import { DisplayName } from "../cosmetics/Cosmetics.jsx";

export function PresenceDot({ online }) {
  const { t: localeText } = useLocale();
  return <span className={`friend-presence-dot ${online ? "is-online" : ""}`} role="img" aria-label={online ? localeText("En ligne") : localeText("Hors ligne")} title={online ? localeText("En ligne") : localeText("Hors ligne")} />;
}

export function FriendIdentity({ friend }) {
  const { t: localeText } = useLocale();
  return <div className="friend-identity"><DisplayName user={friend} /><small className="friend-presence-label"><PresenceDot online={friend.online} />{friend.online ? localeText("En ligne") : localeText("Hors ligne")}</small></div>;
}
