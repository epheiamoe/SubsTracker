import { generateJWT, verifyJWT } from '../../core/auth.js';
import { checkRateLimit } from '../../core/rate-limiter.js';
import { getConfig } from '../../data/config.js';
import { getCookieValue } from '../utils.js';

const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW_MS = 60 * 1000;

async function handleLogin(request, env) {
  const clientIp = request.headers.get('CF-Connecting-IP') || '127.0.0.1';

  const rateCheck = await checkRateLimit(env, 'login', clientIp, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_MS);
  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({ success: false, message: '请求过于频繁，请稍后再试' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const config = await getConfig(env);
  const body = await request.json();

  if (body.username === config.ADMIN_USERNAME && body.password === config.ADMIN_PASSWORD) {
    const token = await generateJWT(body.username, config.JWT_SECRET);

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'token=' + token + '; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400'
        }
      }
    );
  }

  return new Response(
    JSON.stringify({ success: false, message: '用户名或密码错误' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

function handleLogout() {
  return new Response('', {
    status: 302,
    headers: {
      'Location': '/',
      'Set-Cookie': 'token=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0'
    }
  });
}

async function getUserFromRequest(request, env) {
  const token = getCookieValue(request.headers.get('Cookie'), 'token');
  const config = await getConfig(env);
  const user = token ? await verifyJWT(token, config.JWT_SECRET) : null;
  return { user, config };
}

export { handleLogin, handleLogout, getUserFromRequest };
