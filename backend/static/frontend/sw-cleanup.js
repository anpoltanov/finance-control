self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key === "api-cache").map((key) => caches.delete(key))))
  );
});
