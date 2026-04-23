/**
 * fetcher.js — загрузка и извлечение текста из URL.
 * Используется для получения контекста ссылок из постов и комментариев.
 */

const dns = require("dns");
const net = require("net");
const { promisify } = require("util");
const { Agent } = require("undici");
const dnsLookup = promisify(dns.lookup);

const MAX_TEXT_LENGTH = 2500; // символов из страницы
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

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

function isPrivateIpv4(ip) {
  return (
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) ||
    ip.startsWith("169.254.") ||
    ip === "0.0.0.0"
  );
}

function normalizeIpv6(ip) {
  return ip.toLowerCase().replace(/^\[|\]$/g, "");
}

function isPrivateIpv6(ip) {
  const normalized = normalizeIpv6(ip);
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}

function isPrivateIpAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip);
  return true;
}

/** Проверка URL на безопасность (SSRF защита) */
function isSafeUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname;
    if (host === "localhost" || host.endsWith(".local")) return false;

    const hostIpFamily = net.isIP(host);
    if (hostIpFamily) {
      return !isPrivateIpAddress(host);
    }

    return true;
  } catch {
    return false;
  }
}

/** Резолвим хост и возвращаем только безопасные IP */
async function resolveSafeAddresses(hostname) {
  const hostIpFamily = net.isIP(hostname);
  if (hostIpFamily) {
    return isPrivateIpAddress(hostname) ? [] : [hostname];
  }

  try {
    const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
    if (!addresses.length) return [];

    // Если домен резолвится хотя бы в один private IP — блокируем целиком.
    if (addresses.some(({ address }) => isPrivateIpAddress(address))) {
      return [];
    }

    return [...new Set(addresses.map(({ address }) => address))];
  } catch {
    return [];
  }
}

/**
 * Загрузить содержимое URL и вернуть очищенный текст.
 * Возвращает null если не удалось или контент не текстовый.
 * @param {string} url
 * @param {number} [timeoutMs]
 * @returns {Promise<string|null>}
 */
async function fetchUrlContent(url, timeoutMs = FETCH_TIMEOUT_MS) {
  if (!isSafeUrl(url)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentUrl = url;
    let redirectCount = 0;
    let response;

    // Следуем по редиректам вручную с проверкой каждого URL
    while (redirectCount <= MAX_REDIRECTS) {
      // Проверяем текущий URL перед запросом
      if (!isSafeUrl(currentUrl)) {
        return null;
      }

      const parsed = new URL(currentUrl);
      const safeAddresses = await resolveSafeAddresses(parsed.hostname);
      if (!safeAddresses.length) return null;

      // Важно: фиксируем DNS-ответ в lookup, чтобы избежать DNS rebinding между check и connect.
      const dispatcher = new Agent({
        connect: {
          lookup(_hostname, _options, callback) {
            const selected = safeAddresses[0];
            callback(null, selected, net.isIP(selected));
          }
        }
      });

      try {
        response = await fetch(currentUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; TelegramAssistantBot/1.0)",
            "Accept": "text/html,text/plain;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru,en;q=0.9"
          },
          redirect: "manual", // Ручная обработка редиректов
          dispatcher
        });
      } finally {
        await dispatcher.close();
      }

      // Если нет редиректа, выходим
      if (!response.status || response.status < 300 || response.status >= 400) {
        break;
      }

      // Обрабатываем редирект
      const location = response.headers.get("location");
      if (!location) break;

      // Преобразуем относительный URL в абсолютный
      currentUrl = new URL(location, currentUrl).toString();
      redirectCount++;
    }

    if (redirectCount > MAX_REDIRECTS) return null;
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
