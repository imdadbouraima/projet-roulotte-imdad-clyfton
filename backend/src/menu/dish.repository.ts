import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";

export type DishFilters = {
  category?: number;
  available?: boolean;
  allergenFree?: string[];
  q?: string;
  page: number;
  pageSize: number;
};

export type DishWriteData = {
  name: string;
  description: string;
  priceCents: number;
  categoryId: number;
  allergens: string[];
  available: boolean;
  stock: number | null;
};

export type DishPatchData = Partial<DishWriteData>;

const dishDetails = {
  category: true,
  allergens: true,
} as const;

export type DishRecord = Prisma.DishGetPayload<{ include: typeof dishDetails }>;

export interface DishRepository {
  findAll(filters: DishFilters): Promise<{ dishes: DishRecord[]; total: number }>;
  findById(id: number): Promise<DishRecord | null>;
  create(data: DishWriteData): Promise<DishRecord>;
  update(id: number, data: DishPatchData): Promise<DishRecord>;
  updateImage(id: number, imageUrl: string): Promise<DishRecord>;
  delete(id: number): Promise<void>;
}

export const dishRepository: DishRepository = {
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
        include: dishDetails,
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
      include: dishDetails,
    });
  },

  async create(data: DishWriteData) {
    return prisma.dish.create({
      data: {
        name: data.name,
        description: data.description,
        priceCents: data.priceCents,
        available: data.available,
        stock: data.stock,
        category: { connect: { id: data.categoryId } },
        allergens: { connect: data.allergens.map((code) => ({ code })) },
      },
      include: dishDetails,
    });
  },

  async update(id: number, data: DishPatchData) {
    const { categoryId, allergens, ...fields } = data;
    return prisma.dish.update({
      where: { id },
      data: {
        ...fields,
        ...(categoryId !== undefined ? { category: { connect: { id: categoryId } } } : {}),
        ...(allergens !== undefined
          ? { allergens: { set: allergens.map((code) => ({ code })) } }
          : {}),
      },
      include: dishDetails,
    });
  },

  async updateImage(id: number, imageUrl: string) {
    return prisma.dish.update({
      where: { id },
      data: { imageUrl },
      include: dishDetails,
    });
  },

  async delete(id: number) {
    await prisma.dish.delete({ where: { id } });
  },
};