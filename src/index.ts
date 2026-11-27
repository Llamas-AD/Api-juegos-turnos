import express, { type ErrorRequestHandler } from "express";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import authRoutes from "./routes/auth.routes.js";
import playersRoutes from "./routes/players.routes.js";
import charactersRoutes from "./routes/characters.routes.js";
import gamesRoutes from "./routes/games.routes.js";

const app = express();
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", authRoutes); // /api/register, /api/login
app.use("/api/players", playersRoutes);
app.use("/api/characters", charactersRoutes);
app.use("/api/games", gamesRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.details ? { detalles: err.details } : {}) });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "JSON mal formado" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
};
app.use(errorHandler);

app.listen(config.port, () => console.log(`Servidor en http://localhost:${config.port}`));
