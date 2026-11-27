import { describe, expect, it, vi } from "vitest";
import type { DishRecord, DishRepository } from "./dish.repository.js";
import { createCachedDishRepository } from "./cached-dish.repository.js";

const dish: DishRecord = {
  id: 1,
  name: "Le Classique",
  description: "",
  priceCents: 1150,
  available: true,
  stock: null,
  imageUrl: null,
  categoryId: 1,
  createdAt: new Date("2026-12-01T11:42:00.000Z"),
  updatedAt: new Date("2026-12-01T11:42:00.000Z"),
  category: { id: 1, name: "Burgers", position: 1 },
  allergens: [],
};

function repositoryStub(): DishRepository {
  const unused = async (): Promise<never> => {
    throw new Error("Cette méthode ne doit pas être appelée dans ce test");
  };
  return {
    findAll: vi.fn(async () => ({ dishes: [dish], total: 1 })),
    findById: async () => dish,
    create: unused,
    update: async () => dish,
    updateImage: unused,
    delete: async () => {},
  };
}

describe("Cache de la carte", () => {
  it("réutilise une lecture puis invalide les résultats après une modification", async () => {
    const repository = repositoryStub();
    const cached = createCachedDishRepository(repository);
    const filters = { page: 1, pageSize: 20 };

    await cached.findAll(filters);
    await cached.findAll(filters);
    expect(repository.findAll).toHaveBeenCalledTimes(1);

    await cached.update(1, { name: "Nouveau nom" });
    await cached.findAll(filters);
    expect(repository.findAll).toHaveBeenCalledTimes(2);
  });
});
