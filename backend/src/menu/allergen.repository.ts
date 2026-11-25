import { prisma } from "../db.js";

export const allergenRepository = {
  async findAll() {
    return prisma.allergen.findMany({
      orderBy: {
        label: "asc",
      },
    });
  },

  async findById(id: string) {
    return prisma.allergen.findUnique({
      where: { id },
    });
  },
};