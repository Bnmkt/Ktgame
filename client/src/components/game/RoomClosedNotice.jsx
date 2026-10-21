import { Clock3 } from "lucide-react";
import { Dialog } from "../common/Dialog.jsx";
import { useLocale } from "../../locales/LocaleProvider.jsx";

export function RoomClosedNotice({ onClose }) {
  const { t } = useLocale();
  return <Dialog title={t("Table fermée pour inactivité")} className="action-confirm-modal" layerClassName="action-confirm-layer" onClose={onClose}>
    <p className="action-confirm-message"><Clock3 size={20}/> {t("Cette table a été fermée automatiquement après une heure sans action des joueurs.")}</p>
    <p>{t("Tu peux créer une nouvelle table ou rejoindre une autre partie.")}</p>
    <div className="actions"><button type="button" onClick={onClose}>{t("J’ai compris")}</button></div>
  </Dialog>;
}
