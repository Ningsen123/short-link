export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const jsonHeaders = { 'Content-Type': 'application/json', ...corsHeaders };

    // 健康检查
    if (path === '/api/health') {
      return new Response(JSON.stringify({ status: 'ok' }), { headers: jsonHeaders });
    }

    // 创建短链
    if (path === '/api/shorten' && method === 'POST') {
      try {
        const body = await request.json();
        let { url: longUrl, code } = body;

        if (!longUrl) {
          return new Response(JSON.stringify({ error: '请输入链接' }), { status: 400, headers: jsonHeaders });
        }

        if (code) {
          if (!/^[a-zA-Z0-9]{4,20}$/.test(code)) {
            return new Response(JSON.stringify({ error: '短码格式错误' }), { status: 400, headers: jsonHeaders });
          }
          const existing = await env.DB.prepare('SELECT id FROM links WHERE code = ?').bind(code).first();
          if (existing) {
            return new Response(JSON.stringify({ error: '短码已被使用' }), { status: 409, headers: jsonHeaders });
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

        return new Response(JSON.stringify({
          success: true,
          data: { code, short_url: `https://shortlink.yhstar.xin/${code}`, long_url: longUrl },
        }), { headers: jsonHeaders });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: jsonHeaders });
      }
    }

    // 获取列表
    if (path === '/api/links' && method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT code, long_url, clicks, created_at FROM links ORDER BY created_at DESC LIMIT 20'
      ).all();
      return new Response(JSON.stringify({ success: true, data: results }), { headers: jsonHeaders });
    }

    // 短链跳转
    const shortMatch = path.match(/^\/([a-zA-Z0-9]{4,8})$/);
    if (shortMatch && method === 'GET') {
      const code = shortMatch[1];
      const link = await env.DB.prepare('SELECT * FROM links WHERE code = ?').bind(code).first();

      if (!link) {
        return new Response('短链接不存在', { status: 404 });
      }

      // 记录点击
      await env.DB.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?').bind(link.id).run();

      return Response.redirect(link.long_url, 302);
    }

    return new Response('Not Found', { status: 404 });
  }
};
