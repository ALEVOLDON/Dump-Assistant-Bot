const { isOwner, isAllowedChat } = require("../access");
const { anonymizeId, sanitizeText } = require("../message");
const { getRelayTarget, storeRelayTarget } = require("../relay");
const { handlePostCommand } = require("../publishing");
const { cacheChannelPost, isRealAutoForwardedChannelPost } = require("../postsCache");
const { logger } = require("../logger");

function registerMessageHandlers(bot, deps) {
  const {
    config,
    state,
    maybeReply,
    maybeReplyToPost
  } = deps;

  bot.on("message", async (ctx, next) => {
    const msg = ctx.message;
    if (!msg) return;

    if (ctx.chat.type === "private") {
      const text = sanitizeText(msg.text || msg.caption || "");
      const fromId = ctx.from?.id;
      const username = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || "Пользователь");

      logger.info(`[Private] sender=${anonymizeId(fromId)} isOwner=${isOwner(config, fromId)}`);

      if (isOwner(config, fromId)) {
        const replyTo = msg.reply_to_message;
        if (replyTo) {
          const targetId = getRelayTarget(state, replyTo.message_id);
          if (targetId) {
            logger.info(`[Relay Owner→User] target=${anonymizeId(targetId)}`);
            try {
              await ctx.copyMessage(targetId);
              await ctx.reply("✅ Ответ отправлен пользователю.");
            } catch (e) {
              logger.error(`[Relay Owner→User Error] ${e.message}`);
              await ctx.reply(`❌ Ошибка отправки: ${e.message}`);
            }
          } else {
            logger.warn("[Relay Owner] Нет безопасной связи reply -> пользователь");
            await ctx.reply("Не вижу, кому отправить ответ. Нажмите Reply на уведомление от бота.");
          }
        } else {
          const handled = await handlePostCommand(ctx, bot, config, msg);
          if (!handled) {
            await ctx.reply(
              "Не вижу, кому отправить ответ. Нажмите Reply на уведомление от пользователя, либо используйте `/post <текст>` для публикации поста в канал."
            );
          }
        }
        return;
      }

      const primaryOwnerId = config.ownerUserIds[0];
      logger.info(
        `[Relay User→Owner] sender=${anonymizeId(fromId)} owner=${anonymizeId(primaryOwnerId)} type=${msg.text ? "text" : "media"}`
      );

      if (!primaryOwnerId) {
        logger.error("[Relay Error] OWNER_USER_IDS не задан в .env!");
        await ctx.reply("Извините, бот временно недоступен.");
        return;
      }

      try {
        const header = `📨 Сообщение от ${username} (ID: ${fromId})`;
        if (msg.text) {
          const sent = await bot.api.sendMessage(primaryOwnerId, `${header}:\n\n${msg.text}`);
          storeRelayTarget(config.statePath, state, sent.message_id, fromId);
          logger.info("[Relay OK] Текст переслан владельцу");
        } else {
          const sent = await bot.api.sendMessage(
            primaryOwnerId,
            `${header}\n_Для ответа сделайте Reply (Ответить) на ЭТО сообщение_`,
            { parse_mode: "Markdown" }
          );
          storeRelayTarget(config.statePath, state, sent.message_id, fromId);
          await ctx.copyMessage(primaryOwnerId);
          logger.info("[Relay OK] Медиа переслано владельцу");
        }
        await ctx.reply("✅ Ваше сообщение отправлено администратору. Ожидайте ответа.");
      } catch (e) {
        logger.error(`[Relay Error] Не удалось переслать владельцу: ${e.message}`);
        await ctx.reply("Извините, произошла ошибка. Попробуйте позже.");
      }
      return;
    }

    if (isRealAutoForwardedChannelPost(msg) && isAllowedChat(config, msg.chat.id)) {
      cacheChannelPost(deps.posts, msg);
      await maybeReplyToPost(ctx);
      return;
    }

    logger.debug(
      `[DEBUG] chat=${msg.chat.id} allowed=${isAllowedChat(config, msg.chat.id)} auto_forward=${Boolean(msg.is_automatic_forward)} sender_chat=${msg.sender_chat?.type || "none"} has_text=${Boolean(msg.text || msg.caption)}`
    );

    return next();
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message?.is_automatic_forward) return;
    try {
      const message = ctx.message || ctx.msg;
      if (!message) return;
      logger.debug(`[Msg] chat=${ctx.chat.id} user=${anonymizeId(ctx.from?.id)} has_text=${Boolean(message.text)}`);
      await maybeReply(ctx);
    } catch (error) {
      logger.error("[Error]", error);
    }
  });

  bot.on("message", async (ctx) => {
    const message = ctx.message || ctx.msg;
    if (!message) return;
    if (message.is_automatic_forward) return;
    if (!message.sender_chat) return;

    const text = sanitizeText(message.text || message.caption || "");
    if (!text) return;

    try {
      logger.debug(`[MsgFallback] chat=${ctx.chat.id} sender_chat=${message.sender_chat?.type || "none"}`);
      await maybeReply(ctx);
    } catch (error) {
      logger.error("[FallbackError]", error);
    }
  });
}

module.exports = { registerMessageHandlers };