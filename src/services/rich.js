const { marked } = require("marked");
const config = require("../core/config");

let currentIsRich = true;

// Custom renderer for marked to format text appropriately for Telegram Rich Message
const renderer = {
  paragraph(arg) {
    const inlineHtml = this.parser.parseInline(arg.tokens);
    if (currentIsRich) {
      return `<p>${inlineHtml}</p>\n\n`;
    } else {
      return inlineHtml + '\n\n';
    }
  },
  heading(arg) {
    const inlineHtml = this.parser.parseInline(arg.tokens);
    if (currentIsRich) {
      const level = arg.depth || 3;
      return `<h${level}>${inlineHtml}</h${level}>\n\n`;
    } else {
      return `<b>${inlineHtml}</b>\n\n`;
    }
  },
  list(arg) {
    if (currentIsRich) {
      return marked.Renderer.prototype.list.call(this, arg);
    }
    let markdown = "";
    arg.items.forEach((item, index) => {
      const itemText = this.parser.parse(item.tokens).trim();
      const prefix = arg.ordered ? `${index + 1}. ` : "• ";
      markdown += prefix + itemText + "\n";
    });
    return markdown + "\n";
  },
  listitem(arg) {
    if (currentIsRich) {
      return marked.Renderer.prototype.listitem.call(this, arg);
    }
    return arg.text;
  },
  table(arg) {
    if (currentIsRich) {
      return marked.Renderer.prototype.table.call(this, arg);
    }
    let text = "";
    arg.header.forEach(cell => {
      text += `<b>${this.parser.parseInline(cell.tokens)}</b> | `;
    });
    text += "\n";
    arg.rows.forEach(row => {
      row.forEach(cell => {
        text += `${this.parser.parseInline(cell.tokens)} | `;
      });
      text += "\n";
    });
    return text + "\n";
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
 * Конвертирует входящий Markdown в HTML для Telegram Rich/Standard Messages,
 * учитывая особенности рендеринга нативных списков, таблиц и переносов строк.
 * 
 * @param {string} text - текст Markdown
 * @param {boolean} isRich - использовать ли Rich-теги (таблицы, параграфы) или стандартные теги (для историй)
 * @returns {string} - готовый HTML для отправки
 */
function markdownToHtml(text, isRich = true) {
  if (!text) return "";
  currentIsRich = isRich;
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

