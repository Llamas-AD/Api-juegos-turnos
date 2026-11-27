import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const classEnum = pgEnum("character_class", ["guerrero", "mago", "arquero"]);
export const gameStatusEnum = pgEnum("game_status", [
  "pendiente",
  "en_curso",
  "finalizada",
  "cancelada",
]);
export const actionEnum = pgEnum("game_action", ["attack", "defend", "special", "heal"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const characters = pgTable("characters", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  characterClass: classEnum("class").notNull(),
  level: integer("level").notNull().default(1),
  health: integer("health").notNull(), // vida máxima
  attack: integer("attack").notNull(),
  defense: integer("defense").notNull(),
  speed: integer("speed").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  status: gameStatusEnum("status").notNull().default("pendiente"),
  creatorId: integer("creator_id")
    .notNull()
    .references(() => users.id),
  opponentId: integer("opponent_id").references(() => users.id),
  creatorCharacterId: integer("creator_character_id").references(() => characters.id, {
    onDelete: "set null",
  }),
  opponentCharacterId: integer("opponent_character_id").references(() => characters.id, {
    onDelete: "set null",
  }),
  // Estado de combate (la vida actual vive en la partida, el personaje no se modifica)
  creatorHp: integer("creator_hp").notNull(),
  opponentHp: integer("opponent_hp").notNull().default(0),
  creatorDefending: boolean("creator_defending").notNull().default(false),
  opponentDefending: boolean("opponent_defending").notNull().default(false),
  creatorSpecialCd: integer("creator_special_cd").notNull().default(0),
  opponentSpecialCd: integer("opponent_special_cd").notNull().default(0),
  currentTurnUserId: integer("current_turn_user_id").references(() => users.id),
  turnNumber: integer("turn_number").notNull().default(1),
  winnerId: integer("winner_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const gameActions = pgTable("game_actions", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  turnNumber: integer("turn_number").notNull(),
  action: actionEnum("action").notNull(),
  value: integer("value").notNull().default(0), // daño causado o vida recuperada
  description: text("description").notNull(),
  actorHpAfter: integer("actor_hp_after").notNull(),
  rivalHpAfter: integer("rival_hp_after").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Character = typeof characters.$inferSelect;
export type Game = typeof games.$inferSelect;
export type GameActionRow = typeof gameActions.$inferSelect;
