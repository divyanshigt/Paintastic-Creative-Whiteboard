
'use strict';

// Increase version whenever app files change.
const VERSION = '1.1.0';

const PREFIX =
  'paintastic-shell-' +
  encodeURIComponent(self.registration.scope) + '-';

const CACHE = PREFIX + VERSION;
const ROOT = self.registration.scope;

const FILES = [
  'index.html',
  'index.css',
  'editor.html',
  'editor.css',
  'script.js',
  'pwa.js',
  'pwa.css',
  'manifest.webmanifest',
  'privacy.html',
  'offline.html',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon.png',
  'art/garden.svg',
  'art/landscape.svg',
  'art/mandala.svg'
];

const URLS = FILES.map(path => new URL(path, ROOT).href);
const KNOWN = new Set(URLS);

// Install and cache app files.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(URLS))
  );
});

// Remove old caches after activation.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();

    for (const name of names) {
      if (name.startsWith(PREFIX) && name !== CACHE) {
        await caches.delete(name);
      }
    }

    await self.clients.claim();
  })());
});

// Serve cached resources when offline.
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  const scope = new URL(ROOT);

  if (
    request.method !== 'GET' ||
    url.origin !== scope.origin ||
    !url.pathname.startsWith(scope.pathname)
  ) return;

  const key = new URL(url.href);
  key.search = '';
  key.hash = '';

  // Home page route.
  if (key.pathname === scope.pathname) {
    key.pathname += 'index.html';
  }

  // Support Netlify's extensionless editor route.
  if (key.pathname === scope.pathname + 'editor') {
    key.pathname = scope.pathname + 'editor.html';
  }

  if (KNOWN.has(key.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(key.href);

      if (cached) return cached;

      return fetch(request);
    })());
  } else if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE);

        return (
          await cache.match(
            new URL('offline.html', ROOT).href
          ) ||
          new Response('Offline. Connect to the internet.', {
            status: 503,
            headers: {
              'Content-Type': 'text/plain'
            }
          })
        );
      })
    );
  }
});
