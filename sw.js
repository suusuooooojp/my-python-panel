const CACHE_NAME = 'pypanel-pro-v3';
const ASSETS = [
    './',
    './index.html',
    './main.js',
    './py-worker.js',
    // Pyodide Core
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js',
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.asm.js',
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.asm.wasm',
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/python_stdlib.zip',
    // Ace Editor Core
    'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/ace.js',
    'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/ext-language_tools.js',
    'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/theme-monokai.js',
    // Language Support
    'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/mode-python.js',
    'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/mode-javascript.js',
    'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/mode-typescript.js',
    'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/mode-html.js',
    'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/mode-css.js',
    'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/mode-java.js',
    'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/mode-golang.js',
    'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/worker-base.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
    e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});
