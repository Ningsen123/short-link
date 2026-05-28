// ========================================
// 短链工厂 - 核心逻辑 v5 (深色设计 + 用户系统 + Dashboard)
// ========================================

const API_BASE = '';

// 套餐限制
const PLAN_LIMITS = {
  free: 5,
  monthly: 80,
  quarterly: 200,
  yearly: Infinity,
};
const PLAN_NAMES = {
  free: '免费版',
  monthly: '月度会员',
  quarterly: '季度会员',
  yearly: '年度会员',
};

// 用户状态
let currentUser = null;
let authToken = null;

// 当前是否在Dashboard页面
const isDashboard = window.location.pathname.includes('dashboard');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadAuth();
  setupScrollEffect();

  if (isDashboard) {
    // Dashboard页面: 未登录跳转首页
    if (!authToken) {
      window.location.href = '../index.html';
      return;
    }
    loadDashboard();
  } else {
    // 首页: 加载最近链接
    loadRecentLinks();
    // 回车提交
    const longUrlInput = document.getElementById('longUrl');
    if (longUrlInput) {
      longUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') shortenUrl();
      });
    }
  }
});

// ========================================
// 认证功能
// ========================================
function loadAuth() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  if (token && user) {
    authToken = token;
    currentUser = JSON.parse(user);
    updateUI(true);
  } else {
    updateUI(false);
  }
}

function updateUI(loggedIn) {
  const authBtns = document.getElementById('authBtns');
  const userMenu = document.getElementById('userMenu');
  const userName = document.getElementById('userName');

  if (authBtns) authBtns.style.display = loggedIn ? 'none' : 'flex';
  if (userMenu) userMenu.style.display = loggedIn ? 'block' : 'none';
  if (userName && currentUser) {
    userName.textContent = currentUser.email.split('@')[0];
  }
}

async function handleLogin(e) {
  if (e && e.preventDefault) e.preventDefault();
  const form = e?.target || document.querySelector('#loginModal');
  const email = form.querySelector('input[type="email"]').value;
  const password = form.querySelector('input[type="password"]').value;

  if (!email || !password) {
    showNotification('请填写邮箱和密码', 'error');
    return;
  }

  const btn = form.querySelector('button[type="submit"]');
  const origText = btn.textContent;
  btn.textContent = '登录中...';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      showNotification(data.error || '登录失败', 'error');
      return;
    }

    authToken = data.data.token;
    currentUser = { id: data.data.id, email: data.data.email, plan: data.data.plan || 'free' };
    localStorage.setItem('token', authToken);
    localStorage.setItem('user', JSON.stringify(currentUser));

    hideModal('loginModal');
    updateUI(true);
    showNotification('登录成功！');

    if (isDashboard) {
      loadDashboard();
    } else {
      loadRecentLinks();
    }
  } catch (err) {
    showNotification('网络错误，请稍后重试', 'error');
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}

async function handleRegister(e) {
  if (e && e.preventDefault) e.preventDefault();
  const form = e?.target || document.querySelector('#registerModal');
  const email = form.querySelector('input[type="email"]').value;
  const password = form.querySelectorAll('input[type="password"]')[0]?.value;
  const confirmPassword = form.querySelectorAll('input[type="password"]')[1]?.value;

  if (!email || !password) {
    showNotification('请填写邮箱和密码', 'error');
    return;
  }
  if (password.length < 6) {
    showNotification('密码至少6位', 'error');
    return;
  }
  if (password !== confirmPassword) {
    showNotification('两次密码不一致', 'error');
    return;
  }

  const btn = form.querySelector('button[type="submit"]');
  const origText = btn.textContent;
  btn.textContent = '注册中...';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      showNotification(data.error || '注册失败', 'error');
      return;
    }

    authToken = data.data.token;
    currentUser = { id: data.data.id, email: data.data.email, plan: data.data.plan || 'free' };
    localStorage.setItem('token', authToken);
    localStorage.setItem('user', JSON.stringify(currentUser));

    hideModal('registerModal');
    updateUI(true);
    showNotification('注册成功！欢迎使用短链工厂');
  } catch (err) {
    showNotification('网络错误，请稍后重试', 'error');
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  updateUI(false);
  showNotification('已退出登录');

  if (isDashboard) {
    window.location.href = '../index.html';
  }
}

