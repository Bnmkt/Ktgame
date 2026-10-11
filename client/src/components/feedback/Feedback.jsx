import { useLocale } from "../../locales/LocaleProvider.jsx";
import { BadgeCheck, Bell, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Link, Trash2, UserPlus, X } from "lucide-react";
import { formatDate } from "../../utils/presentation.jsx";

export function AchievementToasts({ notifications, onClose }) {
  const { t: localeText } = useLocale();
  return (
    <div className="toast-stack">
      {notifications.map((notification) => <article className="achievement-toast" key={notification.id}>
        {notification.type === "friend-request" ? <UserPlus size={22} /> : notification.type === "room-invite" ? <Link size={22} /> : <BadgeCheck size={22} />}
        <div><span>{notification.toastLabel ?? (notification.type ? localeText("Notification") : localeText("Succès débloqué"))}</span><strong>{notification.title}</strong><small>{notification.description ?? notification.message}</small></div>
        <button onClick={() => onClose(notification.id)}><X size={16} /></button>
      </article>)}
    </div>
  );
}

export function NotificationCenter({ items, open, onToggle, onDelete, onClear, onAction }) {
  const { t: localeText } = useLocale();
  return (
    <div className="notification-center">
      <button className="notification-button secondary" onClick={onToggle} title={localeText("Notifications")} aria-label={localeText("Notifications")} aria-expanded={open}>
        <Bell size={18} />
        {items.length > 0 && <span>{items.length}</span>}
      </button>
      {open && <div className="notification-panel">
        <div className="notification-panel-head">
          <div><strong>{localeText("Notifications")}</strong><small>{items.length ? localeText("{value0} reçue{value1}", { value0: items.length, value1: items.length > 1 ? "s" : "" }) : localeText("Aucune notification")}</small></div>
          {items.length > 0 && <button className="secondary" onClick={onClear}><Trash2 size={15} />{" " + localeText("Tout supprimer")}</button>}
        </div>
        <div className="notification-list">
          {items.map((item) => (
            <article className={`notification-row notification-${item.type}`} key={item.id}>
              {item.type === "friend-request" ? <UserPlus size={19} /> : item.type === "room-invite" ? <Link size={19} /> : item.type === "achievement" ? <BadgeCheck size={19} /> : <Bell size={19} />}
              <div><strong>{item.title}</strong><p className={item.type === "achievement" ? "achievement-description" : ""}>{item.message}</p><small>{formatDate(item.createdAt)}</small>
                {item.type === "friend-request" && <div className="notice-actions"><button onClick={() => onAction(item, "accept")}>{localeText("Accepter")}</button><button className="danger-button" onClick={() => onAction(item, "decline")}>{localeText("Refuser")}</button><button className="secondary" onClick={() => onAction(item, "ignore")}>{localeText("Ignorer")}</button></div>}
                {item.type === "room-invite" && <div className="notice-actions"><button disabled={!item.inviteId} onClick={() => onAction(item, "accept")}>{localeText("Accepter")}</button><button className="danger-button" disabled={!item.inviteId} onClick={() => onAction(item, "decline")}>{localeText("Refuser")}</button></div>}
              </div>
              {!['friend-request', 'room-invite'].includes(item.type) && <button className="secondary icon-toggle" onClick={() => onDelete(item.id)} title={localeText("Supprimer")}><X size={15} /></button>}
            </article>
          ))}
          {!items.length && <div className="empty-state">{localeText("Les demandes d'amis et invitations apparaîtront ici.")}</div>}
        </div>
      </div>}
    </div>
  );
}

export function Pagination({ page, totalPages, onPage, totalItems, pageSize, onPageSize, pageSizes = [20, 50, 100], label = "Navigation des résultats" }) {
  const { t: localeText } = useLocale();
  if (totalPages <= 1 && totalItems === undefined) return null;
  return (
    <nav className="pagination list-pagination" aria-label={localeText(label)}>
      {totalItems !== undefined && <span className="pagination-count" role="status">{totalItems ? localeText("{from}–{to} sur {total}", { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, totalItems), total: totalItems }) : localeText("Aucun résultat")}</span>}
      {onPageSize && <label>{localeText("Par page")}<select aria-label={localeText("Éléments par page")} value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>{pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>}
      <div className="pagination-controls">
        <button type="button" className="secondary icon-toggle" title={localeText("Première page")} aria-label={localeText("Première page")} disabled={page <= 1} onClick={() => onPage(1)}><ChevronsLeft size={17} /></button>
        <button type="button" className="secondary icon-toggle" title={localeText("Page précédente")} aria-label={localeText("Page précédente")} disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={17} /></button>
        <span aria-live="polite">{localeText("Page") + " "}{page} / {totalPages}</span>
        <button type="button" className="secondary icon-toggle" title={localeText("Page suivante")} aria-label={localeText("Page suivante")} disabled={page >= totalPages} onClick={() => onPage(page + 1)}><ChevronRight size={17} /></button>
        <button type="button" className="secondary icon-toggle" title={localeText("Dernière page")} aria-label={localeText("Dernière page")} disabled={page >= totalPages} onClick={() => onPage(totalPages)}><ChevronsRight size={17} /></button>
      </div>
    </nav>
  );
}
