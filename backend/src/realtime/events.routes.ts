import { Router, type RequestHandler } from "express";
import { auth } from "../container.js";
import { currentUser } from "../fourni/auth/index.js";
import { subscribeToOrderEvents } from "./event-bus.js";

const router = Router();

const openOrderEventStream: RequestHandler = (req, res) => {
  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(": connecté\n\n");

  const unsubscribe = subscribeToOrderEvents(currentUser(req), res);
  const ping = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) res.write(": ping\n\n");
  }, 25_000);
  ping.unref();

  // Le navigateur peut fermer la page à tout moment : ne gardons pas sa connexion en mémoire.
  res.on("close", () => {
    clearInterval(ping);
    unsubscribe();
  });
};

router.get("/events", auth.requireAuth, openOrderEventStream);

export default router;
