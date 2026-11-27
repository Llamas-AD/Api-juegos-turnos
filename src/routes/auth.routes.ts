import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { HttpError, parseBody } from "../errors.js";
import { signToken } from "../middleware/auth.js";

const router = Router();

const registerSchema = z.object({
  username: z.string().trim().min(3).max(30),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

// POST /api/register
router.post("/register", async (req, res) => {
  const { username, email, password } = parseBody(registerSchema, req.body);

  const [exists] = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.email, email), eq(users.username, username)));
  if (exists) throw new HttpError(409, "El usuario o el correo ya están registrados");

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(users)
    .values({ username, email, passwordHash })
    .returning({ id: users.id, username: users.username, email: users.email });

  res.status(201).json({ user, token: signToken(user.id) });
});

// POST /api/login
router.post("/login", async (req, res) => {
  const { email, password } = parseBody(loginSchema, req.body);

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, "Credenciales incorrectas");
  }

  res.json({
    user: { id: user.id, username: user.username, email: user.email },
    token: signToken(user.id),
  });
});

export default router;
