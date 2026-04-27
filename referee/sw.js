const CACHE='fabd-referee-v35';

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll([
    './index.html',
    './manifest.webmanifest',
    './icon-192.png',
    './icon-512.png'
  ])));
  // ATUALIZAÇÃO AUTOMÁTICA: ativa imediatamente sem esperar
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    // PEGA CONTROLE DAS PÁGINAS ABERTAS IMEDIATAMENTE
    .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',e=>{
  const url=e.request.url;
  // v4.15: ignora schemes que nao podem ser cacheados (chrome-extension://,
  // moz-extension://, devtools://, etc.). Sem esse guard, cache.put crashava
  // com "Request scheme 'chrome-extension' is unsupported", quebrando o
  // fluxo de captura do token OAuth no redirect — login Google nao persistia.
  if(!url.startsWith('http://')&&!url.startsWith('https://'))return;
  // Tambem skip requests com method != GET (cache.put so aceita GET)
  if(e.request.method!=='GET')return;

  const isAppFile=url.includes('/referee/');
  const isApi=url.includes('supabase.co')||url.includes('googleapis.com')||url.includes('google.com');
  const isCdn=url.includes('cdn.jsdelivr.net')||url.includes('iconify.design')||url.includes('simplesvg.com')||url.includes('unisvg.com');

  // API e CDN = SEMPRE buscar da rede
  if(isApi||isCdn){
    e.respondWith(fetch(e.request));
    return;
  }

  // Arquivos do app = NETWORK FIRST, fallback cache
  if(isAppFile){
    e.respondWith(
      fetch(e.request)
        .then(r=>{
          if(r.ok){
            const c=r.clone();
            caches.open(CACHE).then(cache=>cache.put(e.request,c));
          }
          return r;
        })
        .catch(()=>caches.match(e.request))
    );
    return;
  }

  // Outros assets = CACHE FIRST, fallback rede
  e.respondWith(
    caches.match(e.request)
      .then(r=>r||fetch(e.request).then(res=>{
        if(res.ok){
          const c=res.clone();
          caches.open(CACHE).then(cache=>cache.put(e.request,c));
        }
        return res;
      }))
  );
});
