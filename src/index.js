const fs = require("fs");
const { Bot } = require("grammy");
const config = require("./config");
const { readState, writeState } = require("./state");
const { createAssistantDecision } = require("./llm");
const { PostCache } = require("./posts");
const { extractUrls, fetchUrlContent } = require("./fetcher");
const { sendRichMessageWithFallback, markdownToHtml } = require("./rich");

if (!config.telegramBotToken) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN in .env");
}

// Создаём папку data если нет
if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

const promptText = fs.readFileSync(config.promptPath, "utf8");
const bot = new Bot(config.telegramBotToken);
const state = readState(config.statePath);
const posts = new PostCache(config.postsPath);
const runtimeHistory = new Map();
const MAX_RUNTIME_THREADS = 100; // максимум тредов в памяти
const MAX_RELAY_TARGETS = 1000;

// Логирование с уровнями
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const logLevels = { error: 0, warn: 1, info: 2, debug: 3 };

function log(level, message, ...args) {
  if (logLevels[level] <= logLevels[LOG_LEVEL]) {
    const timestamp = new Date().toISOString().slice(11, 19);
    const prefix = `[${timestamp}][${level.toUpperCase()}]`;
    console.log(prefix, message, ...args);
  }
}

const logger = {
  error: (msg, ...args) => log('error', msg, ...args),
  warn: (msg, ...args) => log('warn', msg, ...args),
  info: (msg, ...args) => log('info', msg, ...args),
  debug: (msg, ...args) => log('debug', msg, ...args)
};

function anonymizeId(value) {
  if (!Number.isFinite(value)) return "n/a";
  const str = String(value);
  return str.length <= 4 ? `***${str}` : `${"*".repeat(str.length - 4)}${str.slice(-4)}`;
}

function ensureRelayState() {
  if (!state.relayTargets || typeof state.relayTargets !== "object") {
    state.relayTargets = {};
  }
}

function storeRelayTarget(ownerMessageId, targetUserId) {
  ensureRelayState();
  state.relayTargets[String(ownerMessageId)] = {
    targetUserId,
    createdAt: Date.now()
  };

  const entries = Object.entries(state.relayTargets);
  if (entries.length > MAX_RELAY_TARGETS) {
    entries
      .sort((a, b) => (a[1]?.createdAt || 0) - (b[1]?.createdAt || 0))
      .slice(0, entries.length - MAX_RELAY_TARGETS)
      .forEach(([key]) => delete state.relayTargets[key]);
  }

  writeState(config.statePath, state);
}

function getRelayTarget(replyMessageId) {
  ensureRelayState();
  return state.relayTargets[String(replyMessageId)]?.targetUserId || null;
}

// Очистка старых тредов из памяти
function cleanupRuntimeHistory() {
  if (runtimeHistory.size <= MAX_RUNTIME_THREADS) return;
  
  // Удаляем самые старые треды (на основе lastReplyAt из state)
  const entries = Array.from(runtimeHistory.entries());
  const threadsWithAge = entries.map(([key, history]) => {
    const threadState = state.threads[key];
    const lastActivity = threadState?.lastReplyAt || 0;
    return { key, lastActivity };
  });
  
  // Сортируем по возрасту и удаляем старые
  threadsWithAge.sort((a, b) => a.lastActivity - b.lastActivity);
  const toDelete = threadsWithAge.slice(0, runtimeHistory.size - MAX_RUNTIME_THREADS);
  
  toDelete.forEach(({ key }) => {
    runtimeHistory.delete(key);
    logger.debug(`Removed old thread from memory: ${key}`);
  });
}

if (state.autoReplyEnabled === undefined) {
  state.autoReplyEnabled = config.autoReplyEnabled;
  writeState(config.statePath, state);
}
ensureRelayState();

// ─── helpers ────────────────────────────────────────────────────────────────

function richBlockToMarkdown(block) {
  if (!block) return "";
  switch (block.type) {
    case "heading": {
      const level = block.size || 1;
      return "#".repeat(level) + " " + (block.text || "") + "\n\n";
    }
    case "paragraph": {
      return (block.text || "") + "\n\n";
    }
    case "preformatted":
    case "code": {
      const lang = block.language || "";
      return "```" + lang + "\n" + (block.text || "") + "\n```\n\n";
    }
    case "block_quote":
    case "quotation": {
      return "> " + (block.text || "") + "\n\n";
    }
    case "divider": {
      return "---\n\n";
    }
    case "photo": {
      const photo = block.photo?.at(-1);
      if (photo && photo.file_id) {
        return `![Photo](file_id:${photo.file_id})\n\n`;
      }
      return "";
    }
    case "table": {
      const rows = block.cells || block.rows;
      if (!rows || rows.length === 0) return "";
      let markdown = "";
      rows.forEach((rowObj, rowIndex) => {
        const cells = Array.isArray(rowObj) ? rowObj : (rowObj.cells || []);
        markdown += "| " + cells.map(cell => typeof cell === "string" ? cell : (cell.text || "")).join(" | ") + " |\n";
        if (rowIndex === 0) {
          markdown += "| " + cells.map(cell => {
            const align = typeof cell === "string" ? "left" : (cell.align || "left");
            if (align === "center") return " :---: ";
            if (align === "right") return " ---: ";
            return " :--- ";
          }).join(" | ") + " |\n";
        }
      });
      return markdown + "\n";
    }
    case "list": {
      const items = block.items || [];
      const isOrdered = block.ordered || false;
      let markdown = "";
      items.forEach((item, index) => {
        let itemText = "";
        if (typeof item === "string") {
          itemText = item;
        } else if (item.text) {
          itemText = item.text;
        } else if (item.content) {
          if (typeof item.content === "string") {
            itemText = item.content;
          } else if (item.content.text) {
            itemText = item.content.text;
          }
        }
        const prefix = isOrdered ? `${index + 1}. ` : "- ";
        markdown += prefix + itemText + "\n";
      });
      return markdown + "\n";
    }
    default:
      if (block.text) {
        return block.text + "\n\n";
      }
      return "";
  }
}

