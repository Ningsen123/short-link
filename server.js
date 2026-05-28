// ========================================
// 短链工厂 - 本地开发服务器 v2
// ========================================

const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const PORT = 8787;
const JWT_SECRET = 'local-dev-secret-2026';

const dbPath = path.join(__dirname, 'data.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    plan TEXT DEFAULT 'free',
    links_limit INTEGER DEFAULT 5,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    long_url TEXT NOT NULL,
    user_id INTEGER,
    clicks INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_links_code ON links(code);
  CREATE INDEX IF NOT EXISTS idx_links_user ON links(user_id);
`);

const PLAN_LIMITS = { free: 5, monthly: 80, quarterly: 200, yearly: 999999 };
const PLAN_NAMES = { free: '免费版', monthly: '月卡', quarterly: '季卡', yearly: '年卡' };

function generateCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

function createJWT(payload) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const b = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 86400 * 7 })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(h + '.' + b).digest('base64url');
  return h + '.' + b + '.' + sig;
}

function verifyJWT(token) {
  try {
    const [h, b, sig] = token.split('.');
    if (sig !== crypto.createHmac('sha256', JWT_SECRET).update(h + '.' + b).digest('base64url')) return null;
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

function authenticate(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const payload = verifyJWT(auth.slice(7));
  if (!payload) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

const mimeTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const p = parsedUrl.pathname;
  const m = req.method;

  setCORS(res);
  if (m === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  handle(req, res, p, m).catch(err => { console.error(err); json(res, { error: 'Internal error' }, 500); });
});

async function handle(req, res, p, m) {
  // 健康检查
  if (p === '/api/health') return json(res, { status: 'ok' });

  // 注册
  if (p === '/api/register' && m === 'POST') {
    const { email, password } = await readBody(req);
    if (!email || !password) return json(res, { error: '邮箱和密码必填' }, 400);
    if (password.length < 6) return json(res, { error: '密码至少6位' }, 400);
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return json(res, { error: '该邮箱已注册' }, 409);
    const salt = crypto.randomBytes(16);
    const hash = hashPassword(password, salt);
    const stored = salt.toString('hex') + ':' + hash.toString('hex');
    const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, stored);
    const token = createJWT({ id: r.lastInsertRowid, email });
    return json(res, { success: true, data: { id: r.lastInsertRowid, email, token, plan: 'free', links_limit: 5 } });
  }

  // 登录
  if (p === '/api/login' && m === 'POST') {
    const { email, password } = await readBody(req);
    if (!email || !password) return json(res, { error: '邮箱和密码必填' }, 400);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return json(res, { error: '邮箱或密码错误' }, 401);
    const [saltHex, hashHex] = user.password_hash.split(':');
    if (hashPassword(password, Buffer.from(saltHex, 'hex')).toString('hex') !== hashHex) return json(res, { error: '邮箱或密码错误' }, 401);
    const token = createJWT({ id: user.id, email: user.email });
    return json(res, { success: true, data: { id: user.id, email: user.email, token, plan: user.plan, links_limit: PLAN_LIMITS[user.plan] || 5 } });
  }

  // 获取用户信息
  if (p === '/api/me' && m === 'GET') {
    const user = authenticate(req);
    if (!user) return json(res, { error: '未登录' }, 401);
    const cnt = db.prepare('SELECT COUNT(*) as c FROM links WHERE user_id = ?').get(user.id);
    const clicks = db.prepare('SELECT COALESCE(SUM(clicks),0) as t FROM links WHERE user_id = ?').get(user.id);
    return json(res, { success: true, data: { id: user.id, email: user.email, plan: user.plan, plan_name: PLAN_NAMES[user.plan], links_limit: PLAN_LIMITS[user.plan], links_count: cnt.c, total_clicks: clicks.t } });
  }

  // 创建短链
  if (p === '/api/shorten' && m === 'POST') {
    const user = authenticate(req);
    if (!user) return json(res, { error: '请先登录' }, 401);
    const { url: longUrl, code } = await readBody(req);
    if (!longUrl) return json(res, { error: '请输入链接' }, 400);
    const cnt = db.prepare('SELECT COUNT(*) as c FROM links WHERE user_id = ?').get(user.id);
    const limit = PLAN_LIMITS[user.plan] || 5;
    if (cnt.c >= limit) return json(res, { error: `已达上限(${limit}条)，请升级套餐` }, 403);
    let finalCode = code || generateCode();
    if (db.prepare('SELECT id FROM links WHERE code = ?').get(finalCode)) return json(res, { error: '短码已被使用' }, 409);
    db.prepare('INSERT INTO links (code, long_url, user_id) VALUES (?, ?, ?)').run(finalCode, longUrl, user.id);
    return json(res, { success: true, data: { code: finalCode, short_url: `http://localhost:${PORT}/${finalCode}`, long_url: longUrl, clicks: 0 } });
  }

  // 获取链接列表
  if (p === '/api/links' && m === 'GET') {
    const user = authenticate(req);
    if (!user) return json(res, { error: '请先登录' }, 401);
    const links = db.prepare('SELECT code, long_url, clicks, created_at FROM links WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
    return json(res, { success: true, data: links.map(l => ({ ...l, short_url: `http://localhost:${PORT}/${l.code}` })) });
  }

  // 删除链接
  const delMatch = p.match(/^\/api\/links\/([a-zA-Z0-9]+)$/);
  if (delMatch && m === 'DELETE') {
    const user = authenticate(req);
    if (!user) return json(res, { error: '请先登录' }, 401);
    const link = db.prepare('SELECT * FROM links WHERE code = ? AND user_id = ?').get(delMatch[1], user.id);
    if (!link) return json(res, { error: '链接不存在' }, 404);
    db.prepare('DELETE FROM links WHERE id = ?').run(link.id);
    return json(res, { success: true, message: '已删除' });
  }

  // 短链跳转
  const shortMatch = p.match(/^\/([a-zA-Z0-9]{6})$/);
  if (shortMatch && m === 'GET') {
    const link = db.prepare('SELECT * FROM links WHERE code = ?').get(shortMatch[1]);
    if (link) {
      db.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?').run(link.id);
      res.writeHead(302, { Location: link.long_url });
      return res.end();
    }
  }

  // 静态文件
  let filePath = p === '/' ? '/index.html' : p;
  filePath = path.join(__dirname, filePath);
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

server.listen(PORT, () => {
  console.log(`🔗 短链工厂 本地服务器 v2 - http://localhost:${PORT}`);
});
