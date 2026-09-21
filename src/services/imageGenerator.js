const { logger } = require("../core/logger");
const config = require("../core/config");

const POLLINATIONS_BASE_URL = "https://image.pollinations.ai/prompt";

const THEME_STYLES = {
  cyber: {
    id: "cyber",
    name: "Cyber (DUMP Default)",
    palette: "deep obsidian black (#030106) background with vibrant electric cyan (#22d3ee) and radiant neon violet-purple (#a855f7) accents",
    lighting: "cinematic volumetric edge lighting with soft holographic glow and dark ambient shadows",
    materials: "matte black surfaces, brushed dark titanium, sleek frosted glass and illuminated optical fiber details"
  },
  solar: {
    id: "solar",
    name: "Solar",
    palette: "deep dark graphite background with warm radiant amber-gold (#f2994a) and incandescent neon crimson-red (#eb5757) accents",
    lighting: "dramatic warm sunset rim lighting, intense glowing embers and golden volumetric rays",
    materials: "brushed copper, warm anodized dark alloy and luminous conduits"
  },
  emerald: {
    id: "emerald",
    name: "Emerald",
    palette: "deep slate obsidian background with bright emerald matrix green (#22c55e) and deep luminous teal (#0f766e) accents",
    lighting: "luminescent bio-cybernetic glow, crisp raytraced highlights and atmospheric dark teal fog",
    materials: "crystalline glass, cyber-organic synthetic textures and microchip circuitry"
  },
  void: {
    id: "void",
    name: "Void",
    palette: "pure minimal void black background with platinum silver (#d1d5db) and cold slate steel (#374151) monochrome accents",
    lighting: "stark high-contrast architectural chiaroscuro lighting and sharp specular glints",
    materials: "monolithic polished obsidian, frosted crystal and industrial dark chrome"
  }
};

/**
 * Очищает и улучшает промпт для генерации стильной технологичной обложки 16:9
 * в фирменном стиле канала DUMP (палитры Cyber, Solar, Emerald, Void).
 */
function buildCoverPrompt(rawPrompt, title = "", theme = "cyber") {
  let subject = (rawPrompt || "").trim();
  if (!subject && title) {
    subject = `A modern conceptual digital art illustration representing ${title.replace(/[#*`_]/g, "").trim()}`;
  }
  if (!subject) {
    subject = "Modern artificial intelligence and future technology abstract 3D concept";
  }

  // Убираем лишние кавычки и служебные символы
  subject = subject.replace(/["\n\r]/g, " ").trim();

  // Получаем стиль оформления канала
  const selectedTheme = (theme || "cyber").toLowerCase();
  const style = THEME_STYLES[selectedTheme] || THEME_STYLES.cyber;

  // Формируем промпт строго в визуальном стиле канала DUMP
  return `${subject}. Style: modern tech editorial illustration, sleek 3D render in Octane/Cinema4D aesthetic. Color palette: ${style.palette}. Lighting: ${style.lighting}. Materials: ${style.materials}. Composition: wide horizontal banner, 16:9 widescreen aspect ratio, centered visual focal point, ultra-detailed 8k, cinematic depth of field. Strictly no text, no typography, no letters, no words, no watermarks, no collage`;
}

/**
 * Генерирует обложку через Google Gemini Image API (gemini-2.5-flash-image)
 */
async function generateCoverWithGemini({ prompt, title, theme = "cyber", timeoutMs = 25000, apiKey, baseUrl, model }) {
  const finalPrompt = buildCoverPrompt(prompt, title, theme);
  const targetModel = model || "gemini-2.5-flash-image";
  const apiBase = (baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const endpoint = `${apiBase}/models/${targetModel}:generateContent?key=${apiKey}`;

  logger.info(`[ImageGen] Generating AI cover image via Gemini (${targetModel}, theme: ${theme}): "${finalPrompt.slice(0, 100)}..."`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: finalPrompt
              }
            ]
          }
        ]
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Gemini Image API responded with status ${response.status}: ${errText.slice(0, 250)}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find((p) => p.inlineData && p.inlineData.data);

    if (!imagePart) {
      throw new Error("Gemini Image API did not return image inlineData.");
    }

    const mimeType = imagePart.inlineData.mimeType || "image/png";
    const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "png";
    const buffer = Buffer.from(imagePart.inlineData.data, "base64");

    if (buffer.length < 1000) {
      throw new Error("Generated image buffer is too small or invalid.");
    }

    logger.info(`[ImageGen] Successfully generated cover image via Gemini (${(buffer.length / 1024).toFixed(1)} KB, ${mimeType}).`);

    return {
      buffer,
      mimeType,
      fileName: `cover.${ext}`,
      prompt: finalPrompt,
      provider: "gemini",
      theme
    };
  } catch (err) {
    clearTimeout(timeoutId);
    logger.error(`[ImageGen] Gemini image generation failed: ${err.message}`);
    throw err;
  }
}

/**
 * Резервная генерация через нейросеть FLUX (Pollinations AI).
 */
async function generateCoverWithPollinations({ prompt, title, theme = "cyber", timeoutMs = 20000 }) {
  const finalPrompt = buildCoverPrompt(prompt, title, theme);
  const encoded = encodeURIComponent(finalPrompt);
  const seed = Math.floor(Math.random() * 1000000);
  const imageUrl = `${POLLINATIONS_BASE_URL}/${encoded}?width=1280&height=720&model=flux&nologo=true&seed=${seed}`;

  logger.info(`[ImageGen] Generating AI cover image via Pollinations (FLUX, theme: ${theme}): "${finalPrompt.slice(0, 100)}..."`);

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
      throw new Error(`Pollinations API responded with status ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length < 1000) {
      throw new Error("Generated image buffer is too small or invalid.");
    }

    logger.info(`[ImageGen] Successfully generated cover image via Pollinations (${(buffer.length / 1024).toFixed(1)} KB).`);

    return {
      buffer,
      mimeType: "image/jpeg",
      fileName: "cover.jpg",
      prompt: finalPrompt,
      provider: "pollinations",
      theme
    };
  } catch (err) {
    clearTimeout(timeoutId);
    logger.error(`[ImageGen] Pollinations image generation failed: ${err.message}`);
    throw err;
  }
}

