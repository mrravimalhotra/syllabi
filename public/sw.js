// Syllabi's service worker. It only does two things: lets the app be installed as a desktop app, and shows
// a friendly page instead of the browser's error when there is no connection. It never stores pages, answers
// or data (they are private and must always be the latest), so the installed app is always as up to date as
// the website: every launch and every page comes from the network.
const OFFLINE_PAGE = "/offline.html";
const CACHE = "syllabi-offline-v1";

async function refreshOfflinePage() {
  try {
    const response = await fetch(OFFLINE_PAGE, { cache: "no-cache" });
    if (response.ok) await (await caches.open(CACHE)).put(OFFLINE_PAGE, response);
  } catch {
    // Offline or busy: the copy already stored stays.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_PAGE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Only a page the person is opening can fall back to the offline page; everything else goes straight to the network.
  if (request.mode !== "navigate") return;
  event.respondWith(
    fetch(request).then(
      (response) => {
        // While online, keep the offline page's copy fresh, so an edited page reaches installed apps.
        event.waitUntil(refreshOfflinePage());
        return response;
      },
      async () => (await caches.match(OFFLINE_PAGE)) ?? Response.error()
    )
  );
});
