const CACHE_NAME = 'pypanel-pro-fixed-v1';
const ASSETS = [
    './',
    './index.html',
    './main.js',
    './py-worker.js',
    // Monaco Assets
    'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.js',
    'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/editor/editor.main.js',
    'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/editor/editor.main.css',
    'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/base/worker/workerMain.js',
    // Pyodide Core (Must cache specific files)
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js',
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.asm.js',
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.asm.wasm',
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/python_stdlib.zip',
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/repodata.json', // Required for loading packages
    // Fonts
    'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600&display=swap'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => { if (key !== CACHE_NAME) return caches.delete(key); })
        ))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(response => {
                // Dynamic Cache for Monaco chunks & other assets
                if (e.request.url.includes('cdn.jsdelivr.net') || 
                    e.request.url.includes('cdnjs.cloudflare.com') ||
                    e.request.url.endsWith('.js')) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                }
                return response;
            });
        })
    );
});
