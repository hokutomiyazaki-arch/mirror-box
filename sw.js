// Service Worker version
const CACHE_VERSION = '1.0.1';
const CACHE_NAME = `mirror-therapy-v${CACHE_VERSION}`;
const RUNTIME_CACHE = 'runtime-cache';

// キャッシュするリソース
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './FNT512.png',
  './FNT512-transparent.png'
];

// インストールイベント
self.addEventListener('install', (event) => {
  console.log('Service Worker installing with cache:', CACHE_NAME);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache opened, adding files');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('All files cached successfully');
        // 即座にアクティベート
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Cache installation failed:', error);
      })
  );
});

// アクティベートイベント
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // 現在のキャッシュと実行時キャッシュ以外は削除
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Old caches cleared');
        // すぐにコントロールを取得
        return self.clients.claim();
      })
  );
});

// フェッチイベント - ネットワークファーストストラテジー
self.addEventListener('fetch', (event) => {
  // カメラストリームやAPIリクエストはキャッシュしない
  if (event.request.url.includes('blob:') || 
      event.request.url.includes('mediaDevices') ||
      event.request.url.includes('getUserMedia')) {
    return;
  }

  event.respondWith(
    // ネットワークファーストで試みる
    fetch(event.request)
      .then((response) => {
        // レスポンスが正常でない場合はそのまま返す
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // 正常なレスポンスをキャッシュにも保存
        const responseToCache = response.clone();
        
        // HTMLファイルとアセットを実行時キャッシュに保存
        if (event.request.destination === 'document' ||
            event.request.destination === 'script' ||
            event.request.destination === 'style' ||
            event.request.destination === 'image') {
          
          caches.open(RUNTIME_CACHE)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            })
            .catch((error) => {
              console.log('Runtime cache error:', error);
            });
        }

        return response;
      })
      .catch(() => {
        // ネットワークエラー時はキャッシュから返す
        return caches.match(event.request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // キャッシュにもない場合、HTMLリクエストならindex.htmlを返す
            if (event.request.destination === 'document') {
              return caches.match('./index.html');
            }
            
            // それ以外は適切なフォールバックを返す
            return new Response('オフラインです。インターネット接続を確認してください。', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain; charset=utf-8'
              })
            });
          });
      })
  );
});

// バックグラウンド同期イベント
self.addEventListener('sync', (event) => {
  console.log('Background sync event:', event.tag);
  
  if (event.tag === 'update-cache') {
    event.waitUntil(updateCache());
  }
});

// キャッシュ更新関数
async function updateCache() {
  console.log('Updating cache...');
  
  try {
    const cache = await caches.open(CACHE_NAME);
    const requests = urlsToCache.map(url => new Request(url));
    
    for (const request of requests) {
      try {
        const freshResponse = await fetch(request);
        if (freshResponse && freshResponse.status === 200) {
          await cache.put(request, freshResponse);
          console.log('Updated cache for:', request.url);
        }
      } catch (error) {
        console.log('Failed to update cache for:', request.url, error);
      }
    }
    
    console.log('Cache update complete');
  } catch (error) {
    console.error('Cache update failed:', error);
  }
}

// メッセージイベント - クライアントからの通信
self.addEventListener('message', (event) => {
  console.log('Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'UPDATE_CACHE') {
    event.waitUntil(updateCache());
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then(cacheNames => {
          return Promise.all(
            cacheNames.map(cacheName => caches.delete(cacheName))
          );
        })
        .then(() => {
          console.log('All caches cleared');
        })
    );
  }
});

// プッシュ通知イベント（将来の拡張用）
self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);
  
  const options = {
    body: event.data ? event.data.text() : 'ミラーボックスセラピーの時間です',
    icon: './FNT512.png',
    badge: './FNT512.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };
  
  event.waitUntil(
    self.registration.showNotification('ミラーボックスセラピー', options)
  );
});

// 通知クリックイベント
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow('./')
  );
});

// ページ終了時のクリーンアップ
self.addEventListener('unload', () => {
  console.log('Service Worker unloading');
});
