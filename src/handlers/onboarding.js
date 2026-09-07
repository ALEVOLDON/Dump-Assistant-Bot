const { InlineKeyboard } = require("grammy");
const { isOwner } = require("../utils/access");
const { logger } = require("../core/logger");

// Хранилище временных состояний гостей: ожидание ввода сообщения для админа
// userId -> timestamp
const pendingAdminContacts = new Map();
const PENDING_TTL_MS = 15 * 60 * 1000; // 15 минут

// Cooldown для аудита сообщений гостей владельцу, чтобы избежать флуда
// userId -> timestamp
const auditCooldowns = new Map();
const AUDIT_COOLDOWN_MS = 60 * 1000; // 1 минута на пользователя

function setPendingContact(userId) {
  pendingAdminContacts.set(userId, Date.now());
}

function isPendingContact(userId) {
  const time = pendingAdminContacts.get(userId);
  if (!time) return false;
  if (Date.now() - time > PENDING_TTL_MS) {
    pendingAdminContacts.delete(userId);
    return false;
  }
  return true;
}

function clearPendingContact(userId) {
  pendingAdminContacts.delete(userId);
}

function shouldSendAudit(userId, cooldownMs = AUDIT_COOLDOWN_MS) {
  const now = Date.now();
  const last = auditCooldowns.get(userId) || 0;
  if (now - last < cooldownMs) {
    return false;
  }
  auditCooldowns.set(userId, now);
  return true;
}

function formatAuditMessage(fromUser, userText, botReplySummary) {
  const username = fromUser.username ? `@${fromUser.username}` : (fromUser.first_name || "Пользователь");
  const userId = fromUser.id;
  return [
    `📋 [Audit DM] от ${username} (ID: ${userId})`,
    `👤 Сообщение: "${userText}"`,
    `🤖 Действие бота: ${botReplySummary}`,
    `\n_Чтобы ответить пользователю, сделайте Reply (Ответить) на это сообщение._`
  ].join("\n");
}

function getChannelUrl(channelUsername) {
  const clean = (channelUsername || "dump_dump").replace(/^@/, "");
  return `https://t.me/${clean}`;
}

function getGuestWelcomeText(channelUsername) {
  const channel = (channelUsername || "dump_dump").replace(/^@/, "");
  return [
    `👋 Привет! Я AI-ассистент канала [@${channel}](https://t.me/${channel}).`,
    ``,
    `Здесь публикуются разборы, ссылки и материалы по IT и технологиям. Я помогаю отвечать на вопросы читателей прямо в обсуждениях публикаций.`,
    ``,
    `Выберите действие ниже:`
  ].join("\n");
}

function getGuestAboutText(channelUsername) {
  const channel = (channelUsername || "dump_dump").replace(/^@/, "");
  return [
    `ℹ️ *Что умеет ассистент:*`,
    ``,
    `• *Отвечать в комментариях*: в обсуждениях под постами [@${channel}](https://t.me/${channel}) я отвечаю на вопросы, объясняю технические термины и цитирую факты из статей.`,
    `• *Разбирать ссылки*: читаю содержимое веб-страниц, упомянутых в публикациях, и даю краткую выжимку.`,
    `• *Связывать с автором*: если у вас есть предложение или вопрос создателю канала — используйте кнопку «Написать админу».`,
    ``,
    `💡 *Основная работа бота происходит в комментариях к постам канала.*`
  ].join("\n");
}

function getGuestAskText(channelUsername) {
  const channel = (channelUsername || "dump_dump").replace(/^@/, "");
  return [
    `❓ *Как задать вопрос:*`,
    ``,
    `ИИ-ассистент лучше всего ориентируется в контексте конкретных тем, поэтому ответы работают в комментариях канала:`,
    ``,
    `1. Откройте канал [@${channel}](https://t.me/${channel}).`,
    `2. Найдите нужный пост и откройте «Комментарии».`,
    `3. Задайте ваш вопрос (или упомяните @бот). Я отвечу с учётом темы публикации!`,
    ``,
    `Если у вас личный вопрос создателю канала — нажмите «Написать админу» ниже.`
  ].join("\n");
}

function getGuestContactText() {
  return [
    `✍️ *Связь с администратором канала*`,
    ``,
    `Напишите ваше сообщение следующим ответом в этот чат (можно прикрепить текст или медиа).`,
    `Я сразу передам его автору канала.`,
    ``,
    `_Для отмены нажмите кнопку ниже._`
  ].join("\n");
}

function getOwnerWelcomeText(config, state) {
  const autoReply = state?.autoReplyEnabled ? "🟢 Включены" : "🔴 Выключены";
  return [
    `👑 *Панель управления Dump Assistant*`,
    ``,
    `Вы авторизованы как владелец бота.`,
    `Автоответы в комментариях: ${autoReply}`,
    `Провайдер LLM: \`${config.llmProvider}\` (${config.activeLlmModel})`,
    ``,
    `*Основные команды:*`,
    `• \`/post <текст>\` — опубликовать пост в канал`,
    `• \`/article <текст>\` — статья на Telegraph (Instant View)`,
    `• \`/status\` — подробный статус и метрики`,
    `• \`/on\` / \`/off\` — включить/выключить автоответы`,
    `• \`/usage\` — статистика расхода токенов`,
    `• \`/chatid\` — узнать ID текущего чата`,
    ``,
    `_Чтобы ответить на сообщение пользователя, сделайте обычный Telegram Reply на пересланное уведомление._`
  ].join("\n");
}

