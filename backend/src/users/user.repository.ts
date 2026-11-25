import type { AuthUserStore, StoredUser } from "../fourni/auth/index.js";
import { prisma } from "../db.js";

export const userRepository: AuthUserStore = {
  async findByEmail(email: string): Promise<StoredUser | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  },

  async findById(id: number): Promise<StoredUser | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  },

  async create(data): Promise<StoredUser> {
    return prisma.user.create({
      data,
    });
  },
};