
import { prisma } from "../db.js";

// Accès aux allergènes enregistrés dans la base.
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
