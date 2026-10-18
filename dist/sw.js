const CACHE='yuzuki-n2-86d150fb86a4';
const SHELL=['./','./index.html','./study.css','./fonts.css','./fonts/noto-serif-jp-vocabulary.woff2','./listening.js','./listening-manifest.json','./style.css','./aero.css','./aurora.svg','./phone-qr.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./boot.js','./app.js','./core.js','./vocabulary.json','./audio-manifest.json','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('yuzuki-n2-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data==='app-cache-version')event.ports[0]?.postMessage(CACHE);});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==location.origin||url.pathname.includes('/auth')||req.headers.has('range'))return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).catch(()=>caches.open(CACHE).then(cache=>cache.match('./index.html'))));return;
  }
  if(url.pathname.includes('/listening/'))return;
  if(!/\.(js|css|json|svg|png|webmanifest|mp3|woff2)$/.test(url.pathname))return;
  const fromNetwork=()=>fetch(req).then(response=>{
    if(response.ok&&!response.redirected){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));}return response;
  });
  if(url.pathname.endsWith('.mp3')){
    event.respondWith(caches.open(CACHE).then(cache=>cache.match(req)).then(cached=>cached||fromNetwork()));
  }else{
    event.respondWith(fromNetwork().catch(()=>caches.open(CACHE).then(cache=>cache.match(req,{ignoreSearch:true}))));
  }
});