function extractText(message) {
  if (!message) return "";
  if (message.rich_message) {
    if (message.rich_message.markdown) {
      return String(message.rich_message.markdown).trim();
    }
    if (Array.isArray(message.rich_message.blocks)) {
      return message.rich_message.blocks.map(b => richBlockToMarkdown(b)).join("").trim();
    }
  }
  return String(message.text || message.caption || "").trim();
}


function isOwner(userId) {
  return config.ownerUserIds.length > 0 && config.ownerUserIds.includes(userId);
}

function isChannelOwner(senderChat) {
  // Проверяем, что это канал и его ID в списке разрешенных владельцев
  if (!senderChat || senderChat.type !== "channel") return false;
  return config.ownerUserIds.length > 0 && config.ownerUserIds.includes(senderChat.id);
}

function isAllowedChat(chatId) {
  return config.allowAllChats || config.allowedChatIds.includes(chatId);
}

function getThreadKey(message) {
  const chatId = message.chat.id;
  const threadId =
    message.message_thread_id ||
    message.reply_to_message?.message_thread_id ||
    message.reply_to_message?.message_id ||
    0;
  return `${chatId}:${threadId}`;
}

function sanitizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function rememberMessage(message, role, text) {
  const key = getThreadKey(message);
  const current = runtimeHistory.get(key) || [];
  current.push({
    role,
    user: role === "assistant" ? "бот" : sanitizeText(message.from?.username || message.from?.first_name || "user"),
    text: sanitizeText(text).slice(0, 300)
  });
  runtimeHistory.set(key, current.slice(-config.recentMessagesLimit));
  
  // Периодическая очистка
  cleanupRuntimeHistory();
}

function getRecentMessages(message) {
  return runtimeHistory.get(getThreadKey(message)) || [];
}

// ─── сигналы ─────────────────────────────────────────────────────────────────

function isDirectAddress(text) {
  if (config.botUsername && text.toLowerCase().includes(`@${config.botUsername}`)) return true;
  return /(?:^|\s)(админ\w*|модер\w*|бот)(?:\s|[,!?.]|$)/iu.test(text);
}

function isQuestion(text) {
  return /\?/.test(text) ||
    /(?:^|\s)(как|почему|зачем|где|когда|чем|кто|куда|откуда|сколько|расскажи|объясни|поясни|помоги|подскажи)(?:\s|[,!?.]|$)/iu.test(text);
}

function isNoise(text) {
  if (text.length < 3) return true;
  return /^(ok|ок|ага|угу|мм|да|нет|лол|ха+|\+1|👍|🔥|❤️|👎|\.+|!+)$/i.test(text);
}

// ─── решение: реагировать или нет ────────────────────────────────────────────

function analyzeMessage(message, text) {
  if (!isAllowedChat(message.chat.id)) return { skip: true, reason: "chat_not_allowed" };
  if (!state.autoReplyEnabled) return { skip: true, reason: "auto_reply_disabled" };

  const fromId = message.from?.id;
  // Исключения для системных ботов Telegram:
  // 1087968824 - Telegram BotFather (для команд)
  // 136817688 - Telegram (официальные уведомления)
  if (message.from?.is_bot && fromId !== 1087968824 && fromId !== 136817688) {
    return { skip: true, reason: "bot_message" };
  }

  if (!text) return { skip: true, reason: "empty_text" };
  if (isNoise(text)) return { skip: true, reason: "noise" };

  // Жесткий лимит: не чаще 1 раза в 3 секунды для одного треда, чтобы избежать DoS
  const threadKey = getThreadKey(message);
  const threadState = state.threads[threadKey];
  if (threadState?.lastReplyAt && Date.now() - threadState.lastReplyAt < 3000) {
    return { skip: true, reason: "hard_cooldown_dos_protection" };
  }

  // Ответ на сообщение бота — всегда обрабатываем
  if (message.reply_to_message?.from?.username?.toLowerCase() === config.botUsername) {
    return { skip: false, forceReply: true };
  }

  // Владелец канала или сообщение от лица самого канала — отвечаем и выполняем команды
  if (isOwner(message.from?.id) || isChannelOwner(message.sender_chat)) {
    return { skip: false, forceReply: true };
  }

  // Прямое обращение к боту/админу — ВСЕГДА отвечаем
  if (isDirectAddress(text)) {
    return { skip: false, forceReply: true };
  }

  // Есть вопрос — отправляем в LLM на решение
  if (isQuestion(text)) {
    return { skip: false, forceReply: false };
  }

  // Кулдаун для обычных сообщений
  if (threadState?.lastReplyAt && Date.now() - threadState.lastReplyAt < config.threadCooldownMs) {
    return { skip: true, reason: "cooldown" };
  }

  // Остальное — LLM решает
  return { skip: false, forceReply: false };
}

