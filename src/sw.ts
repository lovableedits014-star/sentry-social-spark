/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

// Required by vite-plugin-pwa injectManifest strategy (will be replaced with empty array since globPatterns: [])
// @ts-ignore
const WB_MANIFEST = self.__WB_MANIFEST || [];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push notification handler
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data: { title?: string; body?: string; icon?: string; tag?: string; url?: string } = {};
  try {
    data = event.data.json();
  } catch {
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
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: '👆 Ver Missão' },
      { action: 'close', title: 'Fechar' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  const url = (event.notification.data as { url?: string })?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          (client as WindowClient).navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
