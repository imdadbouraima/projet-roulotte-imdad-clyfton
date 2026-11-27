import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { auth } from "../container.js";
import { AuthHttpError } from "../fourni/auth/errors.js";
import { menuController } from "./menu.controller.js";

const router = Router();
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Le middleware d'upload traduit ses erreurs dans le même format que le reste de l'API.
function parseDishImage(req: Request, res: Response, next: NextFunction) {
  imageUpload.single("image")(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      next(new AuthHttpError(413, "PAYLOAD_TOO_LARGE", "L'image ne peut pas dépasser 2 Mo"));
    } else if (error instanceof multer.MulterError) {
      next(new AuthHttpError(400, "VALIDATION_ERROR", "Formulaire d'image invalide"));
    } else {
      next(error);
    }
  });
}

router.get("/categories", menuController.getCategories);
router.get("/allergens", menuController.getAllergens);
router.get("/dishes", menuController.getDishes);
router.get("/dishes/:id", menuController.getDishById);
router.post("/dishes", auth.requireAuth, auth.requireRole("ADMIN"), menuController.createDish);
router.patch("/dishes/:id", auth.requireAuth, auth.requireRole("ADMIN"), menuController.updateDish);
router.delete("/dishes/:id", auth.requireAuth, auth.requireRole("ADMIN"), menuController.deleteDish);
router.put(
  "/dishes/:id/image",
  auth.requireAuth,
  auth.requireRole("ADMIN"),
  parseDishImage,
  menuController.uploadDishImage,
);

export default router;