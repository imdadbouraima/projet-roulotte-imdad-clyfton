import { Router } from "express";
import { z } from "zod";
import { categoryRepository } from "./category.repository.js";
import { allergenRepository } from "./allergen.repository.js";
import { dishRepository } from "./dish.repository.js";

const router = Router();

router.get("/categories", async (_req, res) => {
  const categories = await categoryRepository.findAll();
  res.json(categories);
});

router.get("/allergens", async (_req, res) => {
  const allergens = await allergenRepository.findAll();
  res.json(allergens);
});

router.get("/dishes", async (req, res) => {
  const querySchema = z.object({
    category: z.string().optional(),
    available: z.enum(["true", "false"]).optional(),
    allergenFree: z.string().optional(),
    q: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
  });

  const parsed = querySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      details: parsed.error.issues,
    });
  }

  const filters = parsed.data;

  const result = await dishRepository.findAll({
    ...filters,
    available:
      filters.available === undefined
        ? undefined
        : filters.available === "true",
    allergenFree: filters.allergenFree
      ? filters.allergenFree.split(",").map((code) => code.trim())
      : [],
  });

  res.json({
  items: result.dishes,
  total: result.total,
  page: filters.page,
  pageSize: filters.pageSize,
});
});

router.get("/dishes/:id", async (req, res) => {
  const id = Number(req.params.id);

if (!Number.isInteger(id) || id <= 0) {
  return res.status(400).json({
    error: "INVALID_ID",
    message: "Identifiant invalide",
  });
}

const dish = await dishRepository.findById(id);

  if (!dish) {
    return res.status(404).json({ error: "DISH_NOT_FOUND" });
  }

  res.json(dish);
});

export default router;