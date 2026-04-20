/**
 * fetcher.js — загрузка и извлечение текста из URL.
 * Используется для получения контекста ссылок из постов и комментариев.
 */

const MAX_TEXT_LENGTH = 2500; // символов из страницы
const FETCH_TIMEOUT_MS = 8000;

/** Вытащить ссылки из текста */
function extractUrls(text) {
  const matches = (text || "").match(/https?:\/\/[^\s<>"'()]+/g) || [];
  return [...new Set(matches)].slice(0, 3); // не более 3 ссылок
}

/** Очистить HTML от тегов и мусора, оставить текст */
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Загрузить содержимое URL и вернуть очищенный текст.
 * Возвращает null если не удалось или контент не текстовый.
 * @param {string} url
 * @param {number} [timeoutMs]
 * @returns {Promise<string|null>}
 */
async function fetchUrlContent(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TelegramAssistantBot/1.0)",
        "Accept": "text/html,text/plain;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru,en;q=0.9"
      },
      redirect: "follow"
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/")) return null;

    const raw = await response.text();
    const text = stripHtml(raw);
    return text.slice(0, MAX_TEXT_LENGTH) || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { extractUrls, fetchUrlContent };
