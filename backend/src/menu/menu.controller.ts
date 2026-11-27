import type { Request, Response } from "express";
import { z } from "zod";
import { menuService } from "./menu.service.js";

const querySchema = z.strictObject({
  category: z.coerce.number().int().positive().optional(),
  available: z.enum(["true", "false"]).optional(),
  allergenFree: z.string().optional(),
  q: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

function toDishDto(dish: any) {
  return {
    id: dish.id,
    name: dish.name,
    description: dish.description,
    priceCents: dish.priceCents,
    available: dish.available,
    category: {
      id: dish.category.id,
      name: dish.category.name,
    },
    allergens: dish.allergens.map((allergen: any) => ({
      code: allergen.code,
      label: allergen.label,
    })),
  };
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
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Identifiant invalide",
        },
      });
    }

    const dish = await menuService.getDishById(id);

    if (!dish) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Plat introuvable",
        },
      });
    }

    return res.json(toDishDto(dish));
  },
};