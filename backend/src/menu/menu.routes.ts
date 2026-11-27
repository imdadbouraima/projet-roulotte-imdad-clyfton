import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import type { Auth } from "../fourni/auth/index.js";
import { AuthHttpError } from "../fourni/auth/errors.js";
import { createMenuController } from "./menu.controller.js";
import type { MenuServiceApi } from "./menu.service.js";

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

export function createMenuRouter(auth: Auth, menuService: MenuServiceApi) {
  const router = Router();
  const controller = createMenuController(menuService);

  router.get("/categories", controller.getCategories);
  router.get("/allergens", controller.getAllergens);
  router.get("/dishes", controller.getDishes);
  router.get("/dishes/:id", controller.getDishById);
  router.post("/dishes", auth.requireAuth, auth.requireRole("ADMIN"), controller.createDish);
  router.patch("/dishes/:id", auth.requireAuth, auth.requireRole("ADMIN"), controller.updateDish);
  router.delete("/dishes/:id", auth.requireAuth, auth.requireRole("ADMIN"), controller.deleteDish);
  router.put(
    "/dishes/:id/image",
    auth.requireAuth,
    auth.requireRole("ADMIN"),
    parseDishImage,
    controller.uploadDishImage,
  );

  return router;
}