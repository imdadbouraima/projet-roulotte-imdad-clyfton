import express from "express";
import { config } from "./config.js";
import { installSecurity, authErrorHandler } from "./fourni/auth/index.js";
import { auth } from "./container.js";
import menuRouter from "./menu/menu.routes.js";

export function createApp() {
  const app = express();

  installSecurity(app, {
    corsOrigin: config.CORS_ORIGIN,
  });
  app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});


  app.use("/auth", auth.router);
  app.use("/", menuRouter);
  

  app.use(authErrorHandler);

  return app;
}