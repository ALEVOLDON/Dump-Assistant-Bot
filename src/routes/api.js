const express = require("express");
const { fetchUrlContent } = require("../services/fetcher");
const { 
  publishToChannel, 
  reformatPostWithLlm, 
  generatePostFromLinkContent 
} = require("../services/publishing");
const { writeState } = require("../core/state");
const { logger } = require("../core/logger");

function createApiRouter({ config, state, posts, bot }) {
  const router = express.Router();
  const { createAuthMiddleware } = require("../middleware/auth");
  const authMiddleware = createAuthMiddleware({ config });

  // Все роуты API требуют валидации Telegram WebApp initData
  router.use(authMiddleware);

  // Получить текущие настройки и статус бота
  router.get("/status", (req, res) => {
    res.json({
      autoReplyEnabled: state.autoReplyEnabled,
      llmProvider: config.llmProvider,
      activeLlmModel: config.activeLlmModel,
      maxReplyChars: config.maxReplyChars,
      threadCooldownMs: config.threadCooldownMs,
      usage: state.usage,
      botInfo: {
        username: config.botUsername,
      },
      channelChatId: config.channelChatId,
      hasChannel: Boolean(config.channelChatId),
      // Информация об авторизованном пользователе
      user: req.user || null
    });
  });

  // Обновить настройки бота
  router.post("/settings", (req, res) => {
    try {
      const { 
        autoReplyEnabled, 
        llmProvider, 
        activeLlmModel, 
        maxReplyChars, 
        threadCooldownMs 
      } = req.body;

      if (autoReplyEnabled !== undefined) {
        state.autoReplyEnabled = Boolean(autoReplyEnabled);
      }

      if (llmProvider !== undefined) {
        const validProviders = new Set(["gemini", "openai", "ollama"]);
        if (!validProviders.has(llmProvider)) {
          return res.status(400).json({ error: "Invalid LLM provider" });
        }
        if (llmProvider === "gemini" && !config.geminiApiKey) {
          return res.status(400).json({ error: "Gemini API key is missing. Add GEMINI_API_KEY to your environment." });
        }
        if (llmProvider === "openai" && !config.openAiApiKey) {
          return res.status(400).json({ error: "OpenAI API key is missing. Add OPENAI_API_KEY to your environment." });
        }
        state.llmProvider = llmProvider;
        config.llmProvider = llmProvider;
      }

      if (activeLlmModel !== undefined) {
        state.activeLlmModel = activeLlmModel;
        config.activeLlmModel = activeLlmModel;
        if (config.llmProvider === "gemini") {
          config.geminiModel = activeLlmModel;
        } else if (config.llmProvider === "openai") {
          config.openAiModel = activeLlmModel;
        } else if (config.llmProvider === "ollama") {
          config.ollamaModel = activeLlmModel;
        }
      }

      if (maxReplyChars !== undefined) {
        const num = Number(maxReplyChars);
        if (Number.isInteger(num) && num > 0) {
          state.maxReplyChars = num;
          config.maxReplyChars = num;
        }
      }

      if (threadCooldownMs !== undefined) {
        const num = Number(threadCooldownMs);
        if (Number.isInteger(num) && num >= 0) {
          state.threadCooldownMs = num;
          config.threadCooldownMs = num;
        }
      }

      // Сохраняем обновленное состояние в файл
      writeState(config.statePath, state);
      logger.info("[API] Settings updated successfully via Web App");

      res.json({
        ok: true,
        settings: {
          autoReplyEnabled: state.autoReplyEnabled,
          llmProvider: config.llmProvider,
          activeLlmModel: config.activeLlmModel,
          maxReplyChars: config.maxReplyChars,
          threadCooldownMs: config.threadCooldownMs
        }
      });
    } catch (err) {
      logger.error("[API] Failed to update settings:", err);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Автоформатирование черновика с помощью ИИ
  router.post("/reformat-post", async (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Text is empty" });
    }

    try {
      logger.info("[API] Reformatting draft via LLM...");
      const reformatted = await reformatPostWithLlm(config, text);
      res.json({ reformatted });
    } catch (err) {
      logger.error("[API] Reformat error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Генерация поста по ссылке с помощью ИИ
  router.post("/generate-post", async (req, res) => {
    const { url } = req.body;
    if (!url || !url.trim()) {
      return res.status(400).json({ error: "URL is empty" });
    }

    try {
      logger.info(`[API] Fetching content for URL: ${url}`);
      const content = await fetchUrlContent(url);
      if (!content) {
        return res.status(400).json({ error: "Failed to extract web content from URL" });
      }

      logger.info("[API] Generating post content from URL via LLM...");
      const generated = await generatePostFromLinkContent(config, url, content);
      res.json({ generated });
    } catch (err) {
      logger.error("[API] Post generation error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Публикация поста в канал
  router.post("/publish", async (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Text is empty" });
    }

    if (!config.channelChatId) {
      return res.status(400).json({ error: "CHANNEL_CHAT_ID is not configured in .env" });
    }

    try {
      logger.info("[API] Publishing post from Web App...");
      // Передаем пустой msg для публикации обычного текста (без прикрепленного медиафайла Telegram)
      const { postLink, mediaSentSeparately } = await publishToChannel(bot, config, text, {});
      res.json({
        ok: true,
        postLink,
        mediaSentSeparately
      });
    } catch (err) {
      logger.error("[API] Publish error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createApiRouter;
