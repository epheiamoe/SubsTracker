import { handleApiRequest } from './api/router.js';
import { handleDebug } from './api/debug.js';
import { getCurrentTimeInTimezone } from './core/time.js';
import { checkExpiringSubscriptions } from './services/scheduler.js';
import { appPage } from './views/pages.js';
export { RateLimiterDO } from './core/rate-limiter.js';

const MAX_BODY_SIZE = 1 * 1024 * 1024;

function rejectOversizedBody(request) {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return new Response(
      JSON.stringify({ success: false, message: '请求体过大' }),
      { status: 413, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return null;
}

function serveStatic(content, contentType, cacheHours) {
  const headers = {
    'Content-Type': contentType + '; charset=utf-8',
    'Cache-Control': 'public, max-age=' + (cacheHours || 24) * 3600
  };
  return new Response(content, { headers });
}

const MANIFEST_JSON = JSON.stringify({
  name: 'SubsTracker',
  short_name: '订阅',
  description: '订阅管理与提醒系统',
  start_url: '/',
  display: 'standalone',
  background_color: '#f9fafb',
  theme_color: '#6366f1',
  icons: [
    { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
  ]
});

const SW_JS = `const CACHE_NAME = 'substracker-v1';
const CDN_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css'
];
const APP_FILES = ['/', '/app.js', '/views/subscription-list.js', '/views/config.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CDN_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  if (CDN_URLS.includes(event.request.url)) {
    event.respondWith(caches.match(event.request).then((r) => r || fetch(event.request)));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request).then((response) => {
        if (response.ok && APP_FILES.includes(url.pathname)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
      return cached || fetched;
    })
  );
});`;

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#6366f1"/><stop offset="100%" style="stop-color:#8b5cf6"/></linearGradient></defs><rect width="512" height="512" rx="100" fill="url(#bg)"/><rect x="96" y="128" width="320" height="320" rx="32" fill="none" stroke="white" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/><line x1="96" y1="224" x2="416" y2="224" stroke="white" stroke-width="24" stroke-linecap="round"/><polyline points="240,336 288,384 384,288" fill="none" stroke="white" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    const sizeError = rejectOversizedBody(request);
    if (sizeError) return sizeError;

    if (pathname === '/manifest.json') {
      return serveStatic(MANIFEST_JSON, 'application/json', 168);
    }

    if (pathname === '/sw.js') {
      return serveStatic(SW_JS, 'application/javascript', 24);
    }

    if (pathname === '/icon.svg') {
      return serveStatic(ICON_SVG, 'image/svg+xml', 720);
    }

    if (pathname.startsWith('/api')) {
      return handleApiRequest(request, env);
    }

    if (pathname === '/debug') {
      const { user } = await import('./api/handlers/auth.js').then(function(m) { return m.getUserFromRequest(request, env); });
      if (!user) {
        return new Response('未授权访问', {
          status: 401,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
      return handleDebug(request, env);
    }

    if (pathname === '/app.js') {
      return serveStatic(appPage.appJs, 'application/javascript', 1);
    }

    if (pathname === '/views/subscription-list.js') {
      return serveStatic(appPage.subscriptionListJs, 'application/javascript', 1);
    }

    if (pathname === '/views/config.js') {
      return serveStatic(appPage.configJs, 'application/javascript', 1);
    }

    return serveStatic(appPage.html, 'text/html', 0);
  },

  async scheduled(event, env, ctx) {
    console.log('[Workers] Cron:', event?.cron || '(unknown)', 'UTC:', new Date().toISOString());
    await checkExpiringSubscriptions(env);
  }
};