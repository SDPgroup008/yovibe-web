/* eslint-disable no-undef */

const APP_CACHE = "yovibe-app-v1";
const RUNTIME_CACHE = "yovibe-runtime-v1";
const DYNAMIC_CACHE = "yovibe-dynamic-v1";
const OFFLINE_URL = "/offline.html";

// Maximum items in runtime cache before eviction
const MAX_RUNTIME_ITEMS = 100;
const MAX_DYNAMIC_ITEMS = 50;

const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/offline.html",
  "/favicon.ico",
  "/favicon.png",
  "/assets/icon.png",
  "/assets/adaptive-icon.png",
  "/assets/og-image.png",
  "/assets/favicon.png",
  "/robots.txt",
  "/sitemap.xml",
];

/**
 * Limit the number of entries in a cache to prevent unbounded growth.
 */
const trimCache = async (cacheName, maxItems) => {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      // Delete oldest entries (they're sorted by insertion order)
      await cache.delete(keys[0]);
      // Recursively trim
      await trimCache(cacheName, maxItems);
    }
  } catch (error) {
    console.warn("[SW] Error trimming cache:", error);
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(APP_CACHE);
        await cache.addAll(APP_SHELL);
        console.log("[SW] App shell cached successfully");
      } catch (error) {
        console.warn("[SW] App shell caching error:", error);
      }
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Delete old cache versions
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== APP_CACHE && key !== RUNTIME_CACHE && key !== DYNAMIC_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    self.clients.claim();
  }
  if (event.data?.type === "CACHE_URLS" && Array.isArray(event.data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(DYNAMIC_CACHE);
        await cache.addAll(event.data.urls).catch(() => {});
        await trimCache(DYNAMIC_CACHE, MAX_DYNAMIC_ITEMS);
      })()
    );
  }
  // Check if SW is alive (for app status checks)
  if (event.data?.type === "PING") {
    event.ports?.[0]?.postMessage({ type: "PONG" });
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
    path.endsWith(".woff2") ||
    path.endsWith(".json")
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
          await trimCache(RUNTIME_CACHE, MAX_RUNTIME_ITEMS);
          return response;
        } catch {
          // Try to return cached version of the page
          const cached = await caches.match(event.request);
          if (cached) return cached;

          // Try app shell index
          const appShell = await caches.match("/index.html");
          if (appShell) return appShell;

          // Return offline page as last resort
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;

          // Inline offline response if nothing cached at all
          return new Response(
            '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><style>body{font-family:sans-serif;background:#121212;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}h1{font-size:24px;margin-bottom:12px}p{color:#b3b3b3;line-height:1.55}.retry{cursor:pointer;display:inline-block;margin-top:24px;padding:12px 28px;background:#2196F3;color:#fff;border-radius:8px;text-decoration:none;font-weight:600}</style></head><body><div><h1>You are offline</h1><p>Please check your internet connection and try again.</p><a class="retry" onclick="location.reload()">Retry</a></div></body></html>',
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
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
        if (response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(event.request, response.clone());
          await trimCache(RUNTIME_CACHE, MAX_RUNTIME_ITEMS);
        }
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
        if (response.ok) {
          const cache = await caches.open(DYNAMIC_CACHE);
          cache.put(event.request, response.clone());
          await trimCache(DYNAMIC_CACHE, MAX_DYNAMIC_ITEMS);
        }
        return response;
      } catch {
        const cached = await caches.match(event.request);
        return cached || Response.error();
      }
    })()
  );
});

// Background sync: retry failed requests when back online
self.addEventListener("sync", (event) => {
  console.log("[SW] Background sync event:", event.tag);
  // Tag-based sync handlers can be added here
  // For example, retrying failed ticket purchases or event creations
  if (event.tag === "sync-purchases") {
    event.waitUntil(
      (async () => {
        // Retrieve queued requests from IndexedDB and retry them
        // This is a placeholder for future implementation
        console.log("[SW] Processing queued purchases...");
      })()
    );
  }
  if (event.tag === "sync-events") {
    event.waitUntil(
      (async () => {
        console.log("[SW] Processing queued events...");
      })()
    );
  }
});

// Periodic cleanup: trim caches every hour
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "cleanup-caches") {
    event.waitUntil(
      (async () => {
        await trimCache(RUNTIME_CACHE, MAX_RUNTIME_ITEMS);
        await trimCache(DYNAMIC_CACHE, MAX_DYNAMIC_ITEMS);
      })()
    );
  }
});

// Firebase Cloud Messaging support for background notifications.
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