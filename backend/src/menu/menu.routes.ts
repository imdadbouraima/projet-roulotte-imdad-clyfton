import { Router } from "express";
import { menuController } from "./menu.controller.js";

const router = Router();

router.get("/categories", menuController.getCategories);
router.get("/allergens", menuController.getAllergens);
router.get("/dishes", menuController.getDishes);
router.get("/dishes/:id", menuController.getDishById);

export default router;