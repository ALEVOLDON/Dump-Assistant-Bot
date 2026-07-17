const fs = require("fs");
const { Bot } = require("grammy");
const config = require("./core/config");
const { readState, writeState, flushStateWrite } = require("./core/state");
const { PostCache } = require("./services/posts");
const { createThreadStore } = require("./utils/thread");
const { ensureRelayState } = require("./utils/relay");
const { createReplyHandler } = require("./services/reply");
const { createAutoCommentHandler } = require("./services/autoComment");
const { registerCommands } = require("./handlers/commands");
const { registerMessageHandlers } = require("./handlers/messages");
const { logger } = require("./core/logger");
const { startServer } = require("./core/server");

if (!config.telegramBotToken) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN in .env");
}

if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

const promptText = fs.readFileSync(config.promptPath, "utf8");
const bot = new Bot(config.telegramBotToken);
const state = readState(config.statePath);

// Восстановление динамических настроек из состояния в конфиг
if (state.llmProvider) {
  config.llmProvider = state.llmProvider;
  config.activeLlmModel = state.activeLlmModel;
  if (config.llmProvider === "gemini") {
    config.geminiModel = config.activeLlmModel;
  } else if (config.llmProvider === "openai") {
    config.openAiModel = config.activeLlmModel;
  } else if (config.llmProvider === "ollama") {
    config.ollamaModel = config.activeLlmModel;
  }
}
if (state.maxReplyChars !== undefined) {
  config.maxReplyChars = state.maxReplyChars;
}
if (state.threadCooldownMs !== undefined) {
  config.threadCooldownMs = state.threadCooldownMs;
}

const posts = new PostCache(config.postsPath);
const { rememberMessage, getRecentMessages } = createThreadStore(config, state);

if (state.autoReplyEnabled === undefined) {
  state.autoReplyEnabled = config.autoReplyEnabled;
  writeState(config.statePath, state);
}
ensureRelayState(state);

const { maybeReply, trimReply, isRecoverableLlmError, storeUsage } = createReplyHandler({
  config,
  state,
  posts,
  promptText,
  bot,
  rememberMessage,
  getRecentMessages
});

const { maybeReplyToPost } = createAutoCommentHandler({
  config,
  state,
  rememberMessage,
  trimReply,
  isRecoverableLlmError,
  storeUsage
});

registerCommands(bot, { config, state, posts });
registerMessageHandlers(bot, {
  config,
  state,
  posts,
  maybeReply,
  maybeReplyToPost
});

bot.catch((error) => {
  logger.error("[BotError]", error.error);
});

function gracefulShutdown() {
  logger.info("🔄 Сохраняю состояние перед остановкой...");
  try {
    flushStateWrite();
    writeState(config.statePath, state);
    logger.info("✅ Состояние сохранено");
  } catch (error) {
    logger.error(`❌ Ошибка сохранения состояния: ${error.message}`);
  }
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
process.on("uncaughtException", (error) => {
  logger.error("❌ Uncaught Exception:", error);
  gracefulShutdown();
});
process.on("unhandledRejection", (reason, promise) => {
  logger.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown();
});

bot.start({
  async onStart(botInfo) {
    logger.info(`✓ Bot started as @${botInfo.username}`);
    logger.info(`  Allowed chats: ${config.allowAllChats ? "all" : config.allowedChatIds.join(", ")}`);
    logger.info(`  LLM: ${config.llmProvider} / ${config.activeLlmModel}`);
    logger.info(`  Posts cached: ${Object.keys(posts.cache).length}`);
    
    try {
      await bot.api.setMyCommands([
        { command: "status", description: "Показать текущий статус и настройки бота" },
        { command: "on", description: "Включить автоответы" },
        { command: "off", description: "Выключить автоответы" },
        { command: "ephemeral", description: "Вкл/выкл приватные ответы в группе" },
        { command: "usage", description: "Показать детализированную статистику токенов" },
        { command: "chatid", description: "Показать ID чата и треда" }
      ]);
      logger.info("✓ Список команд Telegram успешно обновлен");
    } catch (error) {
      logger.error("❌ Ошибка при установке команд Telegram:", error);
    }
    
    // Запуск HTTP API-сервера
    startServer({ config, state, posts, bot });
  }
});