"use client";

import { useEffect, useState } from "react";

const LOADED_BUILD = process.env.NEXT_PUBLIC_BUILD_ID;
const CHECK_EVERY_MS = 10 * 60 * 1000;

/**
 * Keeps an open window (a browser tab or the installed app) up to date: registers the service worker that lets
 * the app be installed, and every ten minutes and whenever the window comes back into view asks which version
 * is live. When a newer one has been deployed it says so, with a Reload button.
 */
export function AppUpdates() {
  const [newer, setNewer] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((err) => console.error("[pwa] service worker", err));
    }

    let stopped = false;
    const check = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const data = (await res.json()) as { build?: string };
        if (!stopped && data.build && LOADED_BUILD && data.build !== LOADED_BUILD) setNewer(true);
      } catch {
        // Offline or the server is busy: ask again later.
      }
    };
    void check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  if (!newer) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-[70] flex justify-center px-4 pb-4 print:hidden">
      <div className="flex max-w-md items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
        <span>A new version of Syllabi is ready.</span>
        <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-white px-3 py-1.5 font-medium text-slate-900">
          Reload
        </button>
      </div>
    </div>
  );
}
