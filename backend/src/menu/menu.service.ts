import { AuthHttpError } from "../fourni/auth/errors.js";
import type { CategoryRepository } from "./category.repository.js";
import type { AllergenRepository } from "./allergen.repository.js";
import type { DishFilters, DishPatchData, DishRepository, DishWriteData } from "./dish.repository.js";
import { dishImageStorage, type DishImageStorage } from "./dish-image.storage.js";
import { logger } from "../logging.js";

function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

export interface MenuServiceApi {
  getCategories(): ReturnType<CategoryRepository["findAll"]>;
  getAllergens(): ReturnType<AllergenRepository["findAll"]>;
  getDishes(filters: DishFilters): ReturnType<DishRepository["findAll"]>;
  getDishById(id: number): ReturnType<DishRepository["findById"]>;
  createDish(data: DishWriteData): ReturnType<DishRepository["create"]>;
  updateDish(id: number, data: DishPatchData): ReturnType<DishRepository["update"]>;
  uploadDishImage(id: number, buffer: Buffer): ReturnType<DishRepository["updateImage"]>;
  deleteDish(id: number): Promise<void>;
}

export type MenuServiceDependencies = {
  categories: CategoryRepository;
  allergens: AllergenRepository;
  dishes: DishRepository;
  imageStorage?: DishImageStorage;
};

export class MenuService implements MenuServiceApi {
  constructor(
    private readonly dependencies: MenuServiceDependencies,
  ) {}

  async getCategories() {
    return this.dependencies.categories.findAll();
  }

  async getAllergens() {
    return this.dependencies.allergens.findAll();
  }

  async getDishes(filters: DishFilters) {
    return this.dependencies.dishes.findAll(filters);
  }

  async getDishById(id: number) {
    return this.dependencies.dishes.findById(id);
  }

  private async validateReferences(data: Pick<DishPatchData, "categoryId" | "allergens">) {
    if (data.categoryId !== undefined && !(await this.dependencies.categories.findById(data.categoryId))) {
      throw new AuthHttpError(422, "INVALID_REFERENCE", "Catégorie inconnue");
    }

    if (data.allergens !== undefined) {
      const found = new Set((await this.dependencies.allergens.findByCodes(data.allergens)).map(({ code }) => code));
      const unknown = [...new Set(data.allergens.filter((code) => !found.has(code)))];
      if (unknown.length) {
        throw new AuthHttpError(422, "INVALID_REFERENCE", "Code allergène inconnu", unknown);
      }
    }
  }

  async createDish(data: DishWriteData) {
    await this.validateReferences(data);
    try {
      return await this.dependencies.dishes.create(data);
    } catch (error) {
      if (prismaErrorCode(error) === "P2002") {
        throw new AuthHttpError(409, "CONFLICT", "Un plat porte déjà ce nom");
      }
      if (prismaErrorCode(error) === "P2025") {
        throw new AuthHttpError(422, "INVALID_REFERENCE", "Catégorie ou allergène inconnu");
      }
      throw error;
    }
  }

  async updateDish(id: number, data: DishPatchData) {
    if (!(await this.dependencies.dishes.findById(id))) {
      throw new AuthHttpError(404, "NOT_FOUND", "Plat introuvable");
    }
    await this.validateReferences(data);
    try {
      return await this.dependencies.dishes.update(id, data);
    } catch (error) {
      const code = prismaErrorCode(error);
      if (code === "P2002") {
        throw new AuthHttpError(409, "CONFLICT", "Un plat porte déjà ce nom");
      }
      if (code === "P2025") {
        throw new AuthHttpError(422, "INVALID_REFERENCE", "Catégorie ou allergène inconnu");
      }
      throw error;
    }
  }

  async uploadDishImage(id: number, buffer: Buffer) {
    const storage = this.dependencies.imageStorage ?? dishImageStorage;
    const format = storage.detectFormat(buffer);
    if (!format) {
      throw new AuthHttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Format accepté : PNG, JPEG ou WebP");
    }

    const currentDish = await this.dependencies.dishes.findById(id);
    if (!currentDish) {
      throw new AuthHttpError(404, "NOT_FOUND", "Plat introuvable");
    }

    const imageUrl = await storage.save(buffer, format);
    let updatedDish;
    try {
      updatedDish = await this.dependencies.dishes.updateImage(id, imageUrl);
    } catch (error) {
      try {
        await storage.remove(imageUrl);
      } catch (cleanupError) {
        logger.error(
          {
            errorName: cleanupError instanceof Error ? cleanupError.name : "UnknownError",
          },
          "Temporary dish image cleanup failed",
        );
      }
      if (prismaErrorCode(error) === "P2025") {
        throw new AuthHttpError(404, "NOT_FOUND", "Plat introuvable");
      }
      throw error;
    }

    // On garde l'ancienne photo jusqu'à ce que la nouvelle adresse soit bien enregistrée.
    await storage.remove(currentDish.imageUrl);
    return updatedDish;
  }

  async deleteDish(id: number) {
    if (!(await this.dependencies.dishes.findById(id))) {
      throw new AuthHttpError(404, "NOT_FOUND", "Plat introuvable");
    }
    try {
      await this.dependencies.dishes.delete(id);
    } catch (error) {
      const code = prismaErrorCode(error);
      if (code === "P2003") {
        throw new AuthHttpError(409, "CONFLICT", "Un plat déjà commandé ne peut pas être supprimé");
      }
      if (code === "P2025") {
        throw new AuthHttpError(404, "NOT_FOUND", "Plat introuvable");
      }
      throw error;
    }
  }
}