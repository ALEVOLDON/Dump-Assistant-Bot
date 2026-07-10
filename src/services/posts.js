const fs = require("fs");
const { extractUrls } = require("./fetcher");
const { extractText } = require("../utils/message");
const { logger } = require("../core/logger");

const MAX_POSTS = 300; // максимум хранимых постов

class PostCache {
  constructor(filePath) {
    this.filePath = filePath;
    this.cache = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      }
    } catch (e) {
      console.error("[PostCache] Load error:", e.message);
    }
    return {};
  }

  _save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.cache));
    } catch (e) {
      console.error("[PostCache] Save error:", e.message);
    }
  }

  /**
   * Сохранить пост. messageId — это ID сообщения в группе обсуждений,
   * который становится thread_id для комментариев к этому посту.
   */
  set(messageId, data) {
    this.cache[String(messageId)] = {
      text: (data.text || "").slice(0, 2000),
      urls: data.urls || [],
      date: data.date || Date.now()
    };

    // Удалять старые посты при переполнении
    const keys = Object.keys(this.cache);
    if (keys.length > MAX_POSTS) {
      const toDelete = keys
        .sort((a, b) => (this.cache[a].date || 0) - (this.cache[b].date || 0))
        .slice(0, keys.length - MAX_POSTS);
      toDelete.forEach((k) => delete this.cache[k]);
    }

    this._save();
  }

  /** Получить сохранённый пост по ID */
  get(messageId) {
    return this.cache[String(messageId)] || null;
  }
}

function cacheChannelPost(posts, message) {
  const text = extractText(message);
  const urls = extractUrls(text);
  posts.set(message.message_id, { text, urls, date: message.date * 1000 });
  logger.info(`[Post cached] id=${message.message_id} urls=${urls.length}`);
}

function isRealAutoForwardedChannelPost(message) {
  if (!message?.is_automatic_forward) return false;
  if (message.sender_chat?.type === "channel") return true;
  if (!message.from) return true;
  return false;
}

module.exports = {
  PostCache,
  cacheChannelPost,
  isRealAutoForwardedChannelPost
};
