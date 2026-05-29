/* eslint-disable no-undef */

const APP_CACHE = "yovibe-app-v1";
const RUNTIME_CACHE = "yovibe-runtime-v1";
const OFFLINE_URL = "/offline.html";

const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/offline.html",
  "/favicon.ico",
  "/assets/icon.png",
  "/assets/adaptive-icon.png",
  "/robots.txt",
  "/sitemap.xml",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== APP_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

const isStaticAsset = (requestUrl) => {
  const path = new URL(requestUrl).pathname;
  return (
    path.startsWith("/_expo/") ||
    path.startsWith("/assets/") ||
    path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith(".png") ||
    path.endsWith(".jpg") ||
    path.endsWith(".jpeg") ||
    path.endsWith(".webp") ||
    path.endsWith(".svg") ||
    path.endsWith(".ico") ||
    path.endsWith(".woff") ||
    path.endsWith(".woff2")
  );
};

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const reqUrl = new URL(event.request.url);

  // Never cache serverless function calls or external API calls.
  if (
    reqUrl.pathname.startsWith("/.netlify/functions/") ||
    reqUrl.origin !== self.location.origin
  ) {
    return;
  }

  // Navigation: network-first, fallback to offline page.
  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(event.request, response.clone());
          return response;
        } catch {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          return offline || Response.error();
        }
      })()
    );
    return;
  }

  // Static assets: cache-first.
  if (isStaticAsset(event.request.url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(event.request, response.clone());
        return response;
      })()
    );
    return;
  }

  // Default: network-first with runtime fallback.
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(event.request, response.clone());
        return response;
      } catch {
        return (await caches.match(event.request)) || Response.error();
      }
    })()
  );
});

// Firebase Cloud Messaging support for background notifications.
// Keep compat SDK in service worker for broad browser support.
try {
  importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

  firebase.initializeApp({
    apiKey: "AIzaSyBYNPWQj74P7EpmbVxX6ETVHEPayu2-UpE",
    authDomain: "eco-guardian-bd74f.firebaseapp.com",
    projectId: "eco-guardian-bd74f",
    storageBucket: "eco-guardian-bd74f.appspot.com",
    messagingSenderId: "917905910857",
    appId: "1:917905910857:web:6a0a450f36d2cbb6912398",
    measurementId: "G-8PRQWEZP8L",
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload?.notification?.title || "YoVibe";
    const options = {
      body: payload?.notification?.body || "You have a new update.",
      icon: "/assets/icon.png",
      badge: "/assets/favicon.png",
      data: payload?.data || {},
    };

    self.registration.showNotification(title, options);
  });
} catch (error) {
  // If Firebase SDK fails to load in SW, keep PWA offline behavior working.
  console.warn("[SW] Firebase messaging unavailable:", error);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
