# Installing Syllabi as an app on a PC

Syllabi is a progressive web app (PWA): the installed app is the website in its own window, so it is **always as up to date as the website**. Nothing is stored on the PC except the app's shortcut and icon.

## Install (Chrome or Edge, Windows, Mac or Linux)

1. Open https://syllabi-study.vercel.app and sign in.
2. Click the **install icon** at the right end of the address bar (a small monitor with a down arrow), then **Install**.
   - If you don't see it: Chrome → ⋮ menu → **Cast, save and share** → **Install page as app**. Edge → ⋯ menu → **Apps** → **Install this site as an app**.
3. The app opens in its own window and gets a Start menu / desktop shortcut. Right-click its taskbar icon → **Pin to taskbar** to keep it there.
4. In the app's window menu (⋮) there are shortcuts too: right-click the icon for **Generate**, **My books**, **My documents**.

Safari on a Mac: File → **Add to Dock**.

## How it stays up to date

- Every launch and every page comes from the live site; no pages, answers or books are saved on the PC, so there is nothing stale to clear.
- A small background file (`public/sw.js`) only lets the app install and shows a "You're offline" page when there is no connection. It never stores your data.
- An open window asks the site which version is live every ten minutes and when you come back to it. When a newer version has been deployed, a bar at the bottom says **"A new version of Syllabi is ready"** with a **Reload** button. Closing and reopening the app also loads the newest version.

## Uninstall

Chrome/Edge: open the app → ⋮ in its title bar → **Uninstall Syllabi**.

## For the developer

- `src/app/manifest.ts` (name, `id`, `scope`, icons including a maskable one, shortcuts), `public/sw.js`, `public/offline.html`.
- `src/components/AppUpdates.tsx` registers the worker (production only) and watches `/api/version`; the version is `NEXT_PUBLIC_BUILD_ID` = Vercel's commit SHA, set in `next.config.ts`.
- `/sw.js`, `/offline.html`, `/api/version` and the manifest are public (no sign-in) so the browser can install and check them; `/sw.js` is sent with `no-cache`.
- Checked in a production build: Chrome reports no installability problems, the worker activates, no update bar shows for the current version, and with the server down the app shows the offline page.
