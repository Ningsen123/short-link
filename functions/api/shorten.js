export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    let { url: longUrl, code } = body;

    if (!longUrl) return Response.json({ error: '请输入链接' }, { status: 400 });

    if (code) {
      if (!/^[a-zA-Z0-9]{4,20}$/.test(code)) return Response.json({ error: '短码格式错误' }, { status: 400 });
      const existing = await env.DB.prepare('SELECT id FROM links WHERE code = ?').bind(code).first();
      if (existing) return Response.json({ error: '短码已被使用' }, { status: 409 });
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
    return Response.json({
      success: true,
      data: { code, short_url: `${host}/r/${code}`, long_url: longUrl, clicks: 0 },
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
