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
const llmProvider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();

function getActiveLlmModel(provider, config) {
  if (provider === "gemini") return config.geminiModel;
  if (provider === "openai") return config.openAiModel;
  if (provider === "ollama") return config.ollamaModel;
  return "";
}

module.exports = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  llmProvider,
  // Gemini API
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  geminiBaseUrl: (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, ""),
  // OpenAI API
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
  allowAllChats: readBoolean("ALLOW_ALL_CHATS", false),
  ownerUserIds: parseIdList(process.env.OWNER_USER_IDS),
  channelChatId: process.env.CHANNEL_CHAT_ID || "-1001329670526",
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

// Валидация конфигурации (после создания объекта)
const config = module.exports;
config.activeLlmModel = getActiveLlmModel(config.llmProvider, config);

function validateConfig() {
  const errors = [];
  const validProviders = new Set(["gemini", "openai", "ollama"]);
  
  if (!config.telegramBotToken) {
    errors.push("TELEGRAM_BOT_TOKEN обязателен");
  } else if (!config.telegramBotToken.match(/^\d+:[a-zA-Z0-9_-]{35}$/)) {
    errors.push("TELEGRAM_BOT_TOKEN имеет неверный формат");
  }
  
  if (!config.botUsername) {
    errors.push("BOT_USERNAME обязателен");
  }
  
  if (config.ownerUserIds.length === 0) {
    errors.push("OWNER_USER_IDS должен содержать хотя бы один ID");
  }

  if (config.allowedChatIds.length === 0 && !config.allowAllChats) {
    errors.push("ALLOWED_CHAT_IDS обязателен. Если нужен открытый режим, установите ALLOW_ALL_CHATS=true");
  }

  if (!validProviders.has(config.llmProvider)) {
    errors.push("LLM_PROVIDER должен быть одним из: gemini, openai, ollama");
  }

  if (config.llmProvider === "gemini" && !config.geminiApiKey) {
    errors.push("GEMINI_API_KEY обязателен при LLM_PROVIDER=gemini");
  }
  
  if (config.llmProvider === "openai" && !config.openAiApiKey) {
    errors.push("OPENAI_API_KEY обязателен при LLM_PROVIDER=openai");
  }
  
  if (config.llmProvider === "ollama" && !config.ollamaBaseUrl) {
    errors.push("OLLAMA_BASE_URL обязателен при LLM_PROVIDER=ollama");
  }
  
  if (errors.length > 0) {
    console.error("❌ Ошибки конфигурации:");
    errors.forEach(error => console.error(`  - ${error}`));
    console.error("\nПроверьте файл .env");
    process.exit(1);
  }
}

validateConfig();
