const { createAssistantDecision } = require("../llm/llm");
const { sendRichMessageWithFallback } = require("./rich");
const { analyzeMessage } = require("../utils/analysis");
const { getPostContext, buildUserPrompt } = require("../utils/context");
const { getThreadKey, sanitizeText, extractText } = require("../utils/message");
const { scheduleStateWrite } = require("../core/state");
const { logger } = require("../core/logger");

function trimReply(config, text) {
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

function storeUsage(state, usage) {
  state.usage.requests += 1;
  state.usage.promptTokens += usage.promptTokens;
  state.usage.completionTokens += usage.completionTokens;
  state.usage.totalTokens += usage.totalTokens;
}

function createReplyHandler({ config, state, posts, promptText, bot, rememberMessage, getRecentMessages }) {
  async function maybeReply(ctx) {
    const message = ctx.message || ctx.msg;
    if (!message) return;

    const text = sanitizeText(extractText(message));
    const decision = analyzeMessage(config, state, message, text);

    if (!decision.skip) {
      rememberMessage(message, "user", text);
    }

    if (decision.skip) {
      logger.debug(`Skip thread=${getThreadKey(message)} reason=${decision.reason}`);
      return;
    }

    const { forceReply } = decision;
    const postContext = await getPostContext(config, posts, message, text);

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
        userPrompt: buildUserPrompt(config, message, text, forceReply, postContext, getRecentMessages),
        forceReply
      });

      result = response.result;
      storeUsage(state, response.usage);

      if (!result.should_reply) {
        logger.debug(`Silent thread=${getThreadKey(message)} reason=${result.reason || "llm_no"}`);
        scheduleStateWrite(config.statePath, state);
        return;
      }

      replyText = trimReply(config, result.reply_text || "");
    } catch (error) {
      if (!isRecoverableLlmError(error)) throw error;
      logger.error(`LLM Error: ${error.message}`);
      if (forceReply) {
        replyText = "На связи. Напишите вопрос подробнее.";
      }
    }

    if (!replyText) {
      logger.debug(`Silent thread=${getThreadKey(message)} reason=empty_reply`);
      scheduleStateWrite(config.statePath, state);
      return;
    }

    const receiverUserId = (state.ephemeralRepliesEnabled && message.chat.type !== "private") ? message.from?.id : null;
    await sendRichMessageWithFallback(ctx, replyText, message.message_id, receiverUserId);
    logger.info(`Reply sent thread=${getThreadKey(message)} force=${forceReply} ephemeral=${Boolean(receiverUserId)}`);

    const notifyOwnerId = config.ownerUserIds[0];
    if (notifyOwnerId && message.chat.type !== "private") {
      const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const authorName = message.from?.username
        ? `@${message.from.username}`
        : (message.from?.first_name || `ID:${message.from?.id}`);
      const chatTitle = message.chat.title || String(message.chat.id);
      const fromId = message.from?.id;
      const notifyText =
        `🔔 <b>Ответил в группе</b> (${esc(chatTitle)})${state.ephemeralRepliesEnabled ? " (приватно)" : ""}\n` +
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

    rememberMessage(message, "assistant", replyText);
    state.threads[getThreadKey(message)] = {
      lastReplyAt: Date.now(),
      lastReason: result?.reason || "forced_or_fallback",
      lastRisk: result?.risk || "low"
    };
    scheduleStateWrite(config.statePath, state);
  }

  return { maybeReply, trimReply, isRecoverableLlmError, storeUsage };
}

module.exports = { createReplyHandler, trimReply, isRecoverableLlmError, storeUsage };