// ─── контекст поста и ссылок ─────────────────────────────────────────────────

/**
 * Получить контекст оригинального поста для данного треда.
 * Если пост содержит ссылки — пробуем подгрузить их содержимое.
 */
async function getPostContext(message, commentText) {
  const threadId = message.message_thread_id || message.reply_to_message?.message_thread_id;
  let postText = null;
  let postUrls = [];

  // Ищем сохранённый пост по ID треда
  if (threadId) {
    const cached = posts.get(threadId);
    if (cached) {
      postText = cached.text;
      postUrls = cached.urls || [];
    }
  }

  // Собираем все URL для загрузки: из поста + из текущего комментария
  const commentUrls = extractUrls(commentText);
  const allUrls = [...new Set([...postUrls, ...commentUrls])].slice(0, 2);

  // Подгружаем содержимое ссылок (параллельно, быстро)
  const urlContents = {};
  if (allUrls.length > 0) {
    const results = await Promise.allSettled(
      allUrls.map(async (url) => {
        const content = await fetchUrlContent(url, config.urlFetchTimeoutMs);
        return { url, content };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.content) {
        urlContents[r.value.url] = r.value.content;
      }
    }
  }

  return { postText, postUrls, commentUrls, urlContents };
}

// ─── промпт ──────────────────────────────────────────────────────────────────

function buildUserPrompt(message, text, forceReply, postContext) {
  const history = getRecentMessages(message)
    .slice(-5)
    .map((m) => `[${m.user}]: ${m.text}`)
    .join("\n");

  let authorRole = "пользователь";
  let isOwnerMessage = false;
  if (isOwner(message.from?.id)) {
    authorRole = "ВЛАДЕЛЕЦ КАНАЛА (твой босс)";
    isOwnerMessage = true;
  } else if (isChannelOwner(message.sender_chat)) {
    authorRole = "КАНАЛ (официальный пост)";
    isOwnerMessage = true;
  }

  const author = sanitizeText(message.from?.username || message.from?.first_name || (message.sender_chat?.type === "channel" ? "Канал" : "пользователь"));

  const lines = [
    `Канал: ${config.channelAbout || "авторский канал"}`,
    ""
  ];

  // Добавляем контекст оригинального поста
  if (postContext?.postText) {
    lines.push("=== ОРИГИНАЛЬНЫЙ ПОСТ ===");
    lines.push(postContext.postText);
    lines.push("=== КОНЕЦ ПОСТА ===");
    lines.push("");
  }

  // Добавляем содержимое загруженных ссылок
  if (postContext?.urlContents && Object.keys(postContext.urlContents).length > 0) {
    for (const [url, content] of Object.entries(postContext.urlContents)) {
      lines.push(`=== СОДЕРЖИМОЕ ССЫЛКИ: ${url} ===`);
      lines.push(content.slice(0, 1500));
      lines.push("=== КОНЕЦ ===");
      lines.push("");
    }
  }

  lines.push(`Автор: ${author} [${authorRole}]`);
  lines.push(`Сообщение:\n<user_message>\n${text}\n</user_message>`);
  lines.push("");

  if (history) {
    lines.push("История треда:", history, "");
  }

  lines.push(`Лимит ответа: ${config.maxReplyChars} символов.`);

  if (forceReply || isOwnerMessage) {
    lines.push("Это сообщение от Владельца или прямое обращение. НАПИШИ ОТВЕТ (should_reply: true). Соглашайся с Владельцем или выполняй его команды.");
  } else {
    lines.push('Реши: нужен ли ответ администратора? Если нет — should_reply: false, reply_text: "".');
  }

  return lines.join("\n");
}

// ─── утилиты ─────────────────────────────────────────────────────────────────

function trimReply(text) {
  const s = (text || "")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
  return s.length <= config.maxReplyChars ? s : `${s.slice(0, config.maxReplyChars - 1).trimEnd()}…`;
}

function isRecoverableLlmError(error) {
  const msg = String(error?.message || "");
  return (
    msg.includes("Ollama API error") ||
    msg.includes("Ollama timeout") ||
    msg.includes("Gemini API error") ||
    msg.includes("Gemini timeout") ||
    msg.includes("OpenAI API error") ||
    msg.includes("OpenAI timeout") ||
    msg.includes("insufficient_quota") ||
    msg.includes("fetch failed") ||
    msg.includes("ECONNREFUSED")
  );
}

function storeUsage(usage) {
  state.usage.requests += 1;
  state.usage.promptTokens += usage.promptTokens;
  state.usage.completionTokens += usage.completionTokens;
  state.usage.totalTokens += usage.totalTokens;
}

// ─── основная логика ──────────────────────────────────────────────────────────

async function maybeReply(ctx) {
  const message = ctx.message || ctx.msg;
  if (!message) return;

  const text = sanitizeText(extractText(message));
  const decision = analyzeMessage(message, text);

  // Сохраняем в историю только если сообщение не пропускается
  if (!decision.skip) {
    rememberMessage(message, "user", text);
  }

  if (decision.skip) {
    logger.debug(`Skip thread=${getThreadKey(message)} reason=${decision.reason}`);
    return;
  }

  const { forceReply } = decision;

  // Параллельно собираем контекст поста и ссылок
  const postContext = await getPostContext(message, text);
  if (postContext.postText) {
    logger.debug(`Context thread=${getThreadKey(message)} post=${postContext.postText.slice(0, 60)}...`);
  }
  if (Object.keys(postContext.urlContents).length > 0) {
    logger.debug(`Context loaded ${Object.keys(postContext.urlContents).length} URL(s)`);
  }

  let replyText = "";
  let result = null;

  try {
    const response = await createAssistantDecision(config, {
      systemPrompt: promptText,
      userPrompt: buildUserPrompt(message, text, forceReply, postContext),
      forceReply
    });

    result = response.result;
    storeUsage(response.usage);

    if (!result.should_reply) {
      logger.debug(`Silent thread=${getThreadKey(message)} reason=${result.reason || "llm_no"}`);
      writeState(config.statePath, state);
      return;
    }

    replyText = trimReply(result.reply_text || "");
  } catch (error) {
    if (!isRecoverableLlmError(error)) throw error;
    logger.error(`LLM Error: ${error.message}`);
    if (forceReply) {
      replyText = "На связи. Напишите вопрос подробнее.";
    }
  }

  if (!replyText) {
    logger.debug(`Silent thread=${getThreadKey(message)} reason=empty_reply`);
    writeState(config.statePath, state);
    return;
  }

  await sendRichMessageWithFallback(ctx, replyText, message.message_id);
  logger.info(`Reply sent thread=${getThreadKey(message)} force=${forceReply}`);

  // ─── Уведомление владельцу в личку ───────────────────────────────────────
  const notifyOwnerId = config.ownerUserIds[0];
  if (notifyOwnerId && message.chat.type !== "private") {
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const authorName = message.from?.username
      ? `@${message.from.username}`
      : (message.from?.first_name || `ID:${message.from?.id}`);
    const chatTitle = message.chat.title || String(message.chat.id);
    const fromId = message.from?.id;
    const notifyText =
      `🔔 <b>Ответил в группе</b> (${esc(chatTitle)})\n` +
      `👤 ${esc(authorName)} (ID: ${fromId}): ${esc(text.slice(0, 200))}\n` +
      `🤖 Бот: ${esc(replyText.slice(0, 200))}\n\n` +
      `↩️ <i>Ответьте на это сообщение чтобы написать пользователю в личку</i>`;
    bot.api
      .sendMessage(notifyOwnerId, notifyText, {
        parse_mode: "HTML",
        disable_notification: false
      })
      .catch((e) => logger.error(`Notify Error: ${e.message}`));
  }
  // ──────────────────────────────────────────────────────────────────────────

  rememberMessage(message, "assistant", replyText);
  state.threads[getThreadKey(message)] = {
    lastReplyAt: Date.now(),
    lastReason: result?.reason || "forced_or_fallback",
    lastRisk: result?.risk || "low"
  };
  writeState(config.statePath, state);
}

// ─── кэширование постов канала ────────────────────────────────────────────────

/**
 * Когда пост публикуется в канале, Telegram автоматически форвардит его
 * в связанную группу обсуждений. Сохраняем эти посты, чтобы бот понимал
 * контекст когда подписчики задают вопросы в комментариях.
 */
function cacheChannelPost(message) {
  const text = extractText(message);
  const urls = extractUrls(text);

  // Сохраняем по message_id — это станет thread_id для комментариев
  posts.set(message.message_id, { text, urls, date: message.date * 1000 });
  logger.info(`[Post cached] id=${message.message_id} urls=${urls.length}`);
}

function isRealAutoForwardedChannelPost(message) {
  if (!message?.is_automatic_forward) return false;

  if (message.sender_chat?.type === "channel") return true;
  if (!message.from) return true;
  return false;
}

async function maybeReplyToPost(ctx) {
  if (!state.autoReplyEnabled) return;
  const message = ctx.message || ctx.msg;
  const text = extractText(message);
  if (!text) return; // Нет текста — нечего комментировать

  logger.info(`[AutoComment] Generating first comment for post: ${message.message_id}`);

  // Пробуем подгрузить контент, если есть ссылки
  const urls = extractUrls(text);
  const urlContents = {};
  if (urls.length > 0) {
    logger.info(`[AutoComment] Fetching ${urls.length} URL(s) for context...`);
    const results = await Promise.allSettled(
      urls.map(async (url) => {
        const content = await fetchUrlContent(url, config.urlFetchTimeoutMs);
        return { url, content };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.content) {
        urlContents[r.value.url] = r.value.content;
        logger.info(`[AutoComment] Context loaded from ${r.value.url} (${r.value.content.length} chars)`);
      } else {
        logger.warn(`[AutoComment] Failed to load context from URL`);
      }
    }
  }

  const systemPrompt = `Ты — умный и харизматичный ИИ-ассистент этого Telegram-канала.
Твоя задача — написать первый комментарий к новому посту автора.
Цель: дать краткий TL;DR (выжимку) или интересную мысль по теме, чтобы вовлечь аудиторию.

Правила:
- Пиши коротко (1-2 предложения максимум). Если в посте есть список или структура, ты можешь оформить это в виде короткого маркированного списка или маленькой таблицы для наглядности.
- Живой тон, без шаблонов "Привет!".
- Используй ТОЛЬКО информацию из предоставленного контекста ссылки.
- Если контекст ссылки не загружен или содержит только общие слова сервиса, не делай TL;DR и не угадывай тему ролика/статьи.
- В таком случае напиши нейтральный короткий комментарий без выдуманных деталей и без вопросов про личный опыт аудитории.
- ЕСЛИ ТЫ НЕ ЗНАЕШЬ ИМЕНИ АВТОРА ИЛИ КАНАЛА — НЕ ВЫДУМЫВАЙ ЕГО. Просто пиши про контент.
- Избегай общих вопросов типа "А какой ваш сайд-проект?". Будь специфичен к теме поста.
- Общайся как "мы с автором" или как самостоятельный комментатор.`;

  const contextLines = [
    `Канал: ${config.channelAbout || "авторский канал"}`,
    ""
  ];

  if (Object.keys(urlContents).length > 0) {
    for (const [url, content] of Object.entries(urlContents)) {
      contextLines.push(`=== СОДЕРЖИМОЕ ССЫЛКИ: ${url} ===`);
      contextLines.push(content.slice(0, 1500));
      contextLines.push("=== КОНЕЦ ===");
      contextLines.push("");
    }
  } else if (urls.length > 0) {
    contextLines.push("Контекст ссылки не загружен. Нельзя пересказывать содержание по одной ссылке или по догадкам.");
    contextLines.push("");
  }

  const userPrompt = `${contextLines.join("\n")}=== НОВЫЙ ПОСТ В КАНАЛЕ ===\n${text}\n=== КОНЕЦ ПОСТА ===\n\nНапиши классный первый комментарий к этому посту:`;

  try {
    const response = await createAssistantDecision(config, {
      systemPrompt: systemPrompt,
      userPrompt: userPrompt,
      forceReply: true
    });

    storeUsage(response.usage);
    const replyText = trimReply(response.result.reply_text || "");
    if (replyText) {
      await sendRichMessageWithFallback(ctx, replyText, message.message_id);
      logger.info(`[AutoComment Reply] post=${message.message_id}`);
      // Сохраняем в историю треда, чтобы бот помнил свой комментарий
      rememberMessage(message, "assistant", replyText);
    }
  } catch (error) {
    if (!isRecoverableLlmError(error)) throw error;
    logger.error(`[LLM Error AutoComment] ${error.message}`);
  }
}

// DEBUG: логируем всё что приходит в бота
bot.on("message", async (ctx, next) => {
  const msg = ctx.message;
  if (!msg) return;

  // --- Режим "Служба поддержки" (Relay) для личных сообщений ---
  if (ctx.chat.type === "private") {
    const text = sanitizeText(msg.text || msg.caption || "");
    const fromId = ctx.from?.id;
    const username = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || "Пользователь");

    logger.info(`[Private] sender=${anonymizeId(fromId)} isOwner=${isOwner(fromId)}`);

    if (isOwner(fromId)) {
      const replyTo = msg.reply_to_message;
      if (replyTo) {
        const replyMessageId = replyTo.message_id;
        const targetId = getRelayTarget(replyMessageId);
        if (targetId) {
          logger.info(`[Relay Owner→User] target=${anonymizeId(targetId)}`);
          try {
            await ctx.copyMessage(targetId);
            await ctx.reply("✅ Ответ отправлен пользователю.");
          } catch (e) {
            logger.error(`[Relay Owner→User Error] ${e.message}`);
            await ctx.reply(`❌ Ошибка отправки: ${e.message}`);
          }
        } else {
          logger.warn("[Relay Owner] Нет безопасной связи reply -> пользователь");
          await ctx.reply("Не вижу, кому отправить ответ. Нажмите Reply на уведомление от бота.");
        }
      } else {
        // Это не ответ на пересланное сообщение -> проверяем на команду публикации нового поста
        const caption = msg.caption || "";
        const rawText = (msg.text || caption).trim();
        
        const isPostRaw = rawText.startsWith("/postraw") || rawText.startsWith("/post_raw");
        const isPost = rawText.startsWith("/post");

        if (isPost) {
          const commandLength = isPostRaw ? (rawText.startsWith("/postraw") ? 8 : 9) : 5;
          let postText = rawText.slice(commandLength).trim();

          if (!postText) {
            await ctx.reply("❌ Текст поста пуст! Напишите ваш текст после команды.");
            return;
          }
          
          try {
            const channelChatId = config.channelChatId;
            logger.info(`[Publishing] Publishing post to channel: ${channelChatId}`);

            // Если это обычный /post (не raw), форматируем его с помощью LLM для фирменного стиля
            if (!isPostRaw) {
              logger.info(`[Publishing] Reformatting raw draft with LLM to fit channel's style...`);
              
              const formatSystemPrompt = `Ты — профессиональный редактор Telegram-канала. Твоя задача — взять черновик поста от автора и сделать его разметку идеальной для публикации, строго сохраняя при этом оригинальный текст, структуру и стиль автора.

Правила оформления поста:
- Начинай с главного заголовка первого уровня (например, "# 🚀 Название").
- Обязательно сохраняй исходную структуру абзацев и разделов автора. Разделяй абзацы пустой строкой. Ни в коем случае не склеивай абзацы вместе.
- НЕ переписывай слова и предложения автора своими словами. Оставляй оригинальный текст нетронутым, улучшай только его разметку и визуальную подачу.
- Сохраняй исходный регистр букв автора (не пиши слова CAPS LOCK'ом, если их не было в оригинале, и сохраняй строчные/прописные буквы в списках ровно так, как написал автор).
- Если в тексте перечисляются характеристики, параметры или структура в виде строк (например, "Компонент Характеристики CPU 72-ядерный NVIDIA Grace GPU Blackwell Ultra..."), объединяй их в красивую нативную Markdown-таблицу (со столбцами, выравниванием, разделителями).
- Если в тексте есть списки (например, преимущества, причины, задачи), оформи их в виде аккуратного маркированного списка (каждый пункт списка строго на новой строке, используй "*" или "-" для пунктов).
- В самом конце обязательно добавь хэштеги в одну строку через пробел, предварительно отделив их от основного текста пустой строкой (вставив два переноса строки перед хэштегами, чтобы получился визуальный отступ: "\n\n#AI #NVIDIA #Blackwell"). Хэштеги не должны склеиваться с последним абзацем текста.
- Сохраняй весь смысл, ссылки и детали исходного текста.
- Обязательно возвращай итоговый текст в поле reply_text.`;

              const formatUserPrompt = `=== СЫРОЙ ЧЕРНОВИК ПОСТА ===\n${postText}\n=== КОНЕЦ ЧЕРНОВИКА ===`;

              try {
                const formatResponse = await createAssistantDecision(config, {
                  systemPrompt: formatSystemPrompt,
                  userPrompt: formatUserPrompt,
                  forceReply: true
                });

                if (formatResponse.result.reply_text) {
                  postText = formatResponse.result.reply_text.trim();
                  logger.info(`[Publishing] Post successfully reformatted by LLM.`);
                } else {
                  throw new Error(`Модель не вернула текст (reason: ${formatResponse.result.reason || "unknown"})`);
                }
              } catch (llmErr) {
                logger.error(`[Publishing] LLM reformatting failed: ${llmErr.message}`);
                await ctx.reply(`❌ Ошибка автоформатирования поста с помощью ИИ:\n${llmErr.message}\n\nПубликация отменена. Пожалуйста, попробуйте еще раз или используйте команду /postraw для публикации без ИИ-оформления.`);
                return; // Прерываем публикацию
              }
            }
            
            let finalMarkdown = postText;
            let mediaSentSeparately = false;
            let mediaTypeSent = "";

            let mediaFileId = null;
            let mediaType = ""; // "photo", "video", "animation", "document"
            let fileName = "";
            let mimeType = "";
            let htmlTag = "";

            if (msg.photo?.length) {
              const photo = msg.photo.at(-1);
              mediaFileId = photo.file_id;
              mediaType = "photo";
              fileName = "photo.jpg";
              mimeType = "image/jpeg";
            } else if (msg.video) {
              mediaFileId = msg.video.file_id;
              mediaType = "video";
              fileName = msg.video.file_name || "video.mp4";
              mimeType = msg.video.mime_type || "video/mp4";
            } else if (msg.animation) {
              mediaFileId = msg.animation.file_id;
              mediaType = "animation";
              fileName = msg.animation.file_name || "animation.gif";
              mimeType = msg.animation.mime_type || "image/gif";
            } else if (msg.document) {
              mediaFileId = msg.document.file_id;
              mediaType = "document";
              fileName = msg.document.file_name || "document.dat";
              mimeType = msg.document.mime_type || "application/octet-stream";
            }

            if (mediaFileId) {
              logger.info(`[Publishing] ${mediaType} detected. Attempting to upload to tmpfiles.org for unified Rich Message...`);
              
              try {
                // Скачиваем файл из Telegram
                const file = await bot.api.getFile(mediaFileId);
                const downloadUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
                const downloadResponse = await fetch(downloadUrl);
                if (!downloadResponse.ok) {
                  throw new Error(`Failed to download file from Telegram: ${downloadResponse.statusText}`);
                }
                const arrayBuffer = await downloadResponse.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                
                // Формируем FormData для отправки на tmpfiles.org
                const fileObj = new File([buffer], fileName, { type: mimeType });
                const formData = new FormData();
                formData.append("file", fileObj);
                
                const uploadResponse = await fetch("https://tmpfiles.org/api/v1/upload", {
                  method: "POST",
                  body: formData
                });
                
                if (!uploadResponse.ok) {
                  throw new Error(`Upload to tmpfiles.org returned status ${uploadResponse.status}`);
                }
                
                const uploadResult = await uploadResponse.json();
                const originalUrl = uploadResult.data?.url;
                if (!originalUrl) {
                  throw new Error("No URL returned from upload server");
                }
                
                const directUrl = originalUrl.replace("https://tmpfiles.org/", "https://tmpfiles.org/dl/");
                logger.info(`[Publishing] ${mediaType} successfully hosted at: ${directUrl}`);
                
                // Вставляем медиа-тег в самое начало Markdown-поста
                if (mediaType === "photo") {
                  htmlTag = `<img src="${directUrl}" />`;
                } else if (mediaType === "video" || mediaType === "animation") {
                  htmlTag = `<video src="${directUrl}" />`;
                } else {
                  // Для обычных документов используем ссылку на скачивание
                  htmlTag = `<a href="${directUrl}">📎 ${fileName}</a>`;
                }
                
                finalMarkdown = `${htmlTag}\n\n${postText}`;
              } catch (uploadErr) {
                logger.warn(`[Publishing] Temporary hosting failed for ${mediaType} (${uploadErr.message}). Falling back to sending separately.`);
                
                // Отправляем медиа отдельно в зависимости от его типа
                if (mediaType === "photo") {
                  await bot.api.sendPhoto(channelChatId, mediaFileId);
                } else if (mediaType === "video") {
                  await bot.api.sendVideo(channelChatId, mediaFileId);
                } else if (mediaType === "animation") {
                  await bot.api.sendAnimation(channelChatId, mediaFileId);
                } else if (mediaType === "document") {
                  await bot.api.sendDocument(channelChatId, mediaFileId);
                }
                
                mediaSentSeparately = true;
                mediaTypeSent = mediaType;
              }
            }
            
            // Проверяем, нужны ли Rich Messages (наличие таблиц или LaTeX)
            const hasTable = finalMarkdown.includes("|") && finalMarkdown.includes("---");
            const hasLatex = finalMarkdown.includes("$$") || finalMarkdown.includes("\\(") || finalMarkdown.includes("\\[");
            const needsRich = hasTable || hasLatex;

            let result;
            if (needsRich) {
              logger.info(`[Publishing] Post contains tables/math. Publishing as Rich Message.`);
              const htmlContent = markdownToHtml(finalMarkdown, true);
              result = await bot.api.raw.sendRichMessage({
                chat_id: channelChatId,
                rich_message: {
                  html: htmlContent
                }
              });
            } else {
              logger.info(`[Publishing] Post is plain text/lists. Publishing as Standard Message for story compatibility.`);
              let htmlContent = markdownToHtml(finalMarkdown, false);
              
              // В стандартном режиме Telegram не поддерживает теги <img> и <video>.
              // Удаляем их из HTML-содержимого, так как само медиа отправляется отдельно или через скрытую ссылку.
              htmlContent = htmlContent
                .replace(/<img[^>]*>/gi, "")
                .replace(/<video[^>]*>/gi, "")
                .trim();
              
              if (mediaFileId && !mediaSentSeparately) {
                if (htmlContent.length <= 1024) {
                  // Отправляем как нативное медиа с описанием
                  const sendParams = {
                    chat_id: channelChatId,
                    caption: htmlContent,
                    parse_mode: "HTML"
                  };
                  if (mediaType === "photo") {
                    result = await bot.api.sendPhoto(channelChatId, mediaFileId, sendParams);
                  } else if (mediaType === "video") {
                    result = await bot.api.sendVideo(channelChatId, mediaFileId, sendParams);
                  } else if (mediaType === "animation") {
                    result = await bot.api.sendAnimation(channelChatId, mediaFileId, sendParams);
                  } else if (mediaType === "document") {
                    result = await bot.api.sendDocument(channelChatId, mediaFileId, sendParams);
                  }
                } else {
                  // Текст слишком длинный (>1024) -> используем скрытую ссылку на загруженное медиа
                  let textWithMedia = htmlContent;
                  if (htmlTag && htmlTag.includes("src=")) {
                    const srcMatch = htmlTag.match(/src="([^"]+)"/);
                    if (srcMatch && srcMatch[1]) {
                      const directUrl = srcMatch[1];
                      textWithMedia = `<a href="${directUrl}">&#160;</a>${htmlContent}`;
                    }
                  }
                  
                  result = await bot.api.sendMessage(channelChatId, textWithMedia, {
                    parse_mode: "HTML",
                    link_preview_options: {
                      is_disabled: false,
                      prefer_large_media: true,
                      show_above_text: true
                    }
                  });
                }
              } else {
                // Нет медиа -> просто текстовое сообщение
                result = await bot.api.sendMessage(channelChatId, htmlContent, {
                  parse_mode: "HTML",
                  link_preview_options: {
                    is_disabled: true
                  }
                });
              }
            }
            
            const postLink = result.chat.username 
              ? `https://t.me/${result.chat.username}/${result.message_id}`
              : `https://t.me/c/${String(result.chat.id).replace("-100", "")}/${result.message_id}`;
            
            let successMsg = `✅ Пост успешно опубликован в канале!\nСсылка: ${postLink}`;
            if (mediaSentSeparately) {
              const mediaNameRu = mediaTypeSent === "photo" ? "картинка" : mediaTypeSent === "video" ? "видео" : mediaTypeSent === "animation" ? "анимация" : "документ";
              successMsg += `\n\n⚠️ Обратите внимание: из-за ошибки временного хостинга медиа-файлов ${mediaNameRu} было отправлено отдельным сообщением перед текстом.`;
            }
            
            await ctx.reply(successMsg);
            logger.info(`[Publishing] Post successfully published. Message ID: ${result.message_id}`);
          } catch (err) {
            logger.error(`[Publishing] Failed to publish: ${err.message}`);
            await ctx.reply(`❌ Ошибка публикации: ${err.message}`);
          }
        } else {
          // Если это просто текст в личку без /post и без реплая
          await ctx.reply("Не вижу, кому отправить ответ. Нажмите Reply на уведомление от пользователя, либо используйте `/post <текст>` для публикации поста в канал.");
        }
      }
      return;
    } else {
      // Пользователь пишет боту в личку → пересылаем владельцу
      const primaryOwnerId = config.ownerUserIds[0];
      logger.info(
        `[Relay User→Owner] sender=${anonymizeId(fromId)} owner=${anonymizeId(primaryOwnerId)} type=${msg.text ? "text" : "media"}`
      );

      if (!primaryOwnerId) {
        logger.error("[Relay Error] OWNER_USER_IDS не задан в .env!");
        await ctx.reply("Извините, бот временно недоступен.");
        return;
      }

      try {
        const header = `📨 Сообщение от ${username} (ID: ${fromId})`;
        if (msg.text) {
          const sent = await bot.api.sendMessage(primaryOwnerId, `${header}:\n\n${msg.text}`);
          storeRelayTarget(sent.message_id, fromId);
          logger.info("[Relay OK] Текст переслан владельцу");
        } else {
          const sent = await bot.api.sendMessage(
            primaryOwnerId,
            `${header}\n_Для ответа сделайте Reply (Ответить) на ЭТО сообщение_`,
            { parse_mode: "Markdown" }
          );
          storeRelayTarget(sent.message_id, fromId);
          await ctx.copyMessage(primaryOwnerId);
          logger.info("[Relay OK] Медиа переслано владельцу");
        }
        await ctx.reply("✅ Ваше сообщение отправлено администратору. Ожидайте ответа.");
      } catch (e) {
        logger.error(`[Relay Error] Не удалось переслать владельцу: ${e.message}`);
        await ctx.reply("Извините, произошла ошибка. Попробуйте позже.");
      }
      return;
    }
  }
  // --- Конец режима Relay ---

  // Кэшируем автоматические форварды постов канала и пишем первый комментарий
  if (isRealAutoForwardedChannelPost(msg) && isAllowedChat(msg.chat.id)) {
    cacheChannelPost(msg);
    await maybeReplyToPost(ctx);
    return; // не нужно обрабатывать дальше как обычное сообщение
  }

  // Debug-лог для всех остальных сообщений
  logger.debug(
    `[DEBUG] chat=${msg.chat.id} allowed=${isAllowedChat(msg.chat.id)} auto_forward=${Boolean(msg.is_automatic_forward)} sender_chat=${msg.sender_chat?.type || "none"} has_text=${Boolean(msg.text || msg.caption)}`
  );

  return next(); // ВАЖНО: передаём управление следующему обработчику
});

