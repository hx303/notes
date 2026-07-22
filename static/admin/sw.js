self.addEventListener("install", (event) => {
  self.skipWaiting()
  event.waitUntil(Promise.resolve())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key.startsWith("wouldkeep-admin-")).map((key) => caches.delete(key)),
      )
      await self.registration.unregister()
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      await Promise.all(
        clients.map((client) =>
          client.url.includes("/admin/") ? client.navigate("/workspace/site/") : undefined,
        ),
      )
    })(),
  )
})

self.addEventListener("fetch", () => {})
