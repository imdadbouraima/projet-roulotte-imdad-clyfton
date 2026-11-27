import { prisma } from "../db.js";

export type DishFilters = {
  category?: number;
  available?: boolean;
  allergenFree?: string[];
  q?: string;
  page: number;
  pageSize: number;
};

export const dishRepository = {
  async findAll(filters: DishFilters) {
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