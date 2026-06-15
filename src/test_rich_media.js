const { Bot } = require("grammy");
const config = require("./config");
const { markdownToHtml } = require("./rich");

const bot = new Bot(config.telegramBotToken);

async function test() {
  const channelChatId = "-1001329670526";
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

    console.log("\n3. Uploading to tmpfiles.org...");
    const fileObj = new File([buffer], "photo.jpg", { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("file", fileObj);
    
    const uploadResponse = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: formData
    });
    
    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} - ${errText}`);
    }
    
    const uploadResult = await uploadResponse.json();
    console.log("Upload result:", uploadResult);
    
    const originalUrl = uploadResult.data?.url;
    if (!originalUrl) {
      throw new Error("No URL in upload response: " + JSON.stringify(uploadResult));
    }
    
    // Convert view URL to direct download URL (insert /dl/ after domain)
    const directUrl = originalUrl.replace("https://tmpfiles.org/", "https://tmpfiles.org/dl/");
    console.log("Direct public image URL is:", directUrl);

    console.log("\n4. Sending sendRichMessage with <img src=\"...\">...");
    const markdown = `
# Тест с Tmpfiles Картинкой

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
        html: htmlContent,
        markdown: markdown
      }
    });
    console.log("Success! Message sent:", JSON.stringify(result, null, 2));

  } catch (err) {
    console.error("Experiment failed:", err);
  }
}

test();
