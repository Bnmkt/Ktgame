import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ShopStudio } from "../../src/components/admin/ShopStudio.jsx";
import { RankInsigniaEditor } from "../../src/components/admin/RankInsigniaEditor.jsx";
import { ModalBackdrop } from "../../src/components/common/ModalBackdrop.jsx";
import { defaultVisualDesign } from "../../src/components/cosmetics/Cosmetics.jsx";
import { artworkCropBounds, encodeArtworkCrop } from "../../src/features/games/artwork-crop.js";
import { encodeInsigniaCrop } from "../../src/features/games/insignia-crop.js";
import { cropImageStyle } from "../../src/features/games/image-transform.js";
import "../../src/features/theme/theme.css";
import "../../src/styles.css";
import "../../src/features/games/ranked.css";

window.imageTools = { artworkCropBounds, encodeArtworkCrop, encodeInsigniaCrop, cropImageStyle };
function Fixture() {
  const [rank, setRank] = useState(false), [section, setSection] = useState("appearance");
  const [item, setItem] = useState({ type: "cardSkins", value: "image-test", name: "Cartes du studio", category: "classic", description: "Test", price: 1000, css: "background: linear-gradient(#222222, #444444); border-color: #abcdef;", design: defaultVisualDesign("cardSkins") });
  window.imageTools.item = item;
  const update = (key, value) => setItem(current => ({ ...current, [key]: value, ...(key === "type" ? { design: null, css: "" } : {}) }));
  return <><ModalBackdrop className="modal-backdrop"><form className="modal admin-editor shop-admin-editor" onClick={event => event.stopPropagation()} onSubmit={event => event.preventDefault()}><div className="modal-title-row"><h2>Studio boutique</h2><button type="button" onClick={() => setRank(true)}>Insigne de test</button></div><ShopStudio item={item} kind="new-shop" user={{ pseudo: "Test", profile: { displayName: "Test" } }} shop={[]} isAdministrator section={section} onSectionChange={setSection} onUpdate={update} onActivateVisualDesigner={() => update("design", defaultVisualDesign(item.type))} onDisableVisualDesigner={() => update("design", null)} onCancel={() => {}}/></form></ModalBackdrop>{rank && <RankInsigniaEditor rank={{ name: "Argent", color: "#dddddd" }} onApply={value => { window.imageTools.insignia = value; setRank(false); }} onClose={() => setRank(false)}/>}</>;
}
createRoot(document.getElementById("root")).render(<Fixture/>);
