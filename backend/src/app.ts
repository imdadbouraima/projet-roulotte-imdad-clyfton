import express from "express";
import { config } from "./config.js";
import { installSecurity, authErrorHandler } from "./fourni/auth/index.js";
import { auth } from "./container.js";
import { prisma } from "./db.js";
import { uploadsDirectory } from "./menu/dish-image.storage.js";
import menuRouter from "./menu/menu.routes.js";
import ordersRouter from "./orders/orders.routes.js";
import eventsRouter from "./realtime/events.routes.js";
import { requestIdMiddleware } from "./request-id.js";

// Assemble l'API : protections, routes, puis gestion des erreurs.
export function createApp() {
  const app = express();

  app.use(requestIdMiddleware);

  // Active les protections générales et autorise uniquement l'origine configurée.
  installSecurity(app, {
    corsOrigin: config.CORS_ORIGIN,
  });

  app.use(
    "/uploads",
    (_req, res, next) => {
      // Les photos sont chargées depuis le site, qui n'est pas sur la même origine que l'API.
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(uploadsDirectory, { immutable: true, maxAge: "1y" }),
  );

  // L'API peut répondre même si la base est coupée, mais le statut doit alors le signaler.
  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return res.json({ status: "ok", database: "up" });
    } catch (error) {
      const requestId = res.getHeader("X-Request-Id");
      console.error(`[${requestId}] Vérification de la base de données échouée`, error);
      return res.status(503).json({ status: "degraded", database: "down" });
    }
  });

  // Monte les routes d'authentification et du menu.
  app.use("/auth", auth.router);
  app.use("/", ordersRouter);
  app.use("/", menuRouter);
  app.use("/", eventsRouter);

  // Transforme les erreurs d'authentification en réponses HTTP lisibles.
  app.use(authErrorHandler);

  // Une route inconnue renvoie une erreur claire au lieu d'une page HTML.
  app.use((_req, res) => {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Route introuvable" },
    });
  });

  // Dernier filet de sécurité : les erreurs inattendues restent au format JSON.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(`[${res.getHeader("X-Request-Id")}] Erreur inattendue`, err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" },
    });
  });

  return app;
}