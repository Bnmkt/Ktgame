import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { ShopStudio } from "../../src/components/admin/ShopStudio.jsx";
import { cosmeticCssRules, defaultVisualDesign } from "../../src/components/cosmetics/Cosmetics.jsx";
import { Die, DiceThrowTray } from "../../src/components/game/GamePieces.jsx";
import "../../src/styles.css";

function Fixture() {
  const [item, setItem] = useState({ id: "fixture-one-image", name: "Mon de", type: "diceSkins", category: "classic", value: "fixture-one-image", css: "background-color: #fff2a9;", design: { ...defaultVisualDesign("diceSkins"), backgroundMode: "solid", primaryColor: "#fff2a9", oneShowPip: false, glow: 0 } });
  window.oneFaceItem = () => item;
  return <main className="app-shell" style={{ maxWidth: 1200, padding: 20 }}>
    <style>{cosmeticCssRules([item])}</style>
    <div data-one-case="result"><DiceThrowTray><Die value={1} skin={item.value} animate={false}/><Die value={6} skin={item.value} animate={false}/></DiceThrowTray></div>
    <form className="shop-admin-editor" onSubmit={(event) => event.preventDefault()}>
      <ShopStudio item={item} kind="shop" user={{ pseudo: "Camille", cosmetics: {} }} shop={[]} section="appearance" onSectionChange={() => {}} onUpdate={(key, value) => setItem((current) => ({ ...current, [key]: value }))} onActivateVisualDesigner={() => {}} onDisableVisualDesigner={() => {}}/>
    </form>
  </main>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><Fixture/></LocaleProvider>);
