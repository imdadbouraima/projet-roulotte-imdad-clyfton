import { prisma } from "../db.js";

export interface AllergenRepository {
  findAll(): Promise<Array<{ id: number; code: string; label: string }>>;
  findByCodes(codes: string[]): Promise<Array<{ code: string }>>;
}

export const allergenRepository: AllergenRepository = {
  async findAll() {
    return prisma.allergen.findMany({
      orderBy: {
        code: "asc",
      },
    });
  },

  async findByCodes(codes: string[]) {
    return prisma.allergen.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });
  },
};


