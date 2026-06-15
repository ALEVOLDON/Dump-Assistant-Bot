const { marked } = require("marked");
const config = require("./config");

// Custom renderer for marked to format text appropriately for Telegram Rich Message
const renderer = {
  paragraph(arg) {
    const inlineHtml = this.parser.parseInline(arg.tokens);
    return inlineHtml + '\n\n';
  },
  heading(arg) {
    const inlineHtml = this.parser.parseInline(arg.tokens);
    return `<b>${inlineHtml}</b>\n\n`;
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
  let html = marked.parse(text).trim();
  // Заменяем теги <br> / <br /> на переносы строк \n, так как Telegram
  // не поддерживает теги <br> и игнорирует/вырезает их, в то время как \n
  // полноценно поддерживается для перевода строки.
  return html.replace(/<br\s*\/?>/gi, '\n');
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
    
    // Стандартный фолбэк на ctx.reply (без парсинга таблиц, но текст дойдет гарантированно)
    await ctx.reply(text, {
      reply_parameters: {
        message_id: replyToMessageId
      }
    });
  }
}

module.exports = {
  markdownToHtml,
  sendRichMessageWithFallback
};

