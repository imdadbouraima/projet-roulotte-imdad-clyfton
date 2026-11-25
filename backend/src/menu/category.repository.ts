import { prisma } from "../db.js";

export const categoryRepository = {
  async findAll() {
    return prisma.category.findMany({
      orderBy: {
        position: "asc",
      },
    });
  },

  async findById(id: string) {
    return prisma.category.findUnique({
      where: { id },
    });
  },
};