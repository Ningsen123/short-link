// 创建短链 - POST /api/shorten
export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin');

  try {
    const body = await request.json();
    let { url: longUrl, code, expiresAt, password } = body;

    // 验证URL
    if (!longUrl) {
      return Response.json({ error: '请输入链接' }, { status: 400 });
    }
    try {
      const u = new URL(longUrl);
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
    } catch {
      return Response.json({ error: '请输入有效的URL' }, { status: 400 });
    }

    // 自定义短码或随机生成
    if (code) {
      if (!/^[a-zA-Z0-9]{4,20}$/.test(code)) {
        return Response.json({ error: '短码只能包含字母和数字，4-20位' }, { status: 400 });
      }
      const existing = await env.DB.prepare('SELECT id FROM links WHERE code = ?').bind(code).first();
      if (existing) {
        return Response.json({ error: '该短码已被使用' }, { status: 409 });
      }
    } else {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let attempts = 0;
      do {
        code = '';
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const existing = await env.DB.prepare('SELECT id FROM links WHERE code = ?').bind(code).first();
        if (!existing) break;
        attempts++;
      } while (attempts < 10);
    }

    await env.DB.prepare(
      'INSERT INTO links (code, long_url, expires_at, password) VALUES (?, ?, ?, ?)'
    ).bind(code, longUrl, expiresAt || null, password || null).run();

    const host = new URL(request.url).origin;
    
    return Response.json({
      success: true,
      data: {
        code,
        short_url: `${host}/${code}`,
        long_url: longUrl,
        clicks: 0,
        created_at: new Date().toISOString(),
      },
    });

  } catch (err) {
    return Response.json({ error: '服务器错误' }, { status: 500 });
  }
}

// CORS预检
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
