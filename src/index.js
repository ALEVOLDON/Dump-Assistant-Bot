
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
let botOptions = {};
if (process.env.SOCKS_PROXY) {
  try {
    const { SocksProxyAgent } = require("socks-proxy-agent");
    botOptions = {
      client: {
        baseFetchConfig: {
          agent: new SocksProxyAgent(process.env.SOCKS_PROXY),
        },
      },
    };
  } catch (e) {
    console.warn("socks-proxy-agent not available, proceeding without proxy");
  }
}

const bot = new Bot(config.telegramBotToken, botOptions);
const state = readState(config.statePath);

// Восстановление динамических настроек из состояния в конфиг
if (state.llmProvider) {
  config.llmProvider = state.llmProvider;
}

if (config.llmProvider === "gemini") {
  if (state.activeLlmModel) {
    config.geminiModel = state.activeLlmModel;
  } else if (process.env.GEMINI_MODEL) {
    config.geminiModel = process.env.GEMINI_MODEL;
  }
  config.activeLlmModel = config.geminiModel;
  state.activeLlmModel = config.geminiModel;
} else if (config.llmProvider === "openai") {
  if (state.activeLlmModel) {
    config.openAiModel = state.activeLlmModel;
  } else if (process.env.OPENAI_MODEL) {
    config.openAiModel = process.env.OPENAI_MODEL;
  }
  config.activeLlmModel = config.openAiModel;
  state.activeLlmModel = config.openAiModel;
} else if (config.llmProvider === "ollama") {
  if (state.activeLlmModel) {
    config.ollamaModel = state.activeLlmModel;
  } else if (process.env.OLLAMA_MODEL) {
    config.ollamaModel = process.env.OLLAMA_MODEL;
  }
  config.activeLlmModel = config.ollamaModel;
  state.activeLlmModel = config.ollamaModel;
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
      // Удаляем глобальные команды для всех пользователей
      await bot.api.deleteMyCommands({ scope: { type: "default" } });
      logger.info("✓ Глобальный список команд Telegram очищен");

      const adminCommands = [
        { command: "status", description: "Показать текущий статус и настройки бота" },
        { command: "on", description: "Включить автоответы" },
        { command: "off", description: "Выключить автоответы" },
        { command: "ephemeral", description: "Вкл/выкл приватные ответы в группе" },
        { command: "usage", description: "Показать детализированную статистику токенов" },
        { command: "chatid", description: "Показать ID чата и треда" }
      ];

      // Устанавливаем команды персонально для каждого владельца в его ЛС с ботом
      for (const ownerId of config.ownerUserIds) {
        try {
          await bot.api.setMyCommands(adminCommands, {
            scope: { type: "chat", chat_id: ownerId }
          });
          logger.info(`✓ Список команд Telegram установлен для владельца ${ownerId}`);
        } catch (error) {
          logger.error(`❌ Ошибка при установке команд для владельца ${ownerId}:`, error);
        }
      }
    } catch (error) {
      logger.error("❌ Ошибка при настройке команд Telegram:", error);
    }
    
    // Запуск HTTP API-сервера
    startServer({ config, state, posts, bot });
  }
});