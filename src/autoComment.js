const { createAssistantDecision } = require("./llm");
const { sendRichMessageWithFallback } = require("./rich");
const { extractUrls, fetchUrlContent } = require("./fetcher");
const { extractText } = require("./message");
const { logger } = require("./logger");

const AUTO_COMMENT_SYSTEM_PROMPT = `Ты — умный и харизматичный ИИ-ассистент этого Telegram-канала.
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

function createAutoCommentHandler({ config, state, rememberMessage, trimReply, isRecoverableLlmError, storeUsage }) {
  async function maybeReplyToPost(ctx) {
    if (!state.autoReplyEnabled) return;
    const message = ctx.message || ctx.msg;
    const text = extractText(message);
    if (!text) return;

    logger.info(`[AutoComment] Generating first comment for post: ${message.message_id}`);

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
          logger.warn("[AutoComment] Failed to load context from URL");
        }
      }
    }

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
        systemPrompt: AUTO_COMMENT_SYSTEM_PROMPT,
        userPrompt,
        forceReply: true
      });

      storeUsage(state, response.usage);
      const replyText = trimReply(config, response.result.reply_text || "");
      if (replyText) {
        await sendRichMessageWithFallback(ctx, replyText, message.message_id);
        logger.info(`[AutoComment Reply] post=${message.message_id}`);
        rememberMessage(message, "assistant", replyText);
      }
    } catch (error) {
      if (!isRecoverableLlmError(error)) throw error;
      logger.error(`[LLM Error AutoComment] ${error.message}`);
    }
  }

  return { maybeReplyToPost };
}

module.exports = { createAutoCommentHandler, AUTO_COMMENT_SYSTEM_PROMPT };