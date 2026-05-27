// ========================================
// 短链工厂 - Cloudflare Worker 后端
// ========================================

// 生成短码
function generateCode(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// CORS 头
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// JSON 响应
function jsonResponse(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// 验证 URL
function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// 提取客户端信息
function getClientInfo(request) {
  return {
    referer: request.headers.get('Referer') || null,
    userAgent: request.headers.get('User-Agent') || null,
    country: request.headers.get('CF-IPCountry') || null,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const origin = request.headers.get('Origin');

    // OPTIONS 预检
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      // ========== API 路由 ==========

      // 创建短链
      if (path === '/api/shorten' && method === 'POST') {
        return await handleCreateLink(request, env, origin);
      }

      // 获取短链列表
      if (path === '/api/links' && method === 'GET') {
        return await handleListLinks(request, env, origin);
      }

      // 获取单个短链详情
      if (path.startsWith('/api/links/') && method === 'GET') {
        const code = path.split('/api/links/')[1];
        return await handleGetLink(code, env, origin);
      }

      // 删除短链
      if (path.startsWith('/api/links/') && method === 'DELETE') {
        const code = path.split('/api/links/')[1];
        return await handleDeleteLink(code, env, origin);
      }

      // 获取点击统计
      if (path.startsWith('/api/stats/') && method === 'GET') {
        const code = path.split('/api/stats/')[1];
        return await handleGetStats(code, env, origin);
      }

      // 健康检查
      if (path === '/api/health') {
        return jsonResponse({ status: 'ok', time: new Date().toISOString() }, 200, origin);
      }

      // ========== 短链跳转 ==========
      // 匹配 /s/:code 或 /:code (6位字母数字)
      const shortMatch = path.match(/^\/(?:s\/)?([a-zA-Z0-9]{4,8})$/);
      if (shortMatch && method === 'GET') {
        const code = shortMatch[1];
        return await handleRedirect(code, request, env);
      }

      // 404
      return jsonResponse({ error: 'Not found' }, 404, origin);

    } catch (err) {
      return jsonResponse({ error: 'Internal server error', detail: err.message }, 500, origin);
    }
  },
};

// ========================================
// 创建短链
// ========================================
async function handleCreateLink(request, env, origin) {
  const body = await request.json();
  let { url: longUrl, code, expiresAt, password } = body;

  if (!longUrl || !isValidUrl(longUrl)) {
    return jsonResponse({ error: '请输入有效的URL' }, 400, origin);
  }

  // 自定义短码或随机生成
  if (code) {
    // 校验自定义短码
    if (!/^[a-zA-Z0-9]{4,20}$/.test(code)) {
      return jsonResponse({ error: '短码只能包含字母和数字，4-20位' }, 400, origin);
    }
    // 检查是否已存在
    const existing = await env.DB.prepare('SELECT id FROM links WHERE code = ?').bind(code).first();
    if (existing) {
      return jsonResponse({ error: '该短码已被使用' }, 409, origin);
    }
  } else {
    // 随机生成，确保唯一
    let attempts = 0;
    do {
      code = generateCode();
      const existing = await env.DB.prepare('SELECT id FROM links WHERE code = ?').bind(code).first();
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      return jsonResponse({ error: '生成短码失败，请重试' }, 500, origin);
    }
  }

  // 插入数据库
  const result = await env.DB.prepare(
    'INSERT INTO links (code, long_url, expires_at, password) VALUES (?, ?, ?, ?)'
  ).bind(code, longUrl, expiresAt || null, password || null).run();

  const host = new URL(request.url).origin;
  const shortUrl = `${host}/${code}`;

  return jsonResponse({
    success: true,
    data: {
      code,
      short_url: shortUrl,
      long_url: longUrl,
      clicks: 0,
      created_at: new Date().toISOString(),
      expires_at: expiresAt || null,
    },
  }, 200, origin);
}

// ========================================
// 短链跳转
// ========================================
async function handleRedirect(code, request, env) {
  const link = await env.DB.prepare('SELECT * FROM links WHERE code = ?').bind(code).first();

  if (!link) {
    return new Response('短链接不存在', { status: 404 });
  }

  // 检查是否过期
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return new Response('该短链接已过期', { status: 410 });
  }

  // 检查密码保护
  if (link.password) {
    const url = new URL(request.url);
    const pwd = url.searchParams.get('pwd');
    if (pwd !== link.password) {
      return new Response(generatePasswordPage(code), {
        status: 200,
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
    }
  }

  // 记录点击（异步，不阻塞跳转）
  const clientInfo = getClientInfo(request);
  env.DB.prepare(
    'INSERT INTO clicks (link_id, referer, user_agent, country) VALUES (?, ?, ?, ?)'
  ).bind(link.id, clientInfo.referer, clientInfo.userAgent, clientInfo.country).run();

  // 更新点击计数
  env.DB.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?').bind(link.id).run();

  // 302 跳转
  return Response.redirect(link.long_url, 302);
}

// ========================================
// 获取短链列表
// ========================================
async function handleListLinks(request, env, origin) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const offset = (page - 1) * limit;

  const { results } = await env.DB.prepare(
    'SELECT code, long_url, clicks, created_at, expires_at FROM links ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(limit, offset).all();

  const total = await env.DB.prepare('SELECT COUNT(*) as count FROM links').first();

  return jsonResponse({
    success: true,
    data: results,
    pagination: {
      page,
      limit,
      total: total.count,
      pages: Math.ceil(total.count / limit),
    },
  }, 200, origin);
}

// ========================================
// 获取单个短链
// ========================================
async function handleGetLink(code, env, origin) {
  const link = await env.DB.prepare(
    'SELECT code, long_url, clicks, created_at, expires_at FROM links WHERE code = ?'
  ).bind(code).first();

  if (!link) {
    return jsonResponse({ error: '短链接不存在' }, 404, origin);
  }

  return jsonResponse({ success: true, data: link }, 200, origin);
}

// ========================================
// 删除短链
// ========================================
async function handleDeleteLink(code, env, origin) {
  const result = await env.DB.prepare('DELETE FROM links WHERE code = ?').bind(code).run();
  if (result.meta.changes === 0) {
    return jsonResponse({ error: '短链接不存在' }, 404, origin);
  }

  // 同时删除点击记录
  await env.DB.prepare('DELETE FROM clicks WHERE link_id = (SELECT id FROM links WHERE code = ?)').bind(code).run();

  return jsonResponse({ success: true, message: '已删除' }, 200, origin);
}

// ========================================
// 获取点击统计
// ========================================
async function handleGetStats(code, env, origin) {
  const link = await env.DB.prepare('SELECT * FROM links WHERE code = ?').bind(code).first();
  if (!link) {
    return jsonResponse({ error: '短链接不存在' }, 404, origin);
  }

  // 最近30天点击趋势
  const dailyClicks = await env.DB.prepare(`
    SELECT date(clicked_at) as date, COUNT(*) as count 
    FROM clicks 
    WHERE link_id = ? AND clicked_at >= datetime('now', '-30 days')
    GROUP BY date(clicked_at)
    ORDER BY date
  `).bind(link.id).all();

  // 来源统计
  const referers = await env.DB.prepare(`
    SELECT referer, COUNT(*) as count 
    FROM clicks 
    WHERE link_id = ? AND referer IS NOT NULL
    GROUP BY referer 
    ORDER BY count DESC 
    LIMIT 10
  `).bind(link.id).all();

  // 国家统计
  const countries = await env.DB.prepare(`
    SELECT country, COUNT(*) as count 
    FROM clicks 
    WHERE link_id = ? AND country IS NOT NULL
    GROUP BY country 
    ORDER BY count DESC 
    LIMIT 10
  `).bind(link.id).all();

  return jsonResponse({
    success: true,
    data: {
      code: link.code,
      long_url: link.long_url,
      total_clicks: link.clicks,
      created_at: link.created_at,
      daily_clicks: dailyClicks.results,
      referers: referers.results,
      countries: countries.results,
    },
  }, 200, origin);
}

// ========================================
// 密码验证页面
// ========================================
function generatePasswordPage(code) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>短链工厂 - 需要密码</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, sans-serif; background: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; border-radius: 16px; padding: 40px; max-width: 400px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    p { color: #64748B; margin-bottom: 24px; }
    input { width: 100%; padding: 14px; border: 2px solid #E2E8F0; border-radius: 8px; font-size: 16px; margin-bottom: 16px; }
    input:focus { outline: none; border-color: #0EA5E9; }
    button { width: 100%; padding: 14px; background: #0EA5E9; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }
    button:hover { background: #0284C7; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🔒 需要密码</h1>
    <p>该短链接已设置密码保护</p>
    <form action="/${code}" method="GET">
      <input type="password" name="pwd" placeholder="请输入访问密码" required autofocus>
      <button type="submit">访问链接</button>
    </form>
  </div>
</body>
</html>`;
}
