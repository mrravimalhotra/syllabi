/** Tells the server a screen crashed, so the admin can see it in Admin → Health. Never throws. */
export function reportCrash(where: string, error: Error): void {
  void fetch("/api/log-error", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ where, message: error.message, path: window.location.pathname }),
  }).catch(() => {});
}
