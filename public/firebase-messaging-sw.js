// Firebase Messaging Service Worker
// This file is required for push notifications to work on web

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Initialize Firebase with the same config as the app
firebase.initializeApp({
  apiKey: "AIzaSyD6k2Rr2p-K-c8v-qf9Y9k6r1s3v2p0k1j",
  authDomain: "eco-guardian-bd74f.firebaseapp.com",
  projectId: "eco-guardian-bd74f",
  storageBucket: "eco-guardian-bd74f.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456ghi789",
  vapidKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp2NwhsV7I"
});

// Retrieve Firebase Messaging instance
const messaging = firebase.messaging();

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
