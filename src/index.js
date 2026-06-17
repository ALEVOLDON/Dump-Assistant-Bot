const fs = require("fs");
const { Bot } = require("grammy");
const config = require("./config");
const { readState, writeState } = require("./state");
const { PostCache } = require("./posts");
const { createThreadStore } = require("./thread");
const { ensureRelayState } = require("./relay");
const { createReplyHandler } = require("./reply");
const { createAutoCommentHandler } = require("./autoComment");
const { registerCommands } = require("./handlers/commands");
const { registerMessageHandlers } = require("./handlers/messages");
const { flushStateWrite } = require("./stateWrite");
const { logger } = require("./logger");

if (!config.telegramBotToken) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN in .env");
}

if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

const promptText = fs.readFileSync(config.promptPath, "utf8");
const bot = new Bot(config.telegramBotToken);
const state = readState(config.statePath);
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
  onStart(botInfo) {
    logger.info(`✓ Bot started as @${botInfo.username}`);
    logger.info(`  Allowed chats: ${config.allowAllChats ? "all" : config.allowedChatIds.join(", ")}`);
    logger.info(`  LLM: ${config.llmProvider} / ${config.activeLlmModel}`);
    logger.info(`  Posts cached: ${Object.keys(posts.cache).length}`);
  }
});