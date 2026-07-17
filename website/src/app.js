import './style.css';

// ── Telegram WebApp Init ──────────────────────────────────────────
// Ждём полной загрузки страницы перед инициализацией TG SDK
function getTg() {
  return window.Telegram?.WebApp || null;
}

const tg = getTg();
const initData = tg?.initData || '';

if (tg) {
  tg.ready();
  tg.expand();
}

// ── API ───────────────────────────────────────────────────────────
const API_BASE = '/api';

async function apiRequest(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': initData,
    ...options.headers
  };

  try {
    const response = await fetch(url, { ...options, headers });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Ошибка ${response.status}`);
    return data;
  } catch (error) {
    console.error(`API Error (${path}):`, error);
    showToast(error.message || 'Ошибка запроса', 'error');
    throw error;
  }
}

// ── DOM refs ──────────────────────────────────────────────────────
const elUserAvatar   = document.getElementById('user-avatar');
const elUserName     = document.getElementById('user-name');
const elUserStatus   = document.getElementById('user-status');

const elStatRequests = document.getElementById('stat-requests');
const elStatTokens   = document.getElementById('stat-tokens');
const elStatTokensUnit = document.getElementById('stat-tokens-unit');

const elToggleAutoReply = document.getElementById('toggle-autoreply');
const elSelectProvider  = document.getElementById('select-provider');
const elInputModel      = document.getElementById('input-model');
const elInputMaxChars   = document.getElementById('input-max-chars');
const elInputCooldown   = document.getElementById('input-cooldown');
const elBtnSaveSettings = document.getElementById('btn-save-settings');

const elInputPostUrl   = document.getElementById('input-post-url');
const elBtnGenerateLink= document.getElementById('btn-generate-link');
const elTextareaPost   = document.getElementById('textarea-post');
const elBtnReformat    = document.getElementById('btn-reformat');
const elBtnPreview     = document.getElementById('btn-preview');
const elPreviewContainer = document.getElementById('preview-container');
const elPreviewBox     = document.getElementById('preview-box');
const elBtnPublish     = document.getElementById('btn-publish');

const elNavDashboard  = document.getElementById('nav-dashboard');
const elNavComposer   = document.getElementById('nav-composer');
const elSecDashboard  = document.getElementById('section-dashboard');
const elSecComposer   = document.getElementById('section-composer');

const elToast     = document.getElementById('toast');
const elToastText = document.getElementById('toast-text');

// ── Toast ─────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(text, type = 'info') {
  elToastText.textContent = text;
  elToast.className = `toast ${type} show`;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elToast.classList.remove('show');
  }, 3000);

  if (tg?.HapticFeedback) {
    if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
    else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
    else tg.HapticFeedback.impactOccurred('light');
  }
}

// ── User info ─────────────────────────────────────────────────────
function initUserInfo() {
  // Пробуем получить TG ещё раз — на случай если SDK загрузился позже
  const tgNow = getTg();

  if (tgNow && tgNow.initDataUnsafe?.user) {
    const user = tgNow.initDataUnsafe.user;
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
    elUserName.textContent = fullName || 'Администратор';
    elUserStatus.textContent = user.username ? `@${user.username}` : `ID: ${user.id}`;
    elUserAvatar.textContent = (user.first_name || 'A').charAt(0).toUpperCase();
    // Разворачиваем Mini App на весь экран
    if (!tg) { tgNow.ready(); tgNow.expand(); }
  } else if (tgNow) {
    // Telegram открыт, но user не передан (редкий случай)
    elUserName.textContent = 'Администратор';
    elUserStatus.textContent = 'Telegram Mini App';
    elUserAvatar.textContent = '👤';
  } else {
    // Браузер — показываем нейтральное, не пугающее название
    elUserName.textContent = 'Панель управления';
    elUserStatus.textContent = 'Браузерный режим';
    elUserAvatar.textContent = '🛡';
  }
}

// ── Load status ───────────────────────────────────────────────────
async function loadStatus() {
  try {
    const data = await apiRequest('/status');

    // Stats
    const requests = data.usage?.requests ?? 0;
    const totalTokens = data.usage?.totalTokens ?? 0;

    elStatRequests.textContent = requests;

    if (totalTokens >= 1000) {
      elStatTokens.textContent = (totalTokens / 1000).toFixed(1);
      elStatTokensUnit.textContent = 'k';
    } else {
      elStatTokens.textContent = totalTokens;
      elStatTokensUnit.textContent = '';
    }

    // Settings form
    elToggleAutoReply.checked = Boolean(data.autoReplyEnabled);
    elSelectProvider.value    = data.llmProvider || 'gemini';
    elInputModel.value        = data.activeLlmModel || '';
    elInputMaxChars.value     = data.maxReplyChars || '';
    elInputCooldown.value     = data.threadCooldownMs ? Math.round(data.threadCooldownMs / 1000) : '';

    // Обновляем шапку из данных API (если TG не дал user)
    const tgNow = getTg();
    if (!tgNow?.initDataUnsafe?.user && data.user) {
      const u = data.user;
      if (u.username && u.username !== 'dev_admin') {
        elUserName.textContent = u.first_name || u.username || 'Администратор';
        elUserAvatar.textContent = (u.first_name || u.username || 'A').charAt(0).toUpperCase();
      }
    }

    // Channel status — показываем в подзаголовке
    const channelSuffix = data.hasChannel
      ? `Канал: ···${String(data.channelChatId).slice(-4)}`
      : 'Канал не подключён';

    // Только если статус ещё не обновлён из TG профиля
    const currentStatus = elUserStatus.textContent;
    if (!currentStatus.startsWith('@') && !currentStatus.startsWith('ID:')) {
      elUserStatus.textContent = channelSuffix;
    }

  } catch (err) {
    // Toast уже показан внутри apiRequest
  }
}

// ── Save settings ─────────────────────────────────────────────────
async function saveSettings() {
  const payload = {
    autoReplyEnabled: elToggleAutoReply.checked,
    llmProvider:      elSelectProvider.value,
    activeLlmModel:   elInputModel.value.trim(),
    maxReplyChars:    Number(elInputMaxChars.value),
    threadCooldownMs: Number(elInputCooldown.value) * 1000
  };

  setLoading(elBtnSaveSettings, true, 'Сохраняю...');

  try {
    const res = await apiRequest('/settings', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.ok) showToast('Настройки сохранены!', 'success');
  } finally {
    setLoading(elBtnSaveSettings, false, 'Сохранить настройки', 'save');
  }
}

// ── Generate post from URL ────────────────────────────────────────
async function generatePostFromLink() {
  const url = elInputPostUrl.value.trim();
  if (!url) { showToast('Введите ссылку', 'error'); return; }

  setLoading(elBtnGenerateLink, true, '...');

  try {
    const res = await apiRequest('/generate-post', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
    if (res.generated) {
      elTextareaPost.value = res.generated;
      showToast('Пост сгенерирован!', 'success');
      renderPreview(res.generated);
    }
  } finally {
    setLoading(elBtnGenerateLink, false, 'ИИ', 'wand-sparkles');
  }
}

// ── Reformat post ─────────────────────────────────────────────────
async function reformatPost() {
  const text = elTextareaPost.value.trim();
  if (!text) { showToast('Напишите черновик', 'error'); return; }

  setLoading(elBtnReformat, true, 'Форматирую...');

  try {
    const res = await apiRequest('/reformat-post', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    if (res.reformatted) {
      elTextareaPost.value = res.reformatted;
      showToast('Отформатировано!', 'success');
      renderPreview(res.reformatted);
    }
  } finally {
    setLoading(elBtnReformat, false, 'ИИ-стиль', 'wand-2');
  }
}

// ── Publish ───────────────────────────────────────────────────────
async function publishPost() {
  const text = elTextareaPost.value.trim();
  if (!text) { showToast('Текст поста пуст', 'error'); return; }

  const doPublish = async () => {
    setLoading(elBtnPublish, true, 'Публикую...');
    try {
      const res = await apiRequest('/publish', {
        method: 'POST',
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        showToast('Опубликовано! 🎉', 'success');
        elTextareaPost.value = '';
        elPreviewContainer.style.display = 'none';
        if (tg?.openTelegramLink && res.postLink) tg.openTelegramLink(res.postLink);
      }
    } finally {
      setLoading(elBtnPublish, false, 'Опубликовать в канал', 'send');
    }
  };

  if (tg?.showConfirm) {
    tg.showConfirm('Опубликовать этот пост в канал прямо сейчас?', (ok) => { if (ok) doPublish(); });
  } else {
    if (confirm('Опубликовать пост в канал?')) doPublish();
  }
}

// ── Preview ───────────────────────────────────────────────────────
function renderPreview(text) {
  if (!text?.trim()) { elPreviewContainer.style.display = 'none'; return; }
  elPreviewBox.innerHTML = markdownToHtml(text);
  elPreviewContainer.style.display = 'block';
  elPreviewContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function markdownToHtml(md) {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/^###\s+(.+)$/gm, '<strong>$1</strong>');
  html = html.replace(/^##\s+(.+)$/gm, '<strong>$1</strong>');
  html = html.replace(/^#\s+(.+)$/gm, '<strong>$1</strong>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  html = html.replace(/__([^_]+)__/g, '<b>$1</b>');
  html = html.replace(/\*([^*]+)\*/g, '<i>$1</i>');
  html = html.replace(/_([^_]+)_/g, '<i>$1</i>');
  html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.3);border-radius:4px;padding:1px 5px;font-size:13px;">$1</code>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    const trimmedUrl = url.trim();
    const lowerUrl = trimmedUrl.toLowerCase();
    const isSafe = lowerUrl.startsWith('http://') || lowerUrl.startsWith('https://');
    if (!isSafe) {
      return `<a href="#" target="_blank" rel="noopener noreferrer" style="color:#7dd3fc;text-decoration:underline;">${text}</a>`;
    }
    const escapedUrl = trimmedUrl
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" style="color:#7dd3fc;text-decoration:underline;">${text}</a>`;
  });
  html = html.replace(/^[*-]\s+(.+)$/gm, '• $1');

  return html;
}

