import { Router } from "express";
import type { Auth } from "../fourni/auth/index.js";
import { createOrderController } from "./order.controller.js";
import type { OrderServiceApi } from "./order.service.js";

export function createOrdersRouter(auth: Auth, orderService: OrderServiceApi) {
  const router = Router();
  const controller = createOrderController(orderService);

  // Toutes les routes de commande demandent d'abord une connexion valide.
  router.post("/orders", auth.requireAuth, controller.createOrder);
  router.get("/orders", auth.requireAuth, controller.listOrders);
  router.get("/orders/:id", auth.requireAuth, controller.getOrder);
  router.patch("/orders/:id/status", auth.requireAuth, controller.updateOrderStatus);
  router.post("/orders/:id/payment", auth.requireAuth, controller.payOrder);

  return router;
}
