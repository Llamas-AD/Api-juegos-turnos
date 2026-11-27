import { Router } from "express";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { characters, gameActions, games, users, type Game } from "../db/schema.js";
import { HttpError, parseBody, parseId } from "../errors.js";
import { getUserId, requireAuth } from "../middleware/auth.js";
import { forfeitGame, performAction } from "../services/combat.service.js";

const router = Router();
router.use(requireAuth);

async function getOwnCharacter(id: number, userId: number) {
  const [c] = await db.select().from(characters).where(eq(characters.id, id));
  if (!c) throw new HttpError(404, "Personaje no encontrado");
  if (c.userId !== userId) throw new HttpError(403, "Este personaje no es tuyo");
  return c;
}

async function gameView(game: Game) {
  const ids = [game.creatorCharacterId, game.opponentCharacterId].filter(
    (x): x is number => x !== null,
  );
  const chars = ids.length
    ? await db.select().from(characters).where(inArray(characters.id, ids))
    : [];
  return {
    ...game,
    creatorCharacter: chars.find((c) => c.id === game.creatorCharacterId) ?? null,
    opponentCharacter: chars.find((c) => c.id === game.opponentCharacterId) ?? null,
  };
}

const idSchema = z.number().int().positive();
const statusSchema = z.enum(["pendiente", "en_curso", "finalizada", "cancelada"]);

// POST /api/games  → crea una partida (pendiente). opponentId opcional = invitar a un jugador.
router.post("/", async (req, res) => {
  const userId = getUserId(req);
  const { characterId, opponentId } = parseBody(
    z.object({ characterId: idSchema, opponentId: idSchema.optional() }),
    req.body,
  );
  if (opponentId === userId) throw new HttpError(400, "No puedes invitarte a ti mismo");

  const character = await getOwnCharacter(characterId, userId);

  if (opponentId) {
    const [opp] = await db.select({ id: users.id }).from(users).where(eq(users.id, opponentId));
    if (!opp) throw new HttpError(404, "El oponente invitado no existe");
  }

  const [game] = await db
    .insert(games)
    .values({
      creatorId: userId,
      opponentId: opponentId ?? null,
      creatorCharacterId: character.id,
      creatorHp: character.health,
    })
    .returning();
  res.status(201).json(game);
});

// GET /api/games?status=pendiente  → mis partidas + partidas abiertas para unirse
router.get("/", async (req, res) => {
  const userId = getUserId(req);
  const status =
    typeof req.query.status === "string" ? parseBody(statusSchema, req.query.status) : undefined;

  const mine = or(eq(games.creatorId, userId), eq(games.opponentId, userId));
  const open = and(eq(games.status, "pendiente"), isNull(games.opponentId));
  const visible = or(mine, open);

  res.json(
    await db
      .select()
      .from(games)
      .where(status ? and(visible, eq(games.status, status)) : visible)
      .orderBy(games.id),
  );
});

// GET /api/games/:id
router.get("/:id", async (req, res) => {
  const [game] = await db.select().from(games).where(eq(games.id, parseId(req.params.id)));
  if (!game) throw new HttpError(404, "Partida no encontrada");
  res.json(await gameView(game));
});

// POST /api/games/:id/join
router.post("/:id/join", async (req, res) => {
  const userId = getUserId(req);
  const id = parseId(req.params.id);
  const { characterId } = parseBody(z.object({ characterId: idSchema }), req.body);
  const character = await getOwnCharacter(characterId, userId);

  const updated = await db.transaction(async (tx) => {
    const [game] = await tx.select().from(games).where(eq(games.id, id)).for("update");
    if (!game) throw new HttpError(404, "Partida no encontrada");
    if (game.status !== "pendiente") throw new HttpError(409, `La partida está ${game.status}`);
    if (game.creatorId === userId) throw new HttpError(400, "No puedes unirte a tu propia partida");
    if (game.opponentId && game.opponentId !== userId) {
      throw new HttpError(403, "Esta partida es una invitación para otro jugador");
    }

    const [creatorChar] = game.creatorCharacterId
      ? await tx.select().from(characters).where(eq(characters.id, game.creatorCharacterId))
      : [];
    if (!creatorChar) throw new HttpError(409, "El personaje del creador ya no existe");

    // Empieza el personaje con mayor velocidad (empate: el creador)
    const firstTurn = creatorChar.speed >= character.speed ? game.creatorId : userId;

    const [g] = await tx
      .update(games)
      .set({
        opponentId: userId,
        opponentCharacterId: character.id,
        opponentHp: character.health,
        status: "en_curso",
        currentTurnUserId: firstTurn,
        updatedAt: new Date(),
      })
      .where(eq(games.id, id))
      .returning();
    return g;
  });

  res.json(await gameView(updated));
});

// POST /api/games/:id/actions   body: { "action": "attack" | "defend" | "special" | "heal" }
router.post("/:id/actions", async (req, res) => {
  const { action } = parseBody(
    z.object({ action: z.enum(["attack", "defend", "special", "heal"]) }),
    req.body,
  );
  res.json(await performAction(parseId(req.params.id), getUserId(req), action));
});

// GET /api/games/:id/history
router.get("/:id/history", async (req, res) => {
  const id = parseId(req.params.id);
  const [game] = await db.select({ id: games.id }).from(games).where(eq(games.id, id));
  if (!game) throw new HttpError(404, "Partida no encontrada");
  res.json(await db.select().from(gameActions).where(eq(gameActions.gameId, id)).orderBy(gameActions.id));
});

// POST /api/games/:id/cancel  → cancela una partida pendiente (solo el creador)
router.post("/:id/cancel", async (req, res) => {
  const id = parseId(req.params.id);
  const [game] = await db.select().from(games).where(eq(games.id, id));
  if (!game) throw new HttpError(404, "Partida no encontrada");
  if (game.creatorId !== getUserId(req)) throw new HttpError(403, "Solo el creador puede cancelarla");
  if (game.status !== "pendiente") {
    throw new HttpError(409, "Solo se pueden cancelar partidas pendientes (usa /finish si ya está en curso)");
  }
  const [updated] = await db
    .update(games)
    .set({ status: "cancelada", updatedAt: new Date() })
    .where(eq(games.id, id))
    .returning();
  res.json(updated);
});

// POST /api/games/:id/finish  → termina una partida en curso (rendirse: gana el rival)
router.post("/:id/finish", async (req, res) => {
  res.json(await forfeitGame(parseId(req.params.id), getUserId(req)));
});

export default router;
