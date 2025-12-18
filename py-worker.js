const CACHE_NAME = 'pypanel-offline-v3'; // Update this version to trigger update
const ASSETS = [
    './',
    './index.html',
    './main.js',
    './py-worker.js',
    // Monaco Core
    'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.js',
    'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/editor/editor.main.js',
    'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/editor/editor.main.css',
    'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/base/worker/workerMain.js',
    // Pyodide Core
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js',
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.asm.js',
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.asm.wasm',
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/python_stdlib.zip',
    // Fonts
    'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600&display=swap'
];

self.addEventListener('install', (e) => {
    // Install: Cache all static assets
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    // Activate: Clean up old caches
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (key !== CACHE_NAME) return caches.delete(key);
            })
        ))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(cached => {
            // Cache Hit: Return cached
            if (cached) return cached;

            // Cache Miss: Fetch from network and cache (Dynamic Caching)
            return fetch(e.request).then(response => {
                // Don't cache invalid responses
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    if (!e.request.url.startsWith('http')) return response;
                }

                // Clone response because it can be consumed once
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    // Cache Pyodide packages and Monaco chunks dynamically
                    if (e.request.url.includes('cdn.jsdelivr.net') || 
                        e.request.url.includes('cdnjs.cloudflare.com') ||
                        e.request.url.endsWith('.js') || 
                        e.request.url.endsWith('.wasm')) {
                        cache.put(e.request, responseToCache);
                    }
                });
                return response;
            });
        })
    );
});
