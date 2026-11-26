
import { prisma } from "../db.js";

type DishFilters = {
  category?: number;
  available?: boolean;
  allergenFree?: string[];
  q?: string;
  page: number;
  pageSize: number;
};

// Regroupe les recherches de plats pour garder les requêtes Prisma hors des routes.
export const dishRepository = {
  async findAll(filters: DishFilters) {
    // On ajoute uniquement les filtres choisis par la personne qui consulte la carte.
    const where = {
      ...(filters.category && {
        categoryId: filters.category,
      }),

      ...(filters.available !== undefined && {
        available: filters.available,
      }),

      ...(filters.allergenFree?.length && {
        allergens: {
          none: {
            code: { in: filters.allergenFree },
          },
        },
      }),

      ...(filters.q && {
        name: {
          contains: filters.q,
        },
      }),
    };

    // Les plats et le nombre total sont chargés ensemble pour afficher la pagination.
    const [dishes, total] = await Promise.all([
      prisma.dish.findMany({
        where,
        include: {
          category: true,
          allergens: true,
        },
        orderBy: [
          { category: { position: "asc" } },
          { name: "asc" },
        ],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),

      prisma.dish.count({ where }),
    ]);

    return { dishes, total };
  },

  async findById(id: number) {
    return prisma.dish.findUnique({
      where: { id },
      include: {
        category: true,
        allergens: true,
      },
    });
  },
};
