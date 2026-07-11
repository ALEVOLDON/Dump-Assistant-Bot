import './style.css';

const translations = {
  en: {
    nav_features: 'Features',
    nav_setup: 'Setup',
    nav_commands: 'Commands',
    nav_add_to_telegram: 'Add to Telegram',
    hero_powered: 'POWERED BY CLOUD LLMs',
    hero_title: 'Dump-Assistant-Bot: Your Smart <span class="text-primary">AI Sidekick</span> for Telegram',
    hero_desc: 'Automate routine tasks and engage your communities with a context-aware assistant powered by Gemini, OpenAI, or optional local Ollama.',
    hero_github: 'Get Started on GitHub',
    hero_docs: 'View Documentation',
    hero_processing: 'Bot Processing...',
    hero_mock_text: '"Analyzing the provided link. Here is the summary of the key findings..."',
    features_title: 'Hyper-Competent Automation',
    features_desc: 'Designed for community managers who need fast cloud AI by default, with OpenAI-compatible and local options when they need them.',
    features_cloud_ai_title: 'Cloud AI',
    features_cloud_ai_desc: 'Gemini is the recommended default with Structured Outputs, alongside OpenAI-compatible and Ollama endpoints.',
    features_context_title: 'Context Awareness',
    features_context_desc: 'Caches previous posts and conversation threads to provide coherent, relevant responses every time.',
    features_link_title: 'Link Reading',
    features_link_desc: 'Automatically analyzes articles, PDFs, and web pages shared in the chat to provide instant summaries.',
    features_instigator_title: '\'Instigator\' Mode',
    features_instigator_desc: 'Keep the conversation flowing. The bot can auto-comment to stimulate engagement in quiet groups.',
    features_rich_title: 'Rich Messages',
    features_rich_desc: 'Supports Telegram Bot API 10.1+ native tables, lists, and LaTeX formulas with automatic fallback.',
    features_security_title: 'Security Hardening',
    features_security_desc: 'Protects against DNS rebinding, filters private IP addresses, and secures relay target messaging.',
    features_owner_title: 'Owner Co-pilot',
    features_owner_desc: 'Manage settings via commands, and publish rich markdown posts (with images) directly to your channel through DM.',
    features_antispam_title: 'Anti-spam & Focus',
    features_antispam_desc: 'Smart filtering detects noise and spam, keeping your Telegram feed clean and focused on what matters.',
    pipeline_title: 'The Neural Pipeline',
    pipeline_step1_title: 'Telegram',
    pipeline_step1_desc: 'User sends a message or link',
    pipeline_step2_title: 'The Bot',
    pipeline_step2_desc: 'Applies filters and retrieves context',
    pipeline_step3_title: 'Cloud LLM',
    pipeline_step3_desc: 'Gemini or OpenAI generates the response',
    pipeline_step4_title: 'Response',
    pipeline_step4_desc: 'Instant, smart feedback in Telegram',
    setup_title: 'Quick Installation',
    setup_desc: 'Get your assistant up and running in minutes. Requires Node.js and an API key for your selected cloud provider.',
    setup_step1: 'Step 1: Install Dependencies',
    setup_step2: 'Step 2: Configure Provider',
    setup_step3: 'Step 3: Configuration',
    commands_title: 'Command Center',
    commands_desc: 'Control every aspect of your assistant with simple, powerful Telegram commands.',
    commands_chatid_desc: 'Get current chat context',
    commands_post_desc: 'Publish markdown post to channel',
    commands_postlink_desc: 'Generate post from URL and publish',
    commands_status_desc: 'Check bot health & LLM',
    commands_on_desc: 'Enable AI automation',
    commands_off_desc: 'Pause assistant features',
    commands_usage_desc: 'Show detailed token usage statistics',
    faq_title: 'Technical FAQ',
    faq_q1: 'What are the minimum hardware requirements?',
    faq_a1: 'The recommended cloud setup only needs Node.js 22+ and a network connection. Local Ollama mode is optional and depends on the model size and your CPU/GPU.',
    faq_q2: 'Can I switch between Gemini, OpenAI, and Ollama?',
    faq_a2: 'Yes. Set LLM_PROVIDER to gemini, openai, or ollama, then fill the matching API key or local Ollama settings in .env.',
    faq_q3: 'How does it handle long articles?',
    faq_a3: 'The bot fetches link content, extracts the main text, and provides a concise summary that fits within Telegram\'s message limits while preserving important context.',
    faq_q4: 'Is the bot secure against malicious links and DNS rebinding?',
    faq_a4: 'Yes. The built-in URL fetcher enforces strict validations: it restricts private IP ranges (blocking SSRF), limits redirection hops, and prevents DNS rebinding to protect internal networks.',
    faq_q5: 'What are "Rich Messages" and how does the bot support them?',
    faq_a5: 'The bot supports Telegram Bot API 10.1+ Rich Messages, converting standard Markdown output (including lists, tables, and LaTeX formulas) into HTML. It also implements an automatic safety fallback to standard messages if client or server rendering fails.',
    faq_q6: 'How do I publish posts directly to my channel using the bot?',
    faq_a6: 'As an owner, send `/post <Markdown text>` to the bot in a direct message. You can optionally attach an image, which the bot will automatically host and format into a native Telegram Rich Message. Alternatively, simply send any URL (with optional media) to automatically generate a post from the link\'s content.',
    faq_q7: 'How do I launch and access the Web App admin panel?',
    faq_a7: 'Start the bot and the ngrok tunnel. On Windows, you can run `start.bat` to launch both at once. Open the Admin button in your bot to access the panel, or configure it via @BotFather. For local browser testing, ensure `BYPASS_INIT_DATA_AUTH=true` is set in your `.env`.',
    footer_copyright: '© 2026 Dump-Assistant-Bot. Built for the future of automation.',
    footer_terms: 'License',
    footer_support: 'Support',
    footer_docs: 'Documentation'
  },
  ru: {
    nav_features: 'Возможности',
    nav_setup: 'Установка',
    nav_commands: 'Команды',
    nav_add_to_telegram: 'В Telegram',
    hero_powered: 'РАБОТАЕТ НА ОБЛАЧНЫХ ИИ',
    hero_title: 'Dump-Assistant-Bot: Ваш умный <span class="text-primary">ИИ-помощник</span> для Telegram',
    hero_desc: 'Автоматизируйте рутину и вовлекайте участников с контекстным ассистентом на базе Gemini, OpenAI или локальной Ollama.',
    hero_github: 'Начать на GitHub',
    hero_docs: 'Документация',
    hero_processing: 'Бот обрабатывает...',
    hero_mock_text: '"Анализирую предоставленную ссылку. Вот краткая сводка ключевых выводов..."',
    features_title: 'Высококлассная автоматизация',
    features_desc: 'Создано для администраторов, которым по умолчанию нужен быстрый облачный ИИ, с поддержкой OpenAI и локального запуска.',
    features_cloud_ai_title: 'Облачный ИИ',
    features_cloud_ai_desc: 'Gemini — рекомендуемый по умолчанию ИИ со Structured Outputs, наряду с OpenAI-совместимыми эндпоинтами и Ollama.',
    features_context_title: 'Контекст обсуждений',
    features_context_desc: 'Кэширует посты канала и ветки обсуждений для точных и уместных ответов в контексте.',
    features_link_title: 'Чтение ссылок',
    features_link_desc: 'Автоматически загружает статьи, PDF и веб-страницы из чата, предоставляя краткую выжимку.',
    features_instigator_title: 'Режим «Активатор»',
    features_instigator_desc: 'Поддерживает активность в чате. Бот может автоматически комментировать новые посты для вовлечения.',
    features_rich_title: 'Форматированный текст',
    features_rich_desc: 'Поддержка Telegram Bot API 10.1+ (таблицы, списки, формулы LaTeX) с автоматическим откатом.',
    features_security_title: 'Безопасность',
    features_security_desc: 'Защита от DNS-rebinding, фильтрация локальных IP-адресов и безопасная пересылка сообщений.',
    features_owner_title: 'Панель владельца',
    features_owner_desc: 'Управляйте настройками командами и публикуйте Rich-посты с изображениями напрямую в ваш канал через ЛС.',
    features_antispam_title: 'Антиспам и фокус',
    features_antispam_desc: 'Умная фильтрация шума и спама для сохранения чистоты и фокуса в вашей группе Telegram.',
    pipeline_title: 'Конвейер обработки',
    pipeline_step1_title: 'Telegram',
    pipeline_step1_desc: 'Пользователь отправляет сообщение или ссылку',
    pipeline_step2_title: 'Бот',
    pipeline_step2_desc: 'Применяет фильтры и собирает контекст',
    pipeline_step3_title: 'Облачный ИИ',
    pipeline_step3_desc: 'Gemini или OpenAI генерируют ответ',
    pipeline_step4_title: 'Ответ',
    pipeline_step4_desc: 'Мгновенная отправка ответа в Telegram',
    setup_title: 'Быстрая установка',
    setup_desc: 'Запустите ассистента за пару минут. Требуется Node.js и API-ключ выбранного ИИ-провайдера.',
    setup_step1: 'Шаг 1: Установка зависимостей',
    setup_step2: 'Шаг 2: Настройка окружения',
    setup_step3: 'Шаг 3: Конфигурация',
    commands_title: 'Центр управления',
    commands_desc: 'Управляйте всеми аспектами работы ассистента с помощью простых команд Telegram.',
    commands_chatid_desc: 'Получить контекст текущего чата',
    commands_post_desc: 'Опубликовать Markdown-пост в канал',
    commands_postlink_desc: 'Создать пост из ссылки и опубликовать',
    commands_status_desc: 'Проверить статус бота и модель',
    commands_on_desc: 'Включить автоматические ответы',
    commands_off_desc: 'Выключить автоматические ответы',
    commands_usage_desc: 'Показать статистику использования токенов',
    faq_title: 'Часто задаваемые вопросы',
    faq_q1: 'Какие минимальные системные требования?',
    faq_a1: 'Для облачного запуска нужны только Node.js 22+ и интернет. Локальный запуск через Ollama опционален и зависит от размера модели и мощности CPU/GPU.',
    faq_q2: 'Можно ли переключаться между Gemini, OpenAI и Ollama?',
    faq_a2: 'Да. Укажите LLM_PROVIDER как gemini, openai или ollama, затем настройте соответствующие ключи и параметры в .env.',
    faq_q3: 'Как бот обрабатывает длинные статьи?',
    faq_a3: 'Бот загружает содержимое, извлекает основной текст и генерирует выжимку, которая помещается в лимиты сообщений Telegram, сохраняя важный смысл.',
    faq_q4: 'Защищен ли бот от вредоносных ссылок и DNS-rebinding?',
    faq_a4: 'Да. Встроенный загрузчик строго проверяет ссылки: исключает локальные/приватные диапазоны IP (защита от SSRF), ограничивает редиректы и предотвращает DNS-rebinding для защиты внутренних сетей.',
    faq_q5: 'Что такое «Rich Messages» и как они поддерживаются?',
    faq_a5: 'Бот поддерживает Rich Messages из Telegram Bot API 10.1+, преобразуя Markdown (таблицы, списки, LaTeX) в HTML. Реализован авто-откат к обычным сообщениям при сбоях рендеринга.',
    faq_q6: 'Как публиковать посты в канал через бота?',
    faq_a6: 'Владелец может отправить команду `/post <Markdown-текст>` в личные сообщения бота. К сообщению можно прикрепить картинку — бот автоматически загрузит её на хостинг. Также можно просто отправить боту ссылку (с опциональным фото/видео), чтобы он автоматически сгенерировал интересный пост по её содержимому.',
    faq_q7: 'Как запустить и войти в веб-панель управления (Admin Panel)?',
    faq_a7: 'Запустите бота и туннель (например, ngrok). На Windows вы можете просто запустить `start.bat` для одновременного старта. Перейдите в бота в Telegram и нажмите кнопку «Admin» (ее можно настроить через @BotFather). Для тестов в обычном браузере убедитесь, что в `.env` задано `BYPASS_INIT_DATA_AUTH=true`.',
    footer_copyright: '© 2026 Dump-Assistant-Bot. Создано для автоматизации будущего.',
    footer_terms: 'Лицензия',
    footer_support: 'Поддержка',
    footer_docs: 'Документация'
  }
};

