// SAC Helpdesk - Push Notification Service Worker
// Handles incoming web push events and shows browser notifications.
//
// GIGW note: this worker is push-only. It registers NO `fetch` handler and
// performs NO content/response caching, so it cannot serve stale government
// content — the browser always fetches pages/assets fresh from the network.
// Do not add a caching `fetch` handler here without a versioned cache +
// update strategy, or stale content could be served.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'SAC Helpdesk', body: event.data.text(), url: '/' };
  }

  const title = payload.title || 'SAC Helpdesk';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon.ico',
    badge: payload.badge || '/favicon.ico',
    tag: payload.tag || 'helpdesk',
    data: { url: payload.url || '/' },
    requireInteraction: false,
    silent: false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// When user clicks the notification, open/focus the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing window if found
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      }),
  );
});