// ── Tabs ──────────────────────────────────────────────────────────
function switchTab(tab) {
  if (tab === 'dashboard') {
    elSecDashboard.className = 'section active';
    elSecComposer.className  = 'section';
    elNavDashboard.className = 'nav-btn active';
    elNavComposer.className  = 'nav-btn';
  } else {
    elSecComposer.className  = 'section active';
    elSecDashboard.className = 'section';
    elNavComposer.className  = 'nav-btn active';
    elNavDashboard.className = 'nav-btn';
  }
  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

// ── Helper: loading state ─────────────────────────────────────────
function setLoading(btn, isLoading, label, iconName) {
  btn.disabled = isLoading;
  if (isLoading) {
    btn.innerHTML = `<div class="spinner"></div> <span>${label}</span>`;
  } else {
    const iconHtml = iconName ? `<i data-lucide="${iconName}"></i> ` : '';
    btn.innerHTML = `${iconHtml}<span>${label}</span>`;
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }
}

// ── Events ────────────────────────────────────────────────────────
elNavDashboard.addEventListener('click', () => switchTab('dashboard'));
elNavComposer.addEventListener('click',  () => switchTab('composer'));
elBtnSaveSettings.addEventListener('click', saveSettings);
elBtnGenerateLink.addEventListener('click', generatePostFromLink);
elBtnReformat.addEventListener('click', reformatPost);
elBtnPreview.addEventListener('click', () => renderPreview(elTextareaPost.value));
elBtnPublish.addEventListener('click', publishPost);

// ── Init ──────────────────────────────────────────────────────────
initUserInfo();
loadStatus();
