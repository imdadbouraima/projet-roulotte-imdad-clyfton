import { categoryRepository } from "./category.repository.js";
import { allergenRepository } from "./allergen.repository.js";
import { AuthHttpError } from "../fourni/auth/errors.js";
import { dishRepository, type DishFilters, type DishPatchData, type DishWriteData } from "./dish.repository.js";

function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

async function validateReferences(data: Pick<DishPatchData, "categoryId" | "allergens">) {
  if (data.categoryId !== undefined && !(await categoryRepository.findById(data.categoryId))) {
    throw new AuthHttpError(422, "INVALID_REFERENCE", "Catégorie inconnue");
  }

  if (data.allergens !== undefined) {
    const found = new Set((await allergenRepository.findByCodes(data.allergens)).map(({ code }) => code));
    const unknown = [...new Set(data.allergens.filter((code) => !found.has(code)))];
    if (unknown.length) {
      throw new AuthHttpError(422, "INVALID_REFERENCE", "Code allergène inconnu", unknown);
    }
  }
}

export const menuService = {
  async getCategories() {
    return categoryRepository.findAll();
  },

  async getAllergens() {
    return allergenRepository.findAll();
  },

  async getDishes(filters: DishFilters) {
    return dishRepository.findAll(filters);
  },

  async getDishById(id: number) {
    return dishRepository.findById(id);
  },

  async createDish(data: DishWriteData) {
    await validateReferences(data);
    try {
      return await dishRepository.create(data);
    } catch (error) {
      if (prismaErrorCode(error) === "P2002") {
        throw new AuthHttpError(409, "CONFLICT", "Un plat porte déjà ce nom");
      }
      if (prismaErrorCode(error) === "P2025") {
        throw new AuthHttpError(422, "INVALID_REFERENCE", "Catégorie ou allergène inconnu");
      }
      throw error;
    }
  },

  async updateDish(id: number, data: DishPatchData) {
    if (!(await dishRepository.findById(id))) {
      throw new AuthHttpError(404, "NOT_FOUND", "Plat introuvable");
    }
    await validateReferences(data);
    try {
      return await dishRepository.update(id, data);
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
  },

  async deleteDish(id: number) {
    if (!(await dishRepository.findById(id))) {
      throw new AuthHttpError(404, "NOT_FOUND", "Plat introuvable");
    }
    try {
      await dishRepository.delete(id);
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
  },
};