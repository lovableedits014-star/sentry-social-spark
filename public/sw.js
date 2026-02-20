// Service Worker para Push Notifications do Portal do Apoiador
const CACHE_NAME = 'apoiador-portal-v1';

// Required by vite-plugin-pwa injectManifest strategy
self.__WB_MANIFEST;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Recebe push notification
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
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
      {
        action: 'open',
        title: '👆 Ver Missão',
      },
      {
        action: 'close',
        title: 'Fechar',
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Click na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Se já tem uma janela aberta, focar nela
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Senão, abrir nova janela
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
