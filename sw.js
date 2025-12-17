const CACHE_NAME = 'pypanel-monaco-v1';
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
    // Monaco Loader
    'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
    // Monaco Editorなどの動的ロードされるファイルもキャッシュする戦略
    e.respondWith(
        caches.match(e.request).then(res => {
            return res || fetch(e.request).then(response => {
                // 外部CDNもキャッシュに保存
                return caches.open(CACHE_NAME).then(cache => {
                    if (e.request.url.startsWith('http') && e.request.method === 'GET') {
                        cache.put(e.request, response.clone());
                    }
                    return response;
                });
            });
        })
    );
});
