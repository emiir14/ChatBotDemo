// Service worker de Web Push (ChatBotDemo).
// Debe vivir en la raíz del sitio para poder controlar todo el scope.
//  - "push": muestra la notificación (payload mínimo: título, cuerpo, url, tag).
//  - "notificationclick": enfoca una pestaña del panel ya abierta o abre una
//    nueva en la conversación. El middleware de login redirige de vuelta.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Handler de fetch mínimo: deja pasar todo a la red, pero habilita la
// instalación como PWA en Android (Chrome lo exige para el prompt de instalación).
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Nuevo chat";
  const options = {
    body: data.body || "",
    tag: data.tag || "nuevo-chat",
    renotify: true,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/dashboard" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if (client.url.includes("/dashboard")) {
          try {
            await client.focus();
          } catch {
            /* ignorar */
          }
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              /* ignorar */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
