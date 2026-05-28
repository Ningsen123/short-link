export async function onRequestGet(context) {
  const { params, env, request } = context;
  const code = params.code;

  try {
    const link = await env.DB.prepare('SELECT * FROM links WHERE code = ?').bind(code).first();
    if (!link) return new Response('短链接不存在', { status: 404 });

    // 记录点击
    context.waitUntil(
      env.DB.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?').bind(link.id).run()
    );

    return Response.redirect(link.long_url, 302);
  } catch (err) {
    return new Response('Error', { status: 500 });
  }
}
