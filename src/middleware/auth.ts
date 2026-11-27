import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { HttpError } from "../errors.js";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export function signToken(userId: number): string {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: "7d" });
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(401, "Falta el token (Authorization: Bearer <token>)");
  }
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
    req.userId = Number(payload.sub);
    next();
  } catch {
    throw new HttpError(401, "Token inválido o expirado");
  }
};

export const getUserId = (req: Request): number => req.userId as number;
