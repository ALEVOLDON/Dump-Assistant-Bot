const express = require("express");
const cors = require("cors");
const path = require("path");
const { logger } = require("./logger");
const createApiRouter = require("../routes/api");

function startServer({ config, state, posts, bot }) {
  const app = express();

  if (process.env.NODE_ENV !== "production") {
    app.use(cors());
  }
  app.use(express.json());

  // Логирование всех запросов для отладки
  app.use((req, res, next) => {
    logger.info(`[Web] ${req.method} ${req.url}`);
    next();
  });

  // Раздача скомпилированного фронтенда из website/dist
  const distPath = path.join(process.cwd(), "website", "dist");
  app.use(express.static(distPath));

  // Маршрут для Web App
  app.get("/app", (req, res) => {
    res.sendFile(path.join(distPath, "app.html"));
  });

  // Health-check для сервера
  app.get("/api/health", (req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  // Настройка API маршрутов
  const apiRouter = createApiRouter({ config, state, posts, bot });
  app.use("/api", apiRouter);

  // Возвращаем index.html (лендинг) на все остальные неопознанные GET-запросы
  app.use((req, res, next) => {
    if (req.method === "GET") {
      return res.sendFile(path.join(distPath, "index.html"));
    }
    next();
  });

  const server = app.listen(config.port, () => {
    logger.info(`✓ Web server started on port ${config.port}`);
  });

  return server;
}

module.exports = { startServer };
