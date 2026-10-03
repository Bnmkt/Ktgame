import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "../../api.js";

const WelcomeGuide = lazy(() => import("./HelpContent.jsx").then((module) => ({ default: module.WelcomeGuide })));

export function HelpOnboarding({ user }) {
  const [document, setDocument] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (user.guest) return;
    // Existing accounts do not download the tutorial renderer or its content.
    api("/api/me/help", { background: true }).then(async (state) => {
      if (!cancelled && state.needsWelcome) {
        const content = await api("/api/help", { background: true });
        if (!cancelled) setDocument(content);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user.id, user.guest]);
  async function close() {
    setDocument(null);
    await api("/api/me/help/dismiss", { method: "POST", background: true }).catch(() => {});
  }
  return document ? <Suspense fallback={null}><WelcomeGuide document={document} onClose={close} /></Suspense> : null;
}
