CREATE TYPE "public"."game_action" AS ENUM('attack', 'defend', 'special', 'heal');--> statement-breakpoint
CREATE TYPE "public"."character_class" AS ENUM('guerrero', 'mago', 'arquero');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('pendiente', 'en_curso', 'finalizada', 'cancelada');--> statement-breakpoint
CREATE TABLE "characters" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"class" character_class NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"health" integer NOT NULL,
	"attack" integer NOT NULL,
	"defense" integer NOT NULL,
	"speed" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"turn_number" integer NOT NULL,
	"action" "game_action" NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"actor_hp_after" integer NOT NULL,
	"rival_hp_after" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" "game_status" DEFAULT 'pendiente' NOT NULL,
	"creator_id" integer NOT NULL,
	"opponent_id" integer,
	"creator_character_id" integer,
	"opponent_character_id" integer,
	"creator_hp" integer NOT NULL,
	"opponent_hp" integer DEFAULT 0 NOT NULL,
	"creator_defending" boolean DEFAULT false NOT NULL,
	"opponent_defending" boolean DEFAULT false NOT NULL,
	"creator_special_cd" integer DEFAULT 0 NOT NULL,
	"opponent_special_cd" integer DEFAULT 0 NOT NULL,
	"current_turn_user_id" integer,
	"turn_number" integer DEFAULT 1 NOT NULL,
	"winner_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_actions" ADD CONSTRAINT "game_actions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_actions" ADD CONSTRAINT "game_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_opponent_id_users_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_creator_character_id_characters_id_fk" FOREIGN KEY ("creator_character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_opponent_character_id_characters_id_fk" FOREIGN KEY ("opponent_character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_current_turn_user_id_users_id_fk" FOREIGN KEY ("current_turn_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;