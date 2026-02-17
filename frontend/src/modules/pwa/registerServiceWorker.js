
export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    // opcional: log leve no console
    console.log("[PWA] Service Worker registered:", reg.scope);
  } catch (err) {
    console.warn("[PWA] Service Worker registration failed:", err);
  }
}
