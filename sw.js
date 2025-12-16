const CACHE_NAME = 'pypanel-offline-v5'; // バージョン更新
const PRECACHE_URLS = [
    './',
    './index.html',
    './main.js',
    './py-worker.js',
    // 必須ライブラリのコア部分だけは確実に先に落とす
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/loader.min.js',
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js',
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.asm.js',
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.asm.wasm',
    'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/python_stdlib.zip'
];

// インストール時：コアファイルをキャッシュ
self.addEventListener('install', (event) => {
    self.skipWaiting(); // 直ちに有効化
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching core assets...');
            return cache.addAll(PRECACHE_URLS);
        })
    );
});

// 有効化時：古いキャッシュを削除
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

// フェッチ時：アグレッシブキャッシュ戦略
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. 外部CDN (Monaco, Pyodide, FontAwesome) は「キャッシュ優先」
    //    一度でもロードしたらキャッシュし、次回から通信しない
    if (url.hostname.includes('cdnjs.cloudflare.com') || 
        url.hostname.includes('cdn.jsdelivr.net') || 
        url.href.includes('monaco-editor')) {
        
        event.respondWith(
            caches.open(CACHE_NAME).then(async (cache) => {
                const cachedResponse = await cache.match(event.request);
                if (cachedResponse) {
                    return cachedResponse; // キャッシュヒット
                }
                // キャッシュになければ取りに行く
                try {
                    const networkResponse = await fetch(event.request);
                    // 成功したらキャッシュに保存して返す
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                } catch (e) {
                    console.error('[SW] Fetch failed:', e);
                    throw e;
                }
            })
        );
        return;
    }

    // 2. 自サイトのファイル (index.html, main.jsなど) は「ネットワーク優先、失敗したらキャッシュ」
    //    開発中に更新が反映されやすいようにする
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // 成功したらキャッシュ更新
                const resClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, resClone);
                });
                return response;
            })
            .catch(() => {
                // オフラインならキャッシュを返す
                return caches.match(event.request);
            })
    );
});
