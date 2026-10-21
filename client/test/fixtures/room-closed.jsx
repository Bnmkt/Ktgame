import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "../../src/locales/LocaleProvider.jsx";
import { RoomClosedNotice } from "../../src/components/game/RoomClosedNotice.jsx";
import "../../src/styles.css";
import "../../src/features/theme/theme.css";

function Fixture() {
  const [open, setOpen] = useState(true);
  return <><main className="app-shell"><h1>Le casino</h1></main>{open && <RoomClosedNotice onClose={() => setOpen(false)}/>}</>;
}
createRoot(document.getElementById("root")).render(<LocaleProvider><Fixture/></LocaleProvider>);
