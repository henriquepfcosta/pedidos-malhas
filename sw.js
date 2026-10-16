// Gerado por scripts/build-offline.js — não edite à mão.
// Guarda todas as telas no aparelho na instalação: depois disso o app abre sem internet.
const CACHE = 'pedidos-offline-43934bc93b94';
const ARQUIVOS = [
  "./",
  "css/style.css",
  "favicon.svg",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "index.html",
  "js/app.js",
  "js/config.js",
  "js/folha.js",
  "js/lista.js",
  "js/local-api.js",
  "js/logo.js",
  "js/pdf.js",
  "manifest.webmanifest",
  "pedido.html",
  "vendor/jspdf.umd.min.js"
];

// cache: 'reload' ignora o cache HTTP do navegador (o GitHub Pages manda guardar por 10 min);
// sem isso, a versão nova poderia ser instalada com arquivos da versão anterior.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Responde do cache (funciona offline); com internet, confere se há versão nova em segundo plano.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const salvo = await cache.match(e.request, { ignoreSearch: true });
      const daRede = fetch(e.request.url, { cache: 'no-cache' })
        .then((res) => { if (res.ok && !res.redirected) cache.put(e.request, res.clone()); return res; })
        .catch(() => null);
      if (salvo) { e.waitUntil(daRede); return salvo; }
      return (await daRede) || (await cache.match('index.html')) || Response.error();
    }),
  );
});
