
import { prisma } from "../db.js";

export const allergenRepository = {
  async findAll() {
    return prisma.allergen.findMany({
      orderBy: {
  code: "asc",
},
    });
  },

  async findById(id: number) {
    return prisma.allergen.findUnique({
      where: { id },
    });
  },
};
