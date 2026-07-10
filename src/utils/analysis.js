const { isOwner, isChannelOwner, isAllowedChat } = require("./access");
const { getThreadKey } = require("./message");

function isDirectAddress(config, text) {
  if (config.botUsername && text.toLowerCase().includes(`@${config.botUsername}`)) return true;
  return /(?:^|\s)(админ\w*|модер\w*|бот)(?:\s|[,!?.]|$)/iu.test(text);
}

function isQuestion(text) {
  return /\?/.test(text) ||
    /(?:^|\s)(как|почему|зачем|где|когда|чем|кто|куда|откуда|сколько|расскажи|объясни|поясни|помоги|подскажи)(?:\s|[,!?.]|$)/iu.test(text);
}

function isNoise(text) {
  if (text.length < 3) return true;
  return /^(ok|ок|ага|угу|мм|да|нет|лол|ха+|\+1|👍|🔥|❤️|👎|\.+|!+)$/i.test(text);
}

function analyzeMessage(config, state, message, text) {
  if (!isAllowedChat(config, message.chat.id)) return { skip: true, reason: "chat_not_allowed" };
  if (!state.autoReplyEnabled) return { skip: true, reason: "auto_reply_disabled" };

  const fromId = message.from?.id;
  if (message.from?.is_bot && fromId !== 1087968824 && fromId !== 136817688) {
    return { skip: true, reason: "bot_message" };
  }

  if (!text) return { skip: true, reason: "empty_text" };
  if (isNoise(text)) return { skip: true, reason: "noise" };

  const threadKey = getThreadKey(message);
  const threadState = state.threads[threadKey];
  if (threadState?.lastReplyAt && Date.now() - threadState.lastReplyAt < 3000) {
    return { skip: true, reason: "hard_cooldown_dos_protection" };
  }

  if (message.reply_to_message?.from?.username?.toLowerCase() === config.botUsername) {
    return { skip: false, forceReply: true };
  }

  if (isOwner(config, message.from?.id) || isChannelOwner(config, message.sender_chat)) {
    return { skip: false, forceReply: true };
  }

  if (isDirectAddress(config, text)) {
    return { skip: false, forceReply: true };
  }

  if (isQuestion(text)) {
    return { skip: false, forceReply: false };
  }

  if (threadState?.lastReplyAt && Date.now() - threadState.lastReplyAt < config.threadCooldownMs) {
    return { skip: true, reason: "cooldown" };
  }

  return { skip: false, forceReply: false };
}

module.exports = {
  isDirectAddress,
  isQuestion,
  isNoise,
  analyzeMessage
};