let currentLang = localStorage.getItem('site_lang') || 'en';

function applyTranslations(lang) {
  const dict = translations[lang];
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    if (dict[key]) {
      if (element.querySelector('span') || key === 'hero_title') {
        element.innerHTML = dict[key];
      } else {
        element.textContent = dict[key];
      }
    }
  });
  
  const toggleBtn = document.getElementById('lang-toggle');
  if (toggleBtn) {
    toggleBtn.textContent = lang === 'en' ? 'RU' : 'EN';
  }

  document.title = lang === 'en' 
    ? 'Dump-Assistant-Bot | Smart AI for Telegram' 
    : 'Dump-Assistant-Bot | Умный ИИ для Telegram';

  document.documentElement.lang = lang;
}

document.addEventListener('DOMContentLoaded', () => {
  applyTranslations(currentLang);

  const toggleBtn = document.getElementById('lang-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      currentLang = currentLang === 'en' ? 'ru' : 'en';
      localStorage.setItem('site_lang', currentLang);
      applyTranslations(currentLang);
    });
  }

  // Mobile Menu Handler
  const menuToggle = document.getElementById('menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  const menuIcon = document.getElementById('menu-icon');

  if (menuToggle && mobileMenu && menuIcon) {
    menuToggle.addEventListener('click', () => {
      const isHidden = mobileMenu.classList.contains('hidden');
      if (isHidden) {
        mobileMenu.classList.remove('hidden');
        menuIcon.textContent = 'close';
      } else {
        mobileMenu.classList.add('hidden');
        menuIcon.textContent = 'menu';
      }
    });

    // Close mobile menu when clicking nav links
    const mobileLinks = mobileMenu.querySelectorAll('.mobile-nav-link');
    mobileLinks.forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenu.classList.add('hidden');
        menuIcon.textContent = 'menu';
      });
    });
  }

  // Back to Top Button Handler
  const backToTopBtn = document.getElementById('back-to-top');
  if (backToTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        backToTopBtn.classList.remove('translate-y-12', 'opacity-0', 'pointer-events-none');
        backToTopBtn.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
      } else {
        backToTopBtn.classList.add('translate-y-12', 'opacity-0', 'pointer-events-none');
        backToTopBtn.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
      }
    });

    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }
});
