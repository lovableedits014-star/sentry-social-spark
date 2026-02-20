// Service Worker Customizado - Portal do Apoiador
// Handles push notifications
// Required by vite-plugin-pwa injectManifest strategy
const WB_MANIFEST = self.__WB_MANIFEST || [];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  if (!event.data) {
    console.log('[SW] No data in push event');
    return;
  }

  let data = {};
  try {
    data = event.data.json();
    console.log('[SW] Push data:', data);
  } catch (e) {
    data = { title: 'Nova missão!', body: event.data.text() };
  }

  const title = data.title || '🎯 Nova Missão!';
  const options = {
    body: data.body || 'Há uma nova postagem para você interagir!',
    icon: data.icon || '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || 'nova-missao',
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
    },
    actions: [
      { action: 'open', title: '👆 Ver Missão' },
      { action: 'close', title: 'Fechar' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  event.notification.close();

  if (event.action === 'close') return;

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Do NOT intercept fetch - let the browser handle navigation normally
// This prevents the "offline copy" issue during PWA installation
