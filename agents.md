# 短链工厂 项目文档 v2

## 项目背景

**项目名称**: 短链工厂
**项目定位**: 专业短链接服务SaaS平台
**目标用户**: 营销人员、社交媒体运营、电商卖家、内容创作者
**变现模式**: Freemium订阅制

## 商业模式

| 套餐 | 月费 | 功能 |
|------|------|------|
| 免费版 | ¥0 | 100个短链/月、基础统计 |
| 专业版 | ¥128/月 | 无限短链、详细统计、自定义域名、API |
| 企业版 | ¥388/月 | 高级分析、多个域名、团队协作、优先支持 |

## 技术架构

```
前端: HTML5 + CSS3 + JavaScript
后端: Cloudflare Workers (无服务器)
数据库: Cloudflare D1 (SQLite边缘数据库)
存储: Cloudflare R2 (可选，存二维码图片)
域名: s.yhstar.xin (自定义短链域名)
```

### 本地开发
```
后端: Node.js + better-sqlite3
端口: 8787
数据库: ./data.db (SQLite)
```

## 项目结构

```
url-shortener/
├── index.html              # 首页
├── server.js               # 本地开发服务器(Node.js)
├── package.json
├── js/
│   └── app.js              # 前端逻辑
├── css/
│   └── style.css           # 样式
├── pages/                  # 子页面
├── worker/                 # Cloudflare Worker (生产)
│   ├── wrangler.toml       # Worker配置
│   ├── schema.sql          # D1数据库Schema
│   └── src/
│       └── index.js        # Worker代码
└── agents.md               # 项目文档
```

## 核心功能

### 1. 短链接生成
- 输入长链接，生成6位短码
- 支持自定义短码（4-20位字母数字）
- 链接过期时间设置
- 密码保护

### 2. 数据统计
- 点击次数统计
- 来源分析(Referer)
- 地域分布(Country)
- 最近30天趋势

### 3. API接口

```bash
# 创建短链
curl -X POST http://localhost:8787/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "code": "custom"}'

# 响应
{
  "success": true,
  "data": {
    "code": "custom",
    "short_url": "http://localhost:8787/custom",
    "long_url": "https://example.com",
    "clicks": 0
  }
}

# 获取列表
GET /api/links?page=1&limit=20

# 获取统计
GET /api/stats/:code

# 健康检查
GET /api/health
```

### 4. 短链跳转
- 访问 `/:code` 自动302跳转到原链接
- 支持密码保护（带密码输入页面）
- 记录点击数据

## 运行方式

### 本地开发
```bash
cd /Users/zhaoningsen/url-shortener
npm install
node server.js
# 访问 http://localhost:8787
```

### 生产部署
```bash
cd /Users/zhaoningsen/url-shortener/worker
wrangler d1 create short-links  # 创建远程D1数据库
wrangler deploy                 # 部署Worker
# 绑定自定义域名 s.yhstar.xin
```

## 部署信息

- **本地开发**: http://localhost:8787
- **GitHub**: 待推送
- **生产域名**: s.yhstar.xin (待配置)

## 更新日志

### 2026-05-27 v2.0
- ✅ 新增Node.js后端 + SQLite数据库
- ✅ 实现真实短链跳转(302)
- ✅ API: 创建/列表/统计/删除
- ✅ 前端对接真实API
- ✅ 历史记录功能
- ✅ 自定义短码支持
- ✅ 密码保护支持
- ✅ 点击统计记录

### 2026-05-19 v1.0
- 初始版本，纯前端MVP

---

**创建时间**: 2026年5月19日
**最后更新**: 2026年5月27日
**状态**: 本地开发完成，待部署
