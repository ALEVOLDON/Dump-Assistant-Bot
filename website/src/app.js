import './style.css';

// ── Telegram WebApp Init ──────────────────────────────────────────
function getTg() {
  return window.Telegram?.WebApp || null;
}

function getInitData() {
  const tgNow = getTg();
  return tgNow?.initData || '';
}

const tg = getTg();

if (tg) {
  try {
    tg.ready();
    tg.expand();
  } catch (e) {}
}

// ── i18n Dictionary ──────────────────────────────────────────────
const APP_TRANSLATIONS = {
  en: {
    app_title: 'Dump Assistant — Admin Panel',
    user_status_loading: 'Loading...',
    user_status_admin: 'Administrator',
    user_status_tg_app: 'Telegram Mini App',
    user_status_browser: 'Browser Mode',
    user_name_browser: 'Admin Panel',
    channel_connected: 'Channel: ···',
    channel_not_connected: 'Channel not connected',
    stat_requests: 'AI Requests',
    stat_requests_unit: 'req',
    stat_tokens: 'Tokens',
    sec_bot_mode: 'Bot Mode',
    toggle_autoreply_title: 'Auto-replies',
    toggle_autoreply_desc: 'Reply to posts and comments',
    sec_ai_settings: 'AI Settings',
    field_provider: 'Provider',
    field_model: 'Model',
    field_max_chars: 'Max Characters',
    field_cooldown: 'Cooldown (sec)',
    btn_save_settings: 'Save Settings',
    btn_saving: 'Saving...',
    toast_settings_saved: 'Settings saved!',
    sec_post_from_link: 'Post from Link',
    btn_generate_link: 'AI',
    sec_post_editor: 'Post Editor',
    placeholder_post_draft: 'Write post text...',
    placeholder_post_url: 'https://example.com/article',
    placeholder_custom_model: 'Enter model name...',
    btn_reformat: 'AI Style',
    btn_reformatting: 'Formatting...',
    toast_reformatted: 'Formatted!',
    btn_preview: 'Preview',
    label_telegram_preview: 'Telegram Preview',
    btn_publish: 'Publish to Channel',
    btn_publishing: 'Publishing...',
    toast_published: 'Published! 🎉',
    confirm_publish: 'Publish this post to the channel now?',
    toast_post_empty: 'Post text is empty',
    toast_enter_url: 'Enter a link',
    toast_write_draft: 'Write a draft first',
    toast_post_generated: 'Post generated!',
    nav_dashboard: 'Dashboard',
    nav_composer: 'Composer',
    provider_gemini: '🟣 Google Gemini',
    provider_openai: '🟢 OpenAI / Grok / OpenRouter',
    provider_ollama: '🔵 Ollama (Local)'
  },
  ru: {
    app_title: 'Dump Assistant — Панель управления',
    user_status_loading: 'Загрузка...',
    user_status_admin: 'Администратор',
    user_status_tg_app: 'Telegram Mini App',
    user_status_browser: 'Браузерный режим',
    user_name_browser: 'Панель управления',
    channel_connected: 'Канал: ···',
    channel_not_connected: 'Канал не подключён',
    stat_requests: 'Запросы ИИ',
    stat_requests_unit: 'раз',
    stat_tokens: 'Токены',
    sec_bot_mode: 'Режим бота',
    toggle_autoreply_title: 'Автоответы',
    toggle_autoreply_desc: 'Отвечать на посты и комментарии',
    sec_ai_settings: 'Настройки ИИ',
    field_provider: 'Провайдер',
    field_model: 'Модель',
    field_max_chars: 'Макс. символов',
    field_cooldown: 'Кулдаун (сек)',
    btn_save_settings: 'Сохранить настройки',
    btn_saving: 'Сохраняю...',
    toast_settings_saved: 'Настройки сохранены!',
    sec_post_from_link: 'Пост из ссылки',
    btn_generate_link: 'ИИ',
    sec_post_editor: 'Редактор поста',
    placeholder_post_draft: 'Напишите текст поста...',
    placeholder_post_url: 'https://example.com/article',
    placeholder_custom_model: 'Введите название модели...',
    btn_reformat: 'ИИ-стиль',
    btn_reformatting: 'Форматирую...',
    toast_reformatted: 'Отформатировано!',
    btn_preview: 'Превью',
    label_telegram_preview: 'Вид в Telegram',
    btn_publish: 'Опубликовать в канал',
    btn_publishing: 'Публикую...',
    toast_published: 'Опубликовано! 🎉',
    confirm_publish: 'Опубликовать этот пост в канал прямо сейчас?',
    toast_post_empty: 'Текст поста пуст',
    toast_enter_url: 'Введите ссылку',
    toast_write_draft: 'Напишите черновик',
    toast_post_generated: 'Пост сгенерирован!',
    nav_dashboard: 'Управление',
    nav_composer: 'Постинг',
    provider_gemini: '🟣 Google Gemini',
    provider_openai: '🟢 OpenAI / Grok / OpenRouter',
    provider_ollama: '🔵 Ollama (локально)'
  }
};