// ========================================
// 短链接功能 - 需登录
// ========================================
async function shortenUrl() {
  if (!authToken) {
    showModal('loginModal');
    return;
  }

  const input = document.getElementById('longUrl');
  const longUrl = input.value.trim();

  if (!longUrl) {
    showNotification('请输入链接', 'error');
    return;
  }

  if (!isValidUrl(longUrl)) {
    showNotification('请输入有效的URL（以 http:// 或 https:// 开头）', 'error');
    return;
  }

  const btn = document.querySelector('.shorten-box .btn');
  const originalText = btn.textContent;
  btn.textContent = '生成中...';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/shorten`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ url: longUrl }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401) {
        showNotification('登录已过期，请重新登录', 'error');
        logout();
        if (!isDashboard) showModal('loginModal');
        return;
      }
      showNotification(data.error || '生成失败', 'error');
      return;
    }

    const resultBox = document.getElementById('resultBox');
    const shortUrlEl = document.getElementById('shortUrl');
    shortUrlEl.textContent = data.data.short_url;
    resultBox.style.display = 'block';
    resultBox.scrollIntoView({ behavior: 'smooth' });

    input.value = '';
    loadRecentLinks();
    showNotification('短链接已生成！');
  } catch (err) {
    showNotification('网络错误', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function isValidUrl(str) {
  try { const u = new URL(str); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

async function loadRecentLinks() {
  const container = document.getElementById('recentLinks');
  if (!container) return;

  if (!authToken) {
    container.innerHTML = '<p style="color:#64748B;text-align:center;padding:20px;">登录后可查看历史记录</p>';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/links`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
    const data = await res.json();

    if (!res.ok || !data.data?.length) {
      container.innerHTML = '<p style="color:#64748B;text-align:center;padding:20px;">暂无短链接</p>';
      return;
    }

    container.innerHTML = data.data.slice(0, 10).map(link => `
      <div class="link-item">
        <div class="link-info">
          <a href="${link.short_url}" target="_blank" class="short-link">${link.short_url.replace(/^https?:\/\//, '')}</a>
          <span class="long-url">${truncateUrl(link.long_url)}</span>
          <span class="link-meta">点击: ${link.clicks} | ${link.created_at || ''}</span>
        </div>
        <div class="link-actions">
          <button onclick="copyToClipboard('${link.short_url}')" class="btn btn-outline btn-sm">复制</button>
        </div>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<p style="color:#64748B;text-align:center;padding:20px;">加载失败</p>';
  }
}

function truncateUrl(url, maxLen = 50) {
  return url?.length > maxLen ? url.substring(0, maxLen) + '...' : url;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => showNotification('已复制！')).catch(() => {
    const ta = document.createElement('textarea'); ta.value = text;
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); showNotification('已复制！');
  });
}

function copyShortUrl() {
  const el = document.getElementById('shortUrl');
  if (el) copyToClipboard(el.textContent);
}

// ========================================
// Dashboard页面逻辑
// ========================================
async function loadDashboard() {
  if (!authToken) return;

  try {
    // 并行加载用户信息和链接列表
    const [userRes, linksRes] = await Promise.all([
      fetch(`${API_BASE}/api/me`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
      fetch(`${API_BASE}/api/links`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
    ]);

    // 处理用户信息
    if (userRes.ok) {
      const userData = await userRes.json();
      if (userData.data) {
        currentUser = { ...currentUser, ...userData.data };
        localStorage.setItem('user', JSON.stringify(currentUser));
      }
    }

    // 更新Dashboard统计卡片
    if (linksRes.ok) {
      const linksData = await linksRes.json();
      const links = linksData.data || [];

      const totalLinksEl = document.getElementById('totalLinks');
      const totalClicksEl = document.getElementById('totalClicks');
      const todayClicksEl = document.getElementById('todayClicks');

      if (totalLinksEl) totalLinksEl.textContent = links.length;
      if (totalClicksEl) totalClicksEl.textContent = links.reduce((sum, l) => sum + (l.clicks || 0), 0).toLocaleString();
      if (todayClicksEl) {
        const today = new Date().toISOString().split('T')[0];
        const todayClicks = links.reduce((sum, l) => {
          if (l.created_at && l.created_at.startsWith(today)) return sum + (l.clicks || 0);
          return sum;
        }, 0);
        todayClicksEl.textContent = todayClicks.toLocaleString();
      }

      // 渲染链接表格
      renderDashboardLinks(links);

      // 显示用量进度条
      renderUsageBar(links.length);
    }
  } catch (err) {
    showNotification('加载数据失败', 'error');
  }
}

function renderDashboardLinks(links) {
  const tableBody = document.querySelector('.links-table');
  if (!tableBody) return;

  // 保留表头，清除旧的行
  const header = tableBody.querySelector('.table-header');
  tableBody.innerHTML = '';
  if (header) tableBody.appendChild(header);

  if (!links.length) {
    const emptyRow = document.createElement('div');
    emptyRow.style.cssText = 'padding:40px;text-align:center;color:#64748B;';
    emptyRow.textContent = '暂无短链接，点击上方按钮创建';
    tableBody.appendChild(emptyRow);
    return;
  }

  links.forEach(link => {
    const row = document.createElement('div');
    row.className = 'table-row';
    row.innerHTML = `
      <span><a href="${link.short_url}" target="_blank" class="link-short">${link.code}</a></span>
      <span class="link-long" title="${link.long_url}">${truncateUrl(link.long_url, 40)}</span>
      <span>${link.clicks || 0}</span>
      <span>${link.created_at ? link.created_at.split('T')[0] : '-'}</span>
      <span>
        <button class="btn btn-outline btn-sm" onclick="copyToClipboard('${link.short_url}')">复制</button>
        <button class="btn btn-outline btn-sm" style="margin-left:4px;color:#EF4444;border-color:#EF4444;" onclick="deleteLink('${link.code}')">删除</button>
      </span>
    `;
    tableBody.appendChild(row);
  });
}

function renderUsageBar(used) {
  const plan = currentUser?.plan || 'free';
  const limit = PLAN_LIMITS[plan] ?? 5;
  const planName = PLAN_NAMES[plan] || '免费版';
  const isUnlimited = limit === Infinity;
  const pct = isUnlimited ? 10 : Math.min((used / limit) * 100, 100);
  const barColor = pct >= 90 ? '#EF4444' : pct >= 70 ? '#F59E0B' : '#10B981';

  // 查找或创建用量容器
  let usageContainer = document.getElementById('usageBar');
  if (!usageContainer) {
    usageContainer = document.createElement('div');
    usageContainer.id = 'usageBar';
    usageContainer.style.cssText = 'margin-bottom:30px;padding:20px;background:#1e293b;border:1px solid #334155;border-radius:12px;';
    const statsGrid = document.querySelector('.stats-grid');
    if (statsGrid) statsGrid.parentNode.insertBefore(usageContainer, statsGrid);
  }

  usageContainer.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span style="font-size:14px;color:#E2E8F0;">📊 ${planName} · 用量</span>
      <span style="font-size:13px;color:#94A3B8;">${used} / ${isUnlimited ? '∞' : limit} 条短链</span>
    </div>
    <div style="background:#334155;border-radius:6px;height:8px;overflow:hidden;">
      <div style="width:${pct}%;height:100%;background:${barColor};border-radius:6px;transition:width 0.5s ease;"></div>
    </div>
    ${!isUnlimited && pct >= 80 ? '<p style="margin-top:8px;font-size:12px;color:#F59E0B;">⚠️ 用量即将用完，<a href="billing.html" style="color:#0EA5E9;">升级套餐</a>获取更多额度</p>' : ''}
  `;
}

async function deleteLink(code) {
  if (!confirm(`确定删除短链 "${code}" 吗？此操作不可恢复。`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/links/${code}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` },
    });

    if (!res.ok) {
      const data = await res.json();
      showNotification(data.error || '删除失败', 'error');
      return;
    }

    showNotification('已删除');
    loadDashboard();
  } catch (err) {
    showNotification('网络错误', 'error');
  }
}

// ========================================
// 弹窗控制
// ========================================
function showModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
}

function hideModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }
}

function switchModal(from, to) {
  hideModal(from);
  setTimeout(() => showModal(to), 200);
}

// ESC关闭弹窗
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.show').forEach(m => {
      m.classList.remove('show');
    });
    document.body.style.overflow = '';
  }
});

// 点击遮罩关闭弹窗 + 点击外部关闭下拉菜单
document.addEventListener('click', (e) => {
  // 关闭下拉菜单
  if (!e.target.closest('.user-menu')) {
    document.getElementById('dropdown')?.classList.remove('show');
  }
  // 点击遮罩关闭弹窗
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('show');
    document.body.style.overflow = '';
  }
});

// ========================================
// 通知
// ========================================
function showNotification(msg, type = 'success') {
  const div = document.createElement('div');
  div.textContent = msg;

  const bgColor = type === 'error' ? '#DC2626' : '#059669';
  const icon = type === 'error' ? '✕' : '✓';

  div.style.cssText = `
    position:fixed;top:90px;right:24px;padding:16px 24px;
    background:${bgColor};color:white;
    border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.4);
    z-index:10000;font-size:14px;font-weight:500;
    animation:slideIn 0.3s ease;
    display:flex;align-items:center;gap:8px;
    border:1px solid ${type === 'error' ? '#EF4444' : '#10B981'};
  `;
  div.innerHTML = `<span style="font-weight:700;">${icon}</span> ${msg}`;
  document.body.appendChild(div);
  setTimeout(() => {
    div.style.opacity = '0';
    div.style.transition = '0.3s';
    setTimeout(() => div.remove(), 300);
  }, 3000);
}

// ========================================
// 导航栏
// ========================================
function setupScrollEffect() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
      navbar.style.borderBottomColor = 'rgba(255,255,255,0.05)';
    } else {
      navbar.style.boxShadow = 'none';
      navbar.style.borderBottomColor = '';
    }
  });
}

function toggleDropdown() {
  document.getElementById('dropdown')?.classList.toggle('show');
}

// HTML onclick调用的兼容函数
function handleShorten() { shortenUrl(); }
function handlePlan(plan) {
  if (!authToken) { showModal('loginModal'); return; }
  showNotification('套餐升级功能即将上线');
}
function copyResult() { copyShortUrl(); }
function isLoggedIn() { return !!authToken; }

// ========================================
// 动画样式注入
// ========================================
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  .link-item {
    display:flex; align-items:center; justify-content:space-between;
    padding:14px 16px; background:#1e293b; border:1px solid #334155;
    border-radius:10px; margin-bottom:8px; transition: border-color 0.2s;
  }
  .link-item:hover { border-color: #475569; }
  .link-info { display:flex; flex-direction:column; gap:4px; }
  .short-link { color:#0EA5E9; font-weight:600; font-size:15px; text-decoration:none; }
  .short-link:hover { text-decoration:underline; color:#38BDF8; }
  .long-url { color:#94A3B8; font-size:13px; }
  .link-meta { color:#64748B; font-size:12px; }
  .link-actions { display:flex; gap:8px; }
  .modal.show { display:flex; }
`;
document.head.appendChild(style);
