function richBlockToMarkdown(block) {
  if (!block) return "";
  switch (block.type) {
    case "heading": {
      const level = block.size || 1;
      return "#".repeat(level) + " " + (block.text || "") + "\n\n";
    }
    case "paragraph": {
      return (block.text || "") + "\n\n";
    }
    case "preformatted":
    case "code": {
      const lang = block.language || "";
      return "```" + lang + "\n" + (block.text || "") + "\n```\n\n";
    }
    case "block_quote":
    case "quotation": {
      return "> " + (block.text || "") + "\n\n";
    }
    case "divider": {
      return "---\n\n";
    }
    case "photo": {
      const photo = block.photo?.at(-1);
      if (photo && photo.file_id) {
        return `![Photo](file_id:${photo.file_id})\n\n`;
      }
      return "";
    }
    case "table": {
      const rows = block.cells || block.rows;
      if (!rows || rows.length === 0) return "";
      let markdown = "";
      rows.forEach((rowObj, rowIndex) => {
        const cells = Array.isArray(rowObj) ? rowObj : (rowObj.cells || []);
        markdown += "| " + cells.map(cell => typeof cell === "string" ? cell : (cell.text || "")).join(" | ") + " |\n";
        if (rowIndex === 0) {
          markdown += "| " + cells.map(cell => {
            const align = typeof cell === "string" ? "left" : (cell.align || "left");
            if (align === "center") return " :---: ";
            if (align === "right") return " ---: ";
            return " :--- ";
          }).join(" | ") + " |\n";
        }
      });
      return markdown + "\n";
    }
    case "list": {
      const items = block.items || [];
      const isOrdered = block.ordered || false;
      let markdown = "";
      items.forEach((item, index) => {
        let itemText = "";
        if (typeof item === "string") {
          itemText = item;
        } else if (item.text) {
          itemText = item.text;
        } else if (item.content) {
          if (typeof item.content === "string") {
            itemText = item.content;
          } else if (item.content.text) {
            itemText = item.content.text;
          }
        }
        const prefix = isOrdered ? `${index + 1}. ` : "- ";
        markdown += prefix + itemText + "\n";
      });
      return markdown + "\n";
    }
    default:
      if (block.text) {
        return block.text + "\n\n";
      }
      return "";
  }
}

function extractText(message) {
  if (!message) return "";
  if (message.rich_message) {
    if (message.rich_message.markdown) {
      return String(message.rich_message.markdown).trim();
    }
    if (Array.isArray(message.rich_message.blocks)) {
      return message.rich_message.blocks.map(b => richBlockToMarkdown(b)).join("").trim();
    }
  }
  return String(message.text || message.caption || "").trim();
}

function sanitizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function getThreadKey(message) {
  const chatId = message.chat.id;
  const threadId =
    message.message_thread_id ||
    message.reply_to_message?.message_thread_id ||
    message.reply_to_message?.message_id ||
    0;
  return `${chatId}:${threadId}`;
}

function anonymizeId(value) {
  if (!Number.isFinite(value)) return "n/a";
  const str = String(value);
  return str.length <= 4 ? `***${str}` : `${"*".repeat(str.length - 4)}${str.slice(-4)}`;
}

module.exports = {
  richBlockToMarkdown,
  extractText,
  sanitizeText,
  getThreadKey,
  anonymizeId
};