// ─── команды ─────────────────────────────────────────────────────────────────

bot.command("status", async (ctx) => {
  if (!isOwner(ctx.from.id)) return;
  const u = state.usage;
  await ctx.reply([
    `auto_reply: ${state.autoReplyEnabled ? "on" : "off"}`,
    `provider: ${config.llmProvider}`,
    `model: ${config.activeLlmModel}`,
    `requests: ${u.requests}`,
    `tokens_total: ${u.totalTokens}`,
    `posts_cached: ${Object.keys(posts.cache).length}`
  ].join("\n"));
});

bot.command("on", async (ctx) => {
  if (!isOwner(ctx.from.id)) return;
  state.autoReplyEnabled = true;
  writeState(config.statePath, state);
  await ctx.reply("Автоответы включены.");
});

bot.command("off", async (ctx) => {
  if (!isOwner(ctx.from.id)) return;
  state.autoReplyEnabled = false;
  writeState(config.statePath, state);
  await ctx.reply("Автоответы выключены.");
});

bot.command("usage", async (ctx) => {
  if (!isOwner(ctx.from.id)) return;
  await ctx.reply(JSON.stringify(state.usage, null, 2));
});

bot.command("chatid", async (ctx) => {
  if (!isOwner(ctx.from.id)) return;
  const threadId = ctx.message?.message_thread_id || 0;
  await ctx.reply([
    `chat_id: ${ctx.chat.id}`,
    `chat_type: ${ctx.chat.type}`,
    `thread_id: ${threadId}`
  ].join("\n"));
});