let currentAppLang = localStorage.getItem('app_lang') || 'en';

const MODEL_PRESETS = {
  en: {
    gemini: [
      { value: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite (Recommended / Fast)' },
      { value: 'gemini-3.6-flash', label: 'gemini-3.6-flash' },
      { value: 'gemini-3.5-pro', label: 'gemini-3.5-pro (High Accuracy)' },
      { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
      { value: '__custom__', label: '✏️ Custom Model...' }
    ],
    openai: [
      { value: 'gpt-4o-mini', label: 'gpt-4o-mini (OpenAI Fast)' },
      { value: 'gpt-4o', label: 'gpt-4o (OpenAI Flagship)' },
      { value: 'o3-mini', label: 'o3-mini (OpenAI Reasoning)' },
      { value: 'grok-3-mini', label: 'grok-3-mini (xAI Grok Mini)' },
      { value: 'grok-3', label: 'grok-3 (xAI Grok Flagship)' },
      { value: 'deepseek/deepseek-r1:free', label: 'deepseek/deepseek-r1:free (OpenRouter Free R1)' },
      { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'meta-llama/llama-3.3-70b-instruct:free (OpenRouter Llama 3.3)' },
      { value: '__custom__', label: '✏️ Custom Model...' }
    ],
    ollama: [
      { value: 'qwen2.5:3b-instruct', label: 'qwen2.5:3b-instruct (Standard)' },
      { value: 'qwen2.5:7b-instruct', label: 'qwen2.5:7b-instruct' },
      { value: 'llama3.2:3b', label: 'llama3.2:3b' },
      { value: 'deepseek-r1:1.5b', label: 'deepseek-r1:1.5b (Local R1)' },
      { value: '__custom__', label: '✏️ Custom Model...' }
    ]
  },
  ru: {
    gemini: [
      { value: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite (Рекомендовано / Экономичная)' },
      { value: 'gemini-3.6-flash', label: 'gemini-3.6-flash' },
      { value: 'gemini-3.5-pro', label: 'gemini-3.5-pro (Высокая точность)' },
      { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
      { value: '__custom__', label: '✏️ Свой вариант...' }
    ],
    openai: [
      { value: 'gpt-4o-mini', label: 'gpt-4o-mini (OpenAI Быстрая)' },
      { value: 'gpt-4o', label: 'gpt-4o (OpenAI Флагман)' },
      { value: 'o3-mini', label: 'o3-mini (OpenAI Рассуждения)' },
      { value: 'grok-3-mini', label: 'grok-3-mini (xAI Grok Mini)' },
      { value: 'grok-3', label: 'grok-3 (xAI Grok Flagship)' },
      { value: 'deepseek/deepseek-r1:free', label: 'deepseek/deepseek-r1:free (OpenRouter Free R1)' },
      { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'meta-llama/llama-3.3-70b-instruct:free (OpenRouter Llama 3.3)' },
      { value: '__custom__', label: '✏️ Свой вариант...' }
    ],
    ollama: [
      { value: 'qwen2.5:3b-instruct', label: 'qwen2.5:3b-instruct (Стандарт)' },
      { value: 'qwen2.5:7b-instruct', label: 'qwen2.5:7b-instruct' },
      { value: 'llama3.2:3b', label: 'llama3.2:3b' },
      { value: 'deepseek-r1:1.5b', label: 'deepseek-r1:1.5b (Локальный R1)' },
      { value: '__custom__', label: '✏️ Свой вариант...' }
    ]
  }
};

function t(key) {
  return APP_TRANSLATIONS[currentAppLang]?.[key] || APP_TRANSLATIONS.en[key] || key;
}

function applyAppTranslations() {
  const dict = APP_TRANSLATIONS[currentAppLang] || APP_TRANSLATIONS.en;
  
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (dict[key]) {
      el.placeholder = dict[key];
    }
  });

  const langBtn = document.getElementById('app-lang-toggle');
  if (langBtn) {
    langBtn.textContent = currentAppLang === 'en' ? 'RU' : 'EN';
  }

  document.title = t('app_title');
  document.documentElement.lang = currentAppLang;

  // Update provider select options
  if (elSelectProvider) {
    const geminiOpt = elSelectProvider.querySelector('option[value="gemini"]');
    const openaiOpt = elSelectProvider.querySelector('option[value="openai"]');
    const ollamaOpt = elSelectProvider.querySelector('option[value="ollama"]');
    if (geminiOpt) geminiOpt.textContent = t('provider_gemini');
    if (openaiOpt) openaiOpt.textContent = t('provider_openai');
    if (ollamaOpt) ollamaOpt.textContent = t('provider_ollama');
  }

  // Refresh model dropdown with translated labels
  if (elSelectProvider) {
    const curModel = getActiveModelValue();
    renderModelDropdown(elSelectProvider.value, curModel);
  }

  initUserInfo();
}

// ── API ───────────────────────────────────────────────────────────
const API_BASE = '/api';

let providerModels = {
  gemini: 'gemini-3.5-flash-lite',
  openai: 'gpt-4o-mini',
  ollama: 'qwen2.5:3b-instruct'
};

function renderModelDropdown(provider, currentModelValue) {
  if (!elSelectModel) return;
  elSelectModel.innerHTML = '';

  const presetsByLang = MODEL_PRESETS[currentAppLang] || MODEL_PRESETS.en;
  const presets = presetsByLang[provider] || [];
  let isPreset = false;

  presets.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.value;
    opt.textContent = item.label;
    elSelectModel.appendChild(opt);
    if (item.value === currentModelValue) {
      isPreset = true;
    }
  });

  if (isPreset) {
    elSelectModel.value = currentModelValue;
    if (elInputModelCustom) {
      elInputModelCustom.style.display = 'none';
      elInputModelCustom.value = '';
    }
  } else if (currentModelValue) {
    elSelectModel.value = '__custom__';
    if (elInputModelCustom) {
      elInputModelCustom.style.display = 'block';
      elInputModelCustom.value = currentModelValue;
    }
  } else {
    elSelectModel.value = presets[0]?.value || '';
    if (elInputModelCustom) {
      elInputModelCustom.style.display = 'none';
      elInputModelCustom.value = '';
    }
  }
}

