import { Router } from "express";
import { z } from "zod";
import { categoryRepository } from "./category.repository.js";
import { allergenRepository } from "./allergen.repository.js";
import { dishRepository } from "./dish.repository.js";

const router = Router();

// Ces routes publiques fournissent les catégories et les allergènes de la carte.
router.get("/categories", async (_req, res) => {
  const categories = await categoryRepository.findAll();
  res.json(categories);
});

router.get("/allergens", async (_req, res) => {
  const allergens = await allergenRepository.findAll();
  res.json(allergens.sort((a, b) => a.code.localeCompare(b.code)));
});

// La liste des plats accepte des filtres et renvoie une page de résultats.
router.get("/dishes", async (req, res) => {
  const querySchema = z.strictObject({
    category: z.coerce.number().int().positive().optional(),
    available: z.enum(["true", "false"]).optional(),
    allergenFree: z.string().optional(),
    q: z.string().max(50).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  });

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
    items: result.dishes.map(toDishDto),
    total: result.total,
    page: filters.page,
    pageSize: filters.pageSize,
  });
});

// Le détail d'un plat se charge par son identifiant numérique.
router.get("/dishes/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Identifiant invalide" },
    });
  }

  const dish = await dishRepository.findById(id);

  if (!dish) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Plat introuvable" },
    });
  }

  res.json(toDishDto(dish));
});

// Ne renvoie au front que les informations prévues pour un plat.
function toDishDto(dish: any) {
  return {
    id: dish.id,
    name: dish.name,
    description: dish.description,
    priceCents: dish.priceCents,
    available: dish.available,
    category: { id: dish.category.id, name: dish.category.name },
    allergens: dish.allergens.map((allergen: any) => ({
      code: allergen.code,
      label: allergen.label,
    })),
  };
}

export default router;