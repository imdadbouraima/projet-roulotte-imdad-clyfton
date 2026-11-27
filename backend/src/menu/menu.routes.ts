import { Router } from "express";
import { auth } from "../container.js";
import { menuController } from "./menu.controller.js";

const router = Router();

router.get("/categories", menuController.getCategories);
router.get("/allergens", menuController.getAllergens);
router.get("/dishes", menuController.getDishes);
router.get("/dishes/:id", menuController.getDishById);
router.post("/dishes", auth.requireAuth, auth.requireRole("ADMIN"), menuController.createDish);
router.patch("/dishes/:id", auth.requireAuth, auth.requireRole("ADMIN"), menuController.updateDish);
router.delete("/dishes/:id", auth.requireAuth, auth.requireRole("ADMIN"), menuController.deleteDish);

export default router;