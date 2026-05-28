// 健康检查
export async function onRequestGet() {
  return Response.json({ status: 'ok', time: new Date().toISOString() });
}
