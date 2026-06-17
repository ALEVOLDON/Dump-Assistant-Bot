const { extractUrls, fetchUrlContent } = require("./fetcher");
const { isOwner, isChannelOwner } = require("./access");
const { sanitizeText } = require("./message");

async function getPostContext(config, posts, message, commentText) {
  const threadId = message.message_thread_id || message.reply_to_message?.message_thread_id;
  let postText = null;
  let postUrls = [];

  if (threadId) {
    const cached = posts.get(threadId);
    if (cached) {
      postText = cached.text;
      postUrls = cached.urls || [];
    }
  }

  const commentUrls = extractUrls(commentText);
  const allUrls = [...new Set([...postUrls, ...commentUrls])].slice(0, 2);

  const urlContents = {};
  if (allUrls.length > 0) {
    const results = await Promise.allSettled(
      allUrls.map(async (url) => {
        const content = await fetchUrlContent(url, config.urlFetchTimeoutMs);
        return { url, content };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.content) {
        urlContents[r.value.url] = r.value.content;
      }
    }
  }

  return { postText, postUrls, commentUrls, urlContents };
}

function buildUserPrompt(config, message, text, forceReply, postContext, getRecentMessages) {
  const history = getRecentMessages(message)
    .slice(-5)
    .map((m) => `[${m.user}]: ${m.text}`)
    .join("\n");

  let authorRole = "пользователь";
  let isOwnerMessage = false;
  if (isOwner(config, message.from?.id)) {
    authorRole = "ВЛАДЕЛЕЦ КАНАЛА (твой босс)";
    isOwnerMessage = true;
  } else if (isChannelOwner(config, message.sender_chat)) {
    authorRole = "КАНАЛ (официальный пост)";
    isOwnerMessage = true;
  }

  const author = sanitizeText(
    message.from?.username ||
    message.from?.first_name ||
    (message.sender_chat?.type === "channel" ? "Канал" : "пользователь")
  );

  const lines = [
    `Канал: ${config.channelAbout || "авторский канал"}`,
    ""
  ];

  if (postContext?.postText) {
    lines.push("=== ОРИГИНАЛЬНЫЙ ПОСТ ===");
    lines.push(postContext.postText);
    lines.push("=== КОНЕЦ ПОСТА ===");
    lines.push("");
  }

  if (postContext?.urlContents && Object.keys(postContext.urlContents).length > 0) {
    for (const [url, content] of Object.entries(postContext.urlContents)) {
      lines.push(`=== СОДЕРЖИМОЕ ССЫЛКИ: ${url} ===`);
      lines.push(content.slice(0, 1500));
      lines.push("=== КОНЕЦ ===");
      lines.push("");
    }
  }

  lines.push(`Автор: ${author} [${authorRole}]`);
  lines.push(`Сообщение:\n<user_message>\n${text}\n</user_message>`);
  lines.push("");

  if (history) {
    lines.push("История треда:", history, "");
  }

  lines.push(`Лимит ответа: ${config.maxReplyChars} символов.`);

  if (forceReply || isOwnerMessage) {
    lines.push("Это сообщение от Владельца или прямое обращение. НАПИШИ ОТВЕТ (should_reply: true). Соглашайся с Владельцем или выполняй его команды.");
  } else {
    lines.push('Реши: нужен ли ответ администратора? Если нет — should_reply: false, reply_text: "".');
  }

  return lines.join("\n");
}

module.exports = { getPostContext, buildUserPrompt };