"use client";

import { useSyncExternalStore } from "react";
import { AutoThemeIcon, MoonIcon, SunIcon } from "@/components/icons";
import { button } from "@/components/ui";

// The app's theme, chosen on this device: follow the device (no attribute), or always Light or
// Dark (data-theme on <html>, read by globals.css). THEME_SCRIPT applies it before the first paint.
const KEY = "syllabi.theme";
type Theme = "auto" | "dark" | "light";
const NEXT: Record<Theme, Theme> = { auto: "dark", dark: "light", light: "auto" };
const LABEL: Record<Theme, string> = {
  auto: "Theme: automatic, follows your device",
  dark: "Theme: dark",
  light: "Theme: light",
};

/** Runs in <head> before the page is drawn, so a chosen theme never flashes the other one first. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "dark" || t === "light" ? t : "auto";
  } catch {
    return "auto";
  }
}

function choose(theme: Theme) {
  try {
    if (theme === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Storage blocked: the choice still applies until the page is reloaded.
  }
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The theme button, on every screen: each tap goes Automatic (follows the device) → Dark → Light, and the choice applies to every screen. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "auto" as Theme);
  const Icon = theme === "dark" ? MoonIcon : theme === "light" ? SunIcon : AutoThemeIcon;
  const label = `${LABEL[theme]}. Tap for ${NEXT[theme] === "auto" ? "automatic" : NEXT[theme]}.`;
  return (
    <button type="button" onClick={() => choose(NEXT[theme])} className={button.icon} aria-label={label} title={label} data-theme-choice={theme}>
      <Icon className="h-4.5 w-4.5" />
    </button>
  );
}
