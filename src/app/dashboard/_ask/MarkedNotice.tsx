"use client";

import { useEffect, useState } from "react";

type State = "unsupported" | "add-to-home" | "off" | "on" | "denied" | "working";

/** A web app on an iPhone can only notify once it is on the Home Screen and opened from there. */
const needsHomeScreen = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator as Navigator & { standalone?: boolean }).standalone && !window.matchMedia("(display-mode: standalone)").matches;

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const raw = atob((base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * "Notify me when a paper is marked": a paper takes minutes, so the phone says when it is ready (lib/push.ts). Shown
 * on Paper check only when Syllabi's notifications are set up; on an iPhone in Safari it says to add Syllabi to the
 * Home Screen first, as Apple requires.
 */
export function MarkedNotice() {
  const [state, setState] = useState<State>("unsupported");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    (async () => {
      const key = ((await fetch("/api/push").then((r) => (r.ok ? r.json() : null)).catch(() => null)) as { publicKey?: string | null } | null)?.publicKey;
      if (stopped || !key) return;
      setPublicKey(key);
      if (needsHomeScreen()) return setState("add-to-home");
      if (!supported()) return;
      if (Notification.permission === "denied") return setState("denied");
      const registration = await navigator.serviceWorker.getRegistration();
      const existing = await registration?.pushManager.getSubscription();
      if (!stopped) setState(existing && Notification.permission === "granted" ? "on" : "off");
    })().catch(() => {});
    return () => {
      stopped = true;
    };
  }, []);

  async function turnOn() {
    if (!publicKey) return;
    setState("working");
    setProblem(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState(Notification.permission === "denied" ? "denied" : "off");
      const registration = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const subscription = (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't turn notifications on.");
      setState("on");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't turn notifications on. Try again.");
      setState("off");
    }
  }

  async function turnOff() {
    setState("working");
    const subscription = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => {});
      await subscription.unsubscribe().catch(() => false);
    }
    setState("off");
  }

  if (state === "unsupported") return null;
  const text =
    state === "add-to-home"
      ? "To be told when a paper is marked, add Syllabi to your Home Screen (Share → Add to Home Screen) and open it from there."
      : state === "denied"
        ? "Notifications are turned off for Syllabi. Turn them on in the phone's Settings → Notifications → Syllabi to be told when a paper is marked."
        : state === "on"
          ? "🔔 This phone will be told when a paper is marked."
          : "Marking takes a few minutes. Get a notification when it's done?";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500 sm:px-5" role="status">
      <span className="min-w-0 flex-1">{text}</span>
      {(state === "off" || state === "working") && (
        <button type="button" onClick={() => void turnOn()} disabled={state === "working"} className="rounded-lg bg-brand-600 px-3 py-1.5 font-medium text-white disabled:opacity-60">
          Notify me
        </button>
      )}
      {state === "on" && (
        <button type="button" onClick={() => void turnOff()} className="font-medium text-slate-600 underline-offset-4 hover:underline">
          Turn off
        </button>
      )}
      {problem && <span className="w-full text-red-700">{problem}</span>}
    </div>
  );
}
