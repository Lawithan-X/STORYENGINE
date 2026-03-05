const CACHE_NAME = 'storyengine-v2.2';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/scripts/style.css',
    '/scripts/engine.js',
    '/assets/effects/fonts/PrestigeEliteStd-Bd.otf',
    '/assets/effects/textures/tex_metal_panel.webp',
    '/assets/effects/textures/tex_jungle_bg.webp',
    '/assets/effects/textures/img_logo_gear.png',
    '/assets/effects/video/boot.webm',
    '/assets/effects/video/off.webm',
    '/assets/effects/audio/power_on.mp3',
    '/assets/effects/audio/power_off.mp3',
    '/assets/effects/audio/logo_flash.mp3'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
