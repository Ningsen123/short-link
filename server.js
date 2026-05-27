// ========================================
// 短链工厂 - 本地开发服务器
// 模拟Cloudflare Worker + SQLite
// ========================================

const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const PORT = 8787;

// 初始化SQLite数据库
const dbPath = path.join(__dirname, 'data.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// 创建表
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    long_url TEXT NOT NULL,
    clicks INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT DEFAULT NULL,
    password TEXT DEFAULT NULL
  );
  CREATE TABLE IF NOT EXISTS clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id INTEGER NOT NULL,
    clicked_at TEXT DEFAULT (datetime('now')),
    referer TEXT DEFAULT NULL,
    user_agent TEXT DEFAULT NULL,
    country TEXT DEFAULT NULL,
    FOREIGN KEY (link_id) REFERENCES links(id)
  );
  CREATE INDEX IF NOT EXISTS idx_links_code ON links(code);
`);

// 生成短码
function generateCode(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// CORS头
function setCors(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// JSON响应
function jsonResponse(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// 验证URL
function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

// 读取请求体
function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

// ========== 服务器 ==========
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathName = parsedUrl.pathname;
  const method = req.method;
  const origin = req.headers.origin;

  setCors(res, origin);
  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    // === API: 创建短链 ===
    if (pathName === '/api/shorten' && method === 'POST') {
      const body = await readBody(req);
      let { url: longUrl, code, expiresAt, password } = body;

      if (!longUrl || !isValidUrl(longUrl)) {
        return jsonResponse(res, { error: '请输入有效的URL' }, 400);
      }

      if (code) {
        if (!/^[a-zA-Z0-9]{4,20}$/.test(code)) {
          return jsonResponse(res, { error: '短码只能包含字母和数字，4-20位' }, 400);
        }
        const existing = db.prepare('SELECT id FROM links WHERE code = ?').get(code);
        if (existing) return jsonResponse(res, { error: '该短码已被使用' }, 409);
      } else {
        let attempts = 0;
        do {
          code = generateCode();
          const existing = db.prepare('SELECT id FROM links WHERE code = ?').get(code);
          if (!existing) break;
          attempts++;
        } while (attempts < 10);
      }

      db.prepare('INSERT INTO links (code, long_url, expires_at, password) VALUES (?, ?, ?, ?)')
        .run(code, longUrl, expiresAt || null, password || null);

      const host = `http://localhost:${PORT}`;
      return jsonResponse(res, {
        success: true,
        data: {
          code,
          short_url: `${host}/${code}`,
          long_url: longUrl,
          clicks: 0,
          created_at: new Date().toISOString(),
        },
      });
    }

    // === API: 获取列表 ===
    if (pathName === '/api/links' && method === 'GET') {
      const page = parseInt(parsedUrl.query.page || '1');
      const limit = Math.min(parseInt(parsedUrl.query.limit || '20'), 100);
      const offset = (page - 1) * limit;

      const links = db.prepare('SELECT code, long_url, clicks, created_at FROM links ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
      const total = db.prepare('SELECT COUNT(*) as count FROM links').get();

      return jsonResponse(res, {
        success: true,
        data: links,
        pagination: { page, limit, total: total.count, pages: Math.ceil(total.count / limit) },
      });
    }

    // === API: 获取单个 ===
    if (pathName.startsWith('/api/links/') && method === 'GET') {
      const code = pathName.split('/api/links/')[1];
      const link = db.prepare('SELECT code, long_url, clicks, created_at FROM links WHERE code = ?').get(code);
      if (!link) return jsonResponse(res, { error: '不存在' }, 404);
      return jsonResponse(res, { success: true, data: link });
    }

    // === API: 删除 ===
    if (pathName.startsWith('/api/links/') && method === 'DELETE') {
      const code = pathName.split('/api/links/')[1];
      const result = db.prepare('DELETE FROM links WHERE code = ?').run(code);
      if (result.changes === 0) return jsonResponse(res, { error: '不存在' }, 404);
      return jsonResponse(res, { success: true, message: '已删除' });
    }

    // === API: 统计 ===
    if (pathName.startsWith('/api/stats/') && method === 'GET') {
      const code = pathName.split('/api/stats/')[1];
      const link = db.prepare('SELECT * FROM links WHERE code = ?').get(code);
      if (!link) return jsonResponse(res, { error: '不存在' }, 404);

      const dailyClicks = db.prepare(`
        SELECT date(clicked_at) as date, COUNT(*) as count 
        FROM clicks WHERE link_id = ? AND clicked_at >= datetime('now', '-30 days')
        GROUP BY date(clicked_at) ORDER BY date
      `).all(link.id);

      return jsonResponse(res, {
        success: true,
        data: { code: link.code, long_url: link.long_url, total_clicks: link.clicks, daily_clicks: dailyClicks },
      });
    }

    // === API: 健康检查 ===
    if (pathName === '/api/health') {
      return jsonResponse(res, { status: 'ok', time: new Date().toISOString() });
    }

    // === 短链跳转 ===
    const shortMatch = pathName.match(/^\/(?:s\/)?([a-zA-Z0-9]{4,8})$/);
    if (shortMatch && method === 'GET') {
      const code = shortMatch[1];
      const link = db.prepare('SELECT * FROM links WHERE code = ?').get(code);
      if (!link) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('短链接不存在');
      }

      // 记录点击
      db.prepare('INSERT INTO clicks (link_id, referer, user_agent) VALUES (?, ?, ?)')
        .run(link.id, req.headers.referer || null, req.headers['user-agent'] || null);
      db.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?').run(link.id);

      // 302跳转
      res.writeHead(302, { Location: link.long_url });
      return res.end();
    }

    // === 静态文件 ===
    let filePath = pathName === '/' ? '/index.html' : pathName;
    filePath = path.join(__dirname, filePath);
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    };

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      } else {
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(content);
      }
    });

  } catch (err) {
    console.error(err);
    jsonResponse(res, { error: 'Internal error' }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`\n🔗 短链工厂 本地开发服务器`);
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`   API:  http://localhost:${PORT}/api/shorten`);
  console.log(`   健康: http://localhost:${PORT}/api/health`);
  console.log(`   数据: ${dbPath}\n`);
});
