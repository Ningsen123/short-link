// 获取短链列表 - GET /api/links
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const offset = (page - 1) * limit;

  try {
    const { results } = await env.DB.prepare(
      'SELECT code, long_url, clicks, created_at FROM links ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(limit, offset).all();

    const total = await env.DB.prepare('SELECT COUNT(*) as count FROM links').first();

    return Response.json({
      success: true,
      data: results,
      pagination: { page, limit, total: total.count, pages: Math.ceil(total.count / limit) },
    });
  } catch (err) {
    return Response.json({ error: '服务器错误' }, { status: 500 });
  }
}
