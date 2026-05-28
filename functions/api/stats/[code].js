// 获取统计 - GET /api/stats/[code]
export async function onRequestGet(context) {
  const { params, env } = context;
  const code = params.code;

  try {
    const link = await env.DB.prepare('SELECT * FROM links WHERE code = ?').bind(code).first();
    if (!link) return Response.json({ error: '不存在' }, { status: 404 });

    const dailyClicks = await env.DB.prepare(
      "SELECT date(clicked_at) as date, COUNT(*) as count FROM clicks WHERE link_id = ? AND clicked_at >= datetime('now', '-30 days') GROUP BY date(clicked_at) ORDER BY date"
    ).bind(link.id).all();

    return Response.json({
      success: true,
      data: { code: link.code, long_url: link.long_url, total_clicks: link.clicks, daily_clicks: dailyClicks.results },
    });
  } catch (err) {
    return Response.json({ error: '服务器错误' }, { status: 500 });
  }
}
