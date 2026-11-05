// Tobu PWA shell — cache the greybox for Add to Home Screen / offline reopen.
const CACHE = 'tobu-v3-sim7-sky1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './sim.js', './age.js', './economy.js', './wallet.js', './powerups.js', './saves.js',
  './hero.js', './ench.js', './skyrunner.js', './look.js', './scenery.js', './clipkit.js', './flash.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
  }).catch(() => caches.match('./index.html'))));
});
