// Handles manual Service Worker registration for push notifications
// We bypass Workbox autoUpdate to avoid SW conflicts on installed PWAs

let swRegistrationPromise: Promise<ServiceWorkerRegistration> | null = null;

export async function getSWRegistration(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker not supported");
  }

  if (!swRegistrationPromise) {
    swRegistrationPromise = (async () => {
      // Check if our sw.js is already registered and active — reuse it
      const existing = await navigator.serviceWorker.getRegistration("/");
      if (existing && existing.active) {
        const scriptUrl = existing.active.scriptURL;
        // Only unregister if it's clearly NOT our sw.js (pure Workbox build artifact)
        const isOurSW = scriptUrl.endsWith("/sw.js");
        if (!isOurSW && scriptUrl.includes("workbox")) {
          console.log("[SW] Unregistering old Workbox SW:", scriptUrl);
          await existing.unregister();
        } else {
          // Reuse existing registration — do NOT unregister to preserve push subscriptions
          await navigator.serviceWorker.ready;
          return existing;
        }
      }

      console.log("[SW] Registering sw.js...");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      console.log("[SW] Ready:", reg.active?.scriptURL);
      return reg;
    })();
  }

  return swRegistrationPromise;
}

