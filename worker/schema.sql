-- 短链表
CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  long_url TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT DEFAULT NULL,
  password TEXT DEFAULT NULL
);

-- 点击记录表
CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL,
  clicked_at TEXT DEFAULT (datetime('now')),
  referer TEXT DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  country TEXT DEFAULT NULL,
  FOREIGN KEY (link_id) REFERENCES links(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_links_code ON links(code);
CREATE INDEX IF NOT EXISTS idx_clicks_link_id ON clicks(link_id);