// ─── обработчик текстовых сообщений ──────────────────────────────────────────

bot.on("message:text", async (ctx) => {
  // Пропускаем автоматические форварды (они уже обработаны выше)
  if (ctx.message?.is_automatic_forward) return;

  try {
    const message = ctx.message || ctx.msg;
    if (!message) return;
    logger.debug(`[Msg] chat=${ctx.chat.id} user=${anonymizeId(ctx.from?.id)} has_text=${Boolean(message.text)}`);
    await maybeReply(ctx);
  } catch (error) {
    logger.error("[Error]", error);
  }
});

bot.on("message", async (ctx) => {
  const message = ctx.message || ctx.msg;
  if (!message) return;
  if (message.is_automatic_forward) return;
  if (!message.sender_chat) return;

  const text = sanitizeText(message.text || message.caption || "");
  if (!text) return;

  try {
    logger.debug(`[MsgFallback] chat=${ctx.chat.id} sender_chat=${message.sender_chat?.type || "none"}`);
    await maybeReply(ctx);
  } catch (error) {
    logger.error("[FallbackError]", error);
  }
});

bot.catch((error) => {
  logger.error("[BotError]", error.error);
});

// Graceful shutdown - сохраняем состояние при остановке
function gracefulShutdown() {
  logger.info("🔄 Сохраняю состояние перед остановкой...");
  try {
    writeState(config.statePath, state);
    logger.info("✅ Состояние сохранено");
  } catch (error) {
    logger.error(`❌ Ошибка сохранения состояния: ${error.message}`);
  }
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('uncaughtException', (error) => {
  logger.error("❌ Uncaught Exception:", error);
  gracefulShutdown();
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown();
});

bot.start({
  onStart(botInfo) {
    logger.info(`✓ Bot started as @${botInfo.username}`);
    logger.info(`  Allowed chats: ${config.allowAllChats ? "all" : config.allowedChatIds.join(", ")}`);
    logger.info(`  LLM: ${config.llmProvider} / ${config.activeLlmModel}`);
    logger.info(`  Posts cached: ${Object.keys(posts.cache).length}`);
  }
});
