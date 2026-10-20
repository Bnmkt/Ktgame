import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { MediaLibrary, MediaPicker } from "../../src/components/admin/MediaLibrary.jsx";
import "../../src/features/theme/theme.css";
import "../../src/styles.css";
import "../../src/navigation/casino.css";
function Fixture() {
  const [open, setOpen] = useState(false);
  return <main className="app-shell"><button type="button" onClick={() => setOpen(true)}>Ouvrir le sélecteur</button><MediaLibrary admin/>{open && <MediaPicker onClose={() => setOpen(false)} onSelect={row => { window.selectedMedia = row.id; setOpen(false); }}/>}</main>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><Fixture/></LocaleProvider>);
