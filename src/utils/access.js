function isOwner(config, userId) {
  return config.ownerUserIds.length > 0 && config.ownerUserIds.includes(userId);
}

function isChannelOwner(config, senderChat) {
  if (!senderChat || senderChat.type !== "channel") return false;
  return config.ownerUserIds.length > 0 && config.ownerUserIds.includes(senderChat.id);
}

function isAllowedChat(config, chatId) {
  return config.allowAllChats || config.allowedChatIds.includes(chatId);
}

module.exports = { isOwner, isChannelOwner, isAllowedChat };