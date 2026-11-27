import express from "express";
import { config } from "./config.js";
import { installSecurity, authErrorHandler } from "./fourni/auth/index.js";
import { createContainer, type AppContainer } from "./container.js";
import { uploadsDirectory } from "./menu/dish-image.storage.js";
import { createMenuRouter } from "./menu/menu.routes.js";
import { createOrdersRouter } from "./orders/orders.routes.js";
import { createEventsRouter } from "./realtime/events.routes.js";
import { requestIdMiddleware } from "./request-id.js";
import { createHealthController } from "./health/health.controller.js";
import { logger } from "./logging.js";

// Assemble l'API : protections, routes, puis gestion des erreurs.
export function createApp(container: AppContainer = createContainer()) {
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

  app.get("/health", createHealthController(container.healthRepository));

  // Monte les routes d'authentification et du menu.
  app.use("/auth", container.auth.router);
  app.use("/", createOrdersRouter(container.auth, container.orderService));
  app.use("/", createMenuRouter(container.auth, container.menuService));
  app.use("/", createEventsRouter(container.auth, container.orderEventBus));

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
    logger.error(
      {
        requestId: res.getHeader("X-Request-Id"),
        errorName: err instanceof Error ? err.name : "UnknownError",
      },
      "Unhandled API error",
    );
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" },
    });
  });

  return app;
}