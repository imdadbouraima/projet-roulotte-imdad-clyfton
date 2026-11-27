import type { Request, Response } from "express";
import { z } from "zod";
import { AuthHttpError } from "../fourni/auth/errors.js";
import { toDishDto } from "./dish.dto.js";
import { menuService } from "./menu.service.js";

const dishFields = {
  name: z.string().min(2).max(80),
  description: z.string().max(300),
  priceCents: z.number().int().min(50).max(10000),
  categoryId: z.number().int(),
  allergens: z.array(z.string()),
  available: z.boolean(),
  stock: z.number().int().min(0).nullable(),
};

const createDishSchema = z.strictObject({
  ...dishFields,
  description: dishFields.description.default(""),
  allergens: dishFields.allergens.default([]),
  available: dishFields.available.default(true),
  stock: dishFields.stock.default(null),
});

const updateDishSchema = z.strictObject({
  name: dishFields.name.optional(),
  description: dishFields.description.optional(),
  priceCents: dishFields.priceCents.optional(),
  categoryId: dishFields.categoryId.optional(),
  allergens: dishFields.allergens.optional(),
  available: dishFields.available.optional(),
  stock: dishFields.stock.optional(),
}).refine((data) => Object.keys(data).length > 0, "Au moins un champ doit être fourni");

const querySchema = z.strictObject({
  category: z.coerce.number().int().positive().optional(),
  available: z.enum(["true", "false"]).optional(),
  allergenFree: z.string().optional(),
  q: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

function parseDishId(rawId: unknown): number {
  if (typeof rawId !== "string") {
    throw new AuthHttpError(400, "VALIDATION_ERROR", "Identifiant invalide");
  }
  const parsed = z.coerce.number().int().positive().safeParse(rawId);
  if (!parsed.success) throw new AuthHttpError(400, "VALIDATION_ERROR", "Identifiant invalide");
  return parsed.data;
}

export const menuController = {
  async getCategories(_req: Request, res: Response) {
    const categories = await menuService.getCategories();
    res.json(categories);
  },

  async getAllergens(_req: Request, res: Response) {
    const allergens = await menuService.getAllergens();
    res.json(allergens);
  },

  async getDishes(req: Request, res: Response) {
    const parsed = querySchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Parametres de requete invalides",
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    }

    const filters = parsed.data;

    const result = await menuService.getDishes({
      ...filters,
      available:
        filters.available === undefined
          ? undefined
          : filters.available === "true",
      allergenFree: filters.allergenFree
        ? filters.allergenFree.split(",").map((code) => code.trim())
        : [],
    });

    return res.json({
      items: result.dishes.map(toDishDto),
      total: result.total,
      page: filters.page,
      pageSize: filters.pageSize,
    });
  },

  async getDishById(req: Request, res: Response) {
    const dish = await menuService.getDishById(parseDishId(req.params.id));

    if (!dish) {
      throw new AuthHttpError(404, "NOT_FOUND", "Plat introuvable");
    }

    return res.json(toDishDto(dish));
  },

  async createDish(req: Request, res: Response) {
    const parsed = createDishSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AuthHttpError(
        400,
        "VALIDATION_ERROR",
        "Données invalides",
        parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      );
    }

    const dish = await menuService.createDish(parsed.data);
    return res.status(201).location(`/dishes/${dish.id}`).json(toDishDto(dish));
  },

  async updateDish(req: Request, res: Response) {
    const parsed = updateDishSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AuthHttpError(
        400,
        "VALIDATION_ERROR",
        "Données invalides",
        parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      );
    }

    const dish = await menuService.updateDish(parseDishId(req.params.id), parsed.data);
    return res.json(toDishDto(dish));
  },

  async deleteDish(req: Request, res: Response) {
    await menuService.deleteDish(parseDishId(req.params.id));
    return res.status(204).send();
  },

  async uploadDishImage(req: Request, res: Response) {
    const id = parseDishId(req.params.id);
    const file = req.file;
    if (!file) {
      throw new AuthHttpError(400, "VALIDATION_ERROR", "Le fichier image est requis");
    }

    const updatedDish = await menuService.uploadDishImage(id, file.buffer);
    return res.json(toDishDto(updatedDish));
  },
};