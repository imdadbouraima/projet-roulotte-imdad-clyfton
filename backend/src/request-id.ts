import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { logger } from "./logging.js";

// Un identifiant par requête aide à retrouver une erreur dans les logs, même si deux requêtes se croisent.
export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => {
    logger.info(
      { requestId, method: req.method, path: req.path, statusCode: res.statusCode },
      "HTTP request completed",
    );
  });
  next();
};
