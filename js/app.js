// ========================================
// 短链工厂 - 核心逻辑 v4 (真实用户系统)
// ========================================

const API_BASE = '';

// 用户状态
let currentUser = null;
let authToken = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadAuth();
  setupScrollEffect();
  loadRecentLinks();
});

// ========================================
// 认证功能 - 真实API
// ========================================
function loadAuth() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  if (token && user) {
    authToken = token;
    currentUser = JSON.parse(user);
    updateUI(true);
  }
}

function updateUI(loggedIn) {
  const authBtns = document.getElementById('authBtns');
  const userMenu = document.getElementById('userMenu');
  const userName = document.getElementById('userName');
  if (authBtns) authBtns.style.display = loggedIn ? 'none' : 'flex';
  if (userMenu) userMenu.style.display = loggedIn ? 'block' : 'none';
  if (userName && currentUser) userName.textContent = currentUser.email.split('@')[0];
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.querySelector('input[type="email"]').value;
  const password = form.querySelector('input[type="password"]').value;

  if (!email || !password) {
    showNotification('请填写邮箱和密码', 'error');
    return;
  }

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
    currentUser = { id: data.data.id, email: data.data.email, plan: data.data.plan };
    localStorage.setItem('token', authToken);
    localStorage.setItem('user', JSON.stringify(currentUser));

    hideModal('loginModal');
    updateUI(true);
    showNotification('登录成功！');
    loadRecentLinks();
  } catch (err) {
    showNotification('网络错误', 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const form = e.target;
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
    currentUser = { id: data.data.id, email: data.data.email, plan: data.data.plan };
    localStorage.setItem('token', authToken);
    localStorage.setItem('user', JSON.stringify(currentUser));

    hideModal('registerModal');
    updateUI(true);
    showNotification('注册成功！欢迎使用短链工厂');
  } catch (err) {
    showNotification('网络错误', 'error');
  }
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  updateUI(false);
  showNotification('已退出登录');
}

// ========================================
// 短链接功能 - 需登录
// ========================================
async function shortenUrl() {
  if (!authToken) {
    showNotification('请先登录', 'error');
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
        showModal('loginModal');
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

    saveToLocalHistory(data.data);
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

function saveToLocalHistory(linkData) {
  let links = JSON.parse(localStorage.getItem('links') || '[]');
  links = links.filter(l => l.code !== linkData.code);
  links.unshift({ code: linkData.code, short_url: linkData.short_url, long_url: linkData.long_url, clicks: 0 });
  localStorage.setItem('links', JSON.stringify(links.slice(0, 50)));
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

    container.innerHTML = data.data.map(link => `
      <div class="link-item">
        <div class="link-info">
          <a href="https://shortlink.yhstar.xin/${link.code}" target="_blank" class="short-link">shortlink.yhstar.xin/${link.code}</a>
          <span class="long-url">${truncateUrl(link.long_url)}</span>
          <span class="link-meta">点击: ${link.clicks} | ${link.created_at || ''}</span>
        </div>
        <div class="link-actions">
          <button onclick="copyToClipboard('https://shortlink.yhstar.xin/${link.code}')" class="btn btn-outline btn-sm">复制</button>
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
  copyToClipboard(document.getElementById('shortUrl').textContent);
}

// ========================================
// 弹窗控制
// ========================================
function showModal(id) { document.getElementById(id)?.classList.add('show'); }
function hideModal(id) { document.getElementById(id)?.classList.remove('show'); }
function switchModal(from, to) { hideModal(from); setTimeout(() => showModal(to), 200); }
function toggleDropdown() { document.getElementById('dropdown')?.classList.toggle('show'); }

document.addEventListener('click', (e) => {
  if (!e.target.closest('.user-menu')) document.getElementById('dropdown')?.classList.remove('show');
  if (e.target.classList.contains('modal')) e.target.classList.remove('show');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
});

// ========================================
// 通知
// ========================================
function showNotification(msg, type = 'success') {
  const div = document.createElement('div');
  div.textContent = msg;
  div.style.cssText = `
    position:fixed;top:90px;right:24px;padding:16px 24px;
    background:${type === 'error' ? '#EF4444' : '#10B981'};color:white;
    border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);
    z-index:10000;font-size:14px;font-weight:500;
    animation:slideIn 0.3s ease;
  `;
  document.body.appendChild(div);
  setTimeout(() => { div.style.opacity = '0'; div.style.transition = '0.3s'; setTimeout(() => div.remove(), 300); }, 3000);
}

// ========================================
// 滚动效果
// ========================================
function setupScrollEffect() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    navbar.style.boxShadow = window.scrollY > 50 ? '0 4px 20px rgba(0,0,0,0.1)' : 'none';
  });
}

// 回车提交
document.getElementById('longUrl')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') shortenUrl();
});

// 动画样式
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  .link-item { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; background:white; border:1px solid #E2E8F0; border-radius:8px; margin-bottom:8px; }
  .link-info { display:flex; flex-direction:column; gap:4px; }
  .short-link { color:#0EA5E9; font-weight:600; font-size:15px; text-decoration:none; }
  .short-link:hover { text-decoration:underline; }
  .long-url { color:#64748B; font-size:13px; }
  .link-meta { color:#94A3B8; font-size:12px; }
  .link-actions { display:flex; gap:8px; }
`;
document.head.appendChild(style);
