// Cloudflare Pages Worker - 统一处理所有路由
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const origin = request.headers.get('Origin');

    // CORS头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // API路由
    if (path.startsWith('/api/')) {
      return await handleAPI(request, env, path, method, corsHeaders);
    }

    // 短链跳转：匹配4-8位字母数字
    const shortMatch = path.match(/^\/([a-zA-Z0-9]{4,8})$/);
    if (shortMatch && method === 'GET') {
      const code = shortMatch[1];
      return await handleRedirect(code, request, env);
    }

    // 静态资源 - 从Pages获取
    return env.ASSETS.fetch(request);
  }
};

// API处理
async function handleAPI(request, env, path, method, corsHeaders) {
  const jsonHeaders = { 'Content-Type': 'application/json', ...corsHeaders };

  // 健康检查
  if (path === '/api/health') {
    return new Response(JSON.stringify({ status: 'ok', time: new Date().toISOString() }), { headers: jsonHeaders });
  }

  // 创建短链
  if (path === '/api/shorten' && method === 'POST') {
    try {
      const body = await request.json();
      let { url: longUrl, code } = body;

      if (!longUrl) {
        return new Response(JSON.stringify({ error: '请输入链接' }), { status: 400, headers: jsonHeaders });
      }

      try {
        const u = new URL(longUrl);
        if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
      } catch {
        return new Response(JSON.stringify({ error: '请输入有效的URL' }), { status: 400, headers: jsonHeaders });
      }

      if (code) {
        if (!/^[a-zA-Z0-9]{4,20}$/.test(code)) {
          return new Response(JSON.stringify({ error: '短码只能包含字母和数字，4-20位' }), { status: 400, headers: jsonHeaders });
        }
        const existing = await env.DB.prepare('SELECT id FROM links WHERE code = ?').bind(code).first();
        if (existing) {
          return new Response(JSON.stringify({ error: '该短码已被使用' }), { status: 409, headers: jsonHeaders });
        }
      } else {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let attempts = 0;
        do {
          code = '';
          for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
          const existing = await env.DB.prepare('SELECT id FROM links WHERE code = ?').bind(code).first();
          if (!existing) break;
          attempts++;
        } while (attempts < 10);
      }

      await env.DB.prepare('INSERT INTO links (code, long_url) VALUES (?, ?)').bind(code, longUrl).run();

      const host = new URL(request.url).origin;
      return new Response(JSON.stringify({
        success: true,
        data: { code, short_url: `${host}/${code}`, long_url: longUrl, clicks: 0, created_at: new Date().toISOString() },
      }), { headers: jsonHeaders });

    } catch (err) {
      return new Response(JSON.stringify({ error: '服务器错误' }), { status: 500, headers: jsonHeaders });
    }
  }

  // 获取列表
  if (path === '/api/links' && method === 'GET') {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = (page - 1) * limit;

    const { results } = await env.DB.prepare(
      'SELECT code, long_url, clicks, created_at FROM links ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(limit, offset).all();

    const total = await env.DB.prepare('SELECT COUNT(*) as count FROM links').first();

    return new Response(JSON.stringify({
      success: true,
      data: results,
      pagination: { page, limit, total: total.count, pages: Math.ceil(total.count / limit) },
    }), { headers: jsonHeaders });
  }

  // 获取统计
  const statsMatch = path.match(/^\/api\/stats\/([a-zA-Z0-9]+)$/);
  if (statsMatch && method === 'GET') {
    const code = statsMatch[1];
    const link = await env.DB.prepare('SELECT * FROM links WHERE code = ?').bind(code).first();
    if (!link) {
      return new Response(JSON.stringify({ error: '不存在' }), { status: 404, headers: jsonHeaders });
    }

    const dailyClicks = await env.DB.prepare(
      "SELECT date(clicked_at) as date, COUNT(*) as count FROM clicks WHERE link_id = ? AND clicked_at >= datetime('now', '-30 days') GROUP BY date(clicked_at) ORDER BY date"
    ).bind(link.id).all();

    return new Response(JSON.stringify({
      success: true,
      data: { code: link.code, long_url: link.long_url, total_clicks: link.clicks, daily_clicks: dailyClicks.results },
    }), { headers: jsonHeaders });
  }

  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: jsonHeaders });
}

// 短链跳转
async function handleRedirect(code, request, env) {
  try {
    const link = await env.DB.prepare('SELECT * FROM links WHERE code = ?').bind(code).first();

    if (!link) {
      return new Response('短链接不存在', { status: 404 });
    }

    // 记录点击
    const referer = request.headers.get('Referer') || null;
    const userAgent = request.headers.get('User-Agent') || null;
    const country = request.headers.get('CF-IPCountry') || null;

    await Promise.all([
      env.DB.prepare('INSERT INTO clicks (link_id, referer, user_agent, country) VALUES (?, ?, ?, ?)')
        .bind(link.id, referer, userAgent, country).run(),
      env.DB.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?')
        .bind(link.id).run()
    ]);

    return Response.redirect(link.long_url, 302);

  } catch (err) {
    return new Response('Internal Error', { status: 500 });
  }
}
