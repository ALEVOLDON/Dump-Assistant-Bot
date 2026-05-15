/**
 * fetcher.js — загрузка и извлечение текста из URL.
 * Используется для получения контекста ссылок из постов и комментариев.
 */

const dns = require("dns");
const http = require("http");
const https = require("https");
const net = require("net");
const { promisify } = require("util");
const dnsLookup = promisify(dns.lookup);

const MAX_TEXT_LENGTH = 2500; // символов из страницы
const MAX_RESPONSE_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

/** Вытащить ссылки из текста */
function extractUrls(text) {
  const matches = (text || "").match(/https?:\/\/[^\s<>"'()]+/g) || [];
  return [...new Set(matches)].slice(0, 3); // не более 3 ссылок
}

/** Очистить HTML от тегов и мусора, оставить текст + вытянуть title/description/author */
function stripHtml(html) {
  // Вытягиваем Title (обычный или OG)
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i);
  const title = (ogTitleMatch?.[1] || titleMatch?.[1] || "").trim();

  // Вытягиваем Meta Description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i) ||
                   html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["'][^>]*>/i) ||
                   html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i);
  const description = (descMatch?.[1] || "").trim();

  // Вытягиваем автора/канал (часто в itemprop="name" или og:site_name)
  const authorMatch = html.match(/<meta[^>]*itemprop=["']name["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i) ||
                     html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i);
  const author = (authorMatch?.[1] || "").trim();

  const cleanBody = html
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

  let context = "";
  if (title) context += `ЗАГОЛОВОК: ${title}\n`;
  if (author) context += `АВТОР/КАНАЛ: ${author}\n`;
  if (description) context += `ОПИСАНИЕ: ${description}\n`;
  
  return (context + "\n" + cleanBody).trim();
}

function isPrivateIpv4(ip) {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function normalizeIpv6(ip) {
  return ip.toLowerCase().replace(/^\[|\]$/g, "");
}

function isPrivateIpv6(ip) {
  const normalized = normalizeIpv6(ip);
  const mappedIpv4 = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4[1]);

  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("64:ff9b:") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("ff")
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

function requestTextResponse(urlString, safeAddresses, signal) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const client = parsed.protocol === "https:" ? https : http;
    const selectedAddress = safeAddresses[0];

    const request = client.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: `${parsed.pathname}${parsed.search}`,
      method: "GET",
      signal,
      lookup(_hostname, options, callback) {
        const family = net.isIP(selectedAddress);
        if (options?.all) {
          callback(null, [{ address: selectedAddress, family }]);
          return;
        }
        callback(null, selectedAddress, family);
      },
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    }, (response) => {
      const chunks = [];
      let size = 0;

      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(new Error("Response too large"));
          return;
        }
        chunks.push(chunk);
      });

      response.on("end", () => {
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          headers: response.headers,
          text: Buffer.concat(chunks).toString("utf8")
        });
      });
    });

    request.on("error", reject);
    request.end();
  });
}

function isYoutubeUrl(urlString) {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
  } catch {
    return false;
  }
}

async function fetchYoutubeOembedContext(urlString, signal) {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(urlString)}&format=json`;
  const parsed = new URL(oembedUrl);
  const safeAddresses = await resolveSafeAddresses(parsed.hostname);
  if (!safeAddresses.length) return null;

  const response = await requestTextResponse(oembedUrl, safeAddresses, signal);
  if (!response.ok) return null;

  const data = JSON.parse(response.text);
  const lines = [];
  if (data.title) lines.push(`ЗАГОЛОВОК: ${data.title}`);
  if (data.author_name) lines.push(`АВТОР/КАНАЛ: ${data.author_name}`);
  if (data.provider_name) lines.push(`ИСТОЧНИК: ${data.provider_name}`);
  return lines.join("\n") || null;
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

    if (isYoutubeUrl(url)) {
      const oembedContext = await fetchYoutubeOembedContext(url, controller.signal).catch(() => null);
      if (oembedContext) return oembedContext.slice(0, MAX_TEXT_LENGTH);
    }

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
      response = await requestTextResponse(currentUrl, safeAddresses, controller.signal);

      // Если нет редиректа, выходим
      if (!response.status || response.status < 300 || response.status >= 400) {
        break;
      }

      // Обрабатываем редирект
      const location = response.headers.location;
      if (!location) break;

      // Преобразуем относительный URL в абсолютный
      currentUrl = new URL(location, currentUrl).toString();
      redirectCount++;
    }

    if (redirectCount > MAX_REDIRECTS) return null;
    if (!response.ok) return null;

    const contentType = response.headers["content-type"] || "";
    if (!contentType.includes("text/")) return null;

    const raw = response.text;
    const text = stripHtml(raw);
    if (isYoutubeUrl(url) && /^ЗАГОЛОВОК:\s*- YouTube\b/.test(text)) {
      return null;
    }
    return text.slice(0, MAX_TEXT_LENGTH) || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { extractUrls, fetchUrlContent };
