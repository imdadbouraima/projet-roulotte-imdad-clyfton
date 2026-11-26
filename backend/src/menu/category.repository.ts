
import { prisma } from "../db.js";

// Petites lectures des catégories utilisées par la carte.
export const categoryRepository = {
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
