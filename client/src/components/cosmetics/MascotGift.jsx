import { useEffect, useState } from "react";
import { Check, Eye, Gift } from "lucide-react";
import { api } from "../../api.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { mascotPackPreview } from "../../features/shop/mascot-gift.js";
import { Dialog } from "../common/Dialog.jsx";
import { Mascot } from "../mascots/Mascot.jsx";
import { PublicProfileModal } from "../profile/PublicProfileModal.jsx";
import { CosmeticPreview, cosmeticCssRules, shopTypeLabel } from "./Cosmetics.jsx";
import "./mascot-gift.css";

export function MascotGift({ user, onClaim, onPendingChange }) {
  const { t } = useLocale();
  const [packs, setPacks] = useState([]), [claim, setClaim] = useState(null), [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true), [selectedId, setSelectedId] = useState(""), [itemId, setItemId] = useState("");
  const [profileOpen, setProfileOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    api("/api/me/mascot-gift", { background: true, deduplicate: false }).then((state) => {
      if (!cancelled) { setPacks(state.packs); setClaim(state.claim); }
    }).catch((failure) => { if (!cancelled) setError(failure.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user.id, retry]);
  useEffect(() => { onPendingChange(loading || !claim && packs.length > 0 && open); }, [loading, claim, packs.length, open, onPendingChange]);
  if (loading || claim || !packs.length && !error) return null;
  const selected = packs.find((pack) => pack.id === selectedId) ?? packs[0];
  const preview = selected && mascotPackPreview(user, selected.items);
  const item = selected?.items.find((entry) => entry.id === itemId) ?? selected?.items.find((entry) => entry.type === "profileBanners") ?? selected?.items[0];
  async function receive() {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      const result = await api("/api/me/mascot-gift", { method: "POST", body: JSON.stringify({ packId: selected.id }), deduplicate: false });
      setClaim(result.claim); onClaim(result.user);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  if (!open || !selected) return <section className="mascot-gift-recall"><Gift size={22}/><span>{t("Ton pack de mascotte offert t’attend.")}</span><button type="button" className="secondary" onClick={() => selected ? setOpen(true) : setRetry((value) => value + 1)}>{t(selected ? "Choisir mon pack" : "Réessayer")}</button>{error && <span role="alert">{error}</span>}</section>;
  if (profileOpen) return <><style>{cosmeticCssRules(selected.items)}</style><PublicProfileModal profile={preview} currentUser={user} preview onClose={() => setProfileOpen(false)}/></>;
  return <Dialog title={t("Choisis ton pack de mascotte offert")} className="mascot-gift-dialog" onClose={() => setOpen(false)} dismissible={!busy}>
    <style>{cosmeticCssRules(selected.items)}</style>
    <div className="mascot-gift-layout">
      <div className="mascot-gift-choices" role="group" aria-label={t("Packs de mascottes")}>
        {packs.map((pack) => <button type="button" className={pack.id === selected.id ? "active" : "secondary"} aria-pressed={pack.id === selected.id} disabled={busy} key={pack.id} onClick={() => { setSelectedId(pack.id); setItemId(""); setError(""); }}><Mascot character={pack.id} priority/><span><strong>{pack.name}</strong><small>{t("{value0} objets", { value0: pack.items.length })}</small></span>{pack.id === selected.id && <Check size={18}/>}</button>)}
      </div>
      <section className="mascot-gift-inspect">
        <header><div><span className="eyebrow">{t("Pack complet offert")}</span><h3>{selected.name}</h3></div><button type="button" className="secondary" onClick={() => setProfileOpen(true)}><Eye size={17}/>{t("Aperçu du profil")}</button></header>
        <div className="mascot-gift-preview"><CosmeticPreview user={preview} item={item}/></div>
        <div className="mascot-gift-items" role="group" aria-label={t("Objets du pack")}>
          {selected.items.map((entry) => <button type="button" key={entry.id} className={entry.id === item.id ? "active" : "secondary"} aria-pressed={entry.id === item.id} onClick={() => setItemId(entry.id)}><span>{t(shopTypeLabel(entry.type))}</span><strong>{entry.name}</strong></button>)}
        </div>
      </section>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <footer className="mascot-gift-footer"><div><strong>{t("Un pack offert par compte. Le choix est définitif.")}</strong><small>{t("Les futurs objets de cette collection seront ajoutés gratuitement à ton inventaire.")}</small></div><div><button type="button" className="secondary" disabled={busy} onClick={() => setOpen(false)}>{t("Plus tard")}</button><button type="button" disabled={busy} onClick={receive}><Gift size={18}/>{busy ? t("Enregistrement…") : t("Recevoir le pack {value0}", { value0: selected.name })}</button></div></footer>
  </Dialog>;
}
