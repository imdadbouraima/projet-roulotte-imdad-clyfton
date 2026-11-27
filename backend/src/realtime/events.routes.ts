import { Router, type RequestHandler } from "express";
import type { Auth } from "../fourni/auth/auth.js";
import { currentUser } from "../fourni/auth/index.js";
import { toOrderDto } from "../orders/order.dto.js";
import type { OrderEventBus } from "./event-bus.js";

export function createEventsRouter(auth: Auth, eventBus: OrderEventBus) {
  const router = Router();

  const openOrderEventStream: RequestHandler = (req, res) => {
    const user = currentUser(req);
    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write(": connecté\n\n");

    const unsubscribe = eventBus.subscribe(({ type, order }) => {
      const isStaff = user.role === "STAFF" || user.role === "ADMIN";
      if (type === "order.created" && !isStaff) return;
      if (type === "order.updated" && !isStaff && user.id !== order.user.id) return;
      if (res.destroyed || res.writableEnded) return;
      res.write(`event: ${type}\ndata: ${JSON.stringify(toOrderDto(order))}\n\n`);
    });

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
  return router;
}
