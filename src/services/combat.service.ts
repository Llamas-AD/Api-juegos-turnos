import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { characters, gameActions, games, users } from "../db/schema.js";
import { HttpError } from "../errors.js";

export type ActionType = "attack" | "defend" | "special" | "heal";

const SPECIAL_COOLDOWN = 2; // turnos propios de espera antes de volver a usarla
const HEAL_PERCENT = 0.25; // % de la vida máxima que recupera "curar"

type Fighter = { health: number; attack: number; defense: number; characterClass: string };

function calcDamage(rawAttack: number, rivalDefense: number, rivalDefending: boolean): number {
  let dmg = Math.max(1, Math.round(rawAttack * 2 - rivalDefense));
  if (rivalDefending) dmg = Math.max(1, Math.floor(dmg / 2)); // defender reduce el daño a la mitad
  return dmg;
}

function specialAttack(me: Fighter, rival: Fighter, rivalDefending: boolean) {
  switch (me.characterClass) {
    case "guerrero": // Golpe devastador: ignora el 50% de la defensa
      return {
        dmg: calcDamage(me.attack * 1.3, rival.defense * 0.5, rivalDefending),
        text: "Golpe devastador (ignora parte de la defensa)",
      };
    case "mago": // Bola de fuego: gran daño mágico
      return {
        dmg: calcDamage(me.attack * 1.8, rival.defense, rivalDefending),
        text: "Bola de fuego",
      };
    default: // arquero: Lluvia de flechas, dos impactos
      return {
        dmg: 2 * calcDamage(me.attack * 0.8, rival.defense, rivalDefending),
        text: "Lluvia de flechas (doble impacto)",
      };
  }
}

export async function performAction(gameId: number, userId: number, action: ActionType) {
  return db.transaction(async (tx) => {
    // Bloquea la fila para evitar dos acciones simultáneas en el mismo turno
    const [game] = await tx.select().from(games).where(eq(games.id, gameId)).for("update");
    if (!game) throw new HttpError(404, "Partida no encontrada");
    if (game.status !== "en_curso") {
      throw new HttpError(409, `No se puede actuar: la partida está ${game.status}`);
    }

    const isCreator = game.creatorId === userId;
    if (!isCreator && game.opponentId !== userId) {
      throw new HttpError(403, "No participas en esta partida");
    }
    if (game.currentTurnUserId !== userId) throw new HttpError(403, "No es tu turno");

    const rivalId = isCreator ? game.opponentId! : game.creatorId;
    const myCharId = isCreator ? game.creatorCharacterId : game.opponentCharacterId;
    const rivalCharId = isCreator ? game.opponentCharacterId : game.creatorCharacterId;
    if (!myCharId || !rivalCharId) throw new HttpError(409, "Falta un personaje en la partida");

    const [me] = await tx.select().from(characters).where(eq(characters.id, myCharId));
    const [rival] = await tx.select().from(characters).where(eq(characters.id, rivalCharId));
    if (!me || !rival) throw new HttpError(409, "Un personaje de la partida ya no existe");

    let myHp = isCreator ? game.creatorHp : game.opponentHp;
    let rivalHp = isCreator ? game.opponentHp : game.creatorHp;
    const rivalDefending = isCreator ? game.opponentDefending : game.creatorDefending;
    let myCd = isCreator ? game.creatorSpecialCd : game.opponentSpecialCd;

    if (myHp <= 0) throw new HttpError(400, "Tu personaje está derrotado y no puede actuar");

    let value = 0;
    let description = "";

    switch (action) {
      case "attack": {
        value = calcDamage(me.attack, rival.defense, rivalDefending);
        rivalHp = Math.max(0, rivalHp - value);
        description = `Ataca y causa ${value} de daño${rivalDefending ? " (el rival se defendía)" : ""}`;
        break;
      }
      case "special": {
        if (myCd > 0) {
          throw new HttpError(400, `Habilidad especial en enfriamiento: faltan ${myCd} turno(s)`);
        }
        const s = specialAttack(me, rival, rivalDefending);
        value = s.dmg;
        rivalHp = Math.max(0, rivalHp - value);
        description = `${s.text}: ${value} de daño`;
        break;
      }
      case "heal": {
        const healed = Math.min(me.health - myHp, Math.floor(me.health * HEAL_PERCENT));
        value = healed;
        myHp = Math.min(me.health, myHp + healed); // nunca supera el máximo
        description = `Se cura ${healed} de vida`;
        break;
      }
      case "defend": {
        description = "Se pone en guardia: reducirá a la mitad el próximo daño";
        break;
      }
    }

    myCd = action === "special" ? SPECIAL_COOLDOWN : Math.max(0, myCd - 1);
    const finished = rivalHp <= 0;

    const patch = isCreator
      ? {
          creatorHp: myHp,
          opponentHp: rivalHp,
          creatorDefending: action === "defend",
          opponentDefending: false,
          creatorSpecialCd: myCd,
        }
      : {
          opponentHp: myHp,
          creatorHp: rivalHp,
          opponentDefending: action === "defend",
          creatorDefending: false,
          opponentSpecialCd: myCd,
        };

    const [updated] = await tx
      .update(games)
      .set({
        ...patch,
        turnNumber: game.turnNumber + 1,
        currentTurnUserId: finished ? null : rivalId,
        status: finished ? "finalizada" : "en_curso",
        winnerId: finished ? userId : null,
        updatedAt: new Date(),
      })
      .where(eq(games.id, gameId))
      .returning();

    const [record] = await tx
      .insert(gameActions)
      .values({
        gameId,
        userId,
        turnNumber: game.turnNumber,
        action,
        value,
        description,
        actorHpAfter: myHp,
        rivalHpAfter: rivalHp,
      })
      .returning();

    if (finished) {
      await tx.update(users).set({ wins: sql`${users.wins} + 1` }).where(eq(users.id, userId));
      await tx.update(users).set({ losses: sql`${users.losses} + 1` }).where(eq(users.id, rivalId));
    }

    return { game: updated, action: record, winnerId: finished ? userId : null };
  });
}

// Rendirse / finalizar una partida en curso: gana el rival
export async function forfeitGame(gameId: number, userId: number) {
  return db.transaction(async (tx) => {
    const [game] = await tx.select().from(games).where(eq(games.id, gameId)).for("update");
    if (!game) throw new HttpError(404, "Partida no encontrada");
    if (game.status !== "en_curso") {
      throw new HttpError(409, `Solo se puede finalizar una partida en curso (estado: ${game.status})`);
    }
    const isCreator = game.creatorId === userId;
    if (!isCreator && game.opponentId !== userId) {
      throw new HttpError(403, "No participas en esta partida");
    }
    const winnerId = isCreator ? game.opponentId! : game.creatorId;

    const [updated] = await tx
      .update(games)
      .set({ status: "finalizada", winnerId, currentTurnUserId: null, updatedAt: new Date() })
      .where(eq(games.id, gameId))
      .returning();

    await tx.update(users).set({ wins: sql`${users.wins} + 1` }).where(eq(users.id, winnerId));
    await tx.update(users).set({ losses: sql`${users.losses} + 1` }).where(eq(users.id, userId));
    return updated;
  });
}
