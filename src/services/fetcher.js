/**
 * fetcher.js — загрузка и извлечение текста из URL.
 * Используется для получения контекста ссылок из постов и комментариев.
 */

const dns = require("dns");
const http = require("http");
const https = require("https");
const net = require("net");
const zlib = require("zlib");
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
        "Accept-Encoding": "gzip, deflate, br",
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
        let buffer = Buffer.concat(chunks);
        const encoding = (response.headers["content-encoding"] || "").toLowerCase();

        try {
          if (encoding === "gzip") {
            buffer = zlib.gunzipSync(buffer);
          } else if (encoding === "deflate") {
            buffer = zlib.inflateSync(buffer);
          } else if (encoding === "br") {
            buffer = zlib.brotliDecompressSync(buffer);
          }
        } catch (decompressError) {
          // Fallback to raw buffer if decompression fails
        }

        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          headers: response.headers,
          text: buffer.toString("utf8")
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

function isTwitterUrl(urlString) {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    return host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com");
  } catch {
    return false;
  }
}

async function fetchTwitterMetadata(urlString, signal) {
  try {
    const parsed = new URL(urlString);
    const pathname = parsed.pathname;

    // 1. Попытка через api.fxtwitter.com (быстрый, не блокируется)
    try {
      const fxUrl = `https://api.fxtwitter.com${pathname}`;
      const parsedFx = new URL(fxUrl);
      const safeAddresses = await resolveSafeAddresses(parsedFx.hostname);
      if (safeAddresses.length > 0) {
        const response = await requestTextResponse(fxUrl, safeAddresses, signal);
        if (response.ok) {
          const data = JSON.parse(response.text);
          const tweet = data.tweet;
          if (tweet) {
            const lines = [];
            const authorName = tweet.author?.name || "";
            const screenName = tweet.author?.screen_name || "";
            if (authorName || screenName) {
              lines.push(`АВТОР: ${authorName} (@${screenName})`);
            }
            if (tweet.text) lines.push(`ТЕКСТ:\n${tweet.text}`);
            if (tweet.created_at) lines.push(`ДАТА: ${tweet.created_at}`);
            if (tweet.likes !== undefined && tweet.retweets !== undefined) {
              lines.push(`СТАТИСТИКА: ❤️ ${tweet.likes} | 🔄 ${tweet.retweets}`);
            }

            const mediaUrl =
              tweet.media?.photos?.[0]?.url ||
              tweet.media?.all?.[0]?.url ||
              tweet.media?.videos?.[0]?.thumbnail_url ||
              null;

            return {
              text: lines.join("\n") || null,
              ogImage: mediaUrl
            };
          }
        }
      }
    } catch {
      // Игнорируем ошибку fxtwitter и пробуем fallback
    }

    // 2. Фолбэк на api.vxtwitter.com
    try {
      const apiVxUrl = `https://api.vxtwitter.com${pathname}`;
      const parsedVx = new URL(apiVxUrl);
      const safeAddresses = await resolveSafeAddresses(parsedVx.hostname);
      if (safeAddresses.length > 0) {
        const response = await requestTextResponse(apiVxUrl, safeAddresses, signal);
        if (response.ok) {
          const data = JSON.parse(response.text);
          const lines = [];
          if (data.user_name) lines.push(`АВТОР: ${data.user_name} (@${data.user_screen_name || ""})`);
          if (data.text) lines.push(`ТЕКСТ:\n${data.text}`);
          if (data.date) lines.push(`ДАТА: ${data.date}`);
          if (data.likes !== undefined && data.retweets !== undefined) {
            lines.push(`СТАТИСТИКА: ❤️ ${data.likes} | 🔄 ${data.retweets}`);
          }

          const mediaUrl = data.mediaURLs?.[0] || data.media_extended?.[0]?.url || null;

          return {
            text: lines.join("\n") || null,
            ogImage: mediaUrl
          };
        }
      }
    } catch {
      // Игнорируем
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchYoutubeOembedMetadata(urlString, signal) {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(urlString)}&format=json`;
  const parsed = new URL(oembedUrl);
  const safeAddresses = await resolveSafeAddresses(parsed.hostname);
  if (!safeAddresses.length) return null;

  const response = await requestTextResponse(oembedUrl, safeAddresses, signal);
  if (!response.ok) return null;

  try {
    const data = JSON.parse(response.text);
    const lines = [];
    if (data.title) lines.push(`ЗАГОЛОВОК: ${data.title}`);
    if (data.author_name) lines.push(`АВТОР/КАНАЛ: ${data.author_name}`);
    if (data.provider_name) lines.push(`ИСТОЧНИК: ${data.provider_name}`);
    return {
      text: lines.join("\n") || null,
      ogImage: data.thumbnail_url || null
    };
  } catch {
    return null;
  }
}

async function fetchYoutubeOembedContext(urlString, signal) {
  const meta = await fetchYoutubeOembedMetadata(urlString, signal);
  return meta ? meta.text : null;
}

function getAttr(tag, attrName) {
  const regex = new RegExp(`${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(regex);
  return match ? (match[1] || match[2] || match[3] || "") : null;
}

/** Извлечь OG картинку из HTML */
function extractOgImage(html) {
  if (!html) return null;

  const metaTags = html.match(/<meta\s+[^>]+>/gi) || [];
  for (const tag of metaTags) {
    const property = getAttr(tag, "property") || "";
    const name = getAttr(tag, "name") || "";
    const itemprop = getAttr(tag, "itemprop") || "";
    const content = getAttr(tag, "content");

    if (content) {
      const isImage = 
        /^(og:image|og:image:url|og:image:secure_url)$/i.test(property) ||
        /^(og:image|og:image:url|og:image:secure_url)$/i.test(name) ||
        /^(twitter:image|twitter:image:src)$/i.test(property) ||
        /^(twitter:image|twitter:image:src)$/i.test(name) ||
        /^image$/i.test(itemprop);

      if (isImage) {
        return content
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();
      }
    }
  }

  const linkTags = html.match(/<link\s+[^>]+>/gi) || [];
  for (const tag of linkTags) {
    const rel = getAttr(tag, "rel") || "";
    const href = getAttr(tag, "href");
    if (href && /^image_src$/i.test(rel)) {
      return href
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
    }
  }

  return null;
}

/** Разрешить относительный URL картинки */
function resolveUrl(baseUrl, relativeUrl) {
  try {
    return new URL(relativeUrl, baseUrl).toString();
  } catch {
    return relativeUrl;
  }
}

/**
 * Загрузить содержимое URL и вернуть очищенный текст + OG картинку.
 * @param {string} url
 * @param {number} [timeoutMs]
 * @returns {Promise<{ text: string|null, ogImage: string|null }|null>}
 */
async function fetchUrlMetadata(url, timeoutMs = FETCH_TIMEOUT_MS) {
  if (!isSafeUrl(url)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentUrl = url;
    let redirectCount = 0;
    let response;

    if (isYoutubeUrl(url)) {
      const oembedMeta = await fetchYoutubeOembedMetadata(url, controller.signal).catch(() => null);
      if (oembedMeta) {
        if (oembedMeta.text) oembedMeta.text = oembedMeta.text.slice(0, MAX_TEXT_LENGTH);
        return oembedMeta;
      }
    }

    if (isTwitterUrl(url)) {
      const twitterMeta = await fetchTwitterMetadata(url, controller.signal).catch(() => null);
      if (twitterMeta) {
        if (twitterMeta.text) twitterMeta.text = twitterMeta.text.slice(0, MAX_TEXT_LENGTH);
        return twitterMeta;
      }
    }

    while (redirectCount <= MAX_REDIRECTS) {
      if (!isSafeUrl(currentUrl)) {
        return null;
      }

      const parsed = new URL(currentUrl);
      const safeAddresses = await resolveSafeAddresses(parsed.hostname);
      if (!safeAddresses.length) return null;

      response = await requestTextResponse(currentUrl, safeAddresses, controller.signal);

      if (!response.status || response.status < 300 || response.status >= 400) {
        break;
      }

      const location = response.headers.location;
      if (!location) break;

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

    let ogImage = extractOgImage(raw);
    if (ogImage) {
      ogImage = resolveUrl(currentUrl, ogImage);
    }

    return {
      text: text.slice(0, MAX_TEXT_LENGTH) || null,
      ogImage: ogImage || null
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
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
  const meta = await fetchUrlMetadata(url, timeoutMs);
  return meta ? meta.text : null;
}

/**
 * Безопасно загрузить бинарный файл по URL (защита от SSRF, лимит размера, таймаут)
 * @param {string} urlString
 * @param {number} timeoutMs
 * @param {number} maxBytes
 * @returns {Promise<Buffer>}
 */
async function downloadSafeBinary(urlString, timeoutMs = FETCH_TIMEOUT_MS, maxBytes = MAX_RESPONSE_BYTES) {
  if (!isSafeUrl(urlString)) {
    throw new Error("Forbidden or unsafe URL");
  }

  const parsed = new URL(urlString);
  const safeAddresses = await resolveSafeAddresses(parsed.hostname);
  if (!safeAddresses.length) {
    throw new Error("DNS resolution returned no safe IP addresses");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await new Promise((resolve, reject) => {
      const client = parsed.protocol === "https:" ? https : http;
      const selectedAddress = safeAddresses[0];

      const request = client.request({
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        signal: controller.signal,
        lookup(_hostname, options, callback) {
          const family = net.isIP(selectedAddress);
          if (options?.all) {
            callback(null, [{ address: selectedAddress, family }]);
            return;
          }
          callback(null, selectedAddress, family);
        },
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      }, (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          request.destroy(new Error(`Server responded with status code ${response.statusCode}`));
          return;
        }

        const contentLength = Number(response.headers["content-length"]);
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
          request.destroy(new Error("Response content-length exceeds limit"));
          return;
        }

        const chunks = [];
        let size = 0;

        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            request.destroy(new Error("Response size limit exceeded"));
            return;
          }
          chunks.push(chunk);
        });

        response.on("end", () => {
          resolve(Buffer.concat(chunks));
        });
      });

      request.on("error", reject);
      request.end();
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Download timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  extractUrls,
  fetchUrlContent,
  fetchUrlMetadata,
  extractOgImage,
  isSafeUrl,
  stripHtml,
  downloadSafeBinary
};

