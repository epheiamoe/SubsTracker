export class RateLimiterDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/alarm') {
      await this.state.storage.deleteAll();
      return new Response('ok');
    }

    if (url.pathname === '/check' && request.method === 'POST') {
      const body = await request.json();
      const key = String(body.key || '');
      const limit = Number(body.limit) || 1;
      const windowMs = Number(body.windowMs) || 60000;

      if (!key || limit < 1 || windowMs < 1000) {
        return new Response(JSON.stringify({ allowed: false, reason: 'invalid_params' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const storageKey = `counter:${key}`;
      const count = (await this.state.storage.get(storageKey)) || 0;

      if (count >= limit) {
        return new Response(JSON.stringify({ allowed: false, remaining: 0 }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const newCount = count + 1;
      await this.state.storage.put(storageKey, newCount);

      const currentAlarm = await this.state.storage.getAlarm();
      if (currentAlarm === null) {
        await this.state.storage.setAlarm(Date.now() + windowMs);
      }

      return new Response(JSON.stringify({
        allowed: true,
        remaining: limit - newCount
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not found', { status: 404 });
  }
}

export async function checkRateLimit(env, namespace, key, limit, windowMs) {
  if (!env.RATE_LIMITER) {
    console.warn('[RateLimiter] DO binding not available, allowing request');
    return { allowed: true, remaining: limit };
  }

  try {
    const doId = env.RATE_LIMITER.idFromName(namespace);
    const stub = env.RATE_LIMITER.get(doId);
    const resp = await stub.fetch('https://dummy/check', {
      method: 'POST',
      body: JSON.stringify({ key, limit, windowMs })
    });

    const result = await resp.json();
    return result;
  } catch (error) {
    console.error('[RateLimiter] Error checking rate limit:', error);
    return { allowed: true, remaining: limit };
  }
}
