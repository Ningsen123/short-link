// ========================================
// 短链工厂 - 核心逻辑 v3 (对接Worker API)
// ========================================

// API 基础地址（Cloudflare Pages同域，无需配置）
const API_BASE = '';

// 用户状态
let currentUser = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  setupScrollEffect();
  loadRecentLinks();
});

// ========================================
// 认证功能 (localStorage模拟，后续可接入真实认证)
// ========================================
function checkAuth() {
  const user = localStorage.getItem('user');
  if (user) {
    currentUser = JSON.parse(user);
    const authBtns = document.getElementById('authBtns');
    const userMenu = document.getElementById('userMenu');
    if (authBtns) authBtns.style.display = 'none';
    if (userMenu) userMenu.style.display = 'block';
  }
}

function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.querySelector('input[type="email"]').value;
  currentUser = { email, name: email.split('@')[0] };
  localStorage.setItem('user', JSON.stringify(currentUser));
  hideModal('loginModal');
  checkAuth();
  showNotification('登录成功！');
}

function handleRegister(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.querySelector('input[type="email"]').value;
  currentUser = { email, name: email.split('@')[0] };
  localStorage.setItem('user', JSON.stringify(currentUser));
  hideModal('registerModal');
  checkAuth();
  showNotification('注册成功！欢迎使用短链工厂');
}

function logout() {
  currentUser = null;
  localStorage.removeItem('user');
  const authBtns = document.getElementById('authBtns');
  const userMenu = document.getElementById('userMenu');
  if (authBtns) authBtns.style.display = 'flex';
  if (userMenu) userMenu.style.display = 'none';
  showNotification('已退出登录');
}

// ========================================
// 短链接功能 - 对接Worker API
// ========================================
async function shortenUrl() {
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: longUrl }),
    });

    const data = await res.json();

    if (!res.ok) {
      showNotification(data.error || '生成失败', 'error');
      return;
    }

    // 显示结果
    const resultBox = document.getElementById('resultBox');
    const shortUrlEl = document.getElementById('shortUrl');
    shortUrlEl.textContent = data.data.short_url;
    resultBox.style.display = 'block';
    resultBox.scrollIntoView({ behavior: 'smooth' });

    // 保存到本地历史
    saveToLocalHistory(data.data);

    // 刷新历史列表
    loadRecentLinks();

    showNotification('短链接已生成！');

  } catch (err) {
    showNotification('网络错误，请检查后端是否启动', 'error');
    console.error(err);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function saveToLocalHistory(linkData) {
  let links = JSON.parse(localStorage.getItem('links') || '[]');
  // 去重
  links = links.filter(l => l.code !== linkData.code);
  links.unshift({
    code: linkData.code,
    short_url: linkData.short_url,
    long_url: linkData.long_url,
    clicks: 0,
    created_at: linkData.created_at,
  });
  // 最多保留50条
  localStorage.setItem('links', JSON.stringify(links.slice(0, 50)));
}

function loadRecentLinks() {
  const container = document.getElementById('recentLinks');
  if (!container) return;

  const links = JSON.parse(localStorage.getItem('links') || '[]');

  if (links.length === 0) {
    container.innerHTML = '<p style="color:#64748B;text-align:center;padding:20px;">暂无历史记录</p>';
    return;
  }

  container.innerHTML = links.slice(0, 10).map(link => `
    <div class="link-item">
      <div class="link-info">
        <a href="${link.short_url}" target="_blank" class="short-link">${link.short_url}</a>
        <span class="long-url">${truncateUrl(link.long_url)}</span>
      </div>
      <div class="link-actions">
        <button onclick="copyToClipboard('${link.short_url}')" class="btn btn-outline btn-sm">复制</button>
      </div>
    </div>
  `).join('');
}

function truncateUrl(url, maxLen = 50) {
  return url.length > maxLen ? url.substring(0, maxLen) + '...' : url;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showNotification('已复制到剪贴板！');
  }).catch(() => {
    // fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showNotification('已复制到剪贴板！');
  });
}

function copyShortUrl() {
  const url = document.getElementById('shortUrl').textContent;
  copyToClipboard(url);
}

// ========================================
// 弹窗控制
// ========================================
function showModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('show');
}

function hideModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('show');
}

function switchModal(from, to) {
  hideModal(from);
  setTimeout(() => showModal(to), 200);
}

function toggleDropdown() {
  const dropdown = document.getElementById('dropdown');
  if (dropdown) dropdown.classList.toggle('show');
}

// 点击外部关闭弹窗/下拉
document.addEventListener('click', (e) => {
  // 关闭下拉菜单
  if (!e.target.closest('.user-menu')) {
    const dropdown = document.getElementById('dropdown');
    if (dropdown) dropdown.classList.remove('show');
  }
  // 关闭弹窗（点击遮罩）
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('show');
  }
});

// ESC关闭弹窗
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
  }
});

// ========================================
// 通知
// ========================================
function showNotification(msg, type = 'success') {
  const div = document.createElement('div');
  div.className = `notification ${type}`;
  div.textContent = msg;
  div.style.cssText = `
    position: fixed; top: 90px; right: 24px; padding: 16px 24px;
    background: ${type === 'error' ? '#EF4444' : '#10B981'}; color: white;
    border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000; animation: slideIn 0.3s ease;
    font-size: 14px; font-weight: 500;
  `;
  document.body.appendChild(div);
  setTimeout(() => {
    div.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => div.remove(), 300);
  }, 3000);
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

// ========================================
// 回车提交
// ========================================
document.getElementById('longUrl')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    shortenUrl();
  }
});

// ========================================
// 注入动画样式
// ========================================
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
  
  .link-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; background: white; border: 1px solid #E2E8F0;
    border-radius: 8px; margin-bottom: 8px;
  }
  .link-info { display: flex; flex-direction: column; gap: 4px; }
  .short-link { color: #0EA5E9; font-weight: 600; font-size: 15px; text-decoration: none; }
  .short-link:hover { text-decoration: underline; }
  .long-url { color: #64748B; font-size: 13px; }
  .link-actions { display: flex; gap: 8px; }
`;
document.head.appendChild(style);
