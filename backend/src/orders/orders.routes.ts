import { Router } from "express";
import { auth } from "../container.js";
import { createOrder, getOrder, listOrders } from "./order.controller.js";

const router = Router();

router.post("/orders", auth.requireAuth, createOrder);
router.get("/orders", auth.requireAuth, listOrders);
router.get("/orders/:id", auth.requireAuth, getOrder);

export default router;
