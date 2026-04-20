const fs = require("fs");
const { Bot } = require("grammy");
const config = require("./config");
const { readState, writeState } = require("./state");
const { createAssistantDecision } = require("./llm");
const { PostCache } = require("./posts");
const { extractUrls, fetchUrlContent } = require("./fetcher");

if (!config.telegramBotToken) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN in .env");
}
if (config.llmProvider === "openai" && !config.openAiApiKey) {
  throw new Error("Missing OPENAI_API_KEY in .env for LLM_PROVIDER=openai");
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

if (state.autoReplyEnabled === undefined) {
  state.autoReplyEnabled = config.autoReplyEnabled;
  writeState(config.statePath, state);
}

// ─── helpers ────────────────────────────────────────────────────────────────

function isOwner(userId) {
  return config.ownerUserIds.length === 0 || config.ownerUserIds.includes(userId);
}

function isAllowedChat(chatId) {
  return config.allowedChatIds.length === 0 || config.allowedChatIds.includes(chatId);
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
  if (message.from?.is_bot && fromId !== 1087968824 && fromId !== 136817688) {
    return { skip: true, reason: "bot_message" };
  }

  if (!text) return { skip: true, reason: "empty_text" };
  if (isNoise(text)) return { skip: true, reason: "noise" };

  // Ответ на сообщение бота — всегда обрабатываем
  if (message.reply_to_message?.from?.username?.toLowerCase() === config.botUsername) {
    return { skip: false, forceReply: true };
  }

  // Владелец канала или сообщение от лица самого канала — отвечаем и выполняем команды
  if (isOwner(message.from?.id) || message.sender_chat?.type === "channel") {
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
  const threadState = state.threads[getThreadKey(message)];
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
  if (isOwner(message.from?.id) || message.sender_chat?.type === "channel") {
    authorRole = "ВЛАДЕЛЕЦ КАНАЛА (твой босс)";
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
  lines.push(`Сообщение: ${text}`);
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
  const s = sanitizeText(text);
  return s.length <= config.maxReplyChars ? s : `${s.slice(0, config.maxReplyChars - 1).trimEnd()}…`;
}

function isRecoverableLlmError(error) {
  const msg = String(error?.message || "");
  return (
    msg.includes("Ollama API error") ||
    msg.includes("Ollama timeout") ||
    msg.includes("OpenAI API error") ||
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

  const text = sanitizeText(message.text || message.caption || "");
  const decision = analyzeMessage(message, text);

  rememberMessage(message, "user", text);

  if (decision.skip) {
    console.log(`[Skip] thread=${getThreadKey(message)} reason=${decision.reason}`);
    return;
  }

  const { forceReply } = decision;

  // Параллельно собираем контекст поста и ссылок
  const postContext = await getPostContext(message, text);
  if (postContext.postText) {
    console.log(`[Context] thread=${getThreadKey(message)} post=${postContext.postText.slice(0, 60)}...`);
  }
  if (Object.keys(postContext.urlContents).length > 0) {
    console.log(`[Context] Loaded ${Object.keys(postContext.urlContents).length} URL(s)`);
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
      console.log(`[Silent] thread=${getThreadKey(message)} reason=${result.reason || "llm_no"}`);
      writeState(config.statePath, state);
      return;
    }

    replyText = trimReply(result.reply_text || "");
  } catch (error) {
    if (!isRecoverableLlmError(error)) throw error;
    console.error(`[LLM Error] ${error.message}`);
    if (forceReply) {
      replyText = "На связи. Напишите вопрос подробнее.";
    }
  }

  if (!replyText) {
    console.log(`[Silent] thread=${getThreadKey(message)} reason=empty_reply`);
    writeState(config.statePath, state);
    return;
  }

  await ctx.reply(replyText, { reply_parameters: { message_id: message.message_id } });
  console.log(`[Reply] force=${forceReply} text=${replyText.slice(0, 80)}`);

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
  const text = sanitizeText(message.text || message.caption || "");
  const urls = extractUrls(text);

  // Сохраняем по message_id — это станет thread_id для комментариев
  posts.set(message.message_id, { text, urls, date: message.date * 1000 });
  console.log(`[Post cached] id=${message.message_id} urls=${urls.length} text=${text.slice(0, 60)}`);
}

function isRealAutoForwardedChannelPost(message) {
  if (!message?.is_automatic_forward) return false;
  const text = sanitizeText(message.text || message.caption || "");

  if (message.sender_chat?.type === "channel") return true;
  if (!message.from) return true;
  return false;
}

async function maybeReplyToPost(ctx) {
  if (!state.autoReplyEnabled) return;
  const message = ctx.message || ctx.msg;
  const text = sanitizeText(message.text || message.caption || "");
  if (!text) return; // Нет текста — нечего комментировать

  console.log(`[AutoComment] Generating first comment for post: ${message.message_id}`);

  const systemPrompt = `Ты — умный и харизматичный ИИ-ассистент этого Telegram-канала.
Твоя задача — написать первый комментарий к новому посту автора.
Цель: вовлечь аудиторию в обсуждение, задать интересный вопрос подписчикам по теме поста, либо дать краткий TL;DR (выжимку) или смешную мысль.
Правила:
- Пиши коротко (1-2 предложения максимум).
- Живой тон, без шаблонов "Привет!".
- Общайся как "мы с автором" или как самостоятельный комментатор.`;

  const userPrompt = `=== НОВЫЙ ПОСТ В КАНАЛЕ ===\n${text}\n=== КОНЕЦ ПОСТА ===\n\nНапиши классный первый комментарий к этому посту:`;

  try {
    const response = await createAssistantDecision(config, {
      systemPrompt: systemPrompt,
      userPrompt: userPrompt,
      forceReply: true
    });

    storeUsage(response.usage);
    const replyText = trimReply(response.result.reply_text || "");
    if (replyText) {
      await ctx.reply(replyText, { reply_parameters: { message_id: message.message_id } });
      console.log(`[AutoComment Reply] ${replyText.slice(0, 80)}`);
      // Сохраняем в историю треда, чтобы бот помнил свой комментарий
      rememberMessage(message, "assistant", replyText);
    }
  } catch (error) {
    if (!isRecoverableLlmError(error)) throw error;
    console.error(`[LLM Error AutoComment] ${error.message}`);
  }
}

// DEBUG: логируем всё что приходит в бота
bot.on("message", async (ctx, next) => {
  const msg = ctx.message;
  if (!msg) return;

  // --- Режим "Служба поддержки" (Relay) для личных сообщений ---
  if (ctx.chat.type === "private") {
    const text = sanitizeText(msg.text || msg.caption || "");
    const ownerId = config.ownerUserIds[0];

    if (isOwner(ctx.from?.id)) {
      // Владелец пишет боту в личку
      const replyTo = msg.reply_to_message;
      if (replyTo && replyTo.text && replyTo.text.includes("(ID:")) {
        const match = replyTo.text.match(/\(ID:\s*(\d+)\)/);
        if (match && match[1]) {
          const targetId = parseInt(match[1]);
          try {
            await ctx.copyMessage(targetId);
            await ctx.reply("✅ Ответ отправлен пользователю.");
          } catch (e) {
            await ctx.reply(`❌ Ошибка отправки: ${e.message}`);
          }
        }
      }
      return; // Игнорируем обычные сообщения владельца в личке
    } else {
      // Пользователь пишет боту в личку
      if (config.ownerUserIds && config.ownerUserIds.length > 0) {
        try {
          const username = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || "Пользователь");
          const header = `📨 Сообщение от ${username} (ID: ${ctx.from?.id})`;
          
          for (const adminId of config.ownerUserIds) {
            try {
              if (msg.text) {
                 await bot.api.sendMessage(adminId, `${header}:\n\n${msg.text}`);
              } else {
                 await bot.api.sendMessage(adminId, `${header}\n_Для ответа сделайте Reply (Ответить) на ЭТО сообщение_`, { parse_mode: "Markdown" });
                 await ctx.copyMessage(adminId);
              }
            } catch (err) {
              console.error(`[Relay Error for Admin ${adminId}] ${err.message}`);
            }
          }
          await ctx.reply("✅ Ваше сообщение отправлено администратору. Ожидайте ответа.");
        } catch (e) {
          console.error(`[Relay Error] ${e.message}`);
        }
      }
      return; // Завершаем обработку, чтобы не дергать LLM
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
  const text = sanitizeText(msg.text || msg.caption || "");
  console.log(`[DEBUG] chat=${msg.chat.id} allowed=${isAllowedChat(msg.chat.id)} auto_forward=${Boolean(msg.is_automatic_forward)} sender_chat=${msg.sender_chat?.type || "none"} from=${msg.from?.id || "none"} is_bot=${msg.from?.is_bot} text="${text.slice(0, 60)}"`);

  return next(); // ВАЖНО: передаём управление следующему обработчику
});

// ─── команды ─────────────────────────────────────────────────────────────────

bot.command("status", async (ctx) => {
  if (!isOwner(ctx.from.id)) return;
  const u = state.usage;
  await ctx.reply([
    `auto_reply: ${state.autoReplyEnabled ? "on" : "off"}`,
    `provider: ${config.llmProvider}`,
    `model: ${config.llmProvider === "ollama" ? config.ollamaModel : config.openAiModel}`,
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
    console.log(`[Msg] chat=${ctx.chat.id} user=${ctx.from?.id} text=${sanitizeText(message.text).slice(0, 100)}`);
    await maybeReply(ctx);
  } catch (error) {
    console.error("[Error]", error);
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
    console.log(`[MsgFallback] chat=${ctx.chat.id} sender_chat=${message.sender_chat?.type || "none"} text=${text.slice(0, 100)}`);
    await maybeReply(ctx);
  } catch (error) {
    console.error("[FallbackError]", error);
  }
});

bot.catch((error) => {
  console.error("[BotError]", error.error);
});

bot.start({
  onStart(botInfo) {
    console.log(`✓ Bot started as @${botInfo.username}`);
    console.log(`  Allowed chats: ${config.allowedChatIds.length ? config.allowedChatIds.join(", ") : "all"}`);
    console.log(`  LLM: ${config.llmProvider} / ${config.llmProvider === "ollama" ? config.ollamaModel : config.openAiModel}`);
    console.log(`  Posts cached: ${Object.keys(posts.cache).length}`);
  }
});
