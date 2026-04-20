/**
 * posts.js — кэш постов канала.
 * Когда пост публикуется в канале, Telegram автоматически форвардит его
 * в связанную группу обсуждений. Мы сохраняем эти посты, чтобы бот знал
 * контекст треда при ответе на вопросы.
 */

const fs = require("fs");

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

module.exports = { PostCache };
