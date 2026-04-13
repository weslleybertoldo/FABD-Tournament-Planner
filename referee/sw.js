const CACHE='fabd-referee-v5';

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll([
    './index.html',
    './manifest.webmanifest',
    './icon-192.png',
    './icon-512.png'
  ])));
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch',e=>{
  // Network only for API and auth
  if(e.request.url.includes('supabase.co')||e.request.url.includes('googleapis.com')||e.request.url.includes('cdn.jsdelivr.net')){
    e.respondWith(fetch(e.request));
    return;
  }
  // Network first, fallback to cache
  e.respondWith(fetch(e.request).then(r=>{
    const c=r.clone();
    caches.open(CACHE).then(cache=>cache.put(e.request,c));
    return r;
  }).catch(()=>caches.match(e.request)));
});