function getActiveModelValue() {
  if (!elSelectModel) return '';
  if (elSelectModel.value === '__custom__') {
    return elInputModelCustom ? elInputModelCustom.value.trim() : '';
  }
  return elSelectModel.value;
}

async function apiRequest(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': getInitData(),
    ...options.headers
  };

  try {
    const response = await fetch(url, { ...options, headers });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
    return data;
  } catch (error) {
    console.error(`API Error (${path}):`, error);
    showToast(error.message || 'Request failed', 'error');
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
const elSelectModel     = document.getElementById('select-model');
const elInputModelCustom= document.getElementById('input-model-custom');
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
const elAppLangToggle = document.getElementById('app-lang-toggle');

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
  const tgNow = getTg();

  if (tgNow && tgNow.initDataUnsafe?.user) {
    const user = tgNow.initDataUnsafe.user;
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
    elUserName.textContent = fullName || t('user_status_admin');
    elUserStatus.textContent = user.username ? `@${user.username}` : `ID: ${user.id}`;
    elUserAvatar.textContent = (user.first_name || 'A').charAt(0).toUpperCase();
    if (!tg) { tgNow.ready(); tgNow.expand(); }
  } else if (tgNow) {
    elUserName.textContent = t('user_status_admin');
    elUserStatus.textContent = t('user_status_tg_app');
    elUserAvatar.textContent = '👤';
  } else {
    elUserName.textContent = t('user_name_browser');
    elUserStatus.textContent = t('user_status_browser');
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

    if (data.models) {
      providerModels = data.models;
    }
    const currentModel = data.activeLlmModel || providerModels[elSelectProvider.value];
    renderModelDropdown(elSelectProvider.value, currentModel);

    elInputMaxChars.value     = data.maxReplyChars || '';
    elInputCooldown.value     = data.threadCooldownMs ? Math.round(data.threadCooldownMs / 1000) : '';

    // Header updates
    const tgNow = getTg();
    if (!tgNow?.initDataUnsafe?.user && data.user) {
      const u = data.user;
      if (u.username && u.username !== 'dev_admin') {
        elUserName.textContent = u.first_name || u.username || t('user_status_admin');
        elUserAvatar.textContent = (u.first_name || u.username || 'A').charAt(0).toUpperCase();
      }
    }

    // Channel status
    const channelSuffix = data.hasChannel
      ? `${t('channel_connected')}${String(data.channelChatId).slice(-4)}`
      : t('channel_not_connected');

    const currentStatus = elUserStatus.textContent;
    if (!currentStatus.startsWith('@') && !currentStatus.startsWith('ID:')) {
      elUserStatus.textContent = channelSuffix;
    }

  } catch (err) {
    // Handled inside apiRequest
  }
}

