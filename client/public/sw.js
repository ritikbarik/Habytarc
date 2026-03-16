self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

try {
  importScripts('https://www.gstatic.com/firebasejs/10.7.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.7.2/firebase-messaging-compat.js');

  firebase.initializeApp({
    apiKey: 'AIzaSyAbPo3M66N6b7IfpdJc3sPIurW3Qtz2X8A',
    authDomain: 'habytarc.firebaseapp.com',
    projectId: 'habytarc',
    storageBucket: 'habytarc.firebasestorage.app',
    messagingSenderId: '33656412218',
    appId: '1:33656412218:web:8841b13700fd10c867bd03',
    measurementId: 'G-YLR5724YSM'
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload?.notification?.title || payload?.data?.title || 'HabytARC';
    const body = payload?.notification?.body || payload?.data?.body || 'You have a new reminder.';
    const tag = payload?.data?.tag || `push_${Date.now()}`;
    self.registration.showNotification(title, {
      body,
      tag,
      data: payload?.data || {}
    });
  });
} catch (error) {
  console.error('Service worker messaging init failed:', error);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((client) => client.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    })
  );
});
