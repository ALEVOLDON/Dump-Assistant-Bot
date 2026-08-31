const { logger } = require("../core/logger");
const { scheduleStateWrite } = require("../core/state");

const TELEGRAPH_API_BASE = "https://api.telegra.ph";

const ALLOWED_TAGS = new Set([
  "a", "aside", "b", "blockquote", "br", "code", "em", "figcaption",
  "figure", "h3", "h4", "hr", "i", "iframe", "img", "li", "ol", "p",
  "pre", "s", "strong", "u", "ul", "video"
]);

const TAG_MAPPING = {
  h1: "h3",
  h2: "h3",
  strong: "b",
  em: "i",
  del: "s",
  strike: "s"
};

/**
 * Парсит строку атрибутов HTML в объект (например, href="...", src="...")
 */
function parseAttributes(attrString) {
  const attrs = {};
  if (!attrString) return attrs;
  const regex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = regex.exec(attrString)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (key === "href" || key === "src") {
      attrs[key] = value;
    }
  }
  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

/**
 * Конвертирует HTML-строку в массив узлов (Node) для Telegraph API.
 * @param {string} html 
 * @returns {Array<string|object>}
 */
function htmlToTelegraphNodes(html) {
  if (!html || typeof html !== "string") return [];

  // Нормализуем HTML
  const sanitized = html
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .trim();

  const tokenRegex = /(<\/?[a-zA-Z0-9]+(?:\s+[^>]*)?>|[^<]+)/g;
  const tokens = sanitized.match(tokenRegex) || [];

  const root = { children: [] };
  const stack = [root];

  for (const token of tokens) {
    if (!token) continue;

    if (token.startsWith("</")) {
      // Закрывающий тег
      const tagMatch = token.match(/^<\/([a-zA-Z0-9]+)>/);
      if (tagMatch) {
        let rawTag = tagMatch[1].toLowerCase();
        let tag = TAG_MAPPING[rawTag] || rawTag;
        if (!ALLOWED_TAGS.has(tag)) tag = "p";

        // Ищем соответствующий тег в стеке (не глубже root)
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].tag === tag) {
            stack.splice(i);
            break;
          }
        }
      }
    } else if (token.startsWith("<")) {
      // Открывающий или самозакрывающийся тег
      const tagMatch = token.match(/^<([a-zA-Z0-9]+)(\s+[^>]*)?(\/?)>/);
      if (!tagMatch) continue;

      let rawTag = tagMatch[1].toLowerCase();
      let attrStr = tagMatch[2] || "";
      const isSelfClosing = Boolean(tagMatch[3]) || rawTag === "img" || rawTag === "br" || rawTag === "hr";

      let tag = TAG_MAPPING[rawTag] || rawTag;
      if (!ALLOWED_TAGS.has(tag)) {
        tag = "p";
      }

      const node = { tag };
      const attrs = parseAttributes(attrStr);
      if (attrs) node.attrs = attrs;

      const currentParent = stack[stack.length - 1];
      if (!currentParent.children) currentParent.children = [];
      currentParent.children.push(node);

      if (!isSelfClosing) {
        node.children = [];
        stack.push(node);
      }
    } else {
      // Текстовый узел
      const text = token;
      if (text.length > 0) {
        const currentParent = stack[stack.length - 1];
        if (!currentParent.children) currentParent.children = [];
        currentParent.children.push(text);
      }
    }
  }

  return root.children || [];
}

/**
 * Получает или создает токен Telegraph аккаунта для бота.
 */
async function getOrCreateTelegraphToken(config, state) {
  if (state.telegraph_access_token) {
    return state.telegraph_access_token;
  }

  const shortName = config.channelUsername ? config.channelUsername.replace("@", "").slice(0, 32) : "DumpAssistant";
  const authorName = config.channelUsername || "Dump Assistant";
  const authorUrl = config.channelUsername ? `https://t.me/${config.channelUsername.replace("@", "")}` : "";

  logger.info(`[Telegraph] Creating new Telegraph account: short_name=${shortName}`);
  
  const params = new URLSearchParams({
    short_name: shortName,
    author_name: authorName
  });
  if (authorUrl) {
    params.append("author_url", authorUrl);
  }

  const response = await fetch(`${TELEGRAPH_API_BASE}/createAccount`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  const data = await response.json();
  if (!data.ok || !data.result?.access_token) {
    throw new Error(`Failed to create Telegraph account: ${data.error || "unknown error"}`);
  }

  state.telegraph_access_token = data.result.access_token;
  state.telegraph_auth_url = data.result.auth_url;
  scheduleStateWrite(config.statePath, state);

  logger.info("[Telegraph] Account successfully created and token stored.");
  return state.telegraph_access_token;
}

/**
 * Создает статью на Telegraph.
 * 
 * @param {object} options
 * @param {string} options.title - заголовок статьи (до 256 символов)
 * @param {string} options.htmlContent - HTML контент статьи
 * @param {string} [options.authorName] - имя автора
 * @param {string} [options.authorUrl] - ссылка на автора (канал)
 * @param {object} options.config - конфигурация бота
 * @param {object} options.state - состояние бота
 * @returns {Promise<{ url: string, path: string, title: string }>}
 */
async function createTelegraphArticle({ title, htmlContent, authorName, authorUrl, config, state }) {
  const token = await getOrCreateTelegraphToken(config, state);
  const nodes = htmlToTelegraphNodes(htmlContent);

  if (!nodes.length) {
    throw new Error("Содержимое статьи пустое или не может быть преобразовано в формат Telegraph.");
  }

  const effectiveTitle = (title || "Без названия").slice(0, 256).trim();
  const effectiveAuthorName = (authorName || config.channelUsername || "Dump Assistant").slice(0, 128);
  const effectiveAuthorUrl = authorUrl || (config.channelUsername ? `https://t.me/${config.channelUsername.replace("@", "")}` : "");

  const body = {
    access_token: token,
    title: effectiveTitle,
    author_name: effectiveAuthorName,
    author_url: effectiveAuthorUrl,
    content: JSON.stringify(nodes),
    return_content: false
  };

  const response = await fetch(`${TELEGRAPH_API_BASE}/createPage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!data.ok || !data.result?.url) {
    throw new Error(`Ошибка Telegraph API при создании страницы: ${data.error || "Неизвестная ошибка"}`);
  }

  logger.info(`[Telegraph] Page created successfully: ${data.result.url}`);
  return {
    url: data.result.url,
    path: data.result.path,
    title: data.result.title
  };
}

module.exports = {
  htmlToTelegraphNodes,
  getOrCreateTelegraphToken,
  createTelegraphArticle,
  TELEGRAPH_API_BASE
};
