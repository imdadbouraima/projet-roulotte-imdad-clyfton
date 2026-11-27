import { prisma } from "../db.js";

export interface CategoryRepository {
  findAll(): Promise<Array<{ id: number; name: string; position: number }>>;
  findById(id: number): Promise<{ id: number; name: string; position: number } | null>;
}

export const categoryRepository: CategoryRepository = {
  async findAll() {
    return prisma.category.findMany({
      orderBy: {
        position: "asc",
      },
    });
  },

  async findById(id: number) {
    return prisma.category.findUnique({
      where: { id },
    });
  },
};