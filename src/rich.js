const { marked } = require("marked");
const config = require("./config");

// Custom renderer for marked to format text appropriately for Telegram Rich Message
const renderer = {
  paragraph(arg) {
    const inlineHtml = this.parser.parseInline(arg.tokens);
    return `<p>${inlineHtml}</p>`;
  },
  heading(arg) {
    const inlineHtml = this.parser.parseInline(arg.tokens);
    const level = arg.depth || 3;
    return `<h${level}>${inlineHtml}</h${level}>`;
  }
};

// Настройка marked
marked.use({
  renderer,
  mangle: false,
  headerIds: false,
  breaks: true
});

/**
 * Конвертирует входящий Markdown в HTML для Telegram Rich Messages,
 * учитывая особенности рендеринга нативных списков, таблиц и переносов строк.
 * 
 * @param {string} text - текст Markdown
 * @returns {string} - готовый HTML для отправки
 */
function markdownToHtml(text) {
  if (!text) return "";
  return marked.parse(text).trim();
}

/**
 * Отправляет сообщение как Rich Message (для Telegram Bot API 10.1+).
 * Конвертирует входящий Markdown в HTML для поддержки нативных таблиц и списков.
 * Если метод не поддерживается сервером или происходит ошибка разметки, 
 * автоматически переключается на обычную отправку (fallback).
 * 
 * @param {import("grammy").Context} ctx - контекст сообщения grammY
 * @param {string} text - текст ответа (Markdown)
 * @param {number} replyToMessageId - ID сообщения, на которое отвечаем (для треда)
 */
async function sendRichMessageWithFallback(ctx, text, replyToMessageId) {
  try {
    // Конвертируем Markdown в HTML с помощью единого хелпера
    const htmlContent = markdownToHtml(text);
    
    // Вызов raw-метода через grammY
    await ctx.api.raw.sendRichMessage({
      chat_id: ctx.chat.id,
      rich_message: {
        html: htmlContent
      },
      reply_parameters: {
        message_id: replyToMessageId
      }
    });
    console.log(`[RichMessage] Sent rich HTML message to chat ${ctx.chat.id}`);
  } catch (error) {
    console.warn(`[RichMessage] Failed to send sendRichMessage (${error.message}). Falling back to standard ctx.reply.`);
    
    const isReplyError = error.message && (
      error.message.includes("message to be replied not found") ||
      error.message.includes("reply")
    );

    try {
      if (isReplyError) {
        // Если целевое сообщение не найдено (удалено), отправляем просто в чат без reply
        await ctx.reply(text);
      } else {
        await ctx.reply(text, {
          reply_parameters: {
            message_id: replyToMessageId
          }
        });
      }
    } catch (fallbackError) {
      console.warn(`[RichMessage] Fallback failed (${fallbackError.message}). Trying to send message without reply.`);
      try {
        await ctx.reply(text);
      } catch (finalError) {
        console.error(`[RichMessage] Final send failed: ${finalError.message}`);
        throw finalError;
      }
    }
  }
}

module.exports = {
  markdownToHtml,
  sendRichMessageWithFallback
};

