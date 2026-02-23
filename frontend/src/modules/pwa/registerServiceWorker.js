export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    console.log("[PWA] Service Worker registered:", reg.scope);

    // When a new SW is waiting, tell it to take over immediately
    reg.addEventListener("updatefound", () => {
      const newSW = reg.installing;
      if (!newSW) return;
      newSW.addEventListener("statechange", () => {
        if (newSW.state === "installed" && navigator.serviceWorker.controller) {
          newSW.postMessage("SKIP_WAITING");
        }
      });
    });
  } catch (err) {
    console.warn("[PWA] Service Worker registration failed:", err);
  }

  // Reload page when a new SW takes control (ensures fresh assets)
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}
