import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? "",
};

if (!config.jwtSecret) {
  throw new Error("Falta JWT_SECRET en el archivo .env");
}
