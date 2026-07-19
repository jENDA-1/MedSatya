// Register the service worker for offline + installability. No-op if unsupported.
// Registered under the app's base path (import.meta.env.BASE_URL) with a matching scope, so it
// works both at the site root ("/") and under a subpath ("/medsatyam/") without escaping to the
// parent origin's scope.
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  const base = import.meta.env.BASE_URL; // "/" locally, "/medsatyam/" behind the gridmind proxy
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      // offline support is a progressive enhancement — never block the app on it
    });
  });
}
