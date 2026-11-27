import { Router } from "express";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { characters, games } from "../db/schema.js";
import { HttpError, parseBody, parseId } from "../errors.js";
import { getUserId, requireAuth } from "../middleware/auth.js";
import { statsFor } from "../services/character.service.js";

const router = Router();
router.use(requireAuth);

const classSchema = z.enum(["guerrero", "mago", "arquero"]);

const createSchema = z.object({
  name: z.string().trim().min(2).max(30),
  characterClass: classSchema,
});

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(30).optional(),
    characterClass: classSchema.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Envía al menos un campo a actualizar" });

async function getOwnCharacter(id: number, userId: number) {
  const [c] = await db.select().from(characters).where(eq(characters.id, id));
  if (!c) throw new HttpError(404, "Personaje no encontrado");
  if (c.userId !== userId) throw new HttpError(403, "Este personaje no es tuyo");
  return c;
}

// Un personaje no se puede modificar ni borrar mientras esté en una partida pendiente o en curso
async function assertNotInActiveGame(characterId: number) {
  const [busy] = await db
    .select({ id: games.id })
    .from(games)
    .where(
      and(
        inArray(games.status, ["pendiente", "en_curso"]),
        or(eq(games.creatorCharacterId, characterId), eq(games.opponentCharacterId, characterId)),
      ),
    )
    .limit(1);
  if (busy) throw new HttpError(409, "El personaje está en una partida activa");
}

// GET /api/characters  (los del jugador autenticado)
router.get("/", async (req, res) => {
  res.json(
    await db
      .select()
      .from(characters)
      .where(eq(characters.userId, getUserId(req)))
      .orderBy(characters.id),
  );
});

// POST /api/characters
router.post("/", async (req, res) => {
  const { name, characterClass } = parseBody(createSchema, req.body);
  const [created] = await db
    .insert(characters)
    .values({ userId: getUserId(req), name, characterClass, level: 1, ...statsFor(characterClass, 1) })
    .returning();
  res.status(201).json(created);
});

// PUT /api/characters/:id
router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const data = parseBody(updateSchema, req.body);
  const current = await getOwnCharacter(id, getUserId(req));
  await assertNotInActiveGame(id);

  const newClass = data.characterClass ?? current.characterClass;
  const [updated] = await db
    .update(characters)
    .set({
      ...(data.name && { name: data.name }),
      ...(data.characterClass && { characterClass: newClass, ...statsFor(newClass, current.level) }),
    })
    .where(eq(characters.id, id))
    .returning();
  res.json(updated);
});

// DELETE /api/characters/:id
router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  await getOwnCharacter(id, getUserId(req));
  await assertNotInActiveGame(id);
  await db.delete(characters).where(eq(characters.id, id));
  res.status(204).send();
});

export default router;