/**
 * Генерирует изображение обложки в едином фирменном стиле канала
 * (по умолчанию через Gemini API с палитрой Cyber, с fallback на Pollinations).
 * 
 * @param {object} options
 * @param {string} [options.prompt] - промпт для генерации (на английском)
 * @param {string} [options.title] - заголовок статьи для резервного промпта
 * @param {string} [options.theme] - стиль/тема канала (cyber, solar, emerald, void)
 * @param {number} [options.timeoutMs=25000] - таймаут генерации
 * @param {object} [options.config] - конфигурация бота
 * @returns {Promise<{ buffer: Buffer, mimeType: string, fileName: string, prompt: string, provider: string, theme: string }>}
 */
async function generateCoverImage({ prompt, title, theme: customTheme, timeoutMs = 25000, config: customConfig } = {}) {
  const cfg = customConfig || config;
  const apiKey = cfg?.geminiApiKey || process.env.GEMINI_API_KEY;
  const provider = (cfg?.imageProvider || process.env.IMAGE_PROVIDER || "gemini").toLowerCase();
  const theme = (customTheme || cfg?.imageStylePreset || process.env.IMAGE_STYLE_PRESET || "cyber").toLowerCase();

  if (provider === "gemini" && apiKey) {
    try {
      return await generateCoverWithGemini({
        prompt,
        title,
        theme,
        timeoutMs,
        apiKey,
        baseUrl: cfg?.geminiBaseUrl || process.env.GEMINI_BASE_URL,
        model: cfg?.geminiImageModel || process.env.GEMINI_IMAGE_MODEL
      });
    } catch (err) {
      logger.warn(`[ImageGen] Gemini image generation failed (${err.message}). Falling back to Pollinations...`);
      return await generateCoverWithPollinations({ prompt, title, theme, timeoutMs: Math.min(timeoutMs, 20000) });
    }
  }

  return await generateCoverWithPollinations({ prompt, title, theme, timeoutMs });
}

module.exports = {
  generateCoverImage,
  generateCoverWithGemini,
  generateCoverWithPollinations,
  buildCoverPrompt,
  THEME_STYLES,
  POLLINATIONS_BASE_URL
};
