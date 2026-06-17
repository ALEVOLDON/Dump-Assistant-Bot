const { extractUrls } = require("./fetcher");
const { extractText } = require("./message");
const { logger } = require("./logger");

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

module.exports = { cacheChannelPost, isRealAutoForwardedChannelPost };