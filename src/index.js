import { handleApiRequest } from './api/router.js';
import { handleAdminRequest, handleLoginPage } from './api/admin.js';
import { handleDebug } from './api/debug.js';
import { getCurrentTimeInTimezone } from './core/time.js';
import { checkExpiringSubscriptions } from './services/scheduler.js';
import { getUserFromRequest } from './api/handlers/auth.js';
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const sizeError = rejectOversizedBody(request);
    if (sizeError) return sizeError;

    if (url.pathname === '/') {
      const { user } = await getUserFromRequest(request, env);
      if (user) {
        return new Response('', {
          status: 302,
          headers: { Location: '/admin' }
        });
      }
      return handleLoginPage();
    } else if (url.pathname === '/debug') {
      // 调试页必须登录后才能访问，避免泄露系统信息
      const { user } = await getUserFromRequest(request, env);
      if (!user) {
        return new Response('未授权访问', {
          status: 401,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
      return handleDebug(request, env);
    } else if (url.pathname.startsWith('/api')) {
      return handleApiRequest(request, env);
    } else if (url.pathname.startsWith('/admin')) {
      return handleAdminRequest(request, env, ctx);
    } else {
      return handleLoginPage();
    }
  },

  async scheduled(event, env, ctx) {
    const currentTime = getCurrentTimeInTimezone('UTC');
    console.log('[Workers] 定时任务触发', 'cron:', event?.cron || '(unknown)', 'UTC:', new Date().toISOString(), 'runtime:', currentTime.toISOString());
    await checkExpiringSubscriptions(env);
  }
};
