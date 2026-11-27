import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

// Un identifiant par requête aide à retrouver une erreur dans les logs, même si deux requêtes se croisent.
export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => {
    console.info(`[${requestId}] ${req.method} ${req.path} ${res.statusCode}`);
  });
  next();
};
