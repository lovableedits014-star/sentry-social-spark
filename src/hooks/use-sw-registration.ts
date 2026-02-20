// Handles manual Service Worker registration for push notifications
// We bypass Workbox autoUpdate to avoid SW conflicts on installed PWAs

let swRegistrationPromise: Promise<ServiceWorkerRegistration> | null = null;

export async function getSWRegistration(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker not supported");
  }

  if (!swRegistrationPromise) {
    swRegistrationPromise = (async () => {
      // Unregister any existing SWs to ensure we use the latest
      const existing = await navigator.serviceWorker.getRegistration("/");
      if (existing && existing.active) {
        const scriptUrl = existing.active.scriptURL;
        // If it's a workbox-generated SW (not our sw.js), unregister it
        if (scriptUrl.includes("workbox") || scriptUrl.includes("sw-") && !scriptUrl.endsWith("sw.js")) {
          console.log("[SW] Unregistering old Workbox SW:", scriptUrl);
          await existing.unregister();
        } else {
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
