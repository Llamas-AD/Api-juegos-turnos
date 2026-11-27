import { Router } from "express";
import bcrypt from "bcryptjs";
import { and, eq, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { HttpError, parseBody, parseId } from "../errors.js";
import { getUserId, requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const publicFields = {
  id: users.id,
  username: users.username,
  wins: users.wins,
  losses: users.losses,
  createdAt: users.createdAt,
};

// GET /api/players
router.get("/", async (_req, res) => {
  res.json(await db.select(publicFields).from(users).orderBy(users.id));
});

// GET /api/players/:id/statistics
router.get("/:id/statistics", async (req, res) => {
  const id = parseId(req.params.id);
  const [u] = await db.select(publicFields).from(users).where(eq(users.id, id));
  if (!u) throw new HttpError(404, "Jugador no encontrado");

  const total = u.wins + u.losses;
  res.json({
    playerId: u.id,
    username: u.username,
    wins: u.wins,
    losses: u.losses,
    totalGames: total,
    winRate: total === 0 ? 0 : Math.round((u.wins / total) * 100),
  });
});

// GET /api/players/:id  (el correo solo se muestra al propio jugador)
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const [u] = await db
    .select({ ...publicFields, email: users.email })
    .from(users)
    .where(eq(users.id, id));
  if (!u) throw new HttpError(404, "Jugador no encontrado");
  if (u.id !== getUserId(req)) {
    const { email: _email, ...pub } = u;
    res.json(pub);
    return;
  }
  res.json(u);
});

const updateSchema = z
  .object({
    username: z.string().trim().min(3).max(30).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    password: z.string().min(6).max(100).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Envía al menos un campo a actualizar" });

// PUT /api/players/:id  (actualizar perfil, solo el propio)
router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id !== getUserId(req)) throw new HttpError(403, "Solo puedes editar tu propio perfil");
  const data = parseBody(updateSchema, req.body);

  const conflicts = [];
  if (data.username) conflicts.push(eq(users.username, data.username));
  if (data.email) conflicts.push(eq(users.email, data.email));
  if (conflicts.length) {
    const [dup] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(ne(users.id, id), or(...conflicts)));
    if (dup) throw new HttpError(409, "El usuario o el correo ya están en uso");
  }

  const [updated] = await db
    .update(users)
    .set({
      ...(data.username && { username: data.username }),
      ...(data.email && { email: data.email }),
      ...(data.password && { passwordHash: await bcrypt.hash(data.password, 10) }),
    })
    .where(eq(users.id, id))
    .returning({ id: users.id, username: users.username, email: users.email });

  res.json(updated);
});

export default router;
