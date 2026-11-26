
import { z } from "zod";

// Vérifie les réglages du fichier .env avant de démarrer le serveur.
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL est obligatoire"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET doit contenir au moins 16 caractères"),

  JWT_EXPIRES_IN: z.string().default("2h"),

  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
});

const result = envSchema.safeParse(process.env);

// Mieux vaut arrêter le démarrage que lancer l'API avec une configuration incomplète.
if (!result.success) {
  console.error("Erreur dans la configuration :", result.error.flatten().fieldErrors);
  throw new Error("Configuration invalide. Vérifie le fichier .env.");
}

export const config = result.data;