function buildGuestMainKeyboard(channelUsername) {
  return new InlineKeyboard()
    .text("ℹ️ Что умеет бот", "onboarding:about")
    .url("📢 Открыть канал", getChannelUrl(channelUsername))
    .row()
    .text("❓ Задать вопрос", "onboarding:ask")
    .text("✍️ Написать админу", "onboarding:contact_admin");
}

function buildGuestAboutKeyboard(channelUsername) {
  return new InlineKeyboard()
    .url("📢 Перейти в канал", getChannelUrl(channelUsername))
    .text("✍️ Написать админу", "onboarding:contact_admin")
    .row()
    .text("« Назад в меню", "onboarding:menu");
}

function buildGuestAskKeyboard(channelUsername) {
  return new InlineKeyboard()
    .url("📢 Перейти в канал", getChannelUrl(channelUsername))
    .text("✍️ Написать админу", "onboarding:contact_admin")
    .row()
    .text("« Назад в меню", "onboarding:menu");
}

function buildGuestCancelKeyboard() {
  return new InlineKeyboard()
    .text("« Отмена", "onboarding:cancel_contact");
}

function buildOwnerMainKeyboard(webAppUrl) {
  const keyboard = new InlineKeyboard();
  if (webAppUrl) {
    keyboard.webApp("🛠 Панель управления (Mini App)", webAppUrl).row();
  }
  keyboard.text("📊 Проверить статус", "onboarding:owner_status");
  return keyboard;
}

function registerOnboardingHandlers(bot, deps) {
  const { config, state, posts } = deps;

  // Обработчик команды /start
  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const fromId = ctx.from?.id;

    if (isOwner(config, fromId)) {
      await ctx.reply(getOwnerWelcomeText(config, state), {
        parse_mode: "Markdown",
        reply_markup: buildOwnerMainKeyboard(config.webAppUrl)
      });
      return;
    }

    // Сбрасываем режим связи с админом, если был активен
    clearPendingContact(fromId);

    await ctx.reply(getGuestWelcomeText(config.channelUsername), {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      reply_markup: buildGuestMainKeyboard(config.channelUsername)
    });
  });

  // Обработчики Inline-кнопок
  bot.callbackQuery(/^onboarding:/, async (ctx) => {
    const action = ctx.callbackQuery.data;
    const fromId = ctx.from?.id;
    const isUserOwner = isOwner(config, fromId);

    try {
      await ctx.answerCallbackQuery();
    } catch (e) {
      // Игнорируем устаревший query
    }

    if (action === "onboarding:menu") {
      clearPendingContact(fromId);
      try {
        await ctx.editMessageText(getGuestWelcomeText(config.channelUsername), {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
          reply_markup: buildGuestMainKeyboard(config.channelUsername)
        });
      } catch (e) {
        // Если сообщение не изменилось
      }
      return;
    }

    if (action === "onboarding:about") {
      clearPendingContact(fromId);
      try {
        await ctx.editMessageText(getGuestAboutText(config.channelUsername), {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
          reply_markup: buildGuestAboutKeyboard(config.channelUsername)
        });
      } catch (e) {
        // Игнорируем ошибку одинакового контента
      }
      return;
    }

    if (action === "onboarding:ask") {
      clearPendingContact(fromId);
      try {
        await ctx.editMessageText(getGuestAskText(config.channelUsername), {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
          reply_markup: buildGuestAskKeyboard(config.channelUsername)
        });
      } catch (e) {
        // Игнорируем ошибку одинакового контента
      }
      return;
    }

    if (action === "onboarding:contact_admin") {
      setPendingContact(fromId);
      try {
        await ctx.editMessageText(getGuestContactText(), {
          parse_mode: "Markdown",
          reply_markup: buildGuestCancelKeyboard()
        });
      } catch (e) {
        await ctx.reply(getGuestContactText(), {
          parse_mode: "Markdown",
          reply_markup: buildGuestCancelKeyboard()
        });
      }
      return;
    }

    if (action === "onboarding:cancel_contact") {
      clearPendingContact(fromId);
      try {
        await ctx.editMessageText(getGuestWelcomeText(config.channelUsername), {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
          reply_markup: buildGuestMainKeyboard(config.channelUsername)
        });
      } catch (e) {
        // Игнорируем ошибку
      }
      return;
    }

    if (action === "onboarding:owner_status") {
      if (!isUserOwner) return;
      const u = state?.usage || { requests: 0, totalTokens: 0 };
      const statusText = [
        `📊 *Текущий статус:*`,
        `• Автоответы: ${state.autoReplyEnabled ? "ON" : "OFF"}`,
        `• Провайдер: ${config.llmProvider} (${config.activeLlmModel})`,
        `• Запросов: ${u.requests}`,
        `• Токенов: ${u.totalTokens}`,
        `• Постов в кэше: ${posts?.cache ? Object.keys(posts.cache).length : 0}`
      ].join("\n");

      await ctx.reply(statusText, { parse_mode: "Markdown" });
      return;
    }
  });
}

module.exports = {
  registerOnboardingHandlers,
  setPendingContact,
  isPendingContact,
  clearPendingContact,
  shouldSendAudit,
  formatAuditMessage,
  getGuestWelcomeText,
  getGuestAboutText,
  getGuestAskText,
  getGuestContactText,
  getOwnerWelcomeText,
  buildGuestMainKeyboard,
  buildGuestAboutKeyboard,
  buildGuestAskKeyboard,
  buildGuestCancelKeyboard,
  buildOwnerMainKeyboard
};
