import { prisma } from "../db.js";

export interface HealthRepository {
  checkDatabase(): Promise<void>;
}

export const healthRepository: HealthRepository = {
  async checkDatabase() {
    await prisma.$queryRaw`SELECT 1`;
  },
};
