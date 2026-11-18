const VERSION = "niya-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/main.js",
  "./js/config.js",
  "./js/core.js",
  "./js/ui.js",
  "./js/input.js",
  "./js/color.js",
  "./js/canvas.js",
  "./js/layers.js",
  "./js/document.js",
  "./js/brush-engine.js",
  "./js/brushes.js",
  "./js/tools.js",
  "./js/camera.js",
  "./js/scan.js",
  "./js/mockups.js",
  "./js/products.js",
  "./js/brand.js",
  "./js/export.js",
  "./js/export-print.js",
  "./js/print.js",
  "./js/storage.js",
  "./data/brushes.json",
  "./data/products.json",
  "./data/palettes.json",
  "./data/fonts.json",
  "./assets/fonts/Vazirmatn-Regular.woff2",
  "./assets/fonts/Vazirmatn-Bold.woff2",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && new URL(request.url).origin === self.location.origin) {
        const cache = await caches.open(VERSION);
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      return (await caches.match(request)) || caches.match("./index.html");
    }
  })());
});
