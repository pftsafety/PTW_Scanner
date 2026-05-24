const CACHE = 'hll-scanner-v3';
const ASSETS = [
  './scanner.html',
  './scanner-manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(ks=>
    Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))
  ).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e=>{
  if(e.request.method==='POST') return;
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});