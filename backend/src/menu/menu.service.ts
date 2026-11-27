import { categoryRepository } from "./category.repository.js";
import { allergenRepository } from "./allergen.repository.js";
import { dishRepository, type DishFilters } from "./dish.repository.js";

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
};