import type { RequestHandler } from "express";
import type { HealthRepository } from "./health.repository.js";
import { logger } from "../logging.js";

export function createHealthController(repository: HealthRepository): RequestHandler {
  return async (_req, res) => {
    try {
      await repository.checkDatabase();
      return res.json({ status: "ok", database: "up" });
    } catch (error) {
      logger.error(
        { requestId: res.getHeader("X-Request-Id"), errorName: error instanceof Error ? error.name : "UnknownError" },
        "Database health check failed",
      );
      return res.status(503).json({ status: "degraded", database: "down" });
    }
  };
}