// ── Save settings ─────────────────────────────────────────────────
async function saveSettings() {
  const modelVal = getActiveModelValue();
  const payload = {
    autoReplyEnabled: elToggleAutoReply.checked,
    llmProvider:      elSelectProvider.value,
    activeLlmModel:   modelVal,
    maxReplyChars:    Number(elInputMaxChars.value),
    threadCooldownMs: Number(elInputCooldown.value) * 1000
  };

  setLoading(elBtnSaveSettings, true, t('btn_saving'));

  try {
    const res = await apiRequest('/settings', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast(t('toast_settings_saved'), 'success');
      providerModels[elSelectProvider.value] = modelVal;
    }
  } finally {
    setLoading(elBtnSaveSettings, false, t('btn_save_settings'), 'save');
  }
}

// ── Generate post from URL ────────────────────────────────────────
async function generatePostFromLink() {
  const url = elInputPostUrl.value.trim();
  if (!url) { showToast(t('toast_enter_url'), 'error'); return; }

  setLoading(elBtnGenerateLink, true, '...');

  try {
    const res = await apiRequest('/generate-post', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
    if (res.generated) {
      elTextareaPost.value = res.generated;
      showToast(t('toast_post_generated'), 'success');
      renderPreview(res.generated);
      loadStatus();
    }
  } finally {
    setLoading(elBtnGenerateLink, false, t('btn_generate_link'), 'wand-sparkles');
  }
}

// ── Reformat post ─────────────────────────────────────────────────
async function reformatPost() {
  const text = elTextareaPost.value.trim();
  if (!text) { showToast(t('toast_write_draft'), 'error'); return; }

  setLoading(elBtnReformat, true, t('btn_reformatting'));

  try {
    const res = await apiRequest('/reformat-post', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    if (res.reformatted) {
      elTextareaPost.value = res.reformatted;
      showToast(t('toast_reformatted'), 'success');
      renderPreview(res.reformatted);
      loadStatus();
    }
  } finally {
    setLoading(elBtnReformat, false, t('btn_reformat'), 'wand-2');
  }
}

// ── Publish ───────────────────────────────────────────────────────
async function publishPost() {
  const text = elTextareaPost.value.trim();
  if (!text) { showToast(t('toast_post_empty'), 'error'); return; }

  const doPublish = async () => {
    setLoading(elBtnPublish, true, t('btn_publishing'));
    try {
      const res = await apiRequest('/publish', {
        method: 'POST',
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        showToast(t('toast_published'), 'success');
        elTextareaPost.value = '';
        elPreviewContainer.style.display = 'none';
        if (tg?.openTelegramLink && res.postLink) tg.openTelegramLink(res.postLink);
      }
    } finally {
      setLoading(elBtnPublish, false, t('btn_publish'), 'send');
    }
  };

  if (tg?.showConfirm) {
    tg.showConfirm(t('confirm_publish'), (ok) => { if (ok) doPublish(); });
  } else {
    if (confirm(t('confirm_publish'))) doPublish();
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
elSelectProvider.addEventListener('change', () => {
  const selectedProvider = elSelectProvider.value;
  const targetModel = providerModels[selectedProvider] || '';
  renderModelDropdown(selectedProvider, targetModel);
});

if (elSelectModel) {
  elSelectModel.addEventListener('change', () => {
    if (elSelectModel.value === '__custom__') {
      if (elInputModelCustom) {
        elInputModelCustom.style.display = 'block';
        elInputModelCustom.focus();
      }
    } else {
      if (elInputModelCustom) {
        elInputModelCustom.style.display = 'none';
      }
    }
  });
}

if (elAppLangToggle) {
  elAppLangToggle.addEventListener('click', () => {
    currentAppLang = currentAppLang === 'en' ? 'ru' : 'en';
    localStorage.setItem('app_lang', currentAppLang);
    applyAppTranslations();
  });
}

elBtnGenerateLink.addEventListener('click', generatePostFromLink);
elBtnReformat.addEventListener('click', reformatPost);
elBtnPreview.addEventListener('click', () => renderPreview(elTextareaPost.value));
elBtnPublish.addEventListener('click', publishPost);

// ── Init ──────────────────────────────────────────────────────────
applyAppTranslations();
loadStatus();
