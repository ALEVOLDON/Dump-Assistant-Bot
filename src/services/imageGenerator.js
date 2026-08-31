const { logger } = require("../core/logger");

const POLLINATIONS_BASE_URL = "https://image.pollinations.ai/prompt";

/**
 * Очищает и улучшает промпт для генерации стильной технологичной обложки 16:9
 */
function buildCoverPrompt(rawPrompt, title = "") {
  let subject = (rawPrompt || "").trim();
  if (!subject && title) {
    subject = `A modern conceptual digital art illustration representing ${title.replace(/[#*`_]/g, "").trim()}`;
  }
  if (!subject) {
    subject = "Modern artificial intelligence and future technology abstract 3D concept";
  }

  // Убираем лишние кавычки и служебные символы
  subject = subject.replace(/["\n\r]/g, " ").trim();

  // Добавляем художественные стилизаторы для премиального визуала
  return `${subject}, modern tech editorial illustration, sleek 3D render, dark aesthetic with vibrant glowing accents, cinematic lighting, ultra-detailed, 8k resolution, 16:9`;
}

/**
 * Генерирует изображение обложки через нейросеть FLUX (Pollinations AI).
 * 
 * @param {object} options
 * @param {string} [options.prompt] - промпт для генерации (на английском)
 * @param {string} [options.title] - заголовок статьи для резервного промпта
 * @param {number} [options.timeoutMs=20000] - таймаут генерации
 * @returns {Promise<{ buffer: Buffer, mimeType: string, fileName: string, prompt: string }>}
 */
async function generateCoverImage({ prompt, title, timeoutMs = 20000 }) {
  const finalPrompt = buildCoverPrompt(prompt, title);
  const encoded = encodeURIComponent(finalPrompt);
  const seed = Math.floor(Math.random() * 1000000);
  const imageUrl = `${POLLINATIONS_BASE_URL}/${encoded}?width=1280&height=720&model=flux&nologo=true&seed=${seed}`;

  logger.info(`[ImageGen] Generating AI cover image: "${finalPrompt.slice(0, 100)}..."`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Image API responded with status ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length < 1000) {
      throw new Error("Generated image buffer is too small or invalid.");
    }

    logger.info(`[ImageGen] Successfully generated cover image (${(buffer.length / 1024).toFixed(1)} KB).`);

    return {
      buffer,
      mimeType: "image/jpeg",
      fileName: "cover.jpg",
      prompt: finalPrompt
    };
  } catch (err) {
    clearTimeout(timeoutId);
    logger.error(`[ImageGen] Image generation failed: ${err.message}`);
    throw err;
  }
}

module.exports = {
  generateCoverImage,
  buildCoverPrompt,
  POLLINATIONS_BASE_URL
};
