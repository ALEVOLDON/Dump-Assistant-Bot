const { Bot } = require("grammy");
const config = require("./config");
const { markdownToHtml } = require("./rich");
const { hostMediaForPost, isMediaStorageConfigured } = require("./mediaStorage");

const bot = new Bot(config.telegramBotToken);

async function test() {
  const channelChatId = config.channelChatId;
  if (!channelChatId) {
    throw new Error("CHANNEL_CHAT_ID не задан в .env");
  }
  console.log("1. Sending photo to get fileId...");
  
  try {
    const photoMsg = await bot.api.sendPhoto(channelChatId, "https://picsum.photos/seed/test/800/600", {
      caption: "Temporary photo"
    });
    
    const fileId = photoMsg.photo.at(-1).file_id;
    await bot.api.deleteMessage(channelChatId, photoMsg.message_id);
    console.log("fileId obtained:", fileId);

    console.log("\n2. Downloading file from Telegram...");
    const file = await bot.api.getFile(fileId);
    const downloadUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
    const response = await fetch(downloadUrl);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log("File downloaded. Size:", buffer.length);

    if (!isMediaStorageConfigured(config)) {
      throw new Error("Настройте WEBSITE_REPO_PATH и MEDIA_PUBLIC_BASE_URL в .env");
    }

    console.log("\n3. Saving media to website storage...");
    const hosted = await hostMediaForPost(bot, config, {
      mediaFileId: fileId,
      mediaType: "photo",
      fileName: "photo.jpg"
    });
    const directUrl = hosted.publicUrl;
    console.log("Public image URL is:", directUrl);

    console.log("\n4. Sending sendRichMessage with <img src=\"...\">...");
    const markdown = `
# Тест с Vercel Media Картинкой

Это один пост с картинкой сверху и таблицей снизу!

<img src="${directUrl}" />

| Таблица | Статус |
| :--- | :--- |
| Данные | Работают! |

Конец теста.
`;

    const htmlContent = markdownToHtml(markdown);
    const result = await bot.api.raw.sendRichMessage({
      chat_id: channelChatId,
      rich_message: {
        html: htmlContent
      }
    });
    console.log("Success! Message sent:", JSON.stringify(result, null, 2));

  } catch (err) {
    console.error("Experiment failed:", err);
  }
}

test();
