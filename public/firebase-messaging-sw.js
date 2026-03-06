// Firebase Messaging Service Worker
// This file is required for push notifications to work on web

// IMPORTANT: Use the same Firebase version as in package.json (firebase: ^10.8.0)
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Initialize Firebase with the correct web config
firebase.initializeApp({
  apiKey: "AIzaSyBYNPWQj74P7EpmbVxX6ETVHEPayu2-UpE",
  authDomain: "eco-guardian-bd74f.firebaseapp.com",
  projectId: "eco-guardian-bd74f",
  storageBucket: "eco-guardian-bd74f.appspot.com",
  messagingSenderId: "917905910857",
  appId: "1:917905910857:web:6a0a450f36d2cbb6912398",
});

// Retrieve Firebase Messaging instance
const messaging = firebase.messaging();

// Service worker lifecycle events for better iOS compatibility
self.addEventListener('install', (event) => {
  console.log('[firebase-messaging-sw.js] Service Worker installing');
  self.skipWaiting(); // Skip waiting, activate immediately
});

self.addEventListener('activate', (event) => {
  console.log('[firebase-messaging-sw.js] Service Worker activating');
  event.waitUntil(clients.claim()); // Take control of all pages immediately
});

// Handle background messages
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  // Customize notification here
  const notificationTitle = payload.notification?.title || 'YoVibe';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification',
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    tag: 'yovibe-notification',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  console.log('[firebase-messaging-sw.js] Notification click:', event);
  
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Focus existing window if available
        for (var i = 0; i < clientList.length; i++) {
          if (clientList[i].url === '/' && 'focus' in clientList[i]) {
            return clientList[i].focus();
          }
        }
        // Open new window if none exists
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});
