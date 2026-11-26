import express from "express";
import { config } from "./config.js";
import { installSecurity, authErrorHandler } from "./fourni/auth/index.js";
import { auth } from "./container.js";
import menuRouter from "./menu/menu.routes.js";
import ordersRouter from "./orders/orders.routes.js";

// Assemble l'API : protections, routes, puis gestion des erreurs.
export function createApp() {
  const app = express();

  // Active les protections générales et autorise uniquement l'origine configurée.
  installSecurity(app, {
    corsOrigin: config.CORS_ORIGIN,
  });

  // Permet de vérifier facilement que le serveur fonctionne.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Monte les routes d'authentification et du menu.
  app.use("/auth", auth.router);
  app.use("/", ordersRouter);
  app.use("/", menuRouter);

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
    console.error(err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" },
    });
  });

  return app;
}