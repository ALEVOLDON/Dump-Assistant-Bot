const { marked } = require("marked");
const config = require("./config");

// Настройка marked
marked.use({
  mangle: false,
  headerIds: false,
  breaks: true
});

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
    // Конвертируем Markdown в HTML
    const htmlContent = marked.parse(text).trim();
    
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
    
    // Стандартный фолбэк на ctx.reply (без парсинга таблиц, но текст дойдет гарантированно)
    await ctx.reply(text, {
      reply_parameters: {
        message_id: replyToMessageId
      }
    });
  }
}

module.exports = {
  sendRichMessageWithFallback
};
