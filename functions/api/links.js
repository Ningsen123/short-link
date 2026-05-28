export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    'SELECT code, long_url, clicks, created_at FROM links ORDER BY created_at DESC LIMIT 20'
  ).all();
  return Response.json({ success: true, data: results });
}
