const crypto = require("crypto");
const { logger } = require("../logger");

function createAuthMiddleware({ config }) {
  return function authMiddleware(req, res, next) {
    // В режиме разработки разрешаем обход авторизации через флаг в .env
    if (process.env.BYPASS_INIT_DATA_AUTH === "true" || process.env.NODE_ENV === "development") {
      // Имитируем пользователя-владельца
      req.user = { id: config.ownerUserIds[0] || 0, username: "dev_admin" };
      return next();
    }

    const initDataStr = req.headers["x-telegram-init-data"];
    if (!initDataStr) {
      return res.status(401).json({ error: "Missing authorization headers" });
    }

    try {
      const params = new URLSearchParams(initDataStr);
      const hash = params.get("hash");
      if (!hash) {
        return res.status(401).json({ error: "Unauthorized: Missing hash" });
      }

      // Проверка срока действия данных (24 часа)
      const authDate = Number(params.get("auth_date"));
      if (Number.isNaN(authDate) || Date.now() / 1000 - authDate > 86400) {
        return res.status(401).json({ error: "Unauthorized: Outdated auth session" });
      }

      // Формирование dataCheckString
      const keys = Array.from(params.keys()).filter((k) => k !== "hash").sort();
      const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join("\n");

      // Расчет хэша по алгоритму Telegram
      const secretKey = crypto
        .createHmac("sha256", "WebApps")
        .update(config.telegramBotToken)
        .digest();

      const calculatedHash = crypto
        .createHmac("sha256", secretKey)
        .update(dataCheckString)
        .digest("hex");

      if (calculatedHash !== hash) {
        return res.status(401).json({ error: "Unauthorized: Hash mismatch" });
      }

      // Извлекаем пользователя из initData
      const userJSON = params.get("user");
      if (!userJSON) {
        return res.status(401).json({ error: "Unauthorized: Missing user info" });
      }

      const user = JSON.parse(userJSON);
      
      // Проверяем, является ли пользователь владельцем (или есть ли в списке разрешенных)
      const isOwner = config.ownerUserIds.includes(user.id);
      if (!isOwner) {
        return res.status(403).json({ error: "Forbidden: Not an owner" });
      }

      req.user = user;
      next();
    } catch (error) {
      logger.error("[AuthMiddleware] Validation error:", error);
      return res.status(401).json({ error: "Unauthorized: Validation failed" });
    }
  };
}

module.exports = { createAuthMiddleware };
