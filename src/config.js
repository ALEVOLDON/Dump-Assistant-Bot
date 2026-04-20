const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

function parseIdList(value) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function readBoolean(name, fallback) {
  const value = process.env[name];

  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === "true";
}

function readNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

const dataDir = path.join(process.cwd(), "data");

module.exports = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  llmProvider: (process.env.LLM_PROVIDER || "ollama").toLowerCase(),
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  openAiBaseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
  ollamaModel: process.env.OLLAMA_MODEL || "qwen2.5:3b-instruct",
  ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, ""),
  llmTimeoutMs: readNumber("LLM_TIMEOUT_MS", 120000),
  ollamaNumCtx: readNumber("OLLAMA_NUM_CTX", 4096),
  ollamaNumPredict: readNumber("OLLAMA_NUM_PREDICT", 200),
  botUsername: (process.env.BOT_USERNAME || "").replace(/^@/, "").toLowerCase(),
  allowedChatIds: parseIdList(process.env.ALLOWED_CHAT_IDS),
  ownerUserIds: parseIdList(process.env.OWNER_USER_IDS),
  channelAbout: process.env.CHANNEL_ABOUT || "",
  autoReplyEnabled: readBoolean("AUTO_REPLY_ENABLED", true),
  maxReplyChars: readNumber("MAX_REPLY_CHARS", 260),
  threadCooldownMs: readNumber("THREAD_COOLDOWN_MS", 90_000),
  recentMessagesLimit: readNumber("RECENT_MESSAGES_LIMIT", 8),
  urlFetchTimeoutMs: readNumber("URL_FETCH_TIMEOUT_MS", 8000),
  dataDir,
  promptPath: path.join(process.cwd(), "prompts", "assistant.md"),
  statePath: path.join(dataDir, "state.json"),
  postsPath: path.join(dataDir, "posts.json")
};
