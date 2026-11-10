/* Service worker: notificaciones push (Firebase Cloud Messaging) + instalación de la app */
importScripts("js/config.js");
const CFG = self.APP_CONFIG;

if (CFG.firebase && CFG.firebase.apiKey) {
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
                "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
  firebase.initializeApp(CFG.firebase);
  const messaging = firebase.messaging();
  // Mensajes "data-only" enviados por scripts/notify.mjs
  messaging.onBackgroundMessage(payload => {
    const d = payload.data || {};
    return self.registration.showNotification(d.title || "Wellness DHF", {
      body: d.body || "", icon: "icons/icon-192.png", badge: "icons/icon-192.png",
      tag: d.tag || "dhf", renotify: true, data: { url: d.url || "./index.html" }
    });
  });
}

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./index.html", self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("navigate" in c) { c.focus(); return c.navigate(url); }
    return clients.openWindow(url);
  }));
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* red directa: siempre datos al día */ });
