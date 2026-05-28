// 短链跳转 - Pages Function
export async function onRequestGet(context) {
  const { params, env, request } = context;
  const code = params.code;
  
  // 跳过静态资源
  if (code.includes('.') || code === 'api') {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const link = await env.DB.prepare('SELECT * FROM links WHERE code = ?').bind(code).first();
    
    if (!link) {
      return new Response('短链接不存在', { status: 404 });
    }

    // 检查过期
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return new Response('该短链接已过期', { status: 410 });
    }

    // 记录点击
    const referer = request.headers.get('Referer') || null;
    const userAgent = request.headers.get('User-Agent') || null;
    const country = request.headers.get('CF-IPCountry') || null;
    
    context.waitUntil(
      Promise.all([
        env.DB.prepare('INSERT INTO clicks (link_id, referer, user_agent, country) VALUES (?, ?, ?, ?)')
          .bind(link.id, referer, userAgent, country).run(),
        env.DB.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?')
          .bind(link.id).run()
      ])
    );

    // 302跳转
    return Response.redirect(link.long_url, 302);
    
  } catch (err) {
    return new Response('Internal Error', { status: 500 });
  }
}
