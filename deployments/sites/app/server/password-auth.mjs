const COOKIE = '__Host-sadara_admin';
const SESSION_SECONDS = 8 * 60 * 60;
const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 5;
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const digest = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

export class AuthenticationError extends Error {
  constructor(message, status = 401, headers = {}) { super(message); this.status = status; this.headers = headers; }
}
function configuration(env) {
  const username = String(env.SADARA_ADMIN_USERNAME || '').trim();
  const hash = String(env.SADARA_ADMIN_PASSWORD_HASH || '');
  const match = /^pbkdf2-sha256\$100000\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(hash);
  return username && match ? { username, hash, salt: match[1], expected: match[2] } : null;
}
function sessionToken(request) {
  const value = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}
function cookie(token, age = SESSION_SECONDS) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
}
const profile = username => ({username, full_name:'مدير النظام', role:'superuser', auth_method:'password'});
const version = config => digest(config.username + '\0' + config.hash);

export async function passwordUser(request, env) {
  const config = configuration(env), token = sessionToken(request);
  if (!config || !token || !env.DB) return null;
  const row = await env.DB.prepare('SELECT username FROM admin_sessions WHERE token_hash=? AND credential_version=? AND expires_at>?')
    .bind(await digest(token), await version(config), Math.floor(Date.now() / 1000)).first();
  return row && row.username === config.username ? profile(row.username) : null;
}

export async function passwordLogin(request, env, data) {
  const config = configuration(env);
  if (!config || !env.DB) throw new AuthenticationError('تسجيل الدخول بكلمة المرور غير مهيأ.', 503);
  if (typeof data.username !== 'string' || typeof data.password !== 'string' || !data.username.trim() || !data.password || data.username.length > 100 || data.password.length > 256) {
    throw new AuthenticationError('يرجى إدخال اسم المستخدم وكلمة المرور.', 400);
  }
  const now = Math.floor(Date.now() / 1000);
  const client = await digest(config.hash + '\0' + (request.headers.get('cf-connecting-ip') || 'unknown'));
  await env.DB.prepare('INSERT INTO admin_login_limits (client_hash,failures,window_end) VALUES (?,1,?) ON CONFLICT(client_hash) DO UPDATE SET failures=CASE WHEN window_end<=? THEN 1 ELSE failures+1 END,window_end=CASE WHEN window_end<=? THEN excluded.window_end ELSE window_end END')
    .bind(client, now + WINDOW_SECONDS, now, now).run();
  const attempts = await env.DB.prepare('SELECT failures,window_end FROM admin_login_limits WHERE client_hash=?').bind(client).first();
  if (attempts.failures > MAX_ATTEMPTS) throw new AuthenticationError('محاولات دخول كثيرة. يرجى المحاولة بعد 15 دقيقة.', 429, {'Retry-After':String(Math.max(1, attempts.window_end - now))});
  const salt = Uint8Array.from(config.salt.match(/../g), byte => parseInt(byte, 16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(data.password), 'PBKDF2', false, ['deriveBits']);
  const computed = hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'}, key, 256));
  let difference = 0;
  for (let i = 0; i < computed.length; i++) difference |= computed.charCodeAt(i) ^ config.expected.charCodeAt(i);
  if (difference || data.username.trim() !== config.username) throw new AuthenticationError('اسم المستخدم أو كلمة المرور غير صحيحة.');
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const oldToken = sessionToken(request);
  const statements = [
    env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at<=?').bind(now),
    env.DB.prepare('DELETE FROM admin_login_limits WHERE client_hash=? OR window_end<=?').bind(client,now),
    env.DB.prepare('INSERT INTO admin_sessions (token_hash,username,credential_version,expires_at) VALUES (?,?,?,?)').bind(await digest(token),config.username,await version(config),now + SESSION_SECONDS),
  ];
  if (oldToken) statements.push(env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await digest(oldToken)));
  await env.DB.batch(statements);
  return {user:profile(config.username),cookie:cookie(token)};
}

export async function passwordLogout(request, env) {
  const token = sessionToken(request);
  if (token && env.DB) await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await digest(token)).run();
  return cookie('', 0);
}
