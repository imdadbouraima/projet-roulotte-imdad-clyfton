import express from "express";
import { config } from "./config.js";
import { installSecurity, authErrorHandler } from "./fourni/auth/index.js";
import { auth } from "./container.js";
import menuRouter from "./menu/menu.routes.js";

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
  app.use("/", menuRouter);

  // Transforme les erreurs d'authentification en réponses HTTP lisibles.
  app.use(authErrorHandler);

  return app;
}