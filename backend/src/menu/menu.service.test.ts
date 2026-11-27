import { describe, expect, it, vi } from "vitest";
import type { AllergenRepository } from "./allergen.repository.js";
import type { CategoryRepository } from "./category.repository.js";
import type { DishRecord, DishRepository } from "./dish.repository.js";
import { MenuService } from "./menu.service.js";
import type { DishImageStorage } from "./dish-image.storage.js";

const dish: DishRecord = {
  id: 1,
  name: "Le Classique",
  description: "",
  priceCents: 1150,
  available: true,
  stock: null,
  imageUrl: "/uploads/dishes/ancienne.webp",
  categoryId: 1,
  createdAt: new Date("2026-12-01T11:42:00.000Z"),
  updatedAt: new Date("2026-12-01T11:42:00.000Z"),
  category: { id: 1, name: "Burgers", position: 1 },
  allergens: [],
};

const categories: CategoryRepository = {
  findAll: async () => [],
  findById: async () => null,
};

const allergens: AllergenRepository = {
  findAll: async () => [],
  findByCodes: async () => [],
};

function dishRepository(overrides: Partial<DishRepository> = {}): DishRepository {
  const unused = async (): Promise<never> => {
    throw new Error("Cette méthode ne doit pas être appelée dans ce test");
  };
  return {
    findAll: async () => ({ dishes: [], total: 0 }),
    findById: async () => dish,
    create: unused,
    update: unused,
    updateImage: async (_id, imageUrl) => ({ ...dish, imageUrl }),
    delete: async () => {},
    ...overrides,
  };
}

describe("MenuService.uploadDishImage", () => {
  it("remplace l'image après persistance et supprime l'ancienne", async () => {
    const updateImage = vi.fn(async (_id: number, imageUrl: string) => ({ ...dish, imageUrl }));
    const repository = dishRepository({ updateImage });
    const storage: DishImageStorage = {
      detectFormat: vi.fn(() => ({ extension: "png" as const })),
      save: vi.fn(async () => "/uploads/dishes/nouvelle.png"),
      remove: vi.fn(async () => {}),
    };
    const service = new MenuService({ categories, allergens, dishes: repository, imageStorage: storage });

    const updated = await service.uploadDishImage(1, Buffer.from("image"));

    expect(updated.imageUrl).toBe("/uploads/dishes/nouvelle.png");
    expect(updateImage).toHaveBeenCalledWith(1, "/uploads/dishes/nouvelle.png");
    expect(storage.remove).toHaveBeenCalledWith("/uploads/dishes/ancienne.webp");
  });

  it("nettoie le nouveau fichier si l'enregistrement échoue", async () => {
    const storage: DishImageStorage = {
      detectFormat: () => ({ extension: "png" }),
      save: async () => "/uploads/dishes/nouvelle.png",
      remove: vi.fn(async () => {}),
    };
    const service = new MenuService({
      categories,
      allergens,
      dishes: dishRepository({
        updateImage: async () => {
          throw new Error("database failure");
        },
      }),
      imageStorage: storage,
    });

    await expect(service.uploadDishImage(1, Buffer.from("image"))).rejects.toThrow("database failure");
    expect(storage.remove).toHaveBeenCalledWith("/uploads/dishes/nouvelle.png");
  });
});
