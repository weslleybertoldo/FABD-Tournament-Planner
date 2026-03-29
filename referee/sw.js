const CACHE='fabd-referee-v3';
const URLS=['./index.html'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(URLS)));
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch',e=>{
  if(e.request.url.includes('supabase.co')||e.request.url.includes('googleapis.com')||e.request.url.includes('cdn.jsdelivr.net')){
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
