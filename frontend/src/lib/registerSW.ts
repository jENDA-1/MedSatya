// Register the service worker for offline + installability. No-op if unsupported.
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // offline support is a progressive enhancement — never block the app on it
    });
  });
}
