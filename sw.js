const CACHE_NAME = 'hll-ptw-v1';
const ASSETS = ['./','./index.html','./scanner.html','./manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));
});
self.addEventListener('fetch',e=>{
  if(e.request.method==='POST') return;